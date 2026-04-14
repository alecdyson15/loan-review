/**
 * netlify/functions/submit.js
 */

const { createClient } = require('@supabase/supabase-js');
const Busboy           = require('busboy');

const BUCKET        = 'loan-estimates';
const ALLOWED_EXTS  = ['pdf', 'jpg', 'jpeg', 'png'];
const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
const MAX_BYTES     = 10 * 1024 * 1024;

function getSupabase() {
  const url    = process.env.SUPABASE_URL;
  const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !svcKey) throw new Error('Missing Supabase env vars');
  return createClient(url, svcKey);
}

function parseForm(event) {
  return new Promise((resolve, reject) => {
    const contentType = event.headers['content-type'] || event.headers['Content-Type'] || '';
    const bb = Busboy({ headers: { 'content-type': contentType }, limits: { fileSize: MAX_BYTES + 1024 } });

    const fields = {};
    let fileBuffer   = null;
    let fileName     = null;
    let fileMime     = null;
    let fileTooLarge = false;

    bb.on('field', (name, value) => { fields[name] = value; });

    bb.on('file', (name, stream, info) => {
      fileName = info.filename;
      fileMime = info.mimeType;
      const chunks = [];
      stream.on('data',  chunk => chunks.push(chunk));
      stream.on('limit', ()    => { fileTooLarge = true; stream.resume(); });
      stream.on('end',   ()    => { fileBuffer = fileTooLarge ? null : Buffer.concat(chunks); });
    });

    bb.on('finish', () => {
      if (fileTooLarge) return reject(new Error('FILE_TOO_LARGE'));
      resolve({ fields, fileBuffer, fileName, fileMime });
    });

    bb.on('error', reject);

    const body = event.isBase64Encoded
      ? Buffer.from(event.body, 'base64')
      : Buffer.from(event.body || '', 'utf8');

    bb.write(body);
    bb.end();
  });
}

function uniqueFilePath(originalName, slug) {
  const ext  = originalName.split('.').pop().toLowerCase();
  const ts   = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  return `submissions/${slug}/${ts}-${rand}.${ext}`;
}

// Format phone number to (XXX) XXX-XXXX
function formatPhone(phone) {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) {
    return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits[0] === '1') {
    return `(${digits.slice(1,4)}) ${digits.slice(4,7)}-${digits.slice(7)}`;
  }
  return phone;
}

