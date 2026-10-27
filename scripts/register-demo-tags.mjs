/**
 * Smart Warehouse IoT — Register Preset Demo Tags
 *
 * Automatically registers the physical demo RFID tags into pending_parcels
 * so you don't have to manually pass --product and --tag flags in the terminal.
 *
 * Usage:
 *   npm run register:demo
 *   or: node scripts/register-demo-tags.mjs
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRootEnv, validateEnv } from './env-helper.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const catalogPath = resolve(__dirname, 'demo-catalog.json');

loadRootEnv();
const cfg = validateEnv(
  ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'REGISTER_API_KEY'],
  { scriptName: 'register-demo-tags.mjs' }
);

function loadCatalog() {
  try {
    const raw = readFileSync(catalogPath, 'utf-8');
    return JSON.parse(raw).products || [];
  } catch (err) {
    console.error(`ERROR: Cannot read catalog at ${catalogPath}: ${err.message}`);
    process.exit(1);
  }
}

export async function registerTag(tagUid, productId, label) {
  const registerUrl = `${cfg.SUPABASE_URL}/functions/v1/register-parcel`;
  try {
    const res = await fetch(registerUrl, {
      method: 'POST',
      headers: {
        apikey: cfg.SUPABASE_ANON_KEY,
        'x-api-key': cfg.REGISTER_API_KEY,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        tag_uid: tagUid.trim().toUpperCase(),
        product_id: productId,
      }),
    });

    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch { json = { raw: text }; }

    if (res.status === 201) {
      console.log(`✅ [REGISTERED] ${label} | Tag: ${tagUid} | Parcel ID: ${json.parcel_id}`);
      return { status: 'registered', parcel_id: json.parcel_id };
    } else if (res.status === 409) {
      console.log(`⚡ [READY]      ${label} | Tag: ${tagUid} | Already pending in cloud, ready to scan!`);
      return { status: 'already_pending' };
    } else {
      console.error(`❌ [FAILED]     ${label} | Tag: ${tagUid} | HTTP ${res.status}: ${text}`);
      return { status: 'error', error: text };
    }
  } catch (err) {
    console.error(`❌ [NETWORK]    ${label} | Tag: ${tagUid} | Error: ${err.message}`);
    return { status: 'error', error: err.message };
  }
}

async function main() {
  const products = loadCatalog();
  console.log(`\n============================================================`);
  console.log(`  Smart Warehouse — Preset Demo RFID Tags Registration`);
  console.log(`============================================================\n`);

  let count = 0;
  for (const product of products) {
    for (const tag of product.tag_uids || []) {
      // Skip generic placeholder tags if we want only physical tags
      if (tag.startsWith('DEMO-')) continue;
      count++;
      const label = `${product.name} (${product.weight_kg} kg SIMULATED)`;
      await registerTag(tag, product.product_id, label);
    }
  }

  if (count === 0) {
    console.log(`Notice: No physical tags found in scripts/demo-catalog.json.`);
    console.log(`Please add your physical RFID tags to scripts/demo-catalog.json.`);
  }

  console.log(`\n------------------------------------------------------------`);
  console.log(`  Preset tags armed! Tap your card/fob on the ESP32 scanner.`);
  console.log(`------------------------------------------------------------\n`);
}

// Run directly if invoked from CLI
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
