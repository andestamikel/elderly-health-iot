import pg from 'pg';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000
});

export async function waitForDb(maxAttempts = 20) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await pool.query('SELECT 1');
      console.log('✅ Database connected');
      return;
    } catch (error) {
      console.log(`⏳ Waiting for database... attempt ${attempt}/${maxAttempts}`);
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }
  throw new Error('Database is not reachable after multiple attempts');
}

export async function insertReading(reading) {
  const query = `
    INSERT INTO elderly_health_readings
      (device_id, temperature, heart_rate, spo2, battery, status, risk_score, raw)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING
      id,
      time,
      device_id AS "deviceId",
      temperature,
      heart_rate AS "heartRate",
      spo2,
      battery,
      status,
      risk_score AS "riskScore",
      raw
  `;

  const values = [
    reading.deviceId,
    reading.temperature,
    reading.heartRate,
    reading.spo2,
    reading.battery,
    reading.status,
    reading.riskScore,
    reading.raw
  ];

  const result = await pool.query(query, values);
  return result.rows[0];
}

export async function getLatestReading() {
  const result = await pool.query(`
    SELECT
      id,
      time,
      device_id AS "deviceId",
      temperature,
      heart_rate AS "heartRate",
      spo2,
      battery,
      status,
      risk_score AS "riskScore",
      raw
    FROM elderly_health_readings
    ORDER BY time DESC
    LIMIT 1
  `);
  return result.rows[0] ?? null;
}

export async function getReadings(limit = 100) {
  const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 500);
  const result = await pool.query(`
    SELECT
      id,
      time,
      device_id AS "deviceId",
      temperature,
      heart_rate AS "heartRate",
      spo2,
      battery,
      status,
      risk_score AS "riskScore",
      raw
    FROM elderly_health_readings
    ORDER BY time DESC
    LIMIT $1
  `, [safeLimit]);
  return result.rows;
}
