/**
 * shared/page.js
 *
 * Handles:
 *  1. Reading the slug from the URL (/second-look/[slug])
 *  2. Fetching loan officer data from Supabase (anon key, SELECT only)
 *  3. Rendering the page with the LO's info
 *  4. Form validation
 *  5. Submitting via Netlify Function (server-side — keeps service key secret)
 */

const SUPABASE_URL      = window.__env?.SUPABASE_URL      || '';
const SUPABASE_ANON_KEY = window.__env?.SUPABASE_ANON_KEY || '';

// ── Read slug from URL path ───────────────────────────────────────────────────
// e.g. /second-look/alec → "alec"
function getSlugFromPath() {
  const parts = window.location.pathname.replace(/\/$/, '').split('/');
  return parts[parts.length - 1].toLowerCase();
}

// ── Fetch loan officer from Supabase ─────────────────────────────────────────
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

// ── Render the LO profile onto the page ──────────────────────────────────────
function renderAdvisor(lo) {
  const img      = document.getElementById('advisorHeadshot');
  const initials = document.getElementById('advisorInitials');

  if (lo.headshot_url) {
    img.src = lo.headshot_url;
    img.alt = lo.display_name;
    img.style.display      = 'block';
    initials.style.display = 'none';
  } else {
    const parts = (lo.display_name || '').split(' ');
    initials.textContent   = parts.map(p => p[0]).slice(0, 2).join('').toUpperCase();
    initials.style.display = 'flex';
    img.style.display      = 'none';
  }

  document.getElementById('advisorName').textContent  = lo.display_name || `${lo.first_name} ${lo.last_name}`;
  document.getElementById('advisorTitle').textContent = lo.title || 'Mortgage Loan Advisor';
  document.getElementById('advisorNmls').textContent  = lo.nmls ? `NMLS# ${lo.nmls}` : '';

  const contactEl = document.getElementById('advisorContact');
  const links = [];
  if (lo.phone) links.push(`<a href="tel:${lo.phone.replace(/\D/g,'')}">${lo.phone}</a>`);
  if (lo.email) links.push(`<a href="mailto:${lo.email}">${lo.email}</a>`);
  contactEl.innerHTML = links.join('');

  const defaultHeadline = "Already have a loan quote? Let's make sure it's actually your best option.";
  const defaultBody = `<p>Most people focus on rate, but there's a lot more that goes into a loan.</p>
<p>Upload your Loan Estimate below and I'll break it down for you and see if there's a better way to structure it.</p>
<span class="hero-coda">No pressure. Just a second look.</span>`;

  document.getElementById('heroHeadline').textContent = lo.headline   || defaultHeadline;
  document.getElementById('heroBody').innerHTML       = lo.intro_body || defaultBody;

  document.getElementById('loanOfficerSlug').value = lo.slug;
  document.getElementById('loanOfficerId').value   = lo.id;

  document.title = `Second Look — ${lo.display_name || lo.first_name}`;

  const footerParts = [`© ${new Date().getFullYear()} ${lo.display_name || lo.first_name + ' ' + lo.last_name}`];
  if (lo.nmls) footerParts.push(`NMLS# ${lo.nmls}`);
  document.getElementById('footerText').textContent = footerParts.join(' · ');
}

// ── File upload UI ────────────────────────────────────────────────────────────
const uploadZone        = document.getElementById('uploadZone');
const fileInput         = document.getElementById('leFile');
const uploadPreview     = document.getElementById('uploadPreview');
const uploadPlaceholder = document.getElementById('uploadPlaceholder');
const previewName       = document.getElementById('previewName');
const removeFileBtn     = document.getElementById('removeFile');

fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) showPreview(fileInput.files[0].name);
  else clearPreview();
  clearErr('leFileErr');
});
removeFileBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  fileInput.value = '';
  clearPreview();
});
uploadZone.addEventListener('dragover',  () => uploadZone.classList.add('over'));
uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('over'));
uploadZone.addEventListener('drop',      () => uploadZone.classList.remove('over'));

function showPreview(name) {
  uploadPlaceholder.style.display = 'none';
  uploadPreview.style.display     = 'flex';
  previewName.textContent         = name;
}
function clearPreview() {
  uploadPlaceholder.style.display = '';
  uploadPreview.style.display     = 'none';
  previewName.textContent         = '';
}

