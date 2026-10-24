package com.wm.codeacademy.browser;

import android.Manifest;
import android.app.DownloadManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.ClipData;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.net.http.SslError;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.provider.OpenableColumns;
import android.text.InputType;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputMethodManager;
import android.webkit.CookieManager;
import android.webkit.GeolocationPermissions;
import android.webkit.PermissionRequest;
import android.webkit.SslErrorHandler;
import android.webkit.URLUtil;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebStorage;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.HorizontalScrollView;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.SeekBar;
import android.widget.TextView;
import android.widget.Toast;
import androidx.activity.result.ActivityResult;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AlertDialog;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.ContextCompat;
import androidx.webkit.WebSettingsCompat;
import androidx.webkit.WebViewFeature;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Native Chromium/System WebView browser host. Remote sites never receive a native JS bridge. */
public class BrowserActivity extends AppCompatActivity {
    public static final String EXTRA_URL = "browser.initialUrl";
    public static final String EXTRA_PRIVATE = "browser.privateMode";
    public static final String EXTRA_PROFILE_ID = "browser.profileId";
    private static final int BG = Color.rgb(8, 13, 29), PANEL = Color.rgb(17, 25, 47), PANEL2 = Color.rgb(23, 33, 60), TEXT = Color.rgb(239, 244, 255), MUTED = Color.rgb(156, 170, 198), ACCENT = Color.rgb(124, 92, 255), CYAN = Color.rgb(45, 212, 191), WARN = Color.rgb(251, 191, 36), RED = Color.rgb(248, 113, 113);
    private static final int MAX_LIVE_WEBVIEWS = 3, MAX_TABS = 12;
    private static boolean webViewSuffixConfigured = false;
    private static BrowserActivity activeNormalActivity;
    protected boolean privateMode = false;
    private BrowserStore store;
    private String profileId = "device";
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private final Handler main = new Handler(Looper.getMainLooper());
    private LinearLayout root, toolbar, header, bottomBar;
    private FrameLayout content, webHost, homePanel, errorPanel;
    private LinearLayout homeRecentSites;
    private EditText address;
    private TextView addressState, titleView, errorTitle, errorMessage;
    private Button tabsNavButton, tryHttpButton;
    private ProgressBar progress;
    private Button reloadButton, backButton, forwardButton;
    private final ArrayList<Tab> tabs = new ArrayList<>();
    private final ArrayList<TabRecord> recentlyClosed = new ArrayList<>();
    private Tab activeTab;
    private boolean loading = false, destroyed = false, sslFailure = false, desktopMode = false, jsEnabled = true, historyEnabled = true, previewsEnabled = true, darkChrome = true, historySyncOptIn = false;
    private int textZoom = 100;
    private String searchProvider = "google", currentErrorUrl = "";
    private Metadata lastMetadata = new Metadata();
    private ValueCallback<Uri[]> pendingFileCallback;
    private PermissionRequest pendingWebPermission;
    private PendingGeo pendingGeo;
    private String pendingPermissionOrigin = "";
    private boolean waitingForPermissionResult = false;
    private final Set<String> sessionSiteGrants = new HashSet<>();
    private final ActivityResultLauncher<Intent> fileChooserLauncher = registerForActivityResult(new ActivityResultContracts.StartActivityForResult(), this::onFileChooserResult);
    private final ActivityResultLauncher<String[]> runtimePermissionsLauncher = registerForActivityResult(new ActivityResultContracts.RequestMultiplePermissions(), result -> onRuntimePermissionsResult(result));
    private final BroadcastReceiver downloadReceiver = new BroadcastReceiver() {
        @Override public void onReceive(Context context, Intent intent) { if (DownloadManager.ACTION_DOWNLOAD_COMPLETE.equals(intent.getAction())) refreshDownloadStatuses(); }
    };

