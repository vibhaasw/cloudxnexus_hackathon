/**
 * Smart Warehouse IoT - ESP32 Station Firmware
 *
 * Hardware: ESP32 DevKitC V4, SSD1306 OLED, MFRC522 RFID, SG90 Servo,
 *           IR obstacle sensor trigger, RGB status LEDs.
 *
 * NOTE: Conveyor, parcel weights, and expiry dates are SIMULATED and labeled
 *       as SIMULATED on all displays and serial outputs.
 */

#include <Wire.h>
#include <SPI.h>
#include <MFRC522.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <ESP32Servo.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

#if __has_include("config.h")
  #include "config.h"
#else
  #include "config.example.h"
#endif

// ── State Machine ───────────────────────────────────────────────
enum StationState {
  STATE_IDLE,
  STATE_WAITING_RFID,
  STATE_PROCESSING_SCAN,
  STATE_COOLDOWN
};

StationState currentState = STATE_IDLE;

// ── Hardware Peripherals ────────────────────────────────────────
Adafruit_SSD1306 oled(128, 64, &Wire, -1);
MFRC522 rfid(PIN_RFID_SS, PIN_RFID_RST);
Servo sortingServo;
bool servoAttached = false;

// ── Offline Fallback Catalog (matches Supabase seed) ────────────
struct OfflineProduct {
  const char* tag_uid;
  const char* name;
  const char* category;
  float weight_kg;
  int shelf_life_days;
};

const OfflineProduct OFFLINE_CATALOG[] = {
  { "01020304", "Chips", "Snacks", 2.000, 120 },
  { "11223344", "Green Tea", "Beverages", 1.250, 365 },
  { "55667788", "Pasta", "Pantry", 0.750, 540 },
  { "9900AABB", "Coffee", "Beverages", 3.500, 240 }
};
const int OFFLINE_CATALOG_COUNT = sizeof(OFFLINE_CATALOG) / sizeof(OFFLINE_CATALOG[0]);

// ── Bounded Offline Event Queue ─────────────────────────────────
struct QueuedScan {
  char tag_uid[32];
  unsigned long timestamp;
};

QueuedScan offlineQueue[MAX_OFFLINE_QUEUE];
int queueHead = 0;
int queueTail = 0;
int queueCount = 0;

// ── Runtime Variables ───────────────────────────────────────────
String lastScannedUid = "";
unsigned long lastScanTime = 0;
unsigned long stateStartTime = 0;

// ── Trigger / Re-arm State ──────────────────────────────────────
// Strategy: clear-to-rearm.  Once a trigger fires, the sensor must return
// to the idle (non-detected) level before the firmware will accept the next
// trigger.  This ensures a parcel resting in front of the sensor fires
// exactly one scan cycle regardless of how long it stays in range.
int  lastTriggerReading  = -1;    // -1 means "not yet sampled"
bool triggerArmed        = true;  // ready to fire when true
unsigned long lastDebounceTime  = 0;
const unsigned long DEBOUNCE_DELAY_MS = 50;

// ── Non-blocking LED Pattern State ─────────────────────────────
// LED patterns are driven by ledUpdatePattern() called every loop().
// delay() is never used for LED timing so WiFi callbacks stay alive.
enum LedPatternId {
  LED_NONE,
  LED_SUCCESS,       // green solid 2 s
  LED_ERROR,         // red   solid 2 s
  LED_UNKNOWN,       // red   3× quick blink
  LED_DUPLICATE,     // yellow 2× quick blink
  LED_OFFLINE_BLINK, // yellow slow blink (500/500) — ongoing until reset
  LED_BUSY           // yellow solid (set immediately; no timed pattern)
};

LedPatternId activeLedPattern = LED_NONE;
unsigned long ledPatternStart  = 0;   // millis() when pattern began
int           ledBlinkCount    = 0;   // remaining blink toggles
bool          ledBlinkState    = false;
unsigned long ledLastBlink     = 0;

// ── Self-test State ─────────────────────────────────────────────
#if TRIGGER_SELF_TEST
int  selfTestLastLevel = -1;
unsigned long selfTestLastPrint = 0;
#endif

