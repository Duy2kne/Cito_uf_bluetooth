/**
 * Web Bluetooth API Service for CITO UF SYSTEM
 * Allows direct peer-to-peer secure connection from browser to nearby ESP32 over BLE
 *
 * Giao thức (khớp firmware CITO_UF_System/ble_control.cpp):
 *  - STATUS (notify): mỗi gói JSON kết thúc bằng '\n', firmware cắt theo MTU -> phải ghép lại.
 *      {"t":"st",...}  trạng thái real-time (1 giây / lần)
 *      {"t":"cf",...}  cài đặt (khi kết nối, sau mỗi lệnh, khi đổi trên máy)
 *      {"t":"ack","a":"<lệnh>","ok":true,"msg":"..."}  kết quả lệnh
 *      {"t":"wl","n":[["Tên WiFi",-55,1],...]}           kết quả lệnh WIFI_SCAN (ssid, dBm, có khóa)
 *      {"t":"hi","clr":true,"end":false,"e":[[t,type,src,val],...]}  nhật ký (mới nhất trước, nhiều trang)
 *      {"t":"ev","e":[[...],...]}                        sự kiện mới phát sinh (cũ -> mới)
 *  - COMMAND (write): {"a":"<LỆNH>","p":{...}}. Gửi AUTH (mã PIN) trước mọi lệnh khác.
 */

import { CitoSystemState, FilterDaysType, TdsMode } from '../types/system';
import { parseHistory } from './history';

const HISTORY_MAX = 64;
const LAST_DEVICE_KEY = 'cito_ble_last_device'; // {id, name} máy đã nối gần nhất (localStorage)

function saveLastDevice(id: string, name: string): void {
  try {
    localStorage.setItem(LAST_DEVICE_KEY, JSON.stringify({ id, name }));
  } catch {
    /* private mode: không nhớ được, lần sau phải quét lại */
  }
}

/** Máy đã nối gần nhất (để hiện nút "Kết nối lại"), null nếu chưa nối lần nào. */
export function getLastDevice(): { id: string; name: string } | null {
  try {
    const v = JSON.parse(localStorage.getItem(LAST_DEVICE_KEY) || 'null');
    return v && v.id ? v : null;
  } catch {
    return null;
  }
}

/** Chờ máy phát quảng bá (đã trong tầm sóng) - cần Chrome hỗ trợ watchAdvertisements. */
function waitForAdvertisement(device: any, ms: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const ac = new AbortController();
    const timer = setTimeout(() => {
      ac.abort();
      reject(new Error('Máy chưa trong tầm Bluetooth'));
    }, ms);
    device.addEventListener(
      'advertisementreceived',
      () => {
        clearTimeout(timer);
        ac.abort();
        resolve();
      },
      { once: true }
    );
    device.watchAdvertisements({ signal: ac.signal }).catch((e: any) => {
      clearTimeout(timer);
      reject(e);
    });
  });
}

export const CITO_BLE_SERVICE_UUID = '4fafc201-1fb5-459e-8fcc-c5c9c331914b';
export const CITO_BLE_CHAR_STATUS_UUID = 'beb5483e-36e1-4688-b7f5-ea07361b26a8'; // Read/Notify
export const CITO_BLE_CHAR_COMMAND_UUID = 'cba1d466-344c-4be3-ab3f-189f80dd7518'; // Write

export interface BleDeviceInfo {
  id: string;
  name: string;
  connected: boolean;
  rssi?: number;
}

export interface BleAck {
  a: string;
  ok: boolean;
  msg?: string;
}

const TDS_MODES: TdsMode[] = ['OFF', 'TEP', 'CA', 'CAY', 'CUSTOM'];
const FILTER_DAYS: FilterDaysType[] = ['C07', 'C24', 'C13', 'C03', 'Ctu'];
const TDS_KEYS = ['TEP', 'CA', 'CAY', 'CUSTOM'] as const;

