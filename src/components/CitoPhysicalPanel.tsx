import React, { useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Droplets,
  HelpCircle,
  Moon,
  Power,
  RotateCcw,
  Sparkles,
  Volume2,
  Zap,
} from 'lucide-react';
import { CitoSystemState, TdsMode, formatTemperature } from '../types/system';

interface CitoPhysicalPanelProps {
  state: CitoSystemState;
  onAction: (action: string, payload?: any) => void;
}

export const CitoPhysicalPanel: React.FC<CitoPhysicalPanelProps> = ({
  state,
  onAction,
}) => {
  // Web: chạm / bấm là gửi lệnh NGAY, không bắt giữ như nút cảm ứng trên máy
  // (giữ lâu trên điện thoại hay bị cuộn trang / hiện menu -> hụt lệnh, rất khó dùng).
  // Chức năng phải giữ nút trên máy (xả áp, khôi phục gốc) có nút bấm riêng bên dưới.
  const [pressedBtn, setPressedBtn] = useState<string | null>(null);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Máy thật: SETTING / UP / DOWN là menu trên máy, firmware không nhận từ xa -> chỉnh ở web
  const realDevice = !!state.firmwareVersion;

  const {
    isFiltering,
    isFlushing,
    tdsMode,
    activeErrors,
    display7Segment,
    nightMode,
    isSleeping,
    screenWhenSleeping,
    isPressureRelease,
    isDryRun,
  } = state;

  // LED states: Lọc chỉ sáng/chớp khi isFiltering đang hoạt động; khi Tắt lọc thì đèn LỌC phải tắt!
  const isFilterLedOn = isFiltering;
  const isFilterLedBlinking = isFiltering && activeErrors.flt_dirtyFilter;
  const isFlushLedOn = isFlushing;
  const isErr1Blinking =
    activeErrors.err111_pumpNoCurrent ||
    activeErrors.err222_pumpOverCurrent ||
    activeErrors.err333_filterValveBlocked ||
    activeErrors.err444_drainNoFlow ||
    activeErrors.err555_drainNoCurrent ||
    activeErrors.err666_drainOverCurrent;
  const isErr2Blinking =
    activeErrors.flt_dirtyFilter ||
    activeErrors.rtcLost ||
    activeErrors.acsPumpDisconnected ||
    activeErrors.acsDrainDisconnected;

  // LED Screen visibility: Hidden if night mode is ON, or if sleeping and screenWhenSleeping is FALSE
  const isDisplayOff = nightMode || (isSleeping && !screenWhenSleeping);

  const press = (key: string) => {
    setPressedBtn(key);
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = setTimeout(() => setPressedBtn(null), 250); // Nháy sáng nút cho biết đã nhận
    onAction('TOUCH_KEY', { key });
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 md:p-8 shadow-2xl relative overflow-hidden flex flex-col items-center">
      {/* Top Banner explaining the hardware panel */}
      <div className="w-full flex items-center justify-between border-b border-slate-800 pb-3 mb-6">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-cyan-400 animate-pulse" />
          <h2 className="text-sm font-bold text-white tracking-wide">
            MẶT MÁY ĐIỀU KHIỂN CẢM ỨNG CITO UF (PHẦN CỨNG THỰC TẾ)
          </h2>
        </div>
        <div className="text-xs text-slate-400 font-mono hidden sm:block">
          Chạm / bấm 1 lần là chạy ngay (không cần giữ)
        </div>
      </div>

      {/* THE PHYSICAL CONTROLLER CASING (Dark Brushed Industrial Enclosure) */}
      <div
        className={`w-full max-w-[620px] rounded-3xl p-6 md:p-8 border-2 transition-all shadow-2xl select-none ${
          nightMode
            ? 'bg-slate-950 border-slate-900 shadow-none'
            : 'bg-gradient-to-b from-slate-900 via-slate-950 to-slate-900 border-slate-700/80 shadow-cyan-950/40'
        }`}
      >
        {/* Device Brand Header & Logo */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            {/* RGB LOGO (Section 3: cầu vồng khi lọc/xả, nhấp nháy ở menu) */}
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-xs transition-all ${
                isDisplayOff
                  ? 'bg-slate-900 text-slate-700'
                  : isFiltering || isFlushing || isPressureRelease
                  ? 'bg-gradient-to-tr from-cyan-400 via-indigo-500 to-rose-500 text-white animate-pulse shadow-lg shadow-cyan-500/30'
                  : 'bg-slate-800 text-cyan-400 border border-cyan-500/30 shadow-md'
              }`}
            >
              CITO
            </div>
            <div>
              <div className="text-sm font-black text-white tracking-wider">CITO UF SYSTEM</div>
              <div className="text-[10px] text-slate-400 font-mono">
                AUTO WATER PURIFIER • ESP32
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {nightMode && (
              <span className="text-[11px] font-mono text-amber-400 bg-amber-950/60 border border-amber-500/40 px-2 py-0.5 rounded-full flex items-center gap-1">
                <Moon className="w-3 h-3" />
                Ban đêm
              </span>
            )}
            {isSleeping && !nightMode && (
              <span className="text-[11px] font-mono text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full">
                Sleep (2m)
              </span>
            )}
          </div>
        </div>

        {/* ================= ROW 1: [LOC] [XẢ] [ERR1] [ERR2] ================= */}
        <div className="grid grid-cols-4 gap-3 mb-6">
          {/* Button LOC */}
          <div className="flex flex-col items-center gap-1.5">
            <button
              onClick={() => press('LOC')}
              className={`w-full py-3 rounded-2xl border flex flex-col items-center justify-center gap-1 transition-all active:scale-95 ${
                pressedBtn === 'LOC'
                  ? 'bg-cyan-500/30 border-cyan-400 text-white'
                  : 'bg-slate-900/90 hover:bg-slate-800 border-slate-700 text-slate-200'
              }`}
            >
              <span className="text-xs font-black tracking-wider">LỌC</span>
              {/* LED Green */}
              <span
                className={`w-2.5 h-2.5 rounded-full border ${
                  isDisplayOff
                    ? 'bg-slate-800 border-slate-700'
                    : isFilterLedBlinking
                    ? 'bg-emerald-400 border-emerald-300 animate-ping'
                    : isFilterLedOn
                    ? 'bg-emerald-400 border-emerald-300 shadow-md shadow-emerald-500/50'
                    : 'bg-slate-800 border-slate-700'
                }`}
              />
            </button>
            <span className="text-[10px] text-slate-400 font-mono">
              {isFilterLedBlinking ? 'Lõi bẩn' : isFilterLedOn ? 'Đang lọc' : 'Tắt'}
            </span>
          </div>

          {/* Button XẢ */}
          <div className="flex flex-col items-center gap-1.5">
            <button
              onClick={() => press('XA')}
              className={`w-full py-3 rounded-2xl border flex flex-col items-center justify-center gap-1 transition-all active:scale-95 ${
                pressedBtn === 'XA'
                  ? 'bg-amber-500/30 border-amber-400 text-white'
                  : 'bg-slate-900/90 hover:bg-slate-800 border-slate-700 text-slate-200'
              }`}
            >
              <span className="text-xs font-black tracking-wider">XẢ</span>
              {/* LED Yellow */}
              <span
                className={`w-2.5 h-2.5 rounded-full border ${
                  isDisplayOff
                    ? 'bg-slate-800 border-slate-700'
                    : isFlushLedOn
                    ? 'bg-amber-400 border-amber-300 shadow-md shadow-amber-500/50 animate-pulse'
                    : 'bg-slate-800 border-slate-700'
                }`}
              />
            </button>
            <span className="text-[10px] text-slate-400 font-mono">
              {isFlushLedOn ? 'Đang xả' : 'Tắt'}
            </span>
          </div>

          {/* LED ERR1 (Chỉ là đèn báo lỗi chấp hành) */}
          <div className="flex flex-col items-center justify-center gap-1.5 py-3 rounded-2xl border border-slate-800/80 bg-slate-950/60">
            <span className="text-xs font-bold text-slate-400">ERR1</span>
            <span
              className={`w-2.5 h-2.5 rounded-full border ${
                isDisplayOff
                  ? 'bg-slate-800 border-slate-700'
                  : isErr1Blinking
                  ? 'bg-red-500 border-red-400 animate-ping shadow-lg shadow-red-500/80'
                  : 'bg-slate-800 border-slate-700'
              }`}
            />
            <span className="text-[10px] text-slate-400 font-mono">Bơm / Van</span>
          </div>

          {/* LED ERR2 (Chỉ là đèn báo lỗi cảm biến / lọc bẩn) */}
          <div className="flex flex-col items-center justify-center gap-1.5 py-3 rounded-2xl border border-slate-800/80 bg-slate-950/60">
            <span className="text-xs font-bold text-slate-400">ERR2</span>
            <span
              className={`w-2.5 h-2.5 rounded-full border ${
                isDisplayOff
                  ? 'bg-slate-800 border-slate-700'
                  : isErr2Blinking
                  ? 'bg-red-500 border-red-400 animate-ping shadow-lg shadow-red-500/80'
                  : 'bg-slate-800 border-slate-700'
              }`}
            />
            <span className="text-[10px] text-slate-400 font-mono">Cảm biến</span>
          </div>
        </div>

        {/* ================= CENTER: 3-DIGIT 7-SEGMENT DISPLAY ================= */}
        <div className="flex flex-col items-center justify-center my-4">
          <div className="relative bg-black border-4 border-slate-800 rounded-2xl px-8 py-5 shadow-inner shadow-black flex items-center justify-center min-w-[200px]">
            {/* Visual acrylic red screen filter */}
            <div className="absolute inset-0 bg-red-950/20 rounded-xl pointer-events-none" />

            {/* The 7-segment 3 digits */}
            <span
              className={`font-mono text-5xl md:text-6xl font-black tracking-widest text-center select-none ${
                isDisplayOff
                  ? 'text-slate-900'
                  : display7Segment.includes('Err') ||
                    display7Segment === '222' ||
                    display7Segment === '666'
                  ? 'text-red-500 animate-bounce'
                  : display7Segment === 'FLt'
                  ? 'text-amber-400'
                  : 'text-red-500 drop-shadow-[0_0_12px_rgba(239,68,68,0.8)]'
              }`}
            >
              {isDisplayOff ? '   ' : display7Segment}
            </span>
          </div>

          <div className="text-[11px] text-slate-400 font-mono mt-2 flex items-center gap-3">
            <span>TDS: {state.tds} ppm</span>
            <span>•</span>
            <span>Nhiệt độ: {formatTemperature(state)}</span>
          </div>
        </div>

        {/* ================= ROW 2: [TÉP] [CÁ] [CÂY] [CUSTOM] ================= */}
        <div className="grid grid-cols-4 gap-3 mb-6">
          {(['TEP', 'CA', 'CAY', 'CUSTOM'] as TdsMode[]).map((modeKey) => {
            const isSelected = tdsMode === modeKey;
            const labels: Record<string, string> = {
              TEP: 'TÉP',
              CA: 'CÁ',
              CAY: 'CÂY',
              CUSTOM: 'CUSTOM',
            };
            return (
              <div key={modeKey} className="flex flex-col items-center gap-1.5">
                <button
                  onClick={() => press(modeKey)}
                  className={`w-full py-3 rounded-2xl border flex flex-col items-center justify-center gap-1 transition-all active:scale-95 ${
                    pressedBtn === modeKey
                      ? 'bg-blue-500/30 border-blue-400 text-white'
                      : isSelected
                      ? 'bg-blue-950/60 border-blue-500 text-white shadow-md shadow-blue-500/20'
                      : 'bg-slate-900/90 hover:bg-slate-800 border-slate-700 text-slate-300'
                  }`}
                >
                  <span className="text-xs font-black tracking-wider">{labels[modeKey]}</span>
                  {/* Blue LED */}
                  <span
                    className={`w-2.5 h-2.5 rounded-full border ${
                      isDisplayOff
                        ? 'bg-slate-800 border-slate-700'
                        : isSelected
                        ? 'bg-cyan-400 border-cyan-300 shadow-md shadow-cyan-400/80 animate-pulse'
                        : 'bg-slate-800 border-slate-700'
                    }`}
                  />
                </button>
                <span className="text-[10px] text-slate-400 font-mono">
                  Hi: {state.tdsSettings[modeKey as keyof typeof state.tdsSettings]?.hi} ppm
                </span>
              </div>
            );
          })}
        </div>

        {/* ================= ROW 3: [SETTING] [▲ UP] [▼ DOWN] [OK] ================= */}
        <div className="grid grid-cols-4 gap-3">
          {/* SETTING */}
          <div className="flex flex-col items-center gap-1">
            <button
              onClick={() => press('SETTING')}
              disabled={realDevice}
              className={`w-full disabled:opacity-40 disabled:cursor-not-allowed py-2.5 rounded-2xl border flex flex-col items-center justify-center gap-1 transition-all active:scale-95 ${
                pressedBtn === 'SETTING'
                  ? 'bg-purple-500/30 border-purple-400 text-white'
                  : 'bg-slate-900/90 hover:bg-slate-800 border-slate-700 text-slate-300'
              }`}
            >
              <span className="text-[11px] font-bold">SETTING</span>
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  pressedBtn === 'SETTING' ? 'bg-purple-400 animate-ping' : 'bg-slate-800'
                }`}
              />
            </button>
            <span className="text-[9px] text-slate-400 font-mono">{realDevice ? 'Chỉnh ở web' : 'Menu'}</span>
          </div>

          {/* ▲ UP */}
          <div className="flex flex-col items-center gap-1">
            <button
              onClick={() => press('UP')}
              disabled={realDevice}
              className="w-full disabled:opacity-40 disabled:cursor-not-allowed py-2.5 rounded-2xl border border-slate-700 bg-slate-900/90 hover:bg-slate-800 text-slate-300 flex flex-col items-center justify-center gap-1 active:scale-95"
            >
              <span className="text-[11px] font-bold">▲ UP</span>
              <span className="w-1.5 h-1.5 rounded-full bg-slate-800" />
            </button>
            <span className="text-[9px] text-slate-400 font-mono">{realDevice ? 'Chỉnh ở web' : 'Tăng số'}</span>
          </div>

          {/* ▼ DOWN */}
          <div className="flex flex-col items-center gap-1">
            <button
              onClick={() => press('DOWN')}
              disabled={realDevice}
              className="w-full disabled:opacity-40 disabled:cursor-not-allowed py-2.5 rounded-2xl border border-slate-700 bg-slate-900/90 hover:bg-slate-800 text-slate-300 flex flex-col items-center justify-center gap-1 active:scale-95"
            >
              <span className="text-[11px] font-bold">▼ DOWN</span>
              <span className="w-1.5 h-1.5 rounded-full bg-slate-800" />
            </button>
            <span className="text-[9px] text-slate-400 font-mono">{realDevice ? 'Chỉnh ở web' : 'Giảm số'}</span>
          </div>

          {/* OK */}
          <div className="flex flex-col items-center gap-1">
            <button
              onClick={() => press('OK')}
              className={`w-full py-2.5 rounded-2xl border flex flex-col items-center justify-center gap-1 transition-all active:scale-95 ${
                pressedBtn === 'OK'
                  ? 'bg-emerald-500/30 border-emerald-400 text-white'
                  : 'bg-slate-900/90 hover:bg-slate-800 border-slate-700 text-slate-300'
              }`}
            >
              <span className="text-[11px] font-bold">OK</span>
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  pressedBtn === 'OK' ? 'bg-emerald-400 animate-ping' : 'bg-slate-800'
                }`}
              />
            </button>
            <span className="text-[9px] text-slate-400 font-mono">Xác nhận/Xóa lỗi</span>
          </div>
        </div>
      </div>

      {/* Quick shortcuts under panel */}
      <div className="flex flex-wrap items-center justify-center gap-3 mt-4 text-xs text-slate-400">
        <span className="text-slate-400">Chức năng phải giữ nút trên máy - ở web bấm 1 lần:</span>
        <button
          onClick={() => onAction('RELEASE_PRESSURE')}
          className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono text-[11px] transition-all"
        >
          Xả áp suất XAP (máy: giữ OK 5s)
        </button>
        {!state.firmwareVersion && (
          <button
            onClick={() => onAction('TOGGLE_DRY_RUN')}
            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono text-[11px] transition-all"
          >
            Bơm khô drn (mô phỏng)
          </button>
        )}
        <button
          onClick={() => onAction('RESET_OK')}
          className="px-2.5 py-1 rounded-lg bg-emerald-950/60 border border-emerald-500/30 text-emerald-400 font-mono text-[11px] transition-all"
        >
          Xóa lỗi / Cảnh báo (Nhấn OK)
        </button>
        <button
          onClick={() => {
            if (window.confirm('KHÔI PHỤC TOÀN BỘ CÀI ĐẶT GỐC cho máy CITO UF? (máy: giữ OK 10 giây)')) onAction('RESET_ALL');
          }}
          className="px-2.5 py-1 rounded-lg bg-red-950/60 border border-red-500/30 text-red-300 font-mono text-[11px] transition-all"
        >
          Khôi phục gốc rES (máy: giữ OK 10s)
        </button>
      </div>
    </div>
  );
};