// ── Forward Declarations ────────────────────────────────────────
void showDisplay(const String& l1, const String& l2, const String& l3, const String& l4);
void setLeds(bool green, bool yellow, bool red);
void startLedPattern(LedPatternId p);
void updateLedPattern();
void moveServo(float weightKg);
bool connectWiFi(int timeoutSeconds);
void checkWiFiConnection();
void flushOfflineQueue();
bool executeCloudScan(const String& uid, bool isQueuedReplay);
bool handleOfflineScan(const String& uid);

// ── Setup ───────────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  delay(200);
  Serial.println("\n==========================================");
  Serial.println("  SMART WAREHOUSE ESP32 SCAN STATION");
  Serial.println("  Weights and Expiry Dates are SIMULATED");
  Serial.println("==========================================");

  // Configure GPIO Pins
  pinMode(PIN_TRIGGER, TRIGGER_PULL_MODE);
  pinMode(PIN_LED_GREEN, OUTPUT);
  pinMode(PIN_LED_YELLOW, OUTPUT);
  pinMode(PIN_LED_RED, OUTPUT);
#if ENABLE_BUTTON
  pinMode(PIN_BUTTON, INPUT_PULLUP);
#endif

  // Initial LED State: Yellow ON (starting up)
  setLeds(false, true, false);

  // Initialize I2C and OLED
  Wire.begin(PIN_OLED_SDA, PIN_OLED_SCL);
  if (!oled.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    Serial.println("[ERROR] SSD1306 OLED initialization failed!");
  } else {
    oled.clearDisplay();
    showDisplay("SMART WAREHOUSE", "Booting up...", "Network: Connecting", "Status: INIT");
  }

  // Initialize SPI and MFRC522 RFID
  SPI.begin(PIN_RFID_SCK, PIN_RFID_MISO, PIN_RFID_MOSI, PIN_RFID_SS);
  rfid.PCD_Init();
  delay(10);
  Serial.print("[RFID] MFRC522 Firmware: ");
  rfid.PCD_DumpVersionToSerial();

  // Initialize Servo if enabled
#if ENABLE_SERVO
  sortingServo.attach(PIN_SERVO);
  sortingServo.write(90); // Center position
  servoAttached = true;
  Serial.println("[SERVO] Initialized at pin " + String(PIN_SERVO));
#else
  Serial.println("[SERVO] Disabled by configuration flag.");
#endif

  // Connect to Wi-Fi
  connectWiFi(6);

  // Transition to IDLE
  currentState = STATE_IDLE;
  setLeds(false, true, false);
  showDisplay("SCAN STATION READY", "Simulated Inventory", "Awaiting IR trigger", "Status: IDLE");
  Serial.println("[SYSTEM] Ready. Waiting for arrival trigger.");
}

