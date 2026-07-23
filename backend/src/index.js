import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import http from 'http';
import { Server } from 'socket.io';
import { calculateFuzzyStatus, validateSensorPayload } from './fuzzy.js';
import {
  createParticipant,
  endMeasurementSession,
  getActiveSession,
  getLatestReading,
  getReadings,
  getSessionSummary,
  insertReading,
  listMeasurementSessions,
  listParticipants,
  startMeasurementSession,
  waitForDb
} from './db.js';
import { startMqttClient } from './mqttClient.js';
import { generateReading, startSimulator } from './simulator.js';

const app = express();
const server = http.createServer(app);

const allowedOrigins = (process.env.CORS_ORIGIN || '*')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors({ origin: allowedOrigins.includes('*') ? '*' : allowedOrigins }));
app.use(express.json({ limit: '1mb' }));

const io = new Server(server, {
  cors: {
    origin: allowedOrigins.includes('*') ? '*' : allowedOrigins,
    methods: ['GET', 'POST']
  }
});

function positiveInteger(value, fieldName) {
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric <= 0) {
    const error = new Error(`${fieldName} harus berupa bilangan bulat positif`);
    error.statusCode = 400;
    throw error;
  }
  return numeric;
}

function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

async function processReading(payload, source = 'api') {
  const { reading, errors } = validateSensorPayload(payload);
  if (errors.length) {
    const error = new Error(errors.join(', '));
    error.statusCode = 400;
    throw error;
  }

  const fuzzy = calculateFuzzyStatus(reading);
  const activeSession = await getActiveSession(reading.deviceId);

  const saved = await insertReading({
    ...reading,
    status: fuzzy.status,
    riskScore: fuzzy.riskScore,
    sessionId: activeSession?.id ?? null,
    raw: {
      ...payload,
      fuzzy,
      source,
      sessionId: activeSession?.id ?? null,
      participantCode: activeSession?.participantCode ?? null
    }
  });

  const response = {
    ...saved,
    fuzzy,
    source,
    activeSession
  };

  io.emit('reading:new', response);
  io.emit('status:update', {
    status: response.status,
    riskScore: response.riskScore,
    time: response.time,
    sessionId: response.sessionId,
    participantCode: response.participantCode
  });

  return response;
}

app.get('/api/health', async (_req, res) => {
  res.json({
    ok: true,
    service: 'elderly-health-backend',
    mqttEnabled: String(process.env.MQTT_ENABLE || 'false') === 'true',
    simulatorEnabled: String(process.env.SIMULATOR_ENABLE || 'false') === 'true',
    subjectSessionEnabled: true,
    time: new Date().toISOString()
  });
});

app.get('/api/latest', async (_req, res, next) => {
  try {
    const latest = await getLatestReading();
    res.json(latest);
  } catch (error) {
    next(error);
  }
});

app.get('/api/readings', async (req, res, next) => {
  try {
    const readings = await getReadings({
      limit: req.query.limit,
      sessionId: req.query.sessionId || null,
      participantId: req.query.participantId || null
    });
    res.json(readings);
  } catch (error) {
    next(error);
  }
});

app.post('/api/readings', async (req, res, next) => {
  try {
    const saved = await processReading(req.body, 'api');
    res.status(201).json(saved);
  } catch (error) {
    next(error);
  }
});

app.post('/api/simulate', async (_req, res, next) => {
  try {
    const saved = await processReading(generateReading(), 'manual-simulator');
    res.status(201).json(saved);
  } catch (error) {
    next(error);
  }
});

app.get('/api/participants', async (_req, res, next) => {
  try {
    res.json(await listParticipants());
  } catch (error) {
    next(error);
  }
});

app.post('/api/participants', async (req, res, next) => {
  try {
    const alias = String(req.body.alias || '').trim();
    if (!alias) {
      const error = new Error('Alias atau nama singkat subjek wajib diisi');
      error.statusCode = 400;
      throw error;
    }

    const age = req.body.age === '' || req.body.age === null || req.body.age === undefined
      ? null
      : Number(req.body.age);

    if (age !== null && (!Number.isInteger(age) || age < 0 || age > 120)) {
      const error = new Error('Usia harus berupa bilangan bulat 0 sampai 120');
      error.statusCode = 400;
      throw error;
    }

    const allowedGenders = ['', 'L', 'P', 'LAINNYA'];
    const gender = String(req.body.gender || '').toUpperCase();
    if (!allowedGenders.includes(gender)) {
      const error = new Error('Jenis kelamin harus L, P, atau LAINNYA');
      error.statusCode = 400;
      throw error;
    }

    const participant = await createParticipant({
      code: req.body.code,
      alias,
      age,
      gender: gender || null,
      notes: req.body.notes
    });

    res.status(201).json(participant);
  } catch (error) {
    if (error.code === '23505') {
      error.statusCode = 409;
      error.message = 'Kode subjek sudah digunakan';
    }
    next(error);
  }
});

