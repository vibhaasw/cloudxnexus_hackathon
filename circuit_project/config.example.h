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
#define RFID_TIMEOUT_MS         3000    // RFID tag detection timeout (ms)
#define HTTP_TIMEOUT_MS         5000    // HTTP request timeout (ms)
#define TRIGGER_ACTIVE_LOW      true    // Button/sensor active level (true = active LOW with pullup)
#define MAX_OFFLINE_QUEUE       8       // Maximum queued offline scans

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

// Other Peripherals (Unchanged)
#define PIN_TRIGGER             27
#define PIN_SERVO               25
#define PIN_LED_GREEN           13
#define PIN_LED_YELLOW          14
#define PIN_LED_RED             26
#define PIN_BUZZER              33

#endif // CONFIG_H
