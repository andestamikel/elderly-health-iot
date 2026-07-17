import { useEffect, useMemo, useState } from 'react';
import { io } from 'socket.io-client';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || API_URL;

function formatTime(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString('id-ID');
}

function statusClass(status) {
  if (status === 'BAHAYA') return 'danger';
  if (status === 'WASPADA') return 'warning';
  return 'normal';
}

export default function App() {
  const [health, setHealth] = useState(null);
  const [latest, setLatest] = useState(null);
  const [apiOnline, setApiOnline] = useState(false);
  const [realtime, setRealtime] = useState(false);
  const [error, setError] = useState('');

  const status = latest?.status || 'MENUNGGU DATA';

  async function loadHealth() {
    try {
      const response = await fetch(`${API_URL}/api/health?t=${Date.now()}`, {
        method: 'GET',
        cache: 'no-store',
        headers: {
          Accept: 'application/json',
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      setHealth(data);
      setApiOnline(Boolean(data?.ok));
      setError('');
    } catch (err) {
      console.error('[API HEALTH]', err);
      setApiOnline(false);
      setError('API offline atau belum dapat diakses.');
    }
  }

  async function loadLatest() {
    try {
      const response = await fetch(`${API_URL}/api/latest?t=${Date.now()}`, {
        method: 'GET',
        cache: 'no-store',
        headers: {
          Accept: 'application/json',
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();

      if (data) {
        setLatest(data);
        setError('');
      }
    } catch (err) {
      console.error('[API LATEST]', err);
      setError('Gagal mengambil data terbaru.');
    }
  }

  useEffect(() => {
    let mounted = true;

    const refreshDashboard = async () => {
      if (!mounted) return;

      await Promise.allSettled([
        loadHealth(),
        loadLatest(),
      ]);
    };

    refreshDashboard();

    // Cadangan jika Socket.IO terlambat: ambil data tiap 2 detik.
    const timer = window.setInterval(refreshDashboard, 2000);

    const socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 10000,
      withCredentials: true,
    });

    const handleRealtimeData = (data) => {
      console.log('[SOCKET] Data realtime:', data);

      if (mounted && data) {
        setLatest(data);
        setError('');
      }
    };

    socket.on('connect', () => {
      console.log('[SOCKET] Terhubung:', socket.id);
      if (mounted) setRealtime(true);
    });

    socket.on('disconnect', (reason) => {
      console.log('[SOCKET] Terputus:', reason);
      if (mounted) setRealtime(false);
    });

    socket.on('connect_error', (err) => {
      console.error('[SOCKET] Error:', err.message);
      if (mounted) setRealtime(false);
    });

    socket.on('reading', handleRealtimeData);
    socket.on('latest', handleRealtimeData);

    return () => {
      mounted = false;
      window.clearInterval(timer);
      socket.off('reading', handleRealtimeData);
      socket.off('latest', handleRealtimeData);
      socket.disconnect();
    };
  }, []);
