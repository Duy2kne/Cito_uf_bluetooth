import React, { useEffect, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Bluetooth,
  BluetoothConnected,
  Cpu,
  Droplets,
  Radio,
  ShieldCheck,
  Thermometer,
  Wifi,
} from 'lucide-react';
import { CitoConnectionModal } from './components/CitoConnectionModal';
import { CitoPhysicalPanel } from './components/CitoPhysicalPanel';
import { CitoWebDashboard } from './components/CitoWebDashboard';
import { applyBlePacket, bleManager } from './services/bleService';
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
    dirtyFilterMa: 350, // Lọc bẩn bơm nhỏ: 350 mA
    overCurrentMa: 700, // Quá dòng bơm nhỏ: 700 mA
  },
  pumpThresholdsLarge: {
    minCurrentMa: 80,
    dirtyFilterMa: 450, // Lọc bẩn bơm lớn: 450 mA
    overCurrentMa: 800, // Quá dòng bơm lớn: 800 mA
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
  const bleConnectedRef = useRef(false);
  bleConnectedRef.current = bleConnected;

  const [activeTab, setActiveTab] = useState<'panel' | 'web'>('panel');
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

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-cyan-500 selection:text-slate-950">
      {/* 1. Header Bar */}
      <header className="bg-slate-900 border-b border-slate-800 px-4 py-3 sticky top-0 z-30 shadow-2xl">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          {/* Logo & System Title */}
          <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-start">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center font-black text-white text-base shadow-lg shadow-cyan-500/20">
                <Droplets className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-base font-black text-white tracking-tight">
                    CITO UF SYSTEM
                  </h1>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                    {bleConnected ? 'Bluetooth BLE' : 'ESP32 • Thủy Sinh'}
                  </span>
                  {bleConnected && state.firmwareVersion && (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                      FW {state.firmwareVersion}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400">
                  Điều Khiển Lọc Nước UF Bể Tép &amp; Thủy Sinh Qua Bluetooth / Web
                </p>
              </div>
            </div>

            {/* Mobile Bluetooth Button */}
            <div className="sm:hidden">
              <button
                onClick={() => setIsConnectModalOpen(true)}
                className={`p-2 rounded-xl border flex items-center gap-1.5 text-xs font-bold ${
                  bleConnected
                    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                    : 'bg-cyan-500/20 text-cyan-400 border-cyan-500/40'
                }`}
              >
                <Bluetooth className="w-4 h-4" />
                <span>{bleConnected ? 'BLE OK' : 'Bluetooth'}</span>
              </button>
            </div>
          </div>

          {/* Right: Bluetooth BLE Scan Button & Metrics */}
          <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end flex-wrap">
            {/* Bluetooth BLE Scan Button */}
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

            {/* WiFi Status & Setup Button */}
            <button
              onClick={() => {
                setActiveTab('web');
                // Scroll to wifi config smoothly
                setTimeout(() => {
                  const el = document.getElementById('section-wifi-config');
                  if (el) el.scrollIntoView({ behavior: 'smooth' });
                }, 100);
              }}
              className="px-3.5 py-1.5 rounded-xl border border-slate-700 bg-slate-900/90 hover:bg-slate-800 text-xs font-bold flex items-center gap-2 text-slate-200 transition-all shadow-md"
              title="Cài đặt mạng WiFi cho máy CITO UF"
            >
              <Wifi className={`w-4 h-4 ${state.wifiConnected ? 'text-emerald-400' : 'text-slate-400'}`} />
              <span>WiFi:</span>
              <span className="text-cyan-300 font-mono text-[11px] truncate max-w-[120px]">
                {state.wifiSsid || 'Chưa cài'}
              </span>
            </button>

            {/* Quick Metrics Bar */}
            <div className="flex items-center gap-2 text-xs font-mono">
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

              <div className="hidden md:flex bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 items-center gap-1.5">
                <Radio className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-slate-300 text-[11px]">{state.deviceIp}</span>
              </div>
            </div>
          </div>
        </div>
      </header>

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
      {hasSimulator === false && !bleConnected && (
        <div className="bg-cyan-500/15 border-b border-cyan-500/40 text-cyan-200 text-xs px-4 py-2 flex items-center justify-center gap-2 text-center">
          <Bluetooth className="w-4 h-4 shrink-0" />
          <span>
            Chưa kết nối máy. Bấm <strong>🔍 Quét Bluetooth Gần Máy</strong> (Chrome / Edge trên máy tính hoặc Android) - số liệu
            bên dưới chỉ là mẫu.
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
      <div className="bg-slate-900/90 border-b border-slate-800 sticky top-[60px] z-20 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 flex items-center justify-between overflow-x-auto py-2">
          <nav className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('panel')}
              className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all whitespace-nowrap ${
                activeTab === 'panel'
                  ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Cpu className="w-3.5 h-3.5" />
              <span>1. Mặt Máy Cảm Ứng (Phần Cứng)</span>
            </button>

            <button
              onClick={() => setActiveTab('web')}
              className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all whitespace-nowrap ${
                activeTab === 'web'
                  ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              <span>2. Giao Diện Web Điều Khiển Toàn Diện</span>
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
