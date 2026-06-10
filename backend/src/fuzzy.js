function clamp(value, min = 0, max = 1) {
  return Math.min(Math.max(value, min), max);
}

function triangular(x, a, b, c) {
  if (x <= a || x >= c) return 0;
  if (x === b) return 1;
  if (x < b) return clamp((x - a) / (b - a));
  return clamp((c - x) / (c - b));
}

function trapezoid(x, a, b, c, d) {
  if (x <= a || x >= d) return 0;
  if (x >= b && x <= c) return 1;
  if (x > a && x < b) return clamp((x - a) / (b - a));
  return clamp((d - x) / (d - c));
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

export function calculateFuzzyStatus({ temperature, heartRate, spo2, battery }) {
  const suhu = Number(temperature);
  const hr = Number(heartRate);
  const oxygen = Number(spo2);
  const batt = Number(battery);

  const membership = {
    temperature: {
      low: trapezoid(suhu, 25, 25, 35.0, 36.0),
      normal: triangular(suhu, 35.5, 36.6, 37.5),
      high: trapezoid(suhu, 37.0, 38.0, 42.0, 42.0)
    },
    heartRate: {
      low: trapezoid(hr, 0, 0, 50, 62),
      normal: triangular(hr, 55, 78, 105),
      high: trapezoid(hr, 98, 118, 200, 200)
    },
    spo2: {
      low: trapezoid(oxygen, 0, 0, 88, 92),
      medium: triangular(oxygen, 90, 93, 96),
      normal: trapezoid(oxygen, 94, 96, 100, 100)
    },
    battery: {
      low: trapezoid(batt, 0, 0, 15, 30),
      normal: trapezoid(batt, 20, 40, 100, 100)
    }
  };

  const dangerStrength = Math.max(
    membership.temperature.low,
    membership.temperature.high,
    membership.heartRate.low,
    membership.heartRate.high,
    membership.spo2.low
  );

  const warningStrength = Math.max(
    Math.min(1 - membership.temperature.normal, 0.85),
    Math.min(1 - membership.heartRate.normal, 0.85),
    membership.spo2.medium,
    membership.battery.low
  );

  const normalStrength = Math.min(
    membership.temperature.normal,
    membership.heartRate.normal,
    membership.spo2.normal,
    membership.battery.normal
  );

  const weightedSum = (normalStrength * 20) + (warningStrength * 60) + (dangerStrength * 95);
  const totalStrength = normalStrength + warningStrength + dangerStrength || 1;
  const riskScore = round2(weightedSum / totalStrength);

  let status = 'NORMAL';
  if (riskScore >= 70 || dangerStrength >= 0.65) status = 'BAHAYA';
  else if (riskScore >= 40 || warningStrength >= 0.5) status = 'WASPADA';

  return {
    status,
    riskScore,
    membership: {
      temperature: Object.fromEntries(Object.entries(membership.temperature).map(([key, value]) => [key, round2(value)])),
      heartRate: Object.fromEntries(Object.entries(membership.heartRate).map(([key, value]) => [key, round2(value)])),
      spo2: Object.fromEntries(Object.entries(membership.spo2).map(([key, value]) => [key, round2(value)])),
      battery: Object.fromEntries(Object.entries(membership.battery).map(([key, value]) => [key, round2(value)]))
    },
    strength: {
      normal: round2(normalStrength),
      warning: round2(warningStrength),
      danger: round2(dangerStrength)
    }
  };
}

export function validateSensorPayload(payload) {
  const reading = {
    deviceId: payload.deviceId || payload.device_id || process.env.DEVICE_ID || 'esp32-lansia-01',
    temperature: Number(payload.temperature ?? payload.suhu),
    heartRate: Number(payload.heartRate ?? payload.heart_rate ?? payload.hr),
    spo2: Number(payload.spo2 ?? payload.spo ?? payload.SpO2),
    battery: Number(payload.battery ?? payload.baterai)
  };

  const errors = [];
  if (!Number.isFinite(reading.temperature)) errors.push('temperature/suhu harus angka');
  if (!Number.isFinite(reading.heartRate)) errors.push('heartRate harus angka');
  if (!Number.isFinite(reading.spo2)) errors.push('spo2 harus angka');
  if (!Number.isFinite(reading.battery)) errors.push('battery/baterai harus angka');

  if (reading.temperature < 25 || reading.temperature > 45) errors.push('temperature di luar rentang aman 25-45°C');
  if (reading.heartRate < 20 || reading.heartRate > 220) errors.push('heartRate di luar rentang 20-220 bpm');
  if (reading.spo2 < 50 || reading.spo2 > 100) errors.push('spo2 di luar rentang 50-100%');
  if (reading.battery < 0 || reading.battery > 100) errors.push('battery di luar rentang 0-100%');

  return { reading, errors };
}