// ── Validation ────────────────────────────────────────────────────────────────
const ALLOWED_TYPES = ['application/pdf','image/jpeg','image/jpg','image/png'];
const ALLOWED_EXTS  = ['.pdf','.jpg','.jpeg','.png'];
const MAX_BYTES     = 10 * 1024 * 1024;

function setErr(fieldId, errId, msg) {
  const errEl = document.getElementById(errId);
  const input = document.getElementById(fieldId);
  if (errEl)  errEl.textContent = msg;
  if (input)  input.classList.toggle('err-field', !!msg);
}
function clearErr(errId) {
  const el = document.getElementById(errId);
  if (el) el.textContent = '';
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

  const file = fileInput.files[0];
  if (!file) {
    setErr('leFile', 'leFileErr', 'Please upload your Loan Estimate.');
    ok = false;
  } else {
    const ext = '.' + file.name.split('.').pop().toLowerCase();
    if (!ALLOWED_TYPES.includes(file.type) && !ALLOWED_EXTS.includes(ext)) {
      setErr('leFile', 'leFileErr', 'Only PDF, JPG, or PNG files accepted.');
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

// ── Submit ────────────────────────────────────────────────────────────────────
const form         = document.getElementById('submissionForm');
const submitBtn    = document.getElementById('submitBtn');
const btnLabel     = document.getElementById('btnLabel');
const btnSpinner   = document.getElementById('btnSpinner');
const successState = document.getElementById('successState');

function setLoading(on) {
  submitBtn.disabled       = on;
  btnLabel.textContent     = on ? 'Submitting…' : 'Get My Second Look';
  btnSpinner.style.display = on ? 'inline-block' : 'none';
}

function showBanner(msg) {
  document.querySelectorAll('.error-banner').forEach(el => el.remove());
  const banner       = document.createElement('div');
  banner.className   = 'error-banner';
  banner.textContent = msg;
  form.insertBefore(banner, form.firstChild);
  banner.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  document.querySelectorAll('.error-banner').forEach(el => el.remove());

  if (!validate()) return;

  setLoading(true);

  try {
    const fd = new FormData();
    fd.append('loanOfficerSlug', document.getElementById('loanOfficerSlug').value);
    fd.append('loanOfficerId',   document.getElementById('loanOfficerId').value);
    fd.append('firstName',       document.getElementById('firstName').value.trim());
    fd.append('lastName',        document.getElementById('lastName').value.trim());
    fd.append('email',           document.getElementById('email').value.trim().toLowerCase());
    fd.append('phone',           document.getElementById('phone').value.trim());
    fd.append('propertyState',   document.getElementById('propertyState').value);
    fd.append('propertyType',    document.getElementById('propertyType').value);
    fd.append('propertyUsage',   document.getElementById('propertyUsage').value);
    fd.append('creditScore',     document.getElementById('creditScore').value || '');
    fd.append('notes',           document.getElementById('notes').value.trim());
    fd.append('leFile',          fileInput.files[0]);

    const res  = await fetch('/.netlify/functions/submit', { method: 'POST', body: fd });
    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      showBanner(json.error || 'Something went wrong. Please try again.');
      setLoading(false);
      return;
    }

    form.style.display         = 'none';
    successState.style.display = 'block';

  } catch (err) {
    console.error('Submit error:', err);
    showBanner('Network error. Please check your connection and try again.');
    setLoading(false);
  }
});

// ── Bootstrap: load LO data on page load ─────────────────────────────────────
(async function init() {
  const slug = getSlugFromPath();

  if (!slug || slug === 'second-look') {
    document.getElementById('loadingState').style.display  = 'none';
    document.getElementById('notFoundState').style.display = 'flex';
    return;
  }

  try {
    const lo = await fetchLoanOfficer(slug);
    document.getElementById('loadingState').style.display = 'none';

    if (!lo) {
      document.getElementById('notFoundState').style.display = 'flex';
      return;
    }

    renderAdvisor(lo);
    document.getElementById('pageContent').style.display = 'flex';

  } catch (err) {
    console.error('Init error:', err);
    document.getElementById('loadingState').style.display  = 'none';
    document.getElementById('notFoundState').style.display = 'flex';
  }
})();
