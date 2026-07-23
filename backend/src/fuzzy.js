function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function trapmf(x, a, b, c, d) {
  if (a === b && x <= b) return 1;
  if (c === d && x >= c) return 1;
  if (x <= a || x >= d) return 0;
  if (x >= b && x <= c) return 1;
  if (x > a && x < b) return (x - a) / (b - a);
  if (x > c && x < d) return (d - x) / (d - c);
  return 0;
}

function trimf(x, a, b, c) {
  if (x <= a || x >= c) return 0;
  if (x === b) return 1;
  if (x > a && x < b) return (x - a) / (b - a);
  if (x > b && x < c) return (c - x) / (c - b);
  return 0;
}

function round2(value) {
  return Number(Number(value).toFixed(2));
}

function outputBahaya(z) {
  return trapmf(z, 0.0, 0.0, 0.2, 0.4);
}

function outputWaspada(z) {
  return trimf(z, 0.3, 0.5, 0.7);
}

function outputNormal(z) {
  return trapmf(z, 0.6, 0.8, 1.0, 1.0);
}

export function calculateFuzzyStatus({ temperature, heartRate, spo2 }) {
  const bpmInput = Number(heartRate);
  const spo2Input = Number(spo2);
  const suhuInput = Number(temperature);

  if (![bpmInput, spo2Input, suhuInput].every(Number.isFinite)) {
    return {
      riskScore: 0,
      fuzzyScore: 0,
      status: 'MENUNGGU',
      membership: null,
      strength: { danger: 0, warning: 0, normal: 0 }
    };
  }

  const bpm = clamp(bpmInput, 40, 180);
  const spo2Value = clamp(spo2Input, 80, 100);
  const suhu = clamp(suhuInput, 34, 40);

  const membership = {
    heartRate: {
      slow: trapmf(bpm, 40, 40, 55, 65),
      normal: trapmf(bpm, 55, 60, 100, 105),
      fast: trapmf(bpm, 95, 105, 180, 180)
    },
    spo2: {
      low: trapmf(spo2Value, 80, 80, 88, 92),
      warning: trimf(spo2Value, 90, 93, 96),
      normal: trapmf(spo2Value, 94, 96, 100, 100)
    },
    temperature: {
      low: trapmf(suhu, 34, 34, 35.5, 36.1),
      normal: trapmf(suhu, 35.8, 36.1, 37.2, 37.5),
      high: trapmf(suhu, 37.2, 38.0, 40.0, 40.0)
    }
  };

  let alphaBahaya = 0;
  let alphaWaspada = 0;
  let alphaNormal = 0;

  const min3 = (a, b, c) => Math.min(a, b, c);
  const addBahaya = (alpha) => { alphaBahaya = Math.max(alphaBahaya, alpha); };
  const addWaspada = (alpha) => { alphaWaspada = Math.max(alphaWaspada, alpha); };
  const addNormal = (alpha) => { alphaNormal = Math.max(alphaNormal, alpha); };

  const bpmLambat = membership.heartRate.slow;
  const bpmNormal = membership.heartRate.normal;
  const bpmCepat = membership.heartRate.fast;
  const spo2Rendah = membership.spo2.low;
  const spo2Waspada = membership.spo2.warning;
  const spo2Normal = membership.spo2.normal;
  const suhuRendah = membership.temperature.low;
  const suhuNormal = membership.temperature.normal;
  const suhuTinggi = membership.temperature.high;

  // 27 aturan Mamdani yang sama dengan ESP32 dan visualisasi dashboard.
  addBahaya(min3(bpmLambat, spo2Normal, suhuRendah));
  addWaspada(min3(bpmNormal, spo2Normal, suhuRendah));
  addBahaya(min3(bpmCepat, spo2Normal, suhuRendah));

  addWaspada(min3(bpmLambat, spo2Normal, suhuNormal));
  addNormal(min3(bpmNormal, spo2Normal, suhuNormal));
  addWaspada(min3(bpmCepat, spo2Normal, suhuNormal));

  addBahaya(min3(bpmLambat, spo2Normal, suhuTinggi));
  addWaspada(min3(bpmNormal, spo2Normal, suhuTinggi));
  addBahaya(min3(bpmCepat, spo2Normal, suhuTinggi));

  addBahaya(min3(bpmLambat, spo2Waspada, suhuRendah));
  addBahaya(min3(bpmNormal, spo2Waspada, suhuRendah));
  addBahaya(min3(bpmCepat, spo2Waspada, suhuRendah));

  addWaspada(min3(bpmLambat, spo2Waspada, suhuNormal));
  addWaspada(min3(bpmNormal, spo2Waspada, suhuNormal));
  addWaspada(min3(bpmCepat, spo2Waspada, suhuNormal));

  addBahaya(min3(bpmLambat, spo2Waspada, suhuTinggi));
  addBahaya(min3(bpmNormal, spo2Waspada, suhuTinggi));
  addBahaya(min3(bpmCepat, spo2Waspada, suhuTinggi));

  addBahaya(min3(bpmLambat, spo2Rendah, suhuRendah));
  addBahaya(min3(bpmNormal, spo2Rendah, suhuRendah));
  addBahaya(min3(bpmCepat, spo2Rendah, suhuRendah));

  addBahaya(min3(bpmLambat, spo2Rendah, suhuNormal));
  addBahaya(min3(bpmNormal, spo2Rendah, suhuNormal));
  addBahaya(min3(bpmCepat, spo2Rendah, suhuNormal));

  addBahaya(min3(bpmLambat, spo2Rendah, suhuTinggi));
  addBahaya(min3(bpmNormal, spo2Rendah, suhuTinggi));
  addBahaya(min3(bpmCepat, spo2Rendah, suhuTinggi));

  let numerator = 0;
  let denominator = 0;

  for (let index = 0; index <= 100; index += 1) {
    const z = index / 100;
    const muBahaya = Math.min(alphaBahaya, outputBahaya(z));
    const muWaspada = Math.min(alphaWaspada, outputWaspada(z));
    const muNormal = Math.min(alphaNormal, outputNormal(z));
    const aggregate = Math.max(muBahaya, muWaspada, muNormal);

    numerator += z * aggregate;
    denominator += aggregate;
  }

  if (denominator === 0) {
    return {
      riskScore: 0,
      fuzzyScore: 0,
      status: 'MENUNGGU',
      membership,
      strength: { danger: 0, warning: 0, normal: 0 }
    };
  }

  const fuzzyScore = numerator / denominator;
  const roundedScore = round2(fuzzyScore);

  let status = 'NORMAL';
  if (fuzzyScore < 0.4) status = 'BAHAYA';
  else if (fuzzyScore < 0.7) status = 'WASPADA';

  return {
    // Nama riskScore dipertahankan agar kompatibel dengan database dan frontend lama.
    // Nilainya tetap berada pada semesta 0 sampai 1.
    riskScore: roundedScore,
    fuzzyScore: roundedScore,
    status,
    membership: {
      heartRate: Object.fromEntries(Object.entries(membership.heartRate).map(([key, value]) => [key, round2(value)])),
      spo2: Object.fromEntries(Object.entries(membership.spo2).map(([key, value]) => [key, round2(value)])),
      temperature: Object.fromEntries(Object.entries(membership.temperature).map(([key, value]) => [key, round2(value)]))
    },
    strength: {
      danger: round2(alphaBahaya),
      warning: round2(alphaWaspada),
      normal: round2(alphaNormal)
    }
  };
}

