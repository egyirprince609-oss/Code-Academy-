/* Code Academy Shield — browser-side protection helpers.
   Selected files and pasted content stay local. This is not a native antivirus,
   Android notification listener, device firewall, or background VPN service. */
let auth = null;
let db = null;
let onAuthStateChanged = null;
let createReferralCode = null;
let sendNotification = null;
let firestoreApi = null;

const STORE_KEY = 'ca_shield_preferences_v1';
const FIRESTORE_PATH = ['users', 'securitySettings', 'shield'];
const PBKDF2_ITERATIONS = 310000;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const SAFE_TEXT_EXTENSIONS = new Set(['txt','md','csv','json','xml','html','htm','js','css','log','eml','svg','yaml','yml']);
const SHORTENERS = new Set(['bit.ly','tinyurl.com','t.co','is.gd','cutt.ly','shorturl.at','rb.gy','ow.ly','buff.ly','lnkd.in']);
const SUSPICIOUS_TLDS = new Set(['zip','mov','click','country','gq','tk','work','support','top','rest','xyz','buzz']);
const SUSPICIOUS_TERMS = /\b(verify (?:your )?account|urgent payment|claim (?:your )?prize|password expired|wallet recovery|seed phrase|free gift|act now|account suspended|confirm identity|mfa code|one[- ]time password|remote access)\b/i;
const DEFAULT_PREFERENCES = Object.freeze({
  theme: 'dark',
  checksEnabled: true,
  fileScanning: true,
  messageReview: true,
  notifications: false,
  soundAlerts: false,
  vibration: false,
  locationPermission: false,
  appSources: ['WhatsApp','SMS / Messages','Telegram','Email','Browser'],
  blockedLinks: [],
  passwordHash: '',
  passwordSalt: '',
  passwordUpdatedAt: null,
  firewallGuideSeen: false
});

