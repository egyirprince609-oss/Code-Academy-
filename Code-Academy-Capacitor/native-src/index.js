import { Capacitor } from '@capacitor/core';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Device } from '@capacitor/device';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Network } from '@capacitor/network';

const isNative = Capacitor.isNativePlatform();
const api = (window.CodeAcademyNative = window.CodeAcademyNative || {});
api.isNative = isNative;
api.appId = 'com.wm.codeacademy';

api.getDeviceInfo = async () => Device.getInfo();
api.getNetworkStatus = async () => Network.getStatus();

// Call this from an existing user action (for example, a camera button).
api.takePhoto = async (options = {}) => {
  const result = await Camera.getPhoto({
    quality: Number(options.quality || 85),
    allowEditing: false,
    resultType: CameraResultType.Uri,
    source: options.source === 'photos' ? CameraSource.Photos : CameraSource.Prompt,
    saveToGallery: false
  });
  return { webPath: result.webPath || null, path: result.path || null, format: result.format || null };
};

api.requestLocalNotificationPermission = async () => {
  const current = await LocalNotifications.checkPermissions();
  if (current.display === 'granted') return current;
  return LocalNotifications.requestPermissions();
};

api.scheduleLocalNotification = async ({ id, title, body, at } = {}) => {
  const permissions = await api.requestLocalNotificationPermission();
  if (permissions.display !== 'granted') throw new Error('Notification permission was not granted.');
  const date = at ? new Date(at) : new Date(Date.now() + 60_000);
  if (Number.isNaN(date.getTime()) || date.getTime() <= Date.now()) throw new Error('Notification time must be in the future.');
  const notificationId = Number.isInteger(Number(id)) && Number(id) > 0 ? Number(id) : Math.floor(Date.now() % 2_000_000_000) + 1;
  return LocalNotifications.schedule({ notifications: [{ id: notificationId, title: title || 'Code Academy', body: body || '', schedule: { at: date } }] });
};

api.cancelLocalNotification = async (id) => LocalNotifications.cancel({ notifications: [{ id: Number(id) }] });
window.dispatchEvent(new CustomEvent('codeacademy:native-ready', { detail: { isNative } }));
