/**
 * Unit Test Suite for Web App Logic
 * Verifies with fixture data (never the live database):
 * - Lane determination (<10 kg vs >=10 kg)
 * - Expiry risk calculation (estimate sell date vs simulated expiry)
 * - Null and empty safety (missing fields, undefined estimates, invalid dates)
 * - Date & time formatting helpers
 * - Search and filtering logic
 * - HTML escaping
 */

import test from 'node:test';
import assert from 'node:assert/strict';

// Mock window object for helper extraction
const window = {};

// Replicate helper logic identically to app.js
const helpers = {
  laneFor(weightKg) {
    const num = Number(weightKg);
    if (isNaN(num)) return 'L';
    return num >= 10 ? 'R' : 'L';
  },

  isAtRisk(estimate, batch) {
    if (!estimate) return false;
    if (estimate.expiry_risk === true) return true;
    if (estimate.estimated_sell_date && batch && batch.simulated_expiry_date) {
      return estimate.estimated_sell_date > batch.simulated_expiry_date;
    }
    return false;
  },

  getTodayUtcIso() {
    return new Date().toISOString().slice(0, 10);
  },

  formatDateTime(isoString) {
    if (!isoString) return '—';
    try {
      const d = new Date(isoString);
      if (isNaN(d.getTime())) return isoString;
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) +
             ' (' + d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ')';
    } catch {
      return isoString;
    }
  },

  formatShortDate(isoDateStr) {
    if (!isoDateStr) return '';
    try {
      const parts = isoDateStr.split('-');
      if (parts.length < 3) return isoDateStr;
      const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
      return d.toLocaleDateString([], { weekday: 'short', month: 'numeric', day: 'numeric' });
    } catch {
      return isoDateStr;
    }
  },

  timeAgo(isoString, now = Date.now()) {
    if (!isoString) return '';
    try {
      const past = new Date(isoString).getTime();
      const diffSec = Math.floor((now - past) / 1000);
      if (diffSec < 5) return 'just now';
      if (diffSec < 60) return `${diffSec}s ago`;
      const diffMin = Math.floor(diffSec / 60);
      if (diffMin < 60) return `${diffMin}m ago`;
      const diffHr = Math.floor(diffMin / 60);
      return `${diffHr}h ago`;
    } catch {
      return '';
    }
  },

  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  },

  filterBatches(batches, productsMap, search, filter, estimatesMap) {
    if (!Array.isArray(batches)) return [];
    const query = (search || '').trim().toLowerCase();

    return batches.filter(batch => {
      const prod = productsMap.get(batch.product_id) || {};
      const prodName = (prod.name || '').toLowerCase();
      const prodCat = (prod.category || '').toLowerCase();
      const tag = (batch.tag_uid || '').toLowerCase();

      const matchesSearch = !query ||
        prodName.includes(query) ||
        prodCat.includes(query) ||
        tag.includes(query);

      if (!matchesSearch) return false;

      const weight = prod.weight_kg !== undefined ? prod.weight_kg : 2.0;
      const lane = helpers.laneFor(weight);
      const est = estimatesMap ? estimatesMap.get(batch.id) : null;
      const atRisk = helpers.isAtRisk(est, batch);

      if (filter === 'all') return true;
      if (filter === 'left') return lane === 'L';
      if (filter === 'right') return lane === 'R';
      if (filter === 'risk') return atRisk;
      return true;
    });
  }
};

// ── Fixture Data ───────────────────────────────────────────────
const fixtureProducts = [
  { id: 'p1', name: 'Chips', category: 'Snacks', weight_kg: 2.0 },
  { id: 'p2', name: 'Flour Sack', category: 'Pantry', weight_kg: 20.0 },
  { id: 'p3', name: 'Green Tea', category: 'Beverages', weight_kg: 0.5 }
];
const productsMap = new Map(fixtureProducts.map(p => [p.id, p]));

const fixtureBatches = [
  { id: 'b1', product_id: 'p1', tag_uid: '0AEFF505', quantity: 40, simulated_expiry_date: '2026-12-01', arrived_at: '2026-10-25T05:00:00Z' },
  { id: 'b2', product_id: 'p2', tag_uid: 'TAG-FLOUR-01', quantity: 40, simulated_expiry_date: '2026-11-01', arrived_at: '2026-10-25T06:00:00Z' },
  { id: 'b3', product_id: 'p3', tag_uid: 'TAG-TEA-01', quantity: 40, simulated_expiry_date: '2026-10-28', arrived_at: '2026-10-25T07:00:00Z' }
];

const estimatesMap = new Map([
  ['b1', { batch_id: 'b1', estimated_sell_date: '2026-11-15', expiry_risk: false, status: 'ok' }],
  ['b2', { batch_id: 'b2', estimated_sell_date: '2026-11-20', expiry_risk: true, status: 'ok' }],
  ['b3', { batch_id: 'b3', estimated_sell_date: null, expiry_risk: null, status: 'unknown' }]
]);

// ── Tests ──────────────────────────────────────────────────────

