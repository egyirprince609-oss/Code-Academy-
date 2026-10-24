// Account sync is optional; keep local settings usable if Firebase cannot load.
import { applyBrowserLanguage } from './browser-i18n.js';
let auth = null, db = null, doc, getDoc, setDoc, serverTimestamp;
'use strict';
const $ = selector => document.querySelector(selector);
const PREFS_KEY = 'ca_browser_preferences_v1';
const defaults = { theme: 'dark', accent: 'cyan', textScale: '100', reducedMotion: false, startPage: 'home', desktopMode: false, searchEndpoint: '', safeSearch: true, defaultCategory: 'web', liveNews: true, newsRefresh: '15', showThumbnails: true, suggestionsEnabled: true, voiceEnabled: true, notificationsEnabled: false, confirmDownloads: true, siteWarning: true, dnsProvider: 'google', saveHistory: true, privateSession: false, clearHistoryOnExit: false, accountSync: true, searchEngine: 'google', customSearchEngineUrl: '', addressBarPosition: 'top', interfaceLanguage: 'en', thirdPartyCookies: false, doNotTrack: true, preloadPages: false, lockIncognito: false, safeBrowsing: true, secureConnection: true, secureDns: false, secureDnsProvider: 'cloudflare', javascriptSecurity: true, permissionLocation: false, permissionCamera: false, permissionMicrophone: false, permissionNotifications: false, permissionMotion: false, permissionUsb: false, permissionNfc: false, permissionClipboard: false, permissionSerial: false, permissionFileEditing: false, permissionLocalNetwork: false, permissionAppsOnDevice: false, permissionAutoVerify: false, permissionIntrusiveAds: true };
let user = null;
let prefs = { ...defaults };
const toastRegion = $('#toastRegion');

