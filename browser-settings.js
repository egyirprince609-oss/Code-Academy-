import { auth, db, onAuthStateChanged } from './authentication.js';
import { doc, getDoc, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

'use strict';
const $ = selector => document.querySelector(selector);
const PREFS_KEY = 'ca_browser_preferences_v1';
const defaults = { theme: 'dark', desktopMode: false, searchEndpoint: '', safeSearch: true, voiceEnabled: true, notificationsEnabled: false, confirmDownloads: true, siteWarning: true, dnsProvider: 'google' };
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
  $('#dnsProvider').value = prefs.dnsProvider === 'cloudflare' ? 'cloudflare' : 'google';
  $$('#themeChoices button').forEach(button => button.classList.toggle('selected', button.dataset.theme === prefs.theme));
  applyTheme(); updateNotificationStatus();
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
    desktopMode: $('#desktopMode').checked,
    searchEndpoint: endpointInput.replace(/\/+$/, ''),
    safeSearch: $('#safeSearch').checked,
    voiceEnabled: $('#voiceEnabled').checked,
    notificationsEnabled: $('#notificationsEnabled').checked,
    confirmDownloads: $('#confirmDownloads').checked,
    siteWarning: $('#siteWarning').checked,
    dnsProvider: $('#dnsProvider').value === 'cloudflare' ? 'cloudflare' : 'google'
  };
}
async function saveSettings() {
  try {
    prefs = captureControls();
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    applyTheme();
    $('#saveStatus').textContent = 'Saved on this device.';
    if (user) {
      try {
        await setDoc(doc(db, 'users', user.uid, 'browserSettings', 'preferences'), { ...prefs, updatedAt: serverTimestamp() }, { merge: true });
        $('#saveStatus').textContent = 'Saved on this device and synchronized to your Code Academy account.';
      } catch (error) {
        $('#saveStatus').textContent = `Saved on this device. Account sync failed: ${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}`;
      }
    }
    toast('Browser settings saved.');
    updateNotificationStatus();
  } catch (error) { displayError(error, 'Settings could not be saved'); }
}
async function loadRemoteSettings() {
  prefs = readSaved();
  if (user) {
    try {
      const snapshot = await getDoc(doc(db, 'users', user.uid, 'browserSettings', 'preferences'));
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
  const endpoint = provider === 'cloudflare' ? 'https://cloudflare-dns.com/dns-query' : 'https://dns.google/resolve';
  const url = new URL(endpoint); url.searchParams.set('name', domain); url.searchParams.set('type', 'A');
  output.textContent = `Checking ${domain} using ${provider === 'cloudflare' ? 'Cloudflare' : 'Google'} DNS over HTTPS…`;
  $('#runDnsButton').disabled = true;
  try {
    const headers = provider === 'cloudflare' ? { 'Accept': 'application/dns-json' } : { 'Accept': 'application/json' };
    const response = await fetch(url.href, { method: 'GET', headers, credentials: 'omit' });
    if (!response.ok) throw new Error(`DNS resolver returned HTTP ${response.status}`);
    const data = await response.json();
    const answers = Array.isArray(data.Answer) ? data.Answer : [];
    const addresses = answers.filter(item => Number(item.type) === 1 || Number(item.type) === 28).map(item => `${item.data} (TTL ${item.TTL ?? 'unknown'})`);
    const status = data.Status === undefined ? 'not provided' : `${data.Status}${data.Status === 0 ? ' (NOERROR)' : ' (DNS response code)'}`;
    output.textContent = `Domain: ${domain}\nResolver: ${provider === 'cloudflare' ? 'Cloudflare' : 'Google'} DNS over HTTPS\nDNS status: ${status}\nAnswers:\n${addresses.length ? addresses.join('\n') : 'No A/AAAA answer was returned in this response.'}\n\nNote: this test did not modify the device or network DNS settings.`;
  } catch (error) {
    const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    output.textContent = `DNS check failed: ${detail}`;
  } finally { $('#runDnsButton').disabled = false; }
}
function resetSettings() {
  if (!window.confirm('Reset browser settings to the default values on this device?')) return;
  prefs = { ...defaults }; loadControls(); $('#saveStatus').textContent = 'Defaults restored in this page. Press Save settings to keep them.';
}
function openBrowserFiles() { location.href = './browser.html?files=1'; }
function bindEvents() {
  $$('#themeChoices button').forEach(button => button.addEventListener('click', () => { prefs.theme = button.dataset.theme === 'light' ? 'light' : 'dark'; applyTheme(); }));
  $('#settingsThemeButton').addEventListener('click', () => { prefs.theme = prefs.theme === 'dark' ? 'light' : 'dark'; applyTheme(); });
  $('#saveSettingsButton').addEventListener('click', saveSettings);
  $('#resetSettingsButton').addEventListener('click', resetSettings);
  $('#requestNotificationButton').addEventListener('click', askNotificationPermission);
  $('#notificationsEnabled').addEventListener('change', () => { if ($('#notificationsEnabled').checked) askNotificationPermission(); else updateNotificationStatus(); });
  $('#testVoiceButton').addEventListener('click', testVoiceInput);
  $('#runDnsButton').addEventListener('click', checkDns);
  $('#dnsDomain').addEventListener('keydown', event => { if (event.key === 'Enter') checkDns(); });
  $('#openFilesButton').addEventListener('click', openBrowserFiles);
  $$('.settings-tabs a').forEach(link => link.addEventListener('click', () => { $$('.settings-tabs a').forEach(item => item.classList.toggle('active', item === link)); }));
}

bindEvents();
onAuthStateChanged(auth, async authenticatedUser => {
  if (!authenticatedUser) {
    $('#settingsAccountStatus').textContent = 'Sign-in is required to synchronize browser preferences.';
    const login = new URL('./login.html', location.href); login.searchParams.set('returnUrl', 'browser-settings.html'); location.replace(login.href); return;
  }
  user = authenticatedUser;
  $('#settingsAccountStatus').textContent = `Signed in · ${authenticatedUser.email || 'Code Academy account'}`;
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js', { scope: new URL('./', location.href).pathname }).catch(error => console.warn('[Code Academy Browser] Service worker registration failed:', error));
  await loadRemoteSettings();
});