// Bitmask lỗi - khớp ERR_* trong firmware outputs.h
const ERR = {
  PUMP: 1 << 0,
  VALVE_FILTER: 1 << 1,
  VALVE_DRAIN: 1 << 2,
  RTC: 1 << 3,
  OVERCURRENT: 1 << 4,
  FILTER_DIRTY: 1 << 5,
  HALL_PUMP_NC: 1 << 6,
  HALL_VALVE_NC: 1 << 7,
  VALVE_OVERCURRENT: 1 << 8,
  DRAIN_NO_FLOW: 1 << 9,
};

const maskToDays = (m: number): boolean[] => Array.from({ length: 7 }, (_, i) => ((m >> i) & 1) === 1);
const splitDur = (s: number) => ({ flushMinutes: Math.floor(s / 60), flushSeconds: s % 60 });

function display7(s: CitoSystemState, err: number, oc: boolean): string {
  const blink = Math.floor(Date.now() / 1000) % 2 === 0;
  if (s.isPressureRelease) return blink ? 'XAP' : '---';
  if (s.isPriming) return 'Prt';
  if (oc) return blink ? 'Err' : err & ERR.VALVE_OVERCURRENT ? '666' : '222';
  if (err & ERR.PUMP) return blink ? 'Err' : '111';
  if (err & ERR.VALVE_DRAIN) return blink ? 'Err' : '555';
  if (err & ERR.FILTER_DIRTY) return 'FLt'; // Giống máy: FLt cố định
  // Giống máy: TDS 30 giây rồi nhiệt độ 30 giây (chỉ khi có nhiệt độ hợp lệ)
  if (s.temperatureState === 'OK' && Math.floor(Date.now() / 30000) % 2 === 1) {
    return `${Math.round(s.temperature)}C`.padStart(3, ' ');
  }
  return String(s.tds).padStart(3, ' ');
}

