# Release checklist

- [ ] Use a real, stable VPN gateway and test with valid configuration files.
- [ ] Confirm the app accurately distinguishes an established local tunnel interface from end-to-end server reachability; a successful interface start does not guarantee a successful server handshake.
- [ ] Test Wi-Fi to mobile-data transitions, device sleep/wake, VPN revocation from Android Settings, and a provider/server going offline.
- [ ] Test notification permission granted/denied and verify the active service remains accurately described.
- [ ] Test Android's Always-on VPN and Block connections without VPN options on supported devices.
- [ ] Review the use of the `specialUse` foreground-service type and provide the declared use case in Play Console.
- [ ] Host a reviewed Privacy Policy at a public HTTPS URL and add it to Play Console.
- [ ] Complete the VPN service declaration and Data safety questionnaire.
- [ ] Complete Google Play's current policy review for VPN apps and target API 36.
- [ ] Build a release using a signing key controlled by the publisher. Keep key files and passwords out of source control.
- [ ] Test the signed APK/AAB on physical Android devices before release.
- [ ] Confirm account sign-in works under the intended sign-in method. Google sign-in may need a native Android/Firebase provider setup rather than a WebView popup.
