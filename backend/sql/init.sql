CREATE EXTENSION IF NOT EXISTS timescaledb;

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
);

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
);

CREATE TABLE IF NOT EXISTS elderly_health_readings (
  id BIGSERIAL,
  time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  device_id TEXT NOT NULL,
  temperature DOUBLE PRECISION NOT NULL,
  heart_rate INTEGER NOT NULL,
  spo2 INTEGER NOT NULL,
  battery INTEGER NOT NULL,
  status TEXT NOT NULL,
  risk_score DOUBLE PRECISION NOT NULL,
  raw JSONB NOT NULL DEFAULT '{}'::jsonb,
  session_id BIGINT,
  PRIMARY KEY (id, time)
);

ALTER TABLE elderly_health_readings
ADD COLUMN IF NOT EXISTS session_id BIGINT;

SELECT create_hypertable('elderly_health_readings', 'time', if_not_exists => TRUE);

CREATE UNIQUE INDEX IF NOT EXISTS idx_measurement_sessions_one_active_device
  ON measurement_sessions (device_id)
  WHERE ended_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_measurement_sessions_participant_time
  ON measurement_sessions (participant_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_elderly_health_time_desc
  ON elderly_health_readings (time DESC);

CREATE INDEX IF NOT EXISTS idx_elderly_health_device_time
  ON elderly_health_readings (device_id, time DESC);

CREATE INDEX IF NOT EXISTS idx_elderly_health_session_time
  ON elderly_health_readings (session_id, time DESC);