/** Áp 1 gói telemetry ('st' / 'cf') của firmware lên state hiện tại của web. */
export function applyBlePacket(prev: CitoSystemState, pkt: any): CitoSystemState {
  const s: CitoSystemState = { ...prev };

  if (pkt.t === 'st') {
    const err: number = pkt.err ?? 0;
    s.tds = pkt.tds ?? s.tds;
    // tmp = null: máy không có số hợp lệ -> KHÔNG giữ số cũ, báo lỗi / chờ đo
    if (typeof pkt.tmp === 'number' && pkt.tok !== false) {
      s.temperature = pkt.tmp;
      s.temperatureState = 'OK';
    } else {
      s.temperatureState = pkt.tok === false ? 'ERROR' : pkt.tw ? 'WAITING' : 'ERROR';
    }
    s.isFiltering = !!pkt.flt;
    s.isFlushing = !!pkt.drn;
    s.isPressureRelease = !!pkt.prl;
    s.prelLeftSec = pkt.prl ? Number(pkt.pls) || 0 : 0;
    s.isPriming = !!pkt.pri;
    s.primingLeftSec = pkt.pri ? Number(pkt.prs) || 0 : 0;
    s.isSleeping = !!pkt.slp;
    s.isDryRun = false; // Firmware không có chế độ bơm khô
    s.pumpCurrentMa = pkt.pma ?? 0;
    s.drainValveCurrentMa = pkt.vma ?? 0;
    s.tdsMode = TDS_MODES[pkt.md] ?? 'OFF';
    s.filterMode = pkt.fm ?? s.filterMode;
    s.scheduleOverridden = !!pkt.ovr;
    s.isManualFilter = !!pkt.ovr && s.isFiltering;
    s.ocHalted = !!pkt.oc;
    s.filterSource = pkt.pri ? 'PRIMING' : pkt.srun ? 'SENSOR' : pkt.ovr ? 'MANUAL' : 'AUTO';
    s.cooldownSecondsRemaining = pkt.drs < 0 ? -pkt.drs : 0;
    s.isMeasuringHourlyNow = !!pkt.srun;
    if (typeof pkt.sage === 'number' && pkt.sage >= 0) {
      s.lastMeasuredAgoMinutes = Math.floor(pkt.sage / 60);
      s.nextMeasureInMinutes = Math.max(0, 60 - Math.ceil(pkt.sage / 60));
    }
    s.rtcTime = pkt.time || 'RTC lỗi';
    s.rtcConnected = !!pkt.rtc && !!pkt.time;
    s.rtcBatteryLow = !!pkt.rtcr;
    s.wifiConnected = !!pkt.wifi;
    if (typeof pkt.sta === 'number') s.wifiStaState = pkt.sta;
    s.deviceIp = pkt.ip || '';
    s.wifiConfig = {
      ...s.wifiConfig,
      ipAddress: pkt.ip || '',
      rssi: pkt.rssi ?? 0,
      status: pkt.wifi ? 'CONNECTED' : s.wifiSsid ? 'CONNECTING' : 'DISCONNECTED',
    };
    s.activeErrors = {
      err111_pumpNoCurrent: !!(err & ERR.PUMP),
      err222_pumpOverCurrent: !!(err & ERR.OVERCURRENT),
      err333_filterValveBlocked: !!(err & ERR.VALVE_FILTER),
      err444_drainNoFlow: !!(err & ERR.DRAIN_NO_FLOW),
      err555_drainNoCurrent: !!(err & ERR.VALVE_DRAIN),
      err666_drainOverCurrent: !!(err & ERR.VALVE_OVERCURRENT),
      flt_dirtyFilter: !!(err & ERR.FILTER_DIRTY),
      rtcLost: !!(err & ERR.RTC),
      acsPumpDisconnected: !!(err & ERR.HALL_PUMP_NC),
      acsDrainDisconnected: !!(err & ERR.HALL_VALVE_NC),
    };
    s.otaProgress = pkt.otap ?? -1;
    s.display7Segment = display7(s, err, !!pkt.oc);
    s.displayHoldingState = '';
    return s;
  }

  if (pkt.t === 'cf') {
    if (Array.isArray(pkt.ts)) {
      const ts = { ...s.tdsSettings };
      TDS_KEYS.forEach((k, i) => {
        const v = pkt.ts[i];
        if (Array.isArray(v)) ts[k] = { lo: v[0], hi: v[1], ...splitDur(v[2]) };
      });
      s.tdsSettings = ts;
    }
    s.filterMinutesPerHour = pkt.fmin ?? s.filterMinutesPerHour;
    s.filterDays = FILTER_DAYS[pkt.fday] ?? s.filterDays;
    if (typeof pkt.fwd === 'number') s.filterWeekdays = maskToDays(pkt.fwd);
    s.pumpType = pkt.pt === 1 ? 'LARGE' : 'SMALL';
    if (Array.isArray(pkt.pl)) {
      const lim = (v: number[]) => ({ minCurrentMa: v[0], dirtyFilterMa: v[1], overCurrentMa: v[2] });
      s.pumpThresholdsSmall = lim(pkt.pl[0]);
      s.pumpThresholdsLarge = lim(pkt.pl[1]);
    }
    s.valveThresholds = { minCurrentMa: pkt.vmin ?? 0, overCurrentMa: pkt.vmax ?? 0 };
    s.scheduledFlush = {
      type: pkt.ddm === 1 ? 'Ctu' : 'nd',
      intervalDays: pkt.ddn,
      timesPerDay: pkt.ddx,
      startHour: pkt.ddh,
      startMinute: pkt.ddi,
      ...splitDur(pkt.dds ?? 60),
      customWeekdays: maskToDays(pkt.ddw ?? 0x7f),
    };
    s.tdsDisplayMode = pkt.srt ? 'REALTIME' : 'HOURLY';
    s.autoHourlyTest = !!pkt.sau;
    s.nightMode = !!pkt.nm;
    s.screenWhenSleeping = !!pkt.ls;
    s.buttonHoldSeconds = (pkt.hold ?? 1000) / 1000;
    s.logoEffect = pkt.lfx ?? -1;
    s.logoSpeed = pkt.lsp ?? s.logoSpeed;
    if (typeof pkt.kc === 'number') s.tdsCalibration = { ...s.tdsCalibration, kFactor: pkt.kc };
    s.wifiSsid = pkt.ssid ?? '';
    s.wifiConfig = { ...s.wifiConfig, ssid: pkt.ssid ?? '' };
    s.lastNtpSync = pkt.ntp ?? s.lastNtpSync;
    s.firmwareVersion = pkt.fw;
    s.deviceMac = pkt.id;
    s.otaStatus = pkt.otas;
    s.otaLatest = pkt.otal;
    return s;
  }

  if (pkt.t === 'hi') {
    const page = parseHistory(pkt.e);
    s.history = (pkt.clr ? page : [...(s.history || []), ...page]).slice(0, HISTORY_MAX);
    return s;
  }

  if (pkt.t === 'ev') {
    const fresh = parseHistory(pkt.e).reverse(); // máy gửi cũ -> mới; danh sách web mới nhất trước
    s.history = [...fresh, ...(s.history || [])].slice(0, HISTORY_MAX);
    return s;
  }

  if (pkt.t === 'wl') {
    s.wifiScan = {
      at: Date.now(),
      networks: (Array.isArray(pkt.n) ? pkt.n : []).map((n: any[]) => ({
        ssid: String(n[0]),
        rssi: Number(n[1]),
        secure: !!n[2],
      })),
      error: pkt.err,
    };
    return s;
  }

  return prev;
}