function readSaved() {
  try { return { ...defaults, ...(JSON.parse(localStorage.getItem(PREFS_KEY) || '{}')) }; }
  catch (error) { displayError(error, 'Settings load failed'); return { ...defaults }; }
}
function displayError(error, context = 'Settings error') {
  const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  console.error(`[Code Academy Browser] ${context}: ${detail}`, error);
  $('#saveStatus').textContent = `${context}: ${detail}`;
  toast(`${context}: ${detail}`, true);
}
function toast(message, isError = false) {
  const element = document.createElement('div'); element.className = `toast${isError ? ' error' : ''}`; element.textContent = String(message); toastRegion.append(element); setTimeout(() => element.remove(), 4200);
}
function loadControls() {
  $('#desktopMode').checked = Boolean(prefs.desktopMode);
  $('#searchEndpoint').value = prefs.searchEndpoint || '';
  $('#safeSearch').checked = Boolean(prefs.safeSearch);
  $('#voiceEnabled').checked = Boolean(prefs.voiceEnabled);
  $('#notificationsEnabled').checked = Boolean(prefs.notificationsEnabled);
  $('#confirmDownloads').checked = Boolean(prefs.confirmDownloads);
  $('#siteWarning').checked = Boolean(prefs.siteWarning);
  $('#accentColor').value = ['cyan', 'blue', 'violet', 'green', 'rose'].includes(prefs.accent) ? prefs.accent : 'cyan';
  $('#textScale').value = ['90', '100', '110', '125'].includes(String(prefs.textScale)) ? String(prefs.textScale) : '100';
  $('#reducedMotion').checked = Boolean(prefs.reducedMotion);
  $('#startPage').value = prefs.startPage === 'news' ? 'news' : 'home';
  $('#defaultCategory').value = ['web', 'images', 'videos', 'news', 'documents', 'maps', 'books'].includes(prefs.defaultCategory) ? prefs.defaultCategory : 'web';
  $('#liveNews').checked = Boolean(prefs.liveNews);
  $('#newsRefresh').value = ['5', '15', '30', 'never'].includes(String(prefs.newsRefresh)) ? String(prefs.newsRefresh) : '15';
  $('#showThumbnails').checked = Boolean(prefs.showThumbnails);
  $('#suggestionsEnabled').checked = Boolean(prefs.suggestionsEnabled);
  $('#saveHistory').checked = Boolean(prefs.saveHistory);
  $('#privateSession').checked = Boolean(prefs.privateSession);
  $('#clearHistoryOnExit').checked = Boolean(prefs.clearHistoryOnExit);
  $('#accountSync').checked = Boolean(prefs.accountSync);
  $('#dnsProvider').value = ['google', 'cloudflare', 'adguard'].includes(prefs.dnsProvider) ? prefs.dnsProvider : 'google';
  const selectDefaults = { preferredSearchEngine: ['google','bing','duckduckgo','ecosia','brave','torch','grams','foc','fofa','censys'].includes(prefs.searchEngine) ? prefs.searchEngine : 'google', addressBarPosition: prefs.addressBarPosition === 'bottom' ? 'bottom' : 'top', interfaceLanguage: ['en','fr','es','zh','pt','ar'].includes(prefs.interfaceLanguage) ? prefs.interfaceLanguage : 'en', secureDnsProvider: ['cloudflare','google','opendns','nextdns'].includes(prefs.secureDnsProvider) ? prefs.secureDnsProvider : 'cloudflare' };
  for (const [id, value] of Object.entries(selectDefaults)) if ($('#'+id)) $('#'+id).value = value;
  if ($('#customSearchEngineUrl')) $('#customSearchEngineUrl').value = prefs.customSearchEngineUrl || '';
  const extendedToggles = ['thirdPartyCookies','doNotTrack','preloadPages','lockIncognito','safeBrowsing','secureConnection','secureDns','javascriptSecurity','permissionLocation','permissionCamera','permissionMicrophone','permissionNotifications','permissionMotion','permissionUsb','permissionNfc','permissionClipboard','permissionSerial','permissionFileEditing','permissionLocalNetwork','permissionAppsOnDevice','permissionAutoVerify','permissionIntrusiveAds'];
  for (const key of extendedToggles) if ($('#'+key)) $('#'+key).checked = Boolean(prefs[key] ?? (key === 'safeBrowsing' || key === 'secureConnection' || key === 'javascriptSecurity' || key === 'doNotTrack' || key === 'permissionIntrusiveAds'));
  $$('#themeChoices button').forEach(button => button.classList.toggle('selected', button.dataset.theme === prefs.theme));
  applyTheme(); updateNotificationStatus(); applyBrowserLanguage(prefs.interfaceLanguage || 'en');
  if (window.CodeAcademyNative?.setNotificationsEnabled) window.CodeAcademyNative.setNotificationsEnabled(Boolean(prefs.notificationsEnabled));
}
function $$(selector) { return Array.from(document.querySelectorAll(selector)); }
function applyTheme() {
  document.body.classList.toggle('light', prefs.theme === 'light');
  $('#settingsThemeButton').textContent = prefs.theme === 'dark' ? '☼' : '◐';
  $$('#themeChoices button').forEach(button => button.classList.toggle('selected', button.dataset.theme === prefs.theme));
}
function captureControls() {
  const endpointInput = $('#searchEndpoint').value.trim();
  if (endpointInput) {
    let parsed;
    try { parsed = new URL(endpointInput); } catch { throw new Error('Search Worker URL must be a valid HTTPS URL.'); }
    if (parsed.protocol !== 'https:' && parsed.hostname !== 'localhost') throw new Error('Use HTTPS for the search backend URL.');
    if (parsed.username || parsed.password) throw new Error('Do not put credentials in the search backend URL.');
  }
  return {
    theme: prefs.theme === 'light' ? 'light' : 'dark',
    accent: ['cyan', 'blue', 'violet', 'green', 'rose'].includes($('#accentColor').value) ? $('#accentColor').value : 'cyan',
    textScale: ['90', '100', '110', '125'].includes($('#textScale').value) ? $('#textScale').value : '100',
    reducedMotion: $('#reducedMotion').checked,
    startPage: $('#startPage').value === 'news' ? 'news' : 'home',
    desktopMode: $('#desktopMode').checked,
    searchEndpoint: endpointInput.replace(/\/+$/, ''),
    safeSearch: $('#safeSearch').checked,
    defaultCategory: ['web', 'images', 'videos', 'news', 'documents', 'maps', 'books'].includes($('#defaultCategory').value) ? $('#defaultCategory').value : 'web',
    liveNews: $('#liveNews').checked,
    newsRefresh: ['5', '15', '30', 'never'].includes($('#newsRefresh').value) ? $('#newsRefresh').value : '15',
    showThumbnails: $('#showThumbnails').checked,
    suggestionsEnabled: $('#suggestionsEnabled').checked,
    voiceEnabled: $('#voiceEnabled').checked,
    notificationsEnabled: $('#notificationsEnabled').checked,
    confirmDownloads: $('#confirmDownloads').checked,
    siteWarning: $('#siteWarning').checked,
    dnsProvider: ['google', 'cloudflare', 'adguard'].includes($('#dnsProvider').value) ? $('#dnsProvider').value : 'google',
    saveHistory: $('#saveHistory').checked,
    privateSession: $('#privateSession').checked,
    clearHistoryOnExit: $('#clearHistoryOnExit').checked,
    accountSync: $('#accountSync').checked,
    searchEngine: $('#preferredSearchEngine')?.value || 'google',
    customSearchEngineUrl: validateCustomSearchUrl($('#customSearchEngineUrl')?.value || ''),
    addressBarPosition: $('#addressBarPosition')?.value === 'bottom' ? 'bottom' : 'top',
    interfaceLanguage: ['en','fr','es','zh','pt','ar'].includes($('#interfaceLanguage')?.value) ? $('#interfaceLanguage').value : 'en',
    thirdPartyCookies: $('#thirdPartyCookies')?.checked || false,
    doNotTrack: $('#doNotTrack')?.checked || false,
    preloadPages: $('#preloadPages')?.checked || false,
    lockIncognito: $('#lockIncognito')?.checked || false,
    safeBrowsing: $('#safeBrowsing')?.checked || false,
    secureConnection: $('#secureConnection')?.checked || false,
    secureDns: $('#secureDns')?.checked || false,
    secureDnsProvider: ['cloudflare','google','opendns','nextdns'].includes($('#secureDnsProvider')?.value) ? $('#secureDnsProvider').value : 'cloudflare',
    javascriptSecurity: $('#javascriptSecurity')?.checked || false,
    permissionLocation: $('#permissionLocation')?.checked || false,
    permissionCamera: $('#permissionCamera')?.checked || false,
    permissionMicrophone: $('#permissionMicrophone')?.checked || false,
    permissionNotifications: $('#permissionNotifications')?.checked || false,
    permissionMotion: $('#permissionMotion')?.checked || false,
    permissionUsb: $('#permissionUsb')?.checked || false,
    permissionNfc: $('#permissionNfc')?.checked || false,
    permissionClipboard: $('#permissionClipboard')?.checked || false,
    permissionSerial: $('#permissionSerial')?.checked || false,
    permissionFileEditing: $('#permissionFileEditing')?.checked || false,
    permissionLocalNetwork: $('#permissionLocalNetwork')?.checked || false,
    permissionAppsOnDevice: $('#permissionAppsOnDevice')?.checked || false,
    permissionAutoVerify: $('#permissionAutoVerify')?.checked || false,
    permissionIntrusiveAds: $('#permissionIntrusiveAds')?.checked || false
  };
}
function validateCustomSearchUrl(raw) {
  const value = String(raw || '').trim();
  if (!value) return '';
  if (!value.includes('{query}')) throw new Error('Custom search URL must include the {query} placeholder.');
  let parsed;
  try { parsed = new URL(value.replace('{query}', 'test')); } catch { throw new Error('Custom search URL is not valid.'); }
  if (parsed.protocol !== 'https:' && parsed.hostname !== 'localhost') throw new Error('Custom search URL must use HTTPS.');
  if (parsed.username || parsed.password) throw new Error('Do not place username or password credentials in a custom search URL.');
  return value;
}
function runSafetyCheck() {
  const results = [];
  results.push(`Secure context: ${window.isSecureContext ? 'yes' : 'no (HTTPS is recommended)'}`);
  results.push(`Connection: ${navigator.onLine ? 'online' : 'offline'}`);
  results.push(`Authentication: ${user ? `signed in as ${user.email || 'browser account'}` : 'not signed in'}`);
  results.push(`Service worker API: ${'serviceWorker' in navigator ? 'supported' : 'not supported'}`);
  results.push(`Search endpoint: ${prefs.searchEndpoint ? 'configured (not probed by this check)' : 'not configured; public fallback sources are used'}`);
  results.push(`Third-party cookies: controlled by the browser/device, not this page`);
  $('#safetyCheckStatus').textContent = results.join(' · ');
}
function checkDefaultBrowserSupport() {
  const status = $('#defaultBrowserStatus');
  if (window.CodeAcademyNative?.requestDefaultBrowserRole) {
    try { window.CodeAcademyNative.requestDefaultBrowserRole(); status.textContent = 'Native Android default-browser request submitted. Choose Code Academy Browser in the Android system prompt.'; }
    catch (error) { status.textContent = `Default-browser request failed: ${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}`; }
    return;
  }
  status.textContent = 'This page has no native Android default-browser role bridge. Android must declare VIEW/BROWSABLE intent filters and request user selection in the separate Android project. A webpage cannot change the default browser by itself.';
}
function filterSettings(query) {
  const term = String(query || '').trim().toLowerCase();
  let shown = 0;
  $$('.settings-section, .settings-bottom').forEach(section => {
    const cards = Array.from(section.querySelectorAll('.setting-card'));
    let sectionShown = cards.length === 0;
    cards.forEach(card => {
      const matches = !term || card.textContent.toLowerCase().includes(term) || Array.from(card.querySelectorAll('input,select')).some(control => `${control.id} ${control.getAttribute('aria-label') || ''}`.toLowerCase().includes(term));
      card.hidden = !matches;
      if (matches) { shown++; sectionShown = true; }
    });
    section.hidden = Boolean(term) && !sectionShown;
  });
  const status = $('#settingsSearchStatus');
  if (status) status.textContent = term ? (shown ? `${shown} matching setting card${shown === 1 ? '' : 's'} found.` : `No settings matched “${query}”. Try privacy, search, language or permissions.`) : 'Search all settings on this page.';
}

