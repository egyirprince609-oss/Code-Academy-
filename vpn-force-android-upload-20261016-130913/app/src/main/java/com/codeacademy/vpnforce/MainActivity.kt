package com.codeacademy.vpnforce

import android.Manifest
import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.VpnService
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.view.View
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.core.app.NotificationManagerCompat
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader

class MainActivity : Activity() {
    private lateinit var webView: WebView

    private val REQ_CONFIG = 701
    private val REQ_VPN_CONSENT = 702
    private val REQ_NOTIFICATIONS = 703
    private var connectAfterImport = false
    private var connectAfterNotificationPrompt = false
    private var checkedAutoConnectThisLaunch = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.statusBarColor = android.graphics.Color.rgb(5, 9, 20)
        window.navigationBarColor = android.graphics.Color.rgb(5, 9, 20)
        window.decorView.systemUiVisibility = 0
        window.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE)

        webView = WebView(this)
        webView.setBackgroundColor(android.graphics.Color.rgb(5, 9, 20))
        webView.isVerticalScrollBarEnabled = false
        webView.isHorizontalScrollBarEnabled = false
        webView.overScrollMode = View.OVER_SCROLL_NEVER
        webView.settings.javaScriptEnabled = true
        webView.settings.domStorageEnabled = true
        webView.settings.allowFileAccess = true
        webView.settings.allowContentAccess = true
        webView.settings.setSupportMultipleWindows(false)
        webView.settings.javaScriptCanOpenWindowsAutomatically = false
        webView.settings.mediaPlaybackRequiresUserGesture = true
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            webView.settings.mixedContentMode = android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW
        }
        android.webkit.CookieManager.getInstance().setAcceptCookie(true)
        android.webkit.CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true)
        webView.webChromeClient = WebChromeClient()
        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                val uri = request?.url ?: return false
                if (isLocalAsset(uri) || isTrustedCodeAcademyUrl(uri)) return false
                return openExternal(uri)
            }

            @Suppress("DEPRECATION")
            override fun shouldOverrideUrlLoading(view: WebView?, url: String?): Boolean {
                val uri = runCatching { Uri.parse(url ?: return false) }.getOrNull() ?: return false
                if (isLocalAsset(uri) || isTrustedCodeAcademyUrl(uri)) return false
                return openExternal(uri)
            }

            override fun onPageStarted(view: WebView?, url: String?, favicon: android.graphics.Bitmap?) {
                if (url?.startsWith(LOCAL_HOME) == true) {
                    webView.addJavascriptInterface(NativeBridge(), "Native")
                } else {
                    webView.removeJavascriptInterface("Native")
                }
                super.onPageStarted(view, url, favicon)
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                if (url?.startsWith(LOCAL_HOME) == true) {
                    webView.addJavascriptInterface(NativeBridge(), "Native")
                    if (!checkedAutoConnectThisLaunch) {
                        checkedAutoConnectThisLaunch = true
                        tryAutoConnectWhenOpened()
                    }
                }
            }
        }
        setContentView(webView)
        loadHome()
    }

    private fun isLocalAsset(uri: Uri): Boolean =
        uri.scheme == "file" && (uri.path ?: "").startsWith("/android_asset/")

    private fun isTrustedCodeAcademyUrl(uri: Uri): Boolean {
        if (uri.scheme != "https") return false
        val host = uri.host?.lowercase() ?: return false
        return host == "egyirprince609-oss.github.io" ||
            host == "codeacademybywm.firebaseapp.com" ||
            host == "accounts.google.com" || host == "google.com" ||
            host.endsWith(".google.com") || host == "googleapis.com" || host.endsWith(".googleapis.com")
    }

    private fun openExternal(uri: Uri): Boolean {
        return try {
            startActivity(Intent(Intent.ACTION_VIEW, uri))
            true
        } catch (_: ActivityNotFoundException) {
            showToast("No app is available to open this link.")
            true
        }
    }

    private fun loadHome() {
        webView.addJavascriptInterface(NativeBridge(), "Native")
        webView.loadUrl(LOCAL_HOME)
    }

    override fun onBackPressed() {
        val current = webView.url.orEmpty()
        if (current.startsWith("https://egyirprince609-oss.github.io/Code-Academy-/")) {
            if (webView.canGoBack()) webView.goBack() else loadHome()
        } else if (webView.canGoBack()) {
            webView.goBack()
        } else {
            super.onBackPressed()
        }
    }

    private fun tryAutoConnectWhenOpened() {
        if (!VpnRuntime.getAutoConnect(this) || !VpnRuntime.hasSavedProfile(this)) return
        // Auto-connect only after the user has previously approved this app as a VPN.
        if (VpnService.prepare(this) != null) return
        if (VpnRuntime.getStoredState(this) != "connected") VpnControlService.start(this)
    }

    private fun startVpnConnectionRequest() {
        if (!VpnRuntime.hasSavedProfile(this)) {
            connectAfterImport = true
            pickConfig()
            return
        }
        if (Build.VERSION.SDK_INT >= 33 &&
            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            connectAfterNotificationPrompt = true
            requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), REQ_NOTIFICATIONS)
            return
        }
        requestVpnApprovalOrConnect()
    }

    private fun requestVpnApprovalOrConnect() {
        val approval = VpnService.prepare(this)
        if (approval != null) {
            startActivityForResult(approval, REQ_VPN_CONSENT)
        } else {
            VpnControlService.start(this)
        }
    }

    private fun pickConfig() {
        val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = "*/*"
            putExtra(Intent.EXTRA_MIME_TYPES, arrayOf("text/plain", "application/octet-stream", "application/x-wireguard-profile"))
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        try {
            startActivityForResult(intent, REQ_CONFIG)
        } catch (_: ActivityNotFoundException) {
            showToast("No file picker is available on this device.")
        }
    }

    private fun importConfig(uri: Uri) {
        try {
            val input = contentResolver.openInputStream(uri) ?: error("The file could not be opened.")
            val bytes = input.use { stream -> stream.readBytes() }
            require(bytes.isNotEmpty() && bytes.size <= 256 * 1024) { "Choose a valid WireGuard profile under 256 KB." }
            val profile = bytes.toString(Charsets.UTF_8)
            require(profile.contains("[Interface]", ignoreCase = true)) { "This file is not a WireGuard profile." }
            require(profile.contains("[Peer]", ignoreCase = true)) { "The profile must include a [Peer] section." }
            require(profile.contains(Regex("(?im)^\\s*PrivateKey\\s*="))) { "The profile must include an Interface PrivateKey." }
            require(profile.contains(Regex("(?im)^\\s*PublicKey\\s*="))) { "The profile must include a Peer PublicKey." }
            require(profile.contains(Regex("(?im)^\\s*Endpoint\\s*="))) { "The profile needs a VPN server Endpoint." }
            // Parse before saving to catch malformed profile fields; never log or display key material.
            com.wireguard.config.Config.parse(BufferedReader(StringReaderCompat(profile)))
            VpnRuntime.profileFile(this).writeText(profile, Charsets.UTF_8)
            getSharedPreferences("vpn_force_state", Context.MODE_PRIVATE).edit().remove("last_error").apply()
            VpnRuntime.setStoredState(this, "disconnected")
            emitToWeb("VPN profile imported. Keys are stored privately on this device.")
            if (connectAfterImport) {
                connectAfterImport = false
                startVpnConnectionRequest()
            }
        } catch (error: Exception) {
            connectAfterImport = false
            showToast(error.message?.takeIf { it.isNotBlank() } ?: "Could not import this WireGuard profile.")
            emitToWeb("Could not import this profile. Check that it is a valid WireGuard .conf file.")
        }
    }

    @Deprecated("Uses the activity result contract for broad Android compatibility")
    @Suppress("DEPRECATION")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == REQ_CONFIG) {
            if (resultCode == RESULT_OK && data?.data != null) importConfig(data.data!!)
            else {
                connectAfterImport = false
                emitToWeb("Profile import was cancelled.")
            }
        } else if (requestCode == REQ_VPN_CONSENT) {
            if (resultCode == RESULT_OK) {
                VpnControlService.start(this)
            } else {
                emitToWeb("VPN permission was not granted. The device has not been connected.")
            }
        }
    }

    @Deprecated("Uses legacy runtime permission callback for compatibility")
    @Suppress("DEPRECATION")
    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == REQ_NOTIFICATIONS) {
            emitToWeb(if (areNotificationsEnabled()) "Android notifications are enabled." else "Notifications are off. They can be enabled in Android app settings.")
            if (connectAfterNotificationPrompt) {
                connectAfterNotificationPrompt = false
                requestVpnApprovalOrConnect()
            }
        }
    }

    private fun areNotificationsEnabled(): Boolean = NotificationManagerCompat.from(this).areNotificationsEnabled()

    private fun openAppNotificationSettings() {
        try {
            val intent = if (Build.VERSION.SDK_INT >= 26) {
                Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, packageName)
            } else {
                Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$packageName"))
            }
            startActivity(intent)
        } catch (_: Exception) {
            showToast("Open Android Settings and manage notifications for Code Academy VPN Force.")
        }
    }

    private fun openVpnSettings() {
        try {
            startActivity(Intent(Settings.ACTION_VPN_SETTINGS))
        } catch (_: Exception) {
            showToast("Open Android Settings → Network & Internet → VPN.")
        }
    }

    private fun shareApp() {
        val message = "Code Academy VPN Force — a native Android VPN dashboard for user-approved WireGuard connections.\n\n" +
            "• Import a trusted WireGuard .conf profile and connect through its VPN server.\n" +
            "• See the system VPN status and an ongoing Code Academy connection notification while the tunnel is active.\n" +
            "• Manage profile storage, app notifications, reconnect-on-open, and Android kill-switch settings.\n" +
            "• The app does not manufacture signal strength or promise faster internet; performance depends on the mobile/Wi‑Fi network and chosen VPN server. A valid server profile is required.\n\n" +
            "Code Academy — We Learn, We Code, We Succeed."
        val intent = Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_SUBJECT, "Code Academy VPN Force")
            putExtra(Intent.EXTRA_TEXT, message)
        }
        startActivity(Intent.createChooser(intent, "Share Code Academy VPN Force"))
    }

    private fun emitToWeb(message: String) {
        runOnUiThread {
            if (::webView.isInitialized) {
                val escaped = JSONObject.quote(message)
                webView.evaluateJavascript("window.dispatchEvent(new CustomEvent('ca-native-message',{detail:$escaped}));window.dispatchEvent(new Event('ca-refresh'));", null)
            }
        }
    }

    private fun showToast(message: String) = runOnUiThread {
        Toast.makeText(this, message, Toast.LENGTH_LONG).show()
        emitToWeb(message)
    }

    inner class NativeBridge {
        @JavascriptInterface fun connect() = runOnUiThread { startVpnConnectionRequest() }
        @JavascriptInterface fun disconnect() = runOnUiThread {
            VpnControlService.disconnect(this@MainActivity)
            emitToWeb("Disconnect request sent to Android.")
        }
        @JavascriptInterface fun importConfig() = runOnUiThread {
            val state = VpnRuntime.getStoredState(this@MainActivity)
            if (state == "connected" || state == "connecting") emitToWeb("Disconnect the VPN before replacing its profile.")
            else { connectAfterImport = false; pickConfig() }
        }
        @JavascriptInterface fun getStatus(): String {
            var state = VpnRuntime.getStoredState(this@MainActivity)
            // Do not leave a stale "connected" label after Android has dropped the VPN network.
            if (state == "connected" && !hasSystemVpnTransport()) {
                state = "disconnected"
                VpnRuntime.setStoredState(this@MainActivity, state)
            }
            val lastError = getSharedPreferences("vpn_force_state", Context.MODE_PRIVATE).getString("last_error", "") ?: ""
            val json = JSONObject()
                .put("state", state)
                .put("hasConfig", VpnRuntime.hasSavedProfile(this@MainActivity))
                .put("notifications", areNotificationsEnabled())
                .put("killSwitchEnabled", isKillSwitchEnabled())
                .put("lastError", lastError)
            return json.toString()
        }
        @JavascriptInterface fun getNetworkInfo(): String = networkInfo().toString()
        @JavascriptInterface fun requestNotifications(): String {
            return if (areNotificationsEnabled()) "GRANTED" else {
                runOnUiThread {
                    if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                        requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), REQ_NOTIFICATIONS)
                    } else this@MainActivity.openAppNotificationSettings()
                }
                "REQUESTED"
            }
        }
        @JavascriptInterface fun openNotificationSettings() = runOnUiThread { this@MainActivity.openAppNotificationSettings() }
        @JavascriptInterface fun openVpnSettings() = runOnUiThread {
            if (!VpnRuntime.hasSavedProfile(this@MainActivity)) {
                emitToWeb("Import and test a valid VPN profile before enabling Android's kill switch. It can block internet traffic if the VPN is unavailable.")
            } else {
                this@MainActivity.openVpnSettings()
            }
        }
        @JavascriptInterface fun setAutoConnect(enabled: Boolean) { VpnRuntime.setAutoConnect(this@MainActivity, enabled) }
        @JavascriptInterface fun getAutoConnect(): Boolean = VpnRuntime.getAutoConnect(this@MainActivity)
        @JavascriptInterface fun shareApp() = runOnUiThread { this@MainActivity.shareApp() }
        @JavascriptInterface fun removeConfig() = runOnUiThread {
            if (VpnRuntime.getStoredState(this@MainActivity) == "connected" || VpnRuntime.getStoredState(this@MainActivity) == "connecting") {
                emitToWeb("Disconnect the VPN before removing its profile.")
            } else {
                VpnRuntime.profileFile(this@MainActivity).delete()
                getSharedPreferences("vpn_force_state", Context.MODE_PRIVATE).edit().remove("last_error").apply()
                emitToWeb("Saved WireGuard profile removed from this device.")
            }
        }
        @JavascriptInterface fun openAccount() = runOnUiThread {
            // Open the existing account flow in the device browser so Firebase/Google sign-in
            // uses a supported browser context rather than an embedded WebView popup.
            openExternal(Uri.parse(PROFILE_URL))
        }
    }

    private fun isKillSwitchEnabled(): Boolean {
        return try {
            val alwaysOnPackage = Settings.Secure.getString(contentResolver, "always_on_vpn_app")
            val lockdown = Settings.Secure.getInt(contentResolver, "always_on_vpn_lockdown", 0) == 1
            alwaysOnPackage == packageName && lockdown
        } catch (_: Exception) {
            false
        }
    }

    private fun hasSystemVpnTransport(): Boolean {
        val cm = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        return cm.allNetworks.any { network ->
            cm.getNetworkCapabilities(network)?.hasTransport(NetworkCapabilities.TRANSPORT_VPN) == true
        }
    }

    private fun networkInfo(): JSONObject {
        val cm = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val networks = cm.allNetworks.toList()
        val capabilities = networks.asSequence().mapNotNull { network ->
            val cap = cm.getNetworkCapabilities(network) ?: return@mapNotNull null
            if (cap.hasTransport(NetworkCapabilities.TRANSPORT_VPN)) null else cap
        }.firstOrNull { it.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) }
        if (capabilities == null) {
            return JSONObject().put("type", "No network").put("internet", false).put("validated", false)
        }
        val type = when {
            capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> "Wi‑Fi"
            capabilities.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> "Mobile data"
            capabilities.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> "Ethernet"
            capabilities.hasTransport(NetworkCapabilities.TRANSPORT_BLUETOOTH) -> "Bluetooth"
            else -> "Other network"
        }
        val internet = capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
        val validated = capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
        return JSONObject().put("type", type).put("internet", internet).put("validated", validated)
    }

    private fun StringReaderCompat(text: String) = java.io.StringReader(text)

    companion object {
        private const val LOCAL_HOME = "file:///android_asset/index.html"
        private const val PROFILE_URL = "https://egyirprince609-oss.github.io/Code-Academy-/profile.html"
    }
}