async function sendBrevoNotification(loEmail, loName, data) {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey || !loEmail) return;

  const { firstName, lastName, email, phone, propertyState, propertyType,
          propertyUsage, creditScore, notes, fileUrl } = data;

  const formattedPhone = formatPhone(phone);

  const html = `
    <div style="font-family:-apple-system,sans-serif;max-width:560px;color:#2b3245;">
      <h2 style="color:#0d2137;margin-bottom:4px;">📋 New Loan Review Submission</h2>
      <p style="color:#9aa3b8;font-size:13px;margin-top:0;">${new Date().toLocaleString()}</p>
      <hr style="border:none;border-top:1px solid #dde1ec;margin:20px 0;" />
      <table style="width:100%;border-collapse:collapse;font-size:15px;">
        <tr><td style="padding:8px 0;color:#9aa3b8;width:38%;">Borrower</td><td style="padding:8px 0;font-weight:600;">${firstName} ${lastName}</td></tr>
        <tr><td style="padding:8px 0;color:#9aa3b8;">Email</td><td style="padding:8px 0;"><a href="mailto:${email}">${email}</a></td></tr>
        <tr><td style="padding:8px 0;color:#9aa3b8;">Phone</td><td style="padding:8px 0;">${formattedPhone}</td></tr>
        <tr><td style="padding:8px 0;color:#9aa3b8;">State</td><td style="padding:8px 0;">${propertyState}</td></tr>
        <tr><td style="padding:8px 0;color:#9aa3b8;">Property Type</td><td style="padding:8px 0;">${propertyType}</td></tr>
        <tr><td style="padding:8px 0;color:#9aa3b8;">Usage</td><td style="padding:8px 0;">${propertyUsage}</td></tr>
        ${creditScore ? `<tr><td style="padding:8px 0;color:#9aa3b8;">Credit Score</td><td style="padding:8px 0;">${creditScore}</td></tr>` : ''}
        ${notes ? `<tr><td style="padding:8px 0;color:#9aa3b8;vertical-align:top;">Notes</td><td style="padding:8px 0;">${notes}</td></tr>` : ''}
      </table>
      ${fileUrl ? `<div style="margin-top:20px;"><a href="${fileUrl}" style="display:inline-block;padding:10px 20px;background:#0d2137;color:white;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">View Loan Estimate →</a></div>` : ''}
      <hr style="border:none;border-top:1px solid #dde1ec;margin:24px 0 12px;" />
      <p style="font-size:12px;color:#9aa3b8;">Sent via Loan Review Platform</p>
    </div>
  `;

  try {
    await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender:      { name: 'Loan Review', email: process.env.BREVO_SENDER_EMAIL },
        to:          [{ email: loEmail, name: loName }],
        subject:     `New Loan Review: ${firstName} ${lastName} (${propertyState})`,
        htmlContent: html
      })
    });
  } catch (err) {
    console.error('Brevo send failed:', err.message);
  }
}

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const headers = { 'Content-Type': 'application/json' };

  let parsed;
  try {
    parsed = await parseForm(event);
  } catch (err) {
    if (err.message === 'FILE_TOO_LARGE') {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'File exceeds 10MB limit.' }) };
    }
    console.error('Parse error:', err);
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Could not read form data.' }) };
  }

  const { fields, fileBuffer, fileName, fileMime } = parsed;
  const { loanOfficerSlug, firstName, lastName, email, phone,
          propertyState, propertyType, propertyUsage, creditScore, notes } = fields;

  if (!loanOfficerSlug || !firstName || !lastName || !email || !phone ||
      !propertyState || !propertyType || !propertyUsage) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing required fields.' }) };
  }
  if (!fileBuffer || !fileName) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Loan Estimate file is required.' }) };
  }

  const ext = fileName.split('.').pop().toLowerCase();
  if (!ALLOWED_EXTS.includes(ext) && !ALLOWED_TYPES.includes(fileMime)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Only PDF, JPG, or PNG files accepted.' }) };
  }

  const sb = getSupabase();

  const { data: loRows, error: loErr } = await sb
    .from('loan_officers')
    .select('id, slug, display_name, first_name, last_name, email, is_active')
    .eq('slug', loanOfficerSlug)
    .eq('is_active', true)
    .limit(1);

  if (loErr) {
    console.error('LO lookup error:', loErr);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server error.' }) };
  }
  if (!loRows || loRows.length === 0) {
    return { statusCode: 404, headers, body: JSON.stringify({ error: 'Loan officer not found.' }) };
  }

  const lo = loRows[0];

  const filePath = uniqueFilePath(fileName, lo.slug);
  const { error: uploadErr } = await sb.storage
    .from(BUCKET)
    .upload(filePath, fileBuffer, {
      contentType:  fileMime || 'application/octet-stream',
      cacheControl: '3600',
      upsert:       false
    });

  if (uploadErr) {
    console.error('Upload error:', uploadErr);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'File upload failed. Please try again.' }) };
  }

  const { data: urlData } = sb.storage.from(BUCKET).getPublicUrl(filePath);
  const fileUrl = urlData?.publicUrl || '';

  const { error: insertErr } = await sb
    .from('second_look_submissions')
    .insert({
      loan_officer_id:     lo.id,
      loan_officer_slug:   lo.slug,
      borrower_first_name: firstName.trim(),
      borrower_last_name:  lastName.trim(),
      borrower_email:      email.trim().toLowerCase(),
      borrower_phone:      phone.trim(),
      property_state:      propertyState,
      property_type:       propertyType,
      property_usage:      propertyUsage,
      credit_score:        creditScore ? parseInt(creditScore) : null,
      notes:               notes?.trim() || null,
      file_path:           filePath,
      file_url:            fileUrl
    });

  if (insertErr) {
    console.error('Insert error:', insertErr);
    await sb.storage.from(BUCKET).remove([filePath]);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Could not save submission. Please try again.' }) };
  }

  await sendBrevoNotification(
    lo.email,
    lo.display_name || `${lo.first_name} ${lo.last_name}`,
    { firstName, lastName, email, phone, propertyState, propertyType,
      propertyUsage, creditScore, notes, fileUrl }
  );

  return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
};
