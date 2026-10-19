import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  CitoDevice,
  CitoSystemState,
  FilterDaysType,
  FilterMode,
  PumpType,
  TdsMode,
} from './src/types/system';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function createInitialState(custom: Partial<CitoSystemState> = {}): CitoSystemState {
  return {
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
      dirtyFilterMa: 350, // Lọc bẩn bơm nhỏ = 350 mA (FLt)
      overCurrentMa: 700, // Quá dòng bơm nhỏ = 700 mA (ngắt 222)
    },
    pumpThresholdsLarge: {
      minCurrentMa: 80,
      dirtyFilterMa: 450, // Lọc bẩn bơm lớn = 450 mA (FLt)
      overCurrentMa: 800, // Quá dòng bơm lớn = 800 mA (ngắt 222)
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
    ...custom,
  };
}

// Dedicated CITO UF Device Registry
const devices: Record<string, CitoDevice> = {
  'CITO-UF-001': {
    id: 'CITO-UF-001',
    name: 'CITO UF SYSTEM',
    customerName: 'Người Dùng',
    ipAddress: '192.168.1.108',
    isOnline: true,
    lastSeen: Date.now(),
    state: createInitialState({
      tds: 146,
      temperature: 25.5,
      tdsMode: 'TEP',
      filterMode: 103,
      deviceIp: '192.168.1.108',
      display7Segment: '146',
    }),
  },
};

let activeDeviceId = 'CITO-UF-001';

// Device internal operational trackers
const deviceInternalTimers: Record<
  string,
  {
    flushTimerSec: number;
    maxFlushDurationSec: number;
    pressureReleaseTimer: number;
    alternatorTick: number;
    userInactivitySec: number;
  }
> = {};

Object.keys(devices).forEach((id) => {
  deviceInternalTimers[id] = {
    flushTimerSec: 0,
    maxFlushDurationSec: 60,
    pressureReleaseTimer: 0,
    alternatorTick: 0,
    userInactivitySec: 0,
  };
});