async function saveSettings() {
  try {
    prefs = captureControls();
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    if (window.CodeAcademyNative?.setNotificationsEnabled) window.CodeAcademyNative.setNotificationsEnabled(Boolean(prefs.notificationsEnabled));
    applyTheme();
    applyBrowserLanguage(prefs.interfaceLanguage);
    document.body.classList.toggle('addressbar-bottom', prefs.addressBarPosition === 'bottom');
    if ($('#languageStatus')) $('#languageStatus').textContent = `Interface language set to ${prefs.interfaceLanguage}. Built-in translations apply to matching browser UI labels; website page contents may remain in their original language.`;
    $('#saveStatus').textContent = 'Saved on this device.';
    if (user && prefs.accountSync) {
      try {
        await setDoc(doc(db, 'browserProfiles', user.uid, 'browserSettings', 'preferences'), { ...prefs, updatedAt: serverTimestamp() }, { merge: true });
        $('#saveStatus').textContent = 'Saved on this device and synchronized to your Code Academy account.';
      } catch (error) {
        $('#saveStatus').textContent = `Saved on this device. Account sync failed: ${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}`;
      }
    } else if (!prefs.accountSync) {
      $('#saveStatus').textContent = 'Saved on this device only. Browser tab and history sync is off.';
    }
    toast('Browser settings saved.');
    updateNotificationStatus();
  } catch (error) { displayError(error, 'Settings could not be saved'); }
}
async function loadRemoteSettings() {
  prefs = readSaved();
  if (user && prefs.accountSync) {
    try {
      const snapshot = await getDoc(doc(db, 'browserProfiles', user.uid, 'browserSettings', 'preferences'));
      if (snapshot.exists()) prefs = { ...prefs, ...snapshot.data() };
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch (error) {
      console.info('[Code Academy Browser] Account preferences unavailable; local settings remain active.', error);
    }
  }
  loadControls();
}
function updateNotificationStatus() {
  const status = $('#notificationStatus');
  if (!('Notification' in window)) status.textContent = 'This browser does not expose the Notifications API.';
  else status.textContent = `Browser permission: ${Notification.permission}. App notifications are stored in the Code Academy notification feed.`;
  const enabled = $('#notificationsEnabled').checked;
  if (enabled && 'Notification' in window && Notification.permission !== 'granted') status.textContent += ' Permission must be granted before device notifications can appear.';
}
async function askNotificationPermission() {
  if (window.CodeAcademyNative?.requestNotificationPermission) {
    try { window.CodeAcademyNative.requestNotificationPermission(); $('#notificationStatus').textContent = 'Android permission dialog requested. Choose Allow in the system prompt. The result will appear here.'; return; }
    catch (error) { displayError(error, 'Android notification permission request failed'); return; }
  }
  if (!('Notification' in window)) { toast('This browser does not support device notifications.', true); updateNotificationStatus(); return; }
  try {
    const result = await Notification.requestPermission();
    $('#notificationsEnabled').checked = result === 'granted';
    updateNotificationStatus();
    if (result === 'granted') toast('Device notification permission granted.');
    else toast(`Notification permission result: ${result}. You can change it in browser or device settings.`, true);
  } catch (error) { displayError(error, 'Notification permission request failed'); }
}
function testVoiceInput() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const status = $('#voiceStatus');
  if (!$('#voiceEnabled').checked) { status.textContent = 'Voice input is turned off. Enable it to test speech recognition.'; return; }
  if (!SpeechRecognition) { status.textContent = 'SpeechRecognition is not available in this browser. This is a browser capability limit, not a settings error.'; return; }
  try {
    const recognition = new SpeechRecognition(); recognition.lang = navigator.language || 'en-US'; recognition.interimResults = false; recognition.maxAlternatives = 1;
    status.textContent = 'Listening… Speak a short phrase. Your browser may request microphone permission.';
    recognition.onresult = event => { const phrase = event.results?.[0]?.[0]?.transcript || ''; status.textContent = phrase ? `Recognized: “${phrase}”` : 'Speech recognition returned no transcript.'; };
    recognition.onerror = event => { status.textContent = `Speech recognition error: ${event.error || 'unknown error'}`; };
    recognition.onend = () => { if (status.textContent === 'Listening… Speak a short phrase. Your browser may request microphone permission.') status.textContent = 'Listening ended without a transcript.'; };
    recognition.start();
  } catch (error) { status.textContent = `Voice test failed: ${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}`; }
}
async function checkDns() {
  const raw = $('#dnsDomain').value.trim();
  const output = $('#dnsOutput');
  if (!raw) { output.textContent = 'Enter a domain name to check.'; return; }
  let domain = raw.replace(/^https?:\/\//i, '').split('/')[0].split(':')[0].replace(/\.$/, '');
  if (!/^(?=.{1,253}$)[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i.test(domain) || domain.includes('..')) { output.textContent = `Invalid domain name: ${raw}`; return; }
  const provider = $('#dnsProvider').value;
  const endpoints = {
    google: { url: 'https://dns.google/resolve', label: 'Google' },
    cloudflare: { url: 'https://cloudflare-dns.com/dns-query', label: 'Cloudflare' },
    adguard: { url: 'https://dns.adguard-dns.com/resolve', label: 'AdGuard' }
  };
  const resolver = endpoints[provider] || endpoints.google;
  const endpoint = resolver.url;
  const url = new URL(endpoint); url.searchParams.set('name', domain); url.searchParams.set('type', 'A');
  output.textContent = `Checking ${domain} using ${resolver.label} DNS over HTTPS…`;
  $('#runDnsButton').disabled = true;
  try {
    const headers = provider === 'google' ? { 'Accept': 'application/json' } : { 'Accept': 'application/dns-json' };
    const response = await fetch(url.href, { method: 'GET', headers, credentials: 'omit' });
    if (!response.ok) throw new Error(`DNS resolver returned HTTP ${response.status}`);
    const data = await response.json();
    const answers = Array.isArray(data.Answer) ? data.Answer : [];
    const addresses = answers.filter(item => Number(item.type) === 1 || Number(item.type) === 28).map(item => `${item.data} (TTL ${item.TTL ?? 'unknown'})`);
    const status = data.Status === undefined ? 'not provided' : `${data.Status}${data.Status === 0 ? ' (NOERROR)' : ' (DNS response code)'}`;
    output.textContent = `Domain: ${domain}\nResolver: ${resolver.label} DNS over HTTPS\nDNS status: ${status}\nAnswers:\n${addresses.length ? addresses.join('\n') : 'No A/AAAA answer was returned in this response.'}\n\nNote: this test did not modify the device or network DNS settings.`;
  } catch (error) {
    const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    output.textContent = `DNS check failed: ${detail}`;
  } finally { $('#runDnsButton').disabled = false; }
}
async function requestLocationAccess() {
  const status = $('#locationStatus');
  if (!('geolocation' in navigator)) { status.textContent = 'Location access is not supported by this browser.'; return; }
  if (!window.isSecureContext) { status.textContent = 'Location permissions generally require HTTPS or localhost. Open this page from the secure hosted app.'; return; }
  status.textContent = 'Requesting location permission…';
  navigator.geolocation.getCurrentPosition(position => {
    const latitude = Number(position.coords.latitude).toFixed(4);
    const longitude = Number(position.coords.longitude).toFixed(4);
    status.textContent = `Permission granted. Approximate coordinates for this device: ${latitude}, ${longitude}. This permission test did not upload them.`;
  }, error => {
    const messages = { 1: 'Location permission was denied.', 2: 'The device could not determine a location.', 3: 'Location request timed out.' };
    status.textContent = `${messages[error.code] || 'Location request failed.'} ${error.message || ''}`.trim();
  }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 });
}
async function checkMediaPermission(kind, outputSelector) {
  const output = $(outputSelector);
  const label = kind === 'video' ? 'Camera' : 'Microphone';
  if (!window.isSecureContext) { output.textContent = `${label} permission requires HTTPS or localhost.`; return; }
  if (!navigator.mediaDevices?.getUserMedia) { output.textContent = `${label} access is not supported in this browser.`; return; }
  output.textContent = `Requesting ${label.toLowerCase()} permission…`;
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia(kind === 'video' ? { video: true, audio: false } : { audio: true, video: false });
    output.textContent = `${label} permission granted. The temporary stream has been stopped; no audio or video was recorded or uploaded.`;
  } catch (error) {
    const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    output.textContent = `${label} permission was not granted or is unavailable: ${detail}`;
  } finally { stream?.getTracks().forEach(track => track.stop()); }
}
async function checkOfflineReadiness() {
  const output = $('#offlineCacheStatus');
  output.textContent = 'Checking the browser shell and service-worker cache…';
  const assets = ['./browser.html', './browser.css', './browser.js', './browser-manifest.json', './browser_image_preview.png'];
  try {
    const cacheAvailable = 'caches' in window;
    const cacheNames = cacheAvailable ? await caches.keys() : [];
    let cached = 0;
    if (cacheAvailable) {
      for (const path of assets) {
        const absolute = new URL(path, location.href).href;
        if (await caches.match(absolute)) cached += 1;
      }
    }
    const registration = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : null;
    const active = Boolean(registration?.active || navigator.serviceWorker?.controller);
    output.textContent = `Service worker: ${active ? 'active' : 'not active yet'}. Browser assets found in cache: ${cached}/${assets.length}. Cache stores visible: ${cacheNames.length}. The main app cache is shared and has not been cleared.`;
  } catch (error) {
    output.textContent = `Offline readiness check failed: ${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}`;
  }
}
function resetSettings() {
  if (!window.confirm('Reset browser settings to the default values on this device?')) return;
  prefs = { ...defaults }; loadControls(); $('#saveStatus').textContent = 'Defaults restored in this page. Press Save settings to keep them.';
}
function openBrowserFiles() { location.href = './browser.html?files=1'; }
async function testSearchEndpoint() {
  const status = $('#searchConnectionStatus');
  const raw = $('#searchEndpoint').value.trim().replace(/\/+$/, '');
  if (!raw) { status.textContent = 'No search API is configured. Basic public APIs still work; full ranked web results need a deployed search backend.'; return; }
  let parsed;
  try { parsed = new URL(raw); } catch { status.textContent = 'Invalid address. Paste an HTTPS Search Worker URL or an Academy API URL ending in /api/search.'; return; }
  if (parsed.protocol !== 'https:' && parsed.hostname !== 'localhost') { status.textContent = 'Search service must use HTTPS.'; return; }
  let health;
  if (/\/api\/search$/i.test(parsed.pathname)) health = raw.replace(/\/api\/search$/i, '/api/health');
  else if (/\/search$/i.test(parsed.pathname)) health = raw.replace(/\/search$/i, '/health');
  else if (/\/api$/i.test(parsed.pathname)) health = `${raw}/health`;
  else health = `${raw}/health`;
  status.textContent = 'Testing search service…';
  $('#testSearchEndpointButton').disabled = true;
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(health, { method: 'GET', headers: { Accept: 'application/json' }, credentials: 'omit', signal: controller.signal });
    let payload = {}; try { payload = await response.json(); } catch {}
    if (!response.ok || payload.ok === false) throw new Error(payload.error || payload.message || `Health check returned HTTP ${response.status}`);
    status.textContent = `Connected to ${payload.service || payload.name || 'search service'}${payload.version ? ` · v${payload.version}` : ''}. Now press Save settings to keep this endpoint.`;
  } catch (error) {
    const detail = error?.name === 'AbortError' ? 'Timed out after 5 seconds.' : (error instanceof Error ? `${error.name}: ${error.message}` : String(error));
    status.textContent = `Connection test failed: ${detail}. Check deployment, HTTPS, CORS and the exact endpoint path.`;
  } finally { clearTimeout(timer); $('#testSearchEndpointButton').disabled = false; }
}