export class CitoBleManager {
  private device: any = null;
  private gattServer: any = null;
  private statusChar: any = null;
  private commandChar: any = null;
  private rxBuffer = '';
  private pin = '1234';
  private writeChain: Promise<void> = Promise.resolve();
  private onStateCallback: ((data: any) => void) | null = null;
  private onDisconnectCallback: (() => void) | null = null;
  private packetListener: ((pkt: any) => void) | null = null;
  private ackListener: ((ack: BleAck) => void) | null = null;
  private linkListener: ((state: 'connected' | 'reconnecting' | 'lost', name: string) => void) | null = null;
  private userDisconnect = false;
  private onDropped = () => {
    void this.handleDropped();
  };
  private decoder = new TextDecoder('utf-8');
  private onValue = (event: any) => {
    // stream: true -> ký tự UTF-8 (tiếng Việt) bị cắt đôi giữa 2 gói vẫn ghép đúng
    this.handleChunk(this.decoder.decode(event.target.value, { stream: true }));
  };

  public isSupported(): boolean {
    return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
  }

  /** Mã PIN gửi cho máy ngay sau khi kết nối (lệnh AUTH). */
  public setPin(pin: string): void {
    this.pin = pin;
  }

  /** Trạng thái liên kết: rớt sóng -> 'reconnecting' -> 'connected' lại hoặc 'lost' (hết 3 lần thử). */
  public setLinkListener(fn: (state: 'connected' | 'reconnecting' | 'lost', name: string) => void): void {
    this.linkListener = fn;
  }

  /** App đăng ký 1 lần: nhận mọi gói 'st' / 'cf' và kết quả lệnh. */
  public setListeners(onPacket: (pkt: any) => void, onAck: (ack: BleAck) => void): void {
    this.packetListener = onPacket;
    this.ackListener = onAck;
  }

