import React, { useEffect, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Bluetooth,
  BluetoothConnected,
  Clock,
  Cpu,
  Droplets,
  Radio,
  Settings,
  ShieldCheck,
  Thermometer,
  Wifi,
} from 'lucide-react';
import { CitoConnectionModal } from './components/CitoConnectionModal';
import { CitoPhysicalPanel } from './components/CitoPhysicalPanel';
import { CitoWebDashboard } from './components/CitoWebDashboard';
import { applyBlePacket, bleManager, getLastDevice } from './services/bleService';
import { CitoSystemState, formatTemperature, getTdsModeLabel } from './types/system';

const INITIAL_CITO_STATE: CitoSystemState = {
  isFiltering: false,
  isFlushing: false,
  isPressureRelease: false,
  isDryRun: false,
  isPriming: false,
  isManualFilter: false,
  manualFilterCountdown: 0,

  tds: 146,
  temperature: 26.5,
  pumpCurrentMa: 0,
  drainValveCurrentMa: 0,
  filterFlowRate: true,
  drainFlowRate: true,

  tdsDisplayMode: 'HOURLY',
  autoHourlyTest: true,
  lastMeasuredAgoMinutes: 12,
  nextMeasureInMinutes: 48,
  isMeasuringHourlyNow: false,

  tdsMode: 'TEP',
  tdsSettings: {
    TEP: { lo: 120, hi: 170, flushMinutes: 1, flushSeconds: 0 },
    CA: { lo: 120, hi: 250, flushMinutes: 1, flushSeconds: 0 },
    CAY: { lo: 150, hi: 250, flushMinutes: 1, flushSeconds: 0 },
    CUSTOM: { lo: 150, hi: 300, flushMinutes: 1, flushSeconds: 0 },
  },
  cooldownSecondsRemaining: 0,

  filterMode: 103,
  filterMinutesPerHour: 30,
  filterDays: 'C07',
  filterWeekdays: [true, true, true, true, true, true, true],

  pumpType: 'SMALL',
  pumpThresholdsSmall: {
    minCurrentMa: 40,
    dirtyFilterMa: 750, // Lọc bẩn bơm nhỏ: 750 mA (khảo sát)
    overCurrentMa: 1200, // Quá dòng bơm nhỏ: 1200 mA
  },
  pumpThresholdsLarge: {
    minCurrentMa: 80,
    dirtyFilterMa: 800, // Lọc bẩn bơm lớn: 800 mA (khảo sát)
    overCurrentMa: 1200, // Quá dòng bơm lớn: 1200 mA
  },
  valveThresholds: {
    minCurrentMa: 80,
    overCurrentMa: 500,
  },

  scheduledFlush: {
    type: 'nd',
    intervalDays: 3,
    timesPerDay: 1,
    startHour: 12,
    startMinute: 0,
    flushMinutes: 1,
    flushSeconds: 0,
    customWeekdays: [true, false, false, true, false, false, true],
  },

  nightMode: false,
  screenWhenSleeping: true,
  isSleeping: false,
  buttonHoldSeconds: 1.0,

  logoEffect: 0,
  logoSpeed: 3,

  rtcTime: '12:00:00',
  rtcConnected: true,
  lastNtpSync: '00:00:00 (NTP Internet)',
  wifiSsid: 'CITO UF SYSTEM',
  wifiConnected: true,
  deviceIp: '192.168.1.108',

  tdsCalibration: {
    kFactor: 1.0,
    standardSolutionPpm: 150,
    rawVoltage: 1.85,
    lastCalibratedAt: 'Chưa hiệu chuẩn (K = 1.000)',
  },
  wifiConfig: {
    ssid: 'CITO UF SYSTEM',
    password: '',
    ipAddress: '192.168.1.108',
    rssi: -58,
    status: 'CONNECTED',
  },

  activeErrors: {
    err111_pumpNoCurrent: false,
    err222_pumpOverCurrent: false,
    err333_filterValveBlocked: false,
    err444_drainNoFlow: false,
    err555_drainNoCurrent: false,
    err666_drainOverCurrent: false,
    flt_dirtyFilter: false,
    rtcLost: false,
    acsPumpDisconnected: false,
    acsDrainDisconnected: false,
  },

  display7Segment: '146',
  displayHoldingState: '',
};

