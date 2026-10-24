package com.codeacademy.browser;

import android.Manifest;
import android.app.Activity;
import android.app.role.RoleManager;
import android.app.DownloadManager;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.text.InputType;
import android.view.Gravity;
import android.view.MenuItem;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.view.inputmethod.EditorInfo;
import android.webkit.CookieManager;
import android.webkit.DownloadListener;
import android.webkit.GeolocationPermissions;
import android.webkit.PermissionRequest;
import android.webkit.SafeBrowsingResponse;
import android.webkit.SslErrorHandler;
import android.webkit.URLUtil;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.PopupMenu;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.core.content.ContextCompat;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import androidx.webkit.SafeBrowsingResponseCompat;
import androidx.webkit.WebViewAssetLoader;

import com.google.firebase.FirebaseApp;
import com.google.firebase.messaging.FirebaseMessaging;

import org.json.JSONObject;

import java.io.File;
import java.net.URLDecoder;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.TimeUnit;

/**
 * Native Android WebView shell for Code Academy Browser.
 * The browser workspace stays visible while websites load top-level in a separate WebView,
 * so third-party sites do not have to cooperate with an iframe.
 */
public class MainActivity extends Activity {
    public static final String EXTRA_OPEN_URL = "com.codeacademy.browser.OPEN_URL";
    private static final String APP_BASE = "https://egyirprince609-oss.github.io/Code-Academy-/browser/";
    private static final String REMOTE_BROWSER = APP_BASE + "browser.html?native=1";
    private static final String REMOTE_LAUNCH = APP_BASE + "index.html?source=native";
    private static final String REMOTE_SETTINGS = APP_BASE + "browser-settings.html";
    private static final String ASSET_BROWSER = "https://appassets.androidplatform.net/assets/www/index.html?source=native";
    private static final String ASSET_HOST = "appassets.androidplatform.net";
    private static final String APP_HOST = "egyirprince609-oss.github.io";
    private static final String PREFS = "ca_browser_native";
    private static final int REQUEST_POST_NOTIFICATIONS = 6001;
    private static final int REQUEST_LOCATION = 6002;
    private static final int REQUEST_MEDIA = 6003;
    private static final int REQUEST_FILE = 6004;
    private static final int REQUEST_BROWSER_ROLE = 6005;

    private LinearLayout root;
    private LinearLayout browserBar;
    private EditText addressBox;
    private ProgressBar progress;
    private FrameLayout content;
    private WebView dashboardWebView;
    private WebView siteWebView;
    private TextView siteError;
    private ValueCallback<Uri[]> pendingFileCallback;
    private PermissionRequest pendingMediaRequest;
    private GeolocationPermissions.Callback pendingGeoCallback;
    private String pendingGeoOrigin = "";
    private boolean triedLocalFallback = false;
    private String currentSiteUrl = "";
    private final Handler handler = new Handler(Looper.getMainLooper());