function bindEvents() {
  $$('#themeChoices button').forEach(button => button.addEventListener('click', () => { prefs.theme = button.dataset.theme === 'light' ? 'light' : 'dark'; applyTheme(); }));
  $('#settingsThemeButton').addEventListener('click', () => { prefs.theme = prefs.theme === 'dark' ? 'light' : 'dark'; applyTheme(); });
  $('#saveSettingsButton').addEventListener('click', saveSettings);
  $('#resetSettingsButton').addEventListener('click', resetSettings);
  $('#requestNotificationButton').addEventListener('click', askNotificationPermission);
  $('#notificationsEnabled').addEventListener('change', () => { if ($('#notificationsEnabled').checked) askNotificationPermission(); else updateNotificationStatus(); });
  $('#testVoiceButton').addEventListener('click', testVoiceInput);
  $('#runDnsButton').addEventListener('click', checkDns);
  $('#testSearchEndpointButton')?.addEventListener('click', testSearchEndpoint);
  $('#dnsDomain').addEventListener('keydown', event => { if (event.key === 'Enter') checkDns(); });
  $('#openFilesButton').addEventListener('click', openBrowserFiles);
  $('#requestLocationButton').addEventListener('click', requestLocationAccess);
  $('#requestCameraButton').addEventListener('click', () => checkMediaPermission('video', '#cameraStatus'));
  $('#requestMicButton').addEventListener('click', () => checkMediaPermission('audio', '#micPermissionStatus'));
  $('#checkOfflineCacheButton').addEventListener('click', checkOfflineReadiness);
  $('#safetyCheckButton')?.addEventListener('click', runSafetyCheck);
  $('#defaultBrowserButton')?.addEventListener('click', checkDefaultBrowserSupport);
  $('#settingsSearchInput')?.addEventListener('input', event => filterSettings(event.target.value));
  $('#interfaceLanguage')?.addEventListener('change', event => applyBrowserLanguage(event.target.value));
  $('#privateSession').addEventListener('change', () => {
    if ($('#privateSession').checked) toast('Private session will prevent new tab/history persistence after saving. Existing account data is not deleted.');
  });
  $$('.settings-tabs a').forEach(link => link.addEventListener('click', () => { $$('.settings-tabs a').forEach(item => item.classList.toggle('active', item === link)); }));
}

