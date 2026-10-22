import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';

const api = (window.CodeAcademyNative = window.CodeAcademyNative || {});
let listenersInstalled = false;

api.enablePushNotifications = async () => {
  if (!Capacitor.isNativePlatform()) throw new Error('Native push notifications are available only inside the installed Android app.');
  let permission = await PushNotifications.checkPermissions();
  if (permission.receive !== 'granted') permission = await PushNotifications.requestPermissions();
  if (permission.receive !== 'granted') throw new Error('Notification permission was not granted.');

  if (!listenersInstalled) {
    listenersInstalled = true;
    await PushNotifications.addListener('registration', token => {
      // The token must be sent to an authenticated backend before this device can receive targeted messages.
      window.dispatchEvent(new CustomEvent('codeacademy:push-token', { detail: { value: token.value } }));
    });
    await PushNotifications.addListener('registrationError', error => {
      window.dispatchEvent(new CustomEvent('codeacademy:push-registration-error', { detail: error }));
    });
    await PushNotifications.addListener('pushNotificationReceived', notification => {
      window.dispatchEvent(new CustomEvent('codeacademy:push-received', { detail: notification }));
    });
    await PushNotifications.addListener('pushNotificationActionPerformed', action => {
      window.dispatchEvent(new CustomEvent('codeacademy:push-action', { detail: action }));
    });
  }
  await PushNotifications.register();
  return { status: 'registered-requested' };
};
