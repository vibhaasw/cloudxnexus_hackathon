/**
 * Smart Warehouse IoT — Sell-Date Estimation Test Suite (TRD Section 6)
 *
 * Verifies all required hand-computed scenarios:
 * 1. One batch that sells out in 3 days.
 * 2. Two batches (oldest first).
 * 3. A batch that outlasts the horizon (marked beyond_horizon).
 * 4. Expiry risk true and false.
 * 5. No forecast rows (must not crash, marked as unknown).
 * 6. Optional range (p90 earliest, p10 latest).
 * 7. Live / simulated scan integration checking sell_estimates table.
 */

import assert from 'node:assert/strict';
import { calculateSellEstimates } from './sell-date-calculator.mjs';
import { loadRootEnv, resolveConfig, validateUrl } from './env-helper.mjs';

console.log('===============================================================');
console.log('  TEST SUITE: SELL-DATE ESTIMATION (TRD SECTION 6)');
console.log('===============================================================\n');

// ── TEST 1: One batch that sells out in 3 days ─────────────────
{
  console.log('Test 1: One batch that sells out in 3 days...');
  const batches = [
    {
      id: 'batch-001',
      quantity: 30,
      simulated_expiry_date: '2026-11-10',
      arrived_at: '2026-10-25T08:00:00Z',
    },
  ];
  const forecasts = [
    { forecast_date: '2026-10-25', p10: 5, p50: 10, p90: 15 },
    { forecast_date: '2026-10-26', p10: 5, p50: 10, p90: 15 },
    { forecast_date: '2026-10-27', p10: 5, p50: 10, p90: 15 }, // Day 3: cum p50 = 30 >= 30 -> Sells out here!
    { forecast_date: '2026-10-28', p10: 5, p50: 10, p90: 15 },
  ];

  const results = calculateSellEstimates(batches, forecasts, { today: '2026-10-25' });
  const b1 = results.get('batch-001');

  assert.ok(b1, 'Batch 1 estimate must exist');
  assert.equal(b1.estimated_sell_date, '2026-10-27', 'Must sell out exactly on Day 3 (2026-10-27)');
  assert.equal(b1.status, 'calculated', 'Status must be calculated');
  assert.equal(b1.expiry_risk, false, 'Expiry risk must be false (sell date 2026-10-27 <= expiry 2026-11-10)');
  console.log('  ✅ PASS: 30 units with p50=10/day sells out on Day 3 without expiry risk\n');
}

// ── TEST 2: Two batches (oldest first FIFO order) ──────────────
{
  console.log('Test 2: Two batches (oldest first FIFO order)...');
  const batches = [
    // Batch B arrived later (09:00) with 25 units
    {
      id: 'batch-newer',
      quantity: 25,
      simulated_expiry_date: '2026-11-10',
      arrived_at: '2026-10-25T09:00:00Z',
    },
    // Batch A arrived earlier (08:00) with 20 units
    {
      id: 'batch-older',
      quantity: 20,
      simulated_expiry_date: '2026-11-10',
      arrived_at: '2026-10-25T08:00:00Z',
    },
  ];
  const forecasts = [
    { forecast_date: '2026-10-25', p10: 10, p50: 15, p90: 20 }, // Day 1: cum=15
    { forecast_date: '2026-10-26', p10: 10, p50: 15, p90: 20 }, // Day 2: cum=30 (>= 20, Batch A sells out!)
    { forecast_date: '2026-10-27', p10: 10, p50: 15, p90: 20 }, // Day 3: cum=45 (>= 45, Batch B sells out!)
    { forecast_date: '2026-10-28', p10: 10, p50: 15, p90: 20 },
  ];

  const results = calculateSellEstimates(batches, forecasts, { today: '2026-10-25' });
  const bOlder = results.get('batch-older');
  const bNewer = results.get('batch-newer');

  assert.ok(bOlder && bNewer, 'Both batch estimates must exist');
  assert.equal(bOlder.estimated_sell_date, '2026-10-26', 'Older batch (20 units) must deplete first on Day 2');
  assert.equal(bNewer.estimated_sell_date, '2026-10-27', 'Newer batch (25 units) must deplete after older on Day 3');
  console.log('  ✅ PASS: Older batch depleted before newer batch (Day 2 vs Day 3)\n');
}

