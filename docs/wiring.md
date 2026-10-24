# Hardware Wiring Reference — ESP32 Scan Station

This document defines the physical hardware pinout and wiring for the Smart Warehouse IoT ESP32 scan station.

> [!WARNING]
> **Simulator Drift Notice:** `circuit_project/diagram.json` represents the preliminary Wokwi simulator setup. Do not modify `diagram.json` without updating virtual simulation coordinates. The physical wiring documented here is the authoritative truth for hardware deployment.

---

## 1. Peripheral Pinout Table

All logic levels are **3.3 V CMOS**.

| Peripheral | Module Pin | ESP32 GPIO | Power Rail | Notes / Signal Type |
|---|---|---|---|---|
| **OLED (SSD1306)** | VCC | — | **3.3 V** | Do not power from 5 V |
| | GND | — | **GND** | Common ground |
| | SCL / SCK | **GPIO 22** | — | I2C Clock (bus shared if needed) |
| | SDA | **GPIO 16** | — | I2C Data (requires standard WROOM module; see PSRAM note) |
| **RFID (MFRC522)** | 3.3V | — | **3.3 V** | Dedicated 3.3 V rail (MFRC522 is **not** 5 V tolerant) |
| | GND | — | **GND** | Common ground |
| | RST | **GPIO 21** | — | Hardware reset line |
| | SDA / NSS / SS | **GPIO 5** | — | SPI Chip Select (VSPI default SS; see boot note) |
| | SCK | **GPIO 18** | — | SPI Clock (VSPI SCK) |
| | MOSI | **GPIO 23** | — | SPI Master-Out-Slave-In (VSPI MOSI) |
| | MISO | **GPIO 19** | — | SPI Master-In-Slave-Out (VSPI MISO) |
| | IRQ | *NC* | — | Not connected / unused |
| **Arrival Trigger** | Signal | **GPIO 27** | — | Active LOW with internal pull-up (`INPUT_PULLUP`) |
| (Button / Sensor) | GND | — | **GND** | Connects between GPIO 27 and GND |
| **Sorting Servo** | V+ (Red) | — | **5 V** (VIN/VBUS) | High current; powered from 5 V rail |
| (SG90 Micro Servo) | GND (Brown) | — | **GND** | Common ground |
| | PWM (Orange) | **GPIO 25** | — | 50 Hz PWM servo control signal |
| **Green LED** | Anode (+) | **GPIO 13** | — | Via 330 Ω inline current-limiting resistor |
| (Scan OK) | Cathode (-) | — | **GND** | Ground |
| **Yellow LED** | Anode (+) | **GPIO 14** | — | Via 330 Ω inline current-limiting resistor (boot strapping; see note) |
| (Idle / Offline) | Cathode (-) | — | **GND** | Ground |
| **Red LED** | Anode (+) | **GPIO 26** | — | Via 330 Ω inline current-limiting resistor |
| (Error / Unknown) | Cathode (-) | — | **GND** | Ground |
| **Piezo Buzzer** | Positive (+) | **GPIO 33** | — | Direct drive for passive buzzer tone |
| | Negative (-) | — | **GND** | Ground |

---

## 2. Hardware and Strapping Pin Notes

### GPIO 16 & PSRAM Restriction (ESP32-WROVER vs ESP32-WROOM)
- **ESP32-WROOM-32 / DevKitC V4 (Target):** GPIO 16 is a free general-purpose IO pin, fully suitable for I2C SDA.
- **ESP32-WROVER / PSRAM Modules:** GPIO 16 and GPIO 17 are wired internally to external SPI PSRAM. Using GPIO 16 on a WROVER board causes bus conflicts and immediate crashes.
- **How to tell your board variant:**
  - Inspect the metal RF shield on your board: text stating **ESP32-WROOM-32**, **ESP32-WROOM-32D**, or **ESP32-WROOM-32U** indicates a WROOM module (GPIO 16 is safe).
  - If the shield states **ESP32-WROVER**, it has internal PSRAM and SDA must be moved to another pin (e.g. GPIO 17 or GPIO 4).

### GPIO 5 (RFID SS / Boot Strapping)
- GPIO 5 is strapping pin `MTDO / SDIO slave timing`. It generates a brief PWM clock signal during boot.
- The MFRC522 NSS line floats or pulls high during idle. Ensure the RFID reader does not pull GPIO 5 strongly low during cold reset.

### GPIO 14 (Yellow LED / Boot Strapping)
- GPIO 14 is strapping pin `MTMS`. Connected through a 330 Ω resistor to the yellow LED anode and GND.
- During reset, the ESP32 internal pull-down keeps MTMS low (default 3.3V flash voltage selection). The LED to ground does not interfere with boot.

### Power & Grounding
- **RFID 3.3 V Power:** MFRC522 can draw up to 26–30 mA during active RF interrogation. Ensure the ESP32 on-board 3.3 V regulator is stable.
- **Servo 5 V Rail:** The SG90 servo must be powered from the **5 V (VIN/VBUS)** pin, **not** the 3.3 V rail. A 470 µF capacitor across 5V and GND near the servo is strongly recommended to prevent brownout resets during Wi-Fi transmission bursts.

---

## 3. Hardware Bring-Up Checklist

Follow these steps when testing physical hardware for the first time:

1. **Visual & Continuity Inspection (Power OFF):**
   - Verify no short circuits between `3.3V` and `GND`, or `5V` and `GND`.
   - Confirm RFID VCC is plugged into **3.3 V**, NOT 5 V.
   - Confirm 330 Ω series resistors are in place for Green (GPIO 13), Yellow (GPIO 14), and Red (GPIO 26) LEDs.
2. **Power-On & Boot (No Wi-Fi):**
   - Apply power via USB.
   - Verify Yellow LED illuminates on boot.
   - Verify OLED powers on and shows `"SMART WAREHOUSE / Booting up..."`.
3. **Arrival Trigger & RFID Scan:**
   - Press the pushbutton on GPIO 27.
   - OLED should transition to `"PARCEL DETECTED / Present RFID tag"`.
   - Place an RFID tag over the MFRC522 antenna.
   - Serial monitor (`115200` baud) should print `[RFID] Read Tag UID: <HEX>`.
4. **Cloud / Offline Verification:**
   - If Wi-Fi is unconfigured or unreachable, verify Yellow LED stays active, OLED says `(OFFLINE)`, and the event is queued.
   - With valid `config.h` credentials and active Wi-Fi, verify Green LED turns ON, a short 1200 Hz beep sounds, OLED displays `Status: CLOUD OK` with simulated weight and expiry, and the servo arm sweeps.
