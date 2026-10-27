/**
 * Smart Warehouse IoT — Hands-Free Auto-Rearm Demo Loop
 *
 * Keeps your physical RFID demo tags continuously active:
 * 1. Registers preset physical tags on launch.
 * 2. Monitors Supabase for arrival events.
 * 3. When you scan a tag on the ESP32 station, it automatically re-registers
 *    that tag as 'pending' in the cloud after a short delay.
 *
 * You can scan your 2 physical tags repeatedly all day during demos/judging
 * without ever touching the terminal again!
 *
 * Usage:
 *   npm run demo:loop
 *   or: node scripts/auto-rearm.mjs
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRootEnv, validateEnv } from './env-helper.mjs';
import { registerTag } from './register-demo-tags.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const catalogPath = resolve(__dirname, 'demo-catalog.json');

loadRootEnv();
const cfg = validateEnv(
  ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'REGISTER_API_KEY'],
  { scriptName: 'auto-rearm.mjs' }
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

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchLatestArrivals(sinceIso) {
  const url = new URL(`${cfg.SUPABASE_URL}/rest/v1/arrival_events`);
  url.searchParams.set('select', 'id,tag_uid,result,created_at');
  if (sinceIso) {
    url.searchParams.set('created_at', `gt.${sinceIso}`);
  }
  url.searchParams.set('order', 'created_at.desc');
  url.searchParams.set('limit', '10');

  try {
    const res = await fetch(url, {
      headers: {
        apikey: cfg.SUPABASE_ANON_KEY,
        'content-type': 'application/json',
      },
    });
    if (!res.ok) return [];
    return await res.json();
  } catch (err) {
    return [];
  }
}

async function main() {
  const products = loadCatalog();
  const physicalTags = new Map(); // tag_uid -> { product_id, label, name }

  for (const product of products) {
    for (const tag of product.tag_uids || []) {
      if (tag.startsWith('DEMO-')) continue;
      const cleanTag = tag.trim().toUpperCase();
      physicalTags.set(cleanTag, {
        product_id: product.product_id,
        label: `${product.name} (${product.weight_kg} kg SIMULATED)`,
        name: product.name,
      });
    }
  }

  console.log(`\n============================================================`);
  console.log(`  Smart Warehouse — Hands-Free Auto-Rearm Demo Loop`);
  console.log(`============================================================`);
  console.log(`  Monitoring ${physicalTags.size} preset physical tag(s):`);
  for (const [tag, info] of physicalTags.entries()) {
    console.log(`  - Tag: ${tag} -> ${info.label}`);
  }
  console.log(`============================================================\n`);

  if (physicalTags.size === 0) {
    console.error(`Error: No physical RFID tags found in scripts/demo-catalog.json.`);
    console.error(`Add your tag UIDs to scripts/demo-catalog.json and run again.`);
    process.exit(1);
  }

  // 1. Initial arming
  console.log(`[1/2] Pre-arming tags in Supabase pending_parcels...`);
  for (const [tag, info] of physicalTags.entries()) {
    await registerTag(tag, info.product_id, info.label);
  }

  // 2. Continuous watch loop
  console.log(`\n[2/2] Auto-rearm daemon is ACTIVE!`);
  console.log(`👉 Tap your tag on the ESP32 RFID scanner.`);
  console.log(`   When scanned, it will automatically re-arm for the next scan.`);
  console.log(`   Press Ctrl+C to stop.\n`);

  let lastCheckedTime = new Date(Date.now() - 5000).toISOString();
  const processedEventIds = new Set();

  while (true) {
    await sleep(1500);

    const arrivals = await fetchLatestArrivals(lastCheckedTime);
    if (!Array.isArray(arrivals) || arrivals.length === 0) continue;

    // Process from oldest to newest
    const sorted = [...arrivals].reverse();
    for (const event of sorted) {
      if (processedEventIds.has(event.id)) continue;
      processedEventIds.add(event.id);

      const tagUid = (event.tag_uid || '').trim().toUpperCase();
      if (physicalTags.has(tagUid) && event.result === 'ok') {
        const info = physicalTags.get(tagUid);
        console.log(`\n------------------------------------------------------------`);
        console.log(`🎯 [SCAN DETECTED] Tag ${tagUid} (${info.name}) confirmed arrived!`);
        console.log(`⏳ Waiting 3s for conveyor sorting to finish...`);
        await sleep(3000);
        console.log(`🔄 Auto-re-arming Tag ${tagUid} in cloud...`);
        await registerTag(tagUid, info.product_id, info.label);
        console.log(`✨ Tag ${tagUid} is ready for another physical scan!`);
        console.log(`------------------------------------------------------------\n`);
      }

      if (event.created_at > lastCheckedTime) {
        lastCheckedTime = event.created_at;
      }
    }

    // Keep set bounded
    if (processedEventIds.size > 200) {
      processedEventIds.clear();
    }
  }
}

main().catch((err) => {
  console.error(`Auto-rearm fatal error: ${err.message}`);
  process.exit(1);
});
