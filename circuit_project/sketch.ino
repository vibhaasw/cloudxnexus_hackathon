/**
 * Smart Warehouse IoT - ESP32 Station Firmware
 *
 * Hardware: ESP32 DevKitC V4, SH1106 1.3" OLED (U8g2), MFRC522 RFID, SG90 Servo,
 *           IR obstacle sensor trigger, RGB status LEDs.
 *
 * Event Order: Tag first, then IR confirmation.
 * NOTE: Conveyor, parcel weights, and expiry dates are SIMULATED and labeled
 *       as SIMULATED on all displays and serial outputs.
 */

#include <Wire.h>
#include <SPI.h>
#include <MFRC522.h>
#include <U8g2lib.h>
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

// ── Backwards Compatibility Defaults for Config Options ─────────
#ifndef PARCEL_WAIT_TIMEOUT_MS
  #define PARCEL_WAIT_TIMEOUT_MS 15000
#endif
#ifndef LED_MODE_STATUS
  #define LED_MODE_STATUS 0
  #define LED_MODE_LANE 1
#endif
#ifndef CONFIG_LED_MODE
  #define CONFIG_LED_MODE LED_MODE_LANE
#endif
#ifndef SERVO_LEFT_ANGLE
  #define SERVO_LEFT_ANGLE 30
  #define SERVO_CENTER_ANGLE 90
  #define SERVO_RIGHT_ANGLE 150
  #define SERVO_HOLD_MS 1500
  #define SERVO_MIN_PULSE_US 500
  #define SERVO_MAX_PULSE_US 2400
#endif

// ── State Machine ───────────────────────────────────────────────
enum StationState {
  STATE_IDLE,
  STATE_WAITING_PARCEL,
  STATE_PROCESSING_SCAN,
  STATE_COOLDOWN
};

StationState currentState = STATE_IDLE;
String heldTagUid = "";

// ── Hardware Peripherals ────────────────────────────────────────
U8G2_SH1106_128X64_NONAME_F_HW_I2C oled(U8G2_R0, U8X8_PIN_NONE);
MFRC522 rfid(PIN_RFID_SS, PIN_RFID_RST);
Servo sortingServo;
bool servoAttached = false;
bool servoMoving = false;
unsigned long servoMoveStart = 0;

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
// Strategy: clear-to-rearm.  Once a trigger fires or when waiting for a parcel,
// the sensor must return to/be at the idle (non-detected) level before the
// firmware will accept an arrival.  A parcel already resting in front of the
// sensor when a tag is tapped does NOT count until it clears and re-enters.
int  lastTriggerReading  = -1;
bool irArmed             = false;
unsigned long lastDebounceTime = 0;
const unsigned long DEBOUNCE_DELAY_MS = 50;

// ── Non-blocking LED Pattern State ─────────────────────────────
enum LedPatternId {
  LED_NONE,
  LED_SUCCESS_LEFT,   // Green solid 2s (LEFT lane in LANE mode)
  LED_SUCCESS_RIGHT,  // Red solid 2s (RIGHT lane in LANE mode)
  LED_SUCCESS_STATUS, // Green solid 2s (Success in STATUS mode)
  LED_ALL_BLINK,      // All 3 LEDs blink synchronously 3x (Error in LANE mode)
  LED_ERROR_STATUS,   // Red solid 2s (Error in STATUS mode)
  LED_UNKNOWN_STATUS, // Red 3x quick blink (Unknown tag in STATUS mode)
  LED_DUPLICATE_STATUS,// Yellow 2x quick blink (Duplicate in STATUS mode)
  LED_OFFLINE_BLINK,  // Yellow slow blink (500/500 ms)
  LED_BUSY            // Yellow solid
};

