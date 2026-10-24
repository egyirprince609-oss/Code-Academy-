package com.wm.codeacademy.browser;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

/** Narrow Capacitor bridge: opens the native browser and exchanges validated metadata only. */
@CapacitorPlugin(name = "CodeAcademyBrowser")
public final class BrowserPlugin extends Plugin {
    @PluginMethod public void openBrowser(PluginCall call) {
        String url=call.getString("url",""); boolean privateMode=call.getBoolean("privateMode",false); boolean openSettings=call.getBoolean("openSettings",false); String profileId=call.getString("uid",""); if(profileId==null||!profileId.matches("[A-Za-z0-9_-]{1,128}"))profileId="device";
        Intent intent;
        if(Build.VERSION.SDK_INT<Build.VERSION_CODES.P){
            if(privateMode){call.reject("Private in-app browsing requires Android 9 or newer for a separate WebView data profile. Use the system browser's private mode instead.");return;}
            if(openSettings){call.reject("Code Academy's native browser settings require Android 9 or newer. Regular websites can still open in the system browser.");return;}
            String target=url==null||url.trim().isEmpty()?"https://www.google.com":url;
            if(BrowserUrlParser.isSafeWebUrl(target)){try{getActivity().startActivity(new Intent(Intent.ACTION_VIEW,Uri.parse(target)));call.resolve(new JSObject().put("opened",true).put("mode","system-browser"));}catch(Exception e){call.reject("No system browser can open this URL.");}}else{call.reject("This Android version requires a valid HTTP or HTTPS URL to open in the system browser.");}return;
        }
        intent=new Intent(getContext(),privateMode?PrivateBrowserActivity.class:BrowserActivity.class);
        if(!url.isEmpty())intent.putExtra(BrowserActivity.EXTRA_URL,url);
        intent.putExtra(BrowserActivity.EXTRA_PRIVATE,privateMode);intent.putExtra(BrowserActivity.EXTRA_PROFILE_ID,profileId);intent.putExtra("browser.openSettings",openSettings);
        try{getActivity().startActivity(intent);call.resolve(new JSObject().put("opened",true).put("mode",privateMode?"private-profile":"native-webview"));}
        catch(Exception e){call.reject("The Code Academy browser could not be opened.",e);}
    }

    @PluginMethod public void getSyncSnapshot(PluginCall call) {
        String profileId=call.getString("uid","");if(profileId==null||!profileId.matches("[A-Za-z0-9_-]{1,128}")){call.reject("A valid signed-in Code Academy profile is required to access cloud-sync data.");return;}
        BrowserStore store=new BrowserStore(getContext(),profileId);
        try {
            JSObject result=new JSObject();result.put("bookmarks",store.bookmarks(true));result.put("settings",typedSettings(store.settingSnapshot()));
            boolean historyOptIn="true".equalsIgnoreCase(store.getSetting("historySyncOptIn","false"));
            result.put("historySyncOptIn",historyOptIn);result.put("history",historyOptIn?store.historyForSync():new JSONArray());
            result.put("schemaVersion",2);call.resolve(result);
        } catch(Exception e){call.reject("Could not read on-device browser records.",e);} finally {store.close();}
    }
    @PluginMethod public void applySyncSnapshot(PluginCall call) {
        String profileId=call.getString("uid","");if(profileId==null||!profileId.matches("[A-Za-z0-9_-]{1,128}")){call.reject("A valid signed-in Code Academy profile is required to merge cloud-sync data.");return;}
        BrowserStore store=new BrowserStore(getContext(),profileId);
        try {
            JSONArray bookmarks=call.getData().optJSONArray("bookmarks");if(bookmarks==null)bookmarks=new JSONArray();for(int i=0;i<bookmarks.length();i++){JSONObject o=bookmarks.optJSONObject(i);if(o!=null)store.mergeBookmark(o);}
            JSONArray history=call.getData().optJSONArray("history");if(history==null)history=new JSONArray();for(int i=0;i<history.length();i++){JSONObject o=history.optJSONObject(i);if(o!=null)store.mergeHistory(o);}
            JSONObject settings=call.getData().optJSONObject("settings");if(settings!=null)store.mergeSettings(settings);
            call.resolve(new JSObject().put("applied",true).put("bookmarks",bookmarks.length()).put("history",history.length()));
        } catch(Exception e){call.reject("Could not merge browser records from cloud storage.",e);} finally {store.close();}
    }
    private JSONObject typedSettings(JSONObject values) throws Exception {
        JSONObject out=new JSONObject();Set<String> allowed=new HashSet<>(Arrays.asList("searchProvider","javascriptEnabled","textZoom","desktopMode","historyEnabled","previewsEnabled","darkChrome","historySyncOptIn"));
        for(String key:allowed){if(!values.has(key))continue;String value=values.optString(key,"");switch(key){case "javascriptEnabled":case "desktopMode":case "historyEnabled":case "previewsEnabled":case "darkChrome":case "historySyncOptIn":out.put(key,"true".equalsIgnoreCase(value));break;case "textZoom":try{out.put(key,Math.max(75,Math.min(150,Integer.parseInt(value))));}catch(Exception ignored){}break;case "searchProvider":out.put(key,"duckduckgo".equals(value)?"duckduckgo":"google");break;}}
        out.put("updatedAt",values.optLong("updatedAt",0));return out;
    }
}