    protected synchronized void configureWebViewProcess() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P && !webViewSuffixConfigured) {
            // Each Activity class is launched in its own declared process; set its suffix once only.
            WebView.setDataDirectorySuffix(privateMode ? "codeacademy_private" : "codeacademy_browser");
            webViewSuffixConfigured = true;
        }
    }
    @Override public void onCreate(Bundle state) {
        privateMode = getIntent().getBooleanExtra(EXTRA_PRIVATE, false) || privateMode;
        profileId = safeProfileId(getIntent().getStringExtra(EXTRA_PROFILE_ID));
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) {
            super.onCreate(state);
            new AlertDialog.Builder(this).setTitle("Browser profile isolation unavailable").setMessage("This Android version cannot safely isolate this browser WebView from Code Academy's app profile. Open sites in the system browser instead.").setPositiveButton("Open system browser", (d,w) -> openSystemBrowser(getIntent().getStringExtra(EXTRA_URL))).setNegativeButton("Close", (d,w) -> finish()).show();
            return;
        }
        configureWebViewProcess();
        super.onCreate(state);
        getWindow().setStatusBarColor(BG); getWindow().setNavigationBarColor(BG); getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
        if (privateMode) { jsEnabled = true; historyEnabled = false; previewsEnabled = false; }
        else {
            if(activeNormalActivity!=null && activeNormalActivity!=this && !activeNormalActivity.profileId.equals(profileId)) activeNormalActivity.finish();
            activeNormalActivity=this;
            store = new BrowserStore(getApplicationContext(), profileId);
        }
        setContentView(buildUi());
        IntentFilter filter = new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE);
        if (Build.VERSION.SDK_INT >= 33) registerReceiver(downloadReceiver, filter, Context.RECEIVER_NOT_EXPORTED); else registerReceiver(downloadReceiver, filter);
        String initialUrl = getIntent().getStringExtra(EXTRA_URL);
        if (privateMode) beginPrivateSession(initialUrl);
        else prepareNormalProfileAndLoad(initialUrl);
    }
    private void prepareNormalProfileAndLoad(String initialUrl) {
        // WebView cookies/local storage are device-local, not Firebase data. On a Code Academy account/profile
        // switch, clear them before any website is opened so the previous account's website sessions cannot
        // appear in the newly selected local profile. The same profile retains its site sessions across launches.
        android.content.SharedPreferences p=getSharedPreferences("browser_web_profile_selection",MODE_PRIVATE);
        String previous=p.getString("profileId","");
        if(previous.equals(profileId)){loadSettingsAsync(initialUrl);return;}
        try {
            CookieManager.getInstance().removeAllCookies(ok -> main.post(() -> {
                if(destroyed)return;
                try { WebStorage.getInstance().deleteAllData(); CookieManager.getInstance().flush(); WebView temporary=new WebView(BrowserActivity.this); temporary.clearCache(true); temporary.destroy(); } catch(Exception ignored) {}
                p.edit().putString("profileId",profileId).apply();
                loadSettingsAsync(initialUrl);
            }));
        } catch(Exception e) {
            // Fail closed for the account transition: do not load a site if site-data clearing could not begin.
            new AlertDialog.Builder(this).setTitle("Browser profile could not be prepared")
                .setMessage("Code Academy could not safely switch the website-data profile. Close the browser and try again.")
                .setPositiveButton("Close",(d,w)->finish()).show();
        }
    }

    private void loadSettingsAsync(String initialUrl) {
        io.execute(() -> {
            String provider=store.getSetting("searchProvider","google");
            boolean javascript="true".equalsIgnoreCase(store.getSetting("javascriptEnabled","true"));
            boolean desktop="true".equalsIgnoreCase(store.getSetting("desktopMode","false"));
            boolean history="true".equalsIgnoreCase(store.getSetting("historyEnabled","true"));
            boolean previews="true".equalsIgnoreCase(store.getSetting("previewsEnabled","true"));
            boolean dark="true".equalsIgnoreCase(store.getSetting("darkChrome","true"));
            boolean historySync="true".equalsIgnoreCase(store.getSetting("historySyncOptIn","false"));
            int zoom=100;try{zoom=Math.max(75,Math.min(150,Integer.parseInt(store.getSetting("textZoom","100"))));}catch(Exception ignored){}
            final int loadedZoom=zoom;
            main.post(() -> {
                searchProvider=provider;jsEnabled=javascript;desktopMode=desktop;historyEnabled=history;previewsEnabled=previews;darkChrome=dark;historySyncOptIn=history;textZoom=loadedZoom;applyTheme();refreshRecentSites();
                if(initialUrl!=null&&!initialUrl.trim().isEmpty()){restoreSession();createTab(initialUrl,true);}else{restoreSession();if(activeTab==null)createTab(null,true);}
                if(getIntent().getBooleanExtra("browser.openSettings",false))main.postDelayed(this::showSettings,450);
                refreshNavButtons();refreshTabCount();
            });
        });
    }
    private void beginPrivateSession(String initialUrl){
        // Clear the private process' isolated WebView profile before it can load any site.
        try { CookieManager.getInstance().removeAllCookies(ok -> main.post(() -> { if(destroyed)return;WebStorage.getInstance().deleteAllData();CookieManager.getInstance().flush();createTab(initialUrl,true);if(getIntent().getBooleanExtra("browser.openSettings",false))main.postDelayed(this::showSettings,450); })); }
        catch(Exception e){WebStorage.getInstance().deleteAllData();createTab(initialUrl,true);}
    }
    private void saveSetting(String key, Object value) { if (!privateMode && store != null) io.execute(() -> { try { store.setSetting(key, String.valueOf(value)); } catch (Exception ignored) {} }); }

    private View buildUi() {
        root = new LinearLayout(this); root.setOrientation(LinearLayout.VERTICAL); root.setBackgroundColor(darkChrome ? BG : Color.rgb(244,247,255));
        header = new LinearLayout(this); header.setGravity(Gravity.CENTER_VERTICAL); header.setPadding(dp(14),dp(10),dp(12),dp(8));
        TextView mark = new TextView(this); mark.setText("CA"); mark.setTextColor(Color.WHITE); mark.setTextSize(15); mark.setTypeface(Typeface.DEFAULT_BOLD); mark.setGravity(Gravity.CENTER); mark.setBackground(round(ACCENT, dp(14))); LinearLayout.LayoutParams mp=new LinearLayout.LayoutParams(dp(42),dp(42)); mp.rightMargin=dp(10); header.addView(mark,mp);
        LinearLayout brand=new LinearLayout(this);brand.setOrientation(LinearLayout.VERTICAL); TextView b=new TextView(this);b.setText("Code Academy");b.setTextColor(darkChrome?TEXT:Color.rgb(17,24,39));b.setTextSize(16);b.setTypeface(Typeface.DEFAULT_BOLD); TextView sub=new TextView(this);sub.setText(privateMode?"Browser · Temporary private profile":"Browser · Real WebView engine");sub.setTextColor(MUTED);sub.setTextSize(11);brand.addView(b);brand.addView(sub);header.addView(brand,new LinearLayout.LayoutParams(0,ViewGroup.LayoutParams.WRAP_CONTENT,1));
        Button close=button("←", PANEL2); close.setContentDescription("Return to Code Academy"); header.addView(close,buttonParams());close.setOnClickListener(v -> finish()); root.addView(header);
        LinearLayout urlCard=new LinearLayout(this);urlCard.setOrientation(LinearLayout.HORIZONTAL);urlCard.setGravity(Gravity.CENTER_VERTICAL);urlCard.setPadding(dp(8),dp(5),dp(5),dp(5));urlCard.setBackground(round(darkChrome?PANEL:Color.WHITE,dp(18)));LinearLayout.LayoutParams ucp=new LinearLayout.LayoutParams(-1,-2);ucp.setMargins(dp(12),dp(2),dp(12),dp(6));root.addView(urlCard,ucp);
        addressState=new TextView(this);addressState.setText("⌕");addressState.setTextSize(18);addressState.setGravity(Gravity.CENTER);addressState.setTextColor(CYAN);urlCard.addView(addressState,new LinearLayout.LayoutParams(dp(32),dp(42)));
        address=new EditText(this);address.setSingleLine(true);address.setTextSize(14);address.setTextColor(darkChrome?TEXT:Color.rgb(17,24,39));address.setHintTextColor(MUTED);address.setHint("Search or enter website");address.setBackgroundColor(Color.TRANSPARENT);address.setPadding(dp(4),0,dp(4),0);address.setInputType(InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_VARIATION_URI);address.setImeOptions(EditorInfo.IME_ACTION_GO);urlCard.addView(address,new LinearLayout.LayoutParams(0,dp(42),1));
        Button go=button("Go",ACCENT);urlCard.addView(go,buttonParams());go.setOnClickListener(v -> submitAddress());address.setOnEditorActionListener((v,action,event)->{if(action==EditorInfo.IME_ACTION_GO||(event!=null&&event.getKeyCode()==KeyEvent.KEYCODE_ENTER)){submitAddress();return true;}return false;});
        LinearLayout actionRow=new LinearLayout(this);actionRow.setGravity(Gravity.CENTER_VERTICAL);actionRow.setPadding(dp(12),0,dp(12),dp(7));
        reloadButton=button("↻",PANEL2); actionRow.addView(reloadButton,smallButtonParams()); reloadButton.setOnClickListener(v->{if(activeTab==null)return;if(loading&&activeTab.web!=null){activeTab.web.stopLoading();loading=false;setProgress(0,false);}else if(activeTab.web!=null)activeTab.web.reload();else navigateActive(activeTab.url);});
        Button info=button("ⓘ Site info",PANEL2);LinearLayout.LayoutParams ip=new LinearLayout.LayoutParams(0,dp(38),1);ip.setMargins(dp(6),0,dp(6),0);actionRow.addView(info,ip);info.setOnClickListener(v->showSiteInfo());
        Button star=button("☆ Save",PANEL2);actionRow.addView(star,smallButtonParams());star.setOnClickListener(v->bookmarkCurrent());root.addView(actionRow);
        progress=new ProgressBar(this,null,android.R.attr.progressBarStyleHorizontal);progress.setMax(100);progress.setProgress(0);progress.setVisibility(View.GONE);progress.setProgressTintList(android.content.res.ColorStateList.valueOf(CYAN));root.addView(progress,new LinearLayout.LayoutParams(-1,dp(3)));
        content=new FrameLayout(this);LinearLayout.LayoutParams cp=new LinearLayout.LayoutParams(-1,0,1);cp.setMargins(dp(8),dp(2),dp(8),dp(4));root.addView(content,cp);
        webHost=new FrameLayout(this);webHost.setBackground(round(Color.WHITE,dp(17)));content.addView(webHost,new FrameLayout.LayoutParams(-1,-1));
        homePanel=buildHomePanel();content.addView(homePanel,new FrameLayout.LayoutParams(-1,-1));
        errorPanel=buildErrorPanel();content.addView(errorPanel,new FrameLayout.LayoutParams(-1,-1));errorPanel.setVisibility(View.GONE);
        bottomBar=new LinearLayout(this);bottomBar.setGravity(Gravity.CENTER);bottomBar.setPadding(dp(5),dp(4),dp(5),dp(6));bottomBar.setBackgroundColor(darkChrome?BG:Color.rgb(244,247,255));
        backButton=navButton("‹","Back");bottomBar.addView(backButton,navParams());backButton.setOnClickListener(v->goBack());
        forwardButton=navButton("›","Forward");bottomBar.addView(forwardButton,navParams());forwardButton.setOnClickListener(v->goForward());
        Button home=navButton("⌂","New tab");bottomBar.addView(home,navParams());home.setOnClickListener(v->createTab(null,true));
        tabsNavButton=navButton("▢\n0","Tabs");bottomBar.addView(tabsNavButton,navParams());tabsNavButton.setContentDescription("Open tab switcher");tabsNavButton.setOnClickListener(v->showTabSwitcher());
        Button bookmarksButton=navButton("☆","Saved");bottomBar.addView(bookmarksButton,navParams());bookmarksButton.setOnClickListener(v->showRecords("bookmarks"));
        Button more=navButton("•••","More");bottomBar.addView(more,navParams());more.setOnClickListener(v->showMoreMenu());root.addView(bottomBar);
        titleView=new TextView(this);titleView.setText(privateMode?"Temporary private profile · not saved in browser history":"On-device browser records");titleView.setTextColor(MUTED);titleView.setTextSize(10);titleView.setGravity(Gravity.CENTER);titleView.setPadding(dp(8),dp(1),dp(8),dp(7));root.addView(titleView);
        applyTheme();return root;
    }
    private FrameLayout buildErrorPanel(){FrameLayout f=new FrameLayout(this);f.setBackground(round(darkChrome?PANEL:Color.WHITE,dp(18)));LinearLayout box=new LinearLayout(this);box.setOrientation(LinearLayout.VERTICAL);box.setGravity(Gravity.CENTER);box.setPadding(dp(28),dp(28),dp(28),dp(28));TextView symbol=new TextView(this);symbol.setText("◎");symbol.setTextSize(44);symbol.setTextColor(RED);symbol.setGravity(Gravity.CENTER);box.addView(symbol);errorTitle=new TextView(this);errorTitle.setText("Could not reach this site");errorTitle.setTextColor(darkChrome?TEXT:Color.BLACK);errorTitle.setTextSize(20);errorTitle.setTypeface(Typeface.DEFAULT_BOLD);errorTitle.setGravity(Gravity.CENTER);LinearLayout.LayoutParams tp=new LinearLayout.LayoutParams(-1,-2);tp.setMargins(0,dp(12),0,dp(8));box.addView(errorTitle,tp);errorMessage=new TextView(this);errorMessage.setText("Check your connection and try again.");errorMessage.setTextColor(MUTED);errorMessage.setGravity(Gravity.CENTER);errorMessage.setTextSize(14);box.addView(errorMessage);Button retry=button("Retry",ACCENT);LinearLayout.LayoutParams rp=new LinearLayout.LayoutParams(-1,dp(44));rp.setMargins(0,dp(20),0,dp(8));box.addView(retry,rp);retry.setOnClickListener(v->{errorPanel.setVisibility(View.GONE);if(activeTab!=null){if(activeTab.web!=null)activeTab.web.reload();else navigateActive(activeTab.url);}});Button search=button("Search instead",PANEL2);box.addView(search,new LinearLayout.LayoutParams(-1,dp(44)));search.setOnClickListener(v->{errorPanel.setVisibility(View.GONE);address.setText(activeTab==null?"":activeTab.url);address.requestFocus();((InputMethodManager)getSystemService(INPUT_METHOD_SERVICE)).showSoftInput(address,InputMethodManager.SHOW_IMPLICIT);});tryHttpButton=button("Try HTTP instead (less secure)",PANEL2);LinearLayout.LayoutParams thp=new LinearLayout.LayoutParams(-1,dp(44));thp.setMargins(0,dp(8),0,0);box.addView(tryHttpButton,thp);tryHttpButton.setVisibility(View.GONE);tryHttpButton.setOnClickListener(v->{if(sslFailure){toast("Certificate errors are never downgraded.");return;}if(activeTab!=null&&activeTab.url.startsWith("https://")){String http=activeTab.url.replaceFirst("^https://","http://");new AlertDialog.Builder(this).setTitle("Try an unencrypted connection?").setMessage("This may expose traffic to network observers. Use only if you understand the risk and the HTTPS site failed for a network reason, not a certificate error.").setNegativeButton("Stay secure",null).setPositiveButton("Try HTTP",(d,w)->navigateActive(http)).show();}});f.addView(box,new FrameLayout.LayoutParams(-1,-1));return f;}
    private FrameLayout buildHomePanel(){
        FrameLayout frame=new FrameLayout(this);frame.setBackground(round(darkChrome?PANEL:Color.WHITE,dp(18)));
        ScrollView scroll=new ScrollView(this);scroll.setFillViewport(true);
        LinearLayout col=new LinearLayout(this);col.setOrientation(LinearLayout.VERTICAL);col.setPadding(dp(22),dp(28),dp(22),dp(28));scroll.addView(col);
        TextView badge=new TextView(this);badge.setText(privateMode?"TEMPORARY SESSION":"YOUR WEB, YOUR WORKSPACE");badge.setTextColor(CYAN);badge.setTextSize(10);badge.setTypeface(Typeface.DEFAULT_BOLD);col.addView(badge);
        TextView hero=new TextView(this);hero.setText(privateMode?"Browse without a saved visit history.":"Explore the web.");hero.setTextColor(darkChrome?TEXT:Color.rgb(17,24,39));hero.setTextSize(27);hero.setTypeface(Typeface.DEFAULT_BOLD);LinearLayout.LayoutParams hp=new LinearLayout.LayoutParams(-1,-2);hp.setMargins(0,dp(8),0,dp(8));col.addView(hero,hp);
        TextView hint=new TextView(this);hint.setText(privateMode?"This session uses a separate Android WebView profile. Closing it clears its cookies, cache and website storage.":"Real websites load directly in Android System WebView. Search or enter a URL above.");hint.setTextColor(MUTED);hint.setTextSize(13);col.addView(hint);
        TextView quick=new TextView(this);quick.setText("QUICK ACCESS  ·  Long-press a shortcut to remove it");quick.setTextColor(MUTED);quick.setTextSize(11);quick.setTypeface(Typeface.DEFAULT_BOLD);LinearLayout.LayoutParams qp=new LinearLayout.LayoutParams(-1,-2);qp.setMargins(0,dp(24),0,dp(9));col.addView(quick,qp);
        String[][] shortcuts={{"Google","https://www.google.com"},{"Wikipedia","https://www.wikipedia.org"},{"YouTube","https://m.youtube.com"},{"GitHub","https://github.com"}};
        Set<String> hiddenShortcuts=new HashSet<>();
        if(!privateMode){String savedHidden=sessionPrefs().getString("hiddenShortcuts","");for(String hidden:savedHidden.split("\\n")){if(!hidden.trim().isEmpty())hiddenShortcuts.add(hidden.trim());}}
        LinearLayout shortcutGrid=new LinearLayout(this);shortcutGrid.setOrientation(LinearLayout.VERTICAL);col.addView(shortcutGrid,new LinearLayout.LayoutParams(-1,-2));
        buildShortcutRows(shortcutGrid,shortcuts,hiddenShortcuts);
        TextView recent=new TextView(this);recent.setText("RECENT SITES");recent.setTextColor(MUTED);recent.setTextSize(11);recent.setTypeface(Typeface.DEFAULT_BOLD);LinearLayout.LayoutParams rlp=new LinearLayout.LayoutParams(-1,-2);rlp.setMargins(0,dp(14),0,dp(8));col.addView(recent,rlp);
        homeRecentSites=new LinearLayout(this);homeRecentSites.setOrientation(LinearLayout.VERTICAL);col.addView(homeRecentSites,new LinearLayout.LayoutParams(-1,-2));TextView recentHint=new TextView(this);recentHint.setText(privateMode?"History is not saved in a temporary private profile.":"Recent websites will appear here after you browse.");recentHint.setTag("recent-empty");recentHint.setTextColor(MUTED);recentHint.setTextSize(12);homeRecentSites.addView(recentHint);
        Button history=button("Open browsing history",PANEL2);LinearLayout.LayoutParams hbp=new LinearLayout.LayoutParams(-1,dp(44));hbp.setMargins(0,dp(12),0,dp(6));col.addView(history,hbp);history.setOnClickListener(v->showRecords("history"));Button downloads=button("Open downloads",PANEL2);col.addView(downloads,new LinearLayout.LayoutParams(-1,dp(44)));downloads.setOnClickListener(v->showRecords("downloads"));frame.addView(scroll,new FrameLayout.LayoutParams(-1,-1));return frame;
    }
    private String joinLines(Set<String> items){StringBuilder out=new StringBuilder();for(String item:items){if(out.length()>0)out.append('\n');out.append(item);}return out.toString();}
    private void buildShortcutRows(LinearLayout shortcutGrid,String[][] shortcuts,Set<String> hidden){
        shortcutGrid.removeAllViews();LinearLayout row=null;int visible=0;
        for(String[] shortcut:shortcuts){String name=shortcut[0],url=shortcut[1];if(hidden.contains(url))continue;if(visible%2==0){row=new LinearLayout(this);shortcutGrid.addView(row);}
            final Button item=button("◈  "+name,PANEL2);item.setContentDescription(name+" shortcut. Long-press to remove.");LinearLayout.LayoutParams bp=new LinearLayout.LayoutParams(0,dp(52),1);bp.setMargins(0,0,dp(8),dp(8));row.addView(item,bp);item.setOnClickListener(v->createTab(url,true));item.setOnLongClickListener(v->{new AlertDialog.Builder(this).setTitle("Remove shortcut?").setMessage("Remove "+name+" from this new-tab page?").setNegativeButton("Cancel",null).setPositiveButton("Remove",(d,w)->{if(!privateMode){hidden.add(url);sessionPrefs().edit().putString("hiddenShortcuts",joinLines(hidden)).apply();}buildShortcutRows(shortcutGrid,shortcuts,hidden);}).show();return true;});visible++;}
        if(visible==0){Button reset=button("Restore quick access shortcuts",PANEL2);shortcutGrid.addView(reset,new LinearLayout.LayoutParams(-1,dp(44)));reset.setOnClickListener(v->{if(!privateMode)sessionPrefs().edit().remove("hiddenShortcuts").apply();buildShortcutRows(shortcutGrid,shortcuts,new HashSet<>());});}
    }
    private void refreshRecentSites(){
        if(privateMode||store==null||homeRecentSites==null)return;
        io.execute(()->{JSONArray visits;try{visits=store.history(5);}catch(Exception e){return;}main.post(()->{
            if(destroyed||homeRecentSites==null)return;homeRecentSites.removeAllViews();
            if(visits==null||visits.length()==0){TextView empty=new TextView(this);empty.setText(historyEnabled?"No recent sites yet. Websites you visit will appear here.":"Visit recording is off. Turn it on in settings to show recent sites.");empty.setTextColor(MUTED);empty.setTextSize(12);homeRecentSites.addView(empty);return;}
            for(int i=0;i<visits.length();i++){JSONObject visit=visits.optJSONObject(i);if(visit==null)continue;String url=visit.optString("url",""),domain=visit.optString("domain",BrowserUrlParser.domain(url)),title=visit.optString("title",domain);if(!BrowserUrlParser.isSafeWebUrl(url))continue;Button site=button(limit(title,70)+"\n"+domain,PANEL2);site.setGravity(Gravity.START|Gravity.CENTER_VERTICAL);site.setMaxLines(2);site.setContentDescription("Open recent site "+domain);LinearLayout.LayoutParams sp=new LinearLayout.LayoutParams(-1,dp(52));sp.setMargins(0,0,0,dp(6));homeRecentSites.addView(site,sp);site.setOnClickListener(v->createTab(url,true));}
        });});
    }
    private void rebuildChrome(){setContentView(buildUi());if(activeTab!=null)activateTab(activeTab);}
    private void applyTheme(){if(root==null)return;root.setBackgroundColor(darkChrome?BG:Color.rgb(244,247,255));}
    private GradientDrawable round(int color,int radius){GradientDrawable d=new GradientDrawable();d.setColor(color);d.setCornerRadius(radius);return d;}
    private int dp(float value){return (int)(getResources().getDisplayMetrics().density*value+0.5f);}
    private Button button(String label,int color){Button b=new Button(this);b.setText(label);b.setTextSize(12);b.setTextColor(TEXT);b.setAllCaps(false);b.setMinHeight(dp(36));b.setMinimumHeight(dp(36));b.setPadding(dp(8),0,dp(8),0);b.setBackground(round(color,dp(13)));b.setStateListAnimator(null);return b;}
    private Button navButton(String icon,String label){Button b=button(icon+"\n"+label,darkChrome?BG:Color.rgb(244,247,255));b.setTextColor(darkChrome?MUTED:Color.rgb(71,85,105));b.setTextSize(10);b.setPadding(0,dp(2),0,dp(2));b.setMinHeight(dp(46));return b;}
    private LinearLayout.LayoutParams buttonParams(){return new LinearLayout.LayoutParams(-2,dp(38));} private LinearLayout.LayoutParams smallButtonParams(){return new LinearLayout.LayoutParams(-2,dp(38));} private LinearLayout.LayoutParams navParams(){return new LinearLayout.LayoutParams(0,dp(48),1);}

    private void submitAddress(){if(address==null)return;String input=address.getText().toString();BrowserUrlParser.Result result=BrowserUrlParser.parse(input,searchProvider);((InputMethodManager)getSystemService(INPUT_METHOD_SERVICE)).hideSoftInputFromWindow(address.getWindowToken(),0);address.clearFocus();if(result.kind==BrowserUrlParser.Kind.INVALID||result.kind==BrowserUrlParser.Kind.BLOCKED){showError(result.message,false,false);return;}if(result.kind==BrowserUrlParser.Kind.EXTERNAL){confirmExternal(result.value);return;}if(activeTab==null)createTab(result.value,true);else navigateActive(result.value);}
    private void navigateActive(String url){sslFailure=false;if(activeTab==null){createTab(url,true);return;}if(!BrowserUrlParser.isSafeWebUrl(url)){showError("Only regular HTTP and HTTPS website addresses can be loaded here.",false,false);return;}activeTab.url=url;activeTab.error=false;hideError();showWebView(activeTab);if(activeTab.web!=null){activeTab.web.loadUrl(url);}else createWebView(activeTab,true);address.setText(url);}
    private void confirmExternal(String raw){String scheme=Uri.parse(raw).getScheme();String label="Open "+scheme+" link outside the browser?\n\n"+raw;new AlertDialog.Builder(this).setTitle("Open external link").setMessage(label).setNegativeButton("Cancel",(d,w)->{}).setPositiveButton("Continue",(d,w)->{try{Intent i=new Intent(Intent.ACTION_VIEW,Uri.parse(raw));if(i.resolveActivity(getPackageManager())==null){toast("No installed app can handle this link.");return;}startActivity(i);}catch(Exception e){toast("This link could not be opened by another app.");}}).show();}
    private void openSystemBrowser(String raw){try{if(BrowserUrlParser.isSafeWebUrl(raw)){startActivity(new Intent(Intent.ACTION_VIEW,Uri.parse(raw)));finish();}else{startActivity(new Intent(Intent.ACTION_VIEW,Uri.parse("https://www.google.com")));finish();}}catch(Exception e){finish();}}

    private static final class Tab {String id=UUID.randomUUID().toString(),url="",title="New tab";WebView web;Bitmap favicon;long lastAccess=System.currentTimeMillis();boolean home=true,error=false;ArrayList<String> urls=new ArrayList<>();int index=-1;}
    private static final class TabRecord {String url,title;TabRecord(String u,String t){url=u;title=t;}}
    private void createTab(String url,boolean focus){if(tabs.size()>=MAX_TABS){toast("Close a tab before opening another. The browser is keeping memory use controlled.");showTabSwitcher();return;}Tab tab=new Tab();tab.home=url==null||url.trim().isEmpty();if(url!=null&&!url.trim().isEmpty()){BrowserUrlParser.Result r=BrowserUrlParser.parse(url,searchProvider);if(r.kind!=BrowserUrlParser.Kind.WEB){if(r.kind==BrowserUrlParser.Kind.EXTERNAL)confirmExternal(r.value);else showError(r.message,false,false);return;}tab.url=r.value;tab.title=BrowserUrlParser.domain(r.value);tab.home=false;tab.urls.add(r.value);tab.index=0;}tabs.add(tab);if(focus)activateTab(tab);if(!privateMode)saveSession();refreshTabCount();}
    private void activateTab(Tab tab){if(tab==null)return;activeTab=tab;tab.lastAccess=System.currentTimeMillis();errorPanel.setVisibility(View.GONE);if(tab.home){webHost.setVisibility(View.GONE);homePanel.setVisibility(View.VISIBLE);address.setText("");address.setHint("Search or enter website");addressState.setText("⌕");titleView.setText("New tab · On-device browser");setProgress(0,false);refreshRecentSites();}else{showWebView(tab);if(tab.web==null)createWebView(tab,true);else{address.setText(tab.url);titleView.setText(tab.title);}}refreshNavButtons();refreshTabCount();if(!privateMode)saveSession();}
    private void showWebView(Tab tab){homePanel.setVisibility(View.GONE);webHost.setVisibility(View.VISIBLE);errorPanel.setVisibility(tab.error?View.VISIBLE:View.GONE);if(tab.web!=null){if(tab.web.getParent()!=null)((ViewGroup)tab.web.getParent()).removeView(tab.web);webHost.removeAllViews();webHost.addView(tab.web,new FrameLayout.LayoutParams(-1,-1));}address.setText(tab.url);addressState.setText(tab.url.startsWith("https://")?"🔒":"ⓘ");titleView.setText(tab.title==null?BrowserUrlParser.domain(tab.url):tab.title);}
    private void createWebView(Tab tab,boolean load){if(tab.web!=null)return;WebView web=new WebView(this);tab.web=web;tab.lastAccess=System.currentTimeMillis();configureWebSettings(web);web.setWebViewClient(new WebViewClient(){
            @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request){if(!request.isForMainFrame())return false;String url=request.getUrl().toString();if(BrowserUrlParser.isSafeWebUrl(url))return false;String scheme=request.getUrl().getScheme();if(scheme!=null&&scheme.matches("(?i)mailto|tel|sms|smsto|geo")){runOnUiThread(()->confirmExternal(url));return true;}return true;}
            @Override public void onPageStarted(WebView view,String url,Bitmap favicon){if(tab==activeTab){loading=true;sslFailure=false;currentErrorUrl=url;address.setText(url);addressState.setText(url.startsWith("https://")?"🔒":"ⓘ");setProgress(8,true);hideError();}tab.url=url;tab.home=false;tab.error=false;tab.lastAccess=System.currentTimeMillis();}
            @Override public void onPageFinished(WebView view,String url){if(!BrowserUrlParser.isSafeWebUrl(url))return;tab.url=url;String t=view.getTitle();if(t!=null&&!t.trim().isEmpty())tab.title=limit(t,240);tab.error=false;if(tab==activeTab){loading=false;setProgress(100,false);hideError();address.setText(url);addressState.setText(url.startsWith("https://")?"🔒":"ⓘ");titleView.setText(tab.title+" · "+BrowserUrlParser.domain(url));refreshNavButtons();extractMetadata(view,tab); }if(!privateMode){String title=tab.title,finalUrl=url;boolean enabled=historyEnabled;io.execute(()->{if(store!=null)store.recordVisit(finalUrl,title,enabled);});saveSession();}tab.lastAccess=System.currentTimeMillis();}
            @Override public void onReceivedError(WebView view,WebResourceRequest request,WebResourceError err){if(!request.isForMainFrame())return;runOnUiThread(()->{tab.error=true;if(tab==activeTab){loading=false;setProgress(0,false);showError("Could not reach this site",true,false);errorMessage.setText("The website connection failed. This does not prove the domain name is nonexistent. Check the network and retry.");}});}
            @Override public void onReceivedHttpError(WebView view,WebResourceRequest request,android.webkit.WebResourceResponse response){/* HTTP 404/500 are website responses, not DNS/network errors. Leave them visible. */}
            @Override public void onReceivedSslError(WebView view,SslErrorHandler handler,SslError error){handler.cancel();runOnUiThread(()->{tab.error=true;if(tab==activeTab){sslFailure=true;loading=false;setProgress(0,false);showError("Secure connection blocked",false,true);errorMessage.setText("Android rejected this site's TLS certificate. Code Academy will not bypass the warning. Check the URL or leave this site.");}});}
            @Override public void onRenderProcessGone(WebView view,android.webkit.RenderProcessGoneDetail detail){runOnUiThread(()->{if(tab.web!=null){webHost.removeView(tab.web);tab.web.destroy();tab.web=null;}tab.error=true;if(tab==activeTab)showError("Page renderer stopped",true,false);});}
        });
        web.setWebChromeClient(new WebChromeClient(){
            @Override public void onProgressChanged(WebView view,int newProgress){if(tab==activeTab){setProgress(newProgress,newProgress<100);reloadButton.setText(newProgress<100?"×":"↻");loading=newProgress<100;}}
            @Override public void onReceivedTitle(WebView view,String title){if(title!=null&&!title.trim().isEmpty()){tab.title=limit(title,240);if(tab==activeTab)titleView.setText(tab.title);}}
            @Override public void onReceivedIcon(WebView view,Bitmap icon){if(icon!=null)tab.favicon=icon;}
            @Override public boolean onShowFileChooser(WebView webView,ValueCallback<Uri[]> callback,FileChooserParams params){if(pendingFileCallback!=null)pendingFileCallback.onReceiveValue(null);pendingFileCallback=callback;Intent intent=new Intent(Intent.ACTION_OPEN_DOCUMENT);intent.addCategory(Intent.CATEGORY_OPENABLE);intent.setType("*/*");intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE,params.getMode()==FileChooserParams.MODE_OPEN_MULTIPLE);try{fileChooserLauncher.launch(intent);return true;}catch(Exception e){pendingFileCallback=null;callback.onReceiveValue(null);toast("The Android file picker could not be opened.");return false;}}
            @Override public boolean onCreateWindow(WebView view,boolean isDialog,boolean isUserGesture,android.os.Message resultMsg){if(!isUserGesture){toast("A blocked pop-up tried to open without a user action.");return false;}final boolean[] opened={false};WebView popup=new WebView(BrowserActivity.this);popup.setWebViewClient(new WebViewClient(){private void openOnce(String u){if(opened[0])return;opened[0]=true;if(BrowserUrlParser.isSafeWebUrl(u))main.post(()->createTab(u,true));try{popup.stopLoading();popup.destroy();}catch(Exception ignored){}}@Override public boolean shouldOverrideUrlLoading(WebView v,WebResourceRequest r){if(r.isForMainFrame()){openOnce(r.getUrl().toString());return true;}return false;}@Override public void onPageStarted(WebView v,String u,Bitmap b){if(BrowserUrlParser.isSafeWebUrl(u))openOnce(u);}});android.webkit.WebView.WebViewTransport transport=(android.webkit.WebView.WebViewTransport)resultMsg.obj;transport.setWebView(popup);resultMsg.sendToTarget();return true;}
            @Override public void onGeolocationPermissionsShowPrompt(String origin,GeolocationPermissions.Callback callback){runOnUiThread(()->requestGeolocation(origin,callback));}
            @Override public void onPermissionRequest(PermissionRequest request){runOnUiThread(()->requestWebResources(request));}
        });
        web.setDownloadListener((url,userAgent,contentDisposition,mimeType,contentLength)->startDownload(tab,url,userAgent,contentDisposition,mimeType));
        evictExcessWebViews(tab);if(tab==activeTab){showWebView(tab);}if(load&&!tab.url.isEmpty())web.loadUrl(tab.url);
    }
    private void configureWebSettings(WebView web){WebSettings s=web.getSettings();s.setJavaScriptEnabled(jsEnabled);s.setDomStorageEnabled(true);s.setDatabaseEnabled(true);s.setLoadsImagesAutomatically(true);s.setAllowFileAccess(false);s.setAllowContentAccess(false);s.setAllowFileAccessFromFileURLs(false);s.setAllowUniversalAccessFromFileURLs(false);s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);s.setMediaPlaybackRequiresUserGesture(true);s.setSupportZoom(true);s.setBuiltInZoomControls(true);s.setDisplayZoomControls(false);s.setTextZoom(textZoom);s.setUseWideViewPort(desktopMode);s.setLoadWithOverviewMode(desktopMode);s.setSupportMultipleWindows(true);s.setJavaScriptCanOpenWindowsAutomatically(false);s.setGeolocationEnabled(true);s.setCacheMode(WebSettings.LOAD_DEFAULT);if(Build.VERSION.SDK_INT>=21)CookieManager.getInstance().setAcceptThirdPartyCookies(web,false);if(WebViewFeature.isFeatureSupported(WebViewFeature.SAFE_BROWSING_ENABLE)){try{WebSettingsCompat.setSafeBrowsingEnabled(s,true);}catch(Exception ignored){}}}
    private void evictExcessWebViews(Tab keep){ArrayList<Tab> live=new ArrayList<>();for(Tab t:tabs)if(t.web!=null)live.add(t);if(live.size()<=MAX_LIVE_WEBVIEWS)return;Collections.sort(live,Comparator.comparingLong(t->t.lastAccess));int liveCount=live.size();for(Tab t:live){if(liveCount<=MAX_LIVE_WEBVIEWS)break;if(t==keep||t.web==null)continue;if(t.web.getParent()!=null)((ViewGroup)t.web.getParent()).removeView(t.web);t.web.stopLoading();t.web.destroy();t.web=null;liveCount--;}}
    private void goBack(){if(activeTab==null)return;if(activeTab.web!=null&&activeTab.web.canGoBack()){activeTab.web.goBack();return;}if(activeTab.index>0&&activeTab.index-1<activeTab.urls.size()){activeTab.index--;navigateActive(activeTab.urls.get(activeTab.index));return;}toast("There is no previous page in this tab.");}
    private void goForward(){if(activeTab==null)return;if(activeTab.web!=null&&activeTab.web.canGoForward()){activeTab.web.goForward();return;}if(activeTab.index+1>=0&&activeTab.index+1<activeTab.urls.size()){activeTab.index++;navigateActive(activeTab.urls.get(activeTab.index));return;}toast("There is no next page in this tab.");}
    private void refreshNavButtons(){if(backButton!=null){backButton.setAlpha(activeTab!=null&&activeTab.web!=null&&activeTab.web.canGoBack()?1f:.55f);forwardButton.setAlpha(activeTab!=null&&activeTab.web!=null&&activeTab.web.canGoForward()?1f:.55f);}}
    private void refreshTabCount(){if(tabsNavButton!=null)tabsNavButton.setText("▢\n"+tabs.size());}
    private void setProgress(int value,boolean visible){if(progress!=null){progress.setProgress(Math.max(0,Math.min(100,value)));progress.setVisibility(visible?View.VISIBLE:View.GONE);}if(reloadButton!=null&&activeTab!=null)reloadButton.setText(visible?"×":"↻");}
    private void hideError(){if(errorPanel!=null)errorPanel.setVisibility(View.GONE);}
    private void showError(String message,boolean retry,boolean tls){if(errorPanel==null)return;errorTitle.setText(tls?"Secure connection blocked":message);errorMessage.setText(message);errorPanel.setVisibility(View.VISIBLE);webHost.setVisibility(View.GONE);homePanel.setVisibility(View.GONE);if(tryHttpButton!=null)tryHttpButton.setVisibility(!tls&&retry&&currentErrorUrl.startsWith("https://")?View.VISIBLE:View.GONE);}
    private void toast(String s){Toast.makeText(this,s,Toast.LENGTH_SHORT).show();}

    private void showTabSwitcher(){
        LinearLayout box=new LinearLayout(this);box.setOrientation(LinearLayout.VERTICAL);box.setPadding(dp(14),dp(6),dp(14),dp(4));
        ScrollView sc=new ScrollView(this);LinearLayout list=new LinearLayout(this);list.setOrientation(LinearLayout.VERTICAL);sc.addView(list);
        final AlertDialog[] dialogRef=new AlertDialog[1];
        for(Tab t:new ArrayList<>(tabs)){
            LinearLayout row=new LinearLayout(this);row.setGravity(Gravity.CENTER_VERTICAL);row.setPadding(dp(8),dp(6),dp(6),dp(6));row.setBackground(round(t==activeTab?Color.rgb(43,42,83):PANEL,dp(14)));
            TextView siteGlyph=new TextView(this);siteGlyph.setText(t.home?"⌂":"◈");siteGlyph.setGravity(Gravity.CENTER);siteGlyph.setTextSize(17);siteGlyph.setTextColor(CYAN);siteGlyph.setBackground(round(PANEL2,dp(11)));LinearLayout.LayoutParams glyphParams=new LinearLayout.LayoutParams(dp(38),dp(38));glyphParams.rightMargin=dp(9);row.addView(siteGlyph,glyphParams);
            LinearLayout copy=new LinearLayout(this);copy.setOrientation(LinearLayout.VERTICAL);TextView name=new TextView(this);name.setText(limit(t.title,50));name.setTextColor(TEXT);name.setTextSize(13);name.setTypeface(Typeface.DEFAULT_BOLD);TextView url=new TextView(this);url.setText(t.home?"New tab":limit(t.url,58));url.setTextColor(MUTED);url.setTextSize(10);copy.addView(name);copy.addView(url);row.addView(copy,new LinearLayout.LayoutParams(0,-2,1));
            Button close=button("×",PANEL2);close.setContentDescription("Close tab "+limit(t.title,40));row.addView(close,new LinearLayout.LayoutParams(dp(42),dp(40)));close.setOnClickListener(v->{closeTab(t);if(dialogRef[0]!=null)dialogRef[0].dismiss();showTabSwitcher();});
            row.setOnClickListener(v->{activateTab(t);if(dialogRef[0]!=null)dialogRef[0].dismiss();});row.setOnLongClickListener(v->{closeTab(t);if(dialogRef[0]!=null)dialogRef[0].dismiss();showTabSwitcher();return true;});LinearLayout.LayoutParams rp=new LinearLayout.LayoutParams(-1,-2);rp.setMargins(0,0,0,dp(7));list.addView(row,rp);
        }
        box.addView(sc,new LinearLayout.LayoutParams(-1,0,1));Button add=button("＋ New tab",ACCENT);LinearLayout.LayoutParams ap=new LinearLayout.LayoutParams(-1,dp(44));ap.setMargins(0,dp(8),0,0);box.addView(add,ap);add.setOnClickListener(v->{createTab(null,true);if(dialogRef[0]!=null)dialogRef[0].dismiss();});
        dialogRef[0]=new AlertDialog.Builder(this).setTitle("Tabs · "+tabs.size()).setView(box).setNegativeButton("Close",null).create();dialogRef[0].show();
    }
    private void closeTab(Tab tab){if(tab==null||!tabs.contains(tab))return;if(tabs.size()==1){if(tab.web!=null){tab.web.loadUrl("about:blank");tab.web.stopLoading();}tab.url="";tab.title="New tab";tab.home=true;tab.error=false;if(tab.web!=null){tab.web.destroy();tab.web=null;}activateTab(tab);if(!privateMode)saveSession();return;}recentlyClosed.add(0,new TabRecord(tab.url,tab.title));if(recentlyClosed.size()>10)recentlyClosed.remove(recentlyClosed.size()-1);if(!privateMode){sessionPrefs().edit().putString("lastClosedUrl",tab.url).putString("lastClosedTitle",tab.title).apply();}if(tab.web!=null){if(tab.web.getParent()!=null)((ViewGroup)tab.web.getParent()).removeView(tab.web);tab.web.stopLoading();tab.web.destroy();}int index=tabs.indexOf(tab);tabs.remove(tab);if(activeTab==tab)activateTab(tabs.get(Math.max(0,index-1)));refreshTabCount();if(!privateMode)saveSession();}
    private android.content.SharedPreferences sessionPrefs(){return getSharedPreferences("browser_session_"+profileSuffix(profileId),MODE_PRIVATE);}
    private static String safeProfileId(String value){if(value==null||value.trim().isEmpty())return "device";return value.matches("[A-Za-z0-9_-]{1,128}")?value:"device";}
    private static String profileSuffix(String value){try{java.security.MessageDigest digest=java.security.MessageDigest.getInstance("SHA-256");byte[] bytes=digest.digest(value.getBytes(StandardCharsets.UTF_8));StringBuilder out=new StringBuilder();for(int i=0;i<6;i++)out.append(String.format(Locale.ROOT,"%02x",bytes[i]));return out.toString();}catch(Exception e){return "device";}}
    private void saveSession(){if(privateMode)return;try{JSONArray a=new JSONArray();for(Tab t:tabs){JSONObject o=new JSONObject().put("id",t.id).put("url",t.url).put("title",t.title).put("home",t.home);a.put(o);}sessionPrefs().edit().putString("tabs",a.toString()).putString("active",activeTab==null?"":activeTab.id).apply();}catch(Exception ignored){}}
    private void restoreSession(){if(privateMode)return;String saved=sessionPrefs().getString("tabs","");if(saved.isEmpty())return;try{JSONArray a=new JSONArray(saved);String activeId=sessionPrefs().getString("active","");for(int i=0;i<a.length()&&i<MAX_TABS;i++){JSONObject o=a.getJSONObject(i);Tab t=new Tab();t.id=o.optString("id",UUID.randomUUID().toString());t.url=o.optString("url","");t.title=o.optString("title","New tab");t.home=o.optBoolean("home",t.url.isEmpty());if(!t.home&&!BrowserUrlParser.isSafeWebUrl(t.url)){t.home=true;t.url="";}tabs.add(t);if(t.id.equals(activeId))activeTab=t;}if(activeTab==null&&!tabs.isEmpty())activeTab=tabs.get(0);if(activeTab!=null)activateTab(activeTab);}catch(Exception e){tabs.clear();activeTab=null;}}
    @Override public void onBackPressed(){if(activeTab!=null&&activeTab.web!=null&&activeTab.web.canGoBack()){activeTab.web.goBack();return;}if(tabs.size()>1){closeTab(activeTab);return;}finish();}

    private void showMoreMenu(){String[] items=privateMode?new String[]{"New tab","Tabs","Site information","Browser settings","Clear temporary website data","Return to Code Academy"}:new String[]{"New tab","Private tab","Tabs","Bookmarks","Browsing history","Downloads","Site information","Browser settings","Reopen closed tab","Clear cookies / site data","Clear cache","Return to Code Academy"};new AlertDialog.Builder(this).setTitle("Browser menu").setItems(items,(d,w)->{String s=items[w];switch(s){case "New tab":createTab(null,true);break;case "Private tab":openPrivateTab();break;case "Tabs":showTabSwitcher();break;case "Bookmarks":showRecords("bookmarks");break;case "Browsing history":showRecords("history");break;case "Downloads":showRecords("downloads");break;case "Site information":showSiteInfo();break;case "Browser settings":showSettings();break;case "Reopen closed tab":reopenClosed();break;case "Clear cookies / site data":clearSiteData();break;case "Clear cache":clearCache();break;case "Clear temporary website data":clearSiteData();break;case "Return to Code Academy":finish();break;}}).show();}
    private void openPrivateTab(){if(Build.VERSION.SDK_INT<Build.VERSION_CODES.P){new AlertDialog.Builder(this).setTitle("Private profile unavailable").setMessage("This Android System WebView version cannot guarantee a separate website-data profile. Use your installed system browser's private mode instead.").setPositiveButton("OK",null).show();return;}Intent i=new Intent(this,PrivateBrowserActivity.class);i.putExtra(EXTRA_PRIVATE,true);startActivity(i);}
    private void reopenClosed(){TabRecord rec=!recentlyClosed.isEmpty()?recentlyClosed.remove(0):null;if(rec==null&&!privateMode){String url=sessionPrefs().getString("lastClosedUrl","");String title=sessionPrefs().getString("lastClosedTitle","Reopened tab");if(!url.isEmpty())rec=new TabRecord(url,title);}if(rec==null){toast("There is no recently closed tab to reopen.");return;}createTab(rec.url,true);}

    private void showRecords(String kind){if("downloads".equals(kind))refreshDownloadStatuses();if(privateMode&&"history".equals(kind)){toast("Temporary private browsing does not save history.");return;}if("bookmarks".equals(kind)&&privateMode){toast("Bookmarks are disabled in a temporary private profile.");return;}io.execute(()->{JSONArray records;try{if(store==null)return;if("bookmarks".equals(kind))records=store.bookmarks(false);else if("history".equals(kind))records=store.history(1000);else records=store.downloads();}catch(Exception e){return;}JSONArray finalRecords=records;runOnUiThread(()->buildRecordDialog(kind,finalRecords));});}
    private void buildRecordDialog(String kind,JSONArray records){
        LinearLayout outer=new LinearLayout(this);outer.setOrientation(LinearLayout.VERTICAL);outer.setPadding(dp(12),dp(6),dp(12),dp(4));
        EditText filter=new EditText(this);filter.setSingleLine(true);filter.setTextColor(TEXT);filter.setHintTextColor(MUTED);filter.setHint("Filter "+kind+"…");filter.setBackground(round(PANEL2,dp(12)));filter.setPadding(dp(12),0,dp(12),0);
        Button sort=button("Sort: recent",PANEL2);LinearLayout controls=new LinearLayout(this);controls.setOrientation(LinearLayout.HORIZONTAL);controls.addView(filter,new LinearLayout.LayoutParams(0,dp(44),1));LinearLayout.LayoutParams sp=new LinearLayout.LayoutParams(dp(122),dp(44));sp.setMargins(dp(7),0,0,0);controls.addView(sort,sp);outer.addView(controls);
        ScrollView sc=new ScrollView(this);LinearLayout list=new LinearLayout(this);list.setOrientation(LinearLayout.VERTICAL);sc.addView(list);outer.addView(sc,new LinearLayout.LayoutParams(-1,0,1));
        AlertDialog dialog=new AlertDialog.Builder(this).setTitle(kind.substring(0,1).toUpperCase(Locale.ROOT)+kind.substring(1)).setView(outer).setPositiveButton("Done",null).setNeutralButton("Clear",(d,w)->{if("history".equals(kind))confirmClearHistory();else if("downloads".equals(kind))confirmClearDownloads();}).create();
        final int[] sortMode={0};final String[] group={""};
        String[] sortLabels={"Sort: recent","Sort: title A–Z","Sort: domain A–Z"};
        sort.setOnClickListener(v->{sortMode[0]=(sortMode[0]+1)%sortLabels.length;sort.setText(sortLabels[sortMode[0]]);renderRecords(list,records,filter.getText().toString(),kind,sortMode[0],dialog);});
        filter.addTextChangedListener(new android.text.TextWatcher(){public void beforeTextChanged(CharSequence s,int start,int count,int after){}public void onTextChanged(CharSequence s,int start,int before,int count){renderRecords(list,records,s.toString(),kind,sortMode[0],dialog);}public void afterTextChanged(android.text.Editable e){}});
        renderRecords(list,records,"",kind,0,dialog);dialog.show();
    }
    private void renderRecords(LinearLayout list,JSONArray records,String filter,String kind,int sortMode,AlertDialog dialog){
        list.removeAllViews();String q=filter==null?"":filter.toLowerCase(Locale.ROOT);ArrayList<JSONObject> values=new ArrayList<>();
        for(int i=0;i<records.length();i++){JSONObject item=records.optJSONObject(i);if(item==null)continue;String url=item.optString("url",item.optString("sourceUrl",""));String title=item.optString("title",item.optString("filename",url));String status=item.optString("status","");if((title+" "+url+" "+status+" "+item.optString("domain","")).toLowerCase(Locale.ROOT).contains(q))values.add(item);}
        final int selectedSort=sortMode;
        Collections.sort(values,(a,b)->{if(selectedSort==1)return a.optString("title",a.optString("filename","")).compareToIgnoreCase(b.optString("title",b.optString("filename","")));if(selectedSort==2)return a.optString("domain",BrowserUrlParser.domain(a.optString("url",a.optString("sourceUrl","")))).compareToIgnoreCase(b.optString("domain",BrowserUrlParser.domain(b.optString("url",b.optString("sourceUrl","")))));long av=a.optLong("visitedAt",a.optLong("updatedAt",a.optLong("createdAt",0))),bv=b.optLong("visitedAt",b.optLong("updatedAt",b.optLong("createdAt",0)));return Long.compare(bv,av);});
        String lastDate="";int shown=0;
        for(JSONObject item:values){shown++;String url=item.optString("url",item.optString("sourceUrl",""));String title=item.optString("title",item.optString("filename",url));String status=item.optString("status","");
            if("history".equals(kind)&&sortMode==0){long stamp=item.optLong("visitedAt",0);String dateGroup=stamp>0?new SimpleDateFormat("EEE, MMM d",Locale.getDefault()).format(new Date(stamp)):"Earlier visits";if(!dateGroup.equals(lastDate)){TextView heading=new TextView(this);heading.setText(dateGroup);heading.setTextColor(CYAN);heading.setTextSize(11);heading.setTypeface(Typeface.DEFAULT_BOLD);heading.setPadding(dp(5),dp(10),dp(4),dp(6));list.addView(heading);lastDate=dateGroup;}}
            LinearLayout row=new LinearLayout(this);row.setOrientation(LinearLayout.VERTICAL);row.setPadding(dp(12),dp(10),dp(12),dp(10));row.setBackground(round(PANEL,dp(12)));TextView name=new TextView(this);name.setText(limit(title,80));name.setTextColor(TEXT);name.setTypeface(Typeface.DEFAULT_BOLD);name.setTextSize(13);TextView detail=new TextView(this);String detailText=limit(url,130)+(status.isEmpty()?"":" · "+status);if("history".equals(kind)){long stamp=item.optLong("visitedAt",0);if(stamp>0)detailText+=" · "+new SimpleDateFormat("h:mm a",Locale.getDefault()).format(new Date(stamp));}else if("downloads".equals(kind)){long got=item.optLong("bytesDownloaded",0),total=item.optLong("totalBytes",0);if("downloading".equals(status)&&total>0)detailText+=" · "+Math.max(0,Math.min(100,(int)(got*100/total)))+"%";else if(total>0)detailText+=" · "+android.text.format.Formatter.formatShortFileSize(this,total);}detail.setText(detailText);detail.setTextColor(MUTED);detail.setTextSize(10);row.addView(name);LinearLayout.LayoutParams dp2=new LinearLayout.LayoutParams(-1,-2);dp2.setMargins(0,dp(4),0,0);row.addView(detail,dp2);
            row.setOnClickListener(v->{if("bookmarks".equals(kind)||"history".equals(kind)){navigateActive(url);dialog.dismiss();}else handleDownloadRow(item);});row.setOnLongClickListener(v->{if("bookmarks".equals(kind))showBookmarkActions(item);else if("history".equals(kind))showHistoryActions(item);else showDownloadActions(item);return true;});LinearLayout.LayoutParams rp=new LinearLayout.LayoutParams(-1,-2);rp.setMargins(0,0,0,dp(6));list.addView(row,rp);
        }
        if(shown==0){TextView empty=new TextView(this);empty.setText("bookmarks".equals(kind)?"No saved bookmarks yet. Use ☆ Save on a page.":"history".equals(kind)?"No recorded visits. History recording can be switched on in settings.":"No downloads recorded yet.");empty.setTextColor(MUTED);empty.setPadding(dp(12),dp(20),dp(12),dp(20));list.addView(empty);}
    }
    private void navigateFromRecord(String url){if(BrowserUrlParser.isSafeWebUrl(url)){createTab(url,true);}else toast("This saved address is no longer valid.");}
    private void showBookmarkActions(JSONObject item){String[] actions={"Open","Open in new tab","Edit title / folder","Delete bookmark"};new AlertDialog.Builder(this).setTitle(item.optString("title","Bookmark")).setItems(actions,(d,w)->{if(w==0)navigateActive(item.optString("url"));else if(w==1)createTab(item.optString("url"),true);else if(w==2)editBookmark(item);else confirmDeleteBookmark(item);}).show();}
    private void showHistoryActions(JSONObject item){String[] actions={"Open","Open in new tab","Delete visit"};new AlertDialog.Builder(this).setTitle(item.optString("title","History visit")).setItems(actions,(d,w)->{if(w==0)navigateActive(item.optString("url"));else if(w==1)createTab(item.optString("url"),true);else io.execute(()->{store.deleteHistory(item.optString("id"));runOnUiThread(()->toast("Visit removed from history."));});}).show();}
    private void showDownloadActions(JSONObject item){boolean retryable="failed".equalsIgnoreCase(item.optString("status"))||"paused".equalsIgnoreCase(item.optString("status"));String[] actions=retryable?new String[]{"Open downloaded file","Share downloaded file","Retry download","Delete download record"}:new String[]{"Open downloaded file","Share downloaded file","Delete download record"};new AlertDialog.Builder(this).setTitle(item.optString("filename","Download")).setItems(actions,(d,w)->{if(w==0)openDownload(item);else if(w==1)shareDownload(item);else if(retryable&&w==2)startDownload(activeTab,item.optString("sourceUrl",""),null,item.optString("filename","download.bin"),item.optString("mimeType","application/octet-stream"));else confirmDeleteDownload(item);}).show();}
    private void handleDownloadRow(JSONObject item){String status=item.optString("status","");if("completed".equals(status))openDownload(item);else new AlertDialog.Builder(this).setTitle(item.optString("filename","Download")).setMessage("Status: "+status+"\n"+item.optString("error","A remote server may refuse a requested download.")).setPositiveButton("OK",null).show();}
    private void confirmDeleteBookmark(JSONObject item){new AlertDialog.Builder(this).setTitle("Delete bookmark?").setMessage("This bookmark will be removed from this device and marked for cloud deletion on the next sync.").setNegativeButton("Cancel",null).setPositiveButton("Delete",(d,w)->io.execute(()->{store.deleteBookmark(item.optString("id"));runOnUiThread(()->toast("Bookmark deleted."));})).show();}
    private void confirmDeleteDownload(JSONObject item){new AlertDialog.Builder(this).setTitle("Delete download record?").setMessage("This removes the browser's record, not necessarily the downloaded file in Android Downloads.").setNegativeButton("Cancel",null).setPositiveButton("Delete",(d,w)->io.execute(()->{store.deleteDownload(item.optString("id"));runOnUiThread(()->toast("Download record deleted."));})).show();}
    private void confirmClearHistory(){new AlertDialog.Builder(this).setTitle("Clear browsing history?").setMessage("This removes saved visit records from this device. Cloud history, if you explicitly enabled it, is managed separately in your Code Academy account.").setNegativeButton("Cancel",null).setPositiveButton("Clear history",(d,w)->io.execute(()->{store.clearHistory();runOnUiThread(()->toast("Browsing history cleared."));})).show();}
    private void confirmClearDownloads(){new AlertDialog.Builder(this).setTitle("Clear download records?").setMessage("This removes the browser's download list. Downloaded files are not deleted from Android Downloads.").setNegativeButton("Cancel",null).setPositiveButton("Clear records",(d,w)->io.execute(()->{try{JSONArray a=store.downloads();for(int i=0;i<a.length();i++)store.deleteDownload(a.getJSONObject(i).optString("id"));}catch(Exception ignored){}runOnUiThread(()->toast("Download records cleared."));})).show();}

    private void bookmarkCurrent(){if(privateMode){toast("Bookmarks are disabled in a temporary private profile.");return;}if(activeTab==null||!BrowserUrlParser.isSafeWebUrl(activeTab.url)){toast("Open a website before bookmarking it.");return;}final String saveUrl=activeTab.url;EditText title=new EditText(this);title.setSingleLine(true);title.setText(activeTab.title);title.setTextColor(TEXT);EditText folder=new EditText(this);folder.setSingleLine(true);folder.setText("Favourites");folder.setTextColor(TEXT);LinearLayout box=new LinearLayout(this);box.setPadding(dp(18),dp(4),dp(18),0);box.setOrientation(LinearLayout.VERTICAL);box.addView(title);box.addView(folder);new AlertDialog.Builder(this).setTitle("Save bookmark").setMessage(saveUrl).setView(box).setNegativeButton("Cancel",null).setPositiveButton("Save",(d,w)->{final String saveTitle=title.getText().toString().trim().isEmpty()?saveUrl:title.getText().toString().trim();final String saveFolder=folder.getText().toString().trim().isEmpty()?"Favourites":folder.getText().toString().trim();io.execute(()->{try{store.saveBookmark(saveUrl,saveTitle,saveFolder,0);runOnUiThread(()->toast("Bookmark saved on this device."));}catch(Exception e){runOnUiThread(()->toast("Bookmark could not be saved."));}});}).show();}
    private void editBookmark(JSONObject item){final String url=item.optString("url");EditText title=new EditText(this);title.setText(item.optString("title"));title.setTextColor(TEXT);EditText folder=new EditText(this);folder.setText(item.optString("folder","Favourites"));folder.setTextColor(TEXT);LinearLayout box=new LinearLayout(this);box.setOrientation(LinearLayout.VERTICAL);box.setPadding(dp(18),0,dp(18),0);box.addView(title);box.addView(folder);new AlertDialog.Builder(this).setTitle("Edit bookmark").setView(box).setNegativeButton("Cancel",null).setPositiveButton("Save",(d,w)->{final String titleValue=title.getText().toString();final String folderValue=folder.getText().toString();io.execute(()->{try{store.saveBookmark(url,titleValue,folderValue,0);runOnUiThread(()->toast("Bookmark updated."));}catch(Exception e){runOnUiThread(()->toast("Bookmark could not be updated."));}});}).show();}

    private void showSettings(){if(privateMode){new AlertDialog.Builder(this).setTitle("Temporary profile settings").setMessage("JavaScript is enabled for compatibility. History is not recorded; bookmarks and cloud sync are disabled. Closing this session clears this isolated WebView profile's cookies, cache and website storage.").setPositiveButton("Close private profile",(d,w)->finish()).setNegativeButton("Stay",null).show();return;}String[] items={"Default search provider: "+(searchProvider.equals("google")?"Google":"DuckDuckGo"),"JavaScript: "+(jsEnabled?"On":"Off"),"Text size: "+textZoom+"%","Desktop site: "+(desktopMode?"On":"Off"),"Record history: "+(historyEnabled?"On":"Off"),"Preview image requests: "+(previewsEnabled?"On":"Off"),"Dark browser chrome: "+(darkChrome?"On":"Off"),"Sync browsing history: "+(historySyncOptIn?"Opted in":"Off"),"Safe Browsing status","Clear cookies and site data","Clear cache","Reset browser settings"};new AlertDialog.Builder(this).setTitle("Browser settings").setItems(items,(d,w)->{switch(w){case 0:chooseSearchProvider();break;case 1:toggleJavascript();break;case 2:chooseTextZoom();break;case 3:desktopMode=!desktopMode;saveSetting("desktopMode",desktopMode);reconfigureTabs();showSettings();break;case 4:historyEnabled=!historyEnabled;saveSetting("historyEnabled",historyEnabled);toast("History recording "+(historyEnabled?"enabled":"disabled")+".");showSettings();break;case 5:previewsEnabled=!previewsEnabled;saveSetting("previewsEnabled",previewsEnabled);toast("Metadata image previews "+(previewsEnabled?"enabled":"disabled")+".");showSettings();break;case 6:darkChrome=!darkChrome;saveSetting("darkChrome",darkChrome);rebuildChrome();toast("Browser chrome updated.");main.postDelayed(this::showSettings,180);break;case 7:historySyncOptIn=!historySyncOptIn;saveSetting("historySyncOptIn",historySyncOptIn);new AlertDialog.Builder(this).setTitle(historySyncOptIn?"History sync enabled":"History sync disabled").setMessage(historySyncOptIn?"Browsing history metadata (page title, URL and timestamp) can be uploaded to your existing Code Academy account when sync runs. Website cookies, passwords and page contents are never synced.":"History will no longer be uploaded. Previously synced records are not automatically erased; use the account's cloud-data deletion action when available.").setPositiveButton("OK",null).show();showSettings();break;case 8:showSafeBrowsing();break;case 9:clearSiteData();break;case 10:clearCache();break;case 11:resetSettings();break;}}).show();}
    private void chooseSearchProvider(){String[] providers={"Google","DuckDuckGo"};new AlertDialog.Builder(this).setTitle("Default search engine").setSingleChoiceItems(providers,searchProvider.equals("google")?0:1,(d,w)->{searchProvider=w==0?"google":"duckduckgo";saveSetting("searchProvider",searchProvider);d.dismiss();showSettings();}).setNegativeButton("Cancel",null).show();}
    private void toggleJavascript(){new AlertDialog.Builder(this).setTitle(jsEnabled?"Disable JavaScript?":"Enable JavaScript?").setMessage(jsEnabled?"Many modern websites stop working correctly when JavaScript is disabled. This setting applies to newly created or reloaded tabs.":"JavaScript is needed by many websites. It will run only inside the isolated browser WebView and no native JavaScript bridge is exposed to remote pages.").setNegativeButton("Cancel",null).setPositiveButton(jsEnabled?"Disable":"Enable",(d,w)->{jsEnabled=!jsEnabled;saveSetting("javascriptEnabled",jsEnabled);reconfigureTabs();showSettings();}).show();}
    private void chooseTextZoom(){String[] sizes={"75%","90%","100%","110%","125%","150%"};int[] values={75,90,100,110,125,150};int current=2;for(int i=0;i<values.length;i++)if(values[i]==textZoom)current=i;new AlertDialog.Builder(this).setTitle("Page text size").setSingleChoiceItems(sizes,current,(d,w)->{textZoom=values[w];saveSetting("textZoom",textZoom);reconfigureTabs();d.dismiss();showSettings();}).setNegativeButton("Cancel",null).show();}
    private void reconfigureTabs(){for(Tab t:tabs){if(t.web!=null){t.web.getSettings().setJavaScriptEnabled(jsEnabled);t.web.getSettings().setTextZoom(textZoom);t.web.getSettings().setUseWideViewPort(desktopMode);t.web.getSettings().setLoadWithOverviewMode(desktopMode);}}}
    private void showSafeBrowsing(){boolean supported=WebViewFeature.isFeatureSupported(WebViewFeature.SAFE_BROWSING_ENABLE);new AlertDialog.Builder(this).setTitle("Safe Browsing").setMessage(supported?"Safe Browsing is enabled where supported by the installed Android System WebView provider. It can warn about some known unsafe destinations; it cannot detect every malicious page.":"This installed WebView provider does not expose the supported Safe Browsing control. Keep Android System WebView updated.").setPositiveButton("OK",null).show();}
    private void clearSiteData(){new AlertDialog.Builder(this).setTitle("Clear cookies and site data?").setMessage("This clears website cookies, local storage and other WebView site data from the browser profile. You may be signed out of websites. It does not clear bookmarks or browsing history.").setNegativeButton("Cancel",null).setPositiveButton("Clear site data",(d,w)->{CookieManager cm=CookieManager.getInstance();cm.removeAllCookies(ok->{});cm.flush();WebStorage.getInstance().deleteAllData();for(Tab t:tabs)if(t.web!=null)t.web.clearFormData();toast("Site cookies and website storage are being cleared.");}).show();}
    private void clearCache(){new AlertDialog.Builder(this).setTitle("Clear browser cache?").setMessage("Cached website resources will be removed. Cookies, bookmarks and history remain.").setNegativeButton("Cancel",null).setPositiveButton("Clear cache",(d,w)->{for(Tab t:tabs)if(t.web!=null)t.web.clearCache(true);toast("Browser cache cleared.");}).show();}
    private void resetSettings(){new AlertDialog.Builder(this).setTitle("Reset browser settings?").setMessage("This restores the default search provider and browser preferences. Bookmarks, history, downloaded files and website cookies are not deleted.").setNegativeButton("Cancel",null).setPositiveButton("Reset settings",(d,w)->{io.execute(()->{try{store.clearSettings();store.setSetting("searchProvider","google");store.setSetting("javascriptEnabled","true");store.setSetting("textZoom","100");store.setSetting("desktopMode","false");store.setSetting("historyEnabled","true");store.setSetting("previewsEnabled","true");store.setSetting("darkChrome","true");store.setSetting("historySyncOptIn","false");}catch(Exception ignored){}runOnUiThread(()->{searchProvider="google";jsEnabled=true;textZoom=100;desktopMode=false;historyEnabled=true;previewsEnabled=true;darkChrome=true;historySyncOptIn=false;rebuildChrome();reconfigureTabs();toast("Settings reset.");});});}).show();}

    private void showSiteInfo(){if(activeTab==null||!BrowserUrlParser.isSafeWebUrl(activeTab.url)){toast("Open a website to view its connection information.");return;}Metadata meta=lastMetadata;LinearLayout box=new LinearLayout(this);box.setOrientation(LinearLayout.VERTICAL);box.setPadding(dp(18),dp(4),dp(18),dp(8));ImageView image=new ImageView(this);image.setScaleType(ImageView.ScaleType.CENTER_CROP);image.setBackground(round(PANEL2,dp(12)));box.addView(image,new LinearLayout.LayoutParams(-1,dp(130)));if(previewsEnabled&&meta.image!=null&&!privateMode)loadPreviewImage(meta.image,image);TextView domain=new TextView(this);domain.setText((activeTab.url.startsWith("https://")?"🔒 HTTPS connection":"ⓘ HTTP connection")+"\n"+BrowserUrlParser.origin(activeTab.url));domain.setTextColor(TEXT);domain.setTextSize(14);domain.setTypeface(Typeface.DEFAULT_BOLD);LinearLayout.LayoutParams dp1=new LinearLayout.LayoutParams(-1,-2);dp1.setMargins(0,dp(12),0,dp(6));box.addView(domain,dp1);TextView details=new TextView(this);details.setText("Page title: "+activeTab.title+"\nDescription: "+(meta.description.isEmpty()?"No description provided":meta.description)+"\nFavicon: "+(meta.favicon.isEmpty()?"Not available":meta.favicon)+"\nPermissions: "+(sessionSiteGrants.contains(BrowserUrlParser.origin(activeTab.url)+"|MEDIA")||sessionSiteGrants.contains(BrowserUrlParser.origin(activeTab.url)+"|LOCATION")?"A camera/microphone/location request was allowed during this session":"No website permission is currently stored")+"\n\nHTTPS protects the connection in transit; it does not prove that the website is honest or trustworthy.");details.setTextColor(MUTED);details.setTextSize(12);box.addView(details);new AlertDialog.Builder(this).setTitle("Site information").setView(box).setNeutralButton("Preview",(d,w)->showMetadataPreview()).setNegativeButton("Close",null).setPositiveButton("Manage permission record",(d,w)->revokeSiteGrant()).show();}
    private void revokeSiteGrant(){String origin=activeTab==null?"":BrowserUrlParser.origin(activeTab.url);sessionSiteGrants.remove(origin+"|MEDIA");sessionSiteGrants.remove(origin+"|LOCATION");GeolocationPermissions.getInstance().clear(origin);new AlertDialog.Builder(this).setTitle("Permission record cleared").setMessage("Saved browser allowance for this origin was cleared. Android permissions are managed by Android Settings; reload the page to make a new website request take effect.").setPositiveButton("OK",null).show();}
    private static final class Metadata {String title="",description="",canonical="",image="",favicon="",themeColor="";}
    private void extractMetadata(WebView web,Tab tab){String js="(function(){const q=(s)=>document.querySelector(s);const m=(s)=>q('meta[name=\\\"'+s+'\\\"]')?.content||'';const p=(s)=>q('meta[property=\\\"'+s+'\\\"]')?.content||'';const links=[...document.querySelectorAll('link[rel~=icon]')];const abs=(v)=>{try{return new URL(v,location.href).href}catch(e){return ''}};return JSON.stringify({title:document.title||'',description:m('description')||p('og:description'),canonical:abs(q('link[rel=canonical]')?.href||location.href),image:abs(p('og:image')||m('twitter:image')||p('twitter:image')),favicon:abs(links[0]?.href||'/favicon.ico'),themeColor:m('theme-color')});})()";web.evaluateJavascript(js,result->{try{Object parsed=new org.json.JSONTokener(result).nextValue();String value=parsed instanceof String?(String)parsed:result;JSONObject o=new JSONObject(value);Metadata m=new Metadata();m.title=limit(o.optString("title",tab.title),300);m.description=limit(o.optString("description",""),1000);m.canonical=validMetadataUrl(o.optString("canonical",""));m.image=validImageUrl(o.optString("image",""));m.favicon=validImageUrl(o.optString("favicon",""));m.themeColor=o.optString("themeColor","");if(tab==activeTab)lastMetadata=m;}catch(Exception ignored){}});}
    private String validMetadataUrl(String value){return BrowserUrlParser.isSafeWebUrl(value)?value:"";}
    private String validImageUrl(String value){try{Uri u=Uri.parse(value);return "https".equalsIgnoreCase(u.getScheme())&&u.getHost()!=null&&value.length()<4096?value:"";}catch(Exception e){return "";}}
    private void showMetadataPreview(){if(activeTab==null)return;Metadata m=lastMetadata;LinearLayout box=new LinearLayout(this);box.setOrientation(LinearLayout.VERTICAL);box.setPadding(dp(18),dp(8),dp(18),dp(8));ImageView iv=new ImageView(this);iv.setScaleType(ImageView.ScaleType.CENTER_CROP);iv.setBackground(round(PANEL2,dp(12)));box.addView(iv,new LinearLayout.LayoutParams(-1,dp(160)));if(previewsEnabled&&!privateMode&&!m.image.isEmpty())loadPreviewImage(m.image,iv);TextView title=new TextView(this);title.setText(m.title.isEmpty()?activeTab.title:m.title);title.setTextColor(TEXT);title.setTypeface(Typeface.DEFAULT_BOLD);title.setTextSize(17);LinearLayout.LayoutParams tlp=new LinearLayout.LayoutParams(-1,-2);tlp.setMargins(0,dp(12),0,dp(6));box.addView(title,tlp);TextView desc=new TextView(this);desc.setText(m.description.isEmpty()?"This page did not supply a description.":m.description);desc.setTextColor(MUTED);desc.setTextSize(12);box.addView(desc);TextView url=new TextView(this);url.setText("Source: "+BrowserUrlParser.domain(activeTab.url)+"\nPreview metadata is supplied by the website and may be misleading.");url.setTextColor(CYAN);url.setTextSize(11);LinearLayout.LayoutParams ulp=new LinearLayout.LayoutParams(-1,-2);ulp.setMargins(0,dp(9),0,0);box.addView(url,ulp);new AlertDialog.Builder(this).setTitle("Page preview").setView(box).setPositiveButton("Open page",(d,w)->{}).setNegativeButton("Close",null).show();}
    private void loadPreviewImage(String imageUrl,ImageView target){if(imageUrl==null||!imageUrl.startsWith("https://")||imageUrl.length()>4096)return;io.execute(()->{Bitmap bitmap=null;HttpURLConnection conn=null;try{URL u=new URL(imageUrl);for(int redirects=0;redirects<4;redirects++){if(!"https".equalsIgnoreCase(u.getProtocol()))throw new SecurityException("Only HTTPS images are allowed");conn=(HttpURLConnection)u.openConnection();conn.setConnectTimeout(4000);conn.setReadTimeout(5000);conn.setInstanceFollowRedirects(false);conn.setRequestProperty("User-Agent","CodeAcademyBrowser/1.0");int code=conn.getResponseCode();if(code>=300&&code<400){String location=conn.getHeaderField("Location");conn.disconnect();conn=null;if(location==null)break;u=new URL(u,location);continue;}if(code<200||code>=300)break;int length=conn.getContentLength();if(length>4*1024*1024)break;InputStream in=conn.getInputStream();ByteArrayOutputStream out=new ByteArrayOutputStream();byte[] b=new byte[8192];int read,total=0;while((read=in.read(b))!=-1){total+=read;if(total>4*1024*1024)break;out.write(b,0,read);}in.close();if(total<=4*1024*1024)bitmap=BitmapFactory.decodeByteArray(out.toByteArray(),0,out.size());break;}}catch(Exception ignored){}finally{if(conn!=null)conn.disconnect();}Bitmap result=bitmap;if(result!=null&&!destroyed)runOnUiThread(()->{if(target.getWindowToken()!=null)target.setImageBitmap(result);});});}

    private void startDownload(Tab tab,String url,String userAgent,String disposition,String mime){
        if(!BrowserUrlParser.isSafeWebUrl(url)){toast("This download URL is not allowed.");return;}
        String filename=URLUtil.guessFileName(url,disposition,mime);
        filename=filename.replaceAll("[/\\\\:*?\"<>|]","_").replaceAll("\\.{2,}",".").trim();
        if(filename.isEmpty()||filename.equals(".")||filename.equals(".."))filename="download.bin";
        final String displayName=filename;
        final String safeName=limit("CA_"+System.currentTimeMillis()+"_"+displayName,150);
        new AlertDialog.Builder(this).setTitle("Download file?").setMessage(safeName+"\nFrom: "+BrowserUrlParser.domain(url)+"\nThe site may refuse the download or require sign-in.").setNegativeButton("Cancel",null).setPositiveButton("Download",(d,w)->{
            try{DownloadManager.Request r=new DownloadManager.Request(Uri.parse(url));r.setTitle(displayName);r.setDescription("Code Academy Browser");r.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);r.setAllowedOverMetered(true);r.setAllowedOverRoaming(false);r.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS,safeName);if(userAgent!=null)r.addRequestHeader("User-Agent",userAgent);if(mime!=null)r.setMimeType(mime);DownloadManager dm=(DownloadManager)getSystemService(DOWNLOAD_SERVICE);long downloadId=dm.enqueue(r);if(!privateMode&&store!=null){String recordId=UUID.randomUUID().toString();io.execute(()->store.addDownload(recordId,url,safeName,mime,downloadId));}toast("Download started. Check Android notifications or Downloads.");}
            catch(Exception e){toast("Download could not start: "+e.getMessage());}
        }).show();
    }
    private void refreshDownloadStatuses(){if(privateMode||store==null)return;io.execute(()->{try{JSONArray a=store.downloads();DownloadManager dm=(DownloadManager)getSystemService(DOWNLOAD_SERVICE);for(int i=0;i<a.length();i++){JSONObject o=a.getJSONObject(i);long id=o.optLong("downloadId",-1);if(id<0)continue;DownloadManager.Query q=new DownloadManager.Query().setFilterById(id);try(Cursor c=dm.query(q)){if(c!=null&&c.moveToFirst()){int status=c.getInt(c.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));long size=c.getLong(c.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR));long total=c.getLong(c.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES));String state=status==DownloadManager.STATUS_SUCCESSFUL?"completed":status==DownloadManager.STATUS_FAILED?"failed":status==DownloadManager.STATUS_PAUSED?"paused":"downloading";String error=status==DownloadManager.STATUS_FAILED?"DownloadManager error "+c.getInt(c.getColumnIndexOrThrow(DownloadManager.COLUMN_REASON)):"";String uri=status==DownloadManager.STATUS_SUCCESSFUL?String.valueOf(dm.getUriForDownloadedFile(id)):"";store.updateDownload(o.optString("id"),state,uri,size,total,error);}}}}catch(Exception ignored){}});}
    private void openDownload(JSONObject item){long id=item.optLong("downloadId",-1);if(id<0){toast("This download has no Android download ID.");return;}try{Uri uri=((DownloadManager)getSystemService(DOWNLOAD_SERVICE)).getUriForDownloadedFile(id);if(uri==null){toast("Downloaded file is not available yet.");return;}String mime=item.optString("mimeType",getContentResolver().getType(uri));Intent i=new Intent(Intent.ACTION_VIEW);i.setDataAndType(uri,(mime==null||mime.isEmpty())?"*/*":mime);i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);startActivity(i);}catch(Exception e){toast("No compatible app could open this file. It remains in Android Downloads.");}}
    private void shareDownload(JSONObject item){long id=item.optLong("downloadId",-1);try{Uri uri=((DownloadManager)getSystemService(DOWNLOAD_SERVICE)).getUriForDownloadedFile(id);if(uri==null)throw new Exception();Intent i=new Intent(Intent.ACTION_SEND);i.setType(item.optString("mimeType","application/octet-stream"));i.putExtra(Intent.EXTRA_STREAM,uri);i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);startActivity(Intent.createChooser(i,"Share downloaded file"));}catch(Exception e){toast("This file is not ready to share.");}}
    private void onFileChooserResult(ActivityResult result){if(pendingFileCallback==null)return;Uri[] uris=null;if(result.getResultCode()==RESULT_OK&&result.getData()!=null){Intent data=result.getData();ArrayList<Uri> selected=new ArrayList<>();if(data.getClipData()!=null){ClipData clip=data.getClipData();for(int i=0;i<clip.getItemCount();i++){Uri uri=clip.getItemAt(i).getUri();if(uri!=null)selected.add(uri);}}else if(data.getData()!=null)selected.add(data.getData());if(!selected.isEmpty())uris=selected.toArray(new Uri[0]);}ValueCallback<Uri[]> callback=pendingFileCallback;pendingFileCallback=null;callback.onReceiveValue(uris);}

    private void requestGeolocation(String origin,GeolocationPermissions.Callback callback){new AlertDialog.Builder(this).setTitle("Allow location access?").setMessage(origin+" is requesting your device location. Only allow this if it is needed for a feature you trust.").setNegativeButton("Deny",(d,w)->callback.invoke(origin,false,false)).setPositiveButton("Allow",(d,w)->{pendingGeo=new PendingGeo(origin,callback);pendingPermissionOrigin=origin;String[] p={Manifest.permission.ACCESS_FINE_LOCATION,Manifest.permission.ACCESS_COARSE_LOCATION};if(ContextCompat.checkSelfPermission(this,p[0])==PackageManager.PERMISSION_GRANTED||ContextCompat.checkSelfPermission(this,p[1])==PackageManager.PERMISSION_GRANTED){callback.invoke(origin,true,false);pendingGeo=null;sessionSiteGrants.add(origin+"|LOCATION");}else{waitingForPermissionResult=true;runtimePermissionsLauncher.launch(p);}}).show();}
    private static final class PendingGeo {String origin;GeolocationPermissions.Callback callback;PendingGeo(String o,GeolocationPermissions.Callback c){origin=o;callback=c;}}
    private void requestWebResources(PermissionRequest request){String origin=request.getOrigin().toString();String[] resources=request.getResources();boolean supported=true;ArrayList<String> needed=new ArrayList<>();for(String r:resources){if(PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(r)){needed.add(Manifest.permission.CAMERA);}else if(PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(r)){needed.add(Manifest.permission.RECORD_AUDIO);}else{supported=false;}}if(!supported||needed.isEmpty()){request.deny();toast("This site requested an unsupported browser permission.");return;}String description="";for(String r:resources)description+=PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(r)?"camera ":"microphone ";String finalDescription=description.trim();new AlertDialog.Builder(this).setTitle("Website permission request").setMessage(origin+" requests access to your "+finalDescription+". Android may also display its own permission prompt. Permission is denied unless you approve both.").setNegativeButton("Deny",(d,w)->request.deny()).setPositiveButton("Allow once",(d,w)->{pendingWebPermission=request;pendingPermissionOrigin=origin;boolean granted=true;for(String p:needed)if(ContextCompat.checkSelfPermission(this,p)!=PackageManager.PERMISSION_GRANTED)granted=false;if(granted){grantPendingWebPermission();}else{waitingForPermissionResult=true;runtimePermissionsLauncher.launch(needed.toArray(new String[0]));}}).show();}
    private void onRuntimePermissionsResult(java.util.Map<String,Boolean> result){waitingForPermissionResult=false;if(pendingGeo!=null){PendingGeo geo=pendingGeo;pendingGeo=null;boolean allowed=Boolean.TRUE.equals(result.get(Manifest.permission.ACCESS_FINE_LOCATION))||Boolean.TRUE.equals(result.get(Manifest.permission.ACCESS_COARSE_LOCATION))||ContextCompat.checkSelfPermission(this,Manifest.permission.ACCESS_FINE_LOCATION)==PackageManager.PERMISSION_GRANTED||ContextCompat.checkSelfPermission(this,Manifest.permission.ACCESS_COARSE_LOCATION)==PackageManager.PERMISSION_GRANTED;geo.callback.invoke(geo.origin,allowed,false);if(allowed)sessionSiteGrants.add(geo.origin+"|LOCATION");return;}grantPendingWebPermission();}
    private void grantPendingWebPermission(){PermissionRequest request=pendingWebPermission;if(request==null)return;pendingWebPermission=null;boolean all=true;for(String r:request.getResources()){if(PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(r)&&ContextCompat.checkSelfPermission(this,Manifest.permission.CAMERA)!=PackageManager.PERMISSION_GRANTED)all=false;if(PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(r)&&ContextCompat.checkSelfPermission(this,Manifest.permission.RECORD_AUDIO)!=PackageManager.PERMISSION_GRANTED)all=false;}try{if(all){request.grant(request.getResources());sessionSiteGrants.add(pendingPermissionOrigin+"|MEDIA");}else request.deny();}catch(Exception ignored){try{request.deny();}catch(Exception ignored2){}}}

    private void exportMetadataUnused() { /* intentionally no generic bridge is exposed to remote documents */ }
    private void syncStoreNoop() {}

    private static String limit(String s,int max){if(s==null)return "";return s.length()>max?s.substring(0,max):s;}
    private void syncButtonStatus() {}
    @Override protected void onPause(){super.onPause();for(Tab t:tabs)if(t.web!=null)t.web.onPause();if(!privateMode)saveSession();}
    @Override protected void onResume(){super.onResume();for(Tab t:tabs)if(t.web!=null)t.web.onResume();refreshDownloadStatuses();}
    @Override protected void onDestroy(){destroyed=true;try{unregisterReceiver(downloadReceiver);}catch(Exception ignored){}if(pendingFileCallback!=null){pendingFileCallback.onReceiveValue(null);pendingFileCallback=null;}if(pendingWebPermission!=null){try{pendingWebPermission.deny();}catch(Exception ignored){}pendingWebPermission=null;}if(privateMode){try{for(Tab t:tabs)if(t.web!=null){t.web.stopLoading();t.web.clearHistory();t.web.clearFormData();t.web.clearCache(true);t.web.destroy();t.web=null;}CookieManager c=CookieManager.getInstance();c.removeAllCookies(v->{});c.flush();WebStorage.getInstance().deleteAllData();CookieManager.getInstance().flush();}catch(Exception ignored){}}else{saveSession();for(Tab t:tabs)if(t.web!=null){try{if(t.web.getParent()!=null)((ViewGroup)t.web.getParent()).removeView(t.web);t.web.stopLoading();t.web.destroy();}catch(Exception ignored){}t.web=null;}}if(store!=null){BrowserStore closing=store;store=null;try{io.execute(closing::close);}catch(Exception ignored){closing.close();}}if(activeNormalActivity==this)activeNormalActivity=null;io.shutdown();super.onDestroy();}
}