// ── Loop ────────────────────────────────────────────────────────
void loop() {
  checkWiFiConnection();
  flushOfflineQueue();
  updateLedPattern();

  // ── Self-test: print raw IR level every 200 ms ───────────────
#if TRIGGER_SELF_TEST
  {
    unsigned long now = millis();
    if (now - selfTestLastPrint >= 200) {
      selfTestLastPrint = now;
      int raw = digitalRead(PIN_TRIGGER);
      if (raw != selfTestLastLevel) {
        Serial.print("[SELF-TEST] D0 level CHANGED -> ");
        Serial.println(raw == HIGH ? "HIGH" : "LOW");
        selfTestLastLevel = raw;
      } else {
        Serial.print("[SELF-TEST] D0 level = ");
        Serial.println(raw == HIGH ? "HIGH" : "LOW");
      }
    }
  }
#endif

  switch (currentState) {
    case STATE_IDLE: {
      // ── Debounced IR trigger read ───────────────────────────
      int reading = digitalRead(PIN_TRIGGER);
      if (lastTriggerReading == -1) lastTriggerReading = reading; // first sample

      if (reading != lastTriggerReading) {
        lastDebounceTime = millis();
      }

      if ((millis() - lastDebounceTime) > DEBOUNCE_DELAY_MS) {
        // Re-arm: sensor returned to idle level → ready for next trigger
        if (reading != TRIGGER_ACTIVE_LEVEL && !triggerArmed) {
          triggerArmed = true;
          Serial.println("[TRIGGER] Sensor cleared — re-armed.");
        }
        // Fire: sensor asserts active level AND armed
        if (reading == TRIGGER_ACTIVE_LEVEL && triggerArmed) {
          triggerArmed = false;   // disarm until sensor clears
          Serial.println("\n[TRIGGER] Arrival detected! Waiting for RFID tag...");
          currentState = STATE_WAITING_RFID;
          stateStartTime = millis();
          startLedPattern(LED_BUSY);
          showDisplay("PARCEL DETECTED", "Present RFID tag", "Waiting (3s max)...", "Status: TRIGGERED");
        }
      }
      lastTriggerReading = reading;

      // ── Optional manual button trigger ──────────────────────
#if ENABLE_BUTTON
      {
        static int lastBtnReading = HIGH;
        static unsigned long lastBtnDebounce = 0;
        int btnReading = digitalRead(PIN_BUTTON);
        if (btnReading != lastBtnReading) lastBtnDebounce = millis();
        if ((millis() - lastBtnDebounce) > DEBOUNCE_DELAY_MS) {
          if (btnReading == LOW && lastBtnReading != LOW) { // falling edge
            Serial.println("\n[BUTTON] Manual trigger pressed.");
            currentState = STATE_WAITING_RFID;
            stateStartTime = millis();
            startLedPattern(LED_BUSY);
            showDisplay("MANUAL TRIGGER", "Present RFID tag", "Waiting (3s max)...", "Status: TRIGGERED");
          }
        }
        lastBtnReading = btnReading;
      }
#endif
      break;
    }

    case STATE_WAITING_RFID: {
      // Read RFID tag with timeout
      if (rfid.PICC_IsNewCardPresent() && rfid.PICC_ReadCardSerial()) {
        String uid = "";
        for (byte i = 0; i < rfid.uid.size; i++) {
          if (rfid.uid.uidByte[i] < 16) uid += "0";
          uid += String(rfid.uid.uidByte[i], HEX);
        }
        uid.toUpperCase();
        rfid.PICC_HaltA();
        rfid.PCD_StopCrypto1();

        Serial.println("[RFID] Read Tag UID: " + uid);

        // Check Duplicate Cooldown
        if (uid == lastScannedUid && (millis() - lastScanTime) < COOLDOWN_MS) {
          Serial.println("[COOLDOWN] Tag " + uid + " scanned within cooldown window. Ignored.");
          showDisplay("DUPLICATE SCAN", "Cooldown active", "Wait 5s between scans", "Status: DUPLICATE");
          startLedPattern(LED_DUPLICATE);
          stateStartTime = millis();
          currentState = STATE_COOLDOWN;
          break;
        }

        lastScannedUid = uid;
        lastScanTime = millis();

        // Process Scan
        currentState = STATE_PROCESSING_SCAN;
        startLedPattern(LED_BUSY);
        showDisplay("PROCESSING SCAN", "Tag: " + uid, "Calling Cloud API...", "Status: BUSY");

        bool cloudOk = executeCloudScan(uid, false);
        if (!cloudOk) {
          // Cloud failed or offline: fall back to local table
          handleOfflineScan(uid);
        }

        currentState = STATE_COOLDOWN;
        stateStartTime = millis();
      } else if (millis() - stateStartTime > RFID_TIMEOUT_MS) {
        // RFID Timeout
        Serial.println("[RFID TIMEOUT] No tag presented within 3 seconds.");
        showDisplay("RFID TIMEOUT", "No tag detected", "Try again", "Status: TIMEOUT");
        startLedPattern(LED_ERROR);
        stateStartTime = millis();
        currentState = STATE_COOLDOWN;
      }
      break;
    }

    case STATE_COOLDOWN: {
      if (millis() - stateStartTime > 3000) {
        activeLedPattern = LED_NONE;
        currentState = STATE_IDLE;
        setLeds(false, true, false);
        showDisplay("SCAN STATION READY", "Simulated Inventory", "Awaiting IR trigger", "Status: IDLE");
      }
      break;
    }
  }

  delay(20);
}