let signedInUser = null;
let preferences = loadLocalPreferences();
const MALICIOUS_SCRIPT_TERMS = /\b(?:eval\s*\(|document\.write\s*\(|powershell\s+-enc\b|base64\s+-d\b|cmd\.exe\s+\/c\b|curl\s+[^\n]+\|\s*(?:sh|bash)\b|wget\s+[^\n]+\|\s*(?:sh|bash)\b)/i;
function cloneDefaultPreferences(){ return JSON.parse(JSON.stringify(DEFAULT_PREFERENCES)); }
function normalisePreferences(input){
  const value = { ...cloneDefaultPreferences(), ...(input && typeof input === 'object' ? input : {}) };
  if (!['dark','light'].includes(value.theme)) value.theme = 'dark';
  for (const key of ['checksEnabled','fileScanning','messageReview','notifications','soundAlerts','vibration','locationPermission','firewallGuideSeen']) {
    if (typeof value[key] !== 'boolean') value[key] = DEFAULT_PREFERENCES[key];
  }
  const permittedSources = ['WhatsApp','SMS / Messages','Telegram','Email','Browser','Other'];
  value.appSources = Array.isArray(value.appSources) ? [...new Set(value.appSources.filter(item => permittedSources.includes(item)))].slice(0,6) : [...DEFAULT_PREFERENCES.appSources];
  value.blockedLinks = Array.isArray(value.blockedLinks) ? [...new Set(value.blockedLinks.filter(item => typeof item === 'string' && /^https?:\/\//i.test(item)))].slice(0,150) : [];
  if (typeof value.passwordHash !== 'string') value.passwordHash = '';
  if (typeof value.passwordSalt !== 'string') value.passwordSalt = '';
  if (value.passwordUpdatedAt !== null && typeof value.passwordUpdatedAt !== 'string') value.passwordUpdatedAt = null;
  return value;
}
function loadLocalPreferences(uid=null){
  try {
    const storageKey = `${STORE_KEY}:${uid || 'device'}`;
    const stored = JSON.parse(localStorage.getItem(storageKey) || '{}');
    return normalisePreferences(stored);
  } catch { return cloneDefaultPreferences(); }
}
function saveLocalPreferences(){
  try { localStorage.setItem(`${STORE_KEY}:${signedInUser?.uid || 'device'}`, JSON.stringify(preferences)); }
  catch (error) { console.warn('Shield preferences could not be saved on this browser:', error); }
}
function userSettingsRef(uid){
  if (!firestoreApi || !db) throw new Error('Account storage is not available yet.');
  return firestoreApi.doc(db, 'users', uid, ...FIRESTORE_PATH.slice(1));
}
function safeTime(){ return new Date().toISOString(); }
function escapeHtml(value){ return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }
function setStatus(message, type='info'){
  const node = document.getElementById('globalStatus');
  if (!node) return;
  node.textContent = message;
  node.dataset.kind = type;
  node.hidden = false;
}
function toast(message, type='info'){
  const node = document.getElementById('toast');
  if (!node) return;
  node.textContent = message;
  node.dataset.kind = type;
  node.classList.add('show');
  window.clearTimeout(toast._timer);
  toast._timer = window.setTimeout(() => node.classList.remove('show'), 3200);
}
function applyTheme(){
  document.documentElement.dataset.theme = preferences.theme === 'light' ? 'light' : 'dark';
  const button = document.getElementById('themeToggle');
  if (button) {
    button.innerHTML = preferences.theme === 'light' ? '<i class="fa-solid fa-moon"></i><span>Dark tone</span>' : '<i class="fa-solid fa-sun"></i><span>Light tone</span>';
    button.setAttribute('aria-pressed', String(preferences.theme === 'light'));
  }
}
function drawControls(){
  const pairs = [
    ['prefChecks', 'checksEnabled'], ['prefFiles', 'fileScanning'], ['prefMessages', 'messageReview'],
    ['prefNotifications', 'notifications'], ['prefSound', 'soundAlerts'], ['prefVibration', 'vibration'],
    ['prefLocation', 'locationPermission']
  ];
  for (const [elementId, key] of pairs) {
    const el = document.getElementById(elementId);
    if (el) el.checked = Boolean(preferences[key]);
  }
  const area = document.getElementById('appSourceChoices');
  if (area) {
    const options = ['WhatsApp','SMS / Messages','Telegram','Email','Browser','Other'];
    area.innerHTML = options.map(name => `<label class="source-option"><input type="checkbox" data-app-source="${escapeHtml(name)}" ${preferences.appSources.includes(name) ? 'checked' : ''}><span>${escapeHtml(name)}</span></label>`).join('');
    area.querySelectorAll('[data-app-source]').forEach(input => input.addEventListener('change', () => {
      const source = input.dataset.appSource;
      preferences.appSources = input.checked ? [...new Set([...preferences.appSources, source])] : preferences.appSources.filter(item => item !== source);
      persistPreferences('Source labels updated', false);
    }));
  }
  const blockCount = document.getElementById('blockedCount');
  if (blockCount) blockCount.textContent = String(preferences.blockedLinks.length);
  const protectionText = document.getElementById('protectionStatusText');
  const protectionPill = document.getElementById('protectionPill');
  if (protectionText) protectionText.textContent = preferences.checksEnabled ? 'Manual checks active' : 'Manual checks paused';
  if (protectionPill) {
    protectionPill.classList.toggle('paused', !preferences.checksEnabled);
    protectionPill.innerHTML = `<span class="status-dot"></span>${preferences.checksEnabled ? 'CHECKS ACTIVE' : 'CHECKS PAUSED'}`;
  }
  const pwdState = document.getElementById('passwordState');
  if (pwdState) pwdState.textContent = preferences.passwordHash ? 'Settings lock is active' : 'No settings password set';
  const pauseBtn = document.getElementById('pauseChecksBtn');
  if (pauseBtn) {
    pauseBtn.innerHTML = preferences.checksEnabled ? '<i class="fa-solid fa-pause"></i> Pause checks' : '<i class="fa-solid fa-play"></i> Resume checks';
    pauseBtn.classList.toggle('danger-button', preferences.checksEnabled);
  }
}

async function persistPreferences(reason='Security settings updated', notify=false){
  saveLocalPreferences();
  drawControls();
  if (signedInUser) {
    try {
      await firestoreApi.setDoc(userSettingsRef(signedInUser.uid), {
        theme: preferences.theme,
        checksEnabled: preferences.checksEnabled,
        fileScanning: preferences.fileScanning,
        messageReview: preferences.messageReview,
        soundAlerts: preferences.soundAlerts,
        vibration: preferences.vibration,
        appSources: preferences.appSources,
        passwordHash: preferences.passwordHash,
        passwordSalt: preferences.passwordSalt,
        passwordUpdatedAt: preferences.passwordUpdatedAt || null,
        firewallGuideSeen: preferences.firewallGuideSeen,
        updatedAt: firestoreApi.serverTimestamp()
      }, { merge: true });
    } catch (error) {
      console.warn('Shield cloud sync unavailable; local settings are still saved.', error);
      toast('Saved on this device. Account sync was unavailable.', 'warning');
      return false;
    }
  }
  if (notify) await publishEvent({ title:'Security settings updated', message:reason, type:'security', icon:'🛡️' });
  return true;
}

async function loadCloudPreferences(user){
  const nextUid = user?.uid || null;
  if ((signedInUser?.uid || null) !== nextUid) preferences = loadLocalPreferences(nextUid);
  signedInUser = user || null;
  document.getElementById('accountState').textContent = user ? `Synced to ${user.email || 'your Code Academy account'}` : 'Device-only mode · sign in to sync';
  document.getElementById('shareSecurityBtn').disabled = !user;
  if (!user) { drawControls(); return; }
  try {
    const snapshot = await firestoreApi.getDoc(userSettingsRef(user.uid));
    if (snapshot.exists()) {
      const cloud = snapshot.data();
      const merged = { ...preferences };
      for (const key of ['theme','checksEnabled','fileScanning','messageReview','soundAlerts','vibration','appSources','passwordHash','passwordSalt','passwordUpdatedAt','firewallGuideSeen']) {
        if (cloud[key] !== undefined) merged[key] = cloud[key];
      }
      merged.appSources = Array.isArray(cloud.appSources) ? cloud.appSources : preferences.appSources;
      // Browser permissions and exact URL denylist entries remain local to this account/device.
      merged.notifications = preferences.notifications;
      merged.locationPermission = preferences.locationPermission;
      merged.blockedLinks = preferences.blockedLinks;
      preferences = normalisePreferences(merged);
      saveLocalPreferences();
      drawControls();
      applyTheme();
      if (preferences.notifications && 'Notification' in window && Notification.permission === 'granted') {
        document.getElementById('nativeNoticeState').textContent = 'Browser notification permission granted';
      }
    } else {
      await persistPreferences('Security Center initialised', false);
    }
  } catch (error) {
    console.warn('Could not load security preferences from the account.', error);
    document.getElementById('accountState').textContent = 'Cloud sync needs Firestore rules · device mode remains available';
  }
  drawControls();
}

async function publishEvent({title, message, type='security', icon='🛡️', link='security-center.html', uniqueKey=''}={}){
  showInPageAlert(title, message, type);
  // Start audible/vibration feedback before asynchronous work can consume the browser's user activation.
  if (preferences.vibration && navigator.vibrate) { try { navigator.vibrate([220,90,220,90,440]); } catch {} }
  if (preferences.soundAlerts) playAlarm();
  if (preferences.notifications && 'Notification' in window && Notification.permission === 'granted') {
    try {
      const registration = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : null;
      const options = { body: message, icon:'./web-app-manifest-192x192.png', badge:'./web-app-manifest-192x192.png', tag:uniqueKey || `shield-${Date.now()}`, data:{url:link}, vibrate: preferences.vibration ? [250,100,250,100,500] : [] };
      if (registration) await registration.showNotification(title, options);
      else new Notification(title, options);
    } catch (error) { console.warn('Browser notification was unavailable:', error); }
  }
  if (auth?.currentUser && sendNotification) {
    try {
      await sendNotification({ title, message, type, icon, link, uniqueKey });
      toast('Security alert saved to your Code Academy notifications.', 'warning');
    } catch (error) {
      console.warn('Account notification could not be saved.', error);
      toast('Alert shown here; account notification could not be saved.', 'warning');
    }
  }
}

function showInPageAlert(title, message, type='info'){
  const panel = document.getElementById('alertPanel');
  panel.querySelector('.empty-state')?.remove();
  const item = document.createElement('article');
  item.className = `alert-row ${type === 'security' || type === 'warning' ? 'alert-warning' : ''}`;
  item.innerHTML = `<div class="alert-symbol"><i class="fa-solid fa-${type === 'security' || type === 'warning' ? 'triangle-exclamation' : 'shield-halved'}"></i></div><div><strong>${escapeHtml(title)}</strong><p>${escapeHtml(message)}</p><small>${new Date().toLocaleString()}</small></div>`;
  panel.prepend(item);
  while (panel.children.length > 4) panel.lastElementChild.remove();
}

function playAlarm(){
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const sequence = [880,660,880,660,990];
    sequence.forEach((frequency,index) => {
      const start = context.currentTime + index * 0.18;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'sawtooth';
      oscillator.frequency.setValueAtTime(frequency,start);
      gain.gain.setValueAtTime(0.0001,start);
      gain.gain.exponentialRampToValueAtTime(0.35,start+0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001,start+0.13);
      oscillator.connect(gain); gain.connect(context.destination);
      oscillator.start(start); oscillator.stop(start+0.15);
    });
    window.setTimeout(() => context.close().catch(()=>{}), 1500);
  } catch (error) { console.info('Audio alerts need a user gesture and compatible browser.', error); }
}

function normaliseUrl(input){
  const trimmed = String(input || '').trim();
  if (!trimmed) throw new Error('Paste a URL first.');
  if (/\s/.test(trimmed)) throw new Error('The URL contains spaces. Paste the complete link only.');
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let parsed;
  try { parsed = new URL(candidate); } catch { throw new Error('That does not look like a valid web address.'); }
  if (!['http:','https:'].includes(parsed.protocol)) throw new Error('Only HTTP and HTTPS links can be checked.');
  if (!parsed.hostname || parsed.hostname.length > 253) throw new Error('The web address is incomplete or invalid.');
  return { input: trimmed, url: parsed, canonical: parsed.href };
}
function analyseUrl(input){
  const parsedResult = normaliseUrl(input);
  const url = parsedResult.url;
  const hostname = url.hostname.toLowerCase().replace(/\.$/,'');
  const labels = hostname.split('.');
  const flags = [];
  let score = 0;
  const add = (points, message) => { score += points; flags.push(message); };
  if (preferences.blockedLinks.includes(parsedResult.canonical) || preferences.blockedLinks.includes(`${url.origin}/`)) add(100,'This address matches your saved local denylist.');
  if (hostname.startsWith('xn--') || labels.some(label => label.startsWith('xn--'))) add(35,'Internationalised/punycode hostname: check for look-alike characters.');
  if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(hostname)) add(35,'The link uses a raw IPv4 address instead of a familiar domain.');
  if (url.username || url.password) add(35,'The link contains user-info syntax that can hide the true destination.');
  if (url.protocol === 'http:') add(12,'The connection uses HTTP rather than encrypted HTTPS.');
  if (SHORTENERS.has(hostname) || SHORTENERS.has(hostname.replace(/^www\./,''))) add(16,'A URL shortener hides the final destination until it is expanded.');
  if (labels.length >= 5) add(10,'The address has an unusually deep subdomain chain.');
  if (SUSPICIOUS_TLDS.has(labels.at(-1))) add(8,'The top-level domain is sometimes abused; this alone does not prove harm.');
  if (/\b(login|signin|verify|secure|wallet|gift|bonus|claim|password|account|update|unlock|banking|support)\b/i.test(`${hostname}${url.pathname}`)) add(12,'The address uses words often seen in credential or prize lures.');
  if (/%[0-9a-f]{2}/i.test(url.hostname) || hostname.includes('--')) add(8,'The hostname uses encoding or punctuation patterns worth checking.');
  let decodedPath = url.search + ' ' + url.pathname;
  try { decodedPath = decodeURIComponent(decodedPath); } catch { /* Keep the encoded path when it contains invalid UTF-8 escapes. */ }
  if (SUSPICIOUS_TERMS.test(decodedPath)) add(18,'The URL contains language associated with urgency or credential requests.');
  let level = score >= 35 ? 'high' : score >= 12 ? 'caution' : 'low';
  if (!flags.length) flags.push('No obvious warning signs were found by the local heuristic checks. This is not a clean bill of health.');
  return { kind:'url', input:parsedResult.input, canonical:parsedResult.canonical, hostname, score, level, flags, time:safeTime() };
}

function renderReport(report, containerId='linkResults'){
  const container = document.getElementById(containerId);
  if (!container) return;
  const levelText = report.level === 'high' ? 'High-risk signals' : report.level === 'caution' ? 'Needs a closer look' : 'No obvious warning';
  container.innerHTML = `<div class="scan-result ${report.level}"><div class="result-top"><span class="result-tag">${escapeHtml(levelText)}</span><span class="result-score">${report.score} signal score</span></div><strong>${escapeHtml(report.hostname || report.name || 'Selected content')}</strong><p>${escapeHtml(report.summary || 'Local checks completed. Review each signal below.')}</p><ul>${report.flags.map(flag=>`<li>${escapeHtml(flag)}</li>`).join('')}</ul><small>Checked ${new Date(report.time).toLocaleString()} · Heuristic, not a definitive verdict</small>${report.kind === 'url' ? '<small>When signed in, a warning saves only the domain and alert summary to your Code Academy notification feed. The full URL is not sent by this checker.</small>' : ''}${report.kind === 'url' ? `<div class="result-actions"><button type="button" class="button secondary" id="saveBlockBtn"><i class="fa-solid fa-ban"></i> Add to local denylist</button><button type="button" class="button secondary" id="copyLinkBtn"><i class="fa-solid fa-copy"></i> Copy link</button></div>` : ''}</div>`;
  if (report.kind === 'url') {
    document.getElementById('saveBlockBtn')?.addEventListener('click', () => addToDenylist(report.canonical));
    document.getElementById('copyLinkBtn')?.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(report.canonical); toast('Link copied.'); }
      catch { toast('Clipboard access is unavailable. Select the link manually.', 'warning'); }
    });
  }
}
async function addToDenylist(url){
  if (!url) return;
  if (!preferences.blockedLinks.includes(url)) preferences.blockedLinks.unshift(url);
  preferences.blockedLinks = preferences.blockedLinks.slice(0,150);
  await persistPreferences('A link was added to this device’s local denylist', true);
  toast('Saved to the local Code Academy denylist. This does not block the link in WhatsApp or other apps.', 'warning');
}

