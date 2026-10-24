#include <Wire.h>
#include <SPI.h>
#include <MFRC522.h>
#include <U8g2lib.h>
#include <ESP32Servo.h>

// ===================================
// CLOUD NEXUS - FINAL DEMO CODE
// ONE RFID TAG = THREE PRODUCTS
// ===================================

// OLED
#define OLED_SDA 16
#define OLED_SCL 22

// RFID
#define RFID_SS 5
#define RFID_RST 21

// IR and servo
#define IR_PIN 27
#define SERVO_PIN 25

// LEDs
#define GREEN_LED 13
#define YELLOW_LED 14
#define RED_LED 26

// IR module normally returns LOW
// when an object is detected
const bool IR_ACTIVE_LOW = true;

// Servo positions
const int LEFT_ANGLE = 30;
const int CENTER_ANGLE = 90;
const int RIGHT_ANGLE = 150;

// Your working 1.3-inch SH1106 OLED
U8G2_SH1106_128X64_NONAME_F_HW_I2C oled(
  U8G2_R0, U8X8_PIN_NONE
);

MFRC522 rfid(RFID_SS, RFID_RST);
Servo gate;

// Demo product database
const char* productNames[] = {
  "CHIPS",
  "RICE BAG",
  "GROCERY BOX"
};

const float productWeights[] = {
  0.25,
  15.0,
  8.0
};

// Simulated shelf life, in days
const int shelfLife[] = {
  180,
  365,
  90
};

// Single RFID demo mode
int nextProduct = 0;
int selectedProduct = -1;

String scannedUID = "";

bool waitingForParcel = false;
bool irArmed = false;
bool previousIR = false;

unsigned long clearStart = 0;

// ===================================
// OLED DISPLAY
// ===================================
void showOLED(String line1,
              String line2 = "",
              String line3 = "") {

  oled.clearBuffer();
  oled.setFont(u8g2_font_6x10_tf);

  oled.drawStr(0, 11, "CLOUD NEXUS");
  oled.drawHLine(0, 15, 128);

  oled.drawStr(0, 29, line1.c_str());
  oled.drawStr(0, 43, line2.c_str());
  oled.drawStr(0, 57, line3.c_str());

  oled.sendBuffer();
}

// ===================================
// LED FUNCTIONS
// ===================================
void allLEDsOff() {
  digitalWrite(GREEN_LED, LOW);
  digitalWrite(YELLOW_LED, LOW);
  digitalWrite(RED_LED, LOW);
}

void readyLED() {
  allLEDsOff();
  digitalWrite(YELLOW_LED, HIGH);
}

void leftLED() {
  allLEDsOff();
  digitalWrite(GREEN_LED, HIGH);
}

void rightLED() {
  allLEDsOff();
  digitalWrite(RED_LED, HIGH);
}

// ===================================
// IR SENSOR
// ===================================
bool objectDetected() {
  int value = digitalRead(IR_PIN);

  if (IR_ACTIVE_LOW) {
    return value == LOW;
  }

  return value == HIGH;
}

// ===================================
// RFID UID READER
// ===================================
String readUID() {
  String uid = "";

  for (byte i = 0; i < rfid.uid.size; i++) {

    if (rfid.uid.uidByte[i] < 16) {
      uid += "0";
    }

    uid += String(rfid.uid.uidByte[i], HEX);
  }

  uid.toUpperCase();
  return uid;
}

// ===================================
// SCAN RFID
// ===================================
void scanRFID() {

  if (waitingForParcel) return;

  if (!rfid.PICC_IsNewCardPresent()) return;
  if (!rfid.PICC_ReadCardSerial()) return;

  scannedUID = readUID();

  rfid.PICC_HaltA();
  rfid.PCD_StopCrypto1();

  // MAIN CHANGE:
  // Same tag cycles through 3 products
  selectedProduct = nextProduct;
  nextProduct = (nextProduct + 1) % 3;

  waitingForParcel = true;

  String name = productNames[selectedProduct];
  String weight =
    String(productWeights[selectedProduct], 2) + " kg";

  Serial.println();
  Serial.println("========= RFID SCAN =========");
  Serial.println("UID: " + scannedUID);
  Serial.println("Product: " + name);
  Serial.println("Weight: " + weight);
  Serial.println("Demo shelf life: " +
                 String(shelfLife[selectedProduct]) +
                 " days");
  Serial.println("Waiting for IR detection...");

  showOLED(
    name,
    "WT: " + weight,
    "Demo life: " +
    String(shelfLife[selectedProduct]) + "d"
  );

  readyLED();
}

