# STATUS (living log)

Handover from Hermes (usage limit ended) to Antigravity. Everything marked UNVERIFIED must be checked before it is relied on.

| Item | State | Notes |
|---|---|---|
| Shared brief (old Prompt 0) | Replaced by AGENTS.md | |
| Prompt 1: Supabase backend | PARTIAL | Tables pushed to the Supabase project (per owner). Seeded products: UNVERIFIED. Edge Functions (health, register-parcel, scan) deployed: UNVERIFIED. Backend test script passing: UNVERIFIED. |
| Prompt 2: forecaster | Code DONE | Per Hermes report: 4 unit tests pass, dry run gives 56 rows (4 products x 14 days), p10<=p50<=p90, nonnegative, runtime 0.55 s on Python 3.14.5 (numpy 2.5.4, pandas 3.1.0, LightGBM 4.7.0). products.json said to match the seed (owner should compare product_id values). |
| Forecast upload to Supabase | PENDING | Owner runs it in their own terminal: python main.py --horizon 14 with SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY set in that session. Expect 56 rows, still 56 after a second run. Not confirmed yet. |
| Circuit inspection, ESP32 firmware, owner app, Fusion replay script, sell-date logic, integration check | NOT STARTED | |
| Git repository at root | NOT CONFIRMED | Forecaster folder has a nested .git. Root repo, .gitignore and secret scan still to do. |
| Credential exposure | OPEN | circuit_project sketch had hard-coded Wi-Fi and weather API credentials. Owner was told to rotate them; rotation NOT CONFIRMED. |
| PRD and TRD copies | CHECK | Folder should hold PRD v2 (Supabase, not AWS) and TRD v1. Older PRD v1 mentions AWS and is stale. |

## Open decisions (defaults in AGENTS.md apply until changed)
Arrival trigger (push button vs IR sensor; circuit shows a button, no IR), product type source, units per box, ESP32 HTTPS approach, sell-date method confirmation, app hosting.

## Log
(Add dated entries below, newest last.)


### 2026-10-24: Handover verification and git repo initialization
- Verified forecaster: 4 unit tests pass, 56 rows on dry run, product IDs match seed.
- Verified Supabase migrations and Edge Functions match TRD. Owner confirmed live Supabase project.
- Removed nested .git in demand-forecasting-uq.
- Initialized root git repo on main branch, configured user vibhaas, comprehensive .gitignore added.
- Added project README.md documenting architecture, simulation labels, secrets policy, and run commands.
