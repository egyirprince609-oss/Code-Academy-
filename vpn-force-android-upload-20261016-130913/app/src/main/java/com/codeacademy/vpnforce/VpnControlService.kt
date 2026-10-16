package com.codeacademy.vpnforce

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.BitmapFactory
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import java.util.concurrent.Executors

/** Foreground controller for a user-started WireGuard connection and its system notification. */
class VpnControlService : Service() {
    private val worker = Executors.newSingleThreadExecutor()
    private val mainHandler = Handler(Looper.getMainLooper())

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel(this)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val action = intent?.action ?: ACTION_CONNECT
        val initial = buildNotification(this, "connecting", "Preparing the WireGuard tunnel…", ongoing = true)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && Build.VERSION.SDK_INT >= 34) {
            startForeground(NOTIFICATION_ID, initial, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
        } else {
            startForeground(NOTIFICATION_ID, initial)
        }

        if (action == ACTION_DISCONNECT) {
            worker.execute { disconnectAndStop() }
            return START_NOT_STICKY
        }

        worker.execute {
            try {
                getSharedPreferences("vpn_force_state", Context.MODE_PRIVATE).edit().remove("last_error").apply()
                val file = VpnRuntime.profileFile(this)
                check(file.isFile) { "Import a valid WireGuard profile before connecting." }
                val profile = file.readText(Charsets.UTF_8)
                val up = VpnRuntime.connect(this, profile)
                check(up) { "The WireGuard engine could not start the tunnel." }
                VpnRuntime.setStoredState(this, "connected")
                updateNotification(
                    this,
                    buildNotification(
                        this,
                        "connected",
                        "This device is connected to a VPN from Code Academy.",
                        ongoing = true
                    )
                )
            } catch (error: Exception) {
                VpnRuntime.setStoredState(this, "disconnected")
                getSharedPreferences("vpn_force_state", Context.MODE_PRIVATE)
                    .edit().putString("last_error", safeMessage(error)).apply()
                updateNotification(this, null)
                mainHandler.post {
                    stopForeground(STOP_FOREGROUND_REMOVE)
                    stopSelf(startId)
                }
            }
        }
        return START_STICKY
    }

    private fun disconnectAndStop() {
        try {
            VpnRuntime.disconnect(this)
        } catch (_: Exception) {
            // A disconnect request must still remove the app's foreground notification.
        } finally {
            VpnRuntime.setStoredState(this, "disconnected")
            updateNotification(this, null)
            mainHandler.post {
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopSelf()
            }
        }
    }

    override fun onDestroy() {
        worker.shutdown()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun safeMessage(error: Exception): String {
        val value = error.message?.trim().orEmpty()
        // Avoid saving profile text, keys, endpoints, or exception dumps to diagnostics.
        return when {
            value.contains("profile", ignoreCase = true) -> "Check the imported WireGuard profile."
            value.contains("tunnel", ignoreCase = true) -> "The tunnel could not be started. Check the profile and network."
            value.contains("peer", ignoreCase = true) -> "The profile must contain a valid WireGuard peer."
            else -> "Could not start the VPN. Check the profile and try again."
        }
    }

    companion object {
        const val ACTION_CONNECT = "com.codeacademy.vpnforce.CONNECT"
        const val ACTION_DISCONNECT = "com.codeacademy.vpnforce.DISCONNECT"
        private const val CHANNEL_ID = "code_academy_vpn_status"
        private const val NOTIFICATION_ID = 6107

        fun start(context: Context) {
            val intent = Intent(context, VpnControlService::class.java).setAction(ACTION_CONNECT)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(intent)
            else context.startService(intent)
        }

        fun disconnect(context: Context) {
            val intent = Intent(context, VpnControlService::class.java).setAction(ACTION_DISCONNECT)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(intent)
            else context.startService(intent)
        }

        private fun createNotificationChannel(context: Context) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val channel = NotificationChannel(
                    CHANNEL_ID,
                    "VPN connection status",
                    NotificationManager.IMPORTANCE_LOW
                ).apply {
                    description = "Shows when Code Academy VPN Force is actively maintaining a VPN tunnel."
                    setShowBadge(false)
                    lockscreenVisibility = Notification.VISIBILITY_PUBLIC
                }
                context.getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
            }
        }

        private fun appPendingIntent(context: Context): PendingIntent {
            val intent = Intent(context, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            }
            return PendingIntent.getActivity(
                context, 6108, intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
        }

        private fun disconnectPendingIntent(context: Context): PendingIntent {
            val intent = Intent(context, VpnControlService::class.java).setAction(ACTION_DISCONNECT)
            return PendingIntent.getForegroundService(
                context, 6109, intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
        }

        private fun buildNotification(
            context: Context,
            state: String,
            text: String,
            ongoing: Boolean
        ): Notification {
            createNotificationChannel(context)
            val logo = BitmapFactory.decodeResource(context.resources, R.drawable.logo)
            val connected = state == "connected"
            val builder = NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_stat_vpn)
                .setLargeIcon(logo)
                .setContentTitle(if (connected) "Code Academy VPN connected" else "Code Academy VPN Force")
                .setContentText(text)
                .setStyle(NotificationCompat.BigTextStyle().bigText(text))
                .setContentIntent(appPendingIntent(context))
                .setCategory(NotificationCompat.CATEGORY_SERVICE)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setOngoing(ongoing)
                .setOnlyAlertOnce(true)
            if (connected) {
                builder.addAction(R.drawable.ic_stat_vpn, "Disconnect", disconnectPendingIntent(context))
            }
            return builder.build()
        }

        private fun updateNotification(context: Context, notification: Notification?) {
            val manager = NotificationManagerCompat.from(context)
            try {
                if (notification == null) manager.cancel(NOTIFICATION_ID)
                else manager.notify(NOTIFICATION_ID, notification)
            } catch (_: SecurityException) {
                // Android notification permission may be denied; the OS VPN indicator remains separate.
            }
        }

        fun removeConnectionNotification(context: Context) = updateNotification(context, null)
    }
}