LedPatternId activeLedPattern = LED_NONE;
unsigned long ledPatternStart  = 0;
int           ledBlinkCount    = 0;
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
void triggerErrorFeedback();
void triggerDuplicateFeedback();
void triggerUnknownFeedback();
void moveServoLane(const String& lane);
void updateServo();
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

  // Initialize I2C and SH1106 OLED (1.3" display via U8g2)
  Wire.begin(PIN_OLED_SDA, PIN_OLED_SCL);
  oled.begin();
  showDisplay("Booting up...", "Connecting Wi-Fi...", "SIMULATED Inventory", "Status: INIT");

  // Initialize SPI and MFRC522 RFID
  SPI.begin(PIN_RFID_SCK, PIN_RFID_MISO, PIN_RFID_MOSI, PIN_RFID_SS);
  rfid.PCD_Init();
  delay(10);
  Serial.print("[RFID] MFRC522 Firmware: ");
  rfid.PCD_DumpVersionToSerial();

  // Initialize Servo if enabled (50Hz PWM, 500-2400us pulse width)
#if ENABLE_SERVO
  sortingServo.setPeriodHertz(50);
  sortingServo.attach(PIN_SERVO, SERVO_MIN_PULSE_US, SERVO_MAX_PULSE_US);
  sortingServo.write(SERVO_CENTER_ANGLE);
  servoAttached = true;
  Serial.println("[SERVO] Initialized at pin " + String(PIN_SERVO) + " (50Hz, 500-2400us, Centered at " + String(SERVO_CENTER_ANGLE) + " deg)");
#else
  Serial.println("[SERVO] Disabled by configuration flag.");
#endif

  // Connect to Wi-Fi
  connectWiFi(6);

  // Transition to IDLE
  currentState = STATE_IDLE;
  heldTagUid = "";
  setLeds(false, true, false); // Ready indicator
  showDisplay("SYSTEM READY", "Scan RFID tag", "Simulated Inventory", "Status: IDLE");
  Serial.println("[SYSTEM] Ready. Step 1: Scan RFID tag.");
}

