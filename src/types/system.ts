export type TdsMode = 'OFF' | 'TEP' | 'CA' | 'CAY' | 'CUSTOM';
export type FilterMode = 100 | 101 | 102 | 103 | 104;
export type FilterDaysType = 'C07' | 'C24' | 'C13' | 'C03' | 'Ctu';
export type PumpType = 'SMALL' | 'LARGE';

export interface TdsThreshold {
  lo: number;            // Ngưỡng TDS thấp (ppm)
  hi: number;            // Ngưỡng TDS cao (ppm) - tự động xả khi TDS > hi
  flushMinutes: number;  // Thời gian xả: phần phút (0 - 30)
  flushSeconds: number;  // Thời gian xả: phần giây (0 - 59)
}

export interface PumpThresholds {
  minCurrentMa: number;    // Dòng tối thiểu (mA) -> thấp hơn báo lỗi bơm hỏng 111 (nhỏ: 40, lớn: 80)
  dirtyFilterMa: number;   // Ngưỡng lọc bẩn (mA) -> vượt báo FLt (nhỏ: 350, lớn: 450)
  overCurrentMa: number;   // Ngưỡng quá dòng (mA) -> vượt dừng khẩn cấp 222 (nhỏ: 700, lớn: 800)
}

export const TDS_MODE_LABELS: Record<TdsMode, string> = {
  OFF: 'TẮT',
  TEP: 'TÉP',
  CA: 'CÁ',
  CAY: 'CÂY',
  CUSTOM: 'CUSTOM',
};

export function getTdsModeLabel(mode: TdsMode): string {
  return TDS_MODE_LABELS[mode] || mode;
}

export interface TdsCalibration {
  kFactor: number;             // Hệ số nhân K (mặc định 1.000)
  standardSolutionPpm: number; // Giá trị dung dịch chuẩn hoặc bút đo (ppm)
  rawVoltage: number;          // Điện áp cảm biến que đo (V)
  lastCalibratedAt: string;    // Ngày giờ hiệu chuẩn gần nhất
}

export interface WifiConfig {
  ssid: string;
  password?: string;
  ipAddress: string;
  gateway?: string;
  subnet?: string;
  rssi: number;                // Cường độ sóng (dBm) e.g. -58 dBm
  status: 'CONNECTED' | 'CONNECTING' | 'DISCONNECTED';
}

export interface ValveThresholds {
  minCurrentMa: number;    // Dòng van xả tối thiểu -> lỗi 555
  overCurrentMa: number;   // Ngưỡng quá dòng van xả -> dừng khẩn cấp 666
}

export interface ScheduledFlush {
  type: 'nd' | 'Ctu';      // Mỗi N ngày (nd) hoặc theo thứ (Ctu)
  intervalDays: number;    // Số ngày N (mặc định 3 ngày)
  timesPerDay: number;     // Số lần xả mỗi ngày (1 - 8)
  startHour: number;       // Giờ bắt đầu xả (0 - 23)
  startMinute: number;     // Phút bắt đầu xả (0 - 59)
  flushMinutes: number;    // Thời lượng phút (0 - 30)
  flushSeconds: number;    // Thời lượng giây (0 - 59)
  customWeekdays: boolean[]; // [CN, T2, T3, T4, T5, T6, T7]
}

// OK = số đo hợp lệ; WAITING = chế độ 1 tiếng/lần chưa đo lần nào; ERROR = DS18B20 lỗi / chưa cắm
export type TemperatureState = 'OK' | 'WAITING' | 'ERROR';

/** Chuỗi hiển thị nhiệt độ (không kèm °C khi lỗi / chờ đo). */
export function formatTemperature(s: { temperature: number; temperatureState?: TemperatureState }): string {
  if (s.temperatureState === 'ERROR') return 'Lỗi cảm biến';
  if (s.temperatureState === 'WAITING') return 'Chờ đo';
  return `${s.temperature}°C`;
}

import type { HistoryEvent } from '../services/history';