// Main operational ticker for each device
setInterval(() => {
  const now = new Date();
  const timeStr = now.toLocaleTimeString('vi-VN', { hour12: false }) + ' ' + now.toLocaleDateString('vi-VN');

  Object.values(devices).forEach((dev) => {
    const s = dev.state;
    if (!deviceInternalTimers[dev.id]) {
      deviceInternalTimers[dev.id] = {
        flushTimerSec: 0,
        maxFlushDurationSec: 60,
        pressureReleaseTimer: 0,
        alternatorTick: 0,
        userInactivitySec: 0,
      };
    }
    const t = deviceInternalTimers[dev.id];
    t.alternatorTick++;
    t.userInactivitySec++;

    s.rtcTime = timeStr;

    // Check 2-min sleep
    s.isSleeping = t.userInactivitySec > 120;

    // Mode 100 Manual countdown
    if (s.manualFilterCountdown > 0) {
      s.manualFilterCountdown--;
      if (s.manualFilterCountdown === 0 && !s.isFiltering && s.filterMode === 100) {
        s.filterMode = 103;
        s.filterMinutesPerHour = 30;
      }
    }

    // Cooldown 1 hour
    if (s.cooldownSecondsRemaining > 0) {
      s.cooldownSecondsRemaining--;
    }

    // Pressure release
    if (s.isPressureRelease) {
      t.pressureReleaseTimer--;
      if (t.pressureReleaseTimer <= 0) {
        s.isPressureRelease = false;
      }
    }

    // Flush countdown (max 30m)
    if (s.isFlushing) {
      t.flushTimerSec++;
      if (t.flushTimerSec >= t.maxFlushDurationSec || t.flushTimerSec >= 1800) {
        s.isFlushing = false;
        t.flushTimerSec = 0;
        s.cooldownSecondsRemaining = 3600;
      }
    }

    // Current readings simulation
    const isPumpRunning = (s.isFiltering || s.isFlushing || s.isDryRun) && !s.isPressureRelease;
    const isDrainOpen = s.isFlushing || s.isPressureRelease;

    if (isPumpRunning && !s.activeErrors.err222_pumpOverCurrent) {
      const baseMa = s.pumpType === 'SMALL' ? 520 : 980;
      s.pumpCurrentMa = Math.round(baseMa + (Math.random() * 30 - 15));
      const dirtyLimit = s.pumpType === 'SMALL' ? s.pumpThresholdsSmall.dirtyFilterMa : s.pumpThresholdsLarge.dirtyFilterMa;
      if (s.pumpCurrentMa > dirtyLimit) {
        s.activeErrors.flt_dirtyFilter = true;
      }
    } else {
      s.pumpCurrentMa = 0;
    }

    if (isDrainOpen) {
      s.drainValveCurrentMa = Math.round(310 + (Math.random() * 20 - 10));
    } else {
      s.drainValveCurrentMa = 0;
    }

    // Auto TDS Flush Trigger
    if (s.tdsMode !== 'OFF' && !s.isFlushing && s.cooldownSecondsRemaining === 0) {
      const cfg = s.tdsSettings[s.tdsMode];
      if (cfg && s.tds > cfg.hi) {
        s.isFlushing = true;
        t.flushTimerSec = 0;
        t.maxFlushDurationSec = cfg.flushMinutes * 60 + cfg.flushSeconds;
      }
    }

    // 7-segment multiplexer
    if (s.displayHoldingState) {
      s.display7Segment = s.displayHoldingState;
    } else if (s.isPressureRelease) {
      s.display7Segment = t.alternatorTick % 2 === 0 ? 'XAP' : '---';
    } else if (s.isDryRun) {
      s.display7Segment = 'drn';
    } else if (s.isPriming) {
      s.display7Segment = 'Prt';
    } else if (s.activeErrors.err222_pumpOverCurrent) {
      s.display7Segment = t.alternatorTick % 2 === 0 ? 'Err' : '222';
    } else if (s.activeErrors.err666_drainOverCurrent) {
      s.display7Segment = t.alternatorTick % 2 === 0 ? 'Err' : '666';
    } else if (s.activeErrors.err111_pumpNoCurrent) {
      s.display7Segment = t.alternatorTick % 2 === 0 ? 'Err' : '111';
    } else if (s.activeErrors.err555_drainNoCurrent) {
      s.display7Segment = t.alternatorTick % 2 === 0 ? 'Err' : '555';
    } else if (s.activeErrors.flt_dirtyFilter) {
      s.display7Segment = t.alternatorTick % 3 === 0 ? 'FLt' : s.tds.toString().padStart(3, ' ');
    } else if (s.activeErrors.err333_filterValveBlocked) {
      s.display7Segment = t.alternatorTick % 2 === 0 ? s.tds.toString() : '333';
    } else if (s.activeErrors.err444_drainNoFlow) {
      s.display7Segment = t.alternatorTick % 2 === 0 ? s.tds.toString() : '444';
    } else {
      const cycle = t.alternatorTick % 6;
      if (cycle < 4) {
        s.display7Segment = s.tds.toString().padStart(3, ' ');
      } else {
        s.display7Segment = `${Math.round(s.temperature)}C`;
      }
    }
  });
}, 1000);

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

  app.use(express.json());

  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, X-Device-ID');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
  });

  // ==================== MULTI-DEVICE & CUSTOMER API ====================

  // 1. List all customer devices
  app.get('/api/devices', (req: Request, res: Response) => {
    const list = Object.values(devices).map((d) => {
      const errCount = Object.values(d.state.activeErrors).filter(Boolean).length;
      return {
        id: d.id,
        name: d.name,
        customerName: d.customerName,
        customerPhone: d.customerPhone,
        location: d.location,
        ipAddress: d.ipAddress,
        isOnline: d.isOnline,
        lastSeen: d.lastSeen,
        tds: d.state.tds,
        temperature: d.state.temperature,
        tdsMode: d.state.tdsMode,
        isFiltering: d.state.isFiltering,
        isFlushing: d.state.isFlushing,
        errorCount: errCount,
      };
    });
    res.json({ success: true, activeDeviceId, devices: list });
  });

  // 2. Select active device to control
  app.post('/api/devices/select', (req: Request, res: Response) => {
    const { deviceId } = req.body;
    if (deviceId && devices[deviceId]) {
      activeDeviceId = deviceId;
      return res.json({ success: true, activeDeviceId, device: devices[deviceId] });
    }
    res.status(404).json({ error: 'Không tìm thấy thiết bị này' });
  });

  // 3. Add new customer device
  app.post('/api/devices', (req: Request, res: Response) => {
    const { id, name, customerName, customerPhone, location, ipAddress, initialMode } = req.body;
    const devId = (id || `CITO-${Date.now().toString().slice(-4)}`).toUpperCase();

    if (devices[devId]) {
      return res.status(400).json({ error: 'Mã thiết bị này đã tồn tại' });
    }

    const newDev: CitoDevice = {
      id: devId,
      name: name || `Bể Thủy Sinh ${devId}`,
      customerName: customerName || 'Khách Hàng Mới',
      customerPhone: customerPhone || '',
      location: location || '',
      ipAddress: ipAddress || '192.168.1.150',
      isOnline: true,
      lastSeen: Date.now(),
      state: createInitialState({
        tdsMode: (initialMode as TdsMode) || 'TEP',
        deviceIp: ipAddress || '192.168.1.150',
      }),
    };

    devices[devId] = newDev;
    deviceInternalTimers[devId] = {
      flushTimerSec: 0,
      maxFlushDurationSec: 60,
      pressureReleaseTimer: 0,
      alternatorTick: 0,
      userInactivitySec: 0,
    };

    activeDeviceId = devId;
    res.json({ success: true, device: newDev });
  });

  // 4. Delete device
  app.delete('/api/devices/:id', (req: Request, res: Response) => {
    const devId = req.params.id;
    if (devices[devId]) {
      delete devices[devId];
      delete deviceInternalTimers[devId];
      if (activeDeviceId === devId) {
        activeDeviceId = Object.keys(devices)[0] || '';
      }
      return res.json({ success: true, activeDeviceId });
    }
    res.status(404).json({ error: 'Không tìm thấy thiết bị' });
  });

  // 5. Get current state (supports ?deviceId=... or defaults to activeDeviceId)
  app.get('/api/status', (req: Request, res: Response) => {
    const devId = (req.query.deviceId as string) || activeDeviceId;
    const dev = devices[devId] || devices[activeDeviceId];

    if (!dev) {
      return res.status(404).json({ error: 'Chưa có thiết bị nào' });
    }

    const deviceList = Object.values(devices).map((d) => ({
      id: d.id,
      name: d.name,
      customerName: d.customerName,
      location: d.location,
      ipAddress: d.ipAddress,
      tds: d.state.tds,
      temperature: d.state.temperature,
      tdsMode: d.state.tdsMode,
      isFiltering: d.state.isFiltering,
      isFlushing: d.state.isFlushing,
      isOnline: d.isOnline,
    }));

    res.json({
      ...dev.state,
      deviceId: dev.id,
      deviceName: dev.name,
      customerName: dev.customerName,
      customerPhone: dev.customerPhone,
      location: dev.location,
      activeDeviceId,
      devices: deviceList,
    });
  });

  // 6. Execute action on a device
  app.post('/api/action', (req: Request, res: Response) => {
    const { action, payload } = req.body;
    const targetDevId = payload?.deviceId || activeDeviceId;
    const dev = devices[targetDevId];

    if (!dev) {
      return res.status(404).json({ error: `Không tìm thấy thiết bị: ${targetDevId}` });
    }

    const state = dev.state;
    const timers = deviceInternalTimers[targetDevId] || {
      flushTimerSec: 0,
      maxFlushDurationSec: 60,
      pressureReleaseTimer: 0,
      alternatorTick: 0,
      userInactivitySec: 0,
    };
    timers.userInactivitySec = 0;

    switch (action) {
      case 'TOGGLE_FILTER': {
        state.isFiltering = !state.isFiltering;
        if (state.isFiltering) {
          state.manualFilterCountdown = 0;
          state.isManualFilter = true;
          state.filterMode = 100;
        } else {
          if (state.filterMode === 100) state.manualFilterCountdown = 30;
        }
        break;
      }

      case 'TOGGLE_FLUSH': {
        state.isFlushing = !state.isFlushing;
        if (state.isFlushing) {
          timers.flushTimerSec = 0;
          timers.maxFlushDurationSec = 60;
        } else {
          timers.flushTimerSec = 0;
          state.cooldownSecondsRemaining = 3600;
        }
        break;
      }

      case 'SET_TDS_MODE': {
        state.tdsMode = payload.mode as TdsMode;
        break;
      }

      case 'SET_FILTER_MODE': {
        if (payload.filterMode !== undefined) state.filterMode = payload.filterMode as FilterMode;
        if (payload.minutesPerHour !== undefined) state.filterMinutesPerHour = payload.minutesPerHour;
        if (payload.filterDays !== undefined) state.filterDays = payload.filterDays as FilterDaysType;
        if (payload.filterWeekdays !== undefined) state.filterWeekdays = payload.filterWeekdays;
        break;
      }

      case 'SET_PUMP_CONFIG': {
        if (payload.pumpType) state.pumpType = payload.pumpType as PumpType;
        if (payload.pumpThresholdsSmall) state.pumpThresholdsSmall = payload.pumpThresholdsSmall;
        if (payload.pumpThresholdsLarge) state.pumpThresholdsLarge = payload.pumpThresholdsLarge;
        break;
      }

      case 'SET_TDS_CONFIG': {
        const { mode, lo, hi, flushMinutes, flushSeconds } = payload;
        if (mode && state.tdsSettings[mode as keyof typeof state.tdsSettings]) {
          state.tdsSettings[mode as keyof typeof state.tdsSettings] = {
            lo: Number(lo),
            hi: Number(hi),
            flushMinutes: Number(flushMinutes),
            flushSeconds: Number(flushSeconds),
          };
        }
        break;
      }

      case 'SET_SCHEDULED_FLUSH': {
        state.scheduledFlush = { ...state.scheduledFlush, ...payload };
        break;
      }

      case 'SET_TDS_DISPLAY_MODE': {
        if (payload.mode) state.tdsDisplayMode = payload.mode;
        if (payload.autoHourlyTest !== undefined) state.autoHourlyTest = payload.autoHourlyTest;
        break;
      }

      case 'TRIGGER_MEASURE_NOW': {
        state.isMeasuringHourlyNow = true;
        state.isFiltering = true;
        setTimeout(() => {
          state.isFiltering = false;
          state.isMeasuringHourlyNow = false;
          state.lastMeasuredAgoMinutes = 0;
          state.nextMeasureInMinutes = 60;
          state.tds = Math.round(140 + Math.random() * 15);
          state.temperature = +(25.5 + Math.random() * 1.5).toFixed(1);
        }, 15000);
        break;
      }

      case 'RELEASE_PRESSURE': {
        state.isPressureRelease = true;
        state.isFiltering = false;
        state.isFlushing = false;
        timers.pressureReleaseTimer = 30;
        break;
      }

      case 'STOP_PRESSURE_RELEASE': {
        state.isPressureRelease = false;
        break;
      }

      case 'TOGGLE_DRY_RUN': {
        state.isDryRun = !state.isDryRun;
        break;
      }

      case 'TOGGLE_NIGHT_MODE': {
        state.nightMode = !state.nightMode;
        break;
      }

      case 'TOGGLE_SCREEN_SLEEP': {
        state.screenWhenSleeping = !state.screenWhenSleeping;
        break;
      }

      case 'SET_BUTTON_HOLD_TIME': {
        state.buttonHoldSeconds = Number(payload.seconds);
        break;
      }

      case 'RESET_OK': {
        state.activeErrors.err222_pumpOverCurrent = false;
        state.activeErrors.err666_drainOverCurrent = false;
        state.activeErrors.err111_pumpNoCurrent = false;
        state.activeErrors.err555_drainNoCurrent = false;
        state.activeErrors.flt_dirtyFilter = false;
        state.activeErrors.err333_filterValveBlocked = false;
        state.activeErrors.err444_drainNoFlow = false;
        break;
      }

      case 'RESET_ALL': {
        dev.state = createInitialState({
          tdsMode: 'OFF',
          deviceIp: dev.ipAddress,
        });
        break;
      }

      case 'SYNC_NTP': {
        state.lastNtpSync = new Date().toLocaleTimeString('vi-VN') + ' (NTP Internet)';
        break;
      }

      case 'SET_WIFI_CONFIG': {
        const { ssid, password } = payload;
        if (ssid) {
          state.wifiSsid = ssid;
          state.wifiConfig.ssid = ssid;
          if (password !== undefined) state.wifiConfig.password = password;
          state.wifiConnected = true;
          state.wifiConfig.status = 'CONNECTED';
        }
        break;
      }

      case 'CALIBRATE_TDS': {
        const { standardPpm, kFactor } = payload;
        if (standardPpm) {
          const currentTds = state.tds || 146;
          const prevK = state.tdsCalibration?.kFactor || 1.0;
          const rawReading = currentTds / prevK;
          const newK = +(Number(standardPpm) / (rawReading || 1)).toFixed(3);
          state.tdsCalibration.kFactor = newK;
          state.tdsCalibration.standardSolutionPpm = Number(standardPpm);
          state.tds = Number(standardPpm);
          state.display7Segment = String(Number(standardPpm));
          state.tdsCalibration.lastCalibratedAt = new Date().toLocaleTimeString('vi-VN') + ' ' + new Date().toLocaleDateString('vi-VN');
        } else if (kFactor) {
          state.tdsCalibration.kFactor = Number(kFactor);
          state.tds = Math.round(146 * Number(kFactor));
          state.display7Segment = String(state.tds);
        }
        break;
      }

      case 'RESET_TDS_CALIBRATION': {
        state.tdsCalibration.kFactor = 1.0;
        state.tds = 146;
        state.display7Segment = '146';
        state.tdsCalibration.lastCalibratedAt = 'Mặc định (K = 1.000)';
        break;
      }

      case 'TOUCH_KEY': {
        const key = payload.key;
        if (key === 'LOC') {
          state.isFiltering = !state.isFiltering;
          if (!state.isFiltering && state.filterMode === 100) state.manualFilterCountdown = 30;
        } else if (key === 'XA') {
          state.isFlushing = !state.isFlushing;
        } else if (key === 'TEP' || key === 'CA' || key === 'CAY' || key === 'CUSTOM') {
          state.tdsMode = state.tdsMode === key ? 'OFF' : key;
        } else if (key === 'OK') {
          state.activeErrors.err222_pumpOverCurrent = false;
          state.activeErrors.err666_drainOverCurrent = false;
          state.activeErrors.flt_dirtyFilter = false;
        }
        break;
      }

      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }

    res.json({ success: true, state: dev.state, deviceId: dev.id });
  });

  // 7. Embedded Microcontroller Poll Endpoint (supports ?deviceId=... or X-Device-ID header)
  app.get('/api/device/poll', (req: Request, res: Response) => {
    const devId = (req.query.deviceId as string) || (req.headers['x-device-id'] as string) || activeDeviceId;
    const dev = devices[devId] || devices[activeDeviceId];

    if (!dev) {
      return res.status(404).json({ error: 'Device not found' });
    }

    dev.lastSeen = Date.now();
    dev.isOnline = true;
    const s = dev.state;

    res.json({
      success: true,
      deviceId: dev.id,
      timestamp: Date.now(),
      isFiltering: s.isFiltering,
      isFlushing: s.isFlushing,
      isPressureRelease: s.isPressureRelease,
      isDryRun: s.isDryRun,
      nightMode: s.nightMode,
      tdsMode: s.tdsMode,
      filterMode: s.filterMode,
      pumpRelay: (s.isFiltering || s.isFlushing || s.isDryRun) && !s.isPressureRelease ? 1 : 0,
      filterValveSR1: s.isFiltering || s.isPressureRelease ? 1 : 0,
      drainValveGPIO26: s.isFlushing || s.isPressureRelease ? 1 : 0,
      targetTdsHi: s.tdsMode !== 'OFF' ? s.tdsSettings[s.tdsMode].hi : 999,
      displaySegment: s.display7Segment,
    });
  });

  // 8. Microcontroller Telemetry Upload
  app.post('/api/device/telemetry', (req: Request, res: Response) => {
    const { deviceId, tds, temp, pumpCurrentMa, drainCurrentMa, filterFlow, drainFlow } = req.body;
    const devId = deviceId || (req.headers['x-device-id'] as string) || activeDeviceId;
    const dev = devices[devId] || devices[activeDeviceId];

    if (dev) {
      dev.lastSeen = Date.now();
      dev.isOnline = true;
      const s = dev.state;
      if (tds !== undefined) s.tds = Number(tds);
      if (temp !== undefined) s.temperature = Number(temp);
      if (pumpCurrentMa !== undefined) s.pumpCurrentMa = Number(pumpCurrentMa);
      if (drainCurrentMa !== undefined) s.drainValveCurrentMa = Number(drainCurrentMa);
      if (filterFlow !== undefined) s.filterFlowRate = Boolean(filterFlow);
      if (drainFlow !== undefined) s.drainFlowRate = Boolean(drainFlow);
      return res.json({ success: true, deviceId: dev.id, state: s });
    }

    res.status(404).json({ error: 'Device not found' });
  });

  // Mount Vite
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`CITO UF SYSTEM Web Server running on port ${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
