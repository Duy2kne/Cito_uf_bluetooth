/**
 * Nhật ký sự kiện của máy CITO UF (khớp firmware CITO_UF_System/history.h).
 * Mỗi sự kiện từ máy: [t, type, src, val]
 *   t   : giây giờ địa phương từ 1970 (đọc bằng getUTC*). Bit 31 = 1 -> RTC lỗi, 31 bit thấp = giây từ lúc khởi động.
 */

export interface HistoryEvent {
  t: number;
  type: number;
  src: number;
  val: number;
}

export type HistoryCategory = 'filter' | 'drain' | 'error' | 'system' | 'setting';

const EV = {
  BOOT: 1,
  FILTER_ON: 2,
  FILTER_OFF: 3,
  DRAIN_ON: 4,
  DRAIN_OFF: 5,
  PREL_ON: 6,
  PREL_OFF: 7,
  ERR_SET: 8,
  ERR_CLEAR: 9,
  OC_HALT: 10,
  OC_RESUME: 11,
  PRIMING_END: 12,
  WIFI_UP: 13,
  OTA: 14,
  SETTINGS_RESET: 15,
  TDS_MODE: 16,
  FILTER_MODE: 17,
  SCHED_PAUSE: 18,
  TDS_CAL: 19,
};

const SRC_LABEL = [
  'tự động theo lịch',
  'nút trên máy',
  'app Bluetooth',
  'web 192.168.4.1',
  'tự động theo TDS',
  'tự đo TDS / nhiệt độ định kỳ',
  'mồi nước khi khởi động',
  'bảo vệ do lỗi',
  'hết thời gian cho phép',
  'OTA online',
  'Arduino IDE',
];

// Nguồn "tự động" (máy tự quyết, không ai bấm)
const AUTO_SRC = new Set([0, 4, 5, 6, 7, 8]);

const ERR_NAMES: [number, string][] = [
  [1 << 0, 'bơm không có dòng (111)'],
  [1 << 1, 'van lọc không mở (333)'],
  [1 << 2, 'van xả không có dòng (555)'],
  [1 << 3, 'mất RTC'],
  [1 << 4, 'quá dòng bơm (222)'],
  [1 << 5, 'lõi lọc bẩn (FLt)'],
  [1 << 6, 'chưa cắm cảm biến dòng bơm'],
  [1 << 7, 'chưa cắm cảm biến dòng van'],
  [1 << 8, 'quá dòng van xả (666)'],
  [1 << 9, 'đường xả không có nước (444)'],
];

const RESET_REASON: Record<number, string> = {
  1: 'cấp nguồn',
  2: 'nút reset',
  3: 'khởi động lại / sau OTA',
  4: 'lỗi phần mềm (panic)',
  5: 'watchdog',
  6: 'watchdog (loop treo)',
  7: 'watchdog',
  9: 'sụt áp nguồn (brownout)',
};

const TDS_MODE_NAME = ['TẮT', 'TÉP', 'CÁ', 'CÂY', 'CUSTOM'];
const FILTER_MODE_NAME: Record<number, string> = {
  100: '100 - thủ công',
  101: '101 - 8h-12h, 14h-17h',
  102: '102 - 19h-5h',
  103: '103 - 23h-5h',
  104: '104 - 24/24',
};

const unpackVer = (v: number) => (v ? `${(v >> 10) & 0x3f}.${(v >> 5) & 0x1f}.${v & 0x1f}` : '');