// Vì sao máy đang lọc: theo lịch / bật tay (lịch tạm dừng) / tự đo cảm biến / mồi nước khi khởi động
export type FilterSource = 'AUTO' | 'MANUAL' | 'SENSOR' | 'PRIMING';

export interface WifiNetwork {
  ssid: string;
  rssi: number;     // dBm
  secure: boolean;  // Có mật khẩu
}

export interface WifiScanResult {
  at: number;             // Date.now() lúc nhận kết quả
  networks: WifiNetwork[];
  error?: string;
}

export interface CitoSystemState {
  // Trạng thái vận hành
  isFiltering: boolean;       // Đang lọc
  isFlushing: boolean;        // Đang xả nước
  isPressureRelease: boolean; // Đang xả áp suất (30s)
  isDryRun: boolean;          // Bơm khô (drn)
  isPriming: boolean;         // Đang mồi nước (Prt)
  isManualFilter: boolean;    // Đang lọc do người dùng bật tay (mode 100)
  manualFilterCountdown: number; // Đếm ngược 30s khi tắt lọc tay trong mode 100 -> tự về 103

  // Cảm biến
  tds: number;                // TDS hiện tại (ppm)
  temperature: number;        // Nhiệt độ nước (°C)
  pumpCurrentMa: number;      // Dòng điện bơm (mA)
  drainValveCurrentMa: number;// Dòng điện van xả (mA)
  filterFlowRate: boolean;    // Cảm biến dòng chảy đường lọc (LOW = có nước)
  drainFlowRate: boolean;     // Cảm biến dòng chảy đường xả

  // Chế độ đo TDS & Nhiệt độ
  tdsDisplayMode: 'HOURLY' | 'REALTIME'; // Mỗi 1 tiếng hoặc real-time
  autoHourlyTest: boolean;    // Tự chạy lọc 20s để đo mỗi 1 tiếng
  lastMeasuredAgoMinutes: number; // Đo cách đây X phút
  nextMeasureInMinutes: number;   // Lần tới sau Y phút
  isMeasuringHourlyNow: boolean;  // Đang chạy 20s để đo

  // Chế độ TDS (Tép / Cá / Cây / Custom / Tắt)
  tdsMode: TdsMode;
  tdsSettings: {
    TEP: TdsThreshold;
    CA: TdsThreshold;
    CAY: TdsThreshold;
    CUSTOM: TdsThreshold;
  };
  cooldownSecondsRemaining: number; // Đếm ngược cooldown 1 giờ (3600s) sau khi xả

  // Lịch lọc (Filter Mode)
  filterMode: FilterMode;     // 100, 101, 102, 103, 104
  filterMinutesPerHour: number;// Số phút lọc mỗi giờ
  filterDays: FilterDaysType; // C07, C24, C13, C03, Ctu
  filterWeekdays: boolean[];  // [CN, T2, T3, T4, T5, T6, T7]

  // Cài đặt bơm
  pumpType: PumpType;         // SMALL (Bơm nhỏ) | LARGE (Bơm lớn)
  pumpThresholdsSmall: PumpThresholds;
  pumpThresholdsLarge: PumpThresholds;
  valveThresholds: ValveThresholds;

  // Lịch xả định kỳ
  scheduledFlush: ScheduledFlush;

  // Hiển thị & Điều khiển
  nightMode: boolean;         // 🌙 Chế độ ban đêm (tắt LED + màn hình + logo)
  screenWhenSleeping: boolean;// Màn hình khi ngủ: BẬT = logo sáng + 7-SEG hiện TDS; TẮT = tắt hết
  isSleeping: boolean;        // Máy đang ngủ sau 2 phút không thao tác
  buttonHoldSeconds: number;  // 0 (tắt) | 0.5 | 1 | 1.5 | 2 | 3 giây

  // Hiệu ứng LED Logo
  logoEffect: number;         // 0 - 7 (8 hiệu ứng)
  logoSpeed: number;          // Tốc độ hiệu ứng (1 - 5)

