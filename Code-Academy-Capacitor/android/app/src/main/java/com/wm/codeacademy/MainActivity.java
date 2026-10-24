package com.wm.codeacademy;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.wm.codeacademy.browser.BrowserPlugin;

public class MainActivity extends BridgeActivity {
    @Override public void onCreate(Bundle savedInstanceState) {
        registerPlugin(BrowserPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