// ── Display Helper ──────────────────────────────────────────────
void showDisplay(const String& l1, const String& l2, const String& l3, const String& l4) {
  oled.clearDisplay();
  oled.setTextSize(1);
  oled.setTextColor(SSD1306_WHITE);
  oled.setCursor(0, 0);

  oled.println(l1);
  oled.println(l2);
  oled.println(l3);
  oled.println(l4);

  oled.display();
}

// ── LED Helper ──────────────────────────────────────────────────
void setLeds(bool green, bool yellow, bool red) {
  digitalWrite(PIN_LED_GREEN, green ? HIGH : LOW);
  digitalWrite(PIN_LED_YELLOW, yellow ? HIGH : LOW);
  digitalWrite(PIN_LED_RED, red ? HIGH : LOW);
}

// ── Non-blocking LED Pattern Helpers ────────────────────────────
// Call startLedPattern() to begin a pattern; updateLedPattern() each loop().
// delay() is never used here so Wi-Fi callbacks stay alive.

void startLedPattern(LedPatternId p) {
  activeLedPattern = p;
  ledPatternStart  = millis();
  ledBlinkCount    = 0;
  ledBlinkState    = false;
  ledLastBlink     = millis();

  switch (p) {
    case LED_SUCCESS:
      setLeds(true, false, false);    // green solid; pattern expires after 2 s
      break;
    case LED_ERROR:
      setLeds(false, false, true);    // red solid; pattern expires after 2 s
      break;
    case LED_UNKNOWN:
      ledBlinkCount = 6;              // 3 blinks × 2 transitions (on+off)
      setLeds(false, false, true);    // red ON first
      ledBlinkState = true;
      break;
    case LED_DUPLICATE:
      ledBlinkCount = 4;              // 2 blinks × 2 transitions
      setLeds(false, true, false);    // yellow ON first
      ledBlinkState = true;
      break;
    case LED_OFFLINE_BLINK:
      setLeds(false, true, false);    // yellow ON to start; slow blink ongoing
      ledBlinkState = true;
      break;
    case LED_BUSY:
      setLeds(false, true, false);    // yellow solid; no timed transitions
      break;
    case LED_NONE:
    default:
      break;                          // caller manages LEDs directly
  }
}

void updateLedPattern() {
  if (activeLedPattern == LED_NONE || activeLedPattern == LED_BUSY) return;

  unsigned long now = millis();

  switch (activeLedPattern) {
    case LED_SUCCESS:
    case LED_ERROR:
      // Solid for 2 s then disarm (cooldown will reset LEDs when it expires)
      if (now - ledPatternStart >= 2000) {
        activeLedPattern = LED_NONE;
      }
      break;

    case LED_UNKNOWN:
    case LED_DUPLICATE: {
      // Quick blinks: 100 ms on / 100 ms off
      if (ledBlinkCount > 0 && (now - ledLastBlink) >= 100) {
        ledLastBlink  = now;
        ledBlinkState = !ledBlinkState;
        ledBlinkCount--;
        bool isUnknown = (activeLedPattern == LED_UNKNOWN);
        if (ledBlinkState) {
          setLeds(false, !isUnknown, isUnknown);   // yellow or red
        } else {
          setLeds(false, false, false);
        }
      }
      if (ledBlinkCount == 0) {
        activeLedPattern = LED_NONE;
        setLeds(false, false, false);
      }
      break;
    }

    case LED_OFFLINE_BLINK:
      // Slow blink: 500 ms on / 500 ms off — runs until pattern is reset
      if ((now - ledLastBlink) >= 500) {
        ledLastBlink  = now;
        ledBlinkState = !ledBlinkState;
        setLeds(false, ledBlinkState, false);
      }
      break;

    default:
      break;
  }
}

// ── Servo Sorter Helper ─────────────────────────────────────────
void moveServo(float weightKg) {
#if ENABLE_SERVO
  if (!servoAttached) return;
  // Weight threshold 10 kg: heavy cargo to right (150 deg), light to left (30 deg)
  int targetAngle = (weightKg > 10.0) ? 150 : 30;
  Serial.println("[SERVO] Actuating sorting arm to " + String(targetAngle) + " deg (Weight: " + String(weightKg) + " kg SIMULATED)");
  sortingServo.write(targetAngle);
  delay(1200);
  sortingServo.write(90); // Reset to center
#endif
}

