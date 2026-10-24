package com.wm.codeacademy.browser;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;
import android.net.Uri;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import java.util.ArrayList;
import java.util.UUID;

/** Local-first browser metadata store. Call heavier list/read/write methods from an IO executor. */
public final class BrowserStore extends SQLiteOpenHelper {
    private static final String DB_NAME = "code_academy_browser.db";
    private static final int DB_VERSION = 3;
    public BrowserStore(Context context) { this(context, "device"); }
    public BrowserStore(Context context, String profileId) { super(context, DB_NAME.replace(".db", "_" + profileSuffix(profileId) + ".db"), null, DB_VERSION); setWriteAheadLoggingEnabled(true); }
    private static String profileSuffix(String value) {
        try { java.security.MessageDigest digest=java.security.MessageDigest.getInstance("SHA-256"); byte[] bytes=digest.digest((value==null||value.isEmpty()?"device":value).getBytes(java.nio.charset.StandardCharsets.UTF_8)); StringBuilder out=new StringBuilder(); for(int i=0;i<8;i++)out.append(String.format(java.util.Locale.ROOT,"%02x",bytes[i])); return out.toString(); }
        catch(Exception e){return "device";}
    }
    @Override public void onCreate(SQLiteDatabase db) {
        db.execSQL("CREATE TABLE bookmarks(id TEXT PRIMARY KEY,url TEXT NOT NULL UNIQUE,title TEXT NOT NULL,domain TEXT,folder TEXT,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,deleted_at INTEGER NOT NULL DEFAULT 0)");
        db.execSQL("CREATE INDEX idx_bookmarks_updated ON bookmarks(updated_at DESC)");
        db.execSQL("CREATE TABLE history(id TEXT PRIMARY KEY,url TEXT NOT NULL,title TEXT NOT NULL,domain TEXT,visited_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,deleted_at INTEGER NOT NULL DEFAULT 0)");
        db.execSQL("CREATE INDEX idx_history_visited ON history(visited_at DESC)");
        db.execSQL("CREATE TABLE downloads(id TEXT PRIMARY KEY,source_url TEXT NOT NULL,filename TEXT NOT NULL,mime_type TEXT,download_id INTEGER NOT NULL DEFAULT -1,status TEXT NOT NULL,local_uri TEXT,size INTEGER NOT NULL DEFAULT 0,bytes_downloaded INTEGER NOT NULL DEFAULT 0,total_bytes INTEGER NOT NULL DEFAULT 0,created_at INTEGER NOT NULL,error TEXT)");
        db.execSQL("CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at INTEGER NOT NULL)");
    }
    @Override public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {
        // Schema 1 -> 2 adds tombstones for history sync without deleting existing visits.
        if (oldVersion == 1) {
            db.execSQL("ALTER TABLE history ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0");
            db.execSQL("ALTER TABLE history ADD COLUMN deleted_at INTEGER NOT NULL DEFAULT 0");
            db.execSQL("UPDATE history SET updated_at=visited_at WHERE updated_at=0");
            oldVersion = 2;
        }
        if (oldVersion == 2) {
            db.execSQL("ALTER TABLE downloads ADD COLUMN bytes_downloaded INTEGER NOT NULL DEFAULT 0");
            db.execSQL("ALTER TABLE downloads ADD COLUMN total_bytes INTEGER NOT NULL DEFAULT 0");
        }
    }
    public synchronized JSONObject settingSnapshot() throws JSONException {
        JSONObject o = new JSONObject(); SQLiteDatabase db=getReadableDatabase(); long updated=0;
        try (Cursor c=db.rawQuery("SELECT key,value,updated_at FROM settings",null)) { while(c.moveToNext()) { o.put(c.getString(0),c.getString(1)); updated=Math.max(updated,c.getLong(2)); } }
        o.put("updatedAt",updated); return o;
    }
    public synchronized long settingsUpdatedAt(){try(Cursor c=getReadableDatabase().rawQuery("SELECT COALESCE(MAX(updated_at),0) FROM settings",null)){return c.moveToFirst()?c.getLong(0):0;}}
    public synchronized void mergeSettings(JSONObject remote) throws JSONException {
        long remoteTime=remote.optLong("updatedAt",0); if(remoteTime<=settingsUpdatedAt())return;
        String[] allowed={"searchProvider","javascriptEnabled","textZoom","desktopMode","historyEnabled","previewsEnabled","darkChrome","historySyncOptIn"};
        for(String key:allowed){if(remote.has(key)){String value=String.valueOf(remote.opt(key));if(value.length()<40)setSettingAt(key,value,remoteTime);}}
    }
    private void setSettingAt(String key,String value,long timestamp){ContentValues v=new ContentValues();v.put("key",key);v.put("value",value);v.put("updated_at",timestamp);getWritableDatabase().insertWithOnConflict("settings",null,v,SQLiteDatabase.CONFLICT_REPLACE);}
    public synchronized void clearSettings(){getWritableDatabase().delete("settings",null,null);}
    public synchronized String getSetting(String key, String fallback) {
        try (Cursor c=getReadableDatabase().rawQuery("SELECT value FROM settings WHERE key=?",new String[]{key})) { return c.moveToFirst()?c.getString(0):fallback; }
    }
    public synchronized void setSetting(String key, String value) {
        ContentValues v=new ContentValues();v.put("key",key);v.put("value",value==null?"":value);v.put("updated_at",System.currentTimeMillis());
        getWritableDatabase().insertWithOnConflict("settings",null,v,SQLiteDatabase.CONFLICT_REPLACE);
    }
    public synchronized JSONArray bookmarks(boolean includeDeleted) throws JSONException {
        JSONArray a=new JSONArray(); String sql="SELECT id,url,title,domain,folder,created_at,updated_at,deleted_at FROM bookmarks"+(includeDeleted?"":" WHERE deleted_at=0")+" ORDER BY updated_at DESC";
        try(Cursor c=getReadableDatabase().rawQuery(sql,null)){while(c.moveToNext()) a.put(new JSONObject().put("id",c.getString(0)).put("url",c.getString(1)).put("title",c.getString(2)).put("domain",c.getString(3)).put("folder",c.getString(4)).put("createdAt",c.getLong(5)).put("updatedAt",c.getLong(6)).put("deletedAt",c.getLong(7)));} return a;
    }
    public synchronized JSONObject saveBookmark(String url,String title,String folder,long deletedAt) throws JSONException {
        SQLiteDatabase db=getWritableDatabase(); long now=System.currentTimeMillis();
        try(Cursor c=db.rawQuery("SELECT id,created_at FROM bookmarks WHERE url=?",new String[]{url})){
            if(c.moveToFirst()) { String id=c.getString(0); ContentValues v=new ContentValues();v.put("title",title);v.put("domain",BrowserUrlParser.domain(url));v.put("folder",folder);v.put("updated_at",now);v.put("deleted_at",deletedAt);db.update("bookmarks",v,"id=?",new String[]{id});return bookmarkById(id); }
        }
        String id=UUID.randomUUID().toString();ContentValues v=new ContentValues();v.put("id",id);v.put("url",url);v.put("title",title);v.put("domain",BrowserUrlParser.domain(url));v.put("folder",folder);v.put("created_at",now);v.put("updated_at",now);v.put("deleted_at",deletedAt);db.insertOrThrow("bookmarks",null,v);return bookmarkById(id);
    }
    public synchronized JSONObject bookmarkById(String id) throws JSONException {
        try(Cursor c=getReadableDatabase().rawQuery("SELECT id,url,title,domain,folder,created_at,updated_at,deleted_at FROM bookmarks WHERE id=?",new String[]{id})){
            if(!c.moveToFirst()) return new JSONObject();return new JSONObject().put("id",c.getString(0)).put("url",c.getString(1)).put("title",c.getString(2)).put("domain",c.getString(3)).put("folder",c.getString(4)).put("createdAt",c.getLong(5)).put("updatedAt",c.getLong(6)).put("deletedAt",c.getLong(7));}
    }
    public synchronized void deleteBookmark(String id) { ContentValues v=new ContentValues();long now=System.currentTimeMillis();v.put("deleted_at",now);v.put("updated_at",now);getWritableDatabase().update("bookmarks",v,"id=?",new String[]{id}); }
    public synchronized void mergeBookmark(JSONObject o) throws JSONException {
        String id=o.optString("id"),url=o.optString("url"); if(id.isEmpty()||!BrowserUrlParser.isSafeWebUrl(url)||url.length()>4096||id.length()>64)return;
        long updated=o.optLong("updatedAt",0), deleted=o.optLong("deletedAt",0); SQLiteDatabase db=getWritableDatabase();
        try(Cursor c=db.rawQuery("SELECT id,updated_at FROM bookmarks WHERE id=? OR url=?",new String[]{id,url})) {
            if(c.moveToFirst() && c.getLong(1)>updated) return;
        }
        ContentValues v=new ContentValues();v.put("id",id);v.put("url",url);v.put("title",limit(o.optString("title","Website"),300));v.put("domain",BrowserUrlParser.domain(url));v.put("folder",limit(o.optString("folder","Favourites"),80));v.put("created_at",o.optLong("createdAt",updated));v.put("updated_at",updated>0?updated:System.currentTimeMillis());v.put("deleted_at",deleted);
        // Resolve duplicate URLs deterministically by URL: tombstone older duplicate before insert.
        db.delete("bookmarks","url=? AND id<>?",new String[]{url,id});db.insertWithOnConflict("bookmarks",null,v,SQLiteDatabase.CONFLICT_REPLACE);
    }
    public synchronized void recordVisit(String url,String title,boolean enabled) {
        if(!enabled||!BrowserUrlParser.isSafeWebUrl(url)||url.length()>4096)return; long now=System.currentTimeMillis();SQLiteDatabase db=getWritableDatabase();
        try(Cursor c=db.rawQuery("SELECT visited_at FROM history WHERE url=? ORDER BY visited_at DESC LIMIT 1",new String[]{url})){if(c.moveToFirst()&&now-c.getLong(0)<2500)return;}
        ContentValues v=new ContentValues();v.put("id",UUID.randomUUID().toString());v.put("url",url);v.put("title",limit(title==null||title.isEmpty()?url:title,300));v.put("domain",BrowserUrlParser.domain(url));v.put("visited_at",now);v.put("updated_at",now);v.put("deleted_at",0);db.insert("history",null,v);
        db.execSQL("DELETE FROM history WHERE id IN (SELECT id FROM history ORDER BY visited_at DESC LIMIT -1 OFFSET 1000)");
    }
    public synchronized JSONArray history(int max) throws JSONException {
        JSONArray a=new JSONArray();try(Cursor c=getReadableDatabase().rawQuery("SELECT id,url,title,domain,visited_at,updated_at,deleted_at FROM history WHERE deleted_at=0 ORDER BY visited_at DESC LIMIT ?",new String[]{String.valueOf(Math.max(1,Math.min(1000,max)))})){while(c.moveToNext())a.put(new JSONObject().put("id",c.getString(0)).put("url",c.getString(1)).put("title",c.getString(2)).put("domain",c.getString(3)).put("visitedAt",c.getLong(4)).put("createdAt",c.getLong(4)).put("updatedAt",c.getLong(5)).put("deletedAt",c.getLong(6)));}return a;
    }
    public synchronized JSONArray historyForSync() throws JSONException {
        JSONArray a=new JSONArray();try(Cursor c=getReadableDatabase().rawQuery("SELECT id,url,title,domain,visited_at,updated_at,deleted_at FROM history ORDER BY updated_at DESC LIMIT 1000",null)){while(c.moveToNext())a.put(new JSONObject().put("id",c.getString(0)).put("url",c.getString(1)).put("title",c.getString(2)).put("domain",c.getString(3)).put("visitedAt",c.getLong(4)).put("createdAt",c.getLong(4)).put("updatedAt",c.getLong(5)).put("deletedAt",c.getLong(6)));}return a;
    }
    public synchronized void deleteHistory(String id) {ContentValues v=new ContentValues();long now=System.currentTimeMillis();v.put("deleted_at",now);v.put("updated_at",now);getWritableDatabase().update("history",v,"id=?",new String[]{id});}
    public synchronized void clearHistory() {ContentValues v=new ContentValues();long now=System.currentTimeMillis();v.put("deleted_at",now);v.put("updated_at",now);getWritableDatabase().update("history",v,"deleted_at=0",null);}
    public synchronized JSONArray downloads() throws JSONException {JSONArray a=new JSONArray();try(Cursor c=getReadableDatabase().rawQuery("SELECT id,source_url,filename,mime_type,download_id,status,local_uri,size,bytes_downloaded,total_bytes,created_at,error FROM downloads ORDER BY created_at DESC LIMIT 300",null)){while(c.moveToNext())a.put(new JSONObject().put("id",c.getString(0)).put("sourceUrl",c.getString(1)).put("filename",c.getString(2)).put("mimeType",c.getString(3)).put("downloadId",c.getLong(4)).put("status",c.getString(5)).put("localUri",c.getString(6)).put("size",c.getLong(7)).put("bytesDownloaded",c.getLong(8)).put("totalBytes",c.getLong(9)).put("createdAt",c.getLong(10)).put("error",c.getString(11)));}return a;}
    public synchronized void addDownload(String id,String source,String filename,String mime,long downloadId) {ContentValues v=new ContentValues();v.put("id",id);v.put("source_url",source);v.put("filename",filename);v.put("mime_type",mime);v.put("download_id",downloadId);v.put("status","queued");v.put("created_at",System.currentTimeMillis());getWritableDatabase().insertWithOnConflict("downloads",null,v,SQLiteDatabase.CONFLICT_REPLACE);}
    public synchronized void updateDownload(String id,String status,String uri,long bytesDownloaded,long totalBytes,String error){ContentValues v=new ContentValues();v.put("status",status);v.put("local_uri",uri);v.put("bytes_downloaded",Math.max(0,bytesDownloaded));v.put("total_bytes",Math.max(0,totalBytes));v.put("size",Math.max(0,totalBytes));v.put("error",error);getWritableDatabase().update("downloads",v,"id=?",new String[]{id});}
    public synchronized void deleteDownload(String id){getWritableDatabase().delete("downloads","id=?",new String[]{id});}
    public synchronized void mergeHistory(JSONObject o) {String id=o.optString("id"),url=o.optString("url");if(id.isEmpty()||!BrowserUrlParser.isSafeWebUrl(url)||url.length()>4096)return;long updated=o.optLong("updatedAt",o.optLong("visitedAt",0));try(Cursor c=getReadableDatabase().rawQuery("SELECT updated_at FROM history WHERE id=?",new String[]{id})){if(c.moveToFirst()&&c.getLong(0)>updated)return;}ContentValues v=new ContentValues();v.put("id",id);v.put("url",url);v.put("title",limit(o.optString("title","Website"),300));v.put("domain",BrowserUrlParser.domain(url));v.put("visited_at",o.optLong("visitedAt",o.optLong("createdAt",System.currentTimeMillis())));v.put("updated_at",updated>0?updated:System.currentTimeMillis());v.put("deleted_at",o.optLong("deletedAt",0));getWritableDatabase().insertWithOnConflict("history",null,v,SQLiteDatabase.CONFLICT_REPLACE);}
    private static String limit(String x,int max){if(x==null)return "";return x.length()>max?x.substring(0,max):x;}
}
