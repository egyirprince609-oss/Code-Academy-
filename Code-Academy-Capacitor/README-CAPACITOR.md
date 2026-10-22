# Code Academy Capacitor Android wrapper

This is a separate Capacitor project inside the existing Code Academy repository. The original repository root is the source snapshot; this app's web assets are in `www/`.

## Native bridge

The build creates `www/capacitor-native.js` and injects its script into copied HTML files only. It exposes `window.CodeAcademyNative` methods for native-platform detection, camera/photo access, local notifications, device information and network status. These methods do not modify the original source files or automatically request permission until called.

Examples from an existing user action:

```js
const photo = await window.CodeAcademyNative.takePhoto();
const status = await window.CodeAcademyNative.getNetworkStatus();
await window.CodeAcademyNative.scheduleLocalNotification({
  title: 'Code Academy',
  body: 'Your study reminder is due.',
  at: new Date(Date.now() + 60_000)
});
```

Remote push notification setup is optional until Firebase's Android JSON is downloaded. See `FIREBASE-ANDROID-SETUP.md` and `enable-native-push.sh`.

## Build

The GitHub Actions workflow `.github/workflows/code-academy-capacitor-android.yml` builds the Android APK in the cloud because Termux on an Android phone is not the supported full Android SDK/Android Studio environment. It uploads an APK as an Actions artifact. A signed release is produced only after the release keystore values are configured as repository Actions secrets; otherwise the workflow produces a debug APK for testing.
