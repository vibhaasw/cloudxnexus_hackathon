# STATUS (living log)

| Item | State | Notes |
|---|---|---|
| Shared brief (old Prompt 0) | Replaced by AGENTS.md | |
| Prompt 1: Supabase backend | DONE | Verified by owner (tables applied, seed loaded, functions deployed, test script run). |
| Prompt 2: forecaster | DONE | Verified by owner, forecast upload reported working. 4 unit tests pass, dry run gives 56 rows. |
| ESP32 station firmware | DONE | Implemented and compiled (Arduino CLI for ESP32 target). Pins changed to match physical wiring. Untested on real hardware. |
| Owner web app | NOT STARTED | Today, Stock, Live feed views. |
| Fusion integration / replay | NOT STARTED | Priority 1 replay script, Priority 2 live call. |
| Sell-date logic | NOT STARTED | Recalculation on scan / arrival. |
| Integration check | NOT STARTED | End-to-end rehearsal. |
| Git repository at root | DONE | Initialized on main branch, nested forecaster .git removed, pushed to GitHub: yes. |
| Credential exposure | OPEN | circuit_project sketch cleaned; owner advised to rotate any previously exposed credentials. |
| PRD and TRD copies | VERIFIED | PRD v2 (Supabase) and TRD v1 present in root. |

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
