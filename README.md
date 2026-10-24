# Smart Warehouse IoT

A 24-hour hackathon smart-warehouse system. An ESP32 scan station (RFID,
trigger input, OLED, LEDs) confirms parcel arrivals. A Supabase
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
| `web/` | Owner web dashboard (static HTML/CSS/JS with Supabase Realtime). |
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

### Owner Web App

Serve the static web app locally using the project Python venv (no Node or npm required):

```powershell
& "c:\Users\Vibhaas\cloud\demand-forecasting-uq\.venv\Scripts\python.exe" -m http.server 8000 --directory web
```

Then open `http://localhost:8000` in your browser. Configure `web/config.js` or enter the read-only public anon key via the on-screen **⚙ Config** modal. See [web/README.md](web/README.md) for full details.

### ESP32 Scan Station Firmware

#### 1. Physical Wiring Reference (see [docs/wiring.md](docs/wiring.md))

| Component | ESP32 Pin(s) | Description |
|---|---|---|
| OLED SSD1306 (I2C) | GPIO 16 (SDA), GPIO 22 (SCL), 3.3V, GND | 128x64 scan feedback display (addr `0x3C`) |
| RFID MFRC522 (SPI) | GPIO 5 (SS), 18 (SCK), 23 (MOSI), 19 (MISO), 21 (RST), 3.3V, GND | MFRC522 tag reader (3.3V only) |
| Arrival Trigger | GPIO 27, GND | IR obstacle sensor D0 output (active level configurable; see `docs/wiring.md`) |
| Sorting Servo | GPIO 25 (PWM), 5V, GND | Visual indicator arm (left 30° / right 150°) |
| Green LED | GPIO 13 (via 330Ω), GND | Success indicator |
| Yellow LED | GPIO 14 (via 330Ω), GND | Idle / busy / offline indicator |
| Red LED | GPIO 26 (via 330Ω), GND | Error / unknown tag indicator |

#### 2. Configuration

Create `circuit_project/config.h` from `circuit_project/config.example.h` (this file is git-ignored and never committed):

```c
// circuit_project/config.h
#define WIFI_SSID_1       "Venue_WiFi_SSID"
#define WIFI_PASS_1       "Venue_WiFi_Password"
#define WIFI_SSID_2       "Hotspot_SSID"
#define WIFI_PASS_2       "Hotspot_Password"

#define SUPABASE_URL      "https://<your-project-id>.supabase.co"
#define SUPABASE_ANON_KEY "<your-anon-public-key>"
#define DEVICE_API_KEY    "<your-device-api-key>"
#define DEVICE_ID         "station-01"
```

#### 3. Compiling and Flashing

With Arduino CLI (or Arduino IDE with ESP32 board support and libraries installed):

```powershell
arduino-cli compile -b esp32:esp32:esp32 circuit_project
arduino-cli upload -b esp32:esp32:esp32 -p COM3 circuit_project
```

#### 4. Getting the real tag UIDs

To read the physical UID of each RFID card or key fob using the firmware over serial:

1. Connect the ESP32 to your PC via USB and open a serial monitor at **115200 baud**:
   ```powershell
   arduino-cli monitor -p COM3 -c baudrate=115200
   ```
2. Trigger the arrival sensor by briefly placing a hand or object in front of the IR sensor (GPIO 27). The serial output will log:
   ```text
   [TRIGGER] Arrival detected! Waiting for RFID tag...
   ```
3. Hold the RFID card or fob against the MFRC522 antenna within 3 seconds. The firmware reads the tag bytes, formats them as uppercase hexadecimal without separators, and prints:
   ```text
   [RFID] Read Tag UID: 01020304
   ```
   *(Even if the tag is unregistered or the backend returns `unknown_tag`, this serial line is logged immediately on card read.)*

4. **Where to enter the retrieved UIDs:**
   - **Demo Catalog (`scripts/demo-catalog.json`):** Replace the placeholder tag strings (`DEMO-CHIPS-01`, etc.) in `products[].tag_uids` with the real hex UIDs. Then run `npm run register -- --all` to register them.
   - **Quick Single-Tag Override:** Alternatively, register any physical tag on the fly without editing the catalog file:
     ```powershell
     npm run register -- --product Chips --tag 01020304
     ```
   - **On-Device Offline Fallback Table (`circuit_project/sketch.ino`):** Update the `OFFLINE_CATALOG[]` table (lines 53–58) with your physical tag UIDs if you want offline fallback recognition when Wi-Fi is unavailable:
     ```cpp
     const OfflineProduct OFFLINE_CATALOG[] = {
       { "01020304", "Chips", "Snacks", 2.000, 120 },
       ...
     };
     ```

#### 5. Wokwi Simulator vs Real Hardware

- **Wokwi Simulator Coverage:** Can simulate RFID scans (via virtual cards), IR trigger, OLED text rendering, LED feedback, and servo sweep. Connecting to live cloud requires Wokwi IoT Gateway.
- **Hardware Limitations (Untested):** Real physical MFRC522 RF antenna range, power supply brownouts when servo draws peak current from 5V rail, and mechanical switch contact bounce.

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
