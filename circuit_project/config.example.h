#ifndef CONFIG_H
#define CONFIG_H

// ── Wi-Fi Configuration ─────────────────────────────────────────
// Primary network (e.g. venue Wi-Fi or Wokwi-GUEST for simulator)
#define WIFI_SSID_1       "Wokwi-GUEST"
#define WIFI_PASS_1       ""

// Fallback network (e.g. phone hotspot)
#define WIFI_SSID_2       "Hotspot_Name"
#define WIFI_PASS_2       "Hotspot_Password"

// ── Supabase Backend API ────────────────────────────────────────
// Base URL without trailing slash (e.g. https://xyz.supabase.co or local http://10.0.2.2:54321)
#define SUPABASE_URL      "https://YOUR_PROJECT_ID.supabase.co"
#define SUPABASE_ANON_KEY "YOUR_SUPABASE_ANON_KEY"
#define DEVICE_API_KEY    "YOUR_DEVICE_API_KEY"
#define DEVICE_ID         "station-01"

// ── Security / TLS ──────────────────────────────────────────────
// Set true to skip TLS certificate validation for demo / hackathon (D4)
// WARNING: Insecure, only for testing/demo environments without public CA certs
#define CONFIG_INSECURE_TLS true

// ── Feature Flags & Timing ──────────────────────────────────────
#define ENABLE_SERVO            true    // Set false to completely disable servo sorting
#define COOLDOWN_MS             5000    // Ignore same tag within this cooldown period (ms)
#define PARCEL_WAIT_TIMEOUT_MS  15000   // Timeout waiting for parcel after RFID read (ms)
#define HTTP_TIMEOUT_MS         5000    // HTTP request timeout (ms)
#define MAX_OFFLINE_QUEUE       8       // Maximum queued offline scans

// ── LED Behavior Mode ───────────────────────────────────────────
// LED_MODE_STATUS (0): Green = OK/Success, Yellow = Busy/Duplicate/Offline, Red = Error/Unknown/Timeout
// LED_MODE_LANE   (1): Green = LEFT lane, Red = RIGHT lane, Yellow = Tag read / Waiting / Offline
//                      Errors/Unknowns/Timeouts use a distinct ALL-LEDS-BLINK pattern.
#define LED_MODE_STATUS         0
#define LED_MODE_LANE           1
#define CONFIG_LED_MODE         LED_MODE_LANE   // Default to teammate's LANE mode

// ── Servo Sorter Parameters ─────────────────────────────────────
#define SERVO_LEFT_ANGLE        30      // Sorting angle for LEFT lane (<= 10 kg)
#define SERVO_CENTER_ANGLE      90      // Gate idle/center position
#define SERVO_RIGHT_ANGLE       150     // Sorting angle for RIGHT lane (> 10 kg)
#define SERVO_HOLD_MS           1500    // Non-blocking hold duration at sorting position (ms)
#define SERVO_MIN_PULSE_US      500     // SG90 min pulse width (us)
#define SERVO_MAX_PULSE_US      2400    // SG90 max pulse width (us)

// ── Arrival Trigger (IR Obstacle Sensor, GPIO 27) ───────────────
// TRIGGER_ACTIVE_LEVEL: level the sensor D0 pin asserts when an object is detected.
//   LOW  = sensor pulls D0 low on detection (most common IR obstacle modules).
//   HIGH = sensor pulls D0 high on detection (less common; check your module datasheet).
#define TRIGGER_ACTIVE_LEVEL    LOW
// TRIGGER_PULL_MODE: internal pull resistor applied to the trigger GPIO.
//   INPUT         = no internal pull (correct for modules that actively drive D0 — default).
//   INPUT_PULLUP  = enable internal pull-up  (only if module output is open-drain).
//   INPUT_PULLDOWN = enable internal pull-down (rarely needed).
#define TRIGGER_PULL_MODE       INPUT
// TRIGGER_SELF_TEST: set true to print raw D0 level every 200 ms over serial so you can
//   verify polarity before the first live scan.  Must be false for normal operation.
#define TRIGGER_SELF_TEST       false
// ENABLE_BUTTON: set true only if a physical pushbutton is also wired to PIN_BUTTON.
//   Uses the same scan code path as the IR trigger.
#define ENABLE_BUTTON           false
#define PIN_BUTTON              34      // GPIO for optional manual test button (unused if ENABLE_BUTTON false)

// ── Pin Assignments (Physical Wiring) ───────────────────────────
// OLED Display (I2C)
#define PIN_OLED_SDA            16
#define PIN_OLED_SCL            22

// RFID Reader MFRC522 (SPI)
#define PIN_RFID_SS             5
#define PIN_RFID_SCK            18
#define PIN_RFID_MOSI           23
#define PIN_RFID_MISO           19
#define PIN_RFID_RST            21

// Other Peripherals
#define PIN_TRIGGER             27      // IR sensor D0 output
#define PIN_SERVO               25
#define PIN_LED_GREEN           13
#define PIN_LED_YELLOW          14
#define PIN_LED_RED             26
// GPIO 33 is unused (buzzer removed)

#endif // CONFIG_H