  private handleChunk(text: string): void {
    this.rxBuffer += text;
    let nl: number;
    while ((nl = this.rxBuffer.indexOf('\n')) >= 0) {
      const line = this.rxBuffer.slice(0, nl);
      this.rxBuffer = this.rxBuffer.slice(nl + 1);
      if (!line.trim()) continue;
      try {
        const pkt = JSON.parse(line);
        if (pkt.t === 'ack') {
          if (this.ackListener) this.ackListener(pkt as BleAck);
        } else {
          if (this.packetListener) this.packetListener(pkt);
          if (this.onStateCallback) this.onStateCallback(pkt);
        }
      } catch (e) {
        console.warn('Failed to parse BLE telemetry packet', e, line);
      }
    }
    // Mất 1 mảnh giữa chừng -> bộ đệm không bao giờ gặp '\n': bỏ để tự đồng bộ lại
    if (this.rxBuffer.length > 8192) this.rxBuffer = '';
  }

  public async scanAndConnect(
    onStateUpdate: (data: any) => void,
    onDisconnected: () => void
  ): Promise<BleDeviceInfo> {
    if (!this.isSupported()) {
      throw new Error(
        'Trình duyệt này không hỗ trợ Web Bluetooth. Vui lòng dùng Chrome, Edge hoặc Opera trên máy tính / Android.'
      );
    }

    this.onStateCallback = onStateUpdate;
    this.onDisconnectCallback = onDisconnected;

    try {
      // Prompt user to select nearby CITO UF device
      const nav = navigator as any;
      const device = await nav.bluetooth.requestDevice({
        filters: [{ namePrefix: 'CITO-UF' }, { services: [CITO_BLE_SERVICE_UUID] }],
        optionalServices: [CITO_BLE_SERVICE_UUID],
      });

      if (this.device) this.device.removeEventListener('gattserverdisconnected', this.onDropped);
      this.device = device;
      this.userDisconnect = false;
      device.removeEventListener('gattserverdisconnected', this.onDropped); // Quét lại cùng máy: không gắn trùng
      device.addEventListener('gattserverdisconnected', this.onDropped);
      await this.attach();
      saveLastDevice(device.id, device.name || 'CITO UF');
      if (this.linkListener) this.linkListener('connected', device.name || 'CITO UF');

      return {
        id: device.id,
        name: device.name || 'CITO UF (ESP32 BLE)',
        connected: true,
      };
    } catch (err: any) {
      if (err.name === 'NotFoundError') {
        throw new Error('Người dùng đã hủy tìm kiếm thiết bị Bluetooth.');
      }
      throw err;
    }
  }

  /** Trình duyệt cho phép tự nối lại máy đã cấp quyền (không cần bảng chọn thiết bị) không. */
  public canAutoReconnect(): boolean {
    const nav = navigator as any;
    return this.isSupported() && typeof nav.bluetooth.getDevices === 'function';
  }

  /**
   * Tải lại trang: nối lại máy đã cấp quyền lần trước, KHÔNG hiện bảng chọn thiết bị.
   * Cần Chrome/Edge có navigator.bluetooth.getDevices() (xem THAY_DOI_WEB.md).
   * Trả về null nếu trình duyệt không hỗ trợ hoặc chưa từng nối máy nào.
   */
  public async reconnectRemembered(
    onStateUpdate: (data: any) => void,
    onDisconnected: () => void
  ): Promise<BleDeviceInfo | null> {
    if (!this.canAutoReconnect()) return null;
    const last = getLastDevice();
    const devices: any[] = await (navigator as any).bluetooth.getDevices();
    const device =
      devices.find((d) => last && d.id === last.id) || devices.find((d) => (d.name || '').startsWith('CITO-UF'));
    if (!device) return null;

    this.onStateCallback = onStateUpdate;
    this.onDisconnectCallback = onDisconnected;
    if (this.device) this.device.removeEventListener('gattserverdisconnected', this.onDropped);
    this.device = device;
    this.userDisconnect = false;
    device.removeEventListener('gattserverdisconnected', this.onDropped);
    device.addEventListener('gattserverdisconnected', this.onDropped);

    try {
      await this.attach();
    } catch (e) {
      // Máy có thể chưa trong tầm / đang khởi động: chờ quảng bá tối đa 15s rồi thử lại
      if (typeof device.watchAdvertisements !== 'function') throw e;
      await waitForAdvertisement(device, 15000);
      await this.attach();
    }
    saveLastDevice(device.id, device.name || 'CITO UF');
    if (this.linkListener) this.linkListener('connected', device.name || 'CITO UF');
    return { id: device.id, name: device.name || 'CITO UF', connected: true };
  }

