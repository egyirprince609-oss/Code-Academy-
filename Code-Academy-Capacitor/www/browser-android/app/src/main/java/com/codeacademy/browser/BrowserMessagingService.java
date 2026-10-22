package com.codeacademy.browser;

import android.content.Context;
import android.content.SharedPreferences;
import android.net.Uri;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.Map;

/** Remote FCM notifications work after registering this Android package in Firebase. */
public class BrowserMessagingService extends FirebaseMessagingService {
    @Override public void onNewToken(String token) {
        super.onNewToken(token);
        getSharedPreferences("ca_browser_native", Context.MODE_PRIVATE).edit().putString("fcm_token", token).apply();
    }

    @Override public void onMessageReceived(RemoteMessage message) {
        super.onMessageReceived(message);
        SharedPreferences prefs = getSharedPreferences("ca_browser_native", Context.MODE_PRIVATE);
        if (!prefs.getBoolean("notificationsEnabled", false)) return;
        String title = "Code Academy Browser", body = "You have a new browser update.", url = "";
        if (message.getNotification() != null) {
            if (message.getNotification().getTitle() != null) title = message.getNotification().getTitle();
            if (message.getNotification().getBody() != null) body = message.getNotification().getBody();
        }
        Map<String, String> data = message.getData();
        if (data.containsKey("title")) title = data.get("title");
        if (data.containsKey("body")) body = data.get("body");
        if (data.containsKey("url")) {
            String candidate = data.get("url");
            Uri uri = Uri.parse(candidate == null ? "" : candidate);
            if ("https".equalsIgnoreCase(uri.getScheme()) && uri.getHost() != null) url = candidate;
        }
        NativeNotifications.show(this, title, body, url, (int)(System.currentTimeMillis() & 0x7fffffff));
    }
}
