CREATE EXTENSION IF NOT EXISTS timescaledb;

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
  PRIMARY KEY (id, time)
);

SELECT create_hypertable('elderly_health_readings', 'time', if_not_exists => TRUE);

CREATE INDEX IF NOT EXISTS idx_elderly_health_time_desc ON elderly_health_readings (time DESC);
CREATE INDEX IF NOT EXISTS idx_elderly_health_device_time ON elderly_health_readings (device_id, time DESC);
