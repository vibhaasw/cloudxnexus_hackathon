#!/usr/bin/env node
/**
 * Smart Warehouse IoT — Demo Product Seeding Script (npm run seed)
 * 
 * Rules:
 * - Idempotent upsert of demo products through the PostgREST API with the secret key.
 * - Single source of truth: demand-forecasting-uq/products.json.
 * - Uses 'apikey' header only (never Bearer token, supporting modern sb_secret_ and legacy keys).
 * - Shared validation checks all required variables up front.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  REPO_ROOT,
  loadRootEnv,
  validateEnv
} from './env-helper.mjs';

loadRootEnv();
const cfg = validateEnv(['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'], { scriptName: 'npm run seed' });

const productsConfigPath = resolve(REPO_ROOT, 'demand-forecasting-uq', 'products.json');
if (!existsSync(productsConfigPath)) {
  console.error(`[seed] Error: products configuration not found at ${productsConfigPath}`);
  process.exit(1);
}

const catalogRaw = JSON.parse(readFileSync(productsConfigPath, 'utf8'));
const products = catalogRaw.products;
if (!Array.isArray(products) || products.length === 0) {
  console.error(`[seed] Error: products list in ${productsConfigPath} is empty or malformed.`);
  process.exit(1);
}

const seedRows = products.map((p) => ({
  id: p.product_id,
  name: p.name,
  category: p.category,
  weight_kg: p.weight_kg,
  shelf_life_days: p.shelf_life_days
}));

async function seed() {
  const url = `${cfg.SUPABASE_URL}/rest/v1/products?on_conflict=id`;
  console.log(`[seed] Upserting ${seedRows.length} demo products to ${cfg.SUPABASE_URL}...`);

  const secretKey = cfg.SUPABASE_SECRET_KEY;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: secretKey,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=representation'
    },
    body: JSON.stringify(seedRows)
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error(`[seed] HTTP ${res.status} Error: ${errText}`);
    process.exit(1);
  }

  const result = await res.json();
  console.log(`[seed] Successfully upserted ${result.length} demo product(s):`);
  for (const item of result) {
    console.log(`  ✓ [${item.name}] (${item.category}, ${item.weight_kg}kg SIMULATED) ID: ${item.id}`);
  }
}

seed().catch((err) => {
  console.error(`[seed] Execution failure: ${err.message}`);
  process.exit(1);
});
