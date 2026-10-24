# Smart Warehouse IoT: Project Rules

Before doing anything: read this file, then the PRD and TRD files in this folder (find them by name), then STATUS.md. If the PRD or TRD is missing, stop and tell me. If a task conflicts with the TRD, tell me before acting.

## What we are building
A 24-hour hackathon smart-warehouse system. An ESP32 scan station (RFID, trigger input, OLED, LEDs, buzzer) confirms parcel arrivals. A Supabase backend (Postgres, Edge Functions, Realtime) holds the authoritative inventory. A forecaster writes per-product daily forecasts (p10, p50, p90). An owner web app shows expected vs arrived, stock and estimated sell dates. The conveyor, weights, expiry dates and demand data are SIMULATED and must be labeled as simulated wherever they are shown.

## Hard rules
1. Never read, open, print, copy or commit any .env file or secret. Report secrets by file path and line number only, never by value, including in logs and reports.
2. Do not create git remotes, run git push, use tokens, or rewrite history. I push myself. Commit only when I ask.
3. Do not modify existing Fusion script geometry or animation logic. Additions only where a task explicitly allows.
4. Work only inside the current task. Items the PRD marks 'Could' are out of scope.
5. The ESP32 never holds the service key. The web app holds only the read-only public key. The service key lives only in my own terminal session.
6. Label simulated values as simulated in the UI, on the OLED and in API docs. Never present an expiry date as real food-safety information.
7. No silent failures: log errors visibly.
8. Work in small steps, run what you can, and say plainly what you could not test. Do not state facts about files you have not opened.
9. Installs go inside the project environment only (Python venv, node_modules). Ask before installing anything global.
10. Windows PowerShell is the shell. Use the forecaster's venv interpreter for all Python runs: demand-forecasting-uq\.venv\Scripts\python.exe
11. If a command may run for more than about 3 minutes, give it to me instead of running it.
12. The circuit_project sketch contains hard-coded Wi-Fi and weather API credentials and weather code that is out of scope. Never copy those values anywhere. When you touch the sketch, remove the weather code and replace credentials with config placeholders (a config file kept out of version control, plus a config example).

## Defaults for open decisions (keep configurable)
D1 Arrival trigger: one configurable digital input pin; works with a push button or an IR module.
D2 Product type is returned by the cloud. The ESP32 keeps a small hard-coded table only as an offline fallback.
D3 One box holds 40 units; the forecast scale makes a 40-unit batch sell out in roughly 2 to 6 days.
D4 ESP32 HTTPS: certificate validation can be switched off by a config flag for the demo, with a clear warning in comments and docs.
D5 Sell-date method: exactly as in TRD section 6.
D6 Owner app: a plain static web app that runs locally or on any static host.

## Working method
- One task per conversation. Task order: Supabase backend verified first; then circuit inspection then ESP32 firmware, owner app, and Fusion replay script; then sell-date logic (needs backend and forecaster); integration check last.
- End every task with a report: what you built, files changed, how to run and test it, what is untested, open questions. Then add a short dated entry to STATUS.md. Never delete earlier entries.

## Folder map (as known; verify before relying on it)
- demand-forecasting-uq/: forecaster (forecaster.py, main.py, products.json, tests/, requirements.txt, README.md). Has its own nested .git. .venv is ignored.
- Fusion Project Files/: conveyor generator script, animation script, Customized.f3d.
- circuit_project/: Wokwi project for the ESP32 station.
- PRD and TRD documents.
- Supabase migrations, seed and Edge Function code: location to be confirmed.