app.get('/api/sessions', async (req, res, next) => {
  try {
    const participantId = req.query.participantId
      ? positiveInteger(req.query.participantId, 'participantId')
      : null;

    const sessions = await listMeasurementSessions(participantId, req.query.limit);
    res.json(sessions);
  } catch (error) {
    next(error);
  }
});

app.get('/api/sessions/active', async (req, res, next) => {
  try {
    const deviceId = String(req.query.deviceId || process.env.DEVICE_ID || 'esp32-lansia-01').trim();
    res.json(await getActiveSession(deviceId));
  } catch (error) {
    next(error);
  }
});

app.get('/api/sessions/:id/summary', async (req, res, next) => {
  try {
    const sessionId = positiveInteger(req.params.id, 'id sesi');
    const summary = await getSessionSummary(sessionId);

    if (!summary) {
      return res.status(404).json({ message: 'Sesi tidak ditemukan' });
    }

    return res.json(summary);
  } catch (error) {
    return next(error);
  }
});

app.post('/api/sessions', async (req, res, next) => {
  try {
    const participantId = positiveInteger(req.body.participantId, 'participantId');
    const deviceId = String(req.body.deviceId || process.env.DEVICE_ID || 'esp32-lansia-01').trim();

    if (!deviceId) {
      const error = new Error('deviceId wajib diisi');
      error.statusCode = 400;
      throw error;
    }

    const session = await startMeasurementSession({
      participantId,
      deviceId,
      condition: req.body.condition,
      notes: req.body.notes
    });

    io.emit('session:update', { action: 'started', session });
    res.status(201).json(session);
  } catch (error) {
    next(error);
  }
});

app.post('/api/sessions/:id/end', async (req, res, next) => {
  try {
    const sessionId = positiveInteger(req.params.id, 'id sesi');
    const session = await endMeasurementSession(sessionId);

    if (!session) {
      return res.status(404).json({ message: 'Sesi tidak ditemukan' });
    }

    io.emit('session:update', { action: 'ended', session });
    return res.json(session);
  } catch (error) {
    return next(error);
  }
});

app.get('/api/sessions/:id/export.csv', async (req, res, next) => {
  try {
    const sessionId = positiveInteger(req.params.id, 'id sesi');
    const session = await getSessionSummary(sessionId);

    if (!session) {
      return res.status(404).json({ message: 'Sesi tidak ditemukan' });
    }

    const readings = await getReadings({ sessionId, limit: 5000 });
    const header = [
      'Kode_Subjek',
      'Alias',
      'ID_Sesi',
      'Waktu',
      'Device_ID',
      'Suhu_C',
      'BPM',
      'SpO2_Persen',
      'Skor_Fuzzy',
      'Status'
    ];

    const rows = readings
      .slice()
      .reverse()
      .map((reading) => [
        reading.participantCode,
        reading.participantAlias,
        reading.sessionId,
        reading.time,
        reading.deviceId,
        reading.temperature,
        reading.heartRate,
        reading.spo2,
        reading.riskScore,
        reading.status
      ]);

    const csv = [header, ...rows]
      .map((row) => row.map(csvEscape).join(','))
      .join('\r\n');

    const filename = `${session.participantCode}_sesi_${session.id}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(`\uFEFF${csv}`);
  } catch (error) {
    return next(error);
  }
});

io.on('connection', async (socket) => {
  console.log(`🔌 Socket connected: ${socket.id}`);

  try {
    const latest = await getLatestReading();
    if (latest) socket.emit('reading:new', latest);
  } catch (error) {
    socket.emit('server:error', { message: error.message });
  }

  socket.on('disconnect', () => {
    console.log(`🔌 Socket disconnected: ${socket.id}`);
  });
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(error.statusCode || 500).json({
    message: error.message || 'Internal server error'
  });
});

const port = Number(process.env.PORT || 4000);

await waitForDb();
startMqttClient(processReading);
startSimulator(processReading);

server.listen(port, () => {
  console.log(`🚀 Backend running on port ${port}`);
});
