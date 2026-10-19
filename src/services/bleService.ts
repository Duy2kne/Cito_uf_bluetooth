/**
 * Web Bluetooth API Service for CITO UF SYSTEM
 * Allows direct peer-to-peer secure connection from browser to nearby ESP32 over BLE
 */

export const CITO_BLE_SERVICE_UUID = '4fafc201-1fb5-459e-8fcc-c5c9c331914b';
export const CITO_BLE_CHAR_STATUS_UUID = 'beb5483e-36e1-4688-b7f5-ea07361b26a8'; // Read/Notify
export const CITO_BLE_CHAR_COMMAND_UUID = 'cba1d466-344c-4be3-ab3f-189f80dd7518'; // Write

export interface BleDeviceInfo {
  id: string;
  name: string;
  connected: boolean;
  rssi?: number;
}

export class CitoBleManager {
  private device: any = null;
  private gattServer: any = null;
  private statusChar: any = null;
  private commandChar: any = null;
  private onStateCallback: ((data: any) => void) | null = null;
  private onDisconnectCallback: (() => void) | null = null;

  public isSupported(): boolean {
    return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
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
        filters: [{ namePrefix: 'CITO-UF' }, { namePrefix: 'CITO' }],
        optionalServices: [CITO_BLE_SERVICE_UUID],
      });

      this.device = device;
      this.device.addEventListener('gattserverdisconnected', () => {
        this.gattServer = null;
        this.statusChar = null;
        this.commandChar = null;
        if (this.onDisconnectCallback) this.onDisconnectCallback();
      });

      // Connect to GATT
      const server = await device.gatt.connect();
      this.gattServer = server;

      // Get Service & Characteristics
      const service = await server.getPrimaryService(CITO_BLE_SERVICE_UUID);
      this.statusChar = await service.getCharacteristic(CITO_BLE_CHAR_STATUS_UUID);
      this.commandChar = await service.getCharacteristic(CITO_BLE_CHAR_COMMAND_UUID);

      // Start notifications for live telemetry from ESP32
      await this.statusChar.startNotifications();
      this.statusChar.addEventListener('characteristicvaluechanged', (event: any) => {
        try {
          const value = event.target.value;
          const decoder = new TextDecoder('utf-8');
          const jsonStr = decoder.decode(value);
          const parsed = JSON.parse(jsonStr);
          if (this.onStateCallback) this.onStateCallback(parsed);
        } catch (e) {
          console.warn('Failed to parse BLE telemetry packet', e);
        }
      });

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

  public async sendCommand(action: string, payload: any = {}): Promise<void> {
    if (!this.commandChar || !this.gattServer || !this.gattServer.connected) {
      throw new Error('Chưa kết nối Bluetooth với thiết bị CITO UF.');
    }

    const commandObj = { a: action, p: payload };
    const encoder = new TextEncoder();
    const data = encoder.encode(JSON.stringify(commandObj));
    await this.commandChar.writeValue(data);
  }

  public disconnect(): void {
    if (this.device && this.device.gatt && this.device.gatt.connected) {
      this.device.gatt.disconnect();
    }
    this.device = null;
    this.gattServer = null;
    this.statusChar = null;
    this.commandChar = null;
  }

  public isConnected(): boolean {
    return !!(this.gattServer && this.gattServer.connected);
  }
}

export const bleManager = new CitoBleManager();
