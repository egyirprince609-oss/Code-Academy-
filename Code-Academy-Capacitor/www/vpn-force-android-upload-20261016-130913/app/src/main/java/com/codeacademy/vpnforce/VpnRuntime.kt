package com.codeacademy.vpnforce

import android.content.Context
import com.wireguard.android.backend.GoBackend
import com.wireguard.android.backend.Tunnel
import com.wireguard.config.Config
import java.io.BufferedReader
import java.io.StringReader

/**
 * Thin adapter around the official WireGuard Android tunnel library.
 * No credentials are logged. The imported profile is kept in app-private storage.
 */
object VpnRuntime {
    private const val PREFS = "vpn_force_state"
    private const val KEY_STATE = "vpn_state"
    private const val TUNNEL_NAME = "CodeAcademyVPN"

    @Volatile private var backend: GoBackend? = null
    @Volatile private var tunnel: Tunnel? = null

    @Synchronized
    private fun getBackend(context: Context): GoBackend {
        return backend ?: GoBackend(context.applicationContext).also { backend = it }
    }

    @Synchronized
    private fun getTunnel(context: Context): Tunnel {
        return tunnel ?: object : Tunnel {
            override fun getName(): String = TUNNEL_NAME

            override fun onStateChange(newState: Tunnel.State) {
                val state = when (newState) {
                    Tunnel.State.UP -> "connected"
                    Tunnel.State.DOWN -> "disconnected"
                    Tunnel.State.TOGGLE -> "connecting"
                }
                context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                    .edit().putString(KEY_STATE, state).apply()
                if (newState == Tunnel.State.DOWN) {
                    VpnControlService.removeConnectionNotification(context.applicationContext)
                }
            }
        }.also { tunnel = it }
    }

    @Synchronized
    fun connect(context: Context, profileText: String): Boolean {
        require(profileText.contains("[Interface]", ignoreCase = true)) {
            "The selected file is not a WireGuard profile."
        }
        require(profileText.contains("[Peer]", ignoreCase = true)) {
            "The WireGuard profile must include at least one peer."
        }
        val config = Config.parse(BufferedReader(StringReader(profileText)))
        val activeBackend = getBackend(context)
        val activeTunnel = getTunnel(context)
        context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit().putString(KEY_STATE, "connecting").apply()
        val state = activeBackend.setState(activeTunnel, Tunnel.State.UP, config)
        val isUp = state == Tunnel.State.UP
        context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit().putString(KEY_STATE, if (isUp) "connected" else "disconnected").apply()
        return isUp
    }

    @Synchronized
    fun disconnect(context: Context) {
        val activeBackend = backend
        val activeTunnel = tunnel
        if (activeBackend != null && activeTunnel != null) {
            try {
                activeBackend.setState(activeTunnel, Tunnel.State.DOWN, null)
            } finally {
                context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                    .edit().putString(KEY_STATE, "disconnected").apply()
            }
        } else {
            context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit().putString(KEY_STATE, "disconnected").apply()
        }
    }

    fun getStoredState(context: Context): String =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getString(KEY_STATE, "disconnected") ?: "disconnected"

    fun setStoredState(context: Context, state: String) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit().putString(KEY_STATE, state).apply()
    }

    fun hasSavedProfile(context: Context): Boolean = profileFile(context).isFile

    fun profileFile(context: Context) = context.getFileStreamPath("vpn_profile.conf")

    fun setAutoConnect(context: Context, enabled: Boolean) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit().putBoolean("auto_connect_on_open", enabled).apply()
    }

    fun getAutoConnect(context: Context): Boolean =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getBoolean("auto_connect_on_open", false)
}
