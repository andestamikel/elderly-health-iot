import { useEffect, useMemo, useState } from 'react';
import { io } from 'socket.io-client';
import {
  Activity,
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


function MiniChart({ data }) {
  const points = useMemo(() => {
    const latest = [...data].reverse().slice(-18);
    if (!latest.length) return '';
    const width = 360;
    const height = 90;
    const scores = latest.map((item) => fuzzyToPercent(item.riskScore) || 0);
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
          <p>GRAFIK OUTPUT FUZZY MAMDANI</p>
          <h3>Nilai output fuzzy realtime</h3>
        </div>
        <Activity size={22} />
      </div>
      <svg viewBox="0 0 360 90" role="img" aria-label="Grafik skor risiko fuzzy">
        <line x1="0" y1="54" x2="360" y2="54" />
        <line x1="0" y1="27" x2="360" y2="27" />
        {points ? <polyline points={points} /> : null}
      </svg>
      <div className="chart-labels">
        <span>0,00 Bahaya</span>
        <span>0,40 Waspada</span>
        <span>0,70 Normal</span>
        <span>1,00</span>
      </div>
    </div>
  );
}

function fuzzyToPercent(value) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return 0;
  }

  return Math.max(0, Math.min(1, numericValue)) * 100;
}

const FUZZY_MEMBERSHIP_CONFIG = {
  bpm: {
    title: 'Keanggotaan Heart Rate',
    shortTitle: 'BPM',
    min: 40,
    max: 180,
    unit: 'bpm',
    sets: [
      { key: 'Lambat', label: 'Lambat', type: 'trap', params: [40, 40, 55, 65], color: '#ef4444' },
      { key: 'Normal', label: 'Normal', type: 'trap', params: [55, 60, 100, 105], color: '#10b981' },
      { key: 'Cepat', label: 'Cepat', type: 'trap', params: [95, 105, 180, 180], color: '#f59e0b' }
    ]
  },
  spo2: {
    title: 'Keanggotaan SpO2',
    shortTitle: 'SpO2',
    min: 80,
    max: 100,
    unit: '%',
    sets: [
      { key: 'Rendah', label: 'Rendah', type: 'trap', params: [80, 80, 88, 92], color: '#ef4444' },
      { key: 'Waspada', label: 'Waspada', type: 'tri', params: [90, 93, 96], color: '#f59e0b' },
      { key: 'Normal', label: 'Normal', type: 'trap', params: [94, 96, 100, 100], color: '#10b981' }
    ]
  },
  suhu: {
    title: 'Keanggotaan Suhu Tubuh',
    shortTitle: 'Suhu',
    min: 34,
    max: 40,
    unit: '\u00B0C',
    sets: [
      { key: 'Rendah', label: 'Rendah', type: 'trap', params: [34, 34, 35.5, 36.1], color: '#38bdf8' },
      { key: 'Normal', label: 'Normal', type: 'trap', params: [35.8, 36.1, 37.2, 37.5], color: '#10b981' },
      { key: 'Tinggi', label: 'Tinggi', type: 'trap', params: [37.2, 38, 40, 40], color: '#ef4444' }
    ]
  },
  output: {
    title: 'Keanggotaan Output Fuzzy',
    shortTitle: 'Output',
    min: 0,
    max: 1,
    unit: '',
    sets: [
      { key: 'BAHAYA', label: 'Bahaya', type: 'trap', params: [0, 0, 0.2, 0.4], color: '#ef4444' },
      { key: 'WASPADA', label: 'Waspada', type: 'tri', params: [0.3, 0.5, 0.7], color: '#f59e0b' },
      { key: 'NORMAL', label: 'Normal', type: 'trap', params: [0.6, 0.8, 1, 1], color: '#10b981' }
    ]
  }
};

