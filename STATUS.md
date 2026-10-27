# STATUS (living log)

| Item | State | Notes |
|---|---|---|
| Shared brief (old Prompt 0) | Replaced by AGENTS.md | |
| Prompt 1: Supabase backend | DONE | Verified by owner (tables applied, seed loaded, functions deployed, test script run). |
| Prompt 2: forecaster | DONE | Verified by owner, forecast upload reported working. 4 unit tests pass, dry run gives 56 rows. |
| ESP32 station firmware | DONE | Implemented and compiled (Arduino CLI for ESP32 target). Pins changed to match physical wiring. Untested on real hardware. |
| Owner web app | DONE | Projector-optimized static web app (Today, Stock, Live feed) with Supabase Realtime. Uses read-only public anon key. |
| Fusion integration / replay | IN PROGRESS | Replay script done; Fusion hook proposed (awaiting approval, lower priority). |
| Sell-date logic | DONE | TRD Section 6 FIFO depletion with p50 median, p10/p90 uncertainty range, and expiry risk. Recalculates on every scan. |
| Integration check | NOT STARTED | End-to-end rehearsal. |
| Git repository at root | DONE | Initialized on main branch, nested forecaster .git removed, pushed to GitHub: yes. |
| Credential exposure | OPEN | circuit_project sketch cleaned; owner advised to rotate any previously exposed credentials. |
| PRD and TRD copies | VERIFIED | PRD v2 (Supabase) and TRD v1 present in root. |

| Arrival trigger | RESOLVED | IR obstacle sensor on GPIO 27 (D0). Configurable active level and pull mode; clear-to-rearm logic. Buzzer removed (GPIO 33 free). |
| Product type source | UNCONFIRMED | Cloud returns product; fallback table in firmware. |
| Units per box | UNCONFIRMED | D3 default: 40 units/box. |
| ESP32 HTTPS approach | CONFIGURED | D4 insecure TLS flag enabled for demo. |
| Sell-date method | RESOLVED | TRD section 6 method verified with hand-computed test suite (6/6 pass). |
| Owner app hosting | RESOLVED | D6 plain static web app in `web/`; zero-dependency local run via Python venv `http.server` or any static host. |

## Log
(Add dated entries below, newest last.)

### 2026-10-24: Handover verification and git repo initialization
- Verified forecaster: 4 unit tests pass, 56 rows on dry run, product IDs match seed.
- Verified Supabase migrations and Edge Functions match TRD. Owner confirmed live Supabase project.
- Removed nested .git in demand-forecasting-uq.
- Initialized root git repo on main branch, configured user vibhaas, comprehensive .gitignore added.
- Added project README.md documenting architecture, simulation labels, secrets policy, and run commands.

### 2026-10-24: ESP32 station firmware implementation
- Implemented robust state machine in circuit_project/sketch.ino: Idle, Trigger (debounced), RFID read (3s timeout), Cloud scan request (HTTPS POST), OLED/LED/Buzzer feedback, and Cooldown.
- Added 10 kg servo sorting rule with non-blocking error handling and ENABLE_SERVO feature toggle.
- Added offline fallback: on-device table of known tag UIDs, bounded ring-buffer event queue, and automatic background replay when Wi-Fi is restored.
- Created circuit_project/config.example.h with placeholders; untracked config.h for local settings.
- Verified sketch compilation using Arduino CLI for ESP32 target (exit code 0).
- Ran full state machine & API golden path walkthrough simulation (7 tests pass, 100% success).

### 2026-10-24: ESP32 firmware pin assignments updated to physical wiring
- Updated pin definitions in circuit_project/config.example.h, config.h, and sketch.ino to match physical wiring.
- Explicit bus setup: I2C on SDA 16 / SCL 22; SPI on SCK 18, MISO 19, MOSI 23, SS 5; RST on 21. Other peripherals unchanged (Trigger 27, Servo 25, Green 13, Yellow 14, Red 26, Buzzer 33).
- Added docs/wiring.md with complete peripheral table, strapping/PSRAM hardware notes, and bring-up checklist. Updated README.md.
- Recompiled with Arduino CLI (success, exit 0). Walkthrough tests passed (7/7).
- Confirmed config.h remains git-ignored and no secrets staged.

