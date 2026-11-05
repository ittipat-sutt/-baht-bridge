/**
 * BahtBridge — Configuration Template (config.example.js)
 * Copy this file to config.js and fill in your Supabase project credentials.
 * IMPORTANT: Use ONLY the anon public key. NEVER use the service_role key here!
 */

const AppConfig = {
  SUPABASE_URL: 'https://your-project.supabase.co',
  SUPABASE_ANON_KEY: 'your-anon-public-key-here',
};

if (typeof window !== 'undefined') {
  window.__CONFIG__ = AppConfig;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AppConfig;
}