const FUZZY_RULES = [
  { id: 1, bpm: 'Lambat', spo2: 'Normal', suhu: 'Rendah', output: 'BAHAYA' },
  { id: 2, bpm: 'Normal', spo2: 'Normal', suhu: 'Rendah', output: 'WASPADA' },
  { id: 3, bpm: 'Cepat', spo2: 'Normal', suhu: 'Rendah', output: 'BAHAYA' },
  { id: 4, bpm: 'Lambat', spo2: 'Normal', suhu: 'Normal', output: 'WASPADA' },
  { id: 5, bpm: 'Normal', spo2: 'Normal', suhu: 'Normal', output: 'NORMAL' },
  { id: 6, bpm: 'Cepat', spo2: 'Normal', suhu: 'Normal', output: 'WASPADA' },
  { id: 7, bpm: 'Lambat', spo2: 'Normal', suhu: 'Tinggi', output: 'BAHAYA' },
  { id: 8, bpm: 'Normal', spo2: 'Normal', suhu: 'Tinggi', output: 'WASPADA' },
  { id: 9, bpm: 'Cepat', spo2: 'Normal', suhu: 'Tinggi', output: 'BAHAYA' },

  { id: 10, bpm: 'Lambat', spo2: 'Waspada', suhu: 'Rendah', output: 'BAHAYA' },
  { id: 11, bpm: 'Normal', spo2: 'Waspada', suhu: 'Rendah', output: 'BAHAYA' },
  { id: 12, bpm: 'Cepat', spo2: 'Waspada', suhu: 'Rendah', output: 'BAHAYA' },
  { id: 13, bpm: 'Lambat', spo2: 'Waspada', suhu: 'Normal', output: 'WASPADA' },
  { id: 14, bpm: 'Normal', spo2: 'Waspada', suhu: 'Normal', output: 'WASPADA' },
  { id: 15, bpm: 'Cepat', spo2: 'Waspada', suhu: 'Normal', output: 'WASPADA' },
  { id: 16, bpm: 'Lambat', spo2: 'Waspada', suhu: 'Tinggi', output: 'BAHAYA' },
  { id: 17, bpm: 'Normal', spo2: 'Waspada', suhu: 'Tinggi', output: 'BAHAYA' },
  { id: 18, bpm: 'Cepat', spo2: 'Waspada', suhu: 'Tinggi', output: 'BAHAYA' },

  { id: 19, bpm: 'Lambat', spo2: 'Rendah', suhu: 'Rendah', output: 'BAHAYA' },
  { id: 20, bpm: 'Normal', spo2: 'Rendah', suhu: 'Rendah', output: 'BAHAYA' },
  { id: 21, bpm: 'Cepat', spo2: 'Rendah', suhu: 'Rendah', output: 'BAHAYA' },
  { id: 22, bpm: 'Lambat', spo2: 'Rendah', suhu: 'Normal', output: 'BAHAYA' },
  { id: 23, bpm: 'Normal', spo2: 'Rendah', suhu: 'Normal', output: 'BAHAYA' },
  { id: 24, bpm: 'Cepat', spo2: 'Rendah', suhu: 'Normal', output: 'BAHAYA' },
  { id: 25, bpm: 'Lambat', spo2: 'Rendah', suhu: 'Tinggi', output: 'BAHAYA' },
  { id: 26, bpm: 'Normal', spo2: 'Rendah', suhu: 'Tinggi', output: 'BAHAYA' },
  { id: 27, bpm: 'Cepat', spo2: 'Rendah', suhu: 'Tinggi', output: 'BAHAYA' }
];

function clampNumber(value, minimum, maximum) {
  return Math.min(Math.max(Number(value), minimum), maximum);
}

function trapMembership(value, a, b, c, d) {
  const x = Number(value);

  if (!Number.isFinite(x)) return 0;
  if (a === b && x <= b) return 1;
  if (c === d && x >= c) return 1;
  if (x <= a || x >= d) return 0;
  if (x >= b && x <= c) return 1;
  if (x > a && x < b) return (x - a) / (b - a);
  if (x > c && x < d) return (d - x) / (d - c);
  return 0;
}

function triangleMembership(value, a, b, c) {
  const x = Number(value);

  if (!Number.isFinite(x) || x <= a || x >= c) return 0;
  if (x === b) return 1;
  if (x > a && x < b) return (x - a) / (b - a);
  if (x > b && x < c) return (c - x) / (c - b);
  return 0;
}

function evaluateMembershipSet(value, set) {
  if (set.type === 'tri') {
    return triangleMembership(value, ...set.params);
  }

  return trapMembership(value, ...set.params);
}

function getMembershipValues(value, config) {
  return Object.fromEntries(
    config.sets.map((set) => [
      set.key,
      evaluateMembershipSet(value, set)
    ])
  );
}