### 2026-10-24: IR obstacle sensor arrival trigger & buzzer removal
- Configured arrival trigger on GPIO 27 for IR obstacle sensor module with clear-to-rearm logic (prevents multi-triggering while a parcel rests in front of the sensor).
- Added `TRIGGER_ACTIVE_LEVEL` (default `LOW`), `TRIGGER_PULL_MODE` (default `INPUT`), and `TRIGGER_SELF_TEST` serial polarity check mode to `config.example.h` and `config.h`. Optional button isolated behind `ENABLE_BUTTON`.
- Completely removed piezo buzzer (`PIN_BUZZER 33`, `pinMode`, `beepShort`, `beepError`, and all audio call sites). GPIO 33 is now free and unassigned.
- Replaced audio cues with non-blocking `millis()`-based LED patterns (`startLedPattern()` / `updateLedPattern()`): Green solid 2s (success), Red 3x quick blink (unknown tag), Yellow 2x quick blink (duplicate), Red solid 2s (timeout/error), Yellow slow blink (offline fallback).
- Updated `docs/wiring.md` and `README.md` with new trigger specs, bring-up polarity check steps, and LED pattern table.
- Verified compilation with Arduino CLI (`esp32:esp32:esp32`, flash 84%, RAM 15%, exit 0).
- Extended simulation test suite in scratch to 8 tests (all passed, 100% success).

### 2026-10-24: Owner web app implementation (TRD Section 10 / Step 5)
- Built hosting-agnostic static web application in `web/` using HTML5, modern CSS, and JavaScript with Supabase Realtime client.
- Uses only the read-only public anon key (`SUPABASE_ANON_KEY`); database RLS policies enforce read-only SELECT access.
- Implemented Screen 1 (Today): per-product forecast median (p50) with p10–p90 uncertainty band and multi-day forecast timeline compared against arrival counts (units & batches) for today.
- Implemented Screen 2 (Stock): warehouse batches with product info, quantities, arrival timestamps, simulated expiry dates, estimated sell dates, and expiry risk badges.
- Implemented Screen 3 (Live Feed): realtime WebSocket subscription to `arrival_events` updating live without reload; distinct badges and styling for `ok`, `unknown_tag`, and `duplicate` events.
- Added Projector Mode (all three screens in command-center view), connection status indicator (`LIVE`, `CONNECTING`, `OFFLINE`) with auto-reconnection loop, and browser config modal.
- Labeled all simulated values prominently (weights, expiry dates, demand forecasts).
- Verified local serving via project Python venv (`python -m http.server 8000 --directory web`) and passed logic unit tests (100% success).

### 2026-10-25: Developer setup tooling & environment automation
- Added `scripts/setup-env.mjs` and `npm run setup`: creates `.env` from template, generates 32-byte crypto keys for `DEVICE_API_KEY` and `REGISTER_API_KEY` without overwriting existing settings, sets default `UNITS_PER_BOX=40`, prompts with masked input for URL and keys, enforces `.gitignore`, and outputs exact Supabase CLI command for function secrets without printing secret values. Added `--rotate-app-keys` with confirmation.
- Added shared validation in `scripts/env-helper.mjs`: loads root `.env` automatically via Node 24 built-in `process.loadEnvFile()`, reports all missing/malformed variables in one consolidated block with exact fixes before any network calls, and supports both modern (`sb_publishable_` / `sb_secret_`) and legacy keys.
- Fixed key headers across all scripts and loader: removed `Authorization: Bearer` headers (new keys are not JWTs and PostgREST expects `apikey` only).
- Updated Edge Function `createAdminClient` in `supabase/functions/_shared/http.ts` to support modern `SUPABASE_SECRET_KEYS` (JSON) and `SUPABASE_SECRET_KEY` alongside `SUPABASE_SERVICE_ROLE_KEY`.
- Added `scripts/seed.mjs` (`npm run seed`): idempotent product upsert through PostgREST REST API using `products.json` as single source of truth.
- Added `scripts/reset.mjs` (`npm run reset`): replaces `reset-demo.sh` with Node implementation that refuses to execute without explicit `--confirm` flag.
- Added pre-check in `forecaster.py` to verify all `product_id`s exist in the database before uploading forecasts, outputting clear guidance rather than opaque foreign key errors. Updated forecaster README.
- Created `docs/env-vars.md` cataloging every variable, consumer, and security tier.
- Verified all tooling with dummy values in isolated temporary directory (100% pass) and confirmed forecaster unit tests pass (4/4).

