package com.wm.codeacademy.browser;

import android.os.Build;
import android.os.Bundle;

/** Dedicated process and WebView data directory for temporary private sessions (Android 9+). */
public final class PrivateBrowserActivity extends BrowserActivity {
    @Override public void onCreate(Bundle savedInstanceState) {
        privateMode = true;
        // BrowserActivity sets this suffix before creating the first WebView in this process.
        super.onCreate(savedInstanceState);
    }
}
