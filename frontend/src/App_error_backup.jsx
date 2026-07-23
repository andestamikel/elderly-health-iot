import { useEffect, useMemo, useState } from 'react';
import { io } from 'socket.io-client';
import {
  Activity,
  BatteryCharging,
  CalendarDays,
  Clock3,
  HeartPulse,
  Server,
  ShieldAlert,
  Signal,
  Thermometer,
  Wifi,
  Droplets
} from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || API_URL;

const themes = [
  { id: 'blue', label: 'Biru Medis', primary: '#2f80ed', accent: '#56ccf2' },
  { id: 'green', label: 'Hijau Tenang', primary: '#10b981', accent: '#6ee7b7' },
  { id: 'purple', label: 'Ungu Modern', primary: '#8b5cf6', accent: '#c084fc' },
  { id: 'orange', label: 'Oranye Hangat', primary: '#f97316', accent: '#fdba74' }
];

const statusInfo = {
  NORMAL: {
    label: 'NORMAL',
    note: 'Kondisi lansia dalam batas aman.',
    className: 'normal'
  },
  WASPADA: {
    label: 'WASPADA',
    note: 'Ada parameter yang mulai tidak normal.',
    className: 'warning'
  },
  BAHAYA: {
    label: 'BAHAYA',
    note: 'Segera lakukan pemeriksaan atau tindakan.',
    className: 'danger'
  }
};

function formatDateTime(value) {
  const date = value ? new Date(value) : new Date();
  return {
    date: new Intl.DateTimeFormat('id-ID', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    }).format(date),
    time: new Intl.DateTimeFormat('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).format(date)
  };
}

function numberValue(value, suffix = '') {
  if (value === undefined || value === null || Number.isNaN(Number(value))) return '-';
  return `${value}${suffix}`;
}

function MetricCard({ icon: Icon, title, value, unit, helper, danger }) {
  return (
    <div className={`metric-card ${danger ? 'metric-danger' : ''}`}>
      <div className="metric-icon">
        <Icon size={24} />
      </div>
      <div>
        <p>{title}</p>
        <h3>{value}<span>{unit}</span></h3>
        <small>{helper}</small>
      </div>
    </div>
  );
}

function BatteryBar({ value = 0 }) {
  const safeValue = Math.min(Math.max(Number(value) || 0, 0), 100);
  return (
    <div className="battery-box">
      <div className="battery-top">
        <span>Baterai Perangkat</span>
        <strong>{safeValue}%</strong>
      </div>
      <div className="battery-track">
        <div className="battery-fill" style={{ width: `${safeValue}%` }} />
      </div>
      <small>{safeValue <= 20 ? 'Baterai rendah, segera isi ulang.' : 'Baterai masih mencukupi.'}</small>
    </div>
  );
}

function MiniChart({ data }) {
  const points = useMemo(() => {
    const latest = [...data].reverse().slice(-18);
    if (!latest.length) return '';
    const width = 360;
    const height = 90;
    const scores = latest.map((item) => Number(item.riskScore) || 0);
    const max = 100;
    const min = 0;
    return scores.map((score, index) => {
      const x = latest.length === 1 ? width : (index / (latest.length - 1)) * width;
      const y = height - ((score - min) / (max - min)) * height;
      return `${x},${y}`;
    }).join(' ');
  }, [data]);

  return (
    <div className="chart-card">
      <div className="section-title">
        <div>
          <p>Grafik Risiko</p>
          <h3>Skor fuzzy realtime</h3>
        </div>
        <Activity size={22} />
      </div>
      <svg viewBox="0 0 360 90" role="img" aria-label="Grafik skor risiko fuzzy">
        <line x1="0" y1="54" x2="360" y2="54" />
        <line x1="0" y1="27" x2="360" y2="27" />
        {points ? <polyline points={points} /> : null}
      </svg>
      <div className="chart-labels">
        <span>0</span>
        <span>40 Waspada</span>
        <span>70 Bahaya</span>
        <span>100</span>
      </div>
    </div>
  );
}

