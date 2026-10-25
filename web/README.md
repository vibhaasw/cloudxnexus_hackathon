# Smart Warehouse IoT — Unified Owner Web App

A lightweight, modern, projector-optimized static web dashboard for warehouse operations. It blends the teammate's frontend design tokens (Bricolage Grotesque typography, Instrument Sans, gliding pill navigation, dark/light theme, conveyor belt simulation, and count-up animations) with our Supabase Realtime data layer (Postgres + Edge Functions + Realtime).

> [!WARNING]
> **SIMULATED VALUES NOTICE (TRD Rule 6):**
> Parcel weights, expiry dates, demand data, and conveyor operations are **SIMULATED** for hackathon demonstration. Expiry dates are demo values and must **never** be presented or relied upon as food-safety advice.

---

## Features & Screens

1. **Today:**
   - Animated headline: `X of Y parcels have arrived today`, with remaining count based on aggregate AI forecasts.
   - **Conveyor Belt Track:** Visual representation of today's parcels colored by sorting lane (Blue for Left `<10 kg`, Gold for Right `≥10 kg`, Grey for pending expected). Features live arrival drive motion and block pop animations.
   - **Stat Cards:** Real-time counts for Left lane, Right lane, and batches at risk of expiring before selling (with attention shake).
   - **Needs your attention:** Urgent stock batch cards alerting if simulated expiry precedes projected sell date.
   - **Product Breakdown:** Catalog products showing today's arrived count (`units` & `batches`) compared with forecast median (`p50`) and uncertainty band (`p10`–`p90`) marked `(SIMULATED DEMAND)`, with a 4-day upcoming horizon timeline.
   - **How sorting works & Comparison guide:** Overview of hardware-backed RFID/IR verification vs typical inventory websites.
   - **Simulate parcel demo button:** Labeled `SAMPLE DATA (Local Demo)` to demonstrate belt animations and toast alerts without modifying cloud data.

2. **Stock & Parcels:**
   - Real-time search box filterable by product name, category, or RFID tag UID.
   - Filter chips: `All`, `Left Lane (<10 kg)`, `Right Lane (≥10 kg)`, and `At Risk`.
   - Dual view toggle: Teammate's **Card View** (with lane tags, risk badges, weights, simulated expiry dates, estimated sell dates) and **Full Operations Table** view.

3. **Forecast:**
   - 7-Day interactive bar chart with SVG trend line across bar tops.
   - Busiest day highlighted in gold, today highlighted in blue, with hover tooltips.
   - Aggregated directly from `public.forecasts` daily totals across catalog products.

4. **Live Feed:**
   - Realtime scan events from ESP32 stations via Supabase Realtime channel.
   - Distinct badges and color themes: `OK / ARRIVED` (Green), `UNKNOWN TAG` (Red), `DUPLICATE` (Amber cooldown).
   - Flashes on incoming arrival events with relative timestamps.

5. **Projector Mode:**
   - High-contrast, large-type multi-panel presentation layout ideal for conference rooms and live demo review.

6. **Connection Indicator & Settings:**
   - Header connection indicator showing `LIVE (REALTIME)`, `CONNECTING...`, or `OFFLINE` with automatic retry logic.
   - In-app **⚙ Config** modal to set `SUPABASE_URL` and `SUPABASE_ANON_KEY` stored in `localStorage`.
   - Theme toggle (☀️ / 🌙) switching between light and dark modes.

---

## Configuration

The web app requires two read-only parameters:
1. `SUPABASE_URL` (e.g. `https://xyzcompany.supabase.co`)
2. `SUPABASE_ANON_KEY` (public read-only anonymous key)

> [!CAUTION]
> **Security Policy (Hard Rules 1 & 5):**
> NEVER provide the `service_role` key to the web app. The web app uses only the public anon key. The database RLS policies enforce read-only SELECT access.

### Configuration Methods (in order of priority):

1. **Option A: `config.js` file (Recommended for local dev):**
   Copy `web/config.example.js` to `web/config.js` (this file is `.gitignore`d):
   ```javascript
   // web/config.js
   window.APP_CONFIG = {
     SUPABASE_URL: "https://your-project.supabase.co",
     SUPABASE_ANON_KEY: "your-anon-public-key"
   };
   ```

2. **Option B: In-App Config Modal (Recommended for quick demo):**
   Open the web app in your browser, click the **⚙ Config** button in the header, enter your URL and Public Anon Key, and click **Save & Connect**. Credentials will be saved to your browser's `localStorage`.

3. **Option C: URL Query Parameters:**
   Append parameters to the URL:
   `http://localhost:8000/?supabase_url=https://xyz.supabase.co&supabase_anon_key=your_key`

---

## How to Run Locally

You can serve the `web/` directory using Python (no Node or npm required):

```powershell
# Using the project's Python venv:
& "c:\Users\Vibhaas\cloud\demand-forecasting-uq\.venv\Scripts\python.exe" -m http.server 8000 --directory web
```

Then open `http://localhost:8000` in any web browser.

---

## Testing

Run the fixture-based unit test suite:
```powershell
& "C:\Program Files\nodejs\node.exe" --test web/tests/app-logic.test.mjs
```