async function sha256Hex(buffer){
  const digest = await crypto.subtle.digest('SHA-256',buffer);
  return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}
function getExtension(name){ return String(name).split('.').pop().toLowerCase(); }
function extractUrls(text){
  const matches = String(text).match(/(?:https?:\/\/|www\.)[^\s"'<>()[\]{}]+/gi) || [];
  return [...new Set(matches.map(value=>value.replace(/[.,;!?]+$/,'')).slice(0,60))];
}
function analyseTextContent(text){
  const flags = [];
  const urls = extractUrls(text);
  if (urls.length) flags.push(`${urls.length} web link${urls.length===1?'':'s'} found in selected text.`);
  if (SUSPICIOUS_TERMS.test(text)) flags.push('Urgency, credential, wallet, or prize-lure wording was found.');
  if (MALICIOUS_SCRIPT_TERMS.test(text)) flags.push('A risky script/command pattern was found. Context matters; this may be a false positive.');
  if (/<script\b[^>]*>[\s\S]*?(?:eval\s*\(|document\.write\s*\()/i.test(text)) flags.push('An HTML script contains a dynamic-execution pattern.');
  if (/\b(?:password|passcode|seed phrase|private key)\s*[:=]/i.test(text)) flags.push('Text appears to include a credential-like field. The text was not uploaded or saved.');
  return {flags, urls};
}
async function scanSelectedFiles(files){
  if (!preferences.checksEnabled) { toast('Checks are paused. Unlock them to resume.', 'warning'); return; }
  if (!preferences.fileScanning) { toast('File inspection is disabled in Settings.', 'warning'); return; }
  const results = [];
  const selectedFiles = [...files];
  if (selectedFiles.length > 10) toast(`You selected ${selectedFiles.length} files; only the first 10 will be inspected in this run.`, 'warning');
  for (const file of selectedFiles.slice(0,10)) {
    const ext = getExtension(file.name);
    const flags = [];
    if (file.size > MAX_FILE_BYTES) {
      results.push({kind:'file',name:file.name,score:20,level:'caution',flags:[`File exceeds the ${Math.round(MAX_FILE_BYTES/1024/1024)} MB local inspection limit. It was not opened.`, 'Use a reputable on-device antivirus scanner for a full scan.'],summary:'Skipped to keep browser memory use safe.',time:safeTime()});
      continue;
    }
    let buffer;
    try { buffer = await file.arrayBuffer(); }
    catch { results.push({kind:'file',name:file.name,score:15,level:'caution',flags:['The browser could not read this selected file.'],summary:'Inspection did not complete.',time:safeTime()}); continue; }
    let textSignals = {flags:[],urls:[]};
    if (SAFE_TEXT_EXTENSIONS.has(ext) || /^text\//i.test(file.type)) {
      const text = new TextDecoder('utf-8',{fatal:false}).decode(buffer);
      textSignals = analyseTextContent(text);
      flags.push(...textSignals.flags);
    } else if (['exe','msi','apk','aab','dll','bat','cmd','ps1','scr','com','jar','dmg','pkg','deb','rpm','sh'].includes(ext)) {
      flags.push(`Executable/package file type (.${ext}) — browser heuristics cannot safely determine whether it is malicious.`);
      flags.push('Do not install or execute it unless you trust the source and have used a full device antivirus scanner.');
    } else {
      flags.push(`The file type (.${ext || 'unknown'}) is not deeply inspected by this browser-only scanner.`);
    }
    let level = flags.some(flag=>/script\/command pattern|credential-like|dynamic-execution|urgent|lure/i.test(flag)) ? 'high' : flags.some(flag=>/Executable|links? found|URLs found|credential/i.test(flag)) ? 'caution' : 'low';
    if (!flags.length) flags.push('No obvious risky text patterns were found in the readable portion. This is not malware-signature scanning.');
    results.push({kind:'file',name:file.name,score:level==='high'?45:level==='caution'?15:0,level,flags,summary:`${(file.size/1024).toFixed(1)} KB · SHA-256 computed locally · ${textSignals.urls.length} link(s) found`,hash:await sha256Hex(buffer),urls:textSignals.urls,time:safeTime()});
  }
  const container = document.getElementById('fileResults');
  container.innerHTML = '';
  if (!results.length) { container.innerHTML = '<p class="empty-state">Choose one or more files to inspect.</p>'; return; }
  for (const result of results) {
    const row = document.createElement('div');
    row.className = 'file-result';
    row.innerHTML = `<div class="file-result-top"><div class="file-symbol"><i class="fa-solid fa-file-lines"></i></div><div class="file-name"><strong>${escapeHtml(result.name)}</strong><span>${escapeHtml(result.summary)}</span></div><span class="result-tag ${result.level}">${result.level==='high'?'High signal':result.level==='caution'?'Review':'Basic check'}</span></div><ul>${result.flags.map(flag=>`<li>${escapeHtml(flag)}</li>`).join('')}</ul>${result.hash?`<details><summary>View local SHA-256 fingerprint</summary><code>${result.hash}</code></details>`:''}${result.urls?.length?`<details><summary>Review links found (${result.urls.length})</summary><div class="url-found-list">${result.urls.map(url=>`<button type="button" data-found-url="${escapeHtml(url)}">${escapeHtml(url)}</button>`).join('')}</div></details>`:''}`;
    row.querySelectorAll('[data-found-url]').forEach(button=>button.addEventListener('click',()=>{document.getElementById('urlInput').value=button.dataset.foundUrl;document.getElementById('checkLinkBtn').click();}));
    container.append(row);
  }
  const suspicious = results.filter(result=>result.level==='high'||result.level==='caution');
  if (suspicious.length) await publishEvent({title:'File inspection needs review',message:`${suspicious.length} selected file(s) produced warning signals. Open Security Center to review the details.`,type:'security',icon:'🛡️',uniqueKey:`file_warning_${results.length}_${Math.floor(Date.now()/300000)}`});
}

function validatePassword(password){
  const checks = {
    length: password.length >= 6,
    upper: /[A-Z]/.test(password),
    lower: /[a-z]/.test(password),
    special: /[^A-Za-z0-9\s]/.test(password)
  };
  return {valid:Object.values(checks).every(Boolean),checks};
}
function bytesToBase64(bytes){let binary='';for (const b of bytes) binary+=String.fromCharCode(b);return btoa(binary);}
function base64ToBytes(value){return Uint8Array.from(atob(value),c=>c.charCodeAt(0));}
async function hashPassword(password, saltString){
  const salt = saltString ? base64ToBytes(saltString) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);
  const derived = await crypto.subtle.deriveBits({name:'PBKDF2',salt,iterations:PBKDF2_ITERATIONS,hash:'SHA-256'},key,256);
  return {salt:bytesToBase64(salt),hash:bytesToBase64(new Uint8Array(derived))};
}
async function verifyPassword(password){
  const hash = preferences.passwordHash;
  const salt = preferences.passwordSalt;
  if (!hash || !salt) return false;
  try { const checked = await hashPassword(password,salt); return checked.hash === hash; }
  catch { return false; }
}
function setPasswordFeedback(message, kind='info'){
  const feedback = document.getElementById('passwordFeedback');
  feedback.textContent = message; feedback.dataset.kind = kind; feedback.hidden = false;
}

async function requestLocationPermission(enabled){
  if (!enabled) { preferences.locationPermission=false; await persistPreferences('Optional location permission disabled',true); document.getElementById('locationState').textContent='Location disabled. It is not required for security checks.'; return; }
  if (!('geolocation' in navigator)) { preferences.locationPermission=false; drawControls(); toast('This browser does not support location permission.', 'warning'); return; }
  navigator.geolocation.getCurrentPosition(async () => {
    preferences.locationPermission=true;
    await persistPreferences('Optional location permission granted',true);
    document.getElementById('locationState').textContent='Permission granted. Coordinates are not stored or sent by Shield.';
    toast('Location permission is granted. Shield does not need your coordinates for scans.');
  }, async error => {
    preferences.locationPermission=false; drawControls();
    document.getElementById('locationState').textContent=error.code===1?'Location permission denied.':'Location permission was unavailable.';
    await persistPreferences('Optional location permission not granted',false);
  }, {enableHighAccuracy:false,timeout:8000,maximumAge:60000});
}

function setUpEvents(){
  document.getElementById('themeToggle').addEventListener('click',async()=>{preferences.theme=preferences.theme==='light'?'dark':'light';applyTheme();await persistPreferences('Security Center appearance changed',false);});
  document.getElementById('checkLinkBtn').addEventListener('click',async()=>{
    const button=document.getElementById('checkLinkBtn');
    if (!preferences.checksEnabled || !preferences.messageReview) { setStatus('Manual link checks are paused or disabled in Settings.','warning'); return; }
    button.disabled=true;button.innerHTML='<i class="fa-solid fa-spinner fa-spin"></i> Checking locally';
    try {
      const report=analyseUrl(document.getElementById('urlInput').value);
      renderReport(report);
      if (report.level==='high' || report.level==='caution') await publishEvent({title:'Link safety warning',message:`A link on ${report.hostname} produced ${report.level==='high'?'high-risk':'caution'} signals. Review the Security Center before opening it.`,type:'security',icon:'🛡️',link:'security-center.html',uniqueKey:`url_${report.hostname}_${Math.floor(Date.now()/300000)}`});
      else toast('Local checks complete. Reputation can still be unknown.');
    } catch(error) { setStatus(error.message || 'The link could not be checked.','warning'); }
    finally { button.disabled=false;button.innerHTML='<i class="fa-solid fa-magnifying-glass"></i> Check this link'; }
  });
  document.getElementById('messageCheckBtn').addEventListener('click',async()=>{
    if (!preferences.checksEnabled || !preferences.messageReview) { toast('Message review is paused or disabled.','warning'); return; }
    const text=document.getElementById('messageInput').value.trim();
    if(!text){toast('Paste a message to review first.');return;}
    const analysis=analyseTextContent(text);
    const urls=analysis.urls.map(url=>{try{return analyseUrl(url)}catch{return null;}}).filter(Boolean);
    const flags=[...analysis.flags,...urls.flatMap(report=>report.flags.map(flag=>`${new URL(report.canonical).hostname}: ${flag}`))];
    const level=urls.some(x=>x.level==='high')||analysis.flags.some(x=>/credential-like|risky script/i.test(x))?'high':urls.some(x=>x.level==='caution')||flags.length?'caution':'low';
    renderReport({kind:'message',hostname:`Message review · ${urls.length} link(s)`,score:level==='high'?45:level==='caution'?15:0,level,flags:flags.length?flags:['No obvious suspicious wording or links were found in the pasted text.'],summary:'Analysed in this browser. The message text is not uploaded or saved.',time:safeTime()},'messageResults');
    if(level!=='low') await publishEvent({title:'Message review warning',message:`A message you chose to review produced warning signals${urls[0]?.hostname?` on ${urls[0].hostname}`:''}. Check the result in Security Center.`,type:'security',icon:'🛡️',uniqueKey:`msg_${Math.floor(Date.now()/300000)}`});
  });
  const handleFileSelection = async event => { try { await scanSelectedFiles(event.target.files||[]); } catch(error) { console.error(error); toast('The selected files could not be checked.','warning'); } finally { event.target.value=''; } };
  document.getElementById('fileInput').addEventListener('change',handleFileSelection);
  document.getElementById('folderInput').addEventListener('change',handleFileSelection);
  document.getElementById('chooseFolderBtn').addEventListener('click',()=>document.getElementById('folderInput').click());
  document.getElementById('requestNotificationBtn').addEventListener('click',async()=>{
    if (!('Notification' in window)) { toast('This browser does not support notifications.','warning'); return; }
    const permission=await Notification.requestPermission();
    preferences.notifications=permission==='granted';
    document.getElementById('nativeNoticeState').textContent=permission==='granted'?'Browser notification permission granted':permission==='denied'?'Notifications blocked in device/browser settings':'Notification permission was not granted';
    await persistPreferences(permission==='granted'?'Browser security notifications enabled':'Browser notifications not enabled',permission==='granted');
    drawControls();
    toast(permission==='granted'?'Browser notification permission enabled. Closed-app security alerts still require a configured push backend.':'Notifications were not enabled.','warning');
  });
  document.getElementById('prefChecks').addEventListener('change',async event=>{
    if (!event.target.checked && preferences.passwordHash) { const ok=await askForPassword('Enter your Shield settings password to pause checks.'); if(!ok){drawControls();return;} }
    if (!event.target.checked && !preferences.passwordHash) { event.target.checked=true;toast('Set a Shield settings password before pausing checks.','warning');document.getElementById('passwordCard').scrollIntoView({behavior:'smooth',block:'center'});return; }
    preferences.checksEnabled=event.target.checked;await persistPreferences(event.target.checked?'Manual checks resumed':'Manual checks paused',true);toast(event.target.checked?'Manual checks resumed.':'Manual checks paused.');
  });
  for (const [id,key] of [['prefFiles','fileScanning'],['prefMessages','messageReview'],['prefSound','soundAlerts'],['prefVibration','vibration']]) {
    document.getElementById(id).addEventListener('change',async event=>{preferences[key]=event.target.checked;await persistPreferences(`${key.replace(/([A-Z])/g,' $1')} ${event.target.checked?'enabled':'disabled'}`,true);});
  }
  document.getElementById('prefNotifications').addEventListener('change',async event=>{
    if(event.target.checked){if(!('Notification'in window)){event.target.checked=false;toast('Notifications are not supported in this browser.','warning');return;}const permission=Notification.permission==='default'?await Notification.requestPermission():Notification.permission;preferences.notifications=permission==='granted';if(!preferences.notifications)event.target.checked=false;}
    else preferences.notifications=false;
    document.getElementById('nativeNoticeState').textContent=preferences.notifications?'Browser notification permission granted':'Browser notifications disabled';
    await persistPreferences(`Browser notifications ${preferences.notifications?'enabled':'disabled'}`,true);drawControls();
  });
  document.getElementById('prefLocation').addEventListener('change',event=>requestLocationPermission(event.target.checked));
  document.getElementById('passwordForm').addEventListener('submit',async event=>{
    event.preventDefault();
    const old=document.getElementById('currentPassword').value;
    const password=document.getElementById('newPassword').value;
    const confirm=document.getElementById('confirmPassword').value;
    if(preferences.passwordHash && !(await verifyPassword(old))){setPasswordFeedback('The current settings password is incorrect.','error');return;}
    const validated=validatePassword(password);
    if(!validated.valid){setPasswordFeedback('Use at least 6 characters with uppercase, lowercase, and a special character.','error');return;}
    if(password!==confirm){setPasswordFeedback('The new password and confirmation do not match.','error');return;}
    const generated=await hashPassword(password);
    preferences.passwordHash=generated.hash;preferences.passwordSalt=generated.salt;preferences.passwordUpdatedAt=safeTime();
    await persistPreferences('Shield settings password created or changed',true);
    document.getElementById('currentPassword').value='';document.getElementById('newPassword').value='';document.getElementById('confirmPassword').value='';
    setPasswordFeedback('Password saved as a salted PBKDF2-SHA-256 hash; the plain password was not saved. This is an in-app settings lock, not Android device authentication.','success');
    toast('Shield settings password saved.');
  });
  document.getElementById('deletePasswordBtn').addEventListener('click',async()=>{
    if(!preferences.passwordHash){toast('No Shield settings password is set.');return;}
    const ok=await askForPassword('Enter your current Shield settings password to remove it.');
    if(!ok)return;
    preferences.passwordHash='';preferences.passwordSalt='';preferences.passwordUpdatedAt=null;
    await persistPreferences('Shield settings password removed',true);
    setPasswordFeedback('Settings password removed. Pausing checks will now require you to set a password again.','warning');
    toast('Shield settings password removed.','warning');
  });
  document.getElementById('pauseChecksBtn').addEventListener('click',async()=>{
    if(!preferences.passwordHash){toast('Set a Shield settings password before pausing or resuming checks.','warning');document.getElementById('passwordCard').scrollIntoView({behavior:'smooth'});return;}
    const ok=await askForPassword(`Enter your Shield settings password to ${preferences.checksEnabled?'pause':'resume'} checks.`);
    if(!ok)return;
    preferences.checksEnabled=!preferences.checksEnabled;
    await persistPreferences(preferences.checksEnabled?'Manual checks resumed':'Manual checks paused',true);
    toast(preferences.checksEnabled?'Checks resumed.':'Checks paused.');
  });
  document.getElementById('setupFirewallBtn').addEventListener('click',()=>{
    const modal=document.getElementById('firewallModal');
    if(typeof modal.showModal==='function')modal.showModal();else modal.setAttribute('open','');
  });
  document.getElementById('closeFirewallModalTop').addEventListener('click',()=>document.getElementById('firewallModal').close());
  document.getElementById('closeFirewallModal').addEventListener('click',()=>document.getElementById('firewallModal').close());
  document.getElementById('markGuideReadBtn').addEventListener('click',async()=>{preferences.firewallGuideSeen=true;await persistPreferences('Reviewed device firewall guidance',true);document.getElementById('firewallModal').close();toast('Firewall guidance marked as reviewed. No device firewall was silently installed.');});
  document.getElementById('shareSecurityBtn').addEventListener('click',async()=>{
    if(!auth?.currentUser || !createReferralCode){toast('Sign in to create your personal referral link.','warning');return;}
    const code=createReferralCode(auth.currentUser.uid);
    const url=new URL('./',location.href);url.searchParams.set('ref',code);
    const message=`🛡️ Keep your digital habits smarter with Code Academy Security Center. Review suspicious links and messages locally, check selected files for warning signs, and learn practical protection steps in one place. It’s part of Code Academy — We Learn, We Code, We Succeed. Join through my personal referral link: ${url.href}`;
    try{if(navigator.share)await navigator.share({title:'Code Academy Security Center',text:message,url:url.href});else{await navigator.clipboard.writeText(message);toast('Professional referral message copied.');}}catch(error){if(error.name!=='AbortError')toast('Share could not open. Try copying your referral link from Community.','warning');}
  });
  document.getElementById('clearAlertsBtn').addEventListener('click',()=>{document.getElementById('alertPanel').innerHTML='<div class="empty-state"><i class="fa-regular fa-bell"></i><strong>No recent alerts</strong><span>Local security events will appear here while this page is open.</span></div>';});
  document.getElementById('openVirusTotalBtn').addEventListener('click',()=>window.open('https://www.virustotal.com/gui/home/url','_blank','noopener,noreferrer'));
  document.getElementById('openUrlscanBtn').addEventListener('click',()=>window.open('https://urlscan.io/','_blank','noopener,noreferrer'));
  document.getElementById('clearBlocklistBtn').addEventListener('click',async()=>{if(!preferences.blockedLinks.length){toast('Your local denylist is already empty.');return;}if(!window.confirm('Remove all saved local denylist entries? This only clears Code Academy Shield’s local list.'))return;preferences.blockedLinks=[];await persistPreferences('Local link denylist cleared',true);toast('Local denylist cleared.');});
}

function askForPassword(message){
  return new Promise(resolve=>{
    const dialog=document.getElementById('passwordPrompt');
    const input=document.getElementById('promptPassword');
    document.getElementById('passwordPromptMessage').textContent=message;
    input.value='';
    const cancel=document.getElementById('cancelPasswordPrompt');
    const cancelBottom=document.getElementById('cancelPasswordPromptBottom');
    const form=document.getElementById('passwordPromptForm');
    const finish=value=>{dialog.close();form.removeEventListener('submit',submit);cancel.removeEventListener('click',onCancel);cancelBottom.removeEventListener('click',onCancel);dialog.removeEventListener('cancel',onCancel);resolve(value);};
    const submit=async event=>{event.preventDefault();const valid=await verifyPassword(input.value);if(valid)finish(true);else{document.getElementById('passwordPromptError').textContent='Incorrect password. Try again.';input.select();}};
    const onCancel=()=>finish(false);
    form.addEventListener('submit',submit);cancel.addEventListener('click',onCancel);cancelBottom.addEventListener('click',onCancel);dialog.addEventListener('cancel',onCancel,{once:true});
    if(typeof dialog.showModal==='function')dialog.showModal();else dialog.setAttribute('open','');
    input.focus();
  });
}

async function initialiseAccountBridge(){
  try {
    const authModule = await import('./authentication.js');
    const firestoreModule = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
    const notificationModule = await import('./notification-engine.js');
    auth = authModule.auth;
    db = authModule.db;
    onAuthStateChanged = authModule.onAuthStateChanged;
    createReferralCode = authModule.createReferralCode;
    sendNotification = notificationModule.sendNotification;
    firestoreApi = firestoreModule;
    onAuthStateChanged(auth,user=>loadCloudPreferences(user),error=>{
      console.warn('Authentication state could not be resolved.',error);
      document.getElementById('accountState').textContent='Account status unavailable · device settings remain available';
    });
  } catch (error) {
    console.info('Firebase account sync is unavailable; local Shield tools remain active.',error);
    document.getElementById('accountState').textContent='Device-only mode · account service unavailable';
  }
}

function initialise(){
  if ('serviceWorker' in navigator && window.isSecureContext) navigator.serviceWorker.register('./sw.js').catch(error => console.info('Service worker registration is not available on this page:', error));
  applyTheme();
  drawControls();
  setUpEvents();
  document.getElementById('locationState').textContent=preferences.locationPermission?'Location permission was previously granted; no coordinates are stored.':'Location is off. It is not required for link or file checks.';
  document.getElementById('nativeNoticeState').textContent=('Notification'in window&&Notification.permission==='granted')?'Browser notification permission granted':'Browser notification permission not granted';
  document.getElementById('shareSecurityBtn').disabled=true;
  // Keep offline/local scanning available even if Firebase/CDN imports are temporarily unreachable.
  initialiseAccountBridge();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',initialise,{once:true});
else initialise();
