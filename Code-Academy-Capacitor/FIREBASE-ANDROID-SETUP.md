# Code Academy — Firebase Android setup

The existing website Firebase JavaScript SDK and Firebase's native Android integration are separate configurations. This project keeps the website code in `www/`; the native Firebase file belongs at `android/app/google-services.json` and must never be embedded in `www/`.

1. In Firebase Console, open the existing Code Academy project.
2. Go to Project settings → General → Your apps. Add an Android app (or select the correct existing Android app) whose package ID is exactly `com.wm.codeacademy`.
3. Add the release certificate SHA-1 and SHA-256 printed by the setup script. For Google sign-in, also configure the appropriate OAuth client/provider settings.
4. Download `google-services.json`.
5. Run `bash Code-Academy-Capacitor/enable-native-push.sh /full/path/to/google-services.json` from your repository workspace (or pass the actual path to the downloaded file).

The script validates the package ID, keeps the file out of Git, uploads it as a GitHub Actions secret if GitHub CLI is already authenticated, installs the native push plugin, and prepares the push client bridge.

**Important:** `google-services.json` alone does not make notification delivery happen. The app must send each authenticated user's FCM device token to a trusted backend, and that backend must send notifications through Firebase Cloud Messaging. Never put Firebase Admin SDK credentials or service-account private keys in the app or public repository. The native push bridge intentionally does not auto-prompt on every page load; call `window.CodeAcademyNative.enablePushNotifications()` from the user's notification-enable action.

Native Google/phone login also needs a compatible native authentication flow; simply wrapping existing Firebase Web SDK popup/redirect code does not guarantee every provider works inside a WebView. Test each sign-in provider on a real device.