export default function App() {
  const [latest, setLatest] = useState(null);
  const [history, setHistory] = useState([]);
  const [connected, setConnected] = useState(false);
  const [apiStatus, setApiStatus] = useState('checking');
  const [theme, setTheme] = useState(() => localStorage.getItem('elderly-theme') || 'blue');
  const [loadingSimulate, setLoadingSimulate] = useState(false);

  const selectedTheme = themes.find((item) => item.id === theme) || themes[0];
  const status = latest?.status || 'NORMAL';
  const currentStatus = statusInfo[status] || statusInfo.NORMAL;
  const dateTime = formatDateTime(latest?.time);

  useEffect(() => {
    document.documentElement.style.setProperty('--primary', selectedTheme.primary);
    document.documentElement.style.setProperty('--accent', selectedTheme.accent);
    localStorage.setItem('elderly-theme', selectedTheme.id);
  }, [selectedTheme]);

useEffect(() => {
  async function checkApiHealth() {
    try {
      const healthRes = await fetch(`${API_URL}/api/health`);
      const health = await healthRes.json();

      if (healthRes.ok && health.ok === true) {
        setApiStatus('online');
      } else {
        setApiStatus('offline');
      }
    } catch (error) {
      console.error('API health error:', error);
      setApiStatus('offline');
    }
  }

  async function loadInitialData() {
    try {
      const readingsRes = await fetch(`${API_URL}/api/readings?limit=30`);

      if (readingsRes.ok) {
        const readings = await readingsRes.json();
        setHistory(Array.isArray(readings) ? readings : []);
        setLatest(Array.isArray(readings) && readings.length ? readings[0] : null);
        return;
      }

      const latestRes = await fetch(`${API_URL}/api/latest`);
      const latestData = await latestRes.json();

      setLatest(latestData);
      setHistory(latestData ? [latestData] : []);
    } catch (error) {
      console.error('Load data error:', error);

      try {
        const latestRes = await fetch(`${API_URL}/api/latest`);
        const latestData = await latestRes.json();

        setLatest(latestData);
        setHistory(latestData ? [latestData] : []);
      } catch (fallbackError) {
        console.error('Fallback latest error:', fallbackError);
      }
    }
  }

  checkApiHealth();
  loadInitialData();

  const socket = io(SOCKET_URL, {
    transports: ['websocket', 'polling']
  });

  socket.on('connect', () => setConnected(true));
  socket.on('disconnect', () => setConnected(false));
const applyReading = (reading) => {
  if (!reading) return;

  setLatest(reading);

  setHistory((prev) => {
    const dataTanpaDuplikat = prev.filter(
      (item) => String(item.id) !== String(reading.id)
    );

    return [reading, ...dataTanpaDuplikat].slice(0, 30);
  });
};

// Mendukung semua nama event backend
socket.on('reading:new', applyReading);
socket.on('reading', applyReading);
socket.on('latest', applyReading);

// Cadangan jika Socket.IO terlambat atau terputus
const refreshTimer = window.setInterval(async () => {
  try {
    const response = await fetch(
      `${API_URL}/api/latest?t=${Date.now()}`,
      {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache',
        },
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();

    if (data) {
      applyReading(data);
    }
  } catch (error) {
    console.error('Gagal memperbarui data otomatis:', error);
  }
}, 2000);

return () => {
  window.clearInterval(refreshTimer);

  socket.off('reading:new', applyReading);
  socket.off('reading', applyReading);
  socket.off('latest', applyReading);

  socket.disconnect();
};
}, []);

  async function handleSimulate() {
    setLoadingSimulate(true);
    try {
      await fetch(`${API_URL}/api/simulate`, { method: 'POST' });
    } finally {
      setLoadingSimulate(false);
    }
  }

  return (
    <main className="dashboard-shell">
      <section className="hero-card">
        <div className="hero-bg" />
        <nav className="topbar">
          <div className="brand">
            <div className="brand-icon"><HeartPulse size={28} /></div>
            <div>
              <p>IoT Health Monitoring</p>
              <h1>Monitoring Kesehatan Lansia</h1>
            </div>
          </div>

          <div className="top-actions">
            <div className={`connection-pill ${connected ? 'connected' : ''}`}>
              <Wifi size={17} />
              {connected ? 'Realtime aktif' : 'Socket terputus'}
            </div>
            <div className={`connection-pill ${apiStatus === 'online' ? 'connected' : ''}`}>
              <Server size={17} />
              API {apiStatus === 'online' ? 'online' : 'offline'}
            </div>
          </div>
        </nav>

        <div className="hero-content">
          <div className="status-panel">
            <p className="eyebrow">Status Kesehatan Saat Ini</p>
            <div className={`status-badge ${currentStatus.className}`}>
              <ShieldAlert size={24} />
              {currentStatus.label}
            </div>
            <h2>{currentStatus.note}</h2>
            <p className="status-desc">
              Data berasal dari MAX30102, MLX90614, ESP32 MINI C3, lalu diproses menggunakan logika fuzzy di backend.
            </p>

            <div className="risk-score">
  <div>
    <span>Skor Fuzzy Mamdani</span>

    <strong>
      {Number.isFinite(Number(latest?.riskScore))
        ? Number(latest.riskScore).toFixed(2)
        : '-'}
    </strong>
  </div>

  <div className="risk-track">
    <div
      style={{
        width: `${
          Math.max(
            0,
            Math.min(1, Number(latest?.riskScore) || 0)
          ) * 100
        }%`,
      }}
    />
  </div>

  <small>
    0,00–0,39 Bahaya | 0,40–0,69 Waspada | 0,70–1,00 Normal
  </small>
</div>

          <div className="time-card">
            <div className="time-row">
              <CalendarDays size={22} />
              <div>
                <span>Tanggal</span>
                <strong>{dateTime.date}</strong>
              </div>
            </div>
            <div className="time-row">
              <Clock3 size={22} />
              <div>
                <span>Waktu</span>
                <strong>{dateTime.time}</strong>
              </div>
            </div>
            <button onClick={handleSimulate} disabled={loadingSimulate}>
              {loadingSimulate ? 'Mengirim...' : 'Test Data Dummy'}
            </button>
          </div>
        </div>
      </section>



      <section className="metric-grid">
        <MetricCard
          icon={Thermometer}
          title="Suhu Tubuh"
          value={numberValue(latest?.temperature)}
          unit=" °C"
          helper="Sensor MLX90614"
          danger={latest?.temperature >= 37.5 || latest?.temperature < 36}
        />
        <MetricCard
          icon={HeartPulse}
          title="Heart Rate"
          value={numberValue(latest?.heartRate)}
          unit=" bpm"
          helper="Sensor MAX30102"
          danger={latest?.heartRate > 100 || latest?.heartRate < 60}
        />
        <MetricCard
          icon={Droplets}
          title="SpO₂"
          value={numberValue(latest?.spo2)}
          unit=" %"
          helper="Kadar oksigen darah"
          danger={latest?.spo2 < 95}
        />
        <MetricCard
          icon={BatteryCharging}
          title="Baterai"
          value={numberValue(latest?.battery)}
          unit=" %"
          helper="LiPo 3.7V 800mAh"
          danger={latest?.battery <= 20}
        />
      </section>

      <section className="content-grid">
        <BatteryBar value={latest?.battery || 0} />
        <MiniChart data={history} />
      </section>

      <section className="table-card">
        <div className="section-title">
          <div>
            <p>Riwayat Monitoring</p>
            <h3>30 data terakhir</h3>
          </div>
          <Signal size={22} />
        </div>

        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Waktu</th>
                <th>Status</th>
                <th>Suhu</th>
                <th>Heart Rate</th>
                <th>SpO₂</th>
                <th>Baterai</th>
                <th>Risiko</th>
              </tr>
            </thead>
            <tbody>
              {history.length ? history.map((item) => {
                const itemTime = formatDateTime(item.time);
                const info = statusInfo[item.status] || statusInfo.NORMAL;
                return (
                  <tr key={`${item.id}-${item.time}`}>
                    <td>{itemTime.time}</td>
                    <td><span className={`table-status ${info.className}`}>{item.status}</span></td>
                    <td>{item.temperature} °C</td>
                    <td>{item.heartRate} bpm</td>
                    <td>{item.spo2} %</td>
                    <td>{item.battery} %</td>
                    <td>{item.riskScore}</td>
                  </tr>
                );
              }) : (
                <tr>
                  <td colSpan="7" className="empty-state">Belum ada data. Klik “Test Data Dummy” atau aktifkan simulator.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
