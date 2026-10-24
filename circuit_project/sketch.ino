#include <Wire.h>
#include <SPI.h>
#include <MFRC522.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <ESP32Servo.h>

#define RFID_SS 5
#define RFID_RST 21
#define IR_PIN 27
#define SERVO_PIN 25

#define GREEN_LED 13
#define YELLOW_LED 14
#define RED_LED 26
#define BUZZER 33

Adafruit_SSD1306 oled(128, 64, &Wire, -1);
MFRC522 rfid(RFID_SS, RFID_RST);
Servo sortingServo;

String product = "";
String uid = "";
float weight = 0;
int shelfLifeDays = 0;
bool parcelReady = false;
bool previousButton = HIGH;

void showOLED(String line1, String line2, String line3) {
  oled.clearDisplay();
  oled.setTextSize(1);
  oled.setTextColor(SSD1306_WHITE);
  oled.setCursor(0, 0);

  oled.println("SMART WAREHOUSE");
  oled.println("----------------");
  oled.println(line1);
  oled.println(line2);
  oled.println(line3);

  oled.display();
}

void setup() {
  Serial.begin(115200);

  pinMode(IR_PIN, INPUT_PULLUP);
  pinMode(GREEN_LED, OUTPUT);
  pinMode(YELLOW_LED, OUTPUT);
  pinMode(RED_LED, OUTPUT);
  pinMode(BUZZER, OUTPUT);

  Wire.begin(16, 22);
  oled.begin(SSD1306_SWITCHCAPVCC, 0x3C);

  SPI.begin(18, 19, 23, RFID_SS);
  rfid.PCD_Init();

  sortingServo.attach(SERVO_PIN);
  sortingServo.write(90);

  randomSeed(micros());

  digitalWrite(YELLOW_LED, HIGH);
  showOLED("SYSTEM ONLINE", "Scan RFID tag", "");

  Serial.println("SMART WAREHOUSE READY");
}

void loop() {

  // STEP 1: Scan RFID
  if (!parcelReady &&
      rfid.PICC_IsNewCardPresent() &&
      rfid.PICC_ReadCardSerial()) {

    uid = "";

    for (byte i = 0; i < rfid.uid.size; i++) {
      if (rfid.uid.uidByte[i] < 16) uid += "0";
      uid += String(rfid.uid.uidByte[i], HEX);
    }

    uid.toUpperCase();

    // Demo database
    if (uid == "01020304") {
      product = "Chips Packet";
      weight = 0.25;
      shelfLifeDays = random(150, 241);
    }
    else if (uid == "11223344") {
      product = "Rice Bag";
      weight = 15.0;
      shelfLifeDays = random(180, 366);
    }
    else if (uid == "55667788") {
      product = "Grocery Box";
      weight = 8.0;
      shelfLifeDays = random(30, 91);
    }
    else {
      product = "Unknown Item";
      weight = 0;
      shelfLifeDays = 0;
    }

    rfid.PICC_HaltA();
    rfid.PCD_StopCrypto1();

    if (product == "Unknown Item") {
      showOLED("Unknown RFID tag", "Registration needed", "");
      digitalWrite(RED_LED, HIGH);
      tone(BUZZER, 700, 200);
      delay(800);
      digitalWrite(RED_LED, LOW);
      showOLED("Scan RFID tag", "", "");
    }
    else {
      parcelReady = true;

      showOLED(product,
        "Weight: " + String(weight, 2) + " kg",
        "Demo life: " + String(shelfLifeDays) + "d");

      Serial.println("Product: " + product);
      Serial.println("UID: " + uid);
      Serial.println("Weight: " + String(weight));
      Serial.println("Press button to sort.");
    }
  }

  // STEP 2: Simulate IR detection with pushbutton
  bool buttonState = digitalRead(IR_PIN);

  if (parcelReady &&
      previousButton == HIGH &&
      buttonState == LOW) {

    digitalWrite(YELLOW_LED, LOW);
    String direction;

    if (weight > 10.0) {
      direction = "RIGHT";
      sortingServo.write(150);
      digitalWrite(RED_LED, HIGH);
    }
    else {
      direction = "LEFT";
      sortingServo.write(30);
      digitalWrite(GREEN_LED, HIGH);
    }

    showOLED(product,
      "Weight: " + String(weight, 2) + " kg",
      "SORTED: " + direction);

    // Output that will later go to cloud
    Serial.println("----- INVENTORY EVENT -----");
    Serial.println("RFID: " + uid);
    Serial.println("Product: " + product);
    Serial.println("Weight: " + String(weight, 2));
    Serial.println("Destination: " + direction);
    Serial.println("Simulated shelf life (days): " +
                   String(shelfLifeDays));
    Serial.println("---------------------------");

    tone(BUZZER, 1200, 150);

    delay(1500);

    sortingServo.write(90);
    digitalWrite(GREEN_LED, LOW);
    digitalWrite(RED_LED, LOW);
    digitalWrite(YELLOW_LED, HIGH);

    parcelReady = false;
    showOLED("SYSTEM READY", "Scan next tag", "");
  }

  previousButton = buttonState;
  delay(30);
}