export function validateSensorPayload(payload = {}) {
  const batteryValue = payload.battery ?? payload.baterai;

  const reading = {
    deviceId: payload.deviceId || payload.device_id || process.env.DEVICE_ID || 'esp32-lansia-01',
    temperature: Number(payload.temperature ?? payload.suhu),
    heartRate: Number(payload.heartRate ?? payload.heart_rate ?? payload.hr),
    spo2: Number(payload.spo2 ?? payload.spo ?? payload.SpO2),
    // Baterai tidak menjadi input fuzzy. Nilai default menjaga kompatibilitas payload lama.
    battery: batteryValue === undefined || batteryValue === null || batteryValue === ''
      ? 90
      : Number(batteryValue)
  };

  const errors = [];
  if (!Number.isFinite(reading.temperature)) errors.push('temperature/suhu harus angka');
  if (!Number.isFinite(reading.heartRate)) errors.push('heartRate harus angka');
  if (!Number.isFinite(reading.spo2)) errors.push('spo2 harus angka');
  if (!Number.isFinite(reading.battery)) errors.push('battery/baterai harus angka');

  if (reading.temperature < 25 || reading.temperature > 45) errors.push('temperature di luar rentang 25-45°C');
  if (reading.heartRate < 20 || reading.heartRate > 220) errors.push('heartRate di luar rentang 20-220 bpm');
  if (reading.spo2 < 50 || reading.spo2 > 100) errors.push('spo2 di luar rentang 50-100%');
  if (reading.battery < 0 || reading.battery > 100) errors.push('battery di luar rentang 0-100%');

  return { reading, errors };
}
