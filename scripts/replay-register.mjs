/**
 * Smart Warehouse IoT — Replay Registration Script
 *
 * Reads scripts/demo-catalog.json and calls the register-parcel Edge Function
 * for each tag UID.  Mirrors the payload a Fusion hook would send.
 *
 * Usage:
 *   node scripts/replay-register.mjs --all              Register every tag in the catalog
 *   node scripts/replay-register.mjs --product Chips     Register tags for one product
 *   node scripts/replay-register.mjs --all --dry-run     Print payloads without calling the server
 *
 * Environment: SUPABASE_URL, SUPABASE_ANON_KEY, REGISTER_API_KEY (from .env or shell).
 *
 * Simulated weights from the demo catalog are never real measured values.
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRootEnv, validateEnv } from './env-helper.mjs';

// ── Helpers ─────────────────────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));
const catalogPath = resolve(__dirname, 'demo-catalog.json');

function loadCatalog() {
  try {
    const raw = readFileSync(catalogPath, 'utf-8');
    const data = JSON.parse(raw);
    if (!Array.isArray(data.products) || data.products.length === 0) {
      console.error('ERROR: demo-catalog.json contains no products.');
      process.exit(1);
    }
    return data.products;
  } catch (err) {
    console.error(`ERROR: Cannot read catalog at ${catalogPath}: ${err.message}`);
    process.exit(1);
  }
}

function normalizeTagUid(raw) {
  if (typeof raw !== 'string') return '';
  let tag = raw.trim();
  if (/^([0-9a-fA-F]{2}[:\s-])+[0-9a-fA-F]{2}$/.test(tag)) {
    tag = tag.replace(/[:\s-]/g, '');
  }
  return tag.toUpperCase();
}

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { all: false, product: null, dryRun: false, tag: null };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--all') opts.all = true;
    else if (args[i] === '--dry-run') opts.dryRun = true;
    else if (args[i] === '--product' && args[i + 1]) { opts.product = args[++i]; }
    else if (args[i] === '--tag' && args[i + 1]) { opts.tag = args[++i]; }
  }

  if (opts.tag && opts.all) {
    console.error('ERROR: --tag <UID> can only be used with a single product via --product <name>, not with --all.');
    process.exit(1);
  }
  if (opts.tag && !opts.product) {
    console.error('ERROR: --tag <UID> requires --product <name>.\nExample: node scripts/replay-register.mjs --product Chips --tag 01020304');
    process.exit(1);
  }

  if (!opts.all && !opts.product) {
    console.log(
      'Usage:\n' +
      '  node scripts/replay-register.mjs --all                           Register all tags in catalog\n' +
      '  node scripts/replay-register.mjs --product <name>                Register catalog tags for one product\n' +
      '  node scripts/replay-register.mjs --product <name> --tag <UID>    Override tag UID for one product\n' +
      '  Add --dry-run to print payloads without calling the server.\n'
    );
    process.exit(0);
  }
  return opts;
}

// ── Main ────────────────────────────────────────────────────────

const opts = parseArgs();

// Load environment
loadRootEnv();
const cfg = validateEnv(
  ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'REGISTER_API_KEY'],
  { scriptName: 'replay-register.mjs' }
);

const catalog = loadCatalog();

// Filter products
let selected;
if (opts.all) {
  selected = catalog;
} else {
  selected = catalog.filter(
    (p) => p.name.toLowerCase() === opts.product.toLowerCase()
  );
  if (selected.length === 0) {
    console.error(
      `ERROR: No product named "${opts.product}" in catalog.\n` +
      `Available: ${catalog.map((p) => p.name).join(', ')}`
    );
    process.exit(1);
  }
}

// Build payloads — one per tag UID
const payloads = [];
for (const product of selected) {
  const tagList = opts.tag
    ? [normalizeTagUid(opts.tag)]
    : (product.tag_uids || []).map(normalizeTagUid);

  if (tagList.length === 0) {
    console.warn(`WARN: Product "${product.name}" has no tag_uids — skipping.`);
    continue;
  }
  for (const tagUid of tagList) {
    payloads.push({
      tag_uid: tagUid,
      product_id: product.product_id,
      // These mirror a Fusion call that would include weight and type:
      weight_kg: product.weight_kg,
      type: product.name,
      _label: `${product.name} (${product.weight_kg} kg SIMULATED)`,
    });
  }
}

if (payloads.length === 0) {
  console.error('ERROR: No tag UIDs to register.');
  process.exit(1);
}

console.log(`\n${'='.repeat(60)}`);
console.log(`  Replay Registration — ${opts.dryRun ? 'DRY RUN' : 'LIVE'}`);
console.log(`  ${payloads.length} tag(s) across ${selected.length} product(s)`);
console.log(`${'='.repeat(60)}\n`);

const registerUrl = `${cfg.SUPABASE_URL}/functions/v1/register-parcel`;

let successCount = 0;
let failCount = 0;

for (const payload of payloads) {
  const label = payload._label;
  // Strip the display-only _label before sending
  const body = {
    tag_uid: payload.tag_uid,
    product_id: payload.product_id,
  };

  if (opts.dryRun) {
    console.log(`[DRY RUN] ${label}`);
    console.log(`  POST ${registerUrl}`);
    console.log(`  Body: ${JSON.stringify(body)}`);
    console.log('');
    successCount++;
    continue;
  }

  // Live call
  try {
    const res = await fetch(registerUrl, {
      method: 'POST',
      headers: {
        apikey: cfg.SUPABASE_ANON_KEY,
        'x-api-key': cfg.REGISTER_API_KEY,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch { json = { raw: text }; }

    if (res.status === 201) {
      console.log(`✅  ${label}  tag=${payload.tag_uid}  parcel_id=${json.parcel_id}`);
      successCount++;
    } else if (res.status === 409) {
      console.log(`⚠️  ${label}  tag=${payload.tag_uid}  ALREADY PENDING (409)`);
      failCount++;
    } else if (res.status === 404) {
      console.log(`❌  ${label}  tag=${payload.tag_uid}  PRODUCT NOT FOUND (404)`);
      failCount++;
    } else {
      console.log(`❌  ${label}  tag=${payload.tag_uid}  HTTP ${res.status}: ${JSON.stringify(json)}`);
      failCount++;
    }
  } catch (err) {
    console.log(`❌  ${label}  tag=${payload.tag_uid}  NETWORK ERROR: ${err.message}`);
    failCount++;
  }
}

console.log(`\n${'─'.repeat(60)}`);
console.log(`  Done: ${successCount} succeeded, ${failCount} failed`);
if (opts.dryRun) {
  console.log('  (dry run — no server calls were made)');
}
console.log(`${'─'.repeat(60)}\n`);

process.exitCode = failCount > 0 ? 1 : 0;
