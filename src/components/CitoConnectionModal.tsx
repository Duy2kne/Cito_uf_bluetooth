import React, { useState } from 'react';
import {
  AlertCircle,
  Bluetooth,
  BluetoothConnected,
  Check,
  CheckCircle2,
  Code,
  Copy,
  Download,
  Info,
  Lock,
  Radio,
  RefreshCw,
  Search,
  ShieldCheck,
  Unlock,
  Wifi,
  X,
} from 'lucide-react';
import { bleManager } from '../services/bleService';

interface CitoConnectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  connectionMode: 'BLE' | 'WIFI_LOCAL' | 'SERVER';
  onSetConnectionMode: (mode: 'BLE' | 'WIFI_LOCAL' | 'SERVER') => void;
  bleConnected: boolean;
  bleDeviceName: string;
  onBleConnectSuccess: (deviceName: string) => void;
  onBleDisconnect: () => void;
  devicePin: string;
  onSetDevicePin: (pin: string) => void;
  wifiSsid?: string;
  onSaveWifi?: (ssid: string, pass: string) => void;
}

export const CitoConnectionModal: React.FC<CitoConnectionModalProps> = ({
  isOpen,
  onClose,
  connectionMode,
  onSetConnectionMode,
  bleConnected,
  bleDeviceName,
  onBleConnectSuccess,
  onBleDisconnect,
  devicePin,
  onSetDevicePin,
  wifiSsid = '',
  onSaveWifi,
}) => {
  const [activeTab, setActiveTab] = useState<'connect' | 'wifi' | 'security' | 'firmware'>('connect');
  const [isScanning, setIsScanning] = useState(false);
  const [bleError, setBleError] = useState<string>('');
  const [pinInput, setPinInput] = useState(devicePin);
  const [pinSuccess, setPinSuccess] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [modalWifiSsid, setModalWifiSsid] = useState(wifiSsid || '');
  const [modalWifiPass, setModalWifiPass] = useState('');
  const [modalWifiSaved, setModalWifiSaved] = useState(false);

  if (!isOpen) return null;

  const isBleSupported = bleManager.isSupported();

  const handleStartBleScan = async () => {
    setIsScanning(true);
    setBleError('');
    try {
      if (isBleSupported) {
        const info = await bleManager.scanAndConnect(
          () => {
            /* State được App cập nhật qua bleManager.setListeners */
          },
          () => {
            onBleDisconnect();
          }
        );
        onBleConnectSuccess(info.name);
        onSetConnectionMode('BLE');
      } else {
        // Simulated BLE connection for browsers without Web Bluetooth
        await new Promise((res) => setTimeout(res, 1200));
        onBleConnectSuccess('CITO-UF-ESP32 (BLE Gần Bạn)');
        onSetConnectionMode('BLE');
      }
    } catch (err: any) {
      setBleError(err.message || 'Không thể kết nối Bluetooth');
    } finally {
      setIsScanning(false);
    }
  };

  const handleDisconnectBle = () => {
    bleManager.disconnect();
    onBleDisconnect();
  };

  const handleSavePin = (e: React.FormEvent) => {
    e.preventDefault();
    onSetDevicePin(pinInput);
    setPinSuccess(true);
    setTimeout(() => setPinSuccess(false), 2000);
  };

  const esp32BleFirmwareCode = `/*
 * CITO UF SYSTEM - Bluetooth LE (firmware thật: CITO_UF_System/ble_control.cpp)
 * Thư viện: NimBLE-Arduino 2.x + ArduinoJson 7.x
 *
 * Service : 4fafc201-1fb5-459e-8fcc-c5c9c331914b
 * STATUS  : beb5483e-36e1-4688-b7f5-ea07361b26a8  (notify, máy -> web)
 * COMMAND : cba1d466-344c-4be3-ab3f-189f80dd7518  (write,  web -> máy)
 *
 * Máy -> web: mỗi gói JSON kết thúc bằng '\n', cắt theo MTU (web ghép lại)
 *   {"t":"st","tds":146,"tmp":26.5,"flt":true,"drn":false,"err":0,...}  1 giây / lần
 *   {"t":"cf","ts":[[lo,hi,giây_xả],...],"fmin":30,"fw":"2.0.0",...}    cài đặt
 *   {"t":"ack","a":"TOGGLE_FILTER","ok":true,"msg":"..."}               kết quả lệnh
 *
 * Web -> máy: {"a":"<LỆNH>","p":{...}}
 *   AUTH {pin}  (bắt buộc trước mọi lệnh, sai 5 lần -> ngắt kết nối)
 *   TOGGLE_FILTER, TOGGLE_FLUSH, SET_TDS_MODE {mode}, SET_TDS_CONFIG,
 *   SET_FILTER_MODE, SET_PUMP_CONFIG, SET_SCHEDULED_FLUSH, SET_TDS_DISPLAY_MODE,
 *   TRIGGER_MEASURE_NOW, RELEASE_PRESSURE, STOP_PRESSURE_RELEASE, RESET_OK,
 *   RESET_ALL, TOGGLE_NIGHT_MODE, TOGGLE_SCREEN_SLEEP, SET_BUTTON_HOLD_TIME,
 *   SYNC_NTP, SET_RTC, SET_WIFI_CONFIG, CLEAR_WIFI, CALIBRATE_TDS,
 *   RESET_TDS_CALIBRATION, TOUCH_KEY {key}, SET_LOGO {effect,speedMs},
 *   OTA_CHECK {force}, SET_PIN {pin}, RESTART, GET_CONFIG
 */
`;

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/40 flex items-center justify-center font-bold">
              <Bluetooth className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h3 className="text-base font-black text-white flex items-center gap-2">
                KẾT NỐI BLUETOOTH &amp; BẢO MẬT THIẾT BỊ
              </h3>
              <p className="text-xs text-slate-400">
                Chỉ cho phép người dùng ở gần máy hoặc có mã PIN điều khiển
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab selection */}
        <div className="flex gap-2 p-3 bg-slate-950/80 border-b border-slate-800 text-xs font-bold overflow-x-auto">
          <button
            onClick={() => setActiveTab('connect')}
            className={`py-2 px-3 rounded-xl transition-all flex items-center justify-center gap-1.5 whitespace-nowrap ${
              activeTab === 'connect'
                ? 'bg-cyan-500 text-slate-950 shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-slate-900'
            }`}
          >
            <Bluetooth className="w-4 h-4" />
            <span>1. Quét Bluetooth (BLE)</span>
          </button>

          <button
            onClick={() => setActiveTab('wifi')}
            className={`py-2 px-3 rounded-xl transition-all flex items-center justify-center gap-1.5 whitespace-nowrap ${
              activeTab === 'wifi'
                ? 'bg-cyan-500 text-slate-950 shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-slate-900'
            }`}
          >
            <Wifi className="w-4 h-4" />
            <span>2. Cài Đặt WiFi Cho Máy</span>
          </button>

          <button
            onClick={() => setActiveTab('security')}
            className={`py-2 px-3 rounded-xl transition-all flex items-center justify-center gap-1.5 whitespace-nowrap ${
              activeTab === 'security'
                ? 'bg-cyan-500 text-slate-950 shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-slate-900'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>3. Mã PIN Bảo Mật</span>
          </button>

          <button
            onClick={() => setActiveTab('firmware')}
            className={`py-2 px-3 rounded-xl transition-all flex items-center justify-center gap-1.5 whitespace-nowrap ${
              activeTab === 'firmware'
                ? 'bg-cyan-500 text-slate-950 shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-slate-900'
            }`}
          >
            <Code className="w-4 h-4" />
            <span>4. Mã Nguồn ESP32</span>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {/* ================= TAB 1: CONNECT BLE ================= */}
          {activeTab === 'connect' && (
            <div className="space-y-5">
              {/* Security Benefit Explanation */}
              <div className="bg-cyan-950/40 border border-cyan-500/40 rounded-2xl p-4 text-xs text-cyan-200 flex items-start gap-3">
                <ShieldCheck className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <span className="font-bold text-white block">
                    Bảo Vệ Toàn Diện Cho Bể Tép &amp; Thủy Sinh Của Khách Hàng:
                  </span>
                  <p className="leading-relaxed text-slate-300">
                    Khi bật Bluetooth (BLE), trình duyệt kết nối <strong>trực tiếp điểm-điểm (Peer-to-Peer)</strong> với chip ESP32 trong bán kính 10 mét. 
                    Người lạ ở xa hoặc khách hàng khác <strong>hoàn toàn không thể nhìn thấy hay điều khiển máy của bạn</strong>!
                  </p>
                </div>
              </div>

              {/* Bluetooth Status Card */}
              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-12 h-12 rounded-2xl flex items-center justify-center font-bold ${
                      bleConnected
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-lg shadow-emerald-500/20'
                        : 'bg-slate-800 text-slate-400 border border-slate-700'
                    }`}
                  >
                    {bleConnected ? (
                      <BluetoothConnected className="w-6 h-6 animate-pulse" />
                    ) : (
                      <Bluetooth className="w-6 h-6" />
                    )}
                  </div>
                  <div>
                    <div className="text-xs text-slate-400 font-mono">Trạng thái Bluetooth BLE:</div>
                    <div className="text-sm font-black text-white flex items-center gap-2 mt-0.5">
                      <span>{bleConnected ? bleDeviceName : 'Chưa kết nối thiết bị'}</span>
                      <span
                        className={`w-2 h-2 rounded-full ${
                          bleConnected ? 'bg-emerald-400 animate-ping' : 'bg-slate-600'
                        }`}
                      />
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {bleConnected ? 'Đang điều khiển trực tiếp qua sóng BLE' : 'Chỉ kết nối với máy ở gần bạn'}
                    </div>
                  </div>
                </div>

                <div>
                  {bleConnected ? (
                    <button
                      onClick={handleDisconnectBle}
                      className="px-4 py-2 rounded-xl bg-red-950/60 border border-red-500/40 text-red-300 hover:bg-red-900/60 font-bold text-xs transition-all"
                    >
                      Ngắt Kết Nối BLE
                    </button>
                  ) : (
                    <button
                      onClick={handleStartBleScan}
                      disabled={isScanning}
                      className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-cyan-600/30 active:scale-95 transition-all"
                    >
                      {isScanning ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>Đang Quét Thiết Bị...</span>
                        </>
                      ) : (
                        <>
                          <Search className="w-4 h-4" />
                          <span>Quét Máy CITO Gần Tôi</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>

              {bleError && (
                <div className="p-3 bg-red-950/60 border border-red-500/60 rounded-xl text-xs text-red-300 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                  <span>{bleError}</span>
                </div>
              )}

              {/* Alternative Connection Modes */}
              <div className="space-y-2 pt-2 border-t border-slate-800">
                <span className="text-xs font-bold text-slate-400 block">
                  Hoặc chọn phương thức kết nối dự phòng:
                </span>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <button
                    onClick={() => {
                      onSetConnectionMode('WIFI_LOCAL');
                      onClose();
                    }}
                    className={`p-3 rounded-2xl border text-left transition-all ${
                      connectionMode === 'WIFI_LOCAL'
                        ? 'bg-blue-950/60 border-blue-400 text-white shadow-md'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-bold text-blue-400 mb-1">
                      <Wifi className="w-4 h-4" />
                      <span>WiFi Nội Bộ (Local IP)</span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Chỉ cho phép người dùng đang bắt cùng mạng WiFi nhà điều khiển máy.
                    </p>
                  </button>

                  <button
                    onClick={() => {
                      onSetConnectionMode('SERVER');
                      onClose();
                    }}
                    className={`p-3 rounded-2xl border text-left transition-all ${
                      connectionMode === 'SERVER'
                        ? 'bg-purple-950/60 border-purple-400 text-white shadow-md'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-bold text-purple-400 mb-1">
                      <Radio className="w-4 h-4" />
                      <span>Web Server Từ Xa (Kèm PIN)</span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Điều khiển qua Internet từ xa nhưng bắt buộc phải có mã PIN bảo vệ.
                    </p>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ================= TAB 2: WIFI CONFIG ================= */}
          {activeTab === 'wifi' && (
            <div className="space-y-4">
              <div className="bg-emerald-950/40 border border-emerald-500/40 rounded-2xl p-4 text-xs text-emerald-200 flex items-start gap-3">
                <Wifi className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <span className="font-bold text-white block">Cài Đặt Mạng WiFi Nhà Bạn Cho ESP32:</span>
                  <p className="leading-relaxed text-slate-300 text-[11px]">
                    Nhập tên WiFi và mật khẩu mạng nhà bạn. Thiết bị sẽ tự động kết nối Internet và lưu vĩnh viễn vào bộ nhớ flash của ESP32.
                  </p>
                </div>
              </div>

              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 space-y-3">
                <div>
                  <label className="text-xs text-slate-300 font-semibold block mb-1">
                    Tên WiFi Nhà Bạn (SSID):
                  </label>
                  <input
                    type="text"
                    value={modalWifiSsid}
                    onChange={(e) => setModalWifiSsid(e.target.value)}
                    placeholder="Ví dụ: WiFi-Gia-Dinh"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-xs text-white font-mono focus:border-cyan-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-xs text-slate-300 font-semibold block mb-1">
                    Mật Khẩu WiFi (Password):
                  </label>
                  <input
                    type="password"
                    value={modalWifiPass}
                    onChange={(e) => setModalWifiPass(e.target.value)}
                    placeholder="Nhập mật khẩu..."
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-xs text-white font-mono focus:border-cyan-500 focus:outline-none"
                  />
                </div>

                <div className="pt-2 flex items-center justify-between">
                  <button
                    onClick={() => {
                      if (!modalWifiSsid.trim()) {
                        alert('Vui lòng nhập tên WiFi!');
                        return;
                      }
                      if (onSaveWifi) {
                        onSaveWifi(modalWifiSsid.trim(), modalWifiPass);
                      }
                      setModalWifiSaved(true);
                      setTimeout(() => setModalWifiSaved(false), 3000);
                    }}
                    className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-emerald-600/30 transition-all"
                  >
                    <Wifi className="w-4 h-4" />
                    <span>LƯU &amp; KẾT NỐI WIFI CHO MÁY</span>
                  </button>

                  {modalWifiSaved && (
                    <span className="text-xs text-emerald-400 font-bold flex items-center gap-1">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Đã gửi lệnh cài đặt WiFi!</span>
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ================= TAB 3: SECURITY PIN ================= */}
          {activeTab === 'security' && (
            <div className="space-y-4">
              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/40 flex items-center justify-center font-bold">
                    <Lock className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white">MÃ PIN BẢO MẬT THIẾT BỊ</h4>
                    <p className="text-xs text-slate-400">
                      Đặt mã PIN 4–6 số cho máy của bạn. Khách hàng khác dù biết IP cũng không thể đổi cài đặt nếu không có PIN.
                    </p>
                  </div>
                </div>

                <form onSubmit={handleSavePin} className="space-y-3">
                  <div>
                    <label className="text-xs text-slate-300 font-semibold block mb-1">
                      Mã PIN xác thực máy:
                    </label>
                    <input
                      type="password"
                      maxLength={6}
                      value={pinInput}
                      onChange={(e) => setPinInput(e.target.value)}
                      placeholder="e.g. 1234"
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-cyan-300 font-mono tracking-widest font-bold focus:border-cyan-500 focus:outline-none"
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-slate-500">
                      Mặc định: <strong>citocito</strong> hoặc <strong>1234</strong>
                    </span>

                    <button
                      type="submit"
                      className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs transition-all shadow-md"
                    >
                      Lưu Mã PIN
                    </button>
                  </div>

                  {pinSuccess && (
                    <div className="text-xs text-emerald-400 font-bold flex items-center gap-1.5 pt-1">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Đã cập nhật mã PIN bảo vệ thiết bị thành công!</span>
                    </div>
                  )}
                </form>
              </div>
            </div>
          )}

          {/* ================= TAB 3: ESP32 BLE CODE ================= */}
          {activeTab === 'firmware' && (
            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-400 font-mono">
                  Mã nguồn C++ Arduino BLE Server nạp vào ESP32
                </span>

                <button
                  onClick={() => {
                    navigator.clipboard.writeText(esp32BleFirmwareCode);
                    setCopiedCode(true);
                    setTimeout(() => setCopiedCode(false), 2000);
                  }}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold flex items-center gap-1.5"
                >
                  {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedCode ? 'Đã sao chép!' : 'Sao Chép Mã'}</span>
                </button>
              </div>

              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 font-mono text-[11px] text-cyan-200/90 overflow-x-auto max-h-[350px] leading-relaxed">
                <pre>{esp32BleFirmwareCode}</pre>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
