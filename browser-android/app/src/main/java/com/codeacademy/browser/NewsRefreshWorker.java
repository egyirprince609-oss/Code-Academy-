package com.codeacademy.browser;

import android.content.Context;
import android.content.SharedPreferences;
import android.net.Uri;

import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import org.xmlpull.v1.XmlPullParser;
import org.xmlpull.v1.XmlPullParserFactory;

import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

public class NewsRefreshWorker extends Worker {
    private static final String PREFS = "ca_browser_native";
    public NewsRefreshWorker(@NonNull Context context, @NonNull WorkerParameters params) { super(context, params); }

    @NonNull @Override public Result doWork() {
        Context context = getApplicationContext();
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        if (!prefs.getBoolean("notificationsEnabled", false)) return Result.success();
        try {
            String[] item = latestHeadline();
            if (item == null || item[0].isEmpty()) return Result.retry();
            String signature = item[1].isEmpty() ? item[0] : item[1];
            String previous = prefs.getString("last_headline_signature", "");
            prefs.edit().putString("last_headline_signature", signature).apply();
            // First successful run establishes the baseline; later fresh headlines notify.
            if (!previous.isEmpty() && !previous.equals(signature)) {
                String url = safeHttps(item[2]);
                NativeNotifications.show(context, item[0], "New headline on the browser home feed.", url, (int)(System.currentTimeMillis() & 0x7fffffff));
            }
            return Result.success();
        } catch (Exception exception) {
            return Result.retry();
        }
    }

    private String[] latestHeadline() throws Exception {
        HttpURLConnection connection = null;
        try {
            URL url = new URL("https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en");
            connection = (HttpURLConnection) url.openConnection();
            connection.setConnectTimeout(4000); connection.setReadTimeout(4000);
            connection.setRequestProperty("User-Agent", "CodeAcademyBrowser/1.0");
            connection.setRequestProperty("Accept", "application/rss+xml, application/xml, text/xml");
            connection.connect();
            if (connection.getResponseCode() < 200 || connection.getResponseCode() >= 300) throw new IllegalStateException("News RSS HTTP " + connection.getResponseCode());
            try (InputStream input = connection.getInputStream()) {
                XmlPullParser parser = XmlPullParserFactory.newInstance().newPullParser();
                parser.setInput(input, "UTF-8");
                String title = "", link = "", guid = ""; boolean inItem = false; String tag = "";
                for (int event = parser.getEventType(); event != XmlPullParser.END_DOCUMENT; event = parser.next()) {
                    if (event == XmlPullParser.START_TAG) {
                        tag = parser.getName();
                        if ("item".equalsIgnoreCase(tag)) { inItem = true; title = ""; link = ""; guid = ""; }
                    } else if (event == XmlPullParser.TEXT && inItem) {
                        if ("title".equalsIgnoreCase(tag)) title = parser.getText().trim();
                        else if ("link".equalsIgnoreCase(tag)) link = parser.getText().trim();
                        else if ("guid".equalsIgnoreCase(tag)) guid = parser.getText().trim();
                    } else if (event == XmlPullParser.END_TAG) {
                        if ("item".equalsIgnoreCase(parser.getName()) && inItem) return new String[]{title, guid, link};
                        tag = "";
                    }
                }
            }
            return null;
        } finally { if (connection != null) connection.disconnect(); }
    }

    private String safeHttps(String raw) {
        try {
            Uri uri = Uri.parse(raw);
            if ("https".equalsIgnoreCase(uri.getScheme()) && uri.getHost() != null) return uri.toString();
        } catch (Exception ignored) {}
        return "https://news.google.com/";
    }
}
