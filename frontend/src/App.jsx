import { useEffect, useMemo, useRef, useState } from 'react';
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
  Droplets,
  UserPlus,
  Users,
  Play,
  Square,
  Download,
  RefreshCw,
  ClipboardList
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



async function requestJson(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.message || `HTTP ${response.status}`);
  }

  return payload;
}

function formatFullDate(value) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(new Date(value));
}

function formatAverage(value, digits = 1) {
  return Number.isFinite(Number(value)) ? Number(value).toFixed(digits) : '-';
}

function SubjectSessionPanel({
  latest,
  participants,
  selectedParticipantId,
  onSelectParticipant,
  participantForm,
  onParticipantFormChange,
  onCreateParticipant,
  sessions,
  activeSession,
  sessionForm,
  onSessionFormChange,
  onStartSession,
  onEndSession,
  onViewSession,
  onShowLive,
  selectedSessionId,
  busy,
  message
}) {
  const selectedParticipant = participants.find(
    (participant) => String(participant.id) === String(selectedParticipantId)
  );
  const currentDeviceId = latest?.deviceId || 'esp32-lansia-01';

  return (
    <section className="subject-session-card">
      <div className="subject-session-heading">
        <div>
          <p>SUBJEK PENGUJIAN DAN SESI PENGUKURAN</p>
          <h2>Pisahkan data setiap partisipan</h2>
          <span>
            Data MQTT otomatis masuk ke sesi yang sedang aktif. Gunakan kode
            S01, S02, dan seterusnya sebagai identitas pengujian.
          </span>
        </div>
        <div className={`active-session-pill ${activeSession ? 'is-active' : ''}`}>
          <Signal size={18} />
          {activeSession
            ? `${activeSession.participantCode} sedang direkam`
            : 'Tidak ada sesi aktif'}
        </div>
      </div>

      <div className="subject-session-layout">
        <div className="participant-manager">
          <div className="subject-subheading">
            <div className="subject-icon"><Users size={21} /></div>
            <div>
              <p>Pilih subjek</p>
              <h3>Identitas partisipan</h3>
            </div>
          </div>

          <label className="subject-field">
            <span>Subjek yang dipilih</span>
            <select
              value={selectedParticipantId}
              onChange={(event) => onSelectParticipant(event.target.value)}
            >
              <option value="">Pilih subjek pengujian</option>
              {participants.map((participant) => (
                <option key={participant.id} value={participant.id}>
                  {participant.code} — {participant.alias}
                </option>
              ))}
            </select>
          </label>

          {selectedParticipant ? (
            <div className="selected-participant-summary">
              <div>
                <strong>{selectedParticipant.code}</strong>
                <span>{selectedParticipant.alias}</span>
              </div>
              <small>
                {selectedParticipant.age ? `${selectedParticipant.age} tahun` : 'Usia belum diisi'}
                {' · '}
                {selectedParticipant.gender || 'Jenis kelamin belum diisi'}
                {' · '}
                {selectedParticipant.sessionCount || 0} sesi
              </small>
            </div>
          ) : null}

          <details className="add-participant-details">
            <summary><UserPlus size={17} /> Tambah subjek baru</summary>
            <form className="participant-form" onSubmit={onCreateParticipant}>
              <div className="two-field-grid">
                <label className="subject-field">
                  <span>Kode</span>
                  <input
                    value={participantForm.code}
                    onChange={(event) => onParticipantFormChange('code', event.target.value.toUpperCase())}
                    placeholder="Otomatis: S01"
                    maxLength="20"
                  />
                </label>
                <label className="subject-field">
                  <span>Alias/nama singkat *</span>
                  <input
                    value={participantForm.alias}
                    onChange={(event) => onParticipantFormChange('alias', event.target.value)}
                    placeholder="Contoh: Partisipan 1"
                    required
                  />
                </label>
              </div>

              <div className="two-field-grid">
                <label className="subject-field">
                  <span>Usia</span>
                  <input
                    type="number"
                    min="0"
                    max="120"
                    value={participantForm.age}
                    onChange={(event) => onParticipantFormChange('age', event.target.value)}
                    placeholder="22"
                  />
                </label>
                <label className="subject-field">
                  <span>Jenis kelamin</span>
                  <select
                    value={participantForm.gender}
                    onChange={(event) => onParticipantFormChange('gender', event.target.value)}
                  >
                    <option value="">Tidak diisi</option>
                    <option value="L">Laki-laki</option>
                    <option value="P">Perempuan</option>
                    <option value="LAINNYA">Lainnya</option>
                  </select>
                </label>
              </div>

              <label className="subject-field">
                <span>Catatan</span>
                <textarea
                  value={participantForm.notes}
                  onChange={(event) => onParticipantFormChange('notes', event.target.value)}
                  placeholder="Catatan singkat tanpa data pribadi sensitif"
                  rows="2"
                />
              </label>

              <button className="subject-primary-button" type="submit" disabled={busy}>
                <UserPlus size={17} /> Simpan Subjek
              </button>
            </form>
          </details>
        </div>

        <div className="session-manager">
          <div className="subject-subheading">
            <div className="subject-icon"><ClipboardList size={21} /></div>
            <div>
              <p>Kontrol sesi</p>
              <h3>Perekaman data sensor</h3>
            </div>
          </div>

          {activeSession ? (
            <div className="active-session-box">
              <div className="active-session-topline">
                <div>
                  <span className="recording-dot" />
                  <strong>SESI AKTIF</strong>
                </div>
                <small>#{activeSession.id}</small>
              </div>
              <h4>{activeSession.participantCode} — {activeSession.participantAlias}</h4>
              <p>Mulai: {formatFullDate(activeSession.startedAt)}</p>
              <p>Perangkat: {activeSession.deviceId}</p>
              {activeSession.condition ? <p>Kondisi: {activeSession.condition}</p> : null}
              <button
                className="end-session-button"
                type="button"
                onClick={onEndSession}
                disabled={busy}
              >
                <Square size={17} /> Akhiri Sesi
              </button>
            </div>
          ) : (
            <div className="start-session-box">
              <p>
                Pilih subjek, tulis kondisi pengukuran, lalu tekan Mulai Sesi.
                Data dari <strong>{currentDeviceId}</strong> akan disimpan ke sesi tersebut.
              </p>

              <label className="subject-field">
                <span>Kondisi pengukuran</span>
                <input
                  value={sessionForm.condition}
                  onChange={(event) => onSessionFormChange('condition', event.target.value)}
                  placeholder="Contoh: duduk dan istirahat"
                />
              </label>

              <label className="subject-field">
                <span>Catatan sesi</span>
                <textarea
                  value={sessionForm.notes}
                  onChange={(event) => onSessionFormChange('notes', event.target.value)}
                  placeholder="Contoh: sensor dipasang pada pergelangan kiri"
                  rows="2"
                />
              </label>

              <button
                className="start-session-button"
                type="button"
                onClick={onStartSession}
                disabled={busy || !selectedParticipantId}
              >
                <Play size={17} /> Mulai Sesi Pengukuran
              </button>
            </div>
          )}

          {message ? <div className="subject-message">{message}</div> : null}
        </div>
      </div>

      <div className="session-history-section">
        <div className="session-history-heading">
          <div>
            <p>RIWAYAT SESI {selectedParticipant ? selectedParticipant.code : ''}</p>
            <h3>Ringkasan pengujian setiap partisipan</h3>
          </div>
          <button className="secondary-session-button" type="button" onClick={onShowLive}>
            <RefreshCw size={16} /> Tampilkan Data Live
          </button>
        </div>

        <div className="session-list">
          {sessions.length ? sessions.map((session) => (
            <article
              className={`session-item ${String(selectedSessionId) === String(session.id) ? 'selected' : ''}`}
              key={session.id}
            >
              <div className="session-item-main">
                <div className="session-number">#{session.id}</div>
                <div>
                  <strong>{session.participantCode} — {session.participantAlias}</strong>
                  <span>{formatFullDate(session.startedAt)}</span>
                  <small>
                    {session.endedAt ? `Selesai ${formatFullDate(session.endedAt)}` : 'Sedang berlangsung'}
                  </small>
                </div>
              </div>

              <div className="session-stat-grid">
                <div><span>Data</span><strong>{session.readingCount || 0}</strong></div>
                <div><span>Rerata BPM</span><strong>{formatAverage(session.avgHeartRate)}</strong></div>
                <div><span>Rerata SpO2</span><strong>{formatAverage(session.avgSpo2)}%</strong></div>
                <div><span>Rerata Suhu</span><strong>{formatAverage(session.avgTemperature)}°C</strong></div>
              </div>

              <div className="session-item-actions">
                <button type="button" onClick={() => onViewSession(session)}>
                  <ClipboardList size={15} /> Lihat Data
                </button>
                <a href={`${API_URL}/api/sessions/${session.id}/export.csv`}>
                  <Download size={15} /> CSV
                </a>
              </div>
            </article>
          )) : (
            <div className="empty-session-list">
              Belum ada sesi untuk subjek yang dipilih.
            </div>
          )}
        </div>
      </div>
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
  const [participants, setParticipants] = useState([]);
  const [selectedParticipantId, setSelectedParticipantId] = useState('');
  const [sessions, setSessions] = useState([]);
  const [activeSession, setActiveSession] = useState(null);
  const [selectedSessionId, setSelectedSessionId] = useState(null);
  const [historyTitle, setHistoryTitle] = useState('30 data terakhir (live)');
  const [subjectBusy, setSubjectBusy] = useState(false);
  const [subjectMessage, setSubjectMessage] = useState('');
  const [participantForm, setParticipantForm] = useState({
    code: '',
    alias: '',
    age: '',
    gender: '',
    notes: ''
  });
  const [sessionForm, setSessionForm] = useState({
    condition: 'Duduk dan istirahat',
    notes: ''
  });
  const selectedSessionRef = useRef(null);

  const selectedTheme = themes.find((item) => item.id === theme) || themes[0];
  const status = latest?.status || 'NORMAL';
  const currentStatus = statusInfo[status] || statusInfo.NORMAL;
  const dateTime = formatDateTime(latest?.time);

  useEffect(() => {
    selectedSessionRef.current = selectedSessionId;
  }, [selectedSessionId]);

  useEffect(() => {
    loadParticipants();
  }, []);

  useEffect(() => {
    if (selectedParticipantId) {
      loadSessions(selectedParticipantId);
    } else {
      setSessions([]);
    }
  }, [selectedParticipantId]);

  useEffect(() => {
    loadActiveSession(latest?.deviceId || 'esp32-lansia-01');
  }, [latest?.deviceId]);

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

  const selectedSession = selectedSessionRef.current;
  const readingBelongsToSelectedSession =
    selectedSession && String(reading.sessionId) === String(selectedSession);

  if (!selectedSession || readingBelongsToSelectedSession) {
    setHistory((prev) => {
      const dataTanpaDuplikat = prev.filter(
        (item) => String(item.id) !== String(reading.id)
      );

      const maximumRows = selectedSession ? 5000 : 30;
      return [reading, ...dataTanpaDuplikat].slice(0, maximumRows);
    });
  }
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

  async function loadParticipants(preferredParticipantId = null) {
    try {
      const data = await requestJson('/api/participants');
      const safeData = Array.isArray(data) ? data : [];
      setParticipants(safeData);

      setSelectedParticipantId((current) => {
        const preferred = preferredParticipantId ? String(preferredParticipantId) : '';
        if (preferred && safeData.some((item) => String(item.id) === preferred)) return preferred;
        if (current && safeData.some((item) => String(item.id) === String(current))) return current;
        return safeData[0] ? String(safeData[0].id) : '';
      });
    } catch (error) {
      console.error('Load participants error:', error);
      setSubjectMessage(`Gagal mengambil subjek: ${error.message}`);
    }
  }

  async function loadSessions(participantId) {
    try {
      const data = await requestJson(`/api/sessions?participantId=${encodeURIComponent(participantId)}&limit=100`);
      setSessions(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Load sessions error:', error);
      setSubjectMessage(`Gagal mengambil sesi: ${error.message}`);
    }
  }

  async function loadActiveSession(deviceId) {
    try {
      const data = await requestJson(`/api/sessions/active?deviceId=${encodeURIComponent(deviceId)}`);
      setActiveSession(data || null);
    } catch (error) {
      console.error('Load active session error:', error);
    }
  }

  function changeParticipantForm(field, value) {
    setParticipantForm((current) => ({ ...current, [field]: value }));
  }

  function changeSessionForm(field, value) {
    setSessionForm((current) => ({ ...current, [field]: value }));
  }

  async function handleCreateParticipant(event) {
    event.preventDefault();
    setSubjectBusy(true);
    setSubjectMessage('');

    try {
      const created = await requestJson('/api/participants', {
        method: 'POST',
        body: JSON.stringify(participantForm)
      });

      setParticipantForm({ code: '', alias: '', age: '', gender: '', notes: '' });
      await loadParticipants(created.id);
      setSubjectMessage(`${created.code} berhasil ditambahkan.`);
    } catch (error) {
      setSubjectMessage(`Gagal menambah subjek: ${error.message}`);
    } finally {
      setSubjectBusy(false);
    }
  }

  async function handleStartSession() {
    if (!selectedParticipantId) return;
    setSubjectBusy(true);
    setSubjectMessage('');

    try {
      const created = await requestJson('/api/sessions', {
        method: 'POST',
        body: JSON.stringify({
          participantId: Number(selectedParticipantId),
          deviceId: latest?.deviceId || 'esp32-lansia-01',
          condition: sessionForm.condition,
          notes: sessionForm.notes
        })
      });

      setActiveSession(created);
      setSessionForm((current) => ({ ...current, notes: '' }));
      await loadSessions(selectedParticipantId);
      await handleViewSession(created);
      setSubjectMessage(`Sesi #${created.id} dimulai untuk ${created.participantCode}.`);
    } catch (error) {
      setSubjectMessage(`Gagal memulai sesi: ${error.message}`);
    } finally {
      setSubjectBusy(false);
    }
  }

  async function handleEndSession() {
    if (!activeSession?.id) return;
    setSubjectBusy(true);
    setSubjectMessage('');

    try {
      const ended = await requestJson(`/api/sessions/${activeSession.id}/end`, {
        method: 'POST'
      });
      setActiveSession(null);
      await loadParticipants(selectedParticipantId);
      await loadSessions(selectedParticipantId);
      setSubjectMessage(`Sesi #${ended.id} telah diakhiri dan datanya tersimpan.`);
    } catch (error) {
      setSubjectMessage(`Gagal mengakhiri sesi: ${error.message}`);
    } finally {
      setSubjectBusy(false);
    }
  }

  async function handleViewSession(session) {
    try {
      const readings = await requestJson(`/api/readings?sessionId=${session.id}&limit=5000`);
      setSelectedSessionId(session.id);
      setHistory(Array.isArray(readings) ? readings : []);
      setHistoryTitle(`${session.participantCode} — Sesi #${session.id}`);
    } catch (error) {
      setSubjectMessage(`Gagal membuka data sesi: ${error.message}`);
    }
  }

  async function handleShowLiveHistory() {
    try {
      const readings = await requestJson('/api/readings?limit=30');
      setSelectedSessionId(null);
      setHistory(Array.isArray(readings) ? readings : []);
      setHistoryTitle('30 data terakhir (live)');
    } catch (error) {
      setSubjectMessage(`Gagal menampilkan data live: ${error.message}`);
    }
  }

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

      <SubjectSessionPanel
        latest={latest}
        participants={participants}
        selectedParticipantId={selectedParticipantId}
        onSelectParticipant={setSelectedParticipantId}
        participantForm={participantForm}
        onParticipantFormChange={changeParticipantForm}
        onCreateParticipant={handleCreateParticipant}
        sessions={sessions}
        activeSession={activeSession}
        sessionForm={sessionForm}
        onSessionFormChange={changeSessionForm}
        onStartSession={handleStartSession}
        onEndSession={handleEndSession}
        onViewSession={handleViewSession}
        onShowLive={handleShowLiveHistory}
        selectedSessionId={selectedSessionId}
        busy={subjectBusy}
        message={subjectMessage}
      />

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
            <h3>{historyTitle}</h3>
          </div>
          <div className="history-header-actions">
            {selectedSessionId ? (
              <a href={`${API_URL}/api/sessions/${selectedSessionId}/export.csv`}>
                <Download size={16} /> Ekspor CSV
              </a>
            ) : null}
            <Signal size={22} />
          </div>
        </div>

        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Subjek</th>
                <th>Sesi</th>
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
                    <td>{item.participantCode || '-'}</td>
                    <td>{item.sessionId ? `#${item.sessionId}` : '-'}</td>
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
                  <td colSpan="8" className="empty-state">Belum ada data. Klik "Test Data Dummy" atau aktifkan simulator.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
