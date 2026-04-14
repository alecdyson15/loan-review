/**
 * config.js
 *
 * Exposes the Supabase URL and anon key to the browser.
 *
 * The anon key is SAFE to expose in the browser — it only grants access
 * according to your Row Level Security (RLS) policies.
 * The service_role key is secret and lives ONLY in the Netlify function.
 *
 * HOW TO USE:
 *  Replace the two placeholder values below with your real Supabase values.
 *  Find them at: Supabase Dashboard → Settings → API
 *
 * These are used ONLY for reading loan officer profiles (SELECT on loan_officers).
 * All writes go through the Netlify function using the service_role key.
 */

window.__env = {
  SUPABASE_URL:      'https://huerkeplyygemsceldmi.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh1ZXJrZXBseXlnZW1zY2VsZG1pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxOTEwODQsImV4cCI6MjA5MTc2NzA4NH0.LisvRB2loX9cYhAQ1_BRN8_E1s8l9Zj0RZMFTU5lKRM
'
};
