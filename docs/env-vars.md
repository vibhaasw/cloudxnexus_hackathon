# Environment Variables Reference

This document catalogs every environment variable and shared secret across the Smart Warehouse IoT system.

> [!CAUTION]
> **Zero Credential Exposure Policy (AGENTS.md Hard Rules 1 & 5):**
> Never place or commit real secret values in documentation, source code, or git repositories.
> The **service/secret key** must live ONLY in private local terminal sessions (`.env`), never in client applications or the ESP32 firmware.

---

## Variable Reference Matrix

| Variable Name | Key Format | Who Sets It | Consumers | Where Configured | Security Tier |
|---|---|---|---|---|---|
| `SUPABASE_URL` | URL (`https://...` or `http://127.0.0.1:54321`) | Project owner | • `test-api.mjs`<br>• `seed.mjs`<br>• `forecaster.py`<br>• ESP32 firmware<br>• Owner web app<br>• Edge Functions | Root `.env`<br>`circuit_project/config.h`<br>`web/config.js` | Public |
| `SUPABASE_ANON_KEY`<br>*(alias: `SUPABASE_PUBLISHABLE_KEY`)* | Modern `sb_publishable_...`<br>or legacy JWT (`eyJ...`) | Project owner | • `test-api.mjs`<br>• ESP32 firmware<br>• Owner web app | Root `.env`<br>`circuit_project/config.h`<br>`web/config.js` | Public Read-Only |
| `SUPABASE_SERVICE_ROLE_KEY`<br>*(alias: `SUPABASE_SECRET_KEY`)* | Modern `sb_secret_...`<br>or legacy JWT (`eyJ...`) | Project owner | • `forecaster.py`<br>• `seed.mjs`<br>• Edge Function runtime | Root `.env` (laptop only)<br>Supabase runtime | Secret Master Key (RLS bypass) |
| `DEVICE_API_KEY` | 32-byte crypto hex (64 chars) | `npm run setup` | • ESP32 firmware (`x-api-key`)<br>• `scan` Edge Function<br>• `test-api.mjs` | Root `.env`<br>`circuit_project/config.h`<br>Supabase Function Secret | Shared App Secret |
| `REGISTER_API_KEY` | 32-byte crypto hex (64 chars) | `npm run setup` | • Replay script (`x-api-key`)<br>• `register-parcel` Edge Function<br>• `test-api.mjs` | Root `.env`<br>Supabase Function Secret | Shared App Secret |
| `UNITS_PER_BOX` | Positive integer (default: `40`) | `npm run setup` (D3 default) | • `scan` Edge Function<br>• `forecaster.py` | Root `.env`<br>Optional Function Secret | Non-secret Config |

---

## Detailed Component Requirements

### 1. Owner Web App (`web/`)
- **Location:** The web app lives in its own dedicated subfolder [`web/`](file:///c:/Users/Vibhaas/cloud/web).
- **Isolation:** The web app's HTTP document root is strictly `web/`. It **never** reads or accesses the root `.env` file, ensuring server-side secrets can never be exposed or served over HTTP.
- **Allowed Keys:** Only `SUPABASE_URL` and `SUPABASE_ANON_KEY` / `SUPABASE_PUBLISHABLE_KEY`.

### 2. ESP32 Station Firmware (`circuit_project/`)
- **Location:** Uses git-ignored `circuit_project/config.h` (copied from `config.example.h`).
- **Allowed Keys:** `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `DEVICE_API_KEY`, `DEVICE_ID`.
- **Forbidden:** Never receives the service role / secret key.

### 3. Edge Functions (`supabase/functions/`)
- Edge Functions run in the Supabase Deno cloud runtime.
- **Built-in Secrets:** Supabase automatically injects `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SECRET_KEYS` (or legacy `SUPABASE_SERVICE_ROLE_KEY`).
- **Custom Secrets Required:**
  `DEVICE_API_KEY` and `REGISTER_API_KEY` must be configured as function secrets:
  ```bash
  supabase secrets set DEVICE_API_KEY="<from .env>" REGISTER_API_KEY="<from .env>"
  ```
- **`UNITS_PER_BOX` Handling:**
  `supabase/functions/scan/index.ts` defaults `UNITS_PER_BOX` to `40`. You only need to set it as a function secret if overriding the default 40 units/box scale.

### 4. Forecasting Loader (`demand-forecasting-uq/`)
- Automatically parses `.env` from the repository root when executed.
- Requires `SUPABASE_URL` and `SUPABASE_SECRET_KEY` (or `SUPABASE_SERVICE_ROLE_KEY`) to upload forecast quantiles.
- Pre-checks that all `product_id` records exist in the database before uploading to prevent foreign key errors.

---

## Key Format Compatibility

All scripts and Edge Functions support both modern opaque Supabase keys and legacy JWT keys:

| Key Type | Modern Format | Legacy Format | HTTP Header Used |
|---|---|---|---|
| Publishable / Anon | `sb_publishable_...` | `eyJ...` (JWT) | `apikey: <key>` *(never Bearer)* |
| Secret / Service Role | `sb_secret_...` | `eyJ...` (JWT) | `apikey: <key>` *(never Bearer)* |