  /** Kết nối GATT, đăng ký notify, gửi PIN. Dùng cho lần đầu và khi tự kết nối lại. */
  private async attach(): Promise<void> {
    const server = await this.device.gatt.connect();
    this.gattServer = server;
    const service = await server.getPrimaryService(CITO_BLE_SERVICE_UUID);
    this.statusChar = await service.getCharacteristic(CITO_BLE_CHAR_STATUS_UUID);
    this.commandChar = await service.getCharacteristic(CITO_BLE_CHAR_COMMAND_UUID);
    this.rxBuffer = '';
    this.decoder = new TextDecoder('utf-8');
    this.statusChar.removeEventListener('characteristicvaluechanged', this.onValue);
    this.statusChar.addEventListener('characteristicvaluechanged', this.onValue);
    await this.statusChar.startNotifications();
    this.writeChain = Promise.resolve();
    // Xác thực bằng mã PIN -> máy gửi cài đặt + nhật ký
    await this.sendCommand('AUTH', { pin: this.pin });
  }

  /** Rớt sóng (đi ra xa, máy khởi động lại sau OTA...) -> thử kết nối lại 3 lần, không cần bấm quét. */
  private async handleDropped(): Promise<void> {
    this.gattServer = null;
    this.statusChar = null;
    this.commandChar = null;
    this.rxBuffer = '';
    if (this.userDisconnect || !this.device) {
      if (this.onDisconnectCallback) this.onDisconnectCallback();
      return;
    }
    const name = this.device.name || 'CITO UF';
    if (this.linkListener) this.linkListener('reconnecting', name);
    for (let i = 1; i <= 3; i++) {
      await new Promise((r) => setTimeout(r, 2000 * i));
      if (this.userDisconnect || !this.device) return;
      try {
        await this.attach();
        if (this.linkListener) this.linkListener('connected', name);
        return;
      } catch (e) {
        console.warn(`BLE reconnect ${i}/3 failed`, e);
      }
    }
    if (this.linkListener) this.linkListener('lost', name);
    if (this.onDisconnectCallback) this.onDisconnectCallback();
  }

  public async sendCommand(action: string, payload: any = {}): Promise<void> {
    if (!this.commandChar || !this.gattServer || !this.gattServer.connected) {
      throw new Error('Chưa kết nối Bluetooth với thiết bị CITO UF.');
    }

    const commandObj = { a: action, p: payload };
    const data = new TextEncoder().encode(JSON.stringify(commandObj));
    if (data.length > 511) throw new Error('Lệnh quá dài (> 511 byte)');
    // GATT chỉ cho 1 thao tác ghi tại 1 thời điểm -> xếp hàng các lệnh liên tiếp
    const run = this.writeChain.then(() => this.commandChar.writeValue(data));
    this.writeChain = run.catch(() => undefined);
    await run;
  }

  public disconnect(): void {
    this.userDisconnect = true;
    if (this.device && this.device.gatt && this.device.gatt.connected) {
      this.device.gatt.disconnect();
    }
    this.device = null;
    this.gattServer = null;
    this.statusChar = null;
    this.commandChar = null;
    this.rxBuffer = '';
  }

  public isConnected(): boolean {
    return !!(this.gattServer && this.gattServer.connected);
  }
}

export const bleManager = new CitoBleManager();