    @Override protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Window window = getWindow();
        window.setStatusBarColor(Color.rgb(16, 20, 25));
        window.setNavigationBarColor(Color.rgb(16, 20, 25));
        window.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
        NativeNotifications.createChannel(this);
        buildShell();
        setupDashboardWebView();
        setupSiteWebView();
        enqueueBackgroundNewsCheck();
        loadDashboard();
        if (getIntent() != null) {
            String openUrl = getIntent().hasExtra(EXTRA_OPEN_URL) ? getIntent().getStringExtra(EXTRA_OPEN_URL) :
                    (getIntent().getData() == null ? null : getIntent().getData().toString());
            if (isHttpUrl(openUrl)) handler.postDelayed(() -> showSite(openUrl, true), 900);
        }
        initializeFirebasePushIfConfigured();
    }

    private void buildShell() {
        root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.rgb(16, 20, 25));
        setContentView(root);

        browserBar = new LinearLayout(this);
        browserBar.setOrientation(LinearLayout.HORIZONTAL);
        browserBar.setGravity(Gravity.CENTER_VERTICAL);
        browserBar.setPadding(dp(4), dp(5), dp(4), dp(5));
        browserBar.setBackgroundColor(Color.rgb(18, 23, 29));
        browserBar.setVisibility(View.GONE);
        root.addView(browserBar, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(54)));

        Button back = toolbarButton("‹", "Go back");
        back.setOnClickListener(v -> navigateBack());
        browserBar.addView(back, new LinearLayout.LayoutParams(dp(34), dp(40)));

        Button home = toolbarButton("⌂", "Return to browser");
        home.setOnClickListener(v -> showDashboardHome());
        browserBar.addView(home, new LinearLayout.LayoutParams(dp(34), dp(40)));

        addressBox = new EditText(this);
        addressBox.setSingleLine(true);
        addressBox.setTextColor(Color.rgb(241, 245, 250));
        addressBox.setHintTextColor(Color.rgb(151, 162, 176));
        addressBox.setHint("Search or enter website address");
        addressBox.setTextSize(13);
        addressBox.setPadding(dp(12), 0, dp(8), 0);
        addressBox.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        addressBox.setImeOptions(EditorInfo.IME_ACTION_GO);
        addressBox.setBackground(roundBackground(Color.rgb(32, 40, 48), dp(24)));
        addressBox.setSelectAllOnFocus(true);
        addressBox.setOnEditorActionListener((v, actionId, event) -> {
            if (actionId == EditorInfo.IME_ACTION_GO || actionId == EditorInfo.IME_ACTION_SEARCH || (event != null && event.getKeyCode() == android.view.KeyEvent.KEYCODE_ENTER)) {
                submitNativeAddress(addressBox.getText().toString()); return true;
            }
            return false;
        });
        LinearLayout.LayoutParams addressParams = new LinearLayout.LayoutParams(0, dp(40), 1f);
        addressParams.setMargins(dp(4), 0, dp(4), 0);
        browserBar.addView(addressBox, addressParams);

        Button go = toolbarButton("↵", "Go or search");
        go.setOnClickListener(v -> submitNativeAddress(addressBox.getText().toString()));
        browserBar.addView(go, new LinearLayout.LayoutParams(dp(34), dp(40)));

        Button more = toolbarButton("⋮", "Browser actions");
        more.setOnClickListener(v -> showBrowserMenu(more));
        browserBar.addView(more, new LinearLayout.LayoutParams(dp(34), dp(40)));

        progress = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progress.setMax(100); progress.setProgress(0); progress.setVisibility(View.GONE);
        root.addView(progress, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(3)));

        content = new FrameLayout(this);
        root.addView(content, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));
        dashboardWebView = new WebView(this);
        siteWebView = new WebView(this);
        siteWebView.setVisibility(View.GONE);
        content.addView(dashboardWebView, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        content.addView(siteWebView, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        siteError = new TextView(this);
        siteError.setTextColor(Color.rgb(238, 243, 248));
        siteError.setTextSize(14);
        siteError.setGravity(Gravity.CENTER);
        siteError.setPadding(dp(26), dp(22), dp(26), dp(22));
        siteError.setBackgroundColor(Color.rgb(16, 20, 25));
        siteError.setVisibility(View.GONE);
        content.addView(siteError, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
    }

    private Button toolbarButton(String label, String description) {
        Button button = new Button(this);
        button.setText(label); button.setTextSize(20); button.setAllCaps(false);
        button.setTextColor(Color.rgb(231, 238, 247)); button.setContentDescription(description);
        button.setPadding(0, 0, 0, 0); button.setMinWidth(0); button.setMinimumWidth(0);
        button.setBackground(roundBackground(Color.TRANSPARENT, dp(18)));
        return button;
    }

    private android.graphics.drawable.GradientDrawable roundBackground(int color, int radius) {
        android.graphics.drawable.GradientDrawable bg = new android.graphics.drawable.GradientDrawable();
        bg.setColor(color); bg.setCornerRadius(radius); return bg;
    }

    private void setupWebSettings(WebView webView) {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setSupportZoom(true);
        settings.setBuiltInZoomControls(true);
        settings.setDisplayZoomControls(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSupportMultipleWindows(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setLoadsImagesAutomatically(true);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) settings.setSafeBrowsingEnabled(true);
        CookieManager.getInstance().setAcceptCookie(true);
    }

    private void setupDashboardWebView() {
        setupWebSettings(dashboardWebView);
        dashboardWebView.addJavascriptInterface(new BrowserBridge(), "CodeAcademyNative");
        WebViewAssetLoader assetLoader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this)).build();
        dashboardWebView.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (ASSET_HOST.equalsIgnoreCase(uri.getHost())) return assetLoader.shouldInterceptRequest(uri);
                return super.shouldInterceptRequest(view, request);
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (isInternalCodeAcademy(uri) || ASSET_HOST.equalsIgnoreCase(uri.getHost())) return false;
                if ("http".equalsIgnoreCase(uri.getScheme()) || "https".equalsIgnoreCase(uri.getScheme())) { showSite(uri.toString(), true); return true; }
                return handleExternalScheme(uri);
            }
            @Override public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                if (isBrowserDashboardUrl(Uri.parse(url))) {
                    view.evaluateJavascript("if(window.CodeAcademyBrowser){window.CodeAcademyBrowser.nativePageStatus('', 'Browser ready');}", null);
                }
            }
            @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                super.onReceivedError(view, request, error);
                if (request.isForMainFrame() && !triedLocalFallback && request.getUrl().toString().startsWith(APP_BASE)) fallbackToBundledBrowser();
            }
            @Override public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse response) {
                super.onReceivedHttpError(view, request, response);
                if (request.isForMainFrame() && response.getStatusCode() >= 400 && !triedLocalFallback && request.getUrl().toString().startsWith(APP_BASE)) fallbackToBundledBrowser();
            }
        });
        dashboardWebView.setWebChromeClient(new WebChromeClient() {
            @Override public void onProgressChanged(WebView view, int newProgress) {
                // The dashboard owns its own animated progress bar; this only applies to native navigation fallback.
            }
            @Override public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
                if (ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
                    ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED) {
                    callback.invoke(origin, true, false);
                } else {
                    pendingGeoOrigin = origin; pendingGeoCallback = callback;
                    requestPermissions(new String[]{Manifest.permission.ACCESS_COARSE_LOCATION, Manifest.permission.ACCESS_FINE_LOCATION}, REQUEST_LOCATION);
                }
            }
            @Override public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> filePathCallback, FileChooserParams fileChooserParams) {
                launchFilePicker(filePathCallback, fileChooserParams); return true;
            }
        });
    }

    private void setupSiteWebView() {
        setupWebSettings(siteWebView);
        siteWebView.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
                if ("https".equals(scheme) || "http".equals(scheme)) return false;
                return handleExternalScheme(uri);
            }
            @Override public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                super.onPageStarted(view, url, favicon);
                currentSiteUrl = url; addressBox.setText(url); siteError.setVisibility(View.GONE);
                progress.setVisibility(View.VISIBLE); progress.setProgress(5); browserBar.setVisibility(View.VISIBLE);
            }
            @Override public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                currentSiteUrl = url; addressBox.setText(url); progress.setProgress(100);
                handler.postDelayed(() -> { if (progress != null) progress.setVisibility(View.GONE); }, 180);
                notifyDashboardOfSite(url, view.getTitle());
            }
            @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                super.onReceivedError(view, request, error);
                if (request.isForMainFrame()) showSiteError("Website loading failed", "Android WebView error " + error.getErrorCode() + ": " + error.getDescription() + "\n\nCheck your connection or the website address, then retry.");
            }
            @Override public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse response) {
                super.onReceivedHttpError(view, request, response);
                if (request.isForMainFrame() && response.getStatusCode() >= 400) showSiteError("Website returned an HTTP error", "HTTP " + response.getStatusCode() + " " + response.getReasonPhrase() + "\n\nThe destination server returned this status. It is not a search result error.");
            }
            @Override public void onReceivedSslError(WebView view, SslErrorHandler handler, android.net.http.SslError error) {
                handler.cancel();
                showSiteError("Secure connection refused", "Android rejected the site's TLS certificate (" + error.getPrimaryError() + "). For your security, this browser will not bypass certificate validation.");
            }
        });
        siteWebView.setWebChromeClient(new WebChromeClient() {
            @Override public void onProgressChanged(WebView view, int newProgress) {
                progress.setVisibility(newProgress >= 100 ? View.GONE : View.VISIBLE);
                progress.setProgress(Math.max(0, Math.min(100, newProgress)));
            }
            @Override public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
                if (ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
                    ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED) {
                    callback.invoke(origin, true, false);
                } else {
                    pendingGeoOrigin = origin; pendingGeoCallback = callback;
                    requestPermissions(new String[]{Manifest.permission.ACCESS_COARSE_LOCATION, Manifest.permission.ACCESS_FINE_LOCATION}, REQUEST_LOCATION);
                }
            }
            @Override public void onPermissionRequest(PermissionRequest request) {
                runOnUiThread(() -> {
                    List<String> needed = new ArrayList<>();
                    for (String resource : request.getResources()) {
                        if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resource) && ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) needed.add(Manifest.permission.CAMERA);
                        if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource) && ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) needed.add(Manifest.permission.RECORD_AUDIO);
                    }
                    if (needed.isEmpty()) request.grant(request.getResources());
                    else { pendingMediaRequest = request; requestPermissions(needed.toArray(new String[0]), REQUEST_MEDIA); }
                });
            }
            @Override public void onPermissionRequestCanceled(PermissionRequest request) {
                if (pendingMediaRequest == request) pendingMediaRequest = null;
            }
            @Override public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> filePathCallback, FileChooserParams fileChooserParams) {
                launchFilePicker(filePathCallback, fileChooserParams); return true;
            }
        });
        siteWebView.setDownloadListener((url, userAgent, contentDisposition, mimeType, contentLength) -> downloadUrl(url, userAgent, contentDisposition, mimeType));
    }

    private void loadDashboard() {
        triedLocalFallback = false;
        dashboardWebView.loadUrl(REMOTE_LAUNCH);
        handler.postDelayed(() -> {
            if (!triedLocalFallback && dashboardWebView.getUrl() != null && dashboardWebView.getUrl().startsWith(APP_BASE) && dashboardWebView.getProgress() < 5) fallbackToBundledBrowser();
        }, 11000);
    }

    private void fallbackToBundledBrowser() {
        if (triedLocalFallback) return;
        triedLocalFallback = true;
        Toast.makeText(this, "Opening the bundled browser workspace for offline access.", Toast.LENGTH_LONG).show();
        dashboardWebView.loadUrl(ASSET_BROWSER);
    }

    private boolean isInternalCodeAcademy(Uri uri) {
        if (uri == null || !"https".equalsIgnoreCase(uri.getScheme())) return false;
        if (!APP_HOST.equalsIgnoreCase(uri.getHost())) return false;
        String path = uri.getPath() == null ? "" : uri.getPath();
        return path.startsWith("/Code-Academy-/");
    }

    private boolean isBrowserDashboardUrl(Uri uri) {
        if (uri == null) return false;
        String path = uri.getPath() == null ? "" : uri.getPath();
        boolean hostOk = ASSET_HOST.equalsIgnoreCase(uri.getHost()) || isInternalCodeAcademy(uri);
        return hostOk && (path.endsWith("/browser.html") || path.endsWith("/browser-settings.html"));
    }

    private boolean handleExternalScheme(Uri uri) {
        if (uri == null || uri.getScheme() == null) return true;
        String scheme = uri.getScheme().toLowerCase(Locale.ROOT);
        if (!(scheme.equals("mailto") || scheme.equals("tel") || scheme.equals("sms") || scheme.equals("geo"))) {
            Toast.makeText(this, "Blocked unsupported link scheme: " + scheme, Toast.LENGTH_SHORT).show(); return true;
        }
        try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); }
        catch (ActivityNotFoundException ex) { Toast.makeText(this, "No app can open this link.", Toast.LENGTH_SHORT).show(); }
        return true;
    }

    private boolean isHttpUrl(String raw) {
        try {
            Uri uri = Uri.parse(raw == null ? "" : raw.trim());
            return ("https".equalsIgnoreCase(uri.getScheme()) || "http".equalsIgnoreCase(uri.getScheme())) && uri.getHost() != null && uri.getUserInfo() == null;
        } catch (Exception ex) { return false; }
    }

    private String normalizeHttpUrl(String raw) {
        if (raw == null) return null;
        String value = raw.trim();
        if (value.isEmpty()) return null;
        if (!value.matches("(?i)^https?://.*")) value = "https://" + value;
        try {
            Uri uri = Uri.parse(value);
            if (uri.getHost() == null || uri.getUserInfo() != null) return null;
            String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
            if (!scheme.equals("http") && !scheme.equals("https")) return null;
            // Explicit HTTP addresses remain usable like other browsers; pages opened without a scheme default to HTTPS.
            return uri.toString();
        } catch (Exception ex) { return null; }
    }

    private void showSite(String rawUrl, boolean normalize) {
        String url = normalize ? normalizeHttpUrl(rawUrl) : rawUrl;
        if (!isHttpUrl(url)) {
            showSiteError("Invalid website address", "Only valid HTTP or HTTPS URLs are allowed. Try a domain such as example.com or a search phrase in the address field."); return;
        }
        currentSiteUrl = url;
        browserBar.setVisibility(View.VISIBLE);
        addressBox.setText(url);
        siteError.setVisibility(View.GONE);
        dashboardWebView.setVisibility(View.GONE);
        siteWebView.setVisibility(View.VISIBLE);
        progress.setVisibility(View.VISIBLE); progress.setProgress(3);
        siteWebView.loadUrl(url);
    }

    private void showSiteError(String title, String detail) {
        runOnUiThread(() -> {
            siteError.setText(title + "\n\n" + detail + "\n\nTap ⋮ → Refresh to try again.");
            siteError.setVisibility(View.VISIBLE);
            progress.setVisibility(View.GONE);
        });
    }

    private void notifyDashboardOfSite(String url, String title) {
        String js = "if(window.CodeAcademyBrowser){window.CodeAcademyBrowser.nativePageStatus(" + JSONObject.quote(url) + "," + JSONObject.quote(title == null ? "Website open" : title) + ");}";
        dashboardWebView.evaluateJavascript(js, null);
    }

    private void submitNativeAddress(String raw) {
        String input = raw == null ? "" : raw.trim();
        if (input.isEmpty()) return;
        addressBox.clearFocus();
        try {
            String dashboardUrl = dashboardWebView.getUrl() == null ? "" : dashboardWebView.getUrl();
            boolean pageReady = dashboardUrl.contains("browser.html") && !dashboardUrl.contains("browser-settings.html");
            if (pageReady) {
                String js = "if(window.CodeAcademyBrowser){window.CodeAcademyBrowser.submitAddress(" + JSONObject.quote(input) + ");}else{location.href=" + JSONObject.quote(REMOTE_BROWSER + "?q=" + Uri.encode(input)) + ";}";
                dashboardWebView.setVisibility(View.VISIBLE); siteWebView.setVisibility(View.GONE); siteError.setVisibility(View.GONE); browserBar.setVisibility(View.GONE); progress.setVisibility(View.GONE);
                dashboardWebView.evaluateJavascript(js, null);
            } else if (looksLikeUrl(input)) {
                showSite(input, true);
            } else {
                String url = REMOTE_BROWSER.replace("?native=1", "") + "?native=1&q=" + Uri.encode(input);
                triedLocalFallback = false;
                dashboardWebView.setVisibility(View.VISIBLE); siteWebView.setVisibility(View.GONE); browserBar.setVisibility(View.GONE);
                dashboardWebView.loadUrl(url);
            }
        } catch (Exception error) {
            showSiteError("Could not open address", error.getClass().getSimpleName() + ": " + error.getMessage());
        }
    }

    private boolean looksLikeUrl(String raw) {
        if (raw.contains(" ")) return false;
        if (raw.matches("(?i)^https?://.*")) return true;
        return raw.matches("(?i)^[a-z0-9-]+(\\.[a-z0-9-]+)+(?:/.*)?$");
    }

    private void showDashboardHome() {
        siteWebView.setVisibility(View.GONE); siteError.setVisibility(View.GONE); dashboardWebView.setVisibility(View.VISIBLE);
        browserBar.setVisibility(View.GONE); progress.setVisibility(View.GONE); currentSiteUrl = "";
        String url = dashboardWebView.getUrl() == null ? "" : dashboardWebView.getUrl();
        if (url.contains("browser.html") && !url.contains("browser-settings.html")) {
            dashboardWebView.evaluateJavascript("if(window.CodeAcademyBrowser){window.CodeAcademyBrowser.returnToHome();}", null);
        } else dashboardWebView.loadUrl(REMOTE_BROWSER);
    }

    private void showDashboardWithCommand(String command) {
        siteWebView.setVisibility(View.GONE); siteError.setVisibility(View.GONE); dashboardWebView.setVisibility(View.VISIBLE);
        browserBar.setVisibility(View.GONE); progress.setVisibility(View.GONE);
        String url = dashboardWebView.getUrl() == null ? "" : dashboardWebView.getUrl();
        if (url.contains("browser.html") && !url.contains("browser-settings.html")) dashboardWebView.evaluateJavascript(command, null);
        else dashboardWebView.loadUrl(REMOTE_BROWSER);
    }

    private void showSettings() {
        siteWebView.setVisibility(View.GONE); siteError.setVisibility(View.GONE); dashboardWebView.setVisibility(View.VISIBLE);
        browserBar.setVisibility(View.GONE); progress.setVisibility(View.GONE);
        dashboardWebView.loadUrl(REMOTE_SETTINGS);
    }

    private void navigateBack() {
        if (siteWebView.getVisibility() == View.VISIBLE) {
            if (siteWebView.canGoBack()) siteWebView.goBack(); else showDashboardHome();
        } else if (dashboardWebView.canGoBack()) dashboardWebView.goBack();
        else showDashboardHome();
    }

    private void refreshCurrent() {
        if (siteWebView.getVisibility() == View.VISIBLE) {
            siteError.setVisibility(View.GONE); siteWebView.reload();
        } else dashboardWebView.evaluateJavascript("if(window.CodeAcademyBrowser){window.CodeAcademyBrowser.refresh();}else{location.reload();}", null);
    }

    private void showBrowserMenu(View anchor) {
        PopupMenu menu = new PopupMenu(this, anchor);
        menu.getMenu().add(0, 1, 0, "Refresh page");
        menu.getMenu().add(0, 2, 1, "New tab / tabs");
        menu.getMenu().add(0, 3, 2, "Browser settings");
        menu.getMenu().add(0, 4, 3, "Share current site");
        menu.getMenu().add(0, 5, 4, "Copy link");
        menu.getMenu().add(0, 6, 5, "Open in external browser");
        menu.setOnMenuItemClickListener((MenuItem item) -> {
            switch (item.getItemId()) {
                case 1: refreshCurrent(); return true;
                case 2: showDashboardWithCommand("if(window.CodeAcademyBrowser){window.CodeAcademyBrowser.openTabSwitcher();}"); return true;
                case 3: showSettings(); return true;
                case 4: shareCurrentSite(); return true;
                case 5: copyCurrentLink(); return true;
                case 6: openCurrentExternal(); return true;
                default: return false;
            }
        });
        menu.show();
    }

    private void shareCurrentSite() {
        String url = currentSiteUrl;
        if (url == null || url.isEmpty()) url = dashboardWebView.getUrl() == null ? APP_BASE : dashboardWebView.getUrl();
        Intent send = new Intent(Intent.ACTION_SEND); send.setType("text/plain");
        send.putExtra(Intent.EXTRA_SUBJECT, "Shared with Code Academy Browser");
        send.putExtra(Intent.EXTRA_TEXT, "View this page with Code Academy Browser. Fast search, live news, tabs and privacy tools in one workspace.\n" + url);
        startActivity(Intent.createChooser(send, "Share current site"));
    }

    private void copyCurrentLink() {
        String url = currentSiteUrl;
        if (url == null || url.isEmpty()) url = dashboardWebView.getUrl() == null ? APP_BASE : dashboardWebView.getUrl();
        android.content.ClipboardManager clipboard = (android.content.ClipboardManager) getSystemService(CLIPBOARD_SERVICE);
        clipboard.setPrimaryClip(ClipData.newPlainText("Code Academy Browser link", url));
        Toast.makeText(this, "Link copied.", Toast.LENGTH_SHORT).show();
    }

    private void openCurrentExternal() {
        String url = currentSiteUrl;
        if (!isHttpUrl(url)) { Toast.makeText(this, "No valid website is open.", Toast.LENGTH_SHORT).show(); return; }
        try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url))); }
        catch (ActivityNotFoundException error) { Toast.makeText(this, "No external browser is installed.", Toast.LENGTH_SHORT).show(); }
    }

    private void downloadUrl(String rawUrl, String userAgent, String contentDisposition, String mimeType) {
        if (!isHttpUrl(rawUrl)) { Toast.makeText(this, "Blocked download with an invalid or unsafe URL.", Toast.LENGTH_LONG).show(); return; }
        try {
            String fileName = URLUtil.guessFileName(rawUrl, contentDisposition, mimeType);
            DownloadManager.Request request = new DownloadManager.Request(Uri.parse(rawUrl));
            request.setTitle(fileName); request.setDescription("Download from Code Academy Browser");
            request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, fileName);
            request.setAllowedOverMetered(true); request.setAllowedOverRoaming(false);
            if (userAgent != null) request.addRequestHeader("User-Agent", userAgent);
            if (mimeType != null) request.setMimeType(mimeType);
            DownloadManager manager = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
            manager.enqueue(request);
            Toast.makeText(this, "Download started: " + fileName, Toast.LENGTH_LONG).show();
        } catch (Exception error) {
            Toast.makeText(this, "Download failed: " + error.getClass().getSimpleName() + ": " + error.getMessage(), Toast.LENGTH_LONG).show();
        }
    }

    private void launchFilePicker(ValueCallback<Uri[]> callback, WebChromeClient.FileChooserParams params) {
        if (pendingFileCallback != null) pendingFileCallback.onReceiveValue(null);
        pendingFileCallback = callback;
        try {
            Intent intent = params != null ? params.createIntent() : new Intent(Intent.ACTION_GET_CONTENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            if (intent.getType() == null) intent.setType("*/*");
            startActivityForResult(intent, REQUEST_FILE);
        } catch (Exception exception) {
            pendingFileCallback = null; callback.onReceiveValue(null);
            Toast.makeText(this, "Could not open file picker.", Toast.LENGTH_SHORT).show();
        }
    }

    private void enqueueBackgroundNewsCheck() {
        Constraints constraints = new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build();
        PeriodicWorkRequest request = new PeriodicWorkRequest.Builder(NewsRefreshWorker.class, 30, TimeUnit.MINUTES)
                .setConstraints(constraints).build();
        WorkManager.getInstance(this).enqueueUniquePeriodicWork("ca-browser-live-news", ExistingPeriodicWorkPolicy.KEEP, request);
    }

    private void initializeFirebasePushIfConfigured() {
        try {
            if (FirebaseApp.getApps(this).isEmpty()) return; // Add app/google-services.json to enable actual FCM.
            FirebaseMessaging.getInstance().subscribeToTopic("code-academy-browser");
            FirebaseMessaging.getInstance().getToken().addOnSuccessListener(token -> getSharedPreferences(PREFS, MODE_PRIVATE).edit().putString("fcm_token", token).apply());
        } catch (Exception error) {
            android.util.Log.i("CodeAcademyBrowser", "Remote push not configured yet; background RSS notifications remain available.", error);
        }
    }

    private void requestAndroidNotificationPermission() {
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, REQUEST_POST_NOTIFICATIONS);
        } else {
            evaluateSettingsPermissionResult(NativeNotifications.canNotify(this) ? "granted" : "denied");
        }
    }

    private void evaluateSettingsPermissionResult(String result) {
        if (dashboardWebView == null) return;
        dashboardWebView.evaluateJavascript("if(window.CodeAcademySettings){window.CodeAcademySettings.onNativeNotificationPermission(" + JSONObject.quote(result) + ");}", null);
    }

    @Override public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions, @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        boolean granted = grantResults.length > 0;
        for (int result : grantResults) granted &= result == PackageManager.PERMISSION_GRANTED;
        if (requestCode == REQUEST_POST_NOTIFICATIONS) evaluateSettingsPermissionResult(granted || NativeNotifications.canNotify(this) ? "granted" : "denied");
        else if (requestCode == REQUEST_LOCATION && pendingGeoCallback != null) {
            pendingGeoCallback.invoke(pendingGeoOrigin, granted, false); pendingGeoCallback = null; pendingGeoOrigin = "";
        } else if (requestCode == REQUEST_MEDIA && pendingMediaRequest != null) {
            PermissionRequest request = pendingMediaRequest; pendingMediaRequest = null;
            if (granted) request.grant(request.getResources()); else request.deny();
        }
    }

    @Override protected void onActivityResult(int requestCode, int resultCode, @Nullable Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQUEST_FILE && pendingFileCallback != null) {
            Uri[] results = null;
            if (resultCode == RESULT_OK && data != null) {
                if (data.getClipData() != null) {
                    ClipData clip = data.getClipData(); results = new Uri[clip.getItemCount()];
                    for (int i = 0; i < clip.getItemCount(); i++) results[i] = clip.getItemAt(i).getUri();
                } else if (data.getData() != null) results = new Uri[]{data.getData()};
            }
            pendingFileCallback.onReceiveValue(results); pendingFileCallback = null;
        }
    }

    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent); setIntent(intent);
        if (intent != null) {
            String url = intent.hasExtra(EXTRA_OPEN_URL) ? intent.getStringExtra(EXTRA_OPEN_URL) :
                    (intent.getData() == null ? null : intent.getData().toString());
            if (isHttpUrl(url)) showSite(url, true);
        }
    }

    @Override public void onBackPressed() {
        if (siteWebView.getVisibility() == View.VISIBLE) {
            if (siteWebView.canGoBack()) siteWebView.goBack(); else showDashboardHome();
        } else if (dashboardWebView.canGoBack()) dashboardWebView.goBack();
        else showDashboardHome();
    }

    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }

    private void showNativeMessage(String message) {
        Toast.makeText(this, message == null ? "Action completed." : message, Toast.LENGTH_LONG).show();
    }

    public final class BrowserBridge {
        @android.webkit.JavascriptInterface public boolean isNativeApp() { return true; }
        @android.webkit.JavascriptInterface public void openUrl(String rawUrl, String title) {
            runOnUiThread(() -> showSite(rawUrl, true));
        }
        @android.webkit.JavascriptInterface public void onNewTabOpened() {
            runOnUiThread(() -> {
                NativeNotifications.show(MainActivity.this, "New browser tab", "A new tab was opened in Code Academy Browser.", null, (int)(System.currentTimeMillis() & 0x7fffffff));
            });
        }
        @android.webkit.JavascriptInterface public void setNotificationsEnabled(boolean enabled) {
            getSharedPreferences(PREFS, MODE_PRIVATE).edit().putBoolean("notificationsEnabled", enabled).apply();
        }
        @android.webkit.JavascriptInterface public void requestNotificationPermission() {
            runOnUiThread(MainActivity.this::requestAndroidNotificationPermission);
        }
        @android.webkit.JavascriptInterface public void clearBrowsingData() {
            runOnUiThread(() -> {
                try {
                    CookieManager cookies = CookieManager.getInstance();
                    cookies.removeAllCookies(removed -> {
                        cookies.flush();
                        if (siteWebView != null) { siteWebView.clearCache(true); siteWebView.clearHistory(); siteWebView.clearFormData(); }
                        if (dashboardWebView != null) { dashboardWebView.clearCache(true); dashboardWebView.clearHistory(); dashboardWebView.clearFormData(); }
                        showNativeMessage("Android WebView cookies and cache were cleared.");
                    });
                } catch (Exception error) {
                    showNativeMessage("Could not clear WebView data: " + error.getClass().getSimpleName() + ": " + error.getMessage());
                }
            });
        }

        @android.webkit.JavascriptInterface public void requestDefaultBrowserRole() {
            runOnUiThread(() -> {
                try {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                        RoleManager roleManager = (RoleManager) getSystemService(ROLE_SERVICE);
                        if (roleManager == null || !roleManager.isRoleAvailable(RoleManager.ROLE_BROWSER)) {
                            showNativeMessage("Android reports that the browser role is unavailable on this device.");
                            return;
                        }
                        if (roleManager.isRoleHeld(RoleManager.ROLE_BROWSER)) {
                            showNativeMessage("Code Academy Browser is already the default browser.");
                            return;
                        }
                        startActivityForResult(roleManager.createRequestRoleIntent(RoleManager.ROLE_BROWSER), REQUEST_BROWSER_ROLE);
                    } else {
                        Intent intent = new Intent(Settings.ACTION_MANAGE_DEFAULT_APPS_SETTINGS);
                        startActivity(intent);
                    }
                } catch (Exception error) {
                    showNativeMessage("Default-browser request failed: " + error.getClass().getSimpleName() + ": " + error.getMessage());
                }
            });
        }
        @android.webkit.JavascriptInterface public void share(String title, String text, String url) {
            runOnUiThread(() -> {
                Intent send = new Intent(Intent.ACTION_SEND); send.setType("text/plain");
                send.putExtra(Intent.EXTRA_SUBJECT, title == null || title.isEmpty() ? "Code Academy Browser" : title);
                send.putExtra(Intent.EXTRA_TEXT, (text == null ? "" : text) + (url == null || url.isEmpty() ? "" : "\n" + url));
                startActivity(Intent.createChooser(send, "Share with"));
            });
        }
    }
}
