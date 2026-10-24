# Smart Warehouse backend API (demo)

Endpoints are Supabase Edge Functions at `${SUPABASE_URL}/functions/v1/<name>`.
Device and PC writes go through the functions; the future forecast loader may
write forecast rows using the server-side service key. `SUPABASE_ANON_KEY` is
the public key used for the API gateway and read-only PostgREST checks; it
cannot write database rows. The `x-api-key` header has a separate key for parcel registration and
for the scan station. The device key is accepted by **scan only**. Never place
the server-side service key in the app, device, replay client, or API examples.

All catalog weights and generated expiry values are simulated. Expiry dates
are demo values only and are not food-safety information. Forecast values are
also simulated; this backend does not generate forecasts.

## Authentication and response limits

- `health`: no key required.
- `register-parcel`: `x-api-key: $REGISTER_API_KEY` only.
- `scan`: `x-api-key: $DEVICE_API_KEY` only.
- Send the public `apikey: $SUPABASE_ANON_KEY` header to the Supabase gateway.
- Missing/invalid keys return `401`; a valid key for the other function returns
  `403`. `DEVICE_API_KEY` and `REGISTER_API_KEY` must be different.
- JSON responses are capped at 1 KB. Registration accepts one pending parcel
  per tag UID. A successful scan makes a batch of `UNITS_PER_BOX` units
  (default `40`). A repeated scan of a tag with a recent `ok` or
  `unknown_tag` result (within 10 seconds) returns `duplicate` without inserting a batch or event.
- Unknown tags return `unknown_tag` and are written to `arrival_events` for
  visible diagnostics. Successful scans and unknown tags create arrival events;
  duplicate retries create no database records.

## Health

```http
POST /functions/v1/health
apikey: $SUPABASE_ANON_KEY
content-type: application/json
```

No body is required.

```json
{"status":"ok"}
```

## Register a parcel

The registration credential belongs only in the trusted laptop/replay
environment. Use either a seeded `product_id`, or both `weight_kg` and `type`
where `type` exactly matches the product name or category. The weight is simulated catalog data.

```http
POST /functions/v1/register-parcel
apikey: $SUPABASE_ANON_KEY
x-api-key: $REGISTER_API_KEY
content-type: application/json

{"tag_uid":"DEMO-CHIPS-01","product_id":"00000000-0000-4000-8000-000000000001"}
```

Success (`201`):

```json
{"parcel_id":"<generated-uuid>"}
```

An already-pending tag returns `409`; an unknown product returns `404`.

## Scan a tag

The device uses only its limited `DEVICE_API_KEY`; it never receives the
service key. The returned weight and expiry are explicitly simulated. On every scan,
the backend triggers FIFO sell-date estimation (TRD Section 6) and returns the
`estimated_sell_date` and `expiry_risk` flag.

```http
POST /functions/v1/scan
apikey: $SUPABASE_ANON_KEY
x-api-key: $DEVICE_API_KEY
content-type: application/json

{"device_id":"station-01","tag_uid":"DEMO-CHIPS-01"}
```

Success (`200`, shortened UUIDs shown):

```json
{
  "result":"ok",
  "batch_id":"<generated-uuid>",
  "product_id":"00000000-0000-4000-8000-000000000001",
  "product_name":"Chips",
  "category":"Snacks",
  "weight_kg":2,
  "weight_is_simulated":true,
  "quantity":40,
  "simulated_mfg_date":"<UTC-today>",
  "simulated_expiry_date":"<UTC-today plus simulated shelf life and up to 2 days variation>",
  "expiry_is_simulated":true,
  "estimated_sell_date":"<UTC-date or null if beyond horizon or unknown>",
  "expiry_risk":false,
  "display_lines":[
    "Product: Chips",
    "Weight: 2 kg (SIMULATED)",
    "Expiry: <simulated-date> (SIMULATED)",
    "Status: OK"
  ]
}
```

An unregistered tag returns `200` and is logged:

```json
{"result":"unknown_tag","estimated_sell_date":null,"display_lines":["UNKNOWN TAG","Status: UNKNOWN"]}
```

A repeat scan of the same tag within 10 seconds returns `200` and creates no
new record:

```json
{"result":"duplicate","estimated_sell_date":null,"display_lines":["DUPLICATE SCAN","Status: DUPLICATE"]}
```

A missing or invalid `x-api-key` returns `401`, for example
`{"error":"missing API key"}`. No expiry date in this API is real food-safety guidance.

## Schema and reset

Apply migrations and demo products to a local Supabase stack with:

```sh
supabase start
sh scripts/reset-demo.sh
```

The reset script uses `supabase db reset --local`; it destructively resets the
**local** Supabase database only, reapplies migrations, and restores the four
seed products. It does not reset a hosted project. Start the local function
runtime in another terminal with a private, untracked file containing the local
`DEVICE_API_KEY`, `REGISTER_API_KEY`, and optional `UNITS_PER_BOX` values:

```sh
supabase functions serve --env-file ./supabase/local-function-secrets
```

Supabase's local function runtime supplies its project URL and server-side
runtime credentials; the private file is for the custom function secrets. Do
not commit or share the private file.

For hosted deployment, review the migration, link the intended project, apply
migrations, and deploy the three functions using the Supabase CLI. Set
`DEVICE_API_KEY`, `REGISTER_API_KEY`, and optionally `UNITS_PER_BOX` as Edge
Function secrets. Use distinct random keys; never place the service key in a
client-facing file. The Edge Function runtime uses the service key only on the
server. Keep any private local function environment file untracked and do not
send its contents to the agent.

## API integration test

The test uses only the public read key and the two function-specific API keys;
it never requires or reads a service key. Against local Supabase, export the
following names in the shell with values from your local setup (the placeholders
below are not actual credentials):

```sh
export SUPABASE_URL='http://127.0.0.1:54321'
export SUPABASE_ANON_KEY='<public local key>'
export DEVICE_API_KEY='<device-only key configured for functions>'
export REGISTER_API_KEY='<registration-only key configured for functions>'
node scripts/test-api.mjs
```

The script checks health, missing and invalid keys, both key scopes, register
then scan, simulated labels, the unknown-tag event, duplicate idempotency, and
public read access. Do not use a service key for this test.
