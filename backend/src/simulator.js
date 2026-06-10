const randomBetween = (min, max, decimals = 0) => {
  const value = Math.random() * (max - min) + min;
  return Number(value.toFixed(decimals));
};

function pickScenario() {
  const roll = Math.random();

  if (roll < 0.68) {
    return {
      temperature: randomBetween(36.0, 37.2, 1),
      heartRate: randomBetween(68, 94),
      spo2: randomBetween(95, 99),
      battery: randomBetween(45, 100)
    };
  }

  if (roll < 0.9) {
    return {
      temperature: randomBetween(37.3, 38.3, 1),
      heartRate: randomBetween(96, 116),
      spo2: randomBetween(91, 95),
      battery: randomBetween(18, 65)
    };
  }

  return {
    temperature: randomBetween(38.5, 40.0, 1),
    heartRate: randomBetween(120, 145),
    spo2: randomBetween(84, 90),
    battery: randomBetween(5, 30)
  };
}

export function generateReading() {
  return {
    deviceId: process.env.DEVICE_ID || 'esp32-lansia-01',
    ...pickScenario()
  };
}

export function startSimulator(processReading) {
  const enabled = String(process.env.SIMULATOR_ENABLE || 'false') === 'true';
  if (!enabled) {
    console.log('ℹ️ Simulator disabled');
    return;
  }

  const intervalMs = Number(process.env.SIMULATOR_INTERVAL_MS || 2500);
  console.log(`🧪 Simulator enabled. Interval: ${intervalMs}ms`);

  setInterval(async () => {
    try {
      await processReading(generateReading(), 'simulator');
    } catch (error) {
      console.error('Simulator error:', error.message);
    }
  }, intervalMs);
}
