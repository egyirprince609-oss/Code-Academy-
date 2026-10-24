import { Capacitor, registerPlugin } from '@capacitor/core';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Device } from '@capacitor/device';
import { Geolocation } from '@capacitor/geolocation';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Network } from '@capacitor/network';

const isNative = Capacitor.isNativePlatform();
const CodeAcademyBrowser = registerPlugin('CodeAcademyBrowser');
const api = (window.CodeAcademyNative = window.CodeAcademyNative || {});
api.isNative = isNative;
api.appId = 'com.wm.codeacademy';

// Native Android browser host. This plugin opens a separate Activity/WebView; it never
// navigates the Code Academy shell WebView to an arbitrary third-party website.
api.openBrowser = async (options = {}) => {
  if (!isNative) throw new Error('The full Code Academy browser engine is available in the Android app.');
  return CodeAcademyBrowser.openBrowser({
    url: String(options.url || ''),
    privateMode: options.privateMode === true,
    openSettings: options.openSettings === true,
    uid: String(options.uid || 'device')
  });
};
api.getBrowserSyncSnapshot = async (uid) => {
  if (!isNative) throw new Error('Browser sync storage is available in the Android app.');
  return CodeAcademyBrowser.getSyncSnapshot({ uid: String(uid || '') });
};
api.applyBrowserSyncSnapshot = async (snapshot = {}) => {
  if (!isNative) throw new Error('Browser sync storage is available in the Android app.');
  return CodeAcademyBrowser.applySyncSnapshot(snapshot);
};

api.getDeviceInfo = async () => Device.getInfo();
api.getNetworkStatus = async () => Network.getStatus();

// Native permission helpers. Android still displays its own permission prompt;
// a website/app cannot grant permissions silently on the user's behalf.
api.checkLocationPermission = async () => Geolocation.checkPermissions();
api.requestLocationPermission = async () => Geolocation.requestPermissions();
api.getCurrentPosition = async (options = {}) => {
  let permission = await Geolocation.checkPermissions();
  if (permission.location !== 'granted' && permission.coarseLocation !== 'granted') {
    permission = await Geolocation.requestPermissions();
  }
  if (permission.location !== 'granted' && permission.coarseLocation !== 'granted') {
    throw new Error('Location permission was not granted.');
  }
  return Geolocation.getCurrentPosition({
    enableHighAccuracy: options.enableHighAccuracy !== false,
    timeout: Number(options.timeout || 15000),
    maximumAge: Number(options.maximumAge || 0)
  });
};
api.checkCameraPermission = async () => Camera.checkPermissions();
api.requestCameraPermission = async () => Camera.requestPermissions();
api.requestMicrophonePermission = async () => {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('Microphone capture is not supported in this WebView.');
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  stream.getTracks().forEach(track => track.stop());
  return { microphone: 'granted' };
};
api.requestWebCameraPermission = async () => {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera capture is not supported in this WebView.');
  const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
  stream.getTracks().forEach(track => track.stop());
  return { camera: 'granted' };
};


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
// Android WebView does not expose the standard web Notification API on every device.
// On native Android only, bridge the common Notification methods to Capacitor local notifications.
if (isNative && typeof window.Notification === 'undefined') {
  let notificationPermission = 'default';
  const refreshNotificationPermission = async () => {
    try {
      const state = await LocalNotifications.checkPermissions();
      notificationPermission = state.display === 'granted' ? 'granted' : (state.display === 'denied' ? 'denied' : 'default');
    } catch (_) { notificationPermission = 'default'; }
    return notificationPermission;
  };
  refreshNotificationPermission();
  class CodeAcademyNativeNotification {
    constructor(title, options = {}) {
      this.title = String(title || 'Code Academy');
      this.body = String(options.body || '');
      this.tag = String(options.tag || '');
      this.onclick = null; this.onshow = null; this.onerror = null; this.onclose = null;
      const id = Math.max(1, Math.floor(Date.now() % 2000000000));
      LocalNotifications.schedule({ notifications: [{ id, title: this.title, body: this.body, schedule: { at: new Date(Date.now() + 1000) } }] })
        .then(() => { if (typeof this.onshow === 'function') this.onshow(new Event('show')); })
        .catch(error => { window.dispatchEvent(new CustomEvent('codeacademy:notification-error', { detail: { message: String(error?.message || error) } })); if (typeof this.onerror === 'function') this.onerror(error); });
    }
    close() { if (typeof this.onclose === 'function') this.onclose(new Event('close')); }
    static get permission() { return notificationPermission; }
    static async requestPermission() {
      let state = await LocalNotifications.checkPermissions();
      if (state.display !== 'granted') state = await LocalNotifications.requestPermissions();
      notificationPermission = state.display === 'granted' ? 'granted' : 'denied';
      return notificationPermission;
    }
  }
  Object.defineProperty(CodeAcademyNativeNotification, 'name', { value: 'Notification' });
  window.Notification = CodeAcademyNativeNotification;
  api.requestNotificationPermission = () => CodeAcademyNativeNotification.requestPermission();
  api.getNotificationPermission = refreshNotificationPermission;
}

window.dispatchEvent(new CustomEvent('codeacademy:native-ready', { detail: { isNative } }));