// ── Wi-Fi Connection & Reconnect ────────────────────────────────
bool connectWiFi(int timeoutSeconds) {
  if (WiFi.status() == WL_CONNECTED) return true;

  WiFi.mode(WIFI_STA);

  // Attempt 1: Primary Network
  Serial.print("[WIFI] Connecting to primary SSID: ");
  Serial.println(WIFI_SSID_1);
  WiFi.begin(WIFI_SSID_1, WIFI_PASS_1);

  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && (millis() - start) < (timeoutSeconds * 1000 / 2)) {
    delay(250);
    Serial.print(".");
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n[WIFI] Connected! IP: " + WiFi.localIP().toString());
    return true;
  }

  // Attempt 2: Fallback Network
  Serial.print("\n[WIFI] Primary failed. Trying fallback SSID: ");
  Serial.println(WIFI_SSID_2);
  WiFi.begin(WIFI_SSID_2, WIFI_PASS_2);

  start = millis();
  while (WiFi.status() != WL_CONNECTED && (millis() - start) < (timeoutSeconds * 1000 / 2)) {
    delay(250);
    Serial.print(".");
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n[WIFI] Connected to fallback! IP: " + WiFi.localIP().toString());
    return true;
  }

  Serial.println("\n[WIFI] Connection failed. Operating in OFFLINE mode.");
  return false;
}

void checkWiFiConnection() {
  static unsigned long lastCheck = 0;
  if (millis() - lastCheck > 10000) {
    lastCheck = millis();
    if (WiFi.status() != WL_CONNECTED) {
      connectWiFi(3);
    }
  }
}

// ── Cloud Scan Request ──────────────────────────────────────────
bool executeCloudScan(const String& uid, bool isQueuedReplay) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[CLOUD] No Wi-Fi connection.");
    return false;
  }

  WiFiClientSecure client;
  // TLS Verification Flag (TRD D4)
  // WARNING: Certificate validation skipped for hackathon demo per D4
#if CONFIG_INSECURE_TLS
  client.setInsecure();
#endif
  client.setTimeout(HTTP_TIMEOUT_MS / 1000);

  HTTPClient http;
  String url = String(SUPABASE_URL) + "/functions/v1/scan";
  if (!http.begin(client, url)) {
    Serial.println("[CLOUD] Unable to initialize HTTP client for " + url);
    return false;
  }

  http.addHeader("Content-Type", "application/json");
  http.addHeader("apikey", SUPABASE_ANON_KEY);
  http.addHeader("x-api-key", DEVICE_API_KEY);

  JsonDocument reqDoc;
  reqDoc["device_id"] = DEVICE_ID;
  reqDoc["tag_uid"] = uid;

  String reqBody;
  serializeJson(reqDoc, reqBody);

  Serial.println("[CLOUD] Sending scan POST to " + url);
  int httpCode = http.POST(reqBody);

  if (httpCode <= 0) {
    Serial.println("[CLOUD] HTTP request failed, error: " + http.errorToString(httpCode));
    http.end();
    return false;
  }

  String response = http.getString();
  http.end();

  Serial.println("[CLOUD] Response (" + String(httpCode) + "): " + response);

  JsonDocument resDoc;
  DeserializationError err = deserializeJson(resDoc, response);
  if (err) {
    Serial.println("[CLOUD] JSON parse error: " + String(err.c_str()));
    return false;
  }

  const char* result = resDoc["result"] | "error";

  if (strcmp(result, "ok") == 0) {
    const char* prodName = resDoc["product_name"] | "Item";
    float weight = resDoc["weight_kg"] | 0.0;
    const char* expiry = resDoc["simulated_expiry_date"] | "N/A";

    startLedPattern(LED_SUCCESS);

    String line1 = String(prodName);
    String line2 = "Wt: " + String(weight, 2) + "kg (SIM)";
    String line3 = "Exp: " + String(expiry) + " (SIM)";
    String line4 = isQueuedReplay ? "Status: REPLAY OK" : "Status: CLOUD OK";

    showDisplay(line1, line2, line3, line4);
    moveServo(weight);
    return true;
  } 
  else if (strcmp(result, "duplicate") == 0) {
    startLedPattern(LED_DUPLICATE);
    showDisplay("DUPLICATE SCAN", "Tag: " + uid, "Already recorded", "Status: DUPLICATE");
    return true;
  } 
  else if (strcmp(result, "unknown_tag") == 0) {
    startLedPattern(LED_UNKNOWN);
    showDisplay("UNKNOWN RFID TAG", "Tag: " + uid, "Register item first", "Status: UNKNOWN");
    return true;
  }

  return false;
}

