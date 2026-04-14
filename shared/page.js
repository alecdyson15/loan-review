/**
 * shared/page.js
 * Handles slug reading, LO data fetch, page render, validation, and form submit.
 */

const SUPABASE_URL      = window.__env?.SUPABASE_URL      || '';
const SUPABASE_ANON_KEY = window.__env?.SUPABASE_ANON_KEY || '';

function getSlugFromPath() {
  const parts = window.location.pathname.replace(/\/$/, '').split('/');
  return parts[parts.length - 1].toLowerCase();
}

async function fetchLoanOfficer(slug) {
  const url = `${SUPABASE_URL}/rest/v1/loan_officers?slug=eq.${encodeURIComponent(slug)}&is_active=eq.true&limit=1`;
  const res = await fetch(url, {
    headers: {
      'apikey':        SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type':  'application/json'
    }
  });
  if (!res.ok) throw new Error(`Supabase fetch failed: ${res.status}`);
  const data = await res.json();
  return data[0] || null;
}

function renderAdvisor(lo) {
  const photo    = document.getElementById('advisorPhoto');
  const initials = document.getElementById('advisorInitials');

  if (lo.headshot_url && photo) {
    photo.src            = lo.headshot_url;
    photo.alt            = lo.display_name;
    photo.style.display  = 'block';
    if (initials) initials.style.display = 'none';
  } else if (initials) {
    const parts = (lo.display_name || '').split(' ');
    initials.textContent   = parts.map(p => p[0]).slice(0, 2).join('').toUpperCase();
    initials.style.display = 'flex';
    if (photo) photo.style.display = 'none';
  }

  const name = lo.display_name || `${lo.first_name} ${lo.last_name}`;
  setText('advisorName',  name);
  setText('advisorTitle', lo.title || 'Mortgage Loan Advisor');
  setText('advisorNmls',  lo.nmls ? `NMLS#${lo.nmls}` : '');

  const contactEl = document.getElementById('advisorContact');
  if (contactEl) {
    const links = [];
    if (lo.phone) links.push(`<a href="tel:${lo.phone.replace(/\D/g,'')}">${lo.phone}</a>`);
    if (lo.email) links.push(`<a href="mailto:${lo.email}">${lo.email}</a>`);
    contactEl.innerHTML = links.join('');
  }

  setValue('loanOfficerSlug', lo.slug);
  setValue('loanOfficerId',   lo.id);

  document.title = `Second Look — ${name}`;
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}
function setValue(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = val;
}

const ALLOWED_TYPES = ['application/pdf','image/jpeg','image/jpg','image/png'];
const ALLOWED_EXTS  = ['.pdf','.jpg','.jpeg','.png'];
const MAX_BYTES     = 10 * 1024 * 1024;

function setErr(fieldId, errId, msg) {
  const errEl = document.getElementById(errId);
  const input = document.getElementById(fieldId);
  if (errEl)  errEl.textContent = msg;
  if (input)  input.classList.toggle('err-field', !!msg);
}

function validate() {
  let ok = true;
  const checks = [
    { id: 'firstName',     errId: 'firstNameErr',     test: v => !!v.trim(), msg: 'First name is required.' },
    { id: 'lastName',      errId: 'lastNameErr',      test: v => !!v.trim(), msg: 'Last name is required.' },
    { id: 'email',         errId: 'emailErr',         test: v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()), msg: 'Valid email required.' },
    { id: 'phone',         errId: 'phoneErr',         test: v => !!v.trim(), msg: 'Phone is required.' },
    { id: 'propertyState', errId: 'propertyStateErr', test: v => !!v, msg: 'Please select a state.' },
    { id: 'propertyType',  errId: 'propertyTypeErr',  test: v => !!v, msg: 'Please select a property type.' },
    { id: 'propertyUsage', errId: 'propertyUsageErr', test: v => !!v, msg: 'Please select usage.' },
  ];

  checks.forEach(({ id, errId, test, msg }) => {
    const val  = document.getElementById(id)?.value || '';
    const pass = test(val);
    setErr(id, errId, pass ? '' : msg);
    if (!pass) ok = false;
  });

  const fileInput = document.getElementById('leFile');
  const file = fileInput?.files[0];
  if (!file) {
    setErr('leFile', 'leFileErr', 'Please upload your Loan Estimate.');
    ok = false;
  } else {
    const ext = '.' + file.name.split('.').pop().toLowerCase();
    if (!ALLOWED_TYPES.includes(file.type) && !ALLOWED_EXTS.includes(ext)) {
      setErr('leFile', 'leFileErr', 'Only PDF, JPG, or PNG accepted.');
      ok = false;
    } else if (file.size > MAX_BYTES) {
      setErr('leFile', 'leFileErr', 'File exceeds 10MB limit.');
      ok = false;
    } else {
      setErr('leFile', 'leFileErr', '');
    }
  }

  return ok;
}