function calculateFuzzyVisualization(latest) {
  const rawBpm = Number(latest?.heartRate);
  const rawSpo2 = Number(latest?.spo2);
  const rawSuhu = Number(latest?.temperature);

  const valid =
    Number.isFinite(rawBpm) &&
    Number.isFinite(rawSpo2) &&
    Number.isFinite(rawSuhu);

  if (!valid) {
    return {
      valid: false,
      bpm: null,
      spo2: null,
      suhu: null,
      memberships: {
        bpm: { Lambat: 0, Normal: 0, Cepat: 0 },
        spo2: { Rendah: 0, Waspada: 0, Normal: 0 },
        suhu: { Rendah: 0, Normal: 0, Tinggi: 0 },
        output: { BAHAYA: 0, WASPADA: 0, NORMAL: 0 }
      },
      rules: [],
      alphas: { BAHAYA: 0, WASPADA: 0, NORMAL: 0 },
      calculatedScore: null
    };
  }

  const bpm = clampNumber(rawBpm, 40, 180);
  const spo2 = clampNumber(rawSpo2, 80, 100);
  const suhu = clampNumber(rawSuhu, 34, 40);

  const memberships = {
    bpm: getMembershipValues(bpm, FUZZY_MEMBERSHIP_CONFIG.bpm),
    spo2: getMembershipValues(spo2, FUZZY_MEMBERSHIP_CONFIG.spo2),
    suhu: getMembershipValues(suhu, FUZZY_MEMBERSHIP_CONFIG.suhu)
  };

  const rules = FUZZY_RULES.map((rule) => {
    const alpha = Math.min(
      memberships.bpm[rule.bpm],
      memberships.spo2[rule.spo2],
      memberships.suhu[rule.suhu]
    );

    return { ...rule, alpha };
  });

  const alphas = {
    BAHAYA: 0,
    WASPADA: 0,
    NORMAL: 0
  };

  rules.forEach((rule) => {
    alphas[rule.output] = Math.max(alphas[rule.output], rule.alpha);
  });

  let numerator = 0;
  let denominator = 0;

  for (let index = 0; index <= 100; index += 1) {
    const z = index / 100;
    const outputMembership = getMembershipValues(
      z,
      FUZZY_MEMBERSHIP_CONFIG.output
    );

    const muBahaya = Math.min(alphas.BAHAYA, outputMembership.BAHAYA);
    const muWaspada = Math.min(alphas.WASPADA, outputMembership.WASPADA);
    const muNormal = Math.min(alphas.NORMAL, outputMembership.NORMAL);
    const aggregate = Math.max(muBahaya, muWaspada, muNormal);

    numerator += z * aggregate;
    denominator += aggregate;
  }

  const calculatedScore = denominator > 0 ? numerator / denominator : null;

  return {
    valid: true,
    bpm,
    spo2,
    suhu,
    memberships: {
      ...memberships,
      output: alphas
    },
    rules,
    alphas,
    calculatedScore
  };
}

function formatFuzzyValue(value, digits = 2) {
  return Number.isFinite(Number(value))
    ? Number(value).toFixed(digits)
    : '-';
}