### 2026-10-25: Item registration — replay script and Fusion proposal
- Created `scripts/demo-catalog.json`: 4 seeded products × 2 placeholder tag UIDs each (8 tags total), weights match seed exactly, all marked SIMULATED.
- Created `scripts/replay-register.mjs` with `--all`, `--product <name>`, and `--dry-run` options. Uses `env-helper.mjs` for env loading/validation. Calls `register-parcel` Edge Function with `{tag_uid, product_id}` payload. Reports success/failure visibly per tag.
- Added `npm run register` script.
- Dry run verified: 8 payloads printed correctly (exit 0). Single-product filter verified.
- Live run BLOCKED: `SUPABASE_URL` in `.env` points to the Supabase dashboard URL instead of the API endpoint (`https://<ref>.supabase.co`). Script code is correct; env value needs fixing by owner.
- Inspected Fusion scripts (`Animations.py` and `Mechanism verifier.py`). Proposed minimal hook addition — awaiting owner approval before modifying any Fusion file.

### 2026-10-25: SUPABASE_URL validation fix, tag UID normalization, and registration tooling follow-up
- Updated `scripts/env-helper.mjs` and `scripts/setup-env.mjs`: strict validation requires `https://<project-ref>.supabase.co`. When a dashboard URL (`https://supabase.com/dashboard/project/<ref>/...`) is entered or present, it extracts the project ref, offers/auto-converts to the correct API endpoint, and provides the exact fix in error messages. Tested with dummy values in temporary directory.
- Added backend tag UID normalization in `supabase/functions/_shared/http.ts`, `register-parcel/index.ts`, and `scan/index.ts`: normalizes UIDs by trimming whitespace, stripping byte delimiters (colons, spaces, hyphens if hex-formatted), and converting to uppercase.
- Added `--tag <UID>` override option to `scripts/replay-register.mjs` for quick re-registration of physical tags to different products between scans, maintaining dry-run support.
- Added 'Getting the real tag UIDs' guide to `README.md` documenting serial monitor readout steps at 115200 baud and where to populate physical UIDs (`demo-catalog.json` and `OFFLINE_CATALOG[]`).
- Fusion live hook status: remains proposed and unapplied, and is marked lower priority per instructions.
- All registration tests conducted via dry runs and isolated dummy environments without live cloud operations.

### 2026-10-25: Sell-date estimation implementation (TRD Section 6)
- Implemented FIFO sell-date depletion engine in `scripts/sell-date-calculator.mjs`: sorts product batches oldest first (`arrived_at` ASC, `id` ASC), walks forward through forecast days, depletes daily p50 demand from oldest batch first, marks outlasting batches as `'beyond_horizon'`, flags `expiry_risk = true` when sell date > simulated expiry date, computes optional p90 earliest and p10 latest dates, and marks missing forecasts gracefully as `'unknown'` without crashing.
- Created database migration `supabase/migrations/20261025000200_sell_date_estimation.sql`:
  - Added `status`, `range_earliest_date`, and `range_latest_date` columns to `public.sell_estimates`.
  - Added `public.recalculate_sell_estimates(p_product_id uuid)` database procedure.
  - Updated `public.process_scan()` to trigger `recalculate_sell_estimates(v_product.id)` on every scan arrival event and return `estimated_sell_date` and `expiry_risk` in response JSON.
- Updated `supabase/functions/scan/index.ts` to forward `estimated_sell_date` and `expiry_risk` from `process_scan`.
- Updated `web/js/app.js` to select `status`, `range_earliest_date`, `range_latest_date` and render estimated sell dates, uncertainty ranges, and 'Beyond horizon' / 'Unknown (no forecast)' badges.
- Created test suite `scripts/test-sell-date.mjs` (`npm run test:sell-date`): 6/6 tests passing covering 1 batch in 3 days, 2 batches FIFO order, outlasting horizon, expiry risk true vs false, no forecast rows, and uncertainty ranges.
- Updated `docs/backend-api.md` with sell-date and expiry risk documentation.
- Confirmed method matches TRD section 6 and AGENTS.md D3 demo scale (40 units/box sells in ~2 to 6 days).
- Note: Fusion live hook remains proposed and unapplied (lower priority).

