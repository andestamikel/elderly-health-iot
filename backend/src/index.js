import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import http from 'http';
import { Server } from 'socket.io';
import { calculateFuzzyStatus, validateSensorPayload } from './fuzzy.js';
import { getLatestReading, getReadings, insertReading, waitForDb } from './db.js';
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

async function processReading(payload, source = 'api') {
  const { reading, errors } = validateSensorPayload(payload);
  if (errors.length) {
    const error = new Error(errors.join(', '));
    error.statusCode = 400;
    throw error;
  }

  const fuzzy = calculateFuzzyStatus(reading);

  const saved = await insertReading({
    ...reading,
    status: fuzzy.status,
    riskScore: fuzzy.riskScore,
    raw: { ...payload, fuzzy, source }
  });

  const response = {
    ...saved,
    fuzzy,
    source
  };

  io.emit('reading:new', response);
  io.emit('status:update', {
    status: response.status,
    riskScore: response.riskScore,
    time: response.time
  });

  return response;
}

app.get('/api/health', async (_req, res) => {
  res.json({
    ok: true,
    service: 'elderly-health-backend',
    mqttEnabled: String(process.env.MQTT_ENABLE || 'false') === 'true',
    simulatorEnabled: String(process.env.SIMULATOR_ENABLE || 'false') === 'true',
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
    const readings = await getReadings(req.query.limit);
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