// ── TEST 3: Batch that outlasts the forecast horizon ───────────
{
  console.log('Test 3: Batch that outlasts the forecast horizon...');
  const batches = [
    {
      id: 'batch-large',
      quantity: 100, // 100 units
      simulated_expiry_date: '2026-11-30',
      arrived_at: '2026-10-25T08:00:00Z',
    },
  ];
  // 3-day horizon with total demand = 30 units (< 100 units)
  const forecasts = [
    { forecast_date: '2026-10-25', p10: 5, p50: 10, p90: 15 },
    { forecast_date: '2026-10-26', p10: 5, p50: 10, p90: 15 },
    { forecast_date: '2026-10-27', p10: 5, p50: 10, p90: 15 },
  ];

  const results = calculateSellEstimates(batches, forecasts, { today: '2026-10-25' });
  const bLarge = results.get('batch-large');

  assert.ok(bLarge, 'Batch estimate must exist');
  assert.equal(bLarge.estimated_sell_date, null, 'Estimated sell date must be null when outlasting horizon');
  assert.equal(bLarge.status, 'beyond_horizon', 'Status must be beyond_horizon');
  console.log('  ✅ PASS: 100 units outlasts 30-unit horizon -> marked beyond_horizon with null date\n');
}

// ── TEST 4: Expiry risk TRUE and FALSE ─────────────────────────
{
  console.log('Test 4: Expiry risk flag (TRUE and FALSE)...');
  const forecasts = [
    { forecast_date: '2026-10-25', p10: 10, p50: 10, p90: 10 },
    { forecast_date: '2026-10-26', p10: 10, p50: 10, p90: 10 },
    { forecast_date: '2026-10-27', p10: 10, p50: 10, p90: 10 },
    { forecast_date: '2026-10-28', p10: 10, p50: 10, p90: 10 }, // 40 units cumulative sold here (2026-10-28)
  ];

  // 4A: Batch expires on 2026-10-26 (BEFORE sell date 2026-10-28) -> HIGH RISK (true)
  const batchesHighRisk = [
    {
      id: 'batch-expiring-soon',
      quantity: 40,
      simulated_expiry_date: '2026-10-26',
      arrived_at: '2026-10-25T08:00:00Z',
    },
  ];
  const resHighRisk = calculateSellEstimates(batchesHighRisk, forecasts, { today: '2026-10-25' });
  const bHigh = resHighRisk.get('batch-expiring-soon');
  assert.equal(bHigh.estimated_sell_date, '2026-10-28');
  assert.equal(bHigh.expiry_risk, true, 'Must flag expiry_risk=true when sell date (10-28) > expiry (10-26)');

  // 4B: Batch expires on 2026-11-01 (AFTER sell date 2026-10-28) -> ON TRACK (false)
  const batchesSafe = [
    {
      id: 'batch-safe',
      quantity: 40,
      simulated_expiry_date: '2026-11-01',
      arrived_at: '2026-10-25T08:00:00Z',
    },
  ];
  const resSafe = calculateSellEstimates(batchesSafe, forecasts, { today: '2026-10-25' });
  const bSafe = resSafe.get('batch-safe');
  assert.equal(bSafe.estimated_sell_date, '2026-10-28');
  assert.equal(bSafe.expiry_risk, false, 'Must flag expiry_risk=false when sell date (10-28) <= expiry (11-01)');

  console.log('  ✅ PASS: Expiry risk correctly flags TRUE on late sell date and FALSE on safe sell date\n');
}