// ── Loop ────────────────────────────────────────────────────────
void loop() {
  checkWiFiConnection();
  flushOfflineQueue();
  updateLedPattern();
  updateServo();

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
      // Step 1: Idle state. IR events are IGNORED in this state.
      // We only poll for an RFID card.
      if (rfid.PICC_IsNewCardPresent() && rfid.PICC_ReadCardSerial()) {
        String uid = "";
        for (byte i = 0; i < rfid.uid.size; i++) {
          if (rfid.uid.uidByte[i] < 16) uid += "0";
          uid += String(rfid.uid.uidByte[i], HEX);
        }
        uid.toUpperCase();
        rfid.PICC_HaltA();
        rfid.PCD_StopCrypto1();

        Serial.println("\n[RFID] Read Tag UID: " + uid);

        // Step 2: Tag read. Hold UID in memory, do NOT call cloud yet.
        heldTagUid = uid;
        currentState = STATE_WAITING_PARCEL;
        stateStartTime = millis();

        // Clear-to-rearm check on entry:
        // A parcel already resting at the sensor when the tag is tapped
        // does not count until it clears and re-enters.
        int currentIr = digitalRead(PIN_TRIGGER);
        irArmed = (currentIr != TRIGGER_ACTIVE_LEVEL);
        lastTriggerReading = currentIr;
        lastDebounceTime = millis();

        if (!irArmed) {
          Serial.println("[IR] Sensor is currently blocked by resting parcel. Waiting for clear before arming.");
        } else {
          Serial.println("[IR] Sensor is clear — armed for parcel arrival.");
        }

        // Show 'TAG <last 4 hex>' and 'Place parcel' on OLED, yellow LED
        startLedPattern(LED_BUSY);
        String last4 = (uid.length() >= 4) ? uid.substring(uid.length() - 4) : uid;
        showDisplay("TAG " + last4, "Place parcel", "Waiting for IR...", "Status: WAITING");
        Serial.println("[SYSTEM] Tag held (" + last4 + "). Waiting up to " + String(PARCEL_WAIT_TIMEOUT_MS / 1000) + "s for IR arrival.");
      }
      break;
    }

    case STATE_WAITING_PARCEL: {
      // Step 3: Waiting for parcel arrival via IR sensor.
      // Ignore further tag taps while waiting.

      int reading = digitalRead(PIN_TRIGGER);
      if (lastTriggerReading == -1) lastTriggerReading = reading;

      if (reading != lastTriggerReading) {
        lastDebounceTime = millis();
      }

      if ((millis() - lastDebounceTime) > DEBOUNCE_DELAY_MS) {
        // Sensor cleared -> arm trigger
        if (reading != TRIGGER_ACTIVE_LEVEL && !irArmed) {
          irArmed = true;
          Serial.println("[TRIGGER] Sensor cleared — re-armed.");
        }

        // Sensor tripped while armed -> parcel confirmed!
        if (reading == TRIGGER_ACTIVE_LEVEL && irArmed) {
          irArmed = false;
          Serial.println("\n[TRIGGER] Parcel arrival confirmed by IR sensor!");
          currentState = STATE_PROCESSING_SCAN;
          break;
        }
      }
      lastTriggerReading = reading;

      // Optional manual button trigger
#if ENABLE_BUTTON
      {
        static int lastBtnReading = HIGH;
        static unsigned long lastBtnDebounce = 0;
        int btnReading = digitalRead(PIN_BUTTON);
        if (btnReading != lastBtnReading) lastBtnDebounce = millis();
        if ((millis() - lastBtnDebounce) > DEBOUNCE_DELAY_MS) {
          if (btnReading == LOW && lastBtnReading != LOW) {
            Serial.println("\n[BUTTON] Manual trigger confirmed parcel arrival!");
            currentState = STATE_PROCESSING_SCAN;
            break;
          }
        }
        lastBtnReading = btnReading;
      }
#endif

      // Timeout check (default 15 s)
      if (millis() - stateStartTime > PARCEL_WAIT_TIMEOUT_MS) {
        Serial.println("[TIMEOUT] No parcel detected within " + String(PARCEL_WAIT_TIMEOUT_MS / 1000) + "s. Returning to idle.");
        triggerErrorFeedback();
        showDisplay("No parcel detected", "IR timeout expired", "Simulated Inventory", "Status: TIMEOUT");
        heldTagUid = "";
        stateStartTime = millis();
        currentState = STATE_COOLDOWN;
      }
      break;
    }

    case STATE_PROCESSING_SCAN: {
      // Step 4: IR tripped -> execute ONE scan with held UID
      String uid = heldTagUid;
      heldTagUid = "";

      // Check Duplicate Cooldown
      if (uid == lastScannedUid && (millis() - lastScanTime) < COOLDOWN_MS) {
        Serial.println("[COOLDOWN] Tag " + uid + " scanned within cooldown window. Ignored.");
        showDisplay("DUPLICATE SCAN", "Cooldown active", "Wait 5s between scans", "Status: DUPLICATE");
        triggerDuplicateFeedback();
        stateStartTime = millis();
        currentState = STATE_COOLDOWN;
        break;
      }

      lastScannedUid = uid;
      lastScanTime = millis();

      startLedPattern(LED_BUSY);
      showDisplay("PROCESSING SCAN", "Tag: " + uid, "Calling Cloud API...", "Status: BUSY");

      bool cloudOk = executeCloudScan(uid, false);
      if (!cloudOk) {
        // Cloud failed or offline: fall back to local table
        handleOfflineScan(uid);
      }

      currentState = STATE_COOLDOWN;
      stateStartTime = millis();
      break;
    }

    case STATE_COOLDOWN: {
      // Step 5: Cooldown, then return to idle
      if (millis() - stateStartTime > 3000) {
        activeLedPattern = LED_NONE;
        currentState = STATE_IDLE;
        setLeds(false, true, false); // Ready indicator (yellow)
        showDisplay("SYSTEM READY", "Scan RFID tag", "Simulated Inventory", "Status: IDLE");
      }
      break;
    }
  }

  delay(20);
}