bindEvents();
loadRemoteSettings().catch(error => displayError(error, 'Local settings load failed'));

async function connectSettingsAccount() {
  try {
    const [authentication, firestore] = await Promise.all([
      import('./browser-auth.js'),
      import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js')
    ]);
    auth = authentication.auth; db = authentication.db;
    ({ doc, getDoc, setDoc, serverTimestamp } = firestore);
    authentication.onAuthStateChanged(auth, async authenticatedUser => {
      user = authenticatedUser || null;
      if (!user) {
        $('#settingsAccountStatus').textContent = 'Sign-in required · redirecting to browser login…';
        location.replace('./login.html?next=browser-settings.html');
        return;
      }
      $('#settingsAccountStatus').textContent = `Signed in · ${user.email || 'Code Academy account'}`;
      await loadRemoteSettings();
    }, error => {
      $('#settingsAccountStatus').textContent = `Account sync unavailable: ${error instanceof Error ? error.message : String(error)}`;
    });
  } catch (error) {
    user = null;
    $('#settingsAccountStatus').textContent = 'Device-only settings · account service could not be reached.';
    console.info('[Code Academy Browser] Firebase unavailable on settings page; local preferences remain usable:', error);
  }
}
if ('serviceWorker' in navigator && !window.CodeAcademyNative) {
  navigator.serviceWorker.register('./sw.js', { scope: new URL('./', location.href).pathname }).catch(error => console.warn('[Code Academy Browser] Service worker registration failed:', error));
}
connectSettingsAccount();

window.CodeAcademySettings = {
  onNativeNotificationPermission: result => {
    const granted = String(result || '') === 'granted';
    $('#notificationsEnabled').checked = granted;
    $('#notificationStatus').textContent = `Android notification permission: ${String(result || 'unknown')}.`;
    updateNotificationStatus();
  }
};
