/*
  Contoh pengiriman data ESP32 MINI 3C ke HiveMQ Cloud.
  Sesuaikan library sensor dengan modul yang dipakai:
  - MAX30102 untuk heart rate dan SpO2
  - MAX30205 untuk suhu tubuh
  - OLED 0.96 inch I2C untuk tampilan lokal

  Library umum yang sering dipakai:
  - WiFi.h
  - PubSubClient
  - ArduinoJson
  - Adafruit_GFX
  - Adafruit_SSD1306
*/

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

const char* WIFI_SSID = "NAMA_WIFI";
const char* WIFI_PASSWORD = "PASSWORD_WIFI";

const char* MQTT_HOST = "xxxxxxxx.s1.eu.hivemq.cloud";
const int MQTT_PORT = 8883;
const char* MQTT_USERNAME = "username_hivemq";
const char* MQTT_PASSWORD = "password_hivemq";
const char* MQTT_TOPIC = "elderly/monitoring/data";

WiFiClientSecure secureClient;
PubSubClient mqttClient(secureClient);

unsigned long lastPublish = 0;
const unsigned long publishInterval = 2500;

void connectWiFi() {
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi connected");
}

void connectMqtt() {
  while (!mqttClient.connected()) {
    String clientId = "esp32-lansia-" + String(random(0xffff), HEX);
    if (mqttClient.connect(clientId.c_str(), MQTT_USERNAME, MQTT_PASSWORD)) {
      Serial.println("MQTT connected");
    } else {
      Serial.print("MQTT failed, rc=");
      Serial.println(mqttClient.state());
      delay(2000);
    }
  }
}

float readTemperature() {
  // Ganti dengan pembacaan MAX30205 asli.
  return 36.5 + random(-5, 6) / 10.0;
}

int readHeartRate() {
  // Ganti dengan pembacaan MAX30102 asli.
  return random(70, 96);
}

int readSpo2() {
  // Ganti dengan pembacaan MAX30102 asli.
  return random(95, 100);
}

int readBatteryPercent() {
  // Untuk akurat, gunakan pembagi tegangan ke pin ADC dan kalibrasi.
  return 90;
}

void publishSensorData() {
  StaticJsonDocument<256> doc;
  doc["deviceId"] = "esp32-lansia-01";
  doc["temperature"] = readTemperature();
  doc["heartRate"] = readHeartRate();
  doc["spo2"] = readSpo2();
  doc["battery"] = readBatteryPercent();

  char buffer[256];
  size_t length = serializeJson(doc, buffer);
  mqttClient.publish(MQTT_TOPIC, buffer, length);

  Serial.print("Publish: ");
  Serial.println(buffer);
}

void setup() {
  Serial.begin(115200);
  randomSeed(analogRead(0));

  connectWiFi();

  // Untuk produksi sebaiknya gunakan root CA HiveMQ/Let’s Encrypt, bukan setInsecure.
  secureClient.setInsecure();

  mqttClient.setServer(MQTT_HOST, MQTT_PORT);
}

void loop() {
  if (!mqttClient.connected()) {
    connectMqtt();
  }
  mqttClient.loop();

  if (millis() - lastPublish >= publishInterval) {
    lastPublish = millis();
    publishSensorData();
  }
}
