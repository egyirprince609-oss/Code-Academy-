package com.codeacademy.vpnforce

import android.app.Application
import com.wireguard.android.backend.GoBackend

/** Registers the WireGuard callback before Android can start the VPN for Always-on mode. */
class CodeAcademyApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        val appContext = applicationContext
        GoBackend.setAlwaysOnCallback {
            // Android may start the WireGuard VpnService before any Activity exists.
            // Restart our foreground controller only when a profile has been saved locally.
            if (VpnRuntime.hasSavedProfile(appContext)) {
                VpnControlService.start(appContext)
            }
        }
    }
}
