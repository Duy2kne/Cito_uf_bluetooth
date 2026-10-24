import React, { useEffect, useRef, useState } from 'react';
import { Sparkles } from 'lucide-react';

interface LogoPanelProps {
  effect: number;   // -1 = màu logo mặc định, 0..7 = hiệu ứng HU0..HU7 (firmware led_logo.cpp)
  speedMs: number;  // ms / khung hình (20..1000)
  onAction: (action: string, payload?: any) => void;
}

const EFFECTS = ['Tắt', 'Một màu', 'Cầu vồng', 'Nhấp nháy', 'Thở', 'Đuổi', 'Lấp đầy', 'Lấp lánh'];

/** 13. LED logo (WS2812). Chỉ chạy khi máy rảnh - lúc lọc/xả/menu máy tự hiện hiệu ứng trạng thái. */
export function LogoPanel({ effect, speedMs, onAction }: LogoPanelProps) {
  const [speed, setSpeed] = useState(speedMs >= 20 ? speedMs : 180);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (speedMs >= 20) setSpeed(speedMs);
  }, [speedMs]);

  const changeSpeed = (v: number) => {
    setSpeed(v);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => onAction('SET_LOGO', { speedMs: v }), 300); // Kéo thanh trượt không gửi dồn dập
  };

  const btn = (fx: number, label: string) => (
    <button
      key={fx}
      onClick={() => onAction('SET_LOGO', { effect: fx })}
      className={`px-3 py-2 rounded-xl border text-xs font-bold transition-all ${
        effect === fx
          ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300'
          : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 md:p-6 shadow-xl space-y-4">
      <div className="border-b border-slate-800 pb-3">
        <h3 className="text-base font-black text-white flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-pink-400" />
          13. ĐÈN LED LOGO
        </h3>
        <p className="text-xs text-slate-400 mt-0.5">
          Logo chỉ sáng khi máy đang lọc / xả / xả áp và 5 giây lúc mở máy (máy rảnh thì tắt). Hiệu ứng chọn ở đây dùng cho những lúc đó.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {btn(-1, 'Màu mặc định')}
        {EFFECTS.map((name, i) => btn(i, name))}
      </div>
      <div className="flex items-center gap-3 text-xs">
        <span className="text-slate-400 shrink-0">Tốc độ</span>
        <input
          type="range"
          min={20}
          max={1000}
          step={10}
          value={speed}
          onChange={(e) => changeSpeed(Number(e.target.value))}
          className="flex-1 accent-cyan-400"
        />
        <span className="font-mono text-cyan-300 w-16 text-right">{speed} ms</span>
      </div>
    </div>
  );
}
