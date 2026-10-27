#!/usr/bin/env python3
# Add permission usage descriptions and Capacitor push delegate callbacks.
from pathlib import Path
import plistlib

ROOT = Path(__file__).resolve().parents[1]
plist = ROOT / "ios" / "App" / "App" / "Info.plist"
delegate = ROOT / "ios" / "App" / "App" / "AppDelegate.swift"
if not plist.is_file():
    raise SystemExit(f"iOS Info.plist not found: {plist}")
with plist.open("rb") as fh:
    data = plistlib.load(fh)
data.update({
    "NSCameraUsageDescription": "Code Academy uses the camera when you choose to capture an image.",
    "NSPhotoLibraryUsageDescription": "Code Academy uses your photo library when you choose an image.",
    "NSPhotoLibraryAddUsageDescription": "Code Academy may save an image when you request it.",
    "NSLocationWhenInUseUsageDescription": "Code Academy uses your location only when you request a location-based feature.",
    "NSMicrophoneUsageDescription": "Code Academy uses the microphone only when you start a feature that needs audio.",
})
with plist.open("wb") as fh:
    plistlib.dump(data, fh, fmt=plistlib.FMT_XML, sort_keys=False)
print("iOS privacy/permission usage descriptions added to Info.plist.")

if delegate.is_file():
    source = delegate.read_text(encoding="utf-8")
    if "import Capacitor" not in source:
        if "import UIKit" in source:
            source = source.replace("import UIKit", "import UIKit\nimport Capacitor", 1)
        else:
            source = "import Capacitor\n" + source
    if "capacitorDidRegisterForRemoteNotifications" not in source:
        pos = source.rfind("}")
        if pos < 0:
            raise SystemExit("Could not find the closing brace of AppDelegate.swift.")
        methods = '''
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
    }
'''
        source = source[:pos] + methods + source[pos:]
        delegate.write_text(source, encoding="utf-8")
        print("Capacitor push-notification delegate callbacks added; iOS push still requires Apple signing/capabilities.")
    else:
        print("Capacitor push delegate callbacks already present.")
else:
    print("AppDelegate.swift not found; simulator build can continue, but push callback integration needs manual verification.")
