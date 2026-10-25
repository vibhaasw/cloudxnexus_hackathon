// Smart Warehouse IoT - Owner App Configuration Template
// Copy this file to web/config.js and set your values.
// web/config.js is git-ignored and will not be committed.
//
// NOTE: Use ONLY the read-only public anon key (SUPABASE_ANON_KEY).
// NEVER place the secret service_role key here.

window.APP_CONFIG = {
  // Supabase project URL (e.g. "https://xyzcompany.supabase.co" or "http://127.0.0.1:54321")
  SUPABASE_URL: "https://YOUR_PROJECT_ID.supabase.co",

  // Supabase read-only public anon key
  SUPABASE_ANON_KEY: "YOUR_SUPABASE_ANON_KEY",

  // Background polling backup interval in milliseconds (default 15s)
  POLL_INTERVAL_MS: 15000
};