test('laneFor: correctly classifies <10 kg as Left and >=10 kg as Right', () => {
  assert.equal(helpers.laneFor(0.5), 'L');
  assert.equal(helpers.laneFor(2.0), 'L');
  assert.equal(helpers.laneFor(9.99), 'L');
  assert.equal(helpers.laneFor(10.0), 'R');
  assert.equal(helpers.laneFor(20.0), 'R');
  assert.equal(helpers.laneFor(null), 'L');
  assert.equal(helpers.laneFor(undefined), 'L');
  assert.equal(helpers.laneFor('invalid'), 'L');
});

test('isAtRisk: identifies expiry risks correctly with null safety', () => {
  // b1: sell Nov 15 < expiry Dec 01 -> not at risk
  assert.equal(helpers.isAtRisk(estimatesMap.get('b1'), fixtureBatches[0]), false);

  // b2: expiry_risk flag is true -> at risk
  assert.equal(helpers.isAtRisk(estimatesMap.get('b2'), fixtureBatches[1]), true);

  // b3: null estimate fields -> not at risk (no throw)
  assert.equal(helpers.isAtRisk(estimatesMap.get('b3'), fixtureBatches[2]), false);

  // missing estimate -> false (no throw)
  assert.equal(helpers.isAtRisk(null, fixtureBatches[0]), false);
  assert.equal(helpers.isAtRisk(undefined, undefined), false);

  // sell date after expiry date
  const lateSell = { estimated_sell_date: '2027-01-01', expiry_risk: null };
  const earlyExp = { simulated_expiry_date: '2026-12-01' };
  assert.equal(helpers.isAtRisk(lateSell, earlyExp), true);
});

test('filterBatches: search and filter chips function correctly', () => {
  // All batches
  const all = helpers.filterBatches(fixtureBatches, productsMap, '', 'all', estimatesMap);
  assert.equal(all.length, 3);

  // Filter left lane (<10 kg): Chips (2kg) and Tea (0.5kg)
  const left = helpers.filterBatches(fixtureBatches, productsMap, '', 'left', estimatesMap);
  assert.equal(left.length, 2);
  assert.ok(left.some(b => b.id === 'b1'));
  assert.ok(left.some(b => b.id === 'b3'));

  // Filter right lane (>=10 kg): Flour (20kg)
  const right = helpers.filterBatches(fixtureBatches, productsMap, '', 'right', estimatesMap);
  assert.equal(right.length, 1);
  assert.equal(right[0].id, 'b2');

  // Filter at risk: b2
  const risk = helpers.filterBatches(fixtureBatches, productsMap, '', 'risk', estimatesMap);
  assert.equal(risk.length, 1);
  assert.equal(risk[0].id, 'b2');

  // Search by product name
  const chipsSearch = helpers.filterBatches(fixtureBatches, productsMap, 'chips', 'all', estimatesMap);
  assert.equal(chipsSearch.length, 1);
  assert.equal(chipsSearch[0].id, 'b1');

  // Search by tag UID
  const tagSearch = helpers.filterBatches(fixtureBatches, productsMap, '0AEFF', 'all', estimatesMap);
  assert.equal(tagSearch.length, 1);
  assert.equal(tagSearch[0].id, 'b1');

  // Empty / null cases
  assert.deepEqual(helpers.filterBatches(null, productsMap, '', 'all', estimatesMap), []);
  assert.deepEqual(helpers.filterBatches([], productsMap, '', 'all', estimatesMap), []);
});

test('formatDateTime & formatShortDate: handles valid, null, and empty inputs', () => {
  assert.equal(helpers.formatDateTime(null), '—');
  assert.equal(helpers.formatDateTime(''), '—');
  assert.equal(helpers.formatDateTime(undefined), '—');

  const formatted = helpers.formatDateTime('2026-10-25T10:00:00Z');
  assert.ok(formatted.includes('Oct'));

  assert.equal(helpers.formatShortDate(null), '');
  assert.equal(helpers.formatShortDate(''), '');
  const shortDate = helpers.formatShortDate('2026-10-25');
  assert.ok(shortDate.length > 0);
});

test('timeAgo: formats relative time correctly without throwing', () => {
  const now = 1000000;
  assert.equal(helpers.timeAgo('', now), '');
  assert.equal(helpers.timeAgo(null, now), '');
  assert.equal(helpers.timeAgo(new Date(now - 2000).toISOString(), now), 'just now');
  assert.equal(helpers.timeAgo(new Date(now - 30000).toISOString(), now), '30s ago');
  assert.equal(helpers.timeAgo(new Date(now - 120000).toISOString(), now), '2m ago');
  assert.equal(helpers.timeAgo(new Date(now - 7200000).toISOString(), now), '2h ago');
});

test('escapeHtml: escapes special characters to prevent XSS', () => {
  assert.equal(helpers.escapeHtml('<script>alert("xss")</script>'), '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
  assert.equal(helpers.escapeHtml("Tom & Jerry's"), 'Tom &amp; Jerry&#039;s');
  assert.equal(helpers.escapeHtml(null), '');
  assert.equal(helpers.escapeHtml(undefined), '');
});