### 2026-10-25: ESP32 hardware alignment & tag-first event order adoption
- Adopted hardware-proven values from teammate demo into `circuit_project/sketch.ino`:
  - Display: Switched from Adafruit SSD1306/GFX to U8g2 SH1106 hardware-I2C driver (`U8G2_SH1106_128X64_NONAME_F_HW_I2C`) matching the physical 1.3-inch OLED display. Removed Adafruit dependencies from `libraries.txt`.
  - Servo: Configured `setPeriodHertz(50)` with `500` to `2400` µs pulse range. Defined configurable angles: LEFT 30°, CENTER 90°, RIGHT 150°. Replaced blocking delays with non-blocking `millis()` timing (`SERVO_HOLD_MS 1500`) so Wi-Fi and sensor handling never block.
  - New Flow (Tag first, then IR):
    1. Idle: OLED 'Scan RFID tag', yellow LED ready indicator. IR sensor events are ignored.
    2. Tag Read: Reads UID, displays 'TAG <last 4 hex>' and 'Place parcel', yellow LED. Holds UID in memory without calling cloud yet.
    3. Waiting for Parcel: Waits up to `PARCEL_WAIT_TIMEOUT_MS` (15 s) for IR arrival confirmation. Enforces clear-to-rearm: a parcel resting in front of the sensor when the tag is read does not count until it clears and re-enters. Second tag taps while waiting are ignored. On timeout, displays 'No parcel detected', logs nothing in cloud, and returns to idle.
    4. IR Tripped: Makes exactly ONE cloud scan call with held UID. Extracts `lane` from cloud response when present (falling back to 10 kg rule). Drives servo and LEDs per lane.
    5. Cooldown, then idle.
  - LED Mode: Configurable via `CONFIG_LED_MODE` in `config.example.h` (`LED_MODE_LANE` vs `LED_MODE_STATUS`). In LANE mode: Green solid = LEFT lane (<= 10 kg), Red solid = RIGHT lane (> 10 kg), Yellow solid = idle/tag held/waiting/offline. Errors/timeouts/duplicates/unknowns trigger a distinctive all-three-LEDs synchronous triple-flash pattern.
- Updated `circuit_project/config.example.h`: confirmed all physical pins match teammate's hardware (SDA 16, SCL 22, RFID SS 5, RST 21, SCK 18, MISO 19, MOSI 23, IR 27, Servo 25, Green 13, Yellow 14, Red 26). Added `PARCEL_WAIT_TIMEOUT_MS`, `CONFIG_LED_MODE`, and servo pulse/angle constants.
- Updated `README.md` and `docs/wiring.md` documenting SH1106 U8g2 display, 13.56MHz RFID read range (~1-3 cm proximity requirement), LANE and STATUS LED modes, and the updated tag-first bring-up checklist.
- Verified compilation with Arduino CLI (`esp32:esp32:esp32`, Flash 84%, RAM 15%, exit 0).
- Updated walkthrough test suite (`scratch/simulate_esp32_golden_path.py`): 10/10 tests passing (100% success) covering IR ignored in idle, tag then IR exactly one scan call, parcel timeout with no cloud call, second tag ignored, parcel resting at sensor blocked until clear/re-enter, heavy right lane / light left lane routing, unknown tags, duplicate cooldown, and offline queue flush.
- Untested note: Physical bench testing on real ESP32 silicon was NOT performed in this session; logic verified via unit tests and Arduino CLI compilation.

### 2026-10-25: PostgREST Authorization Bearer fix for seed script and forecaster
- Fixed HTTP 404/permission error during `npm run seed`: added `Authorization: Bearer ${secretKey}` header alongside `apikey` in `scripts/seed.mjs` and `demand-forecasting-uq/forecaster.py`.
- Without `Authorization: Bearer`, PostgREST defaulted requests to the unauthenticated `anon` role, which has only `SELECT` privileges and cannot `INSERT` into `public.products` or `public.forecasts`.
- Re-ran `scripts/seed.mjs`: successfully seeded all 4 demo products (Chips, Green Tea, Pasta, Coffee) into the database (exit 0).
- Ran `demand-forecasting-uq/main.py --horizon 14`: successfully upserted 56 forecast rows across 14 days to Supabase in 1.66s. All tests passing.

### 2026-10-25: Supabase Edge Functions deployment & live hardware tag registration
- Fixed `HTTP 404: Requested function was not found` during ESP32 scan call:
  - Deployed `scan`, `register-parcel`, and `health` Edge Functions to Supabase via `supabase functions deploy --no-verify-jwt`.
  - Set function secrets (`DEVICE_API_KEY`, `REGISTER_API_KEY`, `UNITS_PER_BOX`) via `supabase secrets set --env-file .env`.