function setLoading(on) {
  const btn     = document.getElementById('submitBtn');
  const label   = document.getElementById('btnLabel');
  const spinner = document.getElementById('btnSpinner');
  if (btn)     btn.disabled          = on;
  if (label)   label.textContent     = on ? 'Submitting…' : 'Submit';
  if (spinner) spinner.style.display = on ? 'inline-block' : 'none';
}

function showBanner(msg) {
  document.querySelectorAll('.error-banner').forEach(el => el.remove());
  const form   = document.getElementById('submissionForm');
  const banner = document.createElement('div');
  banner.className   = 'error-banner';
  banner.textContent = msg;
  form.insertBefore(banner, form.firstChild);
  banner.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

document.addEventListener('DOMContentLoaded', () => {
  const form         = document.getElementById('submissionForm');
  const successState = document.getElementById('successState');
  const fileInput    = document.getElementById('leFile');
  const fileNameEl   = document.getElementById('fileName');

  // Update filename display
  if (fileInput && fileNameEl) {
    fileInput.addEventListener('change', () => {
      fileNameEl.textContent = fileInput.files[0] ? fileInput.files[0].name : 'No file chosen';
    });
  }

  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    document.querySelectorAll('.error-banner').forEach(el => el.remove());

    if (!validate()) return;

    setLoading(true);

    try {
      const fd = new FormData();
      fd.append('loanOfficerSlug', document.getElementById('loanOfficerSlug')?.value || '');
      fd.append('loanOfficerId',   document.getElementById('loanOfficerId')?.value   || '');
      fd.append('firstName',       document.getElementById('firstName').value.trim());
      fd.append('lastName',        document.getElementById('lastName').value.trim());
      fd.append('email',           document.getElementById('email').value.trim().toLowerCase());
      fd.append('phone',           document.getElementById('phone').value.trim());
      fd.append('propertyState',   document.getElementById('propertyState').value);
      fd.append('propertyType',    document.getElementById('propertyType').value);
      fd.append('propertyUsage',   document.getElementById('propertyUsage').value);
      fd.append('creditScore',     document.getElementById('creditScore')?.value || '');
      fd.append('notes',           document.getElementById('notes')?.value.trim() || '');
      fd.append('leFile',          fileInput.files[0]);

      const res  = await fetch('/.netlify/functions/submit', { method: 'POST', body: fd });
      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        showBanner(json.error || 'Something went wrong. Please try again.');
        setLoading(false);
        return;
      }

      form.style.display = 'none';
      if (successState) successState.style.display = 'block';

    } catch (err) {
      console.error('Submit error:', err);
      showBanner('Network error. Please check your connection and try again.');
      setLoading(false);
    }
  });
});

// Bootstrap
(async function init() {
  const slug     = getSlugFromPath();
  const loading  = document.getElementById('loadingState');
  const content  = document.getElementById('pageContent');
  const notFound = document.getElementById('notFoundState');

  if (!slug || slug === 'loan-review') {
    if (loading)  loading.style.display  = 'none';
    if (notFound) notFound.style.display = 'flex';
    return;
  }

  try {
    const lo = await fetchLoanOfficer(slug);
    if (loading) loading.style.display = 'none';

    if (!lo) {
      if (notFound) notFound.style.display = 'flex';
      return;
    }

    renderAdvisor(lo);
    if (content) content.style.display = 'flex';

  } catch (err) {
    console.error('Init error:', err);
    if (loading)  loading.style.display  = 'none';
    if (notFound) notFound.style.display = 'flex';
  }
})();
