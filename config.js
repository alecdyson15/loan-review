/**
 * config.js
 *
 * Exposes the Supabase URL and anon key to the browser.
 * The anon key is safe to expose — it only grants access based on your RLS policies.
 * The service_role key is secret and lives only in Netlify environment variables.
 */

window.__env = {
  SUPABASE_URL:      'https://huerkeplyygemsceldmi.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh1ZXJrZXBseXlnZW1zY2VsZG1pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxOTEwODQsImV4cCI6MjA5MTc2NzA4NH0.LisvRB2loX9cYhAQ1_BRN8_E1s8l9Zj0RZMFTU5lKRM'
};
