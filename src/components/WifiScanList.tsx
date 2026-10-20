import React, { useEffect, useState } from 'react';
import { Lock, RefreshCw, Wifi } from 'lucide-react';
import { WifiScanResult } from '../types/system';

interface WifiScanListProps {
  scan?: WifiScanResult;      // state.wifiScan - máy gửi về qua Bluetooth (gói 'wl')
  currentSsid?: string;       // WiFi máy đang lưu -> đánh dấu
  onScan: () => void;         // Gửi lệnh WIFI_SCAN
  onPick: (ssid: string) => void;
}

const SCAN_TIMEOUT_MS = 20000;

function signal(rssi: number): { label: string; bars: number; color: string } {
  if (rssi >= -60) return { label: 'Mạnh', bars: 3, color: 'text-emerald-400' };
  if (rssi >= -72) return { label: 'Khá', bars: 2, color: 'text-amber-400' };
  return { label: 'Yếu', bars: 1, color: 'text-red-400' };
}

/** Nút quét + danh sách mạng WiFi máy CITO UF nhìn thấy (quét thật trên ESP32). */
export function WifiScanList({ scan, currentSsid, onScan, onPick }: WifiScanListProps) {
  const [requestedAt, setRequestedAt] = useState(0);
  const [timedOut, setTimedOut] = useState(false);

  // Đang chờ = đã bấm quét và chưa nhận được kết quả mới hơn lúc bấm
  const waiting = requestedAt > 0 && (!scan || scan.at < requestedAt) && !timedOut;

  useEffect(() => {
    if (!waiting) return;
    const t = setTimeout(() => setTimedOut(true), SCAN_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [waiting, requestedAt]);

  const startScan = () => {
    setTimedOut(false);
    setRequestedAt(Date.now());
    onScan();
  };

  const fresh = scan && scan.at >= requestedAt ? scan : requestedAt === 0 ? scan : undefined;

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={startScan}
        disabled={waiting}
        className="w-full sm:w-auto px-4 py-2 rounded-xl bg-cyan-950/60 border border-cyan-500/50 text-cyan-300 hover:bg-cyan-900/60 disabled:opacity-60 text-xs font-bold flex items-center justify-center gap-2 transition-all"
      >
        <RefreshCw className={`w-3.5 h-3.5 ${waiting ? 'animate-spin' : ''}`} />
        <span>{waiting ? 'Máy đang quét WiFi... (3-5 giây)' : '🔍 Quét mạng WiFi quanh máy'}</span>
      </button>

      {timedOut && (
        <p className="text-[11px] text-red-400">
          Không nhận được kết quả quét. Kiểm tra đã kết nối Bluetooth với máy chưa rồi bấm quét lại.
        </p>
      )}

      {fresh?.error && <p className="text-[11px] text-red-400">{fresh.error}</p>}

      {fresh && !waiting && (
        <div className="max-h-64 overflow-y-auto rounded-xl border border-slate-800 divide-y divide-slate-800 bg-slate-900/60">
          {fresh.networks.length === 0 && !fresh.error && (
            <div className="px-3 py-3 text-[11px] text-slate-400">
              Máy không thấy mạng WiFi nào. Chỉ hỗ trợ WiFi 2.4GHz - đặt máy gần router hơn rồi quét lại.
            </div>
          )}
          {fresh.networks.map((n) => {
            const sg = signal(n.rssi);
            const isCurrent = !!currentSsid && n.ssid === currentSsid;
            return (
              <button
                key={n.ssid}
                type="button"
                onClick={() => onPick(n.ssid)}
                className="w-full px-3 py-2.5 flex items-center justify-between gap-3 text-left hover:bg-slate-800 transition-all"
              >
                <span className="flex items-center gap-2 min-w-0">
                  <Wifi className={`w-4 h-4 shrink-0 ${sg.color}`} />
                  <span className="text-xs text-white font-mono truncate">{n.ssid}</span>
                  {n.secure && <Lock className="w-3 h-3 shrink-0 text-slate-500" />}
                  {isCurrent && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 shrink-0">
                      đang lưu
                    </span>
                  )}
                </span>
                <span className={`text-[10px] font-mono shrink-0 ${sg.color}`}>
                  {sg.label} {n.rssi} dBm
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
