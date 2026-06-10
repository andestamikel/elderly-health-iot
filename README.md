# Sistem Pemantauan dan Identifikasi Kesehatan Lansia Menggunakan Logika Fuzzy Berbasis IoT

Template ini berisi dashboard monitoring kesehatan lansia dengan ESP32, MQTT, backend Node.js, Socket.IO, PostgreSQL/TimescaleDB, dan frontend React/Vite.

## Fitur

- Dashboard realtime: status NORMAL, WASPADA, BAHAYA.
- Data sensor: suhu, heart rate, SpO2, baterai, tanggal, waktu.
- Logika fuzzy di backend untuk menentukan status kesehatan.
- Simulasi data otomatis tanpa ESP32.
- Penyimpanan data historis ke PostgreSQL/TimescaleDB.
- Siap dihubungkan ke HiveMQ Cloud.
- Frontend React/Vite, siap deploy ke Vercel.
- Backend dapat dibuka ke internet memakai Cloudflare Named Tunnel.

## Struktur folder

```text
elderly-health-iot/
├── backend/
│   ├── src/
│   │   ├── db.js
│   │   ├── fuzzy.js
│   │   ├── index.js
│   │   ├── mqttClient.js
│   │   └── simulator.js
│   ├── sql/init.sql
│   ├── Dockerfile
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   └── styles.css
│   ├── Dockerfile
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
├── docker-compose.yml
├── .env.example
└── README.md
```

## Cara menjalankan dengan Docker

1. Salin file environment.

```bash
cp .env.example .env
```

2. Jalankan semua service.

```bash
docker compose up --build
```

3. Buka dashboard.

```text
http://localhost:5173
```

Backend berjalan di:

```text
http://localhost:4000
```

## Test tanpa ESP32

Secara default `SIMULATOR_ENABLE=true`, sehingga data akan berubah sendiri setiap beberapa detik.

Kirim data manual:

```bash
curl -X POST http://localhost:4000/api/readings \
  -H "Content-Type: application/json" \
  -d '{"deviceId":"esp32-lansia-01","temperature":36.6,"heartRate":85,"spo2":96,"battery":90}'
```

## Format JSON dari ESP32 ke MQTT

Topic default:

```text
elderly/monitoring/data
```

Payload:

```json
{
  "deviceId": "esp32-lansia-01",
  "temperature": 36.6,
  "heartRate": 85,
  "spo2": 96,
  "battery": 90
}
```

## Mengaktifkan HiveMQ Cloud

Edit file `.env`:

```env
MQTT_ENABLE=true
MQTT_URL=mqtts://cluster-url-hivemq:8883
MQTT_USERNAME=username_hivemq
MQTT_PASSWORD=password_hivemq
MQTT_TOPIC=elderly/monitoring/data
SIMULATOR_ENABLE=false
```

Lalu restart backend:

```bash
docker compose up --build
```

## Deploy Frontend ke Vercel

Di Vercel, set environment variable frontend:

```env
VITE_API_URL=https://api-domain-anda.com
```

Vite membaca environment variable yang diawali `VITE_`.

## Cloudflare Named Tunnel untuk Backend

Backend lokal berjalan di port 4000. Named tunnel diarahkan ke:

```text
http://localhost:4000
```

Setelah punya domain API, masukkan domain itu ke `VITE_API_URL` di Vercel dan `CORS_ORIGIN` di backend.

## Rumus status fuzzy ringkas

Backend menghitung membership suhu, heart rate, SpO2, dan baterai. Output fuzzy dibuat sebagai skor risiko:

- NORMAL: skor risiko < 40
- WASPADA: skor risiko 40 sampai kurang dari 70
- BAHAYA: skor risiko >= 70

Aturan utama:

- SpO2 rendah, heart rate terlalu rendah/tinggi, atau suhu ekstrem menaikkan status menjadi BAHAYA.
- SpO2 sedang, baterai rendah, suhu mulai tidak normal, atau heart rate mulai tidak normal menaikkan status menjadi WASPADA.
- Suhu normal, heart rate normal, dan SpO2 normal menghasilkan status NORMAL.

## Menjalankan Cloudflare Tunnel dari Docker

Setelah membuat Named Tunnel dari dashboard Cloudflare, isi token di `.env`:

```env
CLOUDFLARED_TOKEN=token_dari_cloudflare
```

Jalankan profile tunnel:

```bash
docker compose --profile tunnel up --build
```

## Contoh program ESP32

Contoh file Arduino tersedia di:

```text
esp32/esp32_mqtt_sample.ino
```

File tersebut masih memakai data dummy pada fungsi `readTemperature()`, `readHeartRate()`, dan `readSpo2()`. Ganti fungsi tersebut dengan pembacaan library MAX30102 dan MAX30205 yang dipakai.