- Verified live Edge Function contract with `node scripts/test-api.mjs`: all 6 integration tests passing (`PASS health`, `PASS key scope`, `PASS register then scan`, `PASS duplicate scan`, `PASS unknown tag`, `PASS read-only public access`).
- Pre-registered user's physical RFID tag (`0AEFF505`) as a pending parcel for **Chips** (2.0 kg simulated) in `scripts/demo-catalog.json` and executed live registration via `scripts/replay-register.mjs`.
- The ESP32 scan station is now fully unblocked to scan physical tag `0AEFF505` with live cloud confirmation.

### 2026-10-25: Owner App Unified Frontend & Teammate Design Merge
- Backed up previous web application to `web_backup_before_team_front/`.
- Performed read-only audit of `team_front/` React app: React 19 + Vite, 100% client-side mock data in `src/data/mock.js`, zero Supabase dependencies, zero environment variables or secrets.
- Converted teammate's frontend layout, visual design tokens (`--bg`, `--surface`, `--blue`, `--gold`, `--risk`, `--ok`), Bricolage Grotesque / Instrument Sans typography, and components into a high-performance, dependency-free static web application living directly in `web/`.
- Preserved all required features from both sides:
  - **Today View**: Animated headline with arrival progress, real-time conveyor belt block slots with live arrival drive motion and pop animations, stat cards (Went Left, Went Right, Expiry Risk with shake animation), Urgent Stock cards alerting on batches at risk of expiring before selling, product-level demand breakdown with p50 forecast & p10–p90 bands, 4-day horizon timeline, and local sample simulation button.
  - **Parcels / Stock View**: Search box (product name, category, tag UID), filter chips (`All`, `Left`, `Right`, `At risk`), dual view switch between Card View and Full Operations Table, handling all sell estimate states (`ok`, `beyond_horizon`, `unknown`, `pending`).
  - **Forecast View**: Teammate's 7-Day bar chart with SVG trend line across bar tops, busiest day in gold, today in blue, tooltips, connected to aggregated daily demand from `public.forecasts`.
  - **Live Feed View**: Real-time arrival event stream (OK in green, Unknown Tag in red, Duplicate in gold) with relative timestamps and flash animation.
  - **Projector Mode**: Side-by-side presentation layout for live hackathon judge reviews.
  - **Header & Navigation**: Desktop header with sliding pill indicator, mobile bottom tab bar, live connection status indicator (`● LIVE (REALTIME)`, `CONNECTING...`, `OFFLINE`), refresh button, settings modal for URL and anon key (`localStorage` persistence), and light/dark theme toggle.
- Enforced TRD Rule 6: visible `SIMULATED` labels on all parcel weights, simulated expiry dates, and demand forecasts.
- Verified test suite: 6/6 unit tests passing in `web/tests/app-logic.test.mjs` verifying lane classification, expiry risk detection, search/filter algorithms, and null-safety.
- Local run command remains valid: `& "demand-forecasting-uq\.venv\Scripts\python.exe" -m http.server 8000 --directory web`.
- Restored complete Landing Page & Insights front door (`panel-home`):
  - Sticky `LandingNav` with smooth scrolling links (`#mini-belt`, `#how-it-works`, `#why-us`, `#who-its-for`, `#team`, `#faq`) and responsive mobile drawer.
  - Interactive `Hero` section with cycling live feed typewriter terminal and direct navigation quick cards.
  - Capability chips infinite marquee `Strip`.
  - Live 2D physics canvas `MiniBelt` with boxes dropping, infrared laser gate flash detection, weight routing to Left (<10 kg) and Right (≥10 kg) bins, live counters, and user drop interaction.
  - `WhyUs` comparison table (6 manual vs smart automation topics).
  - `WhoItsFor` audience tabs (Small shops, Distributors, Food and grocery, Pharmacies) with 3 benefit cards each.
- Updated Team Section in Landing Page:
  - Replaced placeholder technology chips with dedicated individual member cards for Team Hyxon:
    - Jwallin (Mechanical Lead + General Manager)
    - Aarav (Electronics Lead + Data Curator)
    - Vibhaas (Software Lead)
    - Suryansh Singh (Frontend Lead + Analysis Manager)
    - Divyansh (Project Design + Status Manager)
  - Styled according to inspiration mockup: ambient background glow, top social pills (Github, LinkedIn, Instagram), "Meet the Team" headline ("The minds behind the madness."), frosted glass rounded cards with circular avatars, clean role titles, and bottom GitHub & LinkedIn social buttons.
  - Added cache-busting `?v=20261027_3` across stylesheets, synchronized critical team styles across HTML `<head>` and `styles.css`, and enforced explicit 104px circular constraints on avatar images to prevent raw unstyled image blowout under browser stylesheet caching.