  // Đồng hồ & WiFi
  rtcTime: string;            // Giờ từ DS3231 (e.g. "14:32:05 19/10/2026")
  rtcConnected: boolean;      // Module DS3231 có kết nối không
  lastNtpSync: string;        // Thời gian đồng bộ NTP gần nhất
  wifiSsid: string;
  wifiConnected: boolean;
  deviceIp: string;

  // Hiệu chuẩn cảm biến TDS
  tdsCalibration: TdsCalibration;

  // Cấu hình mạng WiFi chi tiết
  wifiConfig: WifiConfig;

  // Lỗi & Cảnh báo (đồng bộ với mã màn hình 7 đoạn)
  activeErrors: {
    err111_pumpNoCurrent: boolean;     // Bơm không có dòng
    err222_pumpOverCurrent: boolean;   // Bơm quá dòng (dừng khẩn cấp)
    err333_filterValveBlocked: boolean;// Van lọc không mở / không lưu lượng
    err444_drainNoFlow: boolean;       // Đường xả không có lưu lượng
    err555_drainNoCurrent: boolean;    // Van xả không có dòng
    err666_drainOverCurrent: boolean;  // Van xả quá dòng (dừng khẩn cấp)
    flt_dirtyFilter: boolean;          // Lõi lọc bẩn (bơm vẫn chạy)
    rtcLost: boolean;                  // Đồng hồ RTC lỗi
    acsPumpDisconnected: boolean;      // Cảm biến dòng bơm chưa cắm
    acsDrainDisconnected: boolean;     // Cảm biến dòng van chưa cắm
  };

  // Màn hình 7-đoạn 3 số thực tế của máy
  display7Segment: string;    // Chuỗi 3 ký tự hiện tại: "156", "26C", "Err", "111", "222", "FLt", "Prt", "drn", "XAP", "---", "rES"
  displayHoldingState: string;// "-", "--", "---" khi đang giữ nút

  // Chỉ có khi kết nối máy thật qua Bluetooth (gói 'cf' / 'st' của firmware)
  firmwareVersion?: string;   // FW_VERSION trong config.h
  deviceMac?: string;         // MAC 12 ký tự - dùng để ghim máy (pins.json) trên web OTA
  otaStatus?: string;         // Kết quả kiểm tra OTA online gần nhất
  otaLatest?: string;         // Phiên bản mới nhất thấy trên server
  otaProgress?: number;       // % đang nạp OTA, -1 = không nạp
  temperatureState?: TemperatureState; // Chỉ có khi nối máy thật; không có = số mẫu / mô phỏng
  wifiStaState?: number;      // 0 chưa cài, 1 đang kết nối, 2 đã kết nối, 3 không thấy mạng, 4 sai mật khẩu
  wifiScan?: WifiScanResult;  // Kết quả lệnh WIFI_SCAN gần nhất
  scheduleOverridden?: boolean; // Đã bật/tắt lọc bằng tay -> lịch lọc tự động TẠM DỪNG (RESUME_AUTO để chạy lại)
  ocHalted?: boolean;           // Đang DỪNG KHẨN CẤP do quá dòng - chờ OK
  filterSource?: FilterSource;
  history?: HistoryEvent[];     // Nhật ký gần nhất, MỚI NHẤT trước (tối đa 64)
}

export interface CitoDevice {
  id: string;                 // Mã định danh thiết bị e.g. "CITO-UF-001"
  name: string;               // Tên bể / thiết bị e.g. "Bể Tép Caridina"
  customerName: string;       // Tên khách hàng e.g. "Anh Tuấn (Hà Nội)"
  customerPhone?: string;     // Số điện thoại khách hàng
  location?: string;          // Vị trí lắp đặt
  ipAddress: string;          // Địa chỉ IP thiết bị e.g. "192.168.1.108"
  isOnline: boolean;          // Trạng thái kết nối
  lastSeen: number;           // Timestamp lần sync gần nhất
  state: CitoSystemState;     // Trạng thái vận hành chi tiết
}