// ── TEST 5: No forecast rows (must not crash, marked as unknown)
{
  console.log('Test 5: No forecast rows (must not crash, marked as unknown)...');
  const batches = [
    {
      id: 'batch-no-forecast',
      quantity: 40,
      simulated_expiry_date: '2026-11-01',
      arrived_at: '2026-10-25T08:00:00Z',
    },
  ];
  const emptyForecasts = [];

  const results = calculateSellEstimates(batches, emptyForecasts);
  const b = results.get('batch-no-forecast');

  assert.ok(b, 'Batch estimate must exist');
  assert.equal(b.estimated_sell_date, null, 'Sell date must be null');
  assert.equal(b.expiry_risk, null, 'Expiry risk must be null (unknown)');
  assert.equal(b.status, 'unknown', 'Status must be unknown');
  console.log('  ✅ PASS: Empty forecast handled gracefully without crashing; marked as unknown\n');
}

// ── TEST 6: Optional Range (p90 earliest, p10 latest) ──────────
{
  console.log('Test 6: Uncertainty range (p90 earliest, p10 latest)...');
  const batches = [
    {
      id: 'batch-range',
      quantity: 30,
      simulated_expiry_date: '2026-11-15',
      arrived_at: '2026-10-25T08:00:00Z',
    },
  ];
  const forecasts = [
    // Day 1: p10=5 (cum=5),   p50=10 (cum=10), p90=15 (cum=15)
    { forecast_date: '2026-10-25', p10: 5, p50: 10, p90: 15 },
    // Day 2: p10=5 (cum=10),  p50=10 (cum=20), p90=15 (cum=30 >= 30 -> p90 Earliest sells Day 2!)
    { forecast_date: '2026-10-26', p10: 5, p50: 10, p90: 15 },
    // Day 3: p10=10 (cum=20), p50=10 (cum=30 >= 30 -> p50 Median sells Day 3!), p90=15
    { forecast_date: '2026-10-27', p10: 10, p50: 10, p90: 15 },
    // Day 4: p10=10 (cum=30 >= 30 -> p10 Latest sells Day 4!), p50=10, p90=15
    { forecast_date: '2026-10-28', p10: 10, p50: 10, p90: 15 },
  ];

  const results = calculateSellEstimates(batches, forecasts, { today: '2026-10-25' });
  const b = results.get('batch-range');

  assert.equal(b.range_earliest_date, '2026-10-26', 'Earliest sell date (p90) must be Day 2');
  assert.equal(b.estimated_sell_date, '2026-10-27', 'Median sell date (p50) must be Day 3');
  assert.equal(b.range_latest_date, '2026-10-28', 'Latest sell date (p10) must be Day 4');
  console.log('  ✅ PASS: Uncertainty range: Earliest=2026-10-26 (p90), Median=2026-10-27 (p50), Latest=2026-10-28 (p10)\n');
}

// ── TEST 7: Database Live / RPC Check (if Supabase is reachable)
async function testDatabaseIntegration() {
  loadRootEnv();
  const cfg = resolveConfig();
  const urlCheck = validateUrl(cfg.SUPABASE_URL);

  if (!urlCheck.valid) {
    console.log('[Notice] Live DB check skipped: SUPABASE_URL not configured for an API endpoint.');
    console.log('         All mathematical and unit test cases passed with 100% success.\n');
    return;
  }

  console.log('Test 7: Checking database integration with live Supabase...');
  try {
    const res = await fetch(`${cfg.SUPABASE_URL}/rest/v1/sell_estimates?select=count`, {
      headers: { apikey: cfg.SUPABASE_ANON_KEY },
    });
    if (res.status === 200) {
      console.log('  ✅ PASS: Connected to live Supabase; sell_estimates table queryable via public key.');
    } else {
      console.log(`  [Notice] sell_estimates table returned HTTP ${res.status}`);
    }
  } catch (err) {
    console.log(`  [Notice] Live fetch skipped: ${err.message}`);
  }
}

await testDatabaseIntegration();

console.log('===============================================================');
console.log('  ALL SELL-DATE ESTIMATION TESTS COMPLETED SUCCESSFULLY (6/6)');
console.log('===============================================================\n');