- Preset Physical RFID Demo Tags:
  - Preset Tag 1 (`0AEFF505`, Chips 2.0 kg SIMULATED) in `scripts/demo-catalog.json`.
  - Added `scripts/register-demo-tags.mjs` (`npm run register:demo` / `npm run register:tags`) to register demo tags in one command without manual CLI arguments.
  - Added hands-free daemon `scripts/auto-rearm.mjs` (`npm run demo:loop`) that listens to Supabase Realtime for arrival scans and automatically re-arms tags after 3 seconds for continuous demonstrations.
- Resolved Dual-Navbar Display Conflict:
  - Landing Page (`home` tab): Shows ONLY the teammate's landing navbar (`Product`, `How it works`, `Why us`, `Who it's for`, `Dashboard`, `FAQ`, `Team`, `Open dashboard`). Top operational header is hidden.
  - Operational Dashboard (`today`, `parcels`, `forecast`, `feed`, `projector` tabs): Shows the full operational navbar (`Smart Warehouse` brand, `Home`, `Today`, `Stock & Parcels`, `Forecast`, `Live Feed`, `Projector`, `← Home` return button, `● LIVE (REALTIME)` status dot, `↻` refresh, `⚙` settings modal, and `🌙` theme toggle). Landing navbar is cleanly hidden.
  - Fixed display persistence by driving visibility via CSS attribute `body[data-active-tab="..."]`, removing fragile inline styles, adding `← Home` action button, and updating script reference with cache-buster `js/app.js?v=20261027_2` to prevent stale browser caches.
  - Verified in headless Edge for both `#home` (dashboard header hidden) and `#today` (dashboard header visible). All 6 unit tests passing.
- Team Section in Landing Page:
  - Replaced random technology chips with dedicated individual member cards for Team Hyxon:
    - Jwallin (Mechanical Lead + General Manager)
    - Aarav (Electronics Lead + Data Curator)
    - Vibhaas (Software Lead)
    - Suryansh Singh (Frontend Lead + Analysis Manager)
    - Divyansh (Project Design + Status Manager)
  - Styled according to inspiration mockup: ambient background glow, top social pills (Github, LinkedIn, Instagram), "Meet the Team" headline ("The minds behind the madness."), frosted glass rounded cards with circular avatars, clean role titles, and bottom GitHub & LinkedIn social buttons.
  - Added cache-busting `?v=20261027_3` across stylesheets, synchronized critical team styles across HTML `<head>` and `styles.css`, and enforced explicit 104px circular constraints on avatar images to prevent raw unstyled image blowout under browser stylesheet caching.

### 2026-10-27: Minimal Glassmorphism & Visual Refinement
- Redesigned Top Simulation Notice (TRD Rule 6):
  - Replaced solid yellow/amber edge-to-edge banner with a subtle translucent chip (`rgba(245, 158, 11, 0.07)` background, `backdrop-filter: blur(14px)`, `border-bottom: 1px solid rgba(245, 158, 11, 0.16)`, rounded chip badge) keeping 100% compliance without looking like an emergency warning.
- Floating Glass Navbar (Expanded & Relaxed):
  - Expanded length from tight 980px to a generous 1260px (`max-width: 1260px`), softened border-radius to 18px, increased link spacing (`gap: 28px`), and relaxed padding for a more spacious, natural desktop feel.
- Bumped stylesheet cache buster to `?v=20261027_5`. All 6 unit tests passing.

### 2026-10-27: Supabase Auto-Popup Removal & Deployed Public Config
- Removed automatic `openSettingsModal()` invocation on page load from `initSupabase()` in `web/js/app.js`.
  - The modal will now only open when the user intentionally clicks the ⚙️ Settings button in the dashboard.
  - If no credentials exist, the application gracefully operates in demo mode without blocking the screen with popups.
- Added `web/config.public.js` and generator script `scripts/generate-public-config.mjs` (`npm run build:config`):
  - Pre-bundles read-only public parameters (`SUPABASE_URL` and `SUPABASE_ANON_KEY`) for deployed static hosts so the live inventory and Realtime stream connect automatically out-of-the-box for all visitors.
  - Complies with Rule 1 (never commit secret keys) and Rule 5 (web app holds public read-only key only).
- Updated `web/index.html` to load `config.public.js` with fallback, and bumped application script version to `?v=20261027_3`. All 6 unit tests passing.