// ===================================
// SORT PRODUCT
// ===================================
void sortProduct() {

  if (selectedProduct < 0) return;

  float weight = productWeights[selectedProduct];

  String direction;

  if (weight > 10.0) {

    direction = "RIGHT";
    gate.write(RIGHT_ANGLE);
    rightLED();

  } else {

    direction = "LEFT";
    gate.write(LEFT_ANGLE);
    leftLED();
  }

  showOLED(
    productNames[selectedProduct],
    "WT: " + String(weight, 2) + " kg",
    "SORTED: " + direction
  );

  Serial.println();
  Serial.println("====== SORTING COMPLETE ======");
  Serial.println("RFID: " + scannedUID);
  Serial.println("Product: " +
                 String(productNames[selectedProduct]));
  Serial.println("Weight: " +
                 String(weight, 2) + " kg");
  Serial.println("Sorting lane: " + direction);
  Serial.println("Demo shelf life: " +
                 String(shelfLife[selectedProduct]) +
                 " days");
  Serial.println("Cloud sync: NOT CONNECTED");
  Serial.println("==============================");

  // Hold sorting position
  delay(1500);

  // Return servo to center
  gate.write(CENTER_ANGLE);
  delay(400);

  waitingForParcel = false;
  selectedProduct = -1;
  scannedUID = "";

  irArmed = false;
  clearStart = 0;

  readyLED();

  showOLED(
    "SORT COMPLETE",
    "Scan next RFID"
  );

  delay(700);

  showOLED(
    "SYSTEM READY",
    "Scan RFID tag"
  );

  previousIR = objectDetected();
}

// ===================================
// SETUP
// ===================================
void setup() {

  Serial.begin(115200);
  delay(500);

  Serial.println();
  Serial.println("CLOUD NEXUS STARTING");

  // LEDs
  pinMode(GREEN_LED, OUTPUT);
  pinMode(YELLOW_LED, OUTPUT);
  pinMode(RED_LED, OUTPUT);

  allLEDsOff();

  // SH1106 OLED
  Wire.begin(OLED_SDA, OLED_SCL);
  oled.begin();

  showOLED(
    "STARTING SYSTEM",
    "Initializing..."
  );

  // RFID
  SPI.begin(18, 19, 23, RFID_SS);
  rfid.PCD_Init();

  // IR sensor
  pinMode(IR_PIN, INPUT);

  // Servo
  gate.setPeriodHertz(50);
  gate.attach(SERVO_PIN, 500, 2400);
  gate.write(CENTER_ANGLE);

  delay(700);

  readyLED();

  showOLED(
    "SYSTEM READY",
    "Scan RFID tag"
  );

  previousIR = objectDetected();

  Serial.println("RFID READY");
  Serial.println("SH1106 OLED READY");
  Serial.println("IR SENSOR CONFIGURED");
  Serial.println("SERVO CENTERED");
  Serial.println("ALL LEDs READY");
  Serial.println("SINGLE RFID DEMO MODE");
}

// ===================================
// MAIN LOOP
// ===================================
void loop() {

  // Step 1: Scan tag
  scanRFID();

  // Step 2: Check IR sensor
  bool present = objectDetected();

  // Sensor must be clear for 400 ms
  if (!present) {

    if (clearStart == 0) {
      clearStart = millis();
    }

    if (millis() - clearStart >= 400) {
      irArmed = true;
    }

  } else {
    clearStart = 0;
  }

  // Detect a new arriving object
  bool newObject = present && !previousIR;

  // Step 3: Sort automatically
  if (waitingForParcel &&
      irArmed &&
      newObject) {

    irArmed = false;
    sortProduct();
  }

  previousIR = objectDetected();

  delay(30);
}