import React, { useEffect, useState } from 'react';
import { WifiScanList } from './WifiScanList';
import { HistoryPanel } from './HistoryPanel';
import { LogoPanel } from './LogoPanel';
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Clock,
  Cpu,
  Download,
  Droplets,
  Eye,
  EyeOff,
  Gauge,
  Moon,
  Power,
  Radio,
  RefreshCw,
  Save,
  Settings,
  ShieldAlert,
  Sliders,
  Sparkles,
  Thermometer,
  Upload,
  Wifi,
  Wrench,
  Zap,
} from 'lucide-react';
import {
  CitoSystemState,
  FilterDaysType,
  FilterMode,
  formatTemperature,
  getTdsModeLabel,
  PumpThresholds,
  PumpType,
  ScheduledFlush,
  TDS_MODE_LABELS,
  TdsMode,
  TdsThreshold,
} from '../types/system';

// Mặc định firmware (config.h DEF_PUMP_*), theo khảo sát thực tế
const PUMP_DEFAULTS: Record<PumpType, PumpThresholds> = {
  SMALL: { minCurrentMa: 40, dirtyFilterMa: 750, overCurrentMa: 1200 },
  LARGE: { minCurrentMa: 80, dirtyFilterMa: 800, overCurrentMa: 1200 },
};
const PUMP_NAMES: Record<PumpType, string> = { SMALL: 'Bơm nhỏ', LARGE: 'Bơm lớn' };
const WEEKDAY_LABELS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

/**
 * State của form nhưng đi theo giá trị máy gửi lên: mỗi khi máy báo cấu hình khác (lúc kết nối,
 * sau khi lưu, hoặc chỉnh trên mặt máy) thì form lấy luôn giá trị đó.
 */
function useSyncedState<T>(value: T): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [v, setV] = useState<T>(value);
  const key = JSON.stringify(value);
  useEffect(() => {
    setV(JSON.parse(key));
  }, [key]);
  return [v, setV];
}

interface CitoWebDashboardProps {
  state: CitoSystemState;
  onAction: (action: string, payload?: any) => void;
  // 'control' = vận hành hằng ngày (mục 1-9), 'settings' = trang Cài đặt máy
  // (hiệu chuẩn TDS, WiFi, giờ RTC, đèn logo) - tách riêng cho đỡ rối
  page?: 'control' | 'settings';
}

export const CitoWebDashboard: React.FC<CitoWebDashboardProps> = ({
  state,
  onAction,
  page = 'control',
}) => {
  // Form cục bộ TỰ CẬP NHẬT theo máy (xem useSyncedState): trước đây form lấy số mẫu lúc mở
  // trang rồi đứng yên -> máy đang TẮT chế độ TDS mà web vẫn sáng "TÉP".
  const [tdsForm, setTdsForm] = useSyncedState<Record<string, TdsThreshold>>(state.tdsSettings);

  const [filterModeForm, setFilterModeForm] = useSyncedState<FilterMode>(state.filterMode);
  const [minutesPerHourForm, setMinutesPerHourForm] = useSyncedState<number>(state.filterMinutesPerHour);
  const [filterDaysForm, setFilterDaysForm] = useSyncedState<FilterDaysType>(state.filterDays);
  const [weekdaysForm, setWeekdaysForm] = useSyncedState<boolean[]>(state.filterWeekdays);

  const [flushForm, setFlushForm] = useSyncedState<ScheduledFlush>(state.scheduledFlush);

  // Ngưỡng dòng TỪNG bơm (trang Cài đặt)
  const [pumpForm, setPumpForm] = useSyncedState<Record<PumpType, PumpThresholds>>({
    SMALL: state.pumpThresholdsSmall,
    LARGE: state.pumpThresholdsLarge,
  });

  // Form hiệu chuẩn TDS
  const [standardTdsInput, setStandardTdsInput] = useState<number>(
    state.tdsCalibration?.standardSolutionPpm || 150
  );
  const [customKFactorInput, setCustomKFactorInput] = useSyncedState<number>(state.tdsCalibration?.kFactor || 1.0);

  // Form cấu hình WiFi
  const [wifiSsidInput, setWifiSsidInput] = useState<string>(state.wifiConfig?.ssid || state.wifiSsid || '');
  const [wifiPasswordInput, setWifiPasswordInput] = useState<string>('');
  const [showWifiPassword, setShowWifiPassword] = useState<boolean>(false);
  const [wifiSsidTouched, setWifiSsidTouched] = useState<boolean>(false);

  // Máy gửi tên WiFi đang lưu sau khi kết nối Bluetooth -> điền sẵn (nếu người dùng chưa gõ)
  useEffect(() => {
    if (!wifiSsidTouched && state.wifiSsid) setWifiSsidInput(state.wifiSsid);
  }, [state.wifiSsid, wifiSsidTouched]);

  const pickWifi = (ssid: string) => {
    setWifiSsidInput(ssid);
    setWifiSsidTouched(true);
    setWifiPasswordInput('');
    setTimeout(() => document.getElementById('wifi-password-input')?.focus(), 50);
  };

  const WIFI_STA_TEXT = [
    'Chưa cài WiFi',
    'Đang kết nối...',
    'Đã kết nối',
    'Không thấy mạng (sai tên / quá xa / WiFi 5GHz)',
    'Sai mật khẩu hoặc router từ chối',
  ];
  const staState = state.wifiStaState ?? (state.wifiConnected ? 2 : state.wifiSsid ? 1 : 0);

  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string>('');

  const showSaveSuccess = (msg: string) => {
    setSaveSuccessMsg(msg);
    setTimeout(() => setSaveSuccessMsg(''), 3000);
  };

  // Compile active error strings as documented in Section 6.1
  const getActiveErrorDescription = () => {
    const list: string[] = [];
    if (state.activeErrors.err222_pumpOverCurrent) list.push('BƠM QUÁ DÒNG (mã 222) - ĐÃ DỪNG KHẨN CẤP');
    if (state.activeErrors.err666_drainOverCurrent) list.push('VAN XẢ QUÁ DÒNG (mã 666) - ĐÃ DỪNG KHẨN CẤP');
    if (state.activeErrors.err111_pumpNoCurrent) list.push('BƠM HỎNG/KHÔNG CÓ DÒNG (mã 111)');
    if (state.activeErrors.err555_drainNoCurrent) list.push('VAN XẢ KHÔNG CÓ DÒNG (mã 555)');
    if (state.activeErrors.flt_dirtyFilter) list.push('LÕI LỌC BẨN (mã FLt) - BƠM VẪN CHẠY');
    if (state.activeErrors.err333_filterValveBlocked) list.push('VAN LỌC KHÔNG MỞ (mã 333)');
    if (state.activeErrors.err444_drainNoFlow) list.push('ĐƯỜNG XẢ KHÔNG CÓ NƯỚC (mã 444)');
    if (state.activeErrors.rtcLost) list.push('RTC MẤT KẾT NỐI');
    if (state.activeErrors.acsPumpDisconnected) list.push('CẢM BIẾN DÒNG BƠM CHƯA CẮM');
    if (state.activeErrors.acsDrainDisconnected) list.push('CẢM BIẾN DÒNG VAN CHƯA CẮM');

    if (list.length === 0) return 'Bình thường (Hệ thống hoạt động tốt)';
    return list.join(' | ');
  };

  const activeErrorText = getActiveErrorDescription();
  const hasCriticalError =
    state.activeErrors.err222_pumpOverCurrent ||
    state.activeErrors.err666_drainOverCurrent ||
    state.activeErrors.err111_pumpNoCurrent;

  return (
    <div className="space-y-6">
      {/* Success Notification Bar */}
      {saveSuccessMsg && (
        <div className="p-3 bg-emerald-500/20 border border-emerald-500/50 rounded-2xl text-xs text-emerald-300 font-bold flex items-center gap-2 animate-bounce">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{saveSuccessMsg}</span>
        </div>
      )}

      {page === 'control' && (
      <>
      {/* ================= 6.1 MỤC TRẠNG THÁI (ĐẦU TRANG) ================= */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 md:p-6 shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
          <h3 className="text-base font-black text-white flex items-center gap-2">
            <Activity className="w-5 h-5 text-cyan-400" />
            1. TRẠNG THÁI HỆ THỐNG
          </h3>
          <span className="text-xs text-slate-400 font-mono">
            Tự động cập nhật mỗi 2 giây
          </span>
        </div>

        {/* Status Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          {/* TDS */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3.5 flex flex-col justify-between">
            <div className="text-[11px] text-slate-400 font-medium flex items-center justify-between">
              <span>TDS NƯỚC</span>
              <Droplets className="w-3.5 h-3.5 text-cyan-400" />
            </div>
            <div className="my-1">
              <span className="text-3xl font-black font-mono text-cyan-400">{state.tds}</span>
              <span className="text-xs text-slate-400 ml-1">ppm</span>
            </div>
            <div className="text-[10px] text-slate-500 truncate">
              {state.tdsDisplayMode === 'HOURLY'
                ? `Đo ${state.lastMeasuredAgoMinutes}p trước, lần tới sau ${state.nextMeasureInMinutes}p`
                : 'Real-time (liên tục 2s)'}
            </div>
          </div>

          {/* Nhiệt độ */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3.5 flex flex-col justify-between">
            <div className="text-[11px] text-slate-400 font-medium flex items-center justify-between">
              <span>NHIỆT ĐỘ</span>
              <Thermometer className="w-3.5 h-3.5 text-blue-400" />
            </div>
            <div className="my-1">
              {state.temperatureState === 'ERROR' || state.temperatureState === 'WAITING' ? (
                <span
                  className={`text-lg font-black ${
                    state.temperatureState === 'ERROR' ? 'text-red-400' : 'text-amber-300'
                  }`}
                >
                  {formatTemperature(state)}
                </span>
              ) : (
                <>
                  <span className="text-3xl font-black font-mono text-blue-400">{state.temperature}</span>
                  <span className="text-xs text-slate-400 ml-1">°C</span>
                </>
              )}
            </div>
            <div className={`text-[10px] ${state.temperatureState === 'ERROR' ? 'text-red-400/80' : 'text-slate-500'}`}>
              {state.temperatureState === 'ERROR'
                ? 'DS18B20 không đọc được - kiểm tra dây GPIO25 + trở 4.7k'
                : state.temperatureState === 'WAITING'
                  ? 'Chế độ 1 tiếng/lần - chưa đo lần nào'
                  : 'Cảm biến DS18B20'}
            </div>
          </div>

          {/* Lọc */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3.5 flex flex-col justify-between">
            <div className="text-[11px] text-slate-400 font-medium">TRẠNG THÁI LỌC</div>
            <div className="my-1">
              <span
                className={`text-lg font-black font-mono ${
                  state.isFiltering ? 'text-emerald-400' : 'text-slate-500'
                }`}
              >
                {state.isFiltering ? 'ĐANG LỌC' : 'TẮT'}
              </span>
              {state.isFiltering && (
                <span
                  className={`text-[10px] block font-mono ${
                    state.filterSource === 'MANUAL' ? 'text-amber-400' : 'text-emerald-400/80'
                  }`}
                >
                  {state.filterSource === 'MANUAL'
                    ? '[Bật tay]'
                    : state.filterSource === 'SENSOR'
                      ? '[Tự bật để đo TDS]'
                      : state.filterSource === 'PRIMING'
                        ? `[Mồi nước khởi động${state.primingLeftSec ? ` - còn ${state.primingLeftSec}s` : ''}]`
                        : '[Tự động theo lịch]'}
                </span>
              )}
            </div>
            <div className={`text-[10px] font-mono ${state.scheduleOverridden ? 'text-amber-400' : 'text-slate-500'}`}>
              Lịch: Mode {state.filterMode}
              {state.scheduleOverridden ? ' (TẠM DỪNG)' : ''}
            </div>
          </div>

          {/* Xả */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3.5 flex flex-col justify-between">
            <div className="text-[11px] text-slate-400 font-medium">TRẠNG THÁI XẢ</div>
            <div className="my-1">
              <span
                className={`text-lg font-black font-mono ${
                  state.isFlushing || state.isPressureRelease ? 'text-amber-400 animate-pulse' : 'text-slate-500'
                }`}
              >
                {state.isPressureRelease ? 'XẢ ÁP' : state.isFlushing ? 'ĐANG XẢ' : 'TẮT'}
              </span>
            </div>
            <div className="text-[10px] text-slate-500 font-mono">
              {state.isPressureRelease
                ? `Mở 2 van, bơm tắt${state.prelLeftSec ? ` - còn ${state.prelLeftSec}s` : ''}`
                : state.cooldownSecondsRemaining > 0
                ? `Cooldown: ${Math.round(state.cooldownSecondsRemaining / 60)}p`
                : 'Sẵn sàng xả'}
            </div>
          </div>

          {/* Dòng Bơm */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3.5 flex flex-col justify-between">
            <div className="text-[11px] text-slate-400 font-medium flex items-center justify-between">
              <span>DÒNG BƠM</span>
              <Gauge className="w-3.5 h-3.5 text-cyan-400" />
            </div>
            <div className="my-1">
              <span
                className={`text-2xl font-black font-mono ${
                  state.activeErrors.err222_pumpOverCurrent
                    ? 'text-red-500'
                    : state.activeErrors.flt_dirtyFilter
                    ? 'text-amber-400'
                    : 'text-white'
                }`}
              >
                {state.pumpCurrentMa}
              </span>
              <span className="text-xs text-slate-400 ml-1">mA</span>
            </div>
            <div className="text-[10px] text-slate-500 truncate">
              {PUMP_NAMES[state.pumpType]} (bẩn {
                (state.pumpType === 'SMALL' ? state.pumpThresholdsSmall : state.pumpThresholdsLarge).dirtyFilterMa
              } mA)
            </div>
          </div>

          {/* Dòng Van Xả */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3.5 flex flex-col justify-between">
            <div className="text-[11px] text-slate-400 font-medium flex items-center justify-between">
              <span>DÒNG VAN XẢ</span>
              <Zap className="w-3.5 h-3.5 text-amber-400" />
            </div>
            <div className="my-1">
              <span className="text-2xl font-black font-mono text-white">
                {state.drainValveCurrentMa}
              </span>
              <span className="text-xs text-slate-400 ml-1">mA</span>
            </div>
            <div className="text-[10px] text-slate-500">Chuẩn ~300mA</div>
          </div>
        </div>

        {/* Banner Lỗi hiển thị đúng chuẩn Mục 6.1 */}
        <div
          className={`mt-4 p-3 rounded-2xl border flex items-center justify-between text-xs ${
            hasCriticalError
              ? 'bg-red-950/70 border-red-500 text-red-300'
              : state.activeErrors.flt_dirtyFilter
              ? 'bg-amber-950/60 border-amber-500 text-amber-300'
              : 'bg-slate-950 border-slate-800 text-emerald-400'
          }`}
        >
          <div className="flex items-center gap-2">
            {hasCriticalError ? (
              <AlertOctagon className="w-4 h-4 text-red-400 shrink-0 animate-bounce" />
            ) : state.activeErrors.flt_dirtyFilter ? (
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            )}
            <span className="font-bold">LỖI HỆ THỐNG:</span>
            <span>{activeErrorText}</span>
          </div>

          {(hasCriticalError || state.activeErrors.flt_dirtyFilter) && (
            <button
              onClick={() => onAction('RESET_OK')}
              className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-white font-bold transition-all"
            >
              Nhấn OK Xóa Lỗi
            </button>
          )}
        </div>
      </div>

      {/* ================= 6.6 ĐIỀU KHIỂN THỦ CÔNG & TIỆN ÍCH ================= */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 md:p-6 shadow-xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <h3 className="text-base font-black text-white flex items-center gap-2">
            <Power className="w-5 h-5 text-cyan-400" />
            2. ĐIỀU KHIỂN THỦ CÔNG &amp; TIỆN ÍCH VẬN HÀNH
          </h3>
          <span className="text-xs text-slate-400 font-mono">
            Bật/tắt thiết bị chấp hành &amp; chế độ khẩn cấp
          </span>
        </div>

        {state.ocHalted && (
          <div className="p-3.5 rounded-2xl bg-red-950/60 border border-red-500/60 text-xs text-red-200 flex flex-wrap items-center justify-between gap-3">
            <span>
              <strong className="text-red-300">⛔ MÁY ĐANG DỪNG KHẨN CẤP DO QUÁ DÒNG.</strong> Bơm và van bị khóa, không bật
              được từ app. Kiểm tra bơm / van rồi bấm Xóa lỗi.
            </span>
            <button
              onClick={() => onAction('RESET_OK')}
              className="px-3 py-1.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold"
            >
              Xóa lỗi (OK)
            </button>
          </div>
        )}

        {state.scheduleOverridden && !state.ocHalted && (
          <div className="p-3.5 rounded-2xl bg-amber-950/40 border border-amber-500/50 text-xs text-amber-200 flex flex-wrap items-center justify-between gap-3">
            <span>
              <strong className="text-amber-300">⏸ Lịch lọc tự động đang TẠM DỪNG</strong> vì lọc đã được bật/tắt bằng tay (app
              hoặc nút LỌC trên máy). Máy {state.isFiltering ? 'sẽ lọc liên tục' : 'sẽ KHÔNG tự lọc'} cho tới khi về lịch.
            </span>
            <button
              onClick={() => onAction('RESUME_AUTO')}
              className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold"
            >
              ▶ Về lịch tự động
            </button>
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {/* Toggle Lọc */}
          <button
            onClick={() => onAction('TOGGLE_FILTER')}
            className={`p-3.5 rounded-2xl border font-bold text-xs flex items-center justify-center gap-2 transition-all ${
              state.isFiltering
                ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300 shadow-md shadow-emerald-500/20'
                : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
            }`}
          >
            <Power className="w-4 h-4" />
            <span>{state.isFiltering ? 'TẮT LỌC' : 'BẬT LỌC'}</span>
          </button>

          {/* Toggle Xả */}
          <button
            onClick={() => onAction('TOGGLE_FLUSH')}
            className={`p-3.5 rounded-2xl border font-bold text-xs flex items-center justify-center gap-2 transition-all ${
              state.isFlushing
                ? 'bg-amber-500/20 border-amber-400 text-amber-300 shadow-md shadow-amber-500/20'
                : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
            }`}
          >
            <Droplets className="w-4 h-4" />
            <span>{state.isFlushing ? 'TẮT XẢ' : 'BẬT XẢ'}</span>
          </button>

          {/* Ban Đêm */}
          <button
            onClick={() => onAction('TOGGLE_NIGHT_MODE')}
            className={`p-3.5 rounded-2xl border font-bold text-xs flex items-center justify-center gap-2 transition-all ${
              state.nightMode
                ? 'bg-indigo-500/20 border-indigo-400 text-indigo-300'
                : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
            }`}
          >
            <Moon className="w-4 h-4" />
            <span>{state.nightMode ? '🌙 Ban Đêm: BẬT' : '🌙 Ban Đêm: TẮT'}</span>
          </button>

          {/* Màn Hình Khi Ngủ */}
          <button
            onClick={() => onAction('TOGGLE_SCREEN_SLEEP')}
            className={`p-3.5 rounded-2xl border font-bold text-xs flex items-center justify-center gap-2 transition-all ${
              state.screenWhenSleeping
                ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300'
                : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
            }`}
          >
            <Zap className="w-4 h-4" />
            <span>{state.screenWhenSleeping ? 'Màn Ngủ: BẬT' : 'Màn Ngủ: TẮT'}</span>
          </button>
        </div>

        {/* Loại bơm đang lắp - đổi ngay tại đây, ngưỡng từng bơm chỉnh ở trang Cài đặt */}
        <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 text-xs space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-slate-300 font-bold flex items-center gap-1.5">
              <Cpu className="w-4 h-4 text-cyan-400" />
              Loại bơm đang lắp
            </span>
            <span className="text-[10px] text-slate-500">Ngưỡng dòng từng bơm: trang 3. Cài đặt</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {(['SMALL', 'LARGE'] as PumpType[]).map((pt) => {
              const lim = pt === 'SMALL' ? state.pumpThresholdsSmall : state.pumpThresholdsLarge;
              return (
                <button
                  key={pt}
                  onClick={() => {
                    if (state.pumpType === pt) return;
                    onAction('SET_PUMP_CONFIG', { pumpType: pt });
                    showSaveSuccess(`Đã chọn ${PUMP_NAMES[pt]}`);
                  }}
                  className={`py-2 rounded-xl border font-bold flex flex-col items-center gap-0.5 transition-all ${
                    state.pumpType === pt
                      ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <span>{PUMP_NAMES[pt]}</span>
                  <span className="text-[10px] font-mono opacity-80">
                    Bẩn {lim.dirtyFilterMa} / Quá dòng {lim.overCurrentMa} mA
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Secondary Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-800 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => onAction('TRIGGER_MEASURE_NOW')}
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold flex items-center gap-1.5"
              title="Tự bật lọc 20 giây để đo ngay TDS và nhiệt độ"
            >
              <RefreshCw className="w-3.5 h-3.5 text-cyan-400" />
              <span>Đo Ngay TDS/Temp</span>
            </button>

            <button
              onClick={() => onAction(state.isPressureRelease ? 'STOP_PRESSURE_RELEASE' : 'RELEASE_PRESSURE')}
              className={`px-3 py-1.5 rounded-xl font-bold flex items-center gap-1.5 ${
                state.isPressureRelease
                  ? 'bg-amber-500/20 border border-amber-400 text-amber-300 animate-pulse'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
              }`}
              title="Mở cả 2 van, bơm tắt trong 30 giây để tháo lắp màng"
            >
              <Wrench className="w-3.5 h-3.5 text-amber-400" />
              <span>
                {state.isPressureRelease
                  ? `Đang xả áp${state.prelLeftSec ? ` ${state.prelLeftSec}s` : ''} - bấm để dừng`
                  : 'Xả Áp Suất (XAP)'}
              </span>
            </button>

            <button
              onClick={() => onAction('SYNC_NTP')}
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold flex items-center gap-1.5"
            >
              <Clock className="w-3.5 h-3.5 text-blue-400" />
              <span>Đồng Bộ Giờ NTP</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                if (window.confirm('Bạn có chắc muốn Reset toàn bộ cài đặt CITO UF về mặc định?')) {
                  onAction('RESET_ALL');
                  showSaveSuccess('Đã khôi phục toàn bộ cài đặt gốc');
                }
              }}
              className="px-3 py-1.5 rounded-xl bg-red-950/60 border border-red-500/40 text-red-300 hover:bg-red-900/60 font-bold flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Khôi Phục Gốc (RESET)</span>
            </button>
          </div>
        </div>
      </div>

      {/* ================= 6.2 MỤC CHẾ ĐỘ TDS (CHE DO) ================= */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 md:p-6 shadow-xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <h3 className="text-base font-black text-white flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-cyan-400" />
            3. CHẾ ĐỘ TDS (TÉP / CÁ / CÂY / CUSTOM)
          </h3>
          <span className="text-xs text-slate-400 font-mono">
            Tự xả khi TDS vượt ngưỡng Hi
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {(['OFF', 'TEP', 'CA', 'CAY', 'CUSTOM'] as TdsMode[]).map((mode) => {
            const isSelected = state.tdsMode === mode;
            const titles: Record<string, string> = {
              OFF: 'TẮT',
              TEP: 'TÉP',
              CA: 'CÁ',
              CAY: 'CÂY',
              CUSTOM: 'CUSTOM',
            };
            return (
              <button
                key={mode}
                onClick={() => {
                  if (isSelected) return;
                  onAction('SET_TDS_MODE', { mode });
                  showSaveSuccess(`Đã chuyển chế độ TDS: ${getTdsModeLabel(mode)}`);
                }}
                className={`p-3 rounded-2xl border text-center transition-all ${
                  isSelected
                    ? 'bg-cyan-500/20 border-cyan-400 text-white shadow-md shadow-cyan-500/20'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="font-black text-sm">{titles[mode]}</div>
                {mode !== 'OFF' && (
                  <div className="text-[10px] text-slate-400 mt-1 font-mono">
                    Hi: {state.tdsSettings[mode as keyof typeof state.tdsSettings]?.hi} ppm
                  </div>
                )}
              </button>
            );
          })}
        </div>

        <div className="text-xs text-slate-400 pt-1">
          {state.tdsMode === 'OFF' ? (
            <span>
              Máy đang <strong className="text-white">TẮT</strong> chế độ TDS - chỉ xả theo <strong>Lịch xả định kỳ</strong>{' '}
              (mục 5).
            </span>
          ) : (
            <span>
              Máy đang chạy: <strong className="text-cyan-300 font-bold">{getTdsModeLabel(state.tdsMode)}</strong> (Lo:{' '}
              {state.tdsSettings[state.tdsMode as keyof typeof state.tdsSettings]?.lo} ppm | Hi:{' '}
              {state.tdsSettings[state.tdsMode as keyof typeof state.tdsSettings]?.hi} ppm | Xả:{' '}
              {state.tdsSettings[state.tdsMode as keyof typeof state.tdsSettings]?.flushMinutes}p{' '}
              {state.tdsSettings[state.tdsMode as keyof typeof state.tdsSettings]?.flushSeconds}s). Bấm chế độ khác là
              đổi ngay.
            </span>
          )}
        </div>
      </div>

      {/* ================= 6.3 CÀI ĐẶT TDS & NGƯỠNG XẢ ================= */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 md:p-6 shadow-xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div>
            <h3 className="text-base font-black text-white flex items-center gap-2">
              <Settings className="w-5 h-5 text-cyan-400" />
              4. CÀI ĐẶT NGƯỠNG TDS &amp; THỜI GIAN XẢ
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Thời gian xả cài theo phút + giây (tối thiểu 5 giây, tối đa 30 phút). Cooldown 1 giờ sau khi xả.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {(['TEP', 'CA', 'CAY', 'CUSTOM'] as const).map((key) => {
            const item = tdsForm[key] || { lo: 120, hi: 170, flushMinutes: 1, flushSeconds: 0 };
            const modeName = getTdsModeLabel(key);
            return (
              <div key={key} className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-3">
                <div className="font-bold text-sm text-cyan-300 flex items-center justify-between border-b border-slate-800/80 pb-2">
                  <span>CHẾ ĐỘ {modeName}</span>
                  <span className="text-[10px] text-slate-500 font-mono">Lo/Hi/Thời lượng</span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">Lo (ppm)</label>
                    <input
                      type="number"
                      value={item.lo}
                      onChange={(e) =>
                        setTdsForm({
                          ...tdsForm,
                          [key]: { ...item, lo: Number(e.target.value) },
                        })
                      }
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">Hi (ppm xả)</label>
                    <input
                      type="number"
                      value={item.hi}
                      onChange={(e) =>
                        setTdsForm({
                          ...tdsForm,
                          [key]: { ...item, hi: Number(e.target.value) },
                        })
                      }
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-cyan-400 font-mono font-bold"
                    />
                  </div>
                </div>

                <div className="text-xs">
                  <label className="text-[10px] text-slate-400 block mb-1">
                    Thời gian xả (Phút : Giây)
                  </label>
                  <div className="flex items-center gap-1.5 font-mono">
                    <input
                      type="number"
                      min="0"
                      max="30"
                      value={item.flushMinutes}
                      onChange={(e) =>
                        setTdsForm({
                          ...tdsForm,
                          [key]: { ...item, flushMinutes: Number(e.target.value) },
                        })
                      }
                      className="w-16 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-white text-center"
                    />
                    <span className="text-slate-500 font-bold">:</span>
                    <input
                      type="number"
                      min="0"
                      max="59"
                      value={item.flushSeconds}
                      onChange={(e) =>
                        setTdsForm({
                          ...tdsForm,
                          [key]: { ...item, flushSeconds: Number(e.target.value) },
                        })
                      }
                      className="w-16 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-white text-center"
                    />
                    <span className="text-[11px] text-slate-400">p:s</span>
                  </div>
                </div>

                <button
                  onClick={() => {
                    onAction('SET_TDS_CONFIG', {
                      mode: key,
                      lo: item.lo,
                      hi: item.hi,
                      flushMinutes: item.flushMinutes,
                      flushSeconds: item.flushSeconds,
                    });
                    showSaveSuccess(`Đã lưu ngưỡng TDS chế độ ${modeName}`);
                  }}
                  className="w-full py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 transition-all"
                >
                  Lưu {modeName}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* ================= 5. CÀI ĐẶT LỊCH XẢ ĐỊNH KỲ ================= */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 md:p-6 shadow-xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
          <div>
            <h3 className="text-base font-black text-white flex items-center gap-2">
              <Droplets className="w-5 h-5 text-amber-400" />
              5. CÀI ĐẶT LỊCH XẢ ĐỊNH KỲ (KHI TẮT CHẾ ĐỘ TDS)
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Tự động xả theo chu kỳ mỗi N ngày hoặc theo thứ trong tuần
            </p>
          </div>
          {state.tdsMode !== 'OFF' && (
            <span className="text-[11px] text-amber-300 bg-amber-950/50 border border-amber-500/40 px-2.5 py-1 rounded-xl">
              Đang dùng chế độ {getTdsModeLabel(state.tdsMode)} - lịch này tạm không chạy
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-2">
            <label className="text-slate-400 block font-semibold">Chu kỳ xả</label>
            <div className="grid grid-cols-2 gap-1.5">
              {(['nd', 'Ctu'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setFlushForm({ ...flushForm, type: t })}
                  className={`py-1 rounded-lg border font-bold text-[11px] ${
                    flushForm.type === t
                      ? 'bg-amber-500/20 border-amber-400 text-amber-300'
                      : 'bg-slate-900 border-slate-800 text-slate-400'
                  }`}
                >
                  {t === 'nd' ? 'Mỗi N ngày' : 'Theo thứ'}
                </button>
              ))}
            </div>
            {flushForm.type === 'nd' ? (
              <div className="flex items-center gap-2">
                <span className="text-slate-400">Mỗi</span>
                <input
                  type="number"
                  min="1"
                  max="30"
                  value={flushForm.intervalDays}
                  onChange={(e) => setFlushForm({ ...flushForm, intervalDays: Number(e.target.value) })}
                  className="w-16 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-white text-center font-mono font-bold"
                />
                <span className="text-slate-400">ngày</span>
              </div>
            ) : (
              <div className="flex gap-1">
                {WEEKDAY_LABELS.map((day, i) => (
                  <button
                    key={day}
                    onClick={() => {
                      const copy = [...flushForm.customWeekdays];
                      copy[i] = !copy[i];
                      setFlushForm({ ...flushForm, customWeekdays: copy });
                    }}
                    className={`flex-1 py-1 rounded-md text-[10px] font-mono font-bold border ${
                      flushForm.customWeekdays[i]
                        ? 'bg-amber-500 text-slate-950 border-amber-400'
                        : 'bg-slate-900 text-slate-500 border-slate-800'
                    }`}
                  >
                    {day}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-2">
            <label className="text-slate-400 block font-semibold">Số lần xả mỗi ngày</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="1"
                max="8"
                value={flushForm.timesPerDay}
                onChange={(e) => setFlushForm({ ...flushForm, timesPerDay: Number(e.target.value) })}
                className="w-16 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-white text-center font-mono font-bold"
              />
              <span className="text-slate-400">lần/ngày (cách đều nhau)</span>
            </div>
          </div>

          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-2">
            <label className="text-slate-400 block font-semibold">Giờ bắt đầu xả</label>
            <div className="flex items-center gap-1.5 font-mono">
              <input
                type="number"
                min="0"
                max="23"
                value={flushForm.startHour}
                onChange={(e) => setFlushForm({ ...flushForm, startHour: Number(e.target.value) })}
                className="w-14 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-white text-center"
              />
              <span className="text-slate-500 font-bold">h :</span>
              <input
                type="number"
                min="0"
                max="59"
                value={flushForm.startMinute}
                onChange={(e) => setFlushForm({ ...flushForm, startMinute: Number(e.target.value) })}
                className="w-14 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-white text-center"
              />
              <span className="text-slate-400">p</span>
            </div>
          </div>

          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-2">
            <label className="text-slate-400 block font-semibold">Thời lượng xả (Phút : Giây)</label>
            <div className="flex items-center gap-1.5 font-mono">
              <input
                type="number"
                min="0"
                max="30"
                value={flushForm.flushMinutes}
                onChange={(e) => setFlushForm({ ...flushForm, flushMinutes: Number(e.target.value) })}
                className="w-14 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-white text-center"
              />
              <span className="text-slate-500 font-bold">:</span>
              <input
                type="number"
                min="0"
                max="59"
                value={flushForm.flushSeconds}
                onChange={(e) => setFlushForm({ ...flushForm, flushSeconds: Number(e.target.value) })}
                className="w-14 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-white text-center"
              />
              <span className="text-slate-400">p:s</span>
            </div>
          </div>
        </div>

        <button
          onClick={() => {
            onAction('SET_SCHEDULED_FLUSH', { ...flushForm });
            showSaveSuccess('Đã lưu lịch xả định kỳ');
          }}
          className="w-full sm:w-auto px-6 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs flex items-center justify-center gap-2 transition-all"
        >
          <Save className="w-4 h-4" />
          <span>Lưu Lịch Xả Định Kỳ</span>
        </button>
      </div>

      {/* ================= 6. CÀI ĐẶT LỊCH LỌC ================= */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 md:p-6 shadow-xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <h3 className="text-sm font-black text-white flex items-center gap-2">
            <Calendar className="w-4 h-4 text-cyan-400" />
            6. CÀI ĐẶT LỊCH LỌC (FILTER SCHEDULE)
          </h3>
        </div>

        <div className="space-y-3 text-xs">
          <div>
            <label className="text-slate-400 block mb-1">Chế độ lọc (Mode)</label>
            <select
              value={filterModeForm}
              onChange={(e) => setFilterModeForm(Number(e.target.value) as FilterMode)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono"
            >
              <option value={100}>100 — Thủ công (Manual, bật tay)</option>
              <option value={101}>101 — Ban ngày (8h–12h và 14h–17h, 20p/h)</option>
              <option value={102}>102 — Ban đêm (19h–5h sáng, 30p/h)</option>
              <option value={103}>103 — Đêm khuya (23h–5h sáng, 30p/h - Mặc định)</option>
              <option value={104}>104 — Liên tục 24h (10p/h)</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-slate-400 block mb-1">Phút lọc mỗi giờ</label>
              <input
                type="number"
                min="1"
                max="60"
                value={minutesPerHourForm}
                onChange={(e) => setMinutesPerHourForm(Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-white font-mono"
              />
            </div>

            <div>
              <label className="text-slate-400 block mb-1">Ngày lọc</label>
              <select
                value={filterDaysForm}
                onChange={(e) => setFilterDaysForm(e.target.value as FilterDaysType)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-white font-mono"
              >
                <option value="C07">C07 — Mọi ngày (Mặc định)</option>
                <option value="C24">C24 — Ngày chẵn (2, 4, 6...)</option>
                <option value="C13">C13 — Ngày lẻ (1, 3, 5...)</option>
                <option value="C03">C03 — 3 ngày 1 lần</option>
                <option value="Ctu">Ctu — Theo thứ trong tuần</option>
              </select>
            </div>
          </div>

          {/* Thứ trong tuần nếu chọn Ctu */}
          {filterDaysForm === 'Ctu' && (
            <div>
              <label className="text-[11px] text-slate-400 block mb-1.5">
                Chọn các thứ trong tuần chạy lọc:
              </label>
              <div className="flex gap-1.5">
                {WEEKDAY_LABELS.map((day, idx) => (
                  <button
                    key={day}
                    onClick={() => {
                      const copy = [...weekdaysForm];
                      copy[idx] = !copy[idx];
                      setWeekdaysForm(copy);
                    }}
                    className={`flex-1 py-1 rounded-lg text-[10px] font-mono font-bold border ${
                      weekdaysForm[idx]
                        ? 'bg-cyan-500 text-slate-950 border-cyan-400'
                        : 'bg-slate-950 text-slate-500 border-slate-800'
                    }`}
                  >
                    {day}
                  </button>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={() => {
              onAction('SET_FILTER_MODE', {
                filterMode: filterModeForm,
                minutesPerHour: minutesPerHourForm,
                filterDays: filterDaysForm,
                filterWeekdays: weekdaysForm,
              });
              showSaveSuccess('Đã lưu cài đặt lịch lọc thành công');
            }}
            className="w-full py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs transition-all"
          >
            Lưu Cài Đặt Lọc
          </button>
        </div>
      </div>

      {/* ================= 6.5b CẢM BIẾN TDS & NHIỆT ĐỘ ================= */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 md:p-6 shadow-xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div>
            <h3 className="text-base font-black text-white flex items-center gap-2">
              <Thermometer className="w-5 h-5 text-blue-400" />
              7. CẢM BIẾN TDS &amp; NHIỆT ĐỘ NƯỚC
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Cảm biến nằm trong ống lọc, chỉ đo đúng khi nước đang chảy qua
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-2">
            <label className="text-slate-400 block font-semibold">Chế độ hiển thị</label>
            <div className="flex gap-2">
              <button
                onClick={() => onAction('SET_TDS_DISPLAY_MODE', { mode: 'HOURLY' })}
                className={`flex-1 py-1.5 rounded-xl border font-bold text-xs ${
                  state.tdsDisplayMode === 'HOURLY'
                    ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300'
                    : 'bg-slate-900 border-slate-800 text-slate-400'
                }`}
              >
                Mỗi 1 tiếng (Chuẩn)
              </button>
              <button
                onClick={() => onAction('SET_TDS_DISPLAY_MODE', { mode: 'REALTIME' })}
                className={`flex-1 py-1.5 rounded-xl border font-bold text-xs ${
                  state.tdsDisplayMode === 'REALTIME'
                    ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300'
                    : 'bg-slate-900 border-slate-800 text-slate-400'
                }`}
              >
                Real-time (2s)
              </button>
            </div>
            <p className="text-[10px] text-slate-500">
              Mỗi 1 tiếng: nước chảy đủ 20s máy đo 1 lần rồi giữ số đo (chính xác nhất)
            </p>
          </div>

          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-2">
            <label className="text-slate-400 block font-semibold">Tự chạy lọc đo mỗi 1 tiếng</label>
            <button
              onClick={() =>
                onAction('SET_TDS_DISPLAY_MODE', { autoHourlyTest: !state.autoHourlyTest })
              }
              className={`w-full py-2 rounded-xl border font-bold text-xs ${
                state.autoHourlyTest
                  ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300'
                  : 'bg-slate-900 border-slate-800 text-slate-400'
              }`}
            >
              {state.autoHourlyTest ? 'BẬT (Tự bật lọc 20s đo)' : 'TẮT (Chỉ đo khi đang lọc)'}
            </button>
            <p className="text-[10px] text-slate-500">
              Nếu đang rảnh, máy tự bật lọc 20s để lấy số đo chính xác rồi tắt
            </p>
          </div>

          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between">
            <label className="text-slate-400 block font-semibold">Đo ngay tức thời</label>
            <button
              onClick={() => onAction('TRIGGER_MEASURE_NOW')}
              className="w-full py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs flex items-center justify-center gap-1.5"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Đo Ngay (Bật Lọc 20s)</span>
            </button>
            <p className="text-[10px] text-slate-500">
              Đo liền không cần chờ đủ 1 tiếng
            </p>
          </div>
        </div>
      </div>

      <HistoryPanel history={state.history} connected={!!state.firmwareVersion} onAction={onAction} />
      </>
      )}

      {page === 'settings' && (
      <>
      {/* ================= TRANG CÀI ĐẶT 1. HIỆU CHUẨN CẢM BIẾN TDS ================= */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 md:p-6 shadow-xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div>
            <h3 className="text-base font-black text-white flex items-center gap-2">
              <Sliders className="w-5 h-5 text-cyan-400" />
              1. HIỆU CHUẨN CẢM BIẾN TDS (TDS CALIBRATION)
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Cân chỉnh độ chính xác que đo TDS với dung dịch chuẩn hoặc bút đo mẫu tin cậy
            </p>
          </div>
          <span className="text-xs text-cyan-400 font-mono bg-cyan-950/60 border border-cyan-800/60 px-3 py-1 rounded-xl hidden sm:inline-block">
            K = {(state.tdsCalibration?.kFactor || 1.0).toFixed(3)}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          {/* Cột 1: Thông số hiện tại */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between space-y-3">
            <div>
              <span className="text-slate-400 font-semibold block mb-2">Thông số đo hiện tại</span>
              <div className="space-y-2 font-mono">
                <div className="flex items-center justify-between bg-slate-900 px-3 py-2 rounded-xl">
                  <span className="text-slate-400">TDS đang đọc:</span>
                  <span className="text-base font-black text-cyan-400">{state.tds} ppm</span>
                </div>
                <div className="flex items-center justify-between bg-slate-900 px-3 py-2 rounded-xl">
                  <span className="text-slate-400">Điện áp cảm biến:</span>
                  <span className="text-blue-300 font-bold">{state.tdsCalibration?.rawVoltage || 1.85} V</span>
                </div>
                <div className="flex items-center justify-between bg-slate-900 px-3 py-2 rounded-xl">
                  <span className="text-slate-400">Hệ số nhân K:</span>
                  <span className="text-emerald-400 font-bold">{(state.tdsCalibration?.kFactor || 1.0).toFixed(3)}</span>
                </div>
              </div>
            </div>

            <div className="text-[10px] text-slate-500 pt-2 border-t border-slate-800/80">
              Lần hiệu chuẩn gần nhất: <span className="text-slate-400">{state.tdsCalibration?.lastCalibratedAt || 'Mặc định (K = 1.000)'}</span>
            </div>
          </div>

          {/* Cột 2: Hiệu chuẩn theo bút đo chuẩn */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between space-y-3">
            <div>
              <span className="text-slate-400 font-semibold block mb-1">Cân chỉnh theo Bút Đo Mẫu</span>
              <p className="text-[11px] text-slate-500 mb-2">
                Dùng bút đo TDS uy tín đo cùng mẫu nước, nhập giá trị bút đo vào đây:
              </p>

              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Giá trị bút đo chuẩn (ppm)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    max="999"
                    value={standardTdsInput}
                    onChange={(e) => setStandardTdsInput(Number(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono font-bold text-sm"
                    placeholder="Ví dụ: 150"
                  />
                  <span className="text-slate-400 font-bold">ppm</span>
                </div>
              </div>
            </div>

            <div className="space-y-2 pt-2">
              <button
                onClick={() => {
                  if (standardTdsInput <= 0) return;
                  onAction('CALIBRATE_TDS', { standardPpm: standardTdsInput });
                  showSaveSuccess(`Đã cân chỉnh cảm biến TDS theo giá trị chuẩn: ${standardTdsInput} ppm`);
                }}
                className="w-full py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-cyan-600/20 transition-all"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>HIỆU CHUẨN THEO BÚT ĐO</span>
              </button>

              <button
                onClick={() => {
                  onAction('RESET_TDS_CALIBRATION');
                  setCustomKFactorInput(1.0);
                  showSaveSuccess('Đã khôi phục hệ số hiệu chuẩn TDS về mặc định (K = 1.000)');
                }}
                className="w-full py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-slate-200 text-[11px] font-bold transition-all"
              >
                Khôi Phục Gốc (K = 1.000)
              </button>
            </div>
          </div>

          {/* Cột 3: Tinh chỉnh hệ số K thủ công */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between space-y-3">
            <div>
              <span className="text-slate-400 font-semibold block mb-1">Chỉnh tay hệ số K-Factor</span>
              <p className="text-[11px] text-slate-500 mb-2">
                Tăng hoặc giảm hệ số nhân trực tiếp (mặc định 1.000):
              </p>

              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Hệ số K-Factor</label>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCustomKFactorInput((k) => +(Math.max(0.5, k - 0.02)).toFixed(3))}
                    className="px-2.5 py-1.5 bg-slate-900 border border-slate-700 hover:bg-slate-800 rounded-lg text-white font-bold"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    step="0.01"
                    min="0.5"
                    max="2.5"
                    value={customKFactorInput}
                    onChange={(e) => setCustomKFactorInput(Number(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2 py-1.5 text-center text-white font-mono font-bold"
                  />
                  <button
                    onClick={() => setCustomKFactorInput((k) => +(Math.min(2.5, k + 0.02)).toFixed(3))}
                    className="px-2.5 py-1.5 bg-slate-900 border border-slate-700 hover:bg-slate-800 rounded-lg text-white font-bold"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>

            <button
              onClick={() => {
                onAction('CALIBRATE_TDS', { kFactor: customKFactorInput });
                showSaveSuccess(`Đã lưu hệ số nhân K-Factor = ${customKFactorInput}`);
              }}
              className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 font-bold text-xs flex items-center justify-center gap-1.5 transition-all"
            >
              <Save className="w-4 h-4" />
              <span>LƯU HỆ SỐ K-FACTOR</span>
            </button>
          </div>
        </div>

        {/* Hướng dẫn nhanh cho khách hàng */}
        <div className="p-3.5 bg-slate-950/80 border border-slate-800/80 rounded-2xl text-[11px] text-slate-400 flex items-start gap-2.5">
          <Sparkles className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            <strong className="text-white">Mẹo hiệu chuẩn chính xác nhất:</strong> Bật chế độ lọc để nước chảy đều qua que đo khoảng 20-30 giây. Lấy cốc hứng nước đầu ra, dùng bút đo TDS đo mẫu nước đó được bao nhiêu ppm thì nhập số đó vào ô <span className="text-cyan-300 font-bold">"Giá trị bút đo chuẩn"</span> rồi bấm <span className="text-cyan-300 font-bold">"Hiệu Chuẩn Theo Bút Đo"</span>. Máy sẽ tự lưu vĩnh viễn vào bộ nhớ!
          </p>
        </div>
      </div>

      {/* ================= TRANG CÀI ĐẶT 2. THÔNG SỐ DÒNG TỪNG BƠM ================= */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 md:p-6 shadow-xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
          <div>
            <h3 className="text-base font-black text-white flex items-center gap-2">
              <Cpu className="w-5 h-5 text-cyan-400" />
              2. THÔNG SỐ DÒNG ĐIỆN TỪNG BƠM
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Ngưỡng báo lỗi theo dòng bơm đo được. Chọn loại bơm đang lắp ở mục 2 trang Điều khiển.
            </p>
          </div>
          <span className="text-[11px] text-cyan-400 font-mono">Đang lắp: {PUMP_NAMES[state.pumpType]}</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          {(['SMALL', 'LARGE'] as PumpType[]).map((pt) => {
            const f = pumpForm[pt];
            const def = PUMP_DEFAULTS[pt];
            const setF = (k: keyof PumpThresholds, v: number) => setPumpForm({ ...pumpForm, [pt]: { ...f, [k]: v } });
            return (
              <div
                key={pt}
                className={`bg-slate-950 border rounded-2xl p-4 space-y-3 ${
                  state.pumpType === pt ? 'border-cyan-500/60' : 'border-slate-800'
                }`}
              >
                <div className="font-bold text-sm text-cyan-300 flex items-center justify-between border-b border-slate-800/80 pb-2">
                  <span>{PUMP_NAMES[pt].toUpperCase()}</span>
                  {state.pumpType === pt && <span className="text-[10px] text-emerald-400 font-mono">● Đang lắp</span>}
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">Dòng min (mA)</label>
                    <input
                      type="number"
                      value={f.minCurrentMa}
                      onChange={(e) => setF('minCurrentMa', Number(e.target.value))}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-white font-mono"
                    />
                    <span className="text-[9px] text-slate-500">Lỗi 111</span>
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">Lọc bẩn (mA)</label>
                    <input
                      type="number"
                      value={f.dirtyFilterMa}
                      onChange={(e) => setF('dirtyFilterMa', Number(e.target.value))}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-amber-400 font-mono"
                    />
                    <span className="text-[9px] text-slate-500">Báo FLt</span>
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">Quá dòng (mA)</label>
                    <input
                      type="number"
                      value={f.overCurrentMa}
                      onChange={(e) => setF('overCurrentMa', Number(e.target.value))}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-red-400 font-mono font-bold"
                    />
                    <span className="text-[9px] text-slate-500">Ngắt 222</span>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => setPumpForm({ ...pumpForm, [pt]: { ...def } })}
                    className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 text-[11px] font-bold"
                    title="Điền lại số mặc định (chưa lưu)"
                  >
                    Mặc định {def.dirtyFilterMa}/{def.overCurrentMa}
                  </button>
                  <button
                    onClick={() => {
                      if (f.overCurrentMa <= f.dirtyFilterMa) {
                        alert('Ngưỡng quá dòng phải lớn hơn ngưỡng lọc bẩn');
                        return;
                      }
                      onAction('SET_PUMP_CONFIG', {
                        [pt === 'SMALL' ? 'pumpThresholdsSmall' : 'pumpThresholdsLarge']: f,
                      });
                      showSaveSuccess(`Đã lưu thông số ${PUMP_NAMES[pt]}`);
                    }}
                    className="flex-1 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs"
                  >
                    Lưu {PUMP_NAMES[pt]}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ================= TRANG CÀI ĐẶT 3. CÀI ĐẶT MẠNG WIFI CHO MÁY ================= */}
      <div id="section-wifi-config" className="bg-slate-900 border border-slate-800 rounded-3xl p-5 md:p-6 shadow-xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div>
            <h3 className="text-base font-black text-white flex items-center gap-2">
              <Wifi className="w-5 h-5 text-emerald-400" />
              3. CÀI ĐẶT MẠNG WIFI CHO MÁY (ESP32 WIFI SETUP)
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Kết nối máy CITO UF vào mạng WiFi nhà bạn để theo dõi và điều khiển từ xa
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                staState === 2 ? 'bg-emerald-400' : staState >= 3 ? 'bg-red-400' : 'bg-amber-400'
              } animate-pulse`}
            />
            <span
              className={`text-xs font-bold font-mono ${
                staState === 2 ? 'text-emerald-300' : staState >= 3 ? 'text-red-300' : 'text-amber-300'
              }`}
            >
              {WIFI_STA_TEXT[staState] || 'Chưa Kết Nối'}
            </span>
          </div>
        </div>

        {/* WiFi Status Banner */}
        <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs font-mono">
          <div className="flex items-center justify-between bg-slate-900 px-3 py-2 rounded-xl">
            <span className="text-slate-400">Mạng hiện tại:</span>
            <span className="text-cyan-300 font-bold truncate ml-1">{state.wifiSsid || 'Chưa cài đặt'}</span>
          </div>
          <div className="flex items-center justify-between bg-slate-900 px-3 py-2 rounded-xl">
            <span className="text-slate-400">Địa chỉ IP:</span>
            <span className="text-emerald-300 font-bold ml-1">{state.wifiConnected ? state.deviceIp : '-'}</span>
          </div>
          <div className="flex items-center justify-between bg-slate-900 px-3 py-2 rounded-xl">
            <span className="text-slate-400">Cường độ sóng:</span>
            <span className="text-amber-300 font-bold ml-1">
              {state.wifiConnected && state.wifiConfig?.rssi
                ? `${state.wifiConfig.rssi} dBm (${
                    state.wifiConfig.rssi >= -60 ? 'Mạnh' : state.wifiConfig.rssi >= -72 ? 'Khá' : 'Yếu'
                  })`
                : '-'}
            </span>
          </div>
        </div>

        {/* WiFi Configuration Form */}
        <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-white flex items-center gap-2">
              <Radio className="w-4 h-4 text-cyan-400" />
              Chọn Mạng WiFi Nhà Bạn
            </span>
          </div>

          <WifiScanList
            scan={state.wifiScan}
            currentSsid={state.wifiSsid}
            onScan={() => onAction('WIFI_SCAN')}
            onPick={pickWifi}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            {/* Tên WiFi SSID */}
            <div>
              <label className="text-slate-300 font-semibold block mb-1.5">
                Tên Mạng WiFi (SSID)
              </label>
              <input
                type="text"
                value={wifiSsidInput}
                onChange={(e) => {
                  setWifiSsidInput(e.target.value);
                  setWifiSsidTouched(true);
                }}
                placeholder="Chọn từ danh sách quét hoặc gõ tên (mạng ẩn)"
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white font-mono focus:border-cyan-400 focus:outline-none transition-all"
              />
            </div>

            {/* Mật khẩu WiFi */}
            <div>
              <label className="text-slate-300 font-semibold block mb-1.5">
                Mật Khẩu WiFi (Password)
              </label>
              <div className="relative">
                <input
                  id="wifi-password-input"
                  type={showWifiPassword ? 'text' : 'password'}
                  value={wifiPasswordInput}
                  onChange={(e) => setWifiPasswordInput(e.target.value)}
                  placeholder="Nhập mật khẩu WiFi..."
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 pr-10 text-white font-mono focus:border-cyan-400 focus:outline-none transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowWifiPassword(!showWifiPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                >
                  {showWifiPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-[10px] text-slate-500 mt-2">
                Hỗ trợ chuẩn WiFi 2.4GHz (WPA/WPA2 Personal) của các nhà mạng Viettel, VNPT, FPT
              </p>
            </div>
          </div>

          {/* Nút Kết Nối WiFi */}
          <div className="pt-2">
            <button
              onClick={() => {
                if (!wifiSsidInput.trim()) {
                  alert('Vui lòng nhập Tên mạng WiFi (SSID)!');
                  return;
                }
                if (wifiPasswordInput && (wifiPasswordInput.length < 8 || wifiPasswordInput.length > 63)) {
                  alert('Mật khẩu WiFi phải từ 8 đến 63 ký tự (để trống nếu mạng không có mật khẩu)');
                  return;
                }
                onAction('SET_WIFI_CONFIG', {
                  ssid: wifiSsidInput.trim(),
                  password: wifiPasswordInput,
                });
                showSaveSuccess(`Đã gửi WiFi "${wifiSsidInput.trim()}" cho máy - xem trạng thái kết nối ở trên`);
              }}
              className="w-full sm:w-auto px-6 py-3 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/30 transition-all"
            >
              <Wifi className="w-4 h-4" />
              <span>LƯU VÀ KẾT NỐI WIFI CHO MÁY</span>
            </button>
          </div>
        </div>

        {/* Hướng dẫn cài đặt WiFi lần đầu cho khách hàng */}
        <div className="p-4 bg-emerald-950/30 border border-emerald-500/30 rounded-2xl text-xs text-emerald-200 space-y-2">
          <div className="font-bold text-white flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>Cách Cài Đặt WiFi Cho Máy Lần Đầu Khi Mang Về Bể:</span>
          </div>
          <ol className="list-decimal list-inside space-y-1 text-slate-300 leading-relaxed text-[11px]">
            <li>Cắm nguồn máy, đứng gần máy và bấm <strong className="text-white">🔍 Quét Bluetooth Gần Máy</strong> trên web này (Chrome / Edge).</li>
            <li>Bấm <strong className="text-cyan-300">🔍 Quét mạng WiFi quanh máy</strong> rồi chọn WiFi nhà bạn trong danh sách (chỉ WiFi 2.4GHz).</li>
            <li>Nhập <strong className="text-cyan-300">Mật khẩu WiFi</strong> rồi bấm <strong className="text-emerald-400">"LƯU VÀ KẾT NỐI WIFI CHO MÁY"</strong>.</li>
            <li>Xem trạng thái ở góc trên: <strong className="text-emerald-400">Đã kết nối</strong> kèm địa chỉ IP là xong; báo sai mật khẩu thì nhập lại.</li>
            <li>Không dùng được Bluetooth: nối điện thoại vào WiFi <strong className="text-white">CITO UF SYSTEM</strong> (mật khẩu citocito), mở <strong className="text-white">192.168.4.1</strong> → tab WiFi.</li>
          </ol>
        </div>
      </div>

      {/* ================= TRANG CÀI ĐẶT 4. CÀI ĐẶT GIỜ RTC & THỜI GIAN GIỮ NÚT ================= */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 md:p-6 shadow-xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <h3 className="text-base font-black text-white flex items-center gap-2">
            <Clock className="w-5 h-5 text-indigo-400" />
            4. CÀI ĐẶT GIỜ RTC &amp; THỜI GIAN GIỮ NÚT
          </h3>
          <span className="text-xs text-slate-400 font-mono">
            {state.rtcTime}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-2">
            <label className="text-slate-400 block font-semibold">Đồng bộ Internet NTP</label>
            <button
              onClick={() => {
                onAction('SYNC_NTP');
                showSaveSuccess('Đã đồng bộ giờ từ NTP Internet thành công');
              }}
              className="w-full py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center justify-center gap-1.5"
            >
              <RefreshCw className="w-4 h-4" />
              <span>🔄 Đồng Bộ NTP</span>
            </button>
            <p className="text-[10px] text-slate-500">
              NTP sync gần nhất: {state.lastNtpSync} (tự sync lúc 00:00:00)
            </p>
          </div>

          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-2">
            <label className="text-slate-400 block font-semibold">Đồng bộ giờ Trình Duyệt</label>
            <button
              onClick={() => {
                onAction('SYNC_NTP');
                showSaveSuccess('Đã đồng bộ giờ điện thoại/máy tính vào DS3231');
              }}
              className="w-full py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs flex items-center justify-center gap-1.5"
            >
              <span>Đồng Bộ Browser</span>
            </button>
            <p className="text-[10px] text-slate-500">
              Lấy giờ từ trình duyệt ghi vào DS3231 khi không có mạng
            </p>
          </div>

          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-2">
            <label className="text-slate-400 block font-semibold">Thời gian giữ nút cảm ứng</label>
            <select
              value={state.buttonHoldSeconds}
              onChange={(e) =>
                onAction('SET_BUTTON_HOLD_TIME', { seconds: Number(e.target.value) })
              }
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono"
            >
              <option value={0}>Tắt (Chạm là ăn ngay)</option>
              <option value={0.5}>0.5 giây</option>
              <option value={1.0}>1.0 giây (Mặc định)</option>
              <option value={1.5}>1.5 giây</option>
              <option value={2.0}>2.0 giây</option>
              <option value={3.0}>3.0 giây</option>
            </select>
            <p className="text-[10px] text-slate-500">
              Chống chạm nhầm khi lướt tay ngang qua mặt máy
            </p>
          </div>
        </div>
      </div>

      <LogoPanel effect={state.logoEffect} speedMs={state.logoSpeed} onAction={onAction} />
      </>
      )}
    </div>
  );
};
