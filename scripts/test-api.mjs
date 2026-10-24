import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { loadRootEnv, validateEnv } from './env-helper.mjs';

// Automatically load .env from repository root if present; process environment variables take priority.
loadRootEnv();

const cfg = validateEnv(
  ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'DEVICE_API_KEY', 'REGISTER_API_KEY'],
  { scriptName: 'test-api.mjs' }
);

const baseUrl = cfg.SUPABASE_URL;
const anonKey = cfg.SUPABASE_ANON_KEY;
const deviceKey = cfg.DEVICE_API_KEY;
const registerKey = cfg.REGISTER_API_KEY;
const productId = '00000000-0000-4000-8000-000000000001'; // seeded 2 kg chips

const tag = `test-${randomUUID()}`;
const unknownTag = `unknown-${randomUUID()}`;
const api = (name) => `${baseUrl}/functions/v1/${name}`;

async function invoke(name, { key, body } = {}) {
  const headers = { apikey: anonKey, 'content-type': 'application/json' };
  if (key !== undefined) headers['x-api-key'] = key;
  const response = await fetch(api(name), {
    method: 'POST',
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  assert.ok(Buffer.byteLength(text, 'utf8') <= 1024, `${name} response exceeded 1 KB`);
  let json;
  try { json = text ? JSON.parse(text) : {}; }
  catch { assert.fail(`${name} returned non-JSON: ${text}`); }
  return { response, json };
}

async function readRows(table, filter) {
  const url = new URL(`${baseUrl}/rest/v1/${table}`);
  url.searchParams.set('select', '*');
  for (const [key, value] of Object.entries(filter)) url.searchParams.set(key, value);
  const response = await fetch(url, {
    headers: { apikey: anonKey },
  });
  assert.equal(response.status, 200, `public read of ${table} failed (${response.status})`);
  return response.json();
}

async function run() {
  const health = await invoke('health');
  assert.equal(health.response.status, 200, 'health status');
  assert.equal(health.json.status, 'ok', 'health payload');
  console.log('PASS health');

  const noKey = await invoke('register-parcel', { body: { tag_uid: tag, product_id: productId } });
  assert.equal(noKey.response.status, 401, 'missing key rejected');
  const badKey = await invoke('register-parcel', { key: 'invalid-test-key', body: { tag_uid: tag, product_id: productId } });
  assert.equal(badKey.response.status, 401, 'invalid key rejected');
  const deviceOnRegister = await invoke('register-parcel', { key: deviceKey, body: { tag_uid: tag, product_id: productId } });
  assert.equal(deviceOnRegister.response.status, 403, 'device key cannot register parcels');
  const registerOnScan = await invoke('scan', { key: registerKey, body: { device_id: 'api-test', tag_uid: tag } });
  assert.equal(registerOnScan.response.status, 403, 'register key cannot call scan');
  console.log('PASS missing/invalid keys and key scope');

  const registration = await invoke('register-parcel', {
    key: registerKey,
    body: { tag_uid: tag, product_id: productId },
  });
  assert.equal(registration.response.status, 201, 'registration status');
  assert.ok(registration.json.parcel_id, 'registration parcel_id');
  const scan = await invoke('scan', {
    key: deviceKey,
    body: { device_id: 'api-test', tag_uid: tag },
  });
  assert.equal(scan.response.status, 200, 'scan status');
  assert.equal(scan.json.result, 'ok', 'scan result');
  assert.equal(scan.json.product_name, 'Chips');
  assert.equal(scan.json.weight_kg, 2);
  assert.equal(scan.json.weight_is_simulated, true);
  assert.equal(scan.json.quantity, 40);
  assert.match(scan.json.simulated_expiry_date, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(scan.json.expiry_is_simulated, true);
  assert.ok(Array.isArray(scan.json.display_lines));
  assert.ok(scan.json.display_lines.some((line) => /SIMULATED/.test(line)));
  assert.equal(scan.json.estimated_sell_date, null, 'sell-date work remains deferred');
  console.log('PASS register then scan (ok)');

  const duplicate = await invoke('scan', {
    key: deviceKey,
    body: { device_id: 'api-test', tag_uid: tag },
  });
  assert.equal(duplicate.response.status, 200, 'duplicate status');
  assert.equal(duplicate.json.result, 'duplicate');
  console.log('PASS duplicate scan');

  const unknown = await invoke('scan', {
    key: deviceKey,
    body: { device_id: 'api-test', tag_uid: unknownTag },
  });
  assert.equal(unknown.response.status, 200, 'unknown status');
  assert.equal(unknown.json.result, 'unknown_tag');
  const repeatedUnknown = await invoke('scan', {
    key: deviceKey,
    body: { device_id: 'api-test', tag_uid: unknownTag },
  });
  assert.equal(repeatedUnknown.response.status, 200, 'repeat unknown status');
  assert.equal(repeatedUnknown.json.result, 'duplicate', 'repeat unknown scan is cooldown duplicate');
  console.log('PASS unknown tag and repeat cooldown');

  const batches = await readRows('batches', { tag_uid: `eq.${tag}` });
  assert.equal(batches.length, 1, 'exactly one batch after duplicate retry');
  assert.equal(batches[0].quantity, 40);
  const events = await readRows('arrival_events', { tag_uid: `eq.${tag}` });
  assert.equal(events.length, 1, 'duplicate retry creates no event');
  assert.equal(events[0].result, 'ok');
  const unknownEvents = await readRows('arrival_events', { tag_uid: `eq.${unknownTag}` });
  assert.equal(unknownEvents.length, 1, 'unknown scan is logged');
  assert.equal(unknownEvents[0].result, 'unknown_tag');
  console.log('PASS read-only public access and no duplicate writes');
}

run().catch((error) => {
  console.error(`FAIL API integration: ${error.message}`);
  process.exitCode = 1;
});
