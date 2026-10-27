import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Device } from '@capacitor/device';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Geolocation } from '@capacitor/geolocation';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Network } from '@capacitor/network';
import { PushNotifications } from '@capacitor/push-notifications';

const emit = (name, detail) => window.dispatchEvent(new CustomEvent(`codeacademy:${name}`, { detail }));
const native = () => Capacitor.isNativePlatform();
const getDirectory = (name) => Directory[name] ?? Directory.Data;

// A bridge is made available to the website. Existing website code must call these
// functions to use native APIs; packaging alone does not convert all web API calls.
const bridge = {
  isNative: native,
  getPlatform: () => Capacitor.getPlatform(),
  getDeviceInfo: () => Device.getInfo(),
  getNetworkStatus: () => Network.getStatus(),
  getCurrentPosition: (options = {}) => Geolocation.getCurrentPosition({
    enableHighAccuracy: true,
    timeout: 15000,
    ...options
  }),
  requestLocationPermissions: () => Geolocation.requestPermissions(),
  watchPosition: (options = {}, callback = () => {}) => Geolocation.watchPosition(
    { enableHighAccuracy: true, ...options },
    (position, error) => callback(position, error)
  ),
  takePhoto: (options = {}) => Camera.getPhoto({
    quality: 85,
    allowEditing: false,
    resultType: CameraResultType.DataUrl,
    source: CameraSource.Prompt,
    ...options
  }),
  scheduleLocalNotification: async ({ title = 'Code Academy', body = '', at, id } = {}) => {
    let permission = await LocalNotifications.checkPermissions();
    if (permission.display !== 'granted') permission = await LocalNotifications.requestPermissions();
    if (permission.display !== 'granted') throw new Error('Notification permission was not granted.');
    const notification = {
      id: Number.isFinite(Number(id)) && Number(id) > 0 ? Number(id) : Math.floor(Date.now() % 2147483000),
      title: String(title),
      body: String(body)
    };
    if (at) notification.schedule = { at: new Date(at) };
    return LocalNotifications.schedule({ notifications: [notification] });
  },
  readAppFile: ({ path, directory = 'Data' } = {}) => {
    if (!path) throw new Error('readAppFile requires a relative path.');
    return Filesystem.readFile({ path, directory: getDirectory(directory) });
  },
  writeAppFile: ({ path, data, directory = 'Data', recursive = true } = {}) => {
    if (!path) throw new Error('writeAppFile requires a relative path.');
    return Filesystem.writeFile({ path, data: String(data ?? ''), directory: getDirectory(directory), recursive });
  },
  getAppFileUri: ({ path, directory = 'Data' } = {}) => {
    if (!path) throw new Error('getAppFileUri requires a relative path.');
    return Filesystem.getUri({ path, directory: getDirectory(directory) });
  },
  registerPushNotifications: async () => {
    if (!native()) throw new Error('Remote push registration is available only in the native app.');
    let permission = await PushNotifications.checkPermissions();
    if (permission.receive !== 'granted') permission = await PushNotifications.requestPermissions();
    if (permission.receive !== 'granted') throw new Error('Push notification permission was not granted.');
    await PushNotifications.register();
    return { status: 'registration-requested' };
  },
  addNativeEventListener: (eventName, callback) => {
    const listener = (event) => callback(event.detail);
    window.addEventListener(`codeacademy:${eventName}`, listener);
    return { remove: () => window.removeEventListener(`codeacademy:${eventName}`, listener) };
  },
  exitApp: () => App.exitApp()
};

Object.defineProperty(window, 'CodeAcademyNative', {
  value: Object.freeze(bridge),
  configurable: false,
  writable: false
});

if (native()) {
  PushNotifications.addListener('registration', token => emit('push-token', token)).catch(() => {});
  PushNotifications.addListener('registrationError', error => emit('push-registration-error', error)).catch(() => {});
  PushNotifications.addListener('pushNotificationReceived', notification => emit('push-received', notification)).catch(() => {});
  PushNotifications.addListener('pushNotificationActionPerformed', action => emit('push-action', action)).catch(() => {});
  Network.addListener('networkStatusChange', status => emit('network-change', status)).catch(() => {});
}