// ── Display Helper (U8g2 SH1106 128x64) ─────────────────────────
void showDisplay(const String& l1, const String& l2, const String& l3, const String& l4) {
  oled.clearBuffer();
  oled.setFont(u8g2_font_6x10_tf);

  oled.drawStr(0, 10, "SMART WAREHOUSE (SIM)");
  oled.drawHLine(0, 13, 128);

  if (l1.length() > 0) oled.drawStr(0, 25, l1.c_str());
  if (l2.length() > 0) oled.drawStr(0, 37, l2.c_str());
  if (l3.length() > 0) oled.drawStr(0, 49, l3.c_str());
  if (l4.length() > 0) oled.drawStr(0, 61, l4.c_str());

  oled.sendBuffer();
}

// ── LED Helper ──────────────────────────────────────────────────
void setLeds(bool green, bool yellow, bool red) {
  digitalWrite(PIN_LED_GREEN, green ? HIGH : LOW);
  digitalWrite(PIN_LED_YELLOW, yellow ? HIGH : LOW);
  digitalWrite(PIN_LED_RED, red ? HIGH : LOW);
}

// ── Non-blocking LED Pattern Helpers ────────────────────────────
void startLedPattern(LedPatternId p) {
  activeLedPattern = p;
  ledPatternStart  = millis();
  ledBlinkCount    = 0;
  ledBlinkState    = false;
  ledLastBlink     = millis();

  switch (p) {
    case LED_SUCCESS_LEFT:
      setLeds(true, false, false);    // Green solid 2s (LEFT lane)
      break;
    case LED_SUCCESS_RIGHT:
      setLeds(false, false, true);    // Red solid 2s (RIGHT lane)
      break;
    case LED_SUCCESS_STATUS:
      setLeds(true, false, false);    // Green solid 2s (Status OK)
      break;
    case LED_ALL_BLINK:
      // Distinct pattern for errors in LANE mode:
      // All 3 LEDs flash synchronously together 3 times
      ledBlinkCount = 6;              // 3 blinks * 2 toggles
      setLeds(true, true, true);
      ledBlinkState = true;
      break;
    case LED_ERROR_STATUS:
      setLeds(false, false, true);    // Red solid 2s
      break;
    case LED_UNKNOWN_STATUS:
      ledBlinkCount = 6;              // 3 quick red blinks
      setLeds(false, false, true);
      ledBlinkState = true;
      break;
    case LED_DUPLICATE_STATUS:
      ledBlinkCount = 4;              // 2 quick yellow blinks
      setLeds(false, true, false);
      ledBlinkState = true;
      break;
    case LED_OFFLINE_BLINK:
      setLeds(false, true, false);    // Yellow slow blink ongoing
      ledBlinkState = true;
      break;
    case LED_BUSY:
      setLeds(false, true, false);    // Yellow solid
      break;
    case LED_NONE:
    default:
      break;
  }
}

