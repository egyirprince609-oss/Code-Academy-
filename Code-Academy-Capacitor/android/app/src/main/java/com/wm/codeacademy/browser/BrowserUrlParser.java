package com.wm.codeacademy.browser;

import android.net.Uri;
import java.net.IDN;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.regex.Pattern;

/** One parser for all address-bar entry. Never loads arbitrary schemes into WebView. */
public final class BrowserUrlParser {
    public enum Kind { WEB, EXTERNAL, INVALID, BLOCKED }
    public static final class Result {
        public final Kind kind; public final String value; public final String message;
        Result(Kind k, String v, String m) { kind=k; value=v; message=m; }
    }
    private static final Pattern DOMAIN_LIKE = Pattern.compile("(?i)^(?:localhost|(?:[\\p{Alnum}\\p{L}](?:[\\p{Alnum}\\p{L}-]{0,61}[\\p{Alnum}\\p{L}])?\\.)+[\\p{Alnum}\\p{L}-]{2,63}|(?:\\d{1,3}\\.){3}\\d{1,3})(?::\\d{1,5})?(?:[/?#].*)?$");
    private static final Pattern EXTERNAL_SCHEME = Pattern.compile("(?i)^(mailto|tel|sms|smsto|geo):.*$");
    private BrowserUrlParser() {}

    public static Result parse(String raw, String searchProvider) {
        String input = raw == null ? "" : raw.trim();
        if (input.isEmpty()) return new Result(Kind.INVALID, "", "Enter a website address or search phrase.");
        if (input.length() > 8192) return new Result(Kind.INVALID, "", "This address is too long.");
        String lower = input.toLowerCase(Locale.ROOT);
        if (lower.startsWith("javascript:") || lower.startsWith("file:") || lower.startsWith("content:") || lower.startsWith("data:") || lower.startsWith("blob:") || lower.startsWith("intent:") || lower.startsWith("android-app:") || lower.startsWith("ftp:")) {
            return new Result(Kind.BLOCKED, "", "This address scheme is blocked for safety.");
        }
        if (EXTERNAL_SCHEME.matcher(input).matches()) return new Result(Kind.EXTERNAL, input, "This link opens an Android app or phone function.");
        if (lower.startsWith("http://") || lower.startsWith("https://")) {
            Uri uri = Uri.parse(input);
            if (uri.getHost() == null || uri.getHost().isEmpty() || uri.getUserInfo() != null) return new Result(Kind.INVALID, "", "That web address is not valid.");
            if (uri.getPort() < -1 || uri.getPort() > 65535) return new Result(Kind.INVALID, "", "The port number is not valid.");
            return new Result(Kind.WEB, input, "");
        }
        // Do not silently interpret an unknown scheme as either a hostname or a search query.
        if (input.matches("(?i)^[a-z][a-z0-9+.-]*:.*$")) return new Result(Kind.BLOCKED, "", "This address scheme is not supported.");
        if (!input.matches(".*\\s+.*") && DOMAIN_LIKE.matcher(input).matches()) {
            try {
                Uri uri = Uri.parse("https://" + input);
                String host = uri.getHost();
                if (host == null || host.isEmpty()) return new Result(Kind.INVALID, "", "That website address is not valid.");
                // Android's Uri parser supports IDN hostnames on current Android versions. Normalize Unicode labels where possible.
                String asciiHost = IDN.toASCII(host);
                if (uri.getPort() > 65535) return new Result(Kind.INVALID, "", "The port number is not valid.");
                String path = uri.getEncodedPath(); if (path == null || path.isEmpty()) path = "/";
                StringBuilder out = new StringBuilder("https://").append(asciiHost);
                if (uri.getPort() != -1) out.append(':').append(uri.getPort());
                out.append(path);
                if (uri.getEncodedQuery() != null) out.append('?').append(uri.getEncodedQuery());
                if (uri.getEncodedFragment() != null) out.append('#').append(uri.getEncodedFragment());
                return new Result(Kind.WEB, out.toString(), "");
            } catch (IllegalArgumentException e) {
                return new Result(Kind.INVALID, "", "That website address is not valid.");
            }
        }
        String encoded = URLEncoder.encode(input, StandardCharsets.UTF_8);
        String provider = "duckduckgo".equalsIgnoreCase(searchProvider) ? "https://duckduckgo.com/?q=" : "https://www.google.com/search?q=";
        return new Result(Kind.WEB, provider + encoded, "");
    }

    public static boolean isSafeWebUrl(String value) {
        if (value == null || value.length() > 8192) return false;
        Uri uri = Uri.parse(value);
        String scheme = uri.getScheme();
        return uri.getHost() != null && ("https".equalsIgnoreCase(scheme) || "http".equalsIgnoreCase(scheme)) && uri.getUserInfo() == null;
    }
    public static String origin(String url) {
        Uri uri = Uri.parse(url == null ? "" : url);
        if (uri.getHost() == null) return "Unknown origin";
        int port = uri.getPort();
        return uri.getScheme() + "://" + uri.getHost() + (port == -1 ? "" : ":" + port);
    }
    public static String domain(String url) { Uri u=Uri.parse(url == null ? "" : url); return u.getHost() == null ? "" : u.getHost(); }
}