// ── Offline Fallback & Event Queue ──────────────────────────────
bool handleOfflineScan(const String& uid) {
  Serial.println("[OFFLINE] Searching on-device fallback table for " + uid);

  const OfflineProduct* found = nullptr;
  for (int i = 0; i < OFFLINE_CATALOG_COUNT; i++) {
    if (uid.equalsIgnoreCase(OFFLINE_CATALOG[i].tag_uid)) {
      found = &OFFLINE_CATALOG[i];
      break;
    }
  }

  if (found) {
    Serial.println("[OFFLINE MATCH] " + String(found->name) + " (" + String(found->weight_kg) + " kg SIMULATED)");
    startLedPattern(LED_OFFLINE_BLINK); // yellow slow blink = offline result

    // Show simulated result clearly marked as OFFLINE
    String line1 = String(found->name) + " (OFFLINE)";
    String line2 = "Wt: " + String(found->weight_kg, 2) + "kg (SIM)";
    String line3 = "Life: ~" + String(found->shelf_life_days) + "d (SIM)";
    String line4 = "Status: QUEUED";
    showDisplay(line1, line2, line3, line4);

    moveServo(found->weight_kg);

    // Enqueue event to send later
    if (queueCount < MAX_OFFLINE_QUEUE) {
      strncpy(offlineQueue[queueTail].tag_uid, uid.c_str(), sizeof(offlineQueue[queueTail].tag_uid) - 1);
      offlineQueue[queueTail].tag_uid[sizeof(offlineQueue[queueTail].tag_uid) - 1] = '\0';
      offlineQueue[queueTail].timestamp = millis();
      queueTail = (queueTail + 1) % MAX_OFFLINE_QUEUE;
      queueCount++;
      Serial.println("[OFFLINE] Event queued (" + String(queueCount) + "/" + String(MAX_OFFLINE_QUEUE) + ")");
    } else {
      Serial.println("[OFFLINE WARNING] Queue full! Oldest offline event dropped.");
      queueHead = (queueHead + 1) % MAX_OFFLINE_QUEUE;
      strncpy(offlineQueue[queueTail].tag_uid, uid.c_str(), sizeof(offlineQueue[queueTail].tag_uid) - 1);
      offlineQueue[queueTail].tag_uid[sizeof(offlineQueue[queueTail].tag_uid) - 1] = '\0';
      offlineQueue[queueTail].timestamp = millis();
      queueTail = (queueTail + 1) % MAX_OFFLINE_QUEUE;
    }
    return true;
  } else {
    Serial.println("[OFFLINE] Tag not found in local table.");
    startLedPattern(LED_UNKNOWN);
    showDisplay("OFFLINE / UNKNOWN", "Tag: " + uid, "Not in offline table", "Status: UNKNOWN");
    return false;
  }
}

void flushOfflineQueue() {
  if (queueCount == 0 || WiFi.status() != WL_CONNECTED) return;

  Serial.println("[QUEUE] Network restored. Flushing " + String(queueCount) + " queued scans...");
  while (queueCount > 0 && WiFi.status() == WL_CONNECTED) {
    String tag = String(offlineQueue[queueHead].tag_uid);
    Serial.println("[QUEUE] Replaying queued scan: " + tag);
    bool ok = executeCloudScan(tag, true);
    if (ok) {
      queueHead = (queueHead + 1) % MAX_OFFLINE_QUEUE;
      queueCount--;
      delay(300); // polite pause between requests
    } else {
      Serial.println("[QUEUE] Cloud request failed during replay. Pausing flush.");
      break;
    }
  }
}
