/**
 * Generates web/config.public.js containing read-only public parameters (URL & anon key).
 * 
 * Complies with Rule 1 (never exposes secret keys) and Rule 5 (web app holds public key only).
 */
import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRootEnv, resolveConfig } from './env-helper.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outputPath = resolve(__dirname, '../web/config.public.js');

loadRootEnv();
const cfg = resolveConfig();

const content = `// Auto-generated public frontend configuration
// Contains ONLY read-only public parameters (SUPABASE_URL and SUPABASE_ANON_KEY).
// Service keys must NEVER be placed here.

window.APP_CONFIG = Object.assign(window.APP_CONFIG || {}, {
  SUPABASE_URL: ${JSON.stringify(cfg.SUPABASE_URL)},
  SUPABASE_ANON_KEY: ${JSON.stringify(cfg.SUPABASE_ANON_KEY)},
  POLL_INTERVAL_MS: 15000
});
`;

writeFileSync(outputPath, content, 'utf8');
console.log(`[build:config] Successfully generated ${outputPath}`);
