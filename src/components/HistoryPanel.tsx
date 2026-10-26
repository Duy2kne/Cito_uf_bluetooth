import React, { useState } from 'react';
import { AlertTriangle, Droplets, History, Power, RefreshCw, Settings, Trash2, Zap } from 'lucide-react';
import {
  HistoryCategory,
  HistoryEvent,
  describeEvent,
  eventCategory,
  formatEventTime,
  isAlarmEvent,
  isAutoEvent,
} from '../services/history';

interface HistoryPanelProps {
  history?: HistoryEvent[];
  connected: boolean;               // Đang nối máy thật qua Bluetooth
  onAction: (action: string, payload?: any) => void;
}

const FILTERS: { key: 'all' | HistoryCategory; label: string }[] = [
  { key: 'all', label: 'Tất cả' },
  { key: 'filter', label: 'Lọc' },
  { key: 'drain', label: 'Xả' },
  { key: 'error', label: 'Lỗi' },
  { key: 'setting', label: 'Cài đặt' },
  { key: 'system', label: 'Hệ thống' },
];

const ICON: Record<HistoryCategory, React.ReactNode> = {
  filter: <Power className="w-3.5 h-3.5 text-cyan-400" />,
  drain: <Droplets className="w-3.5 h-3.5 text-amber-400" />,
  error: <AlertTriangle className="w-3.5 h-3.5 text-red-400" />,
  setting: <Settings className="w-3.5 h-3.5 text-violet-400" />,
  system: <Zap className="w-3.5 h-3.5 text-slate-400" />,
};

/** 8. Nhật ký hoạt động gần nhất (máy lưu 64 sự kiện trong bộ nhớ NVS). */
export function HistoryPanel({ history, connected, onAction }: HistoryPanelProps) {
  const [filter, setFilter] = useState<'all' | HistoryCategory>('all');
  const list = (history || []).filter((e) => filter === 'all' || eventCategory(e) === filter);
  const autoCount = (history || []).filter(isAutoEvent).length;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 md:p-6 shadow-xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div>
          <h3 className="text-base font-black text-white flex items-center gap-2">
            <History className="w-5 h-5 text-cyan-400" />
            8. NHẬT KÝ HOẠT ĐỘNG GẦN NHẤT
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Máy tự ghi {history?.length ?? 0}/64 sự kiện gần nhất (lọc, xả, lỗi, khởi động, OTA...), không mất khi cúp điện
            {autoCount > 0 && ` · ${autoCount} lần máy tự bật/tắt`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onAction('GET_HISTORY')}
            disabled={!connected}
            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 text-xs font-bold flex items-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Tải lại
          </button>
          <button
            onClick={() => {
              if (window.confirm('Xóa toàn bộ nhật ký trên máy?')) onAction('CLEAR_HISTORY');
            }}
            disabled={!connected || !history?.length}
            className="px-3 py-1.5 rounded-xl bg-red-950/60 border border-red-500/40 text-red-300 hover:bg-red-900/60 disabled:opacity-50 text-xs font-bold flex items-center gap-1.5"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Xóa
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-3 py-1 rounded-lg text-[11px] font-bold border transition-all ${
              filter === f.key
                ? 'bg-cyan-500 text-slate-950 border-cyan-400'
                : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {!connected && !history?.length ? (
        <p className="text-xs text-slate-400 bg-slate-950 border border-slate-800 rounded-2xl p-4">
          Kết nối Bluetooth với máy để xem nhật ký.
        </p>
      ) : list.length === 0 ? (
        <p className="text-xs text-slate-400 bg-slate-950 border border-slate-800 rounded-2xl p-4">
          Chưa có sự kiện nào trong nhóm này.
        </p>
      ) : (
        <div className="max-h-96 overflow-y-auto rounded-2xl border border-slate-800 divide-y divide-slate-800 bg-slate-950">
          {list.map((e, i) => {
            const alarm = isAlarmEvent(e);
            const auto = isAutoEvent(e);
            return (
              <div
                key={`${e.t}-${e.type}-${i}`}
                className={`px-3 py-2.5 flex items-start gap-3 text-xs ${alarm ? 'bg-red-950/30' : ''}`}
              >
                <span className="mt-0.5 shrink-0">{ICON[eventCategory(e)]}</span>
                <div className="min-w-0 flex-1">
                  <div className={`${alarm ? 'text-red-300 font-bold' : 'text-slate-200'} break-words`}>
                    {describeEvent(e)}
                    {auto && (
                      <span className="ml-2 text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 font-bold align-middle">
                        TỰ ĐỘNG
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono mt-0.5">{formatEventTime(e.t)}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