function dur(s: number): string {
  if (s < 60) return `${s} giây`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} phút ${s % 60 ? `${s % 60} giây` : ''}`.trim();
  return `${Math.floor(m / 60)} giờ ${m % 60} phút`;
}

const errList = (mask: number) =>
  ERR_NAMES.filter(([b]) => mask & b)
    .map(([, n]) => n)
    .join(', ') || `mã ${mask}`;

export function parseHistory(raw: any): HistoryEvent[] {
  return (Array.isArray(raw) ? raw : [])
    .filter((e: any) => Array.isArray(e) && e.length >= 4)
    .map((e: any[]) => ({ t: Number(e[0]) >>> 0, type: Number(e[1]), src: Number(e[2]), val: Number(e[3]) }));
}

export function isAutoEvent(e: HistoryEvent): boolean {
  return (
    AUTO_SRC.has(e.src) &&
    [EV.FILTER_ON, EV.FILTER_OFF, EV.DRAIN_ON, EV.DRAIN_OFF, EV.PREL_OFF, EV.FILTER_MODE, EV.SCHED_PAUSE].includes(e.type)
  );
}

export function eventCategory(e: HistoryEvent): HistoryCategory {
  if (e.type === EV.FILTER_ON || e.type === EV.FILTER_OFF) return 'filter';
  if ([EV.DRAIN_ON, EV.DRAIN_OFF, EV.PREL_ON, EV.PREL_OFF].includes(e.type)) return 'drain';
  if ([EV.ERR_SET, EV.OC_HALT, EV.ERR_CLEAR, EV.OC_RESUME].includes(e.type)) return 'error';
  if ([EV.TDS_MODE, EV.FILTER_MODE, EV.SCHED_PAUSE, EV.TDS_CAL, EV.SETTINGS_RESET].includes(e.type)) return 'setting';
  return 'system';
}

/** Có phải sự kiện "xấu" (đỏ) */
export function isAlarmEvent(e: HistoryEvent): boolean {
  return (
    e.type === EV.ERR_SET ||
    e.type === EV.OC_HALT ||
    (e.type === EV.PRIMING_END && e.val === 1) ||
    (e.type === EV.BOOT && [4, 5, 6, 7, 9].includes(e.src))
  );
}

export function formatEventTime(t: number): string {
  if (t & 0x80000000) {
    const up = t & 0x7fffffff;
    return `+${dur(up)} sau khởi động (RTC lỗi)`;
  }
  const d = new Date(t * 1000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())} ${p(d.getUTCDate())}/${p(
    d.getUTCMonth() + 1
  )}/${d.getUTCFullYear()}`;
}

export function describeEvent(e: HistoryEvent): string {
  const by = SRC_LABEL[e.src] ?? `nguồn ${e.src}`;
  switch (e.type) {
    case EV.BOOT:
      return `Máy khởi động - firmware ${unpackVer(e.val) || '?'} (lý do: ${RESET_REASON[e.src] ?? `mã ${e.src}`})`;
    case EV.FILTER_ON:
      return `Bật lọc - ${by} (TDS ${e.val} ppm)`;
    case EV.FILTER_OFF:
      return `Tắt lọc - ${by} (đã lọc ${dur(e.val)})`;
    case EV.DRAIN_ON:
      return `Bật xả - ${by} (TDS ${e.val} ppm)`;
    case EV.DRAIN_OFF:
      return `Tắt xả - ${by} (đã xả ${dur(e.val)})`;
    case EV.PREL_ON:
      return `Xả áp suất - ${by}`;
    case EV.PREL_OFF:
      return `Kết thúc xả áp - ${by}`;
    case EV.ERR_SET:
      return `Lỗi: ${errList(e.val)}`;
    case EV.ERR_CLEAR:
      return `Hết lỗi: ${errList(e.val)} (${by})`;
    case EV.OC_HALT:
      return `DỪNG KHẨN CẤP - ${e.val & (1 << 8) ? 'quá dòng van xả (666)' : 'quá dòng bơm (222)'}`;
    case EV.OC_RESUME:
      return `Chạy lại sau dừng khẩn cấp - ${by}`;
    case EV.PRIMING_END:
      return e.val ? 'Mồi nước THẤT BẠI - không có nước sau 10 phút' : 'Mồi nước xong - có nước';
    case EV.WIFI_UP:
      return `Kết nối WiFi nhà (-${e.val} dBm)`;
    case EV.OTA:
      return `Nạp firmware mới${e.val ? ` ${unpackVer(e.val)}` : ''} - qua ${by}`;
    case EV.SETTINGS_RESET:
      return `Khôi phục cài đặt gốc - ${by}`;
    case EV.TDS_MODE:
      return `Đổi chế độ TDS → ${TDS_MODE_NAME[e.val] ?? e.val} - ${by}`;
    case EV.FILTER_MODE:
      return `Đổi lịch lọc → ${FILTER_MODE_NAME[e.val] ?? e.val} - ${by}`;
    case EV.SCHED_PAUSE:
      return e.val
        ? `Lịch lọc tự động TẠM DỪNG (bật/tắt lọc bằng tay) - ${by}`
        : `Lịch lọc tự động chạy lại - ${by}`;
    case EV.TDS_CAL:
      return `Hiệu chuẩn TDS, K = ${(e.val / 1000).toFixed(3)} - ${by}`;
    default:
      return `Sự kiện ${e.type} (nguồn ${e.src}, giá trị ${e.val})`;
  }
}