export default function App() {
  const [state, setState] = useState<CitoSystemState>(INITIAL_CITO_STATE);

  // Bluetooth & Security State
  const [isConnectModalOpen, setIsConnectModalOpen] = useState(false);
  const [connectionMode, setConnectionMode] = useState<'BLE' | 'WIFI_LOCAL' | 'SERVER'>('BLE');
  const [bleConnected, setBleConnected] = useState(false);
  const [bleDeviceName, setBleDeviceName] = useState('');
  const [devicePin, setDevicePin] = useState(() => {
    try {
      return localStorage.getItem('cito_ble_pin') || '1234';
    } catch {
      return '1234';
    }
  });
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null);
  // Rớt Bluetooth: bleService tự thử nối lại 3 lần
  const [bleLink, setBleLink] = useState<'idle' | 'connected' | 'reconnecting' | 'lost'>('idle');
  const bleConnectedRef = useRef(false);
  bleConnectedRef.current = bleConnected;

  const [activeTab, setActiveTab] = useState<'panel' | 'web' | 'settings'>('web');
  const [networkError, setNetworkError] = useState(false);
  // Server mô phỏng (server.ts): null = đang dò, true = có (npm run dev), false = không có
  // (web tĩnh trên GitHub Pages -> chỉ điều khiển máy thật qua Bluetooth)
  const [hasSimulator, setHasSimulator] = useState<boolean | null>(null);
  const simRef = useRef<boolean | null>(null);

  // Poll state from server every 1000ms (chỉ khi chưa nối máy thật qua Bluetooth -> chế độ mô phỏng)
  const fetchState = async () => {
    if (bleConnectedRef.current || simRef.current === false) return;
    try {
      const res = await fetch('api/status');
      if (!res.ok) throw new Error('Network error');
      const data = await res.json(); // GitHub Pages trả trang 404 HTML -> lỗi parse -> không có server
      setState(data);
      simRef.current = true;
      setHasSimulator(true);
      setNetworkError(false);
    } catch (err) {
      if (simRef.current === null) {
        simRef.current = false;
        setHasSimulator(false);
      } else {
        setNetworkError(true);
      }
    }
  };

  useEffect(() => {
    fetchState();
    const timer = setInterval(fetchState, 1000);
    return () => clearInterval(timer);
  }, []);

  // Telemetry & kết quả lệnh từ máy thật (Bluetooth)
  useEffect(() => {
    bleManager.setListeners(
      (pkt) => setState((prev) => applyBlePacket(prev, pkt)),
      (ack) => {
        if (ack.a === 'AUTH') {
          setNotice(ack.ok ? { text: 'Đã xác thực mã PIN', ok: true } : { text: 'Sai mã PIN - nhập lại ở mục "Mã PIN Bảo Mật"', ok: false });
        } else if (!ack.ok || ack.msg) {
          setNotice({ text: ack.msg || `Lệnh ${ack.a} thất bại`, ok: ack.ok });
        }
      }
    );
  }, []);

  useEffect(() => {
    bleManager.setLinkListener((link, name) => {
      setBleLink(link);
      if (link === 'connected') {
        setBleConnected(true);
        setBleDeviceName(name);
      } else {
        setBleConnected(false);
        if (link === 'lost') setNotice({ text: 'Mất kết nối Bluetooth - bấm Quét Bluetooth để nối lại', ok: false });
      }
    });
  }, []);

  // Tải lại trang: tự nối lại máy Bluetooth đã cấp quyền (không phải bấm quét lại)
  const [lastDevice] = useState(() => getLastDevice());
  useEffect(() => {
    if (!bleManager.canAutoReconnect() || !getLastDevice()) return;
    let cancelled = false;
    setBleLink('reconnecting');
    bleManager
      .reconnectRemembered(
        () => {},
        () => {
          setBleConnected(false);
          setBleDeviceName('');
        }
      )
      .then((info) => {
        if (!cancelled && !info) setBleLink('idle');
      })
      .catch((e) => {
        console.warn('Auto reconnect failed', e);
        if (!cancelled) setBleLink('idle');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Trình duyệt không tự nối lại được: 1 chạm mở bảng chọn (đã lọc sẵn máy CITO-UF)
  const quickReconnect = async () => {
    try {
      const info = await bleManager.scanAndConnect(
        () => {},
        () => {
          setBleConnected(false);
          setBleDeviceName('');
        }
      );
      setBleConnected(true);
      setBleDeviceName(info.name);
    } catch (e: any) {
      setNotice({ text: e?.message || 'Không kết nối được Bluetooth', ok: false });
    }
  };

  useEffect(() => {
    bleManager.setPin(devicePin);
    try {
      localStorage.setItem('cito_ble_pin', devicePin);
    } catch {
      /* private mode: chỉ nhớ PIN trong phiên */
    }
  }, [devicePin]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  // Đổi PIN: nếu đang nối máy thì đổi luôn trên máy (máy đang ở phiên đã xác thực)
  const handleSetDevicePin = async (pin: string) => {
    if (bleConnected && bleManager.isConnected()) {
      try {
        await bleManager.sendCommand('SET_PIN', { pin });
      } catch (e) {
        setNotice({ text: 'Không đổi được PIN trên máy', ok: false });
        return;
      }
    }
    setDevicePin(pin);
  };

  // Đã nối máy thật qua Bluetooth -> gửi lệnh qua BLE (máy trả state mới qua notify).
  // Chưa nối -> gửi cho server mô phỏng.
  const sendAction = async (action: string, payload: any = {}) => {
    if (action === 'SYNC_NTP') {
      // Kèm giờ điện thoại: máy không có WiFi / NTP lỗi thì lấy giờ này cho RTC
      const d = new Date();
      payload = {
        ...payload,
        y: d.getFullYear(),
        mo: d.getMonth() + 1,
        d: d.getDate(),
        h: d.getHours(),
        m: d.getMinutes(),
        s: d.getSeconds(),
      };
    }
    if (bleConnected && bleManager.isConnected()) {
      try {
        await bleManager.sendCommand(action, payload);
      } catch (e: any) {
        setNotice({ text: e?.message || 'Gửi lệnh Bluetooth thất bại', ok: false });
      }
      return;
    }

    if (simRef.current !== true) {
      setNotice({ text: 'Chưa kết nối máy - bấm "Quét Bluetooth Gần Máy" trước', ok: false });
      setIsConnectModalOpen(true);
      return;
    }

    try {
      const res = await fetch('api/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, payload }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.state) setState(data.state);
      }
    } catch (err) {
      console.error('Failed to send action:', err);
    }
  };

  // WiFi + chỉ số + giờ DS3231 + IP. compact = dòng phụ trên điện thoại (TDS/nhiệt độ đã có trên thanh dính)
  const statusChips = (compact: boolean) => (
    <>
      <button
        onClick={() => {
          setActiveTab('settings');
          setTimeout(() => {
            const el = document.getElementById('section-wifi-config');
            if (el) el.scrollIntoView({ behavior: 'smooth' });
          }, 100);
        }}
        className="shrink-0 px-3 py-1.5 rounded-xl border border-slate-700 bg-slate-900/90 hover:bg-slate-800 text-xs font-bold flex items-center gap-2 text-slate-200 transition-all shadow-md"
        title="Cài đặt mạng WiFi cho máy CITO UF"
      >
        <Wifi className={`w-4 h-4 ${state.wifiConnected ? 'text-emerald-400' : 'text-slate-400'}`} />
        {!compact && <span>WiFi:</span>}
        <span className="text-cyan-300 font-mono text-[11px] truncate max-w-[120px]">{state.wifiSsid || 'Chưa cài'}</span>
      </button>

      <div className="flex items-center gap-2 text-xs font-mono shrink-0">
        {!compact && (
          <>
            <div className="bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 flex items-center gap-1.5">
              <Droplets className="w-3.5 h-3.5 text-cyan-400" />
              <span className="font-bold text-cyan-300">{state.tds} ppm</span>
            </div>
            <div className="bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 flex items-center gap-1.5">
              <Thermometer className="w-3.5 h-3.5 text-blue-400" />
              <span className={`font-bold ${state.temperatureState === 'ERROR' ? 'text-red-400' : 'text-blue-300'}`}>
                {formatTemperature(state)}
              </span>
            </div>
          </>
        )}

        <div
          className={`bg-slate-950 border rounded-xl px-2.5 py-1.5 flex items-center gap-1.5 whitespace-nowrap ${
            bleConnected && !state.rtcConnected
              ? 'border-red-500/50'
              : bleConnected && state.rtcBatteryLow
                ? 'border-amber-500/50'
                : 'border-slate-800'
          }`}
          title={
            state.rtcBatteryLow
              ? 'Giờ DS3231 - pin CR2032 yếu: máy từng mất giờ, hãy đồng bộ lại và thay pin'
              : 'Giờ máy (DS3231)'
          }
        >
          <Clock className={`w-3.5 h-3.5 ${bleConnected && !state.rtcConnected ? 'text-red-400' : 'text-indigo-400'}`} />
          <span className={`font-bold text-[11px] ${bleConnected && !state.rtcConnected ? 'text-red-300' : 'text-indigo-200'}`}>
            {bleConnected ? state.rtcTime : '--:--:--'}
            {bleConnected && state.rtcBatteryLow ? ' ⚠' : ''}
          </span>
        </div>

        <div className={`${compact ? 'flex' : 'hidden md:flex'} bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 items-center gap-1.5`}>
          <Radio className="w-3.5 h-3.5 text-emerald-400" />
          <span className="text-slate-300 text-[11px]">{state.wifiConnected ? state.deviceIp : '-'}</span>
        </div>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-cyan-500 selection:text-slate-950">
      {/* 1. Header Bar
          Điện thoại (< 640px): thanh dính CHỈ 1 DÒNG (logo · TDS/nhiệt độ · nút Bluetooth),
          WiFi / giờ / IP nằm ở dòng phụ bên dưới và cuộn đi theo trang -> không chiếm chỗ khi cài đặt.
          Máy tính (>= 640px): giữ nguyên 1 dòng đầy đủ như cũ. */}
      <header className="bg-slate-900/95 backdrop-blur border-b border-slate-800 px-3 sm:px-4 py-2 sm:py-3 sticky top-0 z-30 shadow-2xl">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-2 sm:gap-3">
          {/* Logo & System Title */}
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="w-8 h-8 sm:w-10 sm:h-10 shrink-0 rounded-xl sm:rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center font-black text-white text-base shadow-lg shadow-cyan-500/20">
              <Droplets className="w-4 h-4 sm:w-5 sm:h-5 animate-pulse" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-sm sm:text-base font-black text-white tracking-tight whitespace-nowrap">
                  CITO UF<span className="hidden sm:inline"> SYSTEM</span>
                </h1>
                <span className="hidden sm:inline text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                  {bleConnected ? 'Bluetooth BLE' : 'ESP32 • Thủy Sinh'}
                </span>
                {bleConnected && state.firmwareVersion && (
                  <span className="hidden sm:inline text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                    FW {state.firmwareVersion}
                  </span>
                )}
              </div>
              <p className="hidden sm:block text-xs text-slate-400">
                Điều Khiển Lọc Nước UF Bể Tép &amp; Thủy Sinh Qua Bluetooth / Web
              </p>
            </div>
          </div>

          {/* ---- Điện thoại: TDS · nhiệt độ + nút Bluetooth chỉ có icon ---- */}
          <div className="flex sm:hidden items-center gap-1.5 shrink-0">
            <div className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 flex items-center gap-1.5 text-[11px] font-mono font-bold">
              <span className="text-cyan-300">{state.tds}ppm</span>
              <span className="text-slate-600">·</span>
              <span className={state.temperatureState === 'ERROR' ? 'text-red-400' : 'text-blue-300'}>
                {state.temperatureState === 'ERROR'
                  ? 'Lỗi'
                  : state.temperatureState === 'WAITING'
                    ? '--'
                    : `${state.temperature}°`}
              </span>
            </div>
            <button
              onClick={() => setIsConnectModalOpen(true)}
              aria-label={bleConnected ? `Bluetooth: ${bleDeviceName}` : 'Quét Bluetooth gần máy'}
              className={`w-9 h-9 rounded-xl border flex items-center justify-center ${
                bleConnected
                  ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50'
                  : bleLink === 'reconnecting'
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                    : 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50'
              }`}
            >
              {bleConnected ? (
                <BluetoothConnected className="w-4 h-4" />
              ) : (
                <Bluetooth className={`w-4 h-4 ${bleLink === 'reconnecting' ? 'animate-pulse' : ''}`} />
              )}
            </button>
          </div>

          {/* ---- Máy tính: đầy đủ như cũ ---- */}
          <div className="hidden sm:flex items-center gap-2.5 justify-end flex-wrap">
            <button
              onClick={() => setIsConnectModalOpen(true)}
              className={`px-3.5 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-2 transition-all shadow-md ${
                bleConnected
                  ? 'bg-emerald-950/60 border-emerald-500/60 text-emerald-300 hover:bg-emerald-900/60'
                  : 'bg-cyan-950/60 border-cyan-500/60 text-cyan-300 hover:bg-cyan-900/60'
              }`}
              title="Quét Bluetooth BLE gần máy để tránh can thiệp máy người khác"
            >
              {bleConnected ? (
                <>
                  <BluetoothConnected className="w-4 h-4 text-emerald-400 animate-pulse" />
                  <span>BLE: {bleDeviceName || 'Đã Kết Nối'}</span>
                </>
              ) : (
                <>
                  <Bluetooth className="w-4 h-4 text-cyan-400" />
                  <span>🔍 Quét Bluetooth Gần Máy</span>
                </>
              )}
            </button>
            {statusChips(false)}
          </div>
        </div>
      </header>

      {/* Điện thoại: WiFi / giờ / IP - KHÔNG dính, cuộn đi theo trang */}
      <div className="sm:hidden bg-slate-900/60 border-b border-slate-800 px-3 py-2 flex items-center gap-2 overflow-x-auto">
        {statusChips(true)}
      </div>

      {/* Bluetooth Connection & Security PIN Modal */}
      <CitoConnectionModal
        isOpen={isConnectModalOpen}
        onClose={() => setIsConnectModalOpen(false)}
        connectionMode={connectionMode}
        onSetConnectionMode={setConnectionMode}
        bleConnected={bleConnected}
        bleDeviceName={bleDeviceName}
        onBleConnectSuccess={(name) => {
          setBleConnected(true);
          setBleDeviceName(name);
        }}
        onBleDisconnect={() => {
          setBleConnected(false);
          setBleDeviceName('');
        }}
        devicePin={devicePin}
        onSetDevicePin={handleSetDevicePin}
        wifiSsid={state.wifiSsid}
        onSaveWifi={(ssid, password) => sendAction('SET_WIFI_CONFIG', { ssid, password })}
        wifiScan={state.wifiScan}
        onScanWifi={() => sendAction('WIFI_SCAN')}
      />

      {/* Network Alert if server connection lost */}
      {bleLink === 'reconnecting' && (
        <div className="bg-amber-500/15 border-b border-amber-500/40 text-amber-200 text-xs px-4 py-2 flex items-center justify-center gap-2 text-center">
          <Bluetooth className="w-4 h-4 shrink-0 animate-pulse" />
          <span>
            Đang tự kết nối lại {bleDeviceName || lastDevice?.name || 'máy CITO UF'} qua Bluetooth... (đứng gần máy, bật
            Bluetooth)
          </span>
        </div>
      )}

      {hasSimulator === false && !bleConnected && bleLink !== 'reconnecting' && (
        <div className="bg-cyan-500/15 border-b border-cyan-500/40 text-cyan-200 text-xs px-4 py-2 flex items-center justify-center gap-2 text-center">
          <Bluetooth className="w-4 h-4 shrink-0" />
          {lastDevice && (
            <button
              onClick={quickReconnect}
              className="px-2.5 py-1 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold shrink-0"
            >
              🔄 Kết nối lại {lastDevice.name}
            </button>
          )}
          <span>
            {state.firmwareVersion ? 'Đã ngắt kết nối máy' : 'Chưa kết nối máy'}. Bấm{' '}
            <strong>🔍 Quét Bluetooth Gần Máy</strong> (Chrome / Edge trên máy tính hoặc Android) - số liệu bên dưới{' '}
            {state.firmwareVersion ? 'là lần cuối nhận được, KHÔNG cập nhật' : 'chỉ là mẫu'}.
          </span>
        </div>
      )}

      {networkError && !bleConnected && (
        <div className="bg-amber-500/20 border-b border-amber-500/40 text-amber-300 text-xs px-4 py-2 flex items-center justify-center gap-2">
          <AlertTriangle className="w-4 h-4 animate-bounce" />
          <span>Đang kết nối lại tới CITO UF... (Hoặc kết nối trực tiếp qua Bluetooth)</span>
        </div>
      )}

      {/* 2. Navigation Tabs (Chỉ 2 Tab Điều Khiển) */}
      <div className="bg-slate-900/90 border-b border-slate-800 sm:sticky sm:top-[68px] z-20 backdrop-blur">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 flex items-center justify-between overflow-x-auto py-2">
          <nav className="flex items-center gap-1.5 sm:gap-2">
            <button
              onClick={() => setActiveTab('web')}
              className={`px-3 sm:px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 sm:gap-2 transition-all whitespace-nowrap ${
                activeTab === 'web'
                  ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              <span className="sm:hidden">1. Điều khiển</span>
              <span className="hidden sm:inline">1. Giao Diện Web Điều Khiển Toàn Diện</span>
            </button>

            <button
              onClick={() => setActiveTab('panel')}
              className={`px-3 sm:px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 sm:gap-2 transition-all whitespace-nowrap ${
                activeTab === 'panel'
                  ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Cpu className="w-3.5 h-3.5" />
              <span className="sm:hidden">2. Mặt máy</span>
              <span className="hidden sm:inline">2. Mặt Máy Cảm Ứng (Phần Cứng)</span>
            </button>

            <button
              onClick={() => setActiveTab('settings')}
              className={`px-3 sm:px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 sm:gap-2 transition-all whitespace-nowrap ${
                activeTab === 'settings'
                  ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Settings className="w-3.5 h-3.5" />
              <span className="sm:hidden">3. Cài đặt</span>
              <span className="hidden sm:inline">3. Cài Đặt Máy (TDS · WiFi · Giờ · Logo)</span>
            </button>
          </nav>

          <div className="hidden md:flex items-center gap-3 text-xs text-slate-400 font-mono">
            {bleConnected ? (
              <span className="flex items-center gap-1.5 text-emerald-400 font-bold">
                <ShieldCheck className="w-4 h-4" />
                <span>KẾT NỐI BLE TRỰC TIẾP (BẢO MẬT RIÊNG TƯ)</span>
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-cyan-400 font-bold">
                <ShieldCheck className="w-4 h-4" />
                <span>KẾT NỐI MÁY RIÊNG (LOCAL)</span>
              </span>
            )}
            <span>•</span>
            <span>
              Chế độ: <strong className="text-white">{getTdsModeLabel(state.tdsMode)}</strong>
            </span>
          </div>
        </div>
      </div>

      {/* 3. Main Content Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 space-y-6">
        {activeTab === 'panel' && (
          <div className="space-y-6">
            <CitoPhysicalPanel state={state} onAction={sendAction} />
            <CitoWebDashboard state={state} onAction={sendAction} />
          </div>
        )}

        {activeTab === 'web' && (
          <CitoWebDashboard state={state} onAction={sendAction} />
        )}

        {/* Trang Cài đặt máy: hiệu chuẩn TDS, WiFi, giờ RTC, đèn logo - tách riêng cho đỡ rối */}
        {activeTab === 'settings' && (
          <CitoWebDashboard state={state} onAction={sendAction} page="settings" />
        )}
      </main>

      {/* Kết quả lệnh Bluetooth */}
      {notice && (
        <div
          className={`fixed bottom-4 left-1/2 -translate-x-1/2 z-50 max-w-[90vw] px-4 py-2.5 rounded-xl border text-xs font-bold shadow-2xl ${
            notice.ok
              ? 'bg-emerald-950/95 border-emerald-500/60 text-emerald-300'
              : 'bg-red-950/95 border-red-500/60 text-red-300'
          }`}
        >
          {notice.text}
        </div>
      )}

      {/* 4. Footer */}
      <footer className="bg-slate-900 border-t border-slate-800 py-4 px-4 text-xs text-slate-500 mt-auto">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-300">CITO UF SYSTEM</span>
            <span>—</span>
            <span>Lọc nước UF tự động cho bể tép, bể cá, thủy sinh | Web Bluetooth BLE &amp; WiFi</span>
          </div>
          <div className="text-[11px] font-mono text-slate-500 flex items-center gap-2">
            <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
            <span>Bảo vệ quyền riêng tư qua Bluetooth Low Energy (BLE)</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
