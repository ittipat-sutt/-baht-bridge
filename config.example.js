/**
 * BahtBridge — Configuration Template (config.example.js)
 * Copy this file to config.js and fill in your credentials.
 *
 * Supabase: https://supabase.com (free tier)
 *   IMPORTANT: Use ONLY the anon public key. NEVER use the secret/admin key!
 *
 * Gemini API: https://aistudio.google.com/apikey (free tier — 15 req/min)
 *   Get a free API key and paste it below to enable AI features.
 */

const AppConfig = {
  // ─── Supabase (Cloud Sync) ───────────────────────────────────────────────
  SUPABASE_URL: 'https://your-project.supabase.co',
  SUPABASE_ANON_KEY: 'your-anon-public-key-here',

  // ─── Gemini AI (AI Price Advice + Business Analysis) ────────────────────
  GEMINI_API_KEY: 'your-gemini-api-key-here',
};

if (typeof window !== 'undefined') {
  window.__CONFIG__ = AppConfig;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AppConfig;
}
