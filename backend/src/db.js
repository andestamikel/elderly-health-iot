import pg from 'pg';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000
});

async function ensureSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS participants (
      id BIGSERIAL PRIMARY KEY,
      code VARCHAR(20) NOT NULL UNIQUE,
      alias TEXT NOT NULL,
      age INTEGER,
      gender VARCHAR(20),
      notes TEXT,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT participants_age_check CHECK (age IS NULL OR (age >= 0 AND age <= 120))
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS measurement_sessions (
      id BIGSERIAL PRIMARY KEY,
      participant_id BIGINT NOT NULL REFERENCES participants(id) ON DELETE RESTRICT,
      device_id TEXT NOT NULL,
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ended_at TIMESTAMPTZ,
      condition TEXT,
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT measurement_sessions_time_check CHECK (ended_at IS NULL OR ended_at >= started_at)
    )
  `);

  await pool.query(`
    ALTER TABLE elderly_health_readings
    ADD COLUMN IF NOT EXISTS session_id BIGINT
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_measurement_sessions_one_active_device
    ON measurement_sessions (device_id)
    WHERE ended_at IS NULL
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_measurement_sessions_participant_time
    ON measurement_sessions (participant_id, started_at DESC)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_elderly_health_session_time
    ON elderly_health_readings (session_id, time DESC)
  `);
}

export async function waitForDb(maxAttempts = 20) {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await pool.query('SELECT 1');
      await ensureSchema();
      console.log('✅ Database connected and schema ready');
      return;
    } catch (error) {
      console.log(`⏳ Waiting for database... attempt ${attempt}/${maxAttempts}`);
      if (attempt === maxAttempts) {
        console.error(error);
      }
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }

  throw new Error('Database is not reachable after multiple attempts');
}

function readingSelect() {
  return `
    SELECT
      r.id,
      r.time,
      r.device_id AS "deviceId",
      r.temperature,
      r.heart_rate AS "heartRate",
      r.spo2,
      r.battery,
      r.status,
      r.risk_score AS "riskScore",
      r.raw,
      r.session_id AS "sessionId",
      s.participant_id AS "participantId",
      p.code AS "participantCode",
      p.alias AS "participantAlias",
      s.started_at AS "sessionStartedAt",
      s.ended_at AS "sessionEndedAt",
      s.condition AS "sessionCondition"
    FROM elderly_health_readings r
    LEFT JOIN measurement_sessions s ON s.id = r.session_id
    LEFT JOIN participants p ON p.id = s.participant_id
  `;
}

export async function insertReading(reading) {
  const query = `
    INSERT INTO elderly_health_readings
      (device_id, temperature, heart_rate, spo2, battery, status, risk_score, raw, session_id)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING id, time
  `;

  const values = [
    reading.deviceId,
    reading.temperature,
    reading.heartRate,
    reading.spo2,
    reading.battery,
    reading.status,
    reading.riskScore,
    reading.raw,
    reading.sessionId ?? null
  ];

  const inserted = await pool.query(query, values);
  const { id, time } = inserted.rows[0];

  const result = await pool.query(`
    ${readingSelect()}
    WHERE r.id = $1 AND r.time = $2
    LIMIT 1
  `, [id, time]);

  return result.rows[0];
}

export async function getLatestReading() {
  const result = await pool.query(`
    ${readingSelect()}
    ORDER BY r.time DESC
    LIMIT 1
  `);

  return result.rows[0] ?? null;
}

export async function getReadings({ limit = 100, sessionId = null, participantId = null } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 5000);
  const conditions = [];
  const values = [];

  if (sessionId) {
    values.push(Number(sessionId));
    conditions.push(`r.session_id = $${values.length}`);
  }

  if (participantId) {
    values.push(Number(participantId));
    conditions.push(`s.participant_id = $${values.length}`);
  }

  values.push(safeLimit);
  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const result = await pool.query(`
    ${readingSelect()}
    ${whereClause}
    ORDER BY r.time DESC
    LIMIT $${values.length}
  `, values);

  return result.rows;
}

export async function listParticipants() {
  const result = await pool.query(`
    SELECT
      p.id,
      p.code,
      p.alias,
      p.age,
      p.gender,
      p.notes,
      p.is_active AS "isActive",
      p.created_at AS "createdAt",
      COUNT(s.id)::INTEGER AS "sessionCount",
      MAX(s.started_at) AS "lastSessionAt"
    FROM participants p
    LEFT JOIN measurement_sessions s ON s.participant_id = p.id
    WHERE p.is_active = TRUE
    GROUP BY p.id
    ORDER BY p.created_at ASC
  `);

  return result.rows;
}

async function generateParticipantCode(client) {
  const result = await client.query(`
    SELECT COALESCE(MAX((SUBSTRING(code FROM 2))::INTEGER), 0) + 1 AS next_number
    FROM participants
    WHERE code ~ '^S[0-9]+$'
  `);

  const nextNumber = Number(result.rows[0]?.next_number || 1);
  return `S${String(nextNumber).padStart(2, '0')}`;
}

export async function createParticipant({ code, alias, age, gender, notes }) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const finalCode = String(code || '').trim().toUpperCase() || await generateParticipantCode(client);

    const result = await client.query(`
      INSERT INTO participants (code, alias, age, gender, notes)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING
        id,
        code,
        alias,
        age,
        gender,
        notes,
        is_active AS "isActive",
        created_at AS "createdAt"
    `, [
      finalCode,
      String(alias).trim(),
      age === null || age === undefined || age === '' ? null : Number(age),
      gender || null,
      notes ? String(notes).trim() : null
    ]);

    await client.query('COMMIT');
    return result.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

function sessionSelect() {
  return `
    SELECT
      s.id,
      s.participant_id AS "participantId",
      p.code AS "participantCode",
      p.alias AS "participantAlias",
      p.age AS "participantAge",
      p.gender AS "participantGender",
      s.device_id AS "deviceId",
      s.started_at AS "startedAt",
      s.ended_at AS "endedAt",
      s.condition,
      s.notes,
      s.created_at AS "createdAt"
    FROM measurement_sessions s
    JOIN participants p ON p.id = s.participant_id
  `;
}

export async function getActiveSession(deviceId) {
  const result = await pool.query(`
    ${sessionSelect()}
    WHERE s.device_id = $1 AND s.ended_at IS NULL
    ORDER BY s.started_at DESC
    LIMIT 1
  `, [deviceId]);

  return result.rows[0] ?? null;
}

export async function startMeasurementSession({ participantId, deviceId, condition, notes }) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const participant = await client.query(`
      SELECT id FROM participants
      WHERE id = $1 AND is_active = TRUE
      FOR UPDATE
    `, [participantId]);

    if (!participant.rowCount) {
      const error = new Error('Subjek pengujian tidak ditemukan');
      error.statusCode = 404;
      throw error;
    }

    const active = await client.query(`
      SELECT id FROM measurement_sessions
      WHERE device_id = $1 AND ended_at IS NULL
      FOR UPDATE
    `, [deviceId]);

    if (active.rowCount) {
      const error = new Error('Masih ada sesi aktif pada perangkat ini. Akhiri sesi tersebut terlebih dahulu.');
      error.statusCode = 409;
      throw error;
    }

    const inserted = await client.query(`
      INSERT INTO measurement_sessions
        (participant_id, device_id, condition, notes)
      VALUES ($1, $2, $3, $4)
      RETURNING id
    `, [
      Number(participantId),
      String(deviceId).trim(),
      condition ? String(condition).trim() : null,
      notes ? String(notes).trim() : null
    ]);

    const sessionId = inserted.rows[0].id;
    const result = await client.query(`
      ${sessionSelect()}
      WHERE s.id = $1
      LIMIT 1
    `, [sessionId]);

    await client.query('COMMIT');
    return result.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function endMeasurementSession(sessionId) {
  const result = await pool.query(`
    UPDATE measurement_sessions
    SET ended_at = COALESCE(ended_at, NOW())
    WHERE id = $1
    RETURNING id
  `, [sessionId]);

  if (!result.rowCount) return null;

  const session = await pool.query(`
    ${sessionSelect()}
    WHERE s.id = $1
    LIMIT 1
  `, [sessionId]);

  return session.rows[0] ?? null;
}

export async function listMeasurementSessions(participantId, limit = 50) {
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 500);
  const values = [];
  let whereClause = '';

  if (participantId) {
    values.push(Number(participantId));
    whereClause = `WHERE s.participant_id = $${values.length}`;
  }

  values.push(safeLimit);

  const result = await pool.query(`
    SELECT
      s.id,
      s.participant_id AS "participantId",
      p.code AS "participantCode",
      p.alias AS "participantAlias",
      s.device_id AS "deviceId",
      s.started_at AS "startedAt",
      s.ended_at AS "endedAt",
      s.condition,
      s.notes,
      COUNT(r.id)::INTEGER AS "readingCount",
      ROUND(AVG(r.heart_rate)::NUMERIC, 2)::DOUBLE PRECISION AS "avgHeartRate",
      ROUND(AVG(r.spo2)::NUMERIC, 2)::DOUBLE PRECISION AS "avgSpo2",
      ROUND(AVG(r.temperature)::NUMERIC, 2)::DOUBLE PRECISION AS "avgTemperature",
      ROUND(AVG(r.risk_score)::NUMERIC, 3)::DOUBLE PRECISION AS "avgRiskScore",
      MIN(r.heart_rate) AS "minHeartRate",
      MAX(r.heart_rate) AS "maxHeartRate",
      MIN(r.spo2) AS "minSpo2",
      MAX(r.spo2) AS "maxSpo2",
      MIN(r.temperature) AS "minTemperature",
      MAX(r.temperature) AS "maxTemperature"
    FROM measurement_sessions s
    JOIN participants p ON p.id = s.participant_id
    LEFT JOIN elderly_health_readings r ON r.session_id = s.id
    ${whereClause}
    GROUP BY s.id, p.id
    ORDER BY s.started_at DESC
    LIMIT $${values.length}
  `, values);

  return result.rows;
}

export async function getSessionSummary(sessionId) {
  const sessions = await listMeasurementSessions(null, 500);
  return sessions.find((session) => Number(session.id) === Number(sessionId)) ?? null;
}