void updateLedPattern() {
  if (activeLedPattern == LED_NONE || activeLedPattern == LED_BUSY) return;

  unsigned long now = millis();

  switch (activeLedPattern) {
    case LED_SUCCESS_LEFT:
    case LED_SUCCESS_RIGHT:
    case LED_SUCCESS_STATUS:
    case LED_ERROR_STATUS:
      if (now - ledPatternStart >= 2000) {
        activeLedPattern = LED_NONE;
      }
      break;

    case LED_ALL_BLINK:
      // All 3 LEDs blink synchronously: 150ms on / 150ms off
      if (ledBlinkCount > 0 && (now - ledLastBlink) >= 150) {
        ledLastBlink  = now;
        ledBlinkState = !ledBlinkState;
        ledBlinkCount--;
        if (ledBlinkState) {
          setLeds(true, true, true);
        } else {
          setLeds(false, false, false);
        }
      }
      if (ledBlinkCount == 0) {
        activeLedPattern = LED_NONE;
        setLeds(false, false, false);
      }
      break;

    case LED_UNKNOWN_STATUS:
    case LED_DUPLICATE_STATUS: {
      if (ledBlinkCount > 0 && (now - ledLastBlink) >= 100) {
        ledLastBlink  = now;
        ledBlinkState = !ledBlinkState;
        ledBlinkCount--;
        bool isUnknown = (activeLedPattern == LED_UNKNOWN_STATUS);
        if (ledBlinkState) {
          setLeds(false, !isUnknown, isUnknown);
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

void triggerErrorFeedback() {
#if CONFIG_LED_MODE == LED_MODE_LANE
  startLedPattern(LED_ALL_BLINK);
#else
  startLedPattern(LED_ERROR_STATUS);
#endif
}

void triggerDuplicateFeedback() {
#if CONFIG_LED_MODE == LED_MODE_LANE
  startLedPattern(LED_ALL_BLINK);
#else
  startLedPattern(LED_DUPLICATE_STATUS);
#endif
}

void triggerUnknownFeedback() {
#if CONFIG_LED_MODE == LED_MODE_LANE
  startLedPattern(LED_ALL_BLINK);
#else
  startLedPattern(LED_UNKNOWN_STATUS);
#endif
}

// ── Non-blocking Servo Sorter ───────────────────────────────────
void moveServoLane(const String& lane) {
#if ENABLE_SERVO
  if (!servoAttached) return;
  int targetAngle = (lane == "RIGHT") ? SERVO_RIGHT_ANGLE : SERVO_LEFT_ANGLE;
  Serial.println("[SERVO] Actuating sorting arm to " + String(targetAngle) + " deg (Lane: " + lane + ")");
  sortingServo.write(targetAngle);
  servoMoving = true;
  servoMoveStart = millis();
#endif
}

void updateServo() {
#if ENABLE_SERVO
  if (servoMoving && (millis() - servoMoveStart >= SERVO_HOLD_MS)) {
    sortingServo.write(SERVO_CENTER_ANGLE);
    servoMoving = false;
    Serial.println("[SERVO] Arm returned to center (" + String(SERVO_CENTER_ANGLE) + " deg).");
  }
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

    // Lane determination: cloud lane field when present, otherwise 10 kg rule
    const char* cloudLane = resDoc["lane"];
    String lane = "";
    if (cloudLane != nullptr && strlen(cloudLane) > 0) {
      lane = String(cloudLane);
      lane.toUpperCase();
    }
    if (lane != "LEFT" && lane != "RIGHT") {
      lane = (weight > 10.0) ? "RIGHT" : "LEFT";
    }

    // Drive LEDs per LED_MODE
#if CONFIG_LED_MODE == LED_MODE_LANE
    if (lane == "LEFT") {
      startLedPattern(LED_SUCCESS_LEFT);  // Green solid
    } else {
      startLedPattern(LED_SUCCESS_RIGHT); // Red solid
    }
#else
    startLedPattern(LED_SUCCESS_STATUS);  // Green solid
#endif

    String line1 = String(prodName);
    String line2 = "Wt: " + String(weight, 2) + "kg (SIM)";
    String line3 = "Lane: " + lane + " | Exp: " + String(expiry);
    String line4 = isQueuedReplay ? "Status: REPLAY OK" : "Status: CLOUD OK";

    showDisplay(line1, line2, line3, line4);
    moveServoLane(lane);
    return true;
  } 
  else if (strcmp(result, "duplicate") == 0) {
    triggerDuplicateFeedback();
    showDisplay("DUPLICATE SCAN", "Tag: " + uid, "Already recorded", "Status: DUPLICATE");
    return true;
  } 
  else if (strcmp(result, "unknown_tag") == 0) {
    triggerUnknownFeedback();
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
    startLedPattern(LED_OFFLINE_BLINK); // Yellow slow blink

    String lane = (found->weight_kg > 10.0) ? "RIGHT" : "LEFT";

    String line1 = String(found->name) + " (OFFLINE)";
    String line2 = "Wt: " + String(found->weight_kg, 2) + "kg (SIM)";
    String line3 = "Lane: " + lane + " | ~" + String(found->shelf_life_days) + "d";
    String line4 = "Status: QUEUED";
    showDisplay(line1, line2, line3, line4);

    moveServoLane(lane);

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
    triggerUnknownFeedback();
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
      delay(300);
    } else {
      Serial.println("[QUEUE] Cloud request failed during replay. Pausing flush.");
      break;
    }
  }
}
