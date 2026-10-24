# Smart Warehouse IoT

A 24-hour hackathon smart-warehouse system. An ESP32 scan station (RFID,
trigger input, OLED, LEDs, buzzer) confirms parcel arrivals. A Supabase
backend (Postgres, Edge Functions, Realtime) holds the authoritative
inventory. A forecaster writes per-product daily forecasts (p10, p50, p90).
An owner web app shows expected vs arrived, stock and estimated sell dates.

> **Simulated data:** The conveyor, weights, expiry dates and demand data are
> all simulated. They are labeled as such wherever they appear in the UI, on
> the OLED and in API documentation. No expiry date in this project is real
> food-safety information.

## Folder map

| Folder | Contents |
|---|---|
| `demand-forecasting-uq/` | LightGBM quantile forecaster — per-product daily demand forecasts with uncertainty (p10, p50, p90). Originally from [jp11x/demand-forecasting-uq](https://github.com/jp11x/demand-forecasting-uq). |
| `supabase/` | Migration, seed, Edge Functions (`health`, `register-parcel`, `scan`) and config for the Supabase backend. |
| `circuit_project/` | Wokwi project for the ESP32 scan station (diagram, sketch, libraries). |
| `Fusion Project Files/` | Autodesk Fusion 360 conveyor generator script, animation script and model (`.f3d`). |
| `scripts/` | `test-api.mjs` (backend integration test), `reset-demo.sh` (local DB reset). |
| `docs/` | `backend-api.md` — API contract and usage guide. |

## Running each part

### Forecaster

```powershell
cd demand-forecasting-uq
.venv\Scripts\python.exe -m unittest discover -s tests -v   # unit tests
.venv\Scripts\python.exe main.py --dry-run                   # preview output
.venv\Scripts\python.exe main.py --horizon 14                # upload (needs env vars)
```

Requires `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` set in the shell for
the upload run. The venv contains pinned dependencies (see `requirements.txt`).

### Supabase backend

Apply migrations and seed locally:

```sh
supabase start
sh scripts/reset-demo.sh
supabase functions serve --env-file ./supabase/local-function-secrets
```

See `docs/backend-api.md` for the full API contract, authentication and
integration test instructions.

### Backend integration test

```sh
export SUPABASE_URL='<your-project-url>'
export SUPABASE_ANON_KEY='<public-key>'
export DEVICE_API_KEY='<device-key>'
export REGISTER_API_KEY='<register-key>'
node scripts/test-api.mjs
```

## Secrets policy

- `.env` files are git-ignored and must never be committed.
- `.env.example` lists required variable names without values.
- Three key tiers: **public** (anon key, read-only, used by the web app),
  **device** (`DEVICE_API_KEY`, scan-only, used by ESP32), **register**
  (`REGISTER_API_KEY`, parcel registration, used by replay script).
- The **service role key** is used only by the forecaster loader and Edge
  Function runtime. It never appears in client code, device firmware or the
  web app.
- Firmware config files (`config.h`, `secrets.h`, `config.local.*`) are
  git-ignored.
