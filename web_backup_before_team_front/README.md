# Smart Warehouse IoT — Owner Web App

A lightweight, projector-optimized, static web dashboard for warehouse operations. Uses **only the read-only public Supabase anon key** and Supabase Realtime WebSocket subscriptions.

> [!WARNING]
> **SIMULATED VALUES NOTICE (TRD Rule 6):**
> Parcel weights, expiry dates, demand data, and conveyor operations are **SIMULATED** for hackathon demonstration. Expiry dates are demo values and must **never** be presented or relied upon as food-safety advice.

---

## Features & Screens

1. **Screen 1: Today (Forecast vs Arrived):**
   - For each catalog product (Chips, Green Tea, Pasta, Coffee), displays today's arrived count (`units` and `batches`).
   - Compares against today's forecast median (`p50`) and uncertainty band (`p10` to `p90`) marked as `(SIMULATED DEMAND)`.
   - Multi-day forecast horizon timeline showing upcoming daily demand.

2. **Screen 2: Stock (Warehouse Batches & Expiry Risk):**
   - Displays all active inventory batches with Product, Tag UID, Quantity (units), Arrival Timestamp, and Simulated Expiry Date (`SIMULATED`).
   - Shows Estimated Sell Date and Expiry Risk status (`HIGH RISK` vs `On Track` vs `Pending Calc`).

3. **Screen 3: Live Feed (Realtime Scans):**
   - Realtime arrival events updating instantly via WebSocket without page reload.
   - Distinct badges and color themes:
     - `OK / ARRIVED` (Green)
     - `UNKNOWN TAG` (Red — unregistered tags logged for diagnostics)
     - `DUPLICATE` (Amber — cooldown protection; repeat scans within 10s ignored)
   - Filterable by event type.

4. **Projector Mode (All Screens):**
   - High-contrast, large-type layout optimized for conference room or stage projectors.
   - Realtime connection indicator showing `LIVE (Realtime Active)`, `CONNECTING...`, or `OFFLINE` with automatic retry logic.

---

## Configuration

The web app requires two read-only parameters:
1. `SUPABASE_URL` (e.g. `https://xyzcompany.supabase.co` or `http://127.0.0.1:54321`)
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

## Static Hosting (Hosting-Agnostic, TRD D6)

Because the app is composed purely of standard static HTML5, CSS3, and JavaScript:
- It can be deployed to any static host: GitHub Pages, Cloudflare Pages, Netlify, Vercel, AWS S3, or Supabase Storage.
- No Node build step, compilation, or server-side runtime is needed.