function MembershipChart({
  config,
  value,
  memberships,
  valueLabel
}) {
  const width = 620;
  const height = 245;
  const margin = { left: 46, right: 18, top: 20, bottom: 42 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;

  const xScale = (x) =>
    margin.left +
    ((x - config.min) / (config.max - config.min)) * plotWidth;

  const yScale = (membership) =>
    margin.top + (1 - membership) * plotHeight;

  const linePaths = config.sets.map((set) => {
    const samples = 140;
    const commands = [];

    for (let index = 0; index <= samples; index += 1) {
      const xValue =
        config.min +
        (index / samples) * (config.max - config.min);

      const membership = evaluateMembershipSet(xValue, set);
      const command = `${index === 0 ? 'M' : 'L'} ${xScale(xValue).toFixed(2)} ${yScale(membership).toFixed(2)}`;
      commands.push(command);
    }

    return {
      ...set,
      path: commands.join(' ')
    };
  });

  const ticks = [
    config.min,
    config.min + (config.max - config.min) / 2,
    config.max
  ];

  const hasValue = Number.isFinite(Number(value));
  const currentValue = hasValue
    ? clampNumber(value, config.min, config.max)
    : null;

  return (
    <article className="membership-panel">
      <div className="membership-panel-heading">
        <div>
          <span>{config.shortTitle}</span>
          <h3>{config.title}</h3>
        </div>
        <strong>
          {hasValue ? formatFuzzyValue(value, config.max <= 1 ? 2 : 1) : '-'}
          {hasValue && config.unit ? ` ${config.unit}` : ''}
        </strong>
      </div>

      <svg
        className="membership-chart"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`${config.title}, nilai saat ini ${valueLabel}`}
      >
        {[0, 0.5, 1].map((gridValue) => (
          <g key={`grid-${gridValue}`}>
            <line
              className="membership-grid-line"
              x1={margin.left}
              x2={width - margin.right}
              y1={yScale(gridValue)}
              y2={yScale(gridValue)}
            />
            <text
              className="membership-axis-label"
              x={margin.left - 10}
              y={yScale(gridValue) + 4}
              textAnchor="end"
            >
              {gridValue.toFixed(1)}
            </text>
          </g>
        ))}

        {ticks.map((tick) => (
          <g key={`tick-${tick}`}>
            <line
              className="membership-tick"
              x1={xScale(tick)}
              x2={xScale(tick)}
              y1={height - margin.bottom}
              y2={height - margin.bottom + 6}
            />
            <text
              className="membership-axis-label"
              x={xScale(tick)}
              y={height - 14}
              textAnchor="middle"
            >
              {config.max <= 1 ? tick.toFixed(1) : Number(tick.toFixed(1))}
            </text>
          </g>
        ))}

        <line
          className="membership-axis"
          x1={margin.left}
          x2={width - margin.right}
          y1={height - margin.bottom}
          y2={height - margin.bottom}
        />

        {linePaths.map((set) => (
          <path
            key={set.key}
            d={set.path}
            fill="none"
            stroke={set.color}
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}

        {hasValue ? (
          <>
            <line
              className="membership-current-line"
              x1={xScale(currentValue)}
              x2={xScale(currentValue)}
              y1={margin.top}
              y2={height - margin.bottom}
            />
            <rect
              className="membership-current-box"
              x={Math.min(
                Math.max(xScale(currentValue) - 31, margin.left),
                width - margin.right - 62
              )}
              y={margin.top + 3}
              width="62"
              height="24"
              rx="8"
            />
            <text
              className="membership-current-text"
              x={Math.min(
                Math.max(xScale(currentValue), margin.left + 31),
                width - margin.right - 31
              )}
              y={margin.top + 20}
              textAnchor="middle"
            >
              {formatFuzzyValue(
                currentValue,
                config.max <= 1 ? 2 : 1
              )}
            </text>
          </>
        ) : null}
      </svg>

      <div className="membership-values">
        {config.sets.map((set) => (
          <div
            className="membership-value"
            key={set.key}
            style={{ '--membership-color': set.color }}
          >
            <span className="membership-dot" />
            <div>
              <small>{set.label}</small>
              <strong>
                μ = {formatFuzzyValue(memberships?.[set.key] ?? 0, 2)}
              </strong>
            </div>
          </div>
        ))}
      </div>
    </article>
  );
}

function FuzzyMembershipViewer({ latest }) {
  const visualization = useMemo(
    () => calculateFuzzyVisualization(latest),
    [latest?.heartRate, latest?.spo2, latest?.temperature]
  );

  const backendScore = Number(latest?.riskScore);
  const displayedScore = Number.isFinite(backendScore)
    ? clampNumber(backendScore, 0, 1)
    : visualization.calculatedScore;

  const outputMemberships = Number.isFinite(displayedScore)
    ? getMembershipValues(
        displayedScore,
        FUZZY_MEMBERSHIP_CONFIG.output
      )
    : { BAHAYA: 0, WASPADA: 0, NORMAL: 0 };

  const activeRules = visualization.rules
    .filter((rule) => rule.alpha > 0.001)
    .sort((first, second) => second.alpha - first.alpha);

  const topRules = activeRules.slice(0, 6);

  return (
    <section className="fuzzy-viewer-card">
      <div className="fuzzy-viewer-heading">
        <div>
          <p>VISUALISASI FUZZY MAMDANI</p>
          <h2>Grafik fungsi keanggotaan realtime</h2>
          <span>
            Garis merah menunjukkan nilai sensor saat ini. Nilai μ menunjukkan
            derajat keanggotaan setiap himpunan.
          </span>
        </div>

        <div className="fuzzy-output-summary">
          <small>Output defuzzifikasi</small>
          <strong>{formatFuzzyValue(displayedScore, 2)}</strong>
          <span>{latest?.status || 'MENUNGGU'}</span>
        </div>
      </div>

      <div className="membership-grid">
        <MembershipChart
          config={FUZZY_MEMBERSHIP_CONFIG.bpm}
          value={visualization.bpm}
          memberships={visualization.memberships.bpm}
          valueLabel={formatFuzzyValue(visualization.bpm, 1)}
        />

        <MembershipChart
          config={FUZZY_MEMBERSHIP_CONFIG.spo2}
          value={visualization.spo2}
          memberships={visualization.memberships.spo2}
          valueLabel={formatFuzzyValue(visualization.spo2, 1)}
        />

        <MembershipChart
          config={FUZZY_MEMBERSHIP_CONFIG.suhu}
          value={visualization.suhu}
          memberships={visualization.memberships.suhu}
          valueLabel={formatFuzzyValue(visualization.suhu, 1)}
        />

        <MembershipChart
          config={FUZZY_MEMBERSHIP_CONFIG.output}
          value={displayedScore}
          memberships={outputMemberships}
          valueLabel={formatFuzzyValue(displayedScore, 2)}
        />
      </div>

      <div className="fuzzy-inference-grid">
        <div className="fuzzy-alpha-card">
          <div className="fuzzy-subsection-title">
            <div>
              <p>HASIL AGREGASI RULE</p>
              <h3>Kekuatan keluaran fuzzy</h3>
            </div>
          </div>

          <div className="alpha-list">
            {[
              { key: 'BAHAYA', label: 'Bahaya', color: '#ef4444' },
              { key: 'WASPADA', label: 'Waspada', color: '#f59e0b' },
              { key: 'NORMAL', label: 'Normal', color: '#10b981' }
            ].map((item) => {
              const alpha = visualization.alphas[item.key] || 0;

              return (
                <div className="alpha-row" key={item.key}>
                  <div>
                    <span
                      className="alpha-dot"
                      style={{ background: item.color }}
                    />
                    <strong>{item.label}</strong>
                  </div>
                  <div className="alpha-track">
                    <span
                      style={{
                        width: `${Math.max(0, Math.min(1, alpha)) * 100}%`,
                        background: item.color
                      }}
                    />
                  </div>
                  <b>{formatFuzzyValue(alpha, 2)}</b>
                </div>
              );
            })}
          </div>
        </div>

        <div className="active-rules-card">
          <div className="fuzzy-subsection-title">
            <div>
              <p>RULE YANG AKTIF</p>
              <h3>Inferensi dengan operator MIN</h3>
            </div>
            <strong>{activeRules.length} rule</strong>
          </div>

          <div className="top-rule-list">
            {topRules.length ? (
              topRules.map((rule) => (
                <div className="top-rule-item" key={rule.id}>
                  <span>R{rule.id}</span>
                  <div>
                    <p>
                      {rule.bpm} · SpO2 {rule.spo2} · Suhu {rule.suhu}
                    </p>
                    <small>Output {rule.output}</small>
                  </div>
                  <strong>{formatFuzzyValue(rule.alpha, 2)}</strong>
                </div>
              ))
            ) : (
              <div className="fuzzy-empty">
                Menunggu data sensor yang lengkap.
              </div>
            )}
          </div>
        </div>
      </div>

      <details className="all-rules-details">
        <summary>Lihat firing strength seluruh 27 rule</summary>
        <div className="all-rules-grid">
          {visualization.rules.map((rule) => (
            <div
              className={`all-rule-item ${rule.alpha > 0.001 ? 'active' : ''}`}
              key={rule.id}
            >
              <div className="all-rule-heading">
                <strong>R{rule.id}</strong>
                <span>{formatFuzzyValue(rule.alpha, 2)}</span>
              </div>
              <p>
                {rule.bpm} · {rule.spo2} · {rule.suhu}
              </p>
              <small>{rule.output}</small>
              <div className="all-rule-track">
                <span style={{ width: `${rule.alpha * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      </details>
    </section>
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
</div>
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
          unit={' \u00B0C'}
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
          title="SpO2"
          value={numberValue(latest?.spo2)}
          unit=" %"
          helper="Kadar oksigen darah"
          danger={latest?.spo2 < 95}
        />
      </section>

      <FuzzyMembershipViewer latest={latest} />

      <section className="content-grid">
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
                <th>SpO2</th>
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
                    <td>{item.temperature}{' \u00B0C'}</td>
                    <td>{item.heartRate} bpm</td>
                    <td>{item.spo2} %</td>
                    <td>{item.riskScore}</td>
                  </tr>
                );
              }) : (
                <tr>
                  <td colSpan="6" className="empty-state">Belum ada data. Klik "Test Data Dummy" atau aktifkan simulator.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
