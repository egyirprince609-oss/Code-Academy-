import { applyBrowserLanguage } from './browser-i18n.js';
// Firebase is an optional account-sync layer. The browser core must still start
// if a Firebase CDN request or authentication service is unavailable.
let auth = null, db = null;
let collection, addDoc, doc, setDoc, getDocs, getDoc, deleteDoc, query, orderBy, limit, serverTimestamp;
'use strict';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
const STORAGE = {
  tabs: 'ca_browser_tabs_v1', history: 'ca_browser_history_v1', files: 'ca_browser_files_v1',
  prefs: 'ca_browser_preferences_v1', active: 'ca_browser_active_tab_v1'
};
const TAB_LIMIT = 1000;
const HISTORY_LIMIT = 1000;
const CATEGORIES = ['web', 'images', 'videos', 'news', 'documents', 'maps', 'books'];
const ui = {
  app: $('#browserApp'), tabList: $('#tabList'), tabBar: $('#tabBar'), categoryRow: $('#categoryRow'), browserProgress: $('#browserProgress'), address: $('#addressInput'), addressForm: $('#addressForm'),
  addressSuggestions: $('#addressSuggestions'),
  heroSearch: $('#heroSearchInput'), heroSearchForm: $('#heroSearchForm'), welcome: $('#welcomeView'),
  searchView: $('#searchView'), websiteView: $('#websiteView'), emptyView: $('#emptyView'), focus: $('#focusViewport'),
  results: $('#resultsList'), answer: $('#answerCard'), heading: $('#resultsHeading'), meta: $('#resultsMeta'),
  kicker: $('#searchKicker'), status: $('#connectionLabel'), footerStatus: $('#footerStatus'),
  frame: $('#siteFrame'), iframeWrap: $('#iframeWrap'), siteHint: $('#siteHint'), progress: $('#siteProgress'),
  blocked: $('#blockedHelper'), openExternal: $('#openExternalButton'), retryFrame: $('#retryFrameButton'),
  historyDrawer: $('#historyDrawer'), filesDrawer: $('#filesDrawer'), backdrop: $('#drawerBackdrop'),
  historyList: $('#historyList'), historyFilter: $('#historyFilter'), filesList: $('#filesList'),
  filePicker: $('#filePicker'), moreMenu: $('#moreMenu'), toast: $('#toastRegion'), installDialog: $('#installDialog'),
  installHelp: $('#installHelp'), privacyNotice: $('#privacyNotice'),
  googleFallback: $('#googleFallback'), duckFallback: $('#duckFallback'), preferredEngineFallback: $('#preferredEngineFallback')
};

let currentUser = null;
let syncedUserUid = null;
let browserInitialized = false;
let browserHadUserActivity = false;
let nativeActiveUrl = '';
const progressTasks = new Set();
let tabs = [];
let activeTabId = null;
let historyEntries = [];
let fileEntries = [];
let activeCategory = 'web';
let lastSearchQuery = '';
let searchBusy = false;
let deferredInstallPrompt = null;
let desktopMode = false;
let preferences = defaultPreferences();
let importedImage = null;
let currentImageResult = null;
let frameNavigation = 0;
let frameTimer = null;
let inMemoryFiles = new Map();
let historyMode = 'all';
let homeFeedItems = [];
let homeFeedSource = '';
let homeFeedUpdatedAt = 0;
let homeFeedLoading = false;
let newsRefreshTimer = null;

// Capture installability before Firebase authentication finishes so the one-shot install event is not missed.
window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault(); deferredInstallPrompt = event;
  if (ui.installHelp) ui.installHelp.textContent = 'Your browser supports the install prompt. Select Install browser.';
});
window.addEventListener('appinstalled', () => {
  if (ui.installDialog) ui.installDialog.hidden = true;
  showToast('Code Academy Browser was installed.');
});

function defaultPreferences() {
  return {
    theme: 'dark', accent: 'cyan', textScale: '100', reducedMotion: false, startPage: 'home',
    desktopMode: false, searchEndpoint: '', safeSearch: true, defaultCategory: 'web',
    liveNews: true, newsRefresh: '15', showThumbnails: true, suggestionsEnabled: true,
    voiceEnabled: true, notificationsEnabled: false, confirmDownloads: true,
    siteWarning: true, dnsProvider: 'google', saveHistory: true, privateSession: false,
    clearHistoryOnExit: false, accountSync: true, searchEngine: 'google', customSearchEngineUrl: '',
    addressBarPosition: 'top', interfaceLanguage: 'en', thirdPartyCookies: false, doNotTrack: true, preloadPages: false,
    lockIncognito: false, safeBrowsing: true, secureConnection: true, secureDns: false, secureDnsProvider: 'cloudflare',
    javascriptSecurity: true, permissionLocation: false, permissionCamera: false, permissionMicrophone: false,
    permissionNotifications: false, permissionMotion: false, permissionUsb: false, permissionNfc: false,
    permissionClipboard: false, permissionSerial: false, permissionFileEditing: false, permissionLocalNetwork: false,
    permissionAppsOnDevice: false, permissionAutoVerify: false, permissionIntrusiveAds: true
  };
}
function readJSON(key, fallback) {
  try { const value = JSON.parse(localStorage.getItem(key) || 'null'); return value ?? fallback; }
  catch { return fallback; }
}
function writeJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; }
  catch (error) { showError(error, 'Local save failed'); return false; }
}
function id() {
  return globalThis.crypto?.randomUUID ? crypto.randomUUID() : `tab-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
function now() { return Date.now(); }
function shorten(value, max = 72) { const text = String(value || '').trim(); return text.length > max ? `${text.slice(0, max - 1)}…` : text; }
function getErrorText(error) {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  if (error && typeof error === 'object') return JSON.stringify(error);
  return String(error);
}
function showToast(message, kind = '') {
  const item = document.createElement('div');
  item.className = `toast${kind ? ` ${kind}` : ''}`;
  item.textContent = String(message);
  ui.toast.appendChild(item);
  window.setTimeout(() => item.remove(), 4200);
}
function showError(error, label = 'Browser error') {
  const detail = `${label}: ${getErrorText(error)}`;
  console.error(`[Code Academy Browser] ${detail}`, error);
  showToast(detail, 'error');
  ui.footerStatus.textContent = detail;
}
function setStatus(text) { if (ui.status) ui.status.textContent = text; }
function setProgressTask(name, active) {
  if (active) progressTasks.add(name); else progressTasks.delete(name);
  const bar = ui.browserProgress;
  if (!bar) return;
  const busy = progressTasks.size > 0;
  bar.hidden = !busy;
  bar.setAttribute('aria-valuetext', busy ? Array.from(progressTasks).join(', ') : 'Idle');
  bar.setAttribute('aria-label', busy ? Array.from(progressTasks).join(', ') : 'No active request');
  bar.classList.toggle('is-active', busy);
}
function getActiveTab() { return tabs.find(tab => tab.id === activeTabId) || null; }
function isValidHttpUrl(value) {
  try { const parsed = new URL(value); return ['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password; }
  catch { return false; }
}
function normalizeUrl(input) {
  const raw = String(input || '').trim();
  if (!raw) return null;
  if (/^(javascript|data|file|intent):/i.test(raw)) throw new Error('This browser only opens HTTP and HTTPS websites for security.');
  const candidate = /^[a-z][a-z\d+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
  const parsed = new URL(candidate);
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error(`Unsupported URL protocol: ${parsed.protocol}`);
  if (parsed.username || parsed.password) throw new Error('For security, enter a website address without embedded username or password credentials.');
  if (!parsed.hostname || !parsed.hostname.includes('.')) throw new Error(`That does not look like a website address: ${raw}`);
  return parsed.href;
}
function looksLikeWebsite(value) {
  const text = String(value || '').trim();
  if (!text || /\s/.test(text)) return false;
  return /^(https?:\/\/|www\.)/i.test(text) || /^(localhost(?::\d+)?|(?:[a-z0-9-]+\.)+[a-z]{2,}(?::\d+)?(?:[/?#].*)?)$/i.test(text);
}
function currentBaseUrl() { return new URL('./', location.href).href; }
function safeExternalUrl(value) { try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : ''; } catch { return ''; } }

function applyPreferences() {
  ui.app.classList.toggle('light', preferences.theme === 'light');
  ui.app.classList.toggle('reduce-motion', Boolean(preferences.reducedMotion));
  ui.app.classList.toggle('hide-thumbnails', !preferences.showThumbnails);
  ui.app.classList.toggle('addressbar-bottom', preferences.addressBarPosition === 'bottom');
  document.documentElement.lang = preferences.interfaceLanguage || 'en';
  try { applyBrowserLanguage(preferences.interfaceLanguage || 'en'); } catch (error) { console.warn('[Code Academy Browser] Interface translation could not be applied:', error); }
  const accents = { cyan: '#45d4df', blue: '#4388ff', violet: '#9675ff', green: '#31c99a', rose: '#ff739b' };
  ui.app.style.setProperty('--browser-accent', accents[preferences.accent] || accents.cyan);
  const textScale = Number(preferences.textScale || 100);
  ui.app.style.setProperty('--browser-text-scale', String(Math.min(1.25, Math.max(0.9, textScale / 100))));
  desktopMode = Boolean(preferences.desktopMode);
  const feed = $('#homeFeed');
  if (feed) feed.hidden = !preferences.liveNews;
  if (preferences.siteWarning) {
    ui.privacyNotice.hidden = false;
    ui.privacyNotice.textContent = 'External websites have their own security policies. Sites that block iframe embedding may not render here; the browser cannot override their restrictions.';
  } else ui.privacyNotice.hidden = true;
  if (ui.siteHint) ui.siteHint.hidden = !preferences.siteWarning;
  applyDesktopMode();
}
function applyDesktopMode() {
  if (!ui.frame || ui.websiteView.hidden) return;
  if (!desktopMode) {
    ui.iframeWrap.classList.remove('desktop-viewport');
    ui.frame.style.width = '100%'; ui.frame.style.height = '100%'; ui.frame.style.transform = 'none';
    return;
  }
  const containerWidth = Math.max(320, ui.iframeWrap.clientWidth);
  const containerHeight = Math.max(260, ui.iframeWrap.clientHeight);
  const virtualWidth = 1280;
  const scale = Math.min(1, containerWidth / virtualWidth);
  ui.iframeWrap.classList.add('desktop-viewport');
  ui.frame.style.width = `${virtualWidth}px`;
  ui.frame.style.height = `${containerHeight / scale}px`;
  ui.frame.style.transform = `scale(${scale})`;
}

function makeTab({ title = 'New tab', kind = 'home', url = '', queryText = '', category = 'web' } = {}) {
  const initialView = { kind, title: String(title), url: String(url), query: String(queryText), category };
  return { id: id(), ...initialView, navHistory: [initialView], historyIndex: 0, openedAt: now(), updatedAt: now() };
}
function localTabs() { return preferences.privateSession ? [] : readJSON(STORAGE.tabs, []); }
function persistLocalTabs() {
  if (preferences.privateSession) return;
  writeJSON(STORAGE.tabs, tabs.slice(-TAB_LIMIT)); writeJSON(STORAGE.active, activeTabId);
}
function localHistory() { return readJSON(STORAGE.history, []); }
function localFiles() { return readJSON(STORAGE.files, []); }

async function saveTabRemote(tab) {
  if (!currentUser || !preferences.accountSync || preferences.privateSession) return;
  try {
    await setDoc(doc(db, 'browserProfiles', currentUser.uid, 'browserTabs', tab.id), {
      id: tab.id, title: tab.title, kind: tab.kind, url: tab.url || '', query: tab.query || '', category: tab.category || 'web',
      navHistory: Array.isArray(tab.navHistory) ? tab.navHistory.slice(-50) : [], historyIndex: Number.isInteger(tab.historyIndex) ? tab.historyIndex : 0,
      openedAt: Number(tab.openedAt || now()), updatedAt: now()
    }, { merge: true });
    const snap = await getDocs(query(collection(db, 'browserProfiles', currentUser.uid, 'browserTabs'), orderBy('openedAt', 'asc'), limit(TAB_LIMIT + 1)));
    const excess = snap.docs.slice(0, Math.max(0, snap.size - TAB_LIMIT));
    if (excess.length) {
      await Promise.allSettled(excess.map(item => deleteDoc(item.ref)));
      const ids = new Set(excess.map(item => item.id));
      tabs = tabs.filter(item => !ids.has(item.id));
      persistLocalTabs(); renderTabs();
    }
  } catch (error) {
    console.warn('[Code Academy Browser] Account tab sync unavailable:', error);
    ui.footerStatus.textContent = `Account tab sync unavailable: ${getErrorText(error)}`;
  }
}
async function deleteTabRemote(tabId) {
  if (!currentUser || !preferences.accountSync || preferences.privateSession) return;
  try { await deleteDoc(doc(db, 'browserProfiles', currentUser.uid, 'browserTabs', tabId)); }
  catch (error) { console.warn('[Code Academy Browser] Could not delete saved tab:', error); }
}
async function loadSavedTabs() {
  const local = localTabs().filter(item => item && item.id && ['home', 'site', 'search'].includes(item.kind));
  if (currentUser && preferences.accountSync && !preferences.privateSession) {
    try {
      const snap = await getDocs(query(collection(db, 'browserProfiles', currentUser.uid, 'browserTabs'), orderBy('openedAt', 'desc'), limit(TAB_LIMIT)));
      const remote = snap.docs.map(item => ({ id: item.id, ...item.data() })).filter(item => item.id && ['home', 'site', 'search'].includes(item.kind));
      if (remote.length) {
        const merged = new Map();
        [...local, ...remote].forEach(item => merged.set(item.id, { ...(merged.get(item.id) || {}), ...item }));
        tabs = Array.from(merged.values()).sort((a, b) => Number(a.openedAt || 0) - Number(b.openedAt || 0)).slice(-TAB_LIMIT);
      } else tabs = local.slice(-TAB_LIMIT);
    } catch (error) {
      console.warn('[Code Academy Browser] Loading account tabs failed; using device-saved tabs:', error);
      tabs = local.slice(-TAB_LIMIT);
    }
  } else tabs = local.slice(-TAB_LIMIT);
  activeTabId = preferences.privateSession ? null : readJSON(STORAGE.active, null);
  if (!tabs.some(tab => tab.id === activeTabId)) activeTabId = tabs[tabs.length - 1]?.id || null;
  persistLocalTabs();
  if (!tabs.length) {
    const tab = makeTab({ title: 'New tab', kind: 'home' });
    tabs = [tab]; activeTabId = tab.id; persistLocalTabs(); await saveTabRemote(tab);
  }
  renderTabs();
  await renderActiveTab();
}
function renderTabs() {
  ui.tabList.replaceChildren();
  if (ui.tabBar) ui.tabBar.classList.toggle('has-multiple-tabs', tabs.length > 1);
  const visibleTabs = tabs.slice(-TAB_LIMIT);
  visibleTabs.forEach(tab => {
    const button = document.createElement('button');
    button.type = 'button'; button.className = `browser-tab${tab.id === activeTabId ? ' active' : ''}`;
    button.setAttribute('aria-current', tab.id === activeTabId ? 'page' : 'false');
    const favicon = document.createElement('span'); favicon.className = 'tab-favicon'; favicon.textContent = tab.kind === 'site' ? hostInitial(tab.url) : tab.kind === 'search' ? '⌕' : '⌂';
    const title = document.createElement('span'); title.className = 'tab-title'; title.textContent = shorten(tab.title || 'New tab', 38);
    const close = document.createElement('button'); close.type = 'button'; close.className = 'tab-close'; close.textContent = '×'; close.setAttribute('aria-label', `Close ${tab.title || 'tab'}`);
    close.addEventListener('click', async event => { event.stopPropagation(); await closeTab(tab.id); });
    button.addEventListener('click', async () => { activeTabId = tab.id; persistLocalTabs(); renderTabs(); await renderActiveTab(); });
    button.append(favicon, title, close); ui.tabList.append(button);
  });
  const active = ui.tabList.querySelector('.browser-tab.active');
  active?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  const activeTab = getActiveTab();
  const navStack = Array.isArray(activeTab?.navHistory) ? activeTab.navHistory : [];
  const navIndex = Number.isInteger(activeTab?.historyIndex) ? activeTab.historyIndex : navStack.length - 1;
  $('#backButton').disabled = navIndex <= 0;
  $('#forwardButton').disabled = navIndex < 0 || navIndex >= navStack.length - 1;
}
function hostInitial(url) { try { return new URL(url).hostname.replace(/^www\./, '').charAt(0).toUpperCase() || '◉'; } catch { return '◉'; } }
function hideViews() { [ui.welcome, ui.searchView, ui.websiteView, ui.emptyView].forEach(el => { if (el) el.hidden = true; }); }
function setSelectedCategory(category) {
  activeCategory = CATEGORIES.includes(category) ? category : 'web';
  if (ui.categoryRow) ui.categoryRow.hidden = false;
  $$('.category-chip').forEach(button => {
    const selected = button.dataset.category === activeCategory;
    button.classList.toggle('active', selected); button.setAttribute('aria-selected', String(selected));
  });
}
async function renderActiveTab() {
  const tab = getActiveTab();
  hideViews();
  ui.blocked.hidden = true;
  ui.answer.hidden = true;
  if (!tab) { ui.emptyView.hidden = false; return; }
  if (tab.kind === 'home') {
    if (ui.categoryRow) ui.categoryRow.hidden = true;
    ui.welcome.hidden = false; ui.address.value = ''; nativeActiveUrl = ''; setStatus('Ready for a new search'); ui.footerStatus.textContent = preferences.privateSession ? 'Private session: tabs and history are not saved to this device or account.' : 'Search, type a website address, or open a saved tab.';
    $$('.primary-nav-item').forEach(item => item.classList.toggle('active', item.id === 'homeButton'));
    if (preferences.liveNews) {
      loadHomeFeed().catch(error => console.warn('[Code Academy Browser] Home feed unavailable:', error));
      if (preferences.startPage === 'news') window.setTimeout(() => $('#homeFeed')?.scrollIntoView({ block: 'start', behavior: preferences.reducedMotion ? 'auto' : 'smooth' }), 80);
    }
    return;
  }
  $$('.primary-nav-item').forEach(item => item.classList.toggle('active', false));
  if (tab.kind === 'search') {
    if (ui.categoryRow) ui.categoryRow.hidden = false;
    ui.searchView.hidden = false; ui.address.value = tab.query || tab.title || ''; ui.heroSearch.value = tab.query || '';
    setSelectedCategory(tab.category || 'web');
    await performSearch(tab.query || tab.title, tab.category || 'web', { silent: true, existingTab: true });
    return;
  }
  if (tab.kind === 'site' && safeExternalUrl(tab.url)) {
    if (ui.categoryRow) ui.categoryRow.hidden = true;
    ui.address.value = tab.url; setStatus(`Loading ${safeDomain(tab.url)}…`);
    // In the native APK, open the destination as a real top-level WebView page.
    // On the web version, keep the conservative embedded viewer and its policy notice.
    if (window.CodeAcademyNative && typeof window.CodeAcademyNative.openUrl === 'function') {
      ui.websiteView.hidden = true;
      if (nativeActiveUrl !== tab.url) {
        nativeActiveUrl = tab.url;
        window.CodeAcademyNative.openUrl(tab.url, tab.title || safeDomain(tab.url));
      }
      return;
    }
    ui.websiteView.hidden = false; startFrameLoad(tab.url, false); return;
  }
  ui.emptyView.hidden = false;
}
async function ensureTab() {
  let tab = getActiveTab();
  if (tab) return tab;
  tab = makeTab({ title: 'New tab', kind: 'home' }); tabs.push(tab); activeTabId = tab.id; persistLocalTabs(); renderTabs(); await saveTabRemote(tab); return tab;
}
async function updateActiveTab(patch, save = true) {
  const tab = await ensureTab();
  Object.assign(tab, patch, { updatedAt: now() });
  if (!tab.openedAt) tab.openedAt = now();
  persistLocalTabs(); renderTabs();
  if (save) saveTabRemote(tab);
  return tab;
}
async function navigateTabView(view, { recordHistory = true } = {}) {
  let tab = await ensureTab();
  let stack = Array.isArray(tab.navHistory) ? tab.navHistory.slice() : [];
  let index = Number.isInteger(tab.historyIndex) ? tab.historyIndex : stack.length - 1;
  if (!stack.length) { stack = [{ kind: 'home', title: 'New tab', url: '', query: '', category: 'web' }]; index = 0; }
  if (recordHistory) {
    stack = stack.slice(0, Math.max(0, index + 1));
    const last = stack[stack.length - 1];
    const changed = !last || last.kind !== view.kind || last.url !== (view.url || '') || last.query !== (view.query || '') || last.category !== (view.category || 'web');
    if (changed) stack.push({ kind: view.kind, title: view.title || '', url: view.url || '', query: view.query || '', category: view.category || 'web' });
    if (stack.length > 50) stack = stack.slice(-50);
    index = stack.length - 1;
  }
  tab = await updateActiveTab({ ...view, navHistory: stack, historyIndex: index }, true);
  return tab;
}

async function createNewTab({ focus = true, persist = true } = {}) {
  browserHadUserActivity = true;
  if (tabs.length >= TAB_LIMIT) {
    const oldest = tabs.shift();
    if (oldest) await deleteTabRemote(oldest.id);
  }
  const tab = makeTab({ title: 'New tab', kind: 'home' });
  tabs.push(tab); activeTabId = focus ? tab.id : activeTabId;
  persistLocalTabs(); renderTabs();
  if (persist) await saveTabRemote(tab);
  if (focus) await renderActiveTab();
  if (focus && preferences.notificationsEnabled && window.CodeAcademyNative?.onNewTabOpened) window.CodeAcademyNative.onNewTabOpened();
  return tab;
}
async function closeTab(tabId) {
  const index = tabs.findIndex(tab => tab.id === tabId);
  if (index < 0) return;
  const [closed] = tabs.splice(index, 1);
  await deleteTabRemote(closed.id);
  if (activeTabId === tabId) activeTabId = tabs[Math.min(index, tabs.length - 1)]?.id || tabs[tabs.length - 1]?.id || null;
  if (!tabs.length) {
    const replacement = makeTab({ title: 'New tab', kind: 'home' }); tabs.push(replacement); activeTabId = replacement.id; await saveTabRemote(replacement);
  }
  persistLocalTabs(); renderTabs(); await renderActiveTab();
  showToast('Tab closed. Its visit remains in history.');
}

async function saveHistoryEntry(entry) {
  const record = {
    id: entry.id || id(), title: String(entry.title || 'Untitled'), url: String(entry.url || ''), query: String(entry.query || ''),
    category: String(entry.category || 'web'), kind: String(entry.kind || 'site'), type: String(entry.type || entry.kind || 'site'),
    fileName: String(entry.fileName || ''), assetId: String(entry.assetId || ''), createdAt: Number(entry.createdAt || now())
  };
  if (preferences.privateSession || !preferences.saveHistory) return record;
  historyEntries = [record, ...historyEntries.filter(item => item.id !== record.id)].slice(0, HISTORY_LIMIT);
  writeJSON(STORAGE.history, historyEntries);
  renderFrequentSites();
  if (!currentUser || !preferences.accountSync) return record;
  try {
    await setDoc(doc(db, 'browserProfiles', currentUser.uid, 'browserHistory', record.id), record, { merge: true });
    const snap = await getDocs(query(collection(db, 'browserProfiles', currentUser.uid, 'browserHistory'), orderBy('createdAt', 'desc'), limit(HISTORY_LIMIT + 1)));
    const excess = snap.docs.slice(HISTORY_LIMIT);
    if (excess.length) await Promise.allSettled(excess.map(item => deleteDoc(item.ref)));
  } catch (error) { console.warn('[Code Academy Browser] History sync unavailable:', error); }
  return record;
}
async function loadHistory() {
  const local = (preferences.privateSession || !preferences.saveHistory) ? [] : localHistory();
  if (currentUser && preferences.accountSync && !preferences.privateSession && preferences.saveHistory) {
    try {
      const snap = await getDocs(query(collection(db, 'browserProfiles', currentUser.uid, 'browserHistory'), orderBy('createdAt', 'desc'), limit(HISTORY_LIMIT)));
      const remote = snap.docs.map(item => ({ id: item.id, ...item.data() }));
      const merged = new Map(); [...local, ...remote].forEach(item => merged.set(item.id, { ...(merged.get(item.id) || {}), ...item }));
      historyEntries = Array.from(merged.values()).sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0)).slice(0, HISTORY_LIMIT);
    } catch (error) { historyEntries = local.sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0)).slice(0, HISTORY_LIMIT); }
  } else historyEntries = local.sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0)).slice(0, HISTORY_LIMIT);
  if (!preferences.privateSession && preferences.saveHistory) writeJSON(STORAGE.history, historyEntries);
  renderHistory(); renderFrequentSites();
}
async function clearHistory() {
  const target = currentUser && preferences.accountSync && !preferences.privateSession ? 'this device and your synced account' : 'this device';
  const confirmed = window.confirm(`Clear up to 1,000 saved browser history entries on ${target}? Your open tabs will remain.`);
  if (!confirmed) return;
  const records = [...historyEntries]; historyEntries = []; writeJSON(STORAGE.history, []); renderHistory(); renderFrequentSites();
  if (currentUser && preferences.accountSync && !preferences.privateSession) {
    try { await Promise.allSettled(records.map(item => deleteDoc(doc(db, 'browserProfiles', currentUser.uid, 'browserHistory', item.id)))); }
    catch (error) { showError(error, 'History clear failed'); }
  }
  showToast('Browsing history cleared from the selected storage.');
}
async function clearBrowsingData() {
  const message = 'Clear saved history, open tabs, local bookmarks, imported/download activity and the browser shell cache on this device? Browser settings and your Code Academy browser account will remain. The PWA cannot clear other websites’ cookies; the native Android app can request that separately.';
  if (!window.confirm(message)) return;
  const canSync = Boolean(currentUser && preferences.accountSync && !preferences.privateSession && typeof collection === 'function' && typeof getDocs === 'function' && typeof deleteDoc === 'function');
  const remoteFailures = [];
  if (canSync) {
    for (const name of ['browserHistory', 'browserTabs']) {
      try {
        const snapshot = await getDocs(collection(db, 'browserProfiles', currentUser.uid, name));
        await Promise.all(snapshot.docs.map(item => deleteDoc(item.ref)));
      } catch (error) { remoteFailures.push(`${name}: ${getErrorText(error)}`); }
    }
  }
  historyEntries = []; fileEntries = [];
  tabs = [makeTab({ title: 'New tab', kind: 'home' })]; activeTabId = tabs[0].id;
  for (const key of [STORAGE.history, STORAGE.tabs, STORAGE.active, STORAGE.files, 'ca_browser_bookmarks_v1']) {
    try { localStorage.removeItem(key); } catch (error) { remoteFailures.push(`local ${key}: ${getErrorText(error)}`); }
  }
  persistLocalTabs(); writeJSON(STORAGE.history, []); writeJSON(STORAGE.files, []);
  renderHistory(); renderFrequentSites(); renderTabs(); await renderActiveTab();
  try {
    if (window.CodeAcademyNative?.clearBrowsingData) window.CodeAcademyNative.clearBrowsingData();
    else if ('caches' in window) {
      for (const name of await caches.keys()) if (name.startsWith('ca-browser-')) await caches.delete(name);
    }
  } catch (error) { remoteFailures.push(`website cache/cookies: ${getErrorText(error)}`); }
  if (remoteFailures.length) showToast(`Local browsing data cleared. Some sync/device data could not be cleared: ${remoteFailures.join(' | ')}`, 'warn');
  else showToast('Saved history, local tabs, bookmarks and imported/download activity cleared. Browser settings and account were kept.');
}

function formatDate(value) {
  const time = Number(value || 0); if (!time) return 'Time unavailable';
  try { return new Date(time).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { return new Date(time).toISOString(); }
}
function renderHistory() {
  const filter = String(ui.historyFilter.value || '').trim().toLowerCase();
  const modeItems = historyMode === 'search' ? historyEntries.filter(item => item.kind === 'search' || Boolean(item.query)) : historyEntries;
  const items = modeItems.filter(item => `${item.title} ${item.url} ${item.query} ${item.fileName}`.toLowerCase().includes(filter));
  ui.historyList.replaceChildren();
  if (!items.length) { const empty = document.createElement('div'); empty.className = 'drawer-empty'; empty.textContent = filter ? 'No history entries match that filter.' : historyMode === 'search' ? 'No saved search history is available yet.' : 'No recent history is saved yet.'; ui.historyList.append(empty); return; }
  items.forEach(item => {
    const row = document.createElement('div'); row.className = 'history-item';
    const favicon = document.createElement('span'); favicon.className = 'history-favicon'; favicon.textContent = item.kind === 'file-import' ? '⇧' : item.kind === 'file-export' ? '⇩' : item.kind === 'search' ? '⌕' : hostInitial(item.url);
    const copy = document.createElement('div'); copy.className = 'history-copy';
    const title = document.createElement('strong'); title.textContent = item.title || item.query || 'Untitled';
    const meta = document.createElement('small'); meta.textContent = `${formatDate(item.createdAt)} · ${item.query ? `Search: ${item.query}` : item.url || item.fileName || item.kind}`;
    copy.append(title, meta); const open = document.createElement('button'); open.type = 'button'; open.textContent = item.kind === 'file-import' ? 'Files' : 'Open';
    open.addEventListener('click', async () => {
      closeDrawers();
      if (item.kind === 'file-import' || item.kind === 'file-export') { openDrawer('files'); return; }
      if (item.kind === 'search' || item.query) {
        const tab = await createNewTab({ focus: true }); Object.assign(tab, { title: item.title || item.query, kind: 'search', query: item.query || item.title, category: item.category || 'web' });
        persistLocalTabs(); renderTabs(); await saveTabRemote(tab); await renderActiveTab();
      } else if (safeExternalUrl(item.url)) { await openAddress(item.url, { createTab: true, title: item.title }); }
    });
    row.append(favicon, copy, open); ui.historyList.append(row);
  });
}

function openDrawer(name, mode = 'all') {
  ui.moreMenu.hidden = true; ui.backdrop.hidden = false;
  const drawer = name === 'history' ? ui.historyDrawer : ui.filesDrawer;
  drawer.classList.add('open'); drawer.setAttribute('aria-hidden', 'false');
  if (name === 'history') {
    historyMode = mode === 'search' ? 'search' : 'all';
    const heading = ui.historyDrawer.querySelector('.drawer-head h2');
    if (heading) heading.textContent = historyMode === 'search' ? 'Search history' : 'Browsing history';
    ui.historyFilter.value = '';
    loadHistory().catch(error => showError(error, 'History load failed'));
    ui.historyFilter.focus({ preventScroll: true });
  }
  if (name === 'files') loadFiles();
}
function closeDrawers() {
  [ui.historyDrawer, ui.filesDrawer].forEach(drawer => { drawer.classList.remove('open'); drawer.setAttribute('aria-hidden', 'true'); });
  ui.backdrop.hidden = true;
}

function searchEndpoint() { return String(preferences.searchEndpoint || '').trim().replace(/\/+$/, ''); }
async function fetchWithTimeout(url, options = {}, timeout = 12000) {
  const controller = new AbortController(); const timer = window.setTimeout(() => controller.abort(), timeout);
  try { return await fetch(url, { ...options, signal: controller.signal, credentials: 'omit' }); }
  finally { window.clearTimeout(timer); }
}
async function fetchWorkerResults(queryText, category) {
  const endpoint = searchEndpoint();
  if (!endpoint) return null;
  const isAcademyApi = /\/api\/search$/i.test(endpoint);
  let response;
  if (isAcademyApi) {
    const mode = category === 'documents' ? 'files' : category;
    response = await fetchWithTimeout(endpoint, {
      method: 'POST',
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: queryText, mode, page: 1, safe_search: Boolean(preferences.safeSearch), language: (navigator.language || 'en').split('-')[0] })
    }, 6500);
  } else {
    const base = endpoint.endsWith('/search') ? endpoint : `${endpoint}/search`;
    const url = new URL(base);
    url.searchParams.set('q', queryText); url.searchParams.set('category', category);
    if (preferences.safeSearch) url.searchParams.set('safe', '1');
    response = await fetchWithTimeout(url.href, { headers: { 'Accept': 'application/json' } }, 6500);
  }
  let body;
  try { body = await response.json(); }
  catch (error) { throw new Error(`Search service returned invalid JSON: ${getErrorText(error)}`); }
  if (!response.ok || body.ok === false) throw new Error(body.error || body.message || `Search service returned HTTP ${response.status}`);
  const normalized = (Array.isArray(body.results) ? body.results : []).map((item, index) => normalizeSearchResult(item, index)).filter(Boolean);
  const engines = Array.isArray(body.engines) ? body.engines.join(' + ') : (body.provider || body.source || (isAcademyApi ? 'Academy Search API' : 'Configured search Worker'));
  return { results: normalized, provider: engines, note: body.note || (body.warnings?.length ? `Some sources were unavailable: ${body.warnings.join(', ')}` : '') };
}
function normalizeSearchResult(item, index) {
  const url = safeExternalUrl(item.url || item.link || item.href || '');
  const title = String(item.title || item.name || '').trim();
  if (!url || !title) return null;
  return { id: String(item.id || `${index}-${url}`), title, url, snippet: String(item.snippet || item.description || '').trim(), domain: String(item.domain || (() => { try { return new URL(url).hostname; } catch { return ''; } })()), thumbnail: safeExternalUrl(item.thumbnail || item.thumbUrl || item.thumbnail_url || ''), imageUrl: safeExternalUrl(item.imageUrl || item.image_url || item.image || ''), source: String(item.source || item.engine || item.provider || '') };
}
async function searchDuckDuckGoInstant(queryText) {
  const url = new URL('https://api.duckduckgo.com/');
  url.searchParams.set('q', queryText); url.searchParams.set('format', 'json'); url.searchParams.set('no_html', '1'); url.searchParams.set('no_redirect', '1'); url.searchParams.set('skip_disambig', '1');
  const response = await fetchWithTimeout(url.href, { headers: { 'Accept': 'application/json' } }, 7000);
  if (!response.ok) throw new Error(`DuckDuckGo instant answers returned HTTP ${response.status}`);
  const data = await response.json(); const results = [];
  if (data.AbstractURL && data.AbstractText) results.push({ title: data.Heading || queryText, url: data.AbstractURL, snippet: data.AbstractText, domain: data.AbstractSource || 'DuckDuckGo' });
  const walk = list => (list || []).forEach(entry => {
    if (entry.Topics) walk(entry.Topics);
    else if (entry.FirstURL && entry.Text) results.push({ title: entry.Text.split(' - ')[0], url: entry.FirstURL, snippet: entry.Text, domain: (() => { try { return new URL(entry.FirstURL).hostname; } catch { return 'DuckDuckGo'; } })() });
  });
  walk(data.RelatedTopics);
  return dedupeResults(results).slice(0, 15);
}
async function searchWikipedia(queryText, category) {
  let search = queryText;
  if (category === 'documents') search += ' filetype:pdf OR filetype:doc OR filetype:ppt';
  if (category === 'news') search += ' latest news';
  const url = new URL('https://en.wikipedia.org/w/api.php');
  url.search = new URLSearchParams({ action: 'query', list: 'search', srsearch: search, srlimit: '15', format: 'json', origin: '*' }).toString();
  const response = await fetchWithTimeout(url.href, { headers: { 'Accept': 'application/json' } });
  if (!response.ok) throw new Error(`Wikipedia search returned HTTP ${response.status}`);
  const data = await response.json();
  return (data.query?.search || []).map(item => ({ title: item.title, url: `https://en.wikipedia.org/wiki/${encodeURIComponent(item.title.replace(/ /g, '_'))}`, snippet: stripHtml(item.snippet || ''), domain: 'wikipedia.org' }));
}
async function searchImages(queryText) {
  const url = new URL('https://commons.wikimedia.org/w/api.php');
  url.search = new URLSearchParams({ action: 'query', generator: 'search', gsrsearch: queryText, gsrnamespace: '6', gsrlimit: '30', prop: 'imageinfo', iiprop: 'url|extmetadata', iiurlwidth: '520', format: 'json', origin: '*' }).toString();
  const response = await fetchWithTimeout(url.href, { headers: { 'Accept': 'application/json' } }, 6500);
  if (!response.ok) throw new Error(`Wikimedia Commons image search returned HTTP ${response.status}`);
  const data = await response.json();
  return Object.values(data.query?.pages || {}).map(page => {
    const info = page.imageinfo?.[0] || {}; const meta = info.extmetadata || {};
    return {
      id: String(page.pageid), title: String(page.title || '').replace(/^File:/, ''), url: info.descriptionurl || `https://commons.wikimedia.org/wiki/${encodeURIComponent(page.title || '')}`,
      thumbnail: info.thumburl || info.url || '', imageUrl: info.url || info.thumburl || '', snippet: stripHtml(meta.ImageDescription?.value || meta.ObjectName?.value || 'Wikimedia Commons media file'),
      domain: 'commons.wikimedia.org', source: 'Wikimedia Commons'
    };
  }).filter(item => item.thumbnail && item.url);
}
async function searchBooks(queryText) {
  const url = new URL('https://openlibrary.org/search.json'); url.searchParams.set('q', queryText); url.searchParams.set('limit', '15');
  const response = await fetchWithTimeout(url.href, { headers: { 'Accept': 'application/json' } }, 6500);
  if (!response.ok) throw new Error(`Open Library search returned HTTP ${response.status}`);
  const data = await response.json();
  return (data.docs || []).map(item => ({
    title: item.title || 'Untitled book', url: item.key ? `https://openlibrary.org${item.key}` : 'https://openlibrary.org/search',
    snippet: [item.author_name?.slice(0, 3).join(', '), item.first_publish_year ? `First published ${item.first_publish_year}` : '', item.edition_count ? `${item.edition_count} editions` : ''].filter(Boolean).join(' · '),
    domain: 'openlibrary.org', thumbnail: item.cover_i ? `https://covers.openlibrary.org/b/id/${item.cover_i}-M.jpg` : '', imageUrl: item.cover_i ? `https://covers.openlibrary.org/b/id/${item.cover_i}-L.jpg` : ''
  }));
}
async function searchMaps(queryText) {
  const url = new URL('https://nominatim.openstreetmap.org/search'); url.search = new URLSearchParams({ q: queryText, format: 'jsonv2', limit: '15', addressdetails: '1' }).toString();
  const response = await fetchWithTimeout(url.href, { headers: { 'Accept': 'application/json' } }, 6500);
  if (!response.ok) throw new Error(`OpenStreetMap place search returned HTTP ${response.status}`);
  const data = await response.json();
  return data.map(item => ({ title: item.name || item.display_name, url: `https://www.openstreetmap.org/?mlat=${encodeURIComponent(item.lat)}&mlon=${encodeURIComponent(item.lon)}#map=15/${encodeURIComponent(item.lat)}/${encodeURIComponent(item.lon)}`, snippet: item.display_name || `${item.type || 'Place'} · ${item.lat}, ${item.lon}`, domain: 'openstreetmap.org' }));
}
function dedupeResults(results) {
  const seen = new Set(); const output = [];
  (results || []).forEach(raw => {
    const item = normalizeSearchResult(raw, output.length); if (!item || seen.has(item.url)) return;
    seen.add(item.url); output.push(item);
  }); return output;
}
function stripHtml(input) {
  const doc = new DOMParser().parseFromString(String(input), 'text/html');
  return (doc.body.textContent || '').replace(/\s+/g, ' ').trim();
}
async function searchGoogleNewsRss(queryText) {
  const feedUrl = new URL('https://news.google.com/rss/search');
  feedUrl.search = new URLSearchParams({ q: queryText, hl: navigator.language || 'en', gl: (navigator.language || 'en-US').split('-').pop().toUpperCase() || 'US', ceid: `${(navigator.language || 'en-US').split('-').pop().toUpperCase() || 'US'}:en` }).toString();
  const converter = new URL('https://api.rss2json.com/v1/api.json'); converter.searchParams.set('rss_url', feedUrl.href);
  const response = await fetchWithTimeout(converter.href, { headers: { Accept: 'application/json' } }, 5200);
  const payload = await response.json();
  if (!response.ok || payload.status !== 'ok' || !Array.isArray(payload.items)) throw new Error(payload.message || `Google News RSS returned HTTP ${response.status}`);
  return payload.items.map(item => ({ title: item.title, url: item.link, snippet: stripHtml(item.description || item.content || '').slice(0, 360), domain: (() => { try { return new URL(item.link).hostname; } catch { return 'news.google.com'; } })(), source: 'Google News RSS', published: item.pubDate || '', thumbnail: safeExternalUrl(item.thumbnail || '') })).map((item, index) => normalizeSearchResult(item, index)).filter(Boolean);
}
function searchSourceError(category, failures) {
  const detail = failures.filter(Boolean).slice(0, 5).join(' | ') || 'No search provider returned usable results.';
  const online = navigator.onLine;
  if (!online) return new Error(`Internet connection unavailable. The device reports offline status. ${detail}`);
  return new Error(`${categoryLabel(category)} search returned no usable results. Providers may be unavailable, rate-limited, blocked by CORS, or need backend configuration. ${detail}`);
}
async function getSearchResults(queryText, category) {
  const failures = [];
  // Specialized public APIs provide real data for these types; requests are bounded.
  if (category === 'images') {
    const imageFailures = [];
    if (searchEndpoint()) {
      try {
        const connected = await fetchWorkerResults(queryText, category);
        if (connected?.results?.length) return { ...connected, results: dedupeResults(connected.results), note: connected.note || 'Image results come from the configured search provider. Check source licensing before reuse.' };
        imageFailures.push('Configured image index returned no results.');
      } catch (error) { imageFailures.push(`Configured image index: ${getErrorText(error)}`); }
    }
    try {
      const results = await searchImages(queryText);
      return { results, provider: 'Wikimedia Commons image index', note: `Images link to their original Wikimedia Commons page. Check each license and attribution before reuse.${imageFailures.length ? ` Backend fallback: ${imageFailures.join(' ')}` : ''}` };
    } catch (error) { throw new Error(`Image search failed: ${getErrorText(error)}. ${imageFailures.join(' ')}`); }
  }
  if (category === 'books') {
    try { return { results: dedupeResults(await searchBooks(queryText)), provider: 'Open Library', note: 'Book data comes from Open Library; borrowing and edition availability vary by item.' }; }
    catch (error) { throw new Error(`Book search failed: ${getErrorText(error)}`); }
  }
  if (category === 'maps') {
    try { return { results: dedupeResults(await searchMaps(queryText)), provider: 'OpenStreetMap', note: 'Map matches are place/geocoding results from OpenStreetMap.' }; }
    catch (error) { throw new Error(`Map search failed: ${getErrorText(error)}`); }
  }

  // Query the configured full-web backend alongside bounded public fallbacks.
  // A slow or unconfigured primary does not block the usable sources.
  const tasks = [];
  if (searchEndpoint()) tasks.push({ name: 'configured search service', run: () => fetchWorkerResults(queryText, category) });
  if (category === 'news') tasks.push({ name: 'Google News RSS', run: () => searchGoogleNewsRss(queryText) });
  if (category === 'web') tasks.push({ name: 'DuckDuckGo instant answers', run: () => searchDuckDuckGoInstantBounded(queryText) });
  tasks.push({ name: 'Wikipedia API', run: () => searchWikipediaBounded(queryText, category) });

  const settled = await Promise.allSettled(tasks.map(task => task.run()));
  const successful = [];
  settled.forEach((result, index) => {
    const sourceName = tasks[index].name;
    if (result.status === 'rejected') { failures.push(`${sourceName}: ${getErrorText(result.reason)}`); return; }
    if (Array.isArray(result.value)) {
      if (result.value.length) successful.push({ results: result.value, provider: sourceName });
      else failures.push(`${sourceName}: no matching results returned`);
    } else if (result.value && Array.isArray(result.value.results)) {
      if (result.value.results.length) successful.push(result.value);
      else failures.push(`${sourceName}: no matching results returned`);
    }
  });

  if (!successful.length) throw searchSourceError(category, failures);
  // Keep the configured backend first (its index is broadest); merge direct fallbacks
  // only when useful, deduplicating URLs and making source limitations explicit.
  const rank = (item) => item.provider === 'Connected search service' || /Academy Search API|SearXNG|Brave|DuckDuckGo|search Worker/i.test(item.provider || '') ? 0 : 1;
  successful.sort((a, b) => rank(a) - rank(b));
  const merged = dedupeResults(successful.flatMap(item => item.results || [])).slice(0, 18);
  const primary = successful[0];
  let provider = primary.provider || primary.source || 'Live search sources';
  let note = primary.note || '';
  if (!searchEndpoint() && category === 'web') note = 'Live fallback results from public answer and encyclopedia APIs. For broad ranked web results, deploy the included search Worker or Academy Search API; no fake results are shown.';
  else if (!searchEndpoint() && category === 'news') note = 'Live Google News RSS results. RSS coverage and freshness depend on the feed.';
  else if (searchEndpoint() && rank(primary) !== 0) note = `The configured backend was unavailable; showing live fallback results instead. ${failures.join(' | ')}`;
  else if (successful.length > 1 && merged.length > (primary.results || []).length) note = [note, 'Additional live fallback sources were merged.'].filter(Boolean).join(' ');
  if (['videos', 'documents'].includes(category) && rank(primary) !== 0) note = `${categoryLabel(category)}-specific broad search may need the configured search backend. ${note}`;
  return { results: merged, provider, note };
}
async function searchDuckDuckGoInstantBounded(queryText) {
  return await Promise.race([
    searchDuckDuckGoInstant(queryText),
    new Promise((_, reject) => setTimeout(() => reject(new DOMException('DuckDuckGo instant answers timed out after 4 seconds.', 'TimeoutError')), 4000))
  ]);
}
async function searchWikipediaBounded(queryText, category) {
  return await Promise.race([
    searchWikipedia(queryText, category),
    new Promise((_, reject) => setTimeout(() => reject(new DOMException('Wikipedia search timed out after 4.5 seconds.', 'TimeoutError')), 4500))
  ]);
}
function searchWorkerRoot() {
  let root = searchEndpoint();
  if (root.endsWith('/search')) root = root.slice(0, -7);
  return root.replace(/\/+$/, '');
}
function formatFeedDate(value) {
  if (!value) return 'Latest';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Latest';
  const age = Math.max(0, Date.now() - parsed.getTime());
  if (age < 3600000) return `${Math.max(1, Math.round(age / 60000))} min ago`;
  if (age < 86400000) return `${Math.round(age / 3600000)} hr ago`;
  return parsed.toLocaleDateString([], { month: 'short', day: 'numeric' });
}
function normalizeHeadline(item, source = '') {
  const url = safeExternalUrl(item.url || item.link || item.guid || '');
  const title = String(item.title || '').replace(/\s+/g, ' ').trim();
  if (!url || !title) return null;
  let domain = '';
  try { domain = new URL(url).hostname.replace(/^www\./, ''); } catch {}
  return {
    title: title.slice(0, 220), url,
    snippet: stripHtml(item.snippet || item.description || item.content || '').slice(0, 360),
    source: String(item.source || source || domain || 'News feed').slice(0, 80),
    published: item.published || item.pubDate || item.date || '',
    image: safeExternalUrl(item.image || item.thumbnail || item.enclosure?.link || '')
  };
}
async function fetchLiveHeadlines() {
  const tasks = [];
  const failures = [];
  const root = searchWorkerRoot();
  if (root) tasks.push((async () => {
    const response = await fetchWithTimeout(`${root}/headlines?limit=6`, { headers: { Accept: 'application/json' } }, 5200);
    let data = {}; try { data = await response.json(); } catch {}
    const items = (Array.isArray(data.items) ? data.items : Array.isArray(data.results) ? data.results : [])
      .map(item => normalizeHeadline(item, item.source || data.source || 'Live news')).filter(Boolean).slice(0, 6);
    if (!response.ok || !items.length) throw new Error(data.error || data.message || `News service returned HTTP ${response.status} with no parseable headlines`);
    return { items, source: data.source || 'Configured news feed' };
  })());
  const rssFeeds = [
    { url: 'https://feeds.bbci.co.uk/news/world/rss.xml', source: 'BBC News' },
    { url: 'https://feeds.bbci.co.uk/news/technology/rss.xml', source: 'BBC Technology' },
    { url: 'https://www.theguardian.com/world/rss', source: 'The Guardian' }
  ];
  for (const feed of rssFeeds) tasks.push((async () => {
    const api = new URL('https://api.rss2json.com/v1/api.json'); api.searchParams.set('rss_url', feed.url);
    const response = await fetchWithTimeout(api.href, { headers: { Accept: 'application/json' } }, 5200);
    let payload = {}; try { payload = await response.json(); } catch {}
    if (!response.ok || payload.status !== 'ok' || !Array.isArray(payload.items)) throw new Error(payload.message || `${feed.source} RSS conversion returned HTTP ${response.status}`);
    const items = payload.items.map(item => normalizeHeadline(item, feed.source)).filter(Boolean).slice(0, 6);
    if (!items.length) throw new Error(`${feed.source} returned no parseable headlines`);
    return { items, source: `${feed.source} RSS` };
  })());
  try { return await Promise.any(tasks); }
  catch (error) {
    const reasons = error instanceof AggregateError ? error.errors.map(getErrorText) : [getErrorText(error)];
    throw new Error(`All live news sources failed. ${reasons.join(' | ')}`);
  }
}
function renderHomeFeed(items, source = '', error = '') {
  const grid = $('#homeFeedGrid');
  const status = $('#homeFeedStatus');
  if (!grid || !status) return;
  grid.replaceChildren();
  if (items.length) {
    status.textContent = `${source || 'Live news'} · updated ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    items.slice(0, 6).forEach(item => {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'home-news-card';
      const imageUrl = safeExternalUrl(item.image || '');
      if (imageUrl && preferences.showThumbnails) {
        const image = document.createElement('img'); image.className = 'home-news-image'; image.src = imageUrl; image.alt = ''; image.loading = 'lazy'; image.referrerPolicy = 'no-referrer';
        image.addEventListener('error', () => image.remove(), { once: true }); button.append(image);
      } else {
        const mark = document.createElement('span'); mark.className = 'home-news-mark'; mark.textContent = (item.source || 'N').charAt(0).toUpperCase(); button.append(mark);
      }
      const body = document.createElement('span'); body.className = 'home-news-copy';
      const meta = document.createElement('small'); meta.textContent = `${item.source || 'News'} · ${formatFeedDate(item.published)}`;
      const title = document.createElement('strong'); title.textContent = item.title;
      const snippet = document.createElement('span'); snippet.className = 'home-news-snippet'; snippet.textContent = item.snippet || 'Open the publisher to read the full story.';
      body.append(meta, title, snippet); button.append(body);
      button.addEventListener('click', () => openAddress(item.url, { createTab: false, title: item.title }).catch(err => showError(err, 'Could not open news story')));
      grid.append(button);
    });
  } else {
    status.textContent = 'Live headlines could not be reached right now.';
    const notice = document.createElement('div'); notice.className = 'feed-error';
    const title = document.createElement('strong'); title.textContent = 'Live headlines are temporarily unavailable';
    const detail = document.createElement('p'); detail.textContent = 'Check your connection or configure the Search Worker / Academy API in Browser Settings. Search results may still work through other sources.';
    const exact = document.createElement('small'); exact.className = 'feed-error-detail'; exact.textContent = error ? `Exact source error: ${String(error).slice(0, 900)}` : 'No source returned a parseable feed.';
    const retry = document.createElement('button'); retry.type = 'button'; retry.className = 'quiet-btn'; retry.textContent = 'Try again'; retry.addEventListener('click', () => loadHomeFeed({ force: true }));
    const news = document.createElement('a'); news.href = 'https://news.google.com/'; news.target = '_blank'; news.rel = 'noopener noreferrer'; news.textContent = 'Open Google News ↗';
    notice.append(title, detail, exact, retry, news); grid.append(notice);
    if (error) console.info('[Code Academy Browser] Live news feed error:', error);
  }
}
async function loadHomeFeed({ force = false } = {}) {
  if (!preferences.liveNews) { const feed = $('#homeFeed'); if (feed) feed.hidden = true; return; }
  const feed = $('#homeFeed'); if (feed) feed.hidden = false;
  const refreshMs = preferences.newsRefresh === 'never' ? Infinity : Math.max(5, Number(preferences.newsRefresh || 15)) * 60000;
  if (!force && homeFeedItems.length && Date.now() - homeFeedUpdatedAt < refreshMs) {
    renderHomeFeed(homeFeedItems, homeFeedSource); return;
  }
  if (homeFeedLoading) return;
  homeFeedLoading = true;
  setProgressTask('Live headlines', true);
  const status = $('#homeFeedStatus'); if (status) status.textContent = 'Connecting to current news feeds…';
  try {
    const payload = await fetchLiveHeadlines();
    homeFeedItems = payload.items; homeFeedSource = payload.source; homeFeedUpdatedAt = Date.now();
    renderHomeFeed(homeFeedItems, homeFeedSource);
  } catch (error) {
    renderHomeFeed([], '', getErrorText(error));
  } finally { homeFeedLoading = false; setProgressTask('Live headlines', false); }
}
function scheduleNewsRefresh() {
  if (newsRefreshTimer) window.clearInterval(newsRefreshTimer);
  const minutes = preferences.newsRefresh === 'never' ? 0 : Number(preferences.newsRefresh || 15);
  if (preferences.liveNews && minutes >= 5) {
    newsRefreshTimer = window.setInterval(() => {
      if (!document.hidden && getActiveTab()?.kind === 'home') loadHomeFeed({ force: true });
    }, minutes * 60000);
  }
}
function renderAddressSuggestions(raw = '') {
  const container = ui.addressSuggestions;
  if (!container || !preferences.suggestionsEnabled) { if (container) container.hidden = true; return; }
  const queryText = String(raw || '').trim().toLowerCase();
  const recent = historyEntries.slice().filter(item => item.url || item.query).slice(0, 20).map(item => ({ label: item.title || item.query || item.url, value: item.query || item.url, kind: item.kind === 'search' || item.query ? 'Recent search' : 'Recent site' }));
  const quick = [
    { label: 'Google Search', value: 'https://www.google.com', kind: 'Quick link' },
    { label: 'DuckDuckGo Search', value: 'https://duckduckgo.com', kind: 'Quick link' },
    { label: 'Wikipedia', value: 'https://www.wikipedia.org', kind: 'Quick link' },
    { label: 'Current news', value: 'latest world news today', kind: 'Search suggestion' }
  ];
  let candidates = queryText ? [...recent, ...quick].filter(item => `${item.label} ${item.value}`.toLowerCase().includes(queryText)) : [...recent, ...quick];
  if (queryText && !looksLikeWebsite(raw) && !candidates.some(item => item.value.toLowerCase() === queryText)) candidates.unshift({ label: `Search for “${String(raw).trim()}”`, value: String(raw).trim(), kind: 'Search suggestion' });
  const unique = new Set(); candidates = candidates.filter(item => item.value && !unique.has(item.value) && unique.add(item.value)).slice(0, 6);
  container.replaceChildren();
  if (!unique.size) { container.hidden = true; return; }
  candidates.forEach(item => {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'suggestion-item'; button.setAttribute('role', 'option');
    const mark = document.createElement('span'); mark.className = 'suggestion-mark'; mark.textContent = item.kind === 'Recent site' ? '↗' : '⌕';
    const copy = document.createElement('span'); copy.className = 'suggestion-copy';
    const title = document.createElement('strong'); title.textContent = item.label;
    const kind = document.createElement('small'); kind.textContent = item.kind; copy.append(title, kind); button.append(mark, copy);
    button.addEventListener('click', () => { ui.address.value = item.value; ui.addressSuggestions.hidden = true; submitAddress(item.value).catch(err => showError(err, 'Suggestion navigation failed')); });
    container.append(button);
  });
  container.hidden = false;
}

function categoryLabel(category) { return ({ web: 'Web', images: 'Image', videos: 'Video', news: 'News', documents: 'Document', maps: 'Map', books: 'Book' })[category] || 'Web'; }
function engineSearchUrl(engine, queryText, category = 'web') {
  const q = encodeURIComponent(String(queryText || '').trim());
  const imageSuffix = category === 'images' ? '&tbm=isch' : category === 'news' ? '&tbm=nws' : category === 'videos' ? '&tbm=vid' : category === 'documents' ? '+filetype%3Apdf' : '';
  const urls = {
    google: `https://www.google.com/search?q=${q}${imageSuffix}`,
    bing: `https://www.bing.com/search?q=${q}${category === 'images' ? '&form=HDRSC2' : ''}`,
    duckduckgo: `https://duckduckgo.com/?q=${q}${category === 'images' ? '&iax=images&ia=images' : category === 'news' ? '&iar=news&ia=news' : ''}`,
    ecosia: `https://www.ecosia.org/search?q=${q}`,
    brave: `https://search.brave.com/search?q=${q}${category === 'images' ? '&source=web' : ''}`,
    fofa: `https://fofa.info/result?qbase64=${encodeURIComponent(btoa(unescape(encodeURIComponent(String(queryText || '')))))}`,
    censys: `https://search.censys.io/search?resource=hosts&q=${q}`
  };
  if (urls[engine]) return urls[engine];
  if (['torch', 'grams', 'foc'].includes(engine)) {
    const custom = String(preferences.customSearchEngineUrl || '').trim();
    if (!custom || !custom.includes('{query}')) throw new Error(`${engine.toUpperCase()} is not a verified built-in search provider. Configure its trusted HTTPS template in Browser Settings before using it.`);
    const target = new URL(custom.replaceAll('{query}', q));
    if (target.protocol !== 'https:' || target.username || target.password) throw new Error('Custom search engines must use a trusted HTTPS URL without embedded credentials.');
    return target.href;
  }
  return urls.google;
}
function updatePreferredEngineLink(queryText, category = 'web') {
  if (!ui.preferredEngineFallback) return;
  const engine = String(preferences.searchEngine || 'google').toLowerCase();
  const labels = { google:'Google', bing:'Microsoft Bing', duckduckgo:'DuckDuckGo', ecosia:'Ecosia', brave:'Brave Search', torch:'Custom Torch search', grams:'Custom Grams search', foc:'Custom FOC search', fofa:'FOFA asset search', censys:'Censys host search' };
  ui.preferredEngineFallback.textContent = `${labels[engine] || 'Primary search engine'} ↗`;
  try { ui.preferredEngineFallback.href = engineSearchUrl(engine, queryText, category); ui.preferredEngineFallback.hidden = false; }
  catch (error) { ui.preferredEngineFallback.removeAttribute('href'); ui.preferredEngineFallback.title = error.message; ui.preferredEngineFallback.hidden = false; }
}
function renderFrequentSites() {
  const container = $('#frequentSitesList'); if (!container) return;
  container.replaceChildren();
  const tally = new Map();
  const source = (preferences.privateSession || !preferences.saveHistory) ? [] : (historyEntries || []);
  for (const item of source) {
    const raw = String(item.url || '');
    if (!/^https?:\/\//i.test(raw)) continue;
    try {
      const url = new URL(raw); const key = url.origin;
      const previous = tally.get(key) || { origin:key, host:url.hostname.replace(/^www\./,''), title:(item.title && !String(item.title).startsWith('Search:')) ? String(item.title) : url.hostname, count:0, last:Number(item.createdAt||0) };
      previous.count += 1; previous.last = Math.max(previous.last, Number(item.createdAt||0));
      if (!String(item.title || '').startsWith('Search:') && item.title) previous.title = String(item.title);
      tally.set(key, previous);
    } catch {}
  }
  const sites = [...tally.values()].sort((a,b)=>b.count-a.count || b.last-a.last).slice(0,6);
  if (!sites.length) { const empty=document.createElement('p'); empty.className='frequent-empty'; empty.textContent='Your most visited websites will appear here after you browse. Visits are counted only when history saving is enabled.'; container.append(empty); return; }
  for (const site of sites) {
    const button=document.createElement('button'); button.type='button'; button.className='frequent-site';
    const icon=document.createElement('span'); icon.className='frequent-site-icon'; icon.textContent=(site.host[0]||'W').toUpperCase();
    const copy=document.createElement('span'); copy.className='frequent-site-copy'; const title=document.createElement('strong'); title.textContent=site.host; const count=document.createElement('small'); count.textContent=`${site.count} visit${site.count===1?'':'s'}`; copy.append(title,count); button.append(icon,copy);
    button.addEventListener('click',()=>openAddress(site.origin,{createTab:false}).catch(error=>showError(error,`Could not open ${site.host}`)));
    container.append(button);
  }
}

function renderSearchResults(queryText, category, payload, cachedAnswer = null) {
  ui.results.replaceChildren(); ui.answer.replaceChildren(); ui.answer.hidden = true;
  ui.heading.textContent = `Results for “${queryText}”`;
  ui.kicker.textContent = `${categoryLabel(category).toUpperCase()} SEARCH`;
  ui.meta.textContent = `${payload.results.length} results · ${payload.provider}${payload.note ? ` · ${payload.note}` : ''}`;
  ui.googleFallback.href = `https://www.google.com/search?q=${encodeURIComponent(queryText)}${category === 'images' ? '&tbm=isch' : category === 'news' ? '&tbm=nws' : category === 'videos' ? '&tbm=vid' : category === 'documents' ? '+filetype%3Apdf' : ''}`;
  ui.duckFallback.href = `https://duckduckgo.com/?q=${encodeURIComponent(queryText)}${category === 'images' ? '&iax=images&ia=images' : category === 'news' ? '&iar=news&ia=news' : category === 'videos' ? '&iax=videos&ia=videos' : ''}`;
  updatePreferredEngineLink(queryText, category);
  if (payload.note) {
    const note = document.createElement('div'); note.className = 'answer-card'; const strong = document.createElement('strong'); strong.textContent = 'Search source'; const text = document.createElement('span'); text.textContent = payload.note; note.append(strong, text); ui.results.append(note);
  }
  if (!payload.results.length) {
    const empty = document.createElement('div'); empty.className = 'no-results'; empty.textContent = `No ${categoryLabel(category).toLowerCase()} results were returned for “${queryText}”. Try another phrase or connect the search backend in Browser Settings.`; ui.results.append(empty); return;
  }
  if (category === 'images' || (category === 'books' && payload.results.some(item => item.thumbnail))) {
    const grid = document.createElement('div'); grid.className = 'image-results';
    payload.results.forEach(item => {
      const card = document.createElement('article'); card.className = 'image-result';
      const img = document.createElement('img'); img.loading = 'lazy'; img.alt = item.title; img.src = item.thumbnail || item.imageUrl; img.referrerPolicy = 'no-referrer';
      img.addEventListener('error', () => { img.style.display = 'none'; });
      const body = document.createElement('div'); body.className = 'image-meta';
      const title = document.createElement('strong'); title.textContent = item.title;
      const source = document.createElement('p'); source.textContent = item.domain || item.source || '';
      const open = document.createElement('button'); open.type = 'button'; open.textContent = 'Open source'; open.addEventListener('click', () => openSearchResult(item));
      const download = document.createElement('button'); download.type = 'button'; download.style.marginTop = '6px'; download.textContent = 'Download image'; download.addEventListener('click', () => downloadImage(item.imageUrl || item.thumbnail, item.title, item.url));
      body.append(title, source, open); if (item.thumbnail || item.imageUrl) body.append(download); card.append(img, body); grid.append(card);
    }); ui.results.append(grid); return;
  }
  payload.results.forEach(item => {
    const card = document.createElement('article'); card.className = 'result-item';
    const source = document.createElement('div'); source.className = 'result-site';
    const favicon = document.createElement('span'); favicon.className = 'site-favicon'; favicon.textContent = hostInitial(item.url);
    const domain = document.createElement('span'); domain.textContent = item.domain || safeDomain(item.url); source.append(favicon, domain);
    const title = document.createElement('button'); title.type = 'button'; title.className = 'result-title'; title.textContent = item.title; title.addEventListener('click', () => openSearchResult(item));
    const snippet = document.createElement('p'); snippet.textContent = item.snippet || 'Open this result to view its contents in the browser workspace.';
    const actions = document.createElement('div'); actions.className = 'result-actions';
    const open = document.createElement('button'); open.type = 'button'; open.className = 'result-action'; open.textContent = 'Open in browser tab'; open.addEventListener('click', () => openSearchResult(item));
    const copy = document.createElement('button'); copy.type = 'button'; copy.className = 'result-action'; copy.textContent = 'Copy link'; copy.addEventListener('click', async () => { try { await navigator.clipboard.writeText(item.url); showToast('Result link copied.'); } catch (error) { showError(error, 'Copy link failed'); } });
    actions.append(open, copy); card.append(source, title, snippet, actions); ui.results.append(card);
  });
}
function safeDomain(url) { try { return new URL(url).hostname; } catch { return ''; } }

async function performSearch(rawQuery, category = activeCategory, options = {}) {
  if (!options.silent) browserHadUserActivity = true;
  const queryText = String(rawQuery || '').trim();
  if (!queryText) { showToast('Enter a search phrase or website address.', 'warn'); return; }
  if (searchBusy) return;
  if (category === 'web' && looksLikeWebsite(queryText)) {
    try { await openAddress(normalizeUrl(queryText), { createTab: false }); }
    catch (error) { showError(error, 'Website address error'); }
    return;
  }
  searchBusy = true; lastSearchQuery = queryText; setSelectedCategory(category); if (ui.categoryRow) ui.categoryRow.hidden = false; ui.address.value = queryText; if (ui.heroSearch) ui.heroSearch.value = queryText; setProgressTask('Search', true);
  hideViews(); ui.searchView.hidden = false; ui.heading.textContent = `Searching for “${queryText}”`; ui.meta.textContent = `Contacting ${categoryLabel(category).toLowerCase()} search sources…`;
  ui.results.replaceChildren(); const loading = document.createElement('div'); loading.className = 'no-results'; loading.textContent = `Searching ${categoryLabel(category).toLowerCase()} sources for “${queryText}”…`; ui.results.append(loading);
  ui.googleFallback.href = `https://www.google.com/search?q=${encodeURIComponent(queryText)}`;
  ui.duckFallback.href = `https://duckduckgo.com/?q=${encodeURIComponent(queryText)}`;
  updatePreferredEngineLink(queryText, category);
  $('#censysFallback').href = `https://search.censys.io/search?resource=hosts&q=${encodeURIComponent(queryText)}`;
  const fofaQuery = looksLikeWebsite(queryText) ? `domain="${queryText.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split(/[/?#]/)[0]}"` : queryText;
  let fofaEncoded = '';
  try { fofaEncoded = btoa(String.fromCharCode(...new TextEncoder().encode(fofaQuery))); } catch { fofaEncoded = btoa(fofaQuery.replace(/[^\x00-\x7F]/g, '')); }
  $('#fofaFallback').href = `https://fofa.info/result?qbase64=${encodeURIComponent(fofaEncoded)}`;
  ui.footerStatus.textContent = `Searching: ${queryText}`; setStatus('Searching…');
  let tab = getActiveTab();
  if (!options.silent) {
    tab = await navigateTabView({ title: shorten(queryText, 30), kind: 'search', url: `browser.html?q=${encodeURIComponent(queryText)}&category=${encodeURIComponent(category)}`, query: queryText, category });
    // Log every user-initiated search attempt even when the search provider later fails.
    if (preferences.notificationsEnabled && preferences.accountSync && !preferences.privateSession) await sendBrowserNotification(queryText, category);
  }
  try {
    const payload = await getSearchResults(queryText, category);
    renderSearchResults(queryText, category, payload);
    if (!options.silent) {
      const entry = await saveHistoryEntry({ title: `Search: ${queryText}`, kind: 'search', query: queryText, category, url: `browser.html?q=${encodeURIComponent(queryText)}&category=${encodeURIComponent(category)}` });
      await saveTabRemote(getActiveTab() || tab || entry);
      if (preferences.notificationsEnabled && !preferences.privateSession && 'Notification' in window && Notification.permission === 'granted') {
        try { new Notification('Code Academy Browser', { body: `Search completed: ${queryText}`, icon: './browser-icon-192.png', tag: `browser-search-${Date.now()}` }); } catch (error) { console.warn('[Code Academy Browser] Device notification failed:', error); }
      }
    }
    setStatus(`${payload.results.length} result${payload.results.length === 1 ? '' : 's'}`);
    ui.footerStatus.textContent = `${payload.provider} · Results shown inside Code Academy Browser.`;
  } catch (error) {
    ui.results.replaceChildren(); const box = document.createElement('div'); box.className = 'error-box'; box.textContent = `Search failed: ${getErrorText(error)}`; ui.results.append(box);
    ui.heading.textContent = 'Search could not be completed'; ui.meta.textContent = `The exact error is shown below.`; showError(error, 'Search error'); setStatus('Search error');
  } finally { searchBusy = false; setProgressTask('Search', false); }
}
async function sendBrowserNotification(queryText, category) {
  if (!currentUser) return;
  try {
    await addDoc(collection(db, 'browserProfiles', currentUser.uid, 'notifications'), {
      title: 'Browser search', message: `You searched for “${queryText}” in ${categoryLabel(category)} search.`,
      type: 'browser', icon: '🌐', link: `browser.html?q=${encodeURIComponent(queryText)}&category=${encodeURIComponent(category)}`,
      read: false, createdAt: serverTimestamp()
    });
  } catch (error) {
    showToast(`Search was completed, but the Code Academy notification could not be saved: ${getErrorText(error)}`, 'warn');
    console.warn('[Code Academy Browser] Browser notification write failed:', error);
  }
}
async function openSearchResult(item) {
  const url = safeExternalUrl(item.url);
  if (!url) { showToast('This result does not contain a valid HTTP/HTTPS address.', 'warn'); return; }
  await openAddress(url, { createTab: false, title: item.title });
}

function startFrameLoad(url, forceReload = true) {
  const safeUrl = safeExternalUrl(url);
  if (!safeUrl) { showToast('Only HTTP and HTTPS websites can open here.', 'warn'); return; }
  hideViews(); ui.websiteView.hidden = false; ui.blocked.hidden = true;
  ui.progress.classList.add('loading'); ui.address.value = safeUrl; setStatus(`Loading ${safeDomain(safeUrl)}…`);
  ui.siteHint.hidden = !preferences.siteWarning;
  frameNavigation += 1; const requestNumber = frameNavigation;
  if (frameTimer) clearTimeout(frameTimer);
  frameTimer = setTimeout(() => {
    if (requestNumber === frameNavigation) {
      ui.progress.classList.remove('loading');
      setStatus('Website response may be restricted');
    }
  }, 12000);
  ui.frame.onload = () => {
    if (requestNumber !== frameNavigation) return;
    clearTimeout(frameTimer); ui.progress.classList.remove('loading'); setStatus(safeDomain(safeUrl));
    ui.footerStatus.textContent = `Viewing ${safeDomain(safeUrl)}. Some destinations may block frame embedding or their sign-in/payment flows.`;
    applyDesktopMode();
  };
  if (forceReload || ui.frame.src !== safeUrl) ui.frame.src = safeUrl;
}
async function openAddress(url, options = {}) {
  const safeUrl = normalizeUrl(url);
  let tab = getActiveTab();
  if (options.createTab || !tab) tab = await createNewTab({ focus: true });
  tab = await navigateTabView({ title: shorten(options.title || safeDomain(safeUrl), 34), kind: 'site', url: safeUrl, query: '', category: 'web' });
  ui.address.value = safeUrl; await saveHistoryEntry({ title: options.title || safeDomain(safeUrl), kind: 'site', url: safeUrl, category: 'web' });
  renderTabs();
  if (window.CodeAcademyNative && typeof window.CodeAcademyNative.openUrl === 'function') {
    nativeActiveUrl = safeUrl;
    window.CodeAcademyNative.openUrl(safeUrl, options.title || safeDomain(safeUrl));
  } else startFrameLoad(safeUrl, true);
  return tab;
}
async function submitAddress(raw) {
  const text = String(raw || '').trim();
  if (!text) return;
  if (looksLikeWebsite(text)) await openAddress(normalizeUrl(text), { createTab: false });
  else await performSearch(text, activeCategory);
}
async function backForward(direction) {
  try {
    const tab = getActiveTab();
    if (!tab || !Array.isArray(tab.navHistory) || !tab.navHistory.length) { showToast('No saved navigation in this tab.', 'warn'); return; }
    const currentIndex = Number.isInteger(tab.historyIndex) ? tab.historyIndex : tab.navHistory.length - 1;
    const nextIndex = currentIndex + direction;
    if (nextIndex < 0 || nextIndex >= tab.navHistory.length) { showToast(direction < 0 ? 'No previous page in this tab.' : 'No next page in this tab.'); return; }
    const view = tab.navHistory[nextIndex];
    await updateActiveTab({ ...view, navHistory: tab.navHistory, historyIndex: nextIndex }, true);
    renderTabs(); await renderActiveTab();
  } catch (error) { showError(error, 'Navigation error'); }
}
function retryCurrentFrame() { const tab = getActiveTab(); if (tab?.url) startFrameLoad(tab.url, true); }
function openInstallDialog() {
  if (!ui.moreMenu.hidden) ui.moreMenu.hidden = true;
  ui.installDialog.hidden = false;
  if (window.CodeAcademyNative) {
    ui.installHelp.textContent = 'You are using the native Android browser app. Native APK installation happens through Android’s package installer or the app store; a webpage cannot reinstall itself.';
  } else if (deferredInstallPrompt) {
    ui.installHelp.textContent = 'Your browser has offered a web-app install prompt. This installs the web app, not a standalone APK file.';
  } else {
    ui.installHelp.textContent = 'No web-app install prompt is available right now. A normal webpage cannot silently install an APK. Build and distribute the native Android package separately, then install it through Android or Google Play.';
  }
}
async function installBrowser() {
  if (deferredInstallPrompt) {
    try {
      await deferredInstallPrompt.prompt(); const outcome = await deferredInstallPrompt.userChoice;
      if (outcome?.outcome === 'accepted') { showToast('Installation was accepted by the browser.'); ui.installDialog.hidden = true; }
      else showToast('The browser install prompt was dismissed.');
    } catch (error) { showError(error, 'Install prompt failed'); }
    finally { deferredInstallPrompt = null; }
  } else {
    ui.installHelp.textContent = window.CodeAcademyNative ? 'This app is already installed as a native Android package.' : 'No browser-managed web install prompt is available. A native APK must be installed through Android’s package installer or Google Play; this web page cannot install it directly.';
  }
}
function openShareDialog() {
  const dialog = $('#shareDialog'); if (!dialog) return;
  $('#shareDialogStatus').textContent = '';
  dialog.hidden = false;
}
function closeShareDialog() { const dialog = $('#shareDialog'); if (dialog) dialog.hidden = true; }
async function sendSharePayload(payload, fallbackText = '') {
  try {
    if (window.CodeAcademyNative?.share) { window.CodeAcademyNative.share(String(payload.title || ''), String(payload.text || fallbackText || ''), String(payload.url || '')); closeShareDialog(); return; }
    if (navigator.share) { await navigator.share(payload); closeShareDialog(); return; }
    const text = fallbackText || `${payload.title || ''}\n${payload.text || ''}\n${payload.url || ''}`;
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); closeShareDialog(); showToast('Share details copied. Paste them into your messaging app.'); return; }
    $('#shareDialogStatus').textContent = 'Native sharing and clipboard access are unavailable. Copy the URL from the address bar instead.';
  } catch (error) {
    if (error?.name === 'AbortError') return;
    $('#shareDialogStatus').textContent = `Sharing failed: ${getErrorText(error)}`;
  }
}
async function shareApplication() {
  const url = new URL('index.html', currentBaseUrl()).href;
  const title = 'Code Academy App';
  const text = 'Explore Code Academy, your learning workspace with an integrated browser for web search, live news, images, documents, focused tabs and privacy settings. Open the app and continue learning from one place.';
  await sendSharePayload({ title, text, url }, `${title}\n${text}\n${url}`);
}
async function shareCurrentTab() {
  const tab = getActiveTab(); if (!tab) { $('#shareDialogStatus').textContent = 'There is no active tab to share.'; return; }
  const targetUrl = tab.url && safeExternalUrl(tab.url) ? tab.url : new URL('browser.html', currentBaseUrl()).href;
  const title = tab.title || (tab.kind === 'search' ? tab.query : '') || 'Code Academy Browser';
  const description = tab.kind === 'search'
    ? `Search for “${tab.query}” in Code Academy Browser. Explore categorized results, then open the destination in your focused browser tab.`
    : `I’m viewing ${title} with Code Academy Browser. Open the site, explore its original content, and try the browser’s search, tabs, history and privacy tools.`;
  let shareUrl;
  try {
    const branded = new URL('browser.html', currentBaseUrl());
    branded.searchParams.set('shared_url', targetUrl);
    branded.searchParams.set('shared_title', title);
    shareUrl = branded.href;
  } catch { shareUrl = targetUrl; }
  const root = searchWorkerRoot();
  if (root) {
    try {
      const metadata = new URL(`${root}/share-preview`);
      metadata.searchParams.set('url', targetUrl);
      metadata.searchParams.set('title', title);
      metadata.searchParams.set('description', description);
      shareUrl = metadata.href;
    } catch { /* keep the static branded preview fallback */ }
  }
  const shareText = `${description}\n\nOriginal site: ${targetUrl}\nShared with Code Academy Browser by Code Academy — fast search, current news and secure browsing in one focused workspace.`;
  await sendSharePayload({ title: `${title} · Code Academy Browser`, text: shareText, url: shareUrl }, `${title} · Code Academy Browser\n${shareText}\n\nPreview: ${shareUrl}`);
}
async function downloadCurrent() {
  const tab = getActiveTab(); if (!tab) { showToast('There is no active tab to download.', 'warn'); return; }
  if (currentImageResult?.imageUrl) { await downloadImage(currentImageResult.imageUrl, currentImageResult.title, currentImageResult.url); return; }
  if (preferences.confirmDownloads && !window.confirm('This page cannot be exported as its original website file by a normal PWA. Download a small .url shortcut to this address instead?')) return;
  const url = tab.url || new URL('browser.html', currentBaseUrl()).href;
  const contents = `[InternetShortcut]\r\nURL=${url}\r\n`;
  const blob = new Blob([contents], { type: 'text/plain;charset=utf-8' });
  triggerBlobDownload(blob, `${(tab.title || 'browser-tab').replace(/[^a-z0-9-_]+/gi, '-').slice(0, 60) || 'browser-tab'}.url`);
  await saveHistoryEntry({ title: `Exported shortcut: ${tab.title}`, kind: 'file-export', fileName: `${tab.title}.url`, url, category: 'web' });
  showToast('Website shortcut exported. Cross-origin page content is not downloaded.');
}
function triggerBlobDownload(blob, filename) {
  const objectUrl = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = objectUrl; link.download = filename; link.rel = 'noopener'; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(objectUrl), 2000);
}
async function downloadImage(url, title, sourcePage = '') {
  const safeUrl = safeExternalUrl(url);
  if (!safeUrl) { showToast('The source did not provide a downloadable image URL.', 'warn'); return; }
  if (preferences.confirmDownloads && !window.confirm(`Download image “${title || 'search image'}”? Review its source and reuse licence before publishing it.`)) return;
  try {
    const response = await fetchWithTimeout(safeUrl, { mode: 'cors' }, 15000);
    if (!response.ok) throw new Error(`Image source returned HTTP ${response.status}`);
    const blob = await response.blob(); if (!blob.type.startsWith('image/')) throw new Error(`The source returned ${blob.type || 'an unknown file type'}, not an image.`);
    const ext = (blob.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg').replace(/[^a-z0-9]/gi, '').slice(0, 5) || 'jpg';
    const filename = `${String(title || 'browser-image').replace(/[^a-z0-9-_]+/gi, '-').slice(0, 60) || 'browser-image'}.${ext}`;
    triggerBlobDownload(blob, filename);
    await saveHistoryEntry({ title: `Exported image: ${title}`, kind: 'file-export', fileName: filename, url: sourcePage || safeUrl });
    showToast(`Image download started: ${filename}`);
  } catch (error) {
    const fallback = document.createElement('a'); fallback.href = safeUrl; fallback.target = '_blank'; fallback.rel = 'noopener noreferrer'; fallback.download = '';
    document.body.append(fallback); fallback.click(); fallback.remove();
    await saveHistoryEntry({ title: `Image export attempted: ${title}`, kind: 'file-export', fileName: String(title || 'image'), url: sourcePage || safeUrl });
    showToast(`Direct image download was blocked: ${getErrorText(error)}. The source page was opened as a fallback.`, 'warn');
  }
}

function openFileDatabase() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) { reject(new Error('IndexedDB is not supported by this browser.')); return; }
    const request = indexedDB.open('code-academy-browser-assets', 1);
    request.onupgradeneeded = () => { const database = request.result; if (!database.objectStoreNames.contains('assets')) database.createObjectStore('assets', { keyPath: 'id' }); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open local file storage.'));
  });
}
async function storeLocalAsset(file) {
  const assetId = id(); const record = { id: assetId, name: file.name, type: file.type || 'application/octet-stream', size: file.size, createdAt: now(), blob: file };
  try {
    const database = await openFileDatabase();
    await new Promise((resolve, reject) => {
      const transaction = database.transaction('assets', 'readwrite');
      transaction.objectStore('assets').put(record); transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error || new Error('File did not save to local storage.'));
      transaction.onabort = () => reject(transaction.error || new Error('File save was aborted.'));
    }); database.close();
  } catch (error) { inMemoryFiles.set(assetId, record); console.warn('[Code Academy Browser] IndexedDB file persistence unavailable:', error); }
  const meta = { id: assetId, name: file.name, type: file.type || 'application/octet-stream', size: file.size, createdAt: now() };
  fileEntries = [meta, ...fileEntries.filter(item => item.id !== assetId)].slice(0, HISTORY_LIMIT); writeJSON(STORAGE.files, fileEntries);
  await saveHistoryEntry({ title: `Imported file: ${file.name}`, kind: 'file-import', fileName: file.name, assetId, createdAt: meta.createdAt });
  if (file.type.startsWith('image/')) {
    importedImage = { id: assetId, name: file.name, type: file.type, url: URL.createObjectURL(file), size: file.size };
    showToast(`Image imported: ${file.name}. Choose Images, or search its file name for related images.`);
  } else showToast(`File imported locally: ${file.name}`);
  renderFiles();
}
async function loadFiles() {
  fileEntries = localFiles().slice(0, HISTORY_LIMIT); renderFiles();
  const latestImports = historyEntries.filter(item => item.kind === 'file-import');
  latestImports.forEach(item => {
    if (!fileEntries.some(file => file.id === item.assetId) && item.assetId) fileEntries.unshift({ id: item.assetId, name: item.fileName, createdAt: item.createdAt, type: 'unknown', size: 0 });
  });
  fileEntries = fileEntries.slice(0, HISTORY_LIMIT); writeJSON(STORAGE.files, fileEntries); renderFiles();
  // The file list is local-first; remote history stores metadata, not private file bytes.
  if (currentUser) {
    try {
      const snapshot = await getDocs(query(collection(db, 'browserProfiles', currentUser.uid, 'browserHistory'), orderBy('createdAt', 'desc'), limit(HISTORY_LIMIT)));
      snapshot.docs.forEach(docSnap => {
        const item = docSnap.data();
        if (item.kind === 'file-import' && item.assetId && !fileEntries.some(file => file.id === item.assetId)) fileEntries.push({ id: item.assetId, name: item.fileName, type: 'unknown', size: 0, createdAt: item.createdAt });
      });
      fileEntries = fileEntries.slice(0, HISTORY_LIMIT); renderFiles();
    } catch (error) { console.info('[Code Academy Browser] Remote file metadata unavailable:', getErrorText(error)); }
  }
}
function renderFiles() {
  ui.filesList.replaceChildren();
  if (!fileEntries.length) { const empty = document.createElement('div'); empty.className = 'drawer-empty'; empty.textContent = 'Import an image or file to see it listed here. File bytes are kept locally where storage allows.'; ui.filesList.append(empty); return; }
  fileEntries.forEach(file => {
    const row = document.createElement('div'); row.className = 'file-item';
    const icon = document.createElement('span'); icon.className = 'file-icon'; icon.textContent = String(file.type || '').startsWith('image/') ? '▧' : '▱';
    const copy = document.createElement('div'); copy.className = 'file-copy'; const title = document.createElement('strong'); title.textContent = file.name || 'Imported file';
    const meta = document.createElement('small'); meta.textContent = `${formatBytes(file.size)} · ${formatDate(file.createdAt)}`; copy.append(title, meta);
    const get = document.createElement('button'); get.type = 'button'; get.textContent = 'Export'; get.addEventListener('click', async () => { await exportLocalAsset(file); });
    const isImage = String(file.type || '').startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp|svg|avif|heic)$/i.test(String(file.name || ''));
    if (isImage) {
      const searchImage = document.createElement('button'); searchImage.type = 'button'; searchImage.textContent = 'Search related images';
      searchImage.title = 'Search related image results using this file name; this does not upload the image to a third-party reverse-image service.';
      searchImage.addEventListener('click', () => {
        const queryText = String(file.name || '').replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
        closeDrawers();
        if (!queryText) { showToast('This image has no searchable file name.', 'warn'); return; }
        performSearch(queryText, 'images').catch(error => showError(error, 'Image search failed'));
      });
      row.append(icon, copy, get, searchImage);
    } else row.append(icon, copy, get);
    const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Remove'; remove.addEventListener('click', async () => { await removeLocalAsset(file.id); });
    row.append(remove); ui.filesList.append(row);
  });
}
function formatBytes(bytes) { const size = Number(bytes || 0); if (!size) return 'Size unavailable'; if (size < 1024) return `${size} B`; if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`; return `${(size / (1024 * 1024)).toFixed(1)} MB`; }
async function getLocalAsset(assetId) {
  if (inMemoryFiles.has(assetId)) return inMemoryFiles.get(assetId);
  const database = await openFileDatabase();
  const record = await new Promise((resolve, reject) => {
    const transaction = database.transaction('assets', 'readonly'); const request = transaction.objectStore('assets').get(assetId);
    request.onsuccess = () => resolve(request.result || null); request.onerror = () => reject(request.error || new Error('Could not retrieve the file.'));
  }); database.close(); return record;
}
async function exportLocalAsset(meta) {
  if (!meta?.id) { showToast('This file has no local asset identifier.', 'warn'); return; }
  try {
    if (preferences.confirmDownloads && !window.confirm(`Export “${meta.name}” from this device?`)) return;
    const record = await getLocalAsset(meta.id);
    if (!record?.blob) throw new Error('The file contents are not available on this device. This can happen after clearing browser storage or moving to another device.');
    triggerBlobDownload(record.blob, record.name || meta.name || 'export');
    await saveHistoryEntry({ title: `Exported file: ${record.name}`, kind: 'file-export', fileName: record.name, assetId: meta.id });
    showToast(`Export started for ${record.name}.`);
  } catch (error) { showError(error, 'File export failed'); }
}
async function removeLocalAsset(assetId) {
  try {
    const database = await openFileDatabase();
    await new Promise((resolve, reject) => {
      const transaction = database.transaction('assets', 'readwrite'); transaction.objectStore('assets').delete(assetId);
      transaction.oncomplete = resolve; transaction.onerror = () => reject(transaction.error || new Error('Could not remove file.'));
    }); database.close();
  } catch (error) { console.info('[Code Academy Browser] File store delete result:', getErrorText(error)); }
  inMemoryFiles.delete(assetId); fileEntries = fileEntries.filter(file => file.id !== assetId); writeJSON(STORAGE.files, fileEntries); renderFiles(); showToast('Local file entry removed.');
}
async function exportHistoryList() {
  const rows = { app: 'Code Academy Browser', exportedAt: new Date().toISOString(), history: historyEntries, files: fileEntries };
  const blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' }); triggerBlobDownload(blob, `code-academy-browser-history-${new Date().toISOString().slice(0, 10)}.json`);
  await saveHistoryEntry({ title: 'Exported browser history list', kind: 'file-export', fileName: 'code-academy-browser-history.json' });
  showToast('History list exported as JSON.');
}
function startVoiceSearch() {
  if (!preferences.voiceEnabled) { showToast('Voice search is disabled in Browser Settings.', 'warn'); return; }
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) { showToast('Speech recognition is not supported in this browser. Try a supported browser and allow microphone access.', 'warn'); return; }
  try {
    const recognition = new SpeechRecognition(); recognition.lang = document.documentElement.lang || navigator.language || 'en-US'; recognition.interimResults = false; recognition.maxAlternatives = 1;
    $('#voiceButton').classList.add('listening'); setStatus('Listening for voice search…');
    recognition.onresult = event => { const value = event.results?.[0]?.[0]?.transcript || ''; if (value.trim()) { ui.address.value = value.trim(); ui.heroSearch.value = value.trim(); submitAddress(value.trim()); } };
    recognition.onerror = event => { showToast(`Voice input error: ${event.error || 'unknown recognition error'}`, 'error'); };
    recognition.onend = () => { $('#voiceButton').classList.remove('listening'); setStatus('Ready'); };
    recognition.start();
  } catch (error) { showError(error, 'Voice search failed'); }
}

function saveCurrentBookmark() {
  const tab = getActiveTab();
  if (!tab || (!tab.url && !tab.query)) { showToast('Open a website or run a search before bookmarking.', 'warn'); return; }
  const bookmarkUrl = tab.url || new URL(`browser.html?q=${encodeURIComponent(tab.query)}&category=${encodeURIComponent(tab.category || 'web')}`, location.href).href;
  let saved = [];
  try { saved = JSON.parse(localStorage.getItem('ca_browser_bookmarks_v1') || '[]'); if (!Array.isArray(saved)) saved = []; }
  catch (error) { showError(error, 'Could not read bookmarks'); return; }
  const existing = saved.find(item => item.url === bookmarkUrl);
  if (existing) {
    saved = saved.filter(item => item.url !== bookmarkUrl);
    try { localStorage.setItem('ca_browser_bookmarks_v1', JSON.stringify(saved)); $('#bookmarkCurrentButton')?.setAttribute('aria-pressed', 'false'); showToast('Bookmark removed.'); }
    catch (error) { showError(error, 'Could not remove bookmark'); }
    return;
  }
  saved.push({ id: id(), title: String(tab.title || safeDomain(bookmarkUrl) || 'Saved page'), url: bookmarkUrl, createdAt: now() });
  try { localStorage.setItem('ca_browser_bookmarks_v1', JSON.stringify(saved.slice(-1000))); $('#bookmarkCurrentButton')?.setAttribute('aria-pressed', 'true'); showToast('Page added to bookmarks.'); }
  catch (error) { showError(error, 'Could not save bookmark'); }
}

function attachEvents() {
  ui.addressForm.addEventListener('submit', event => { event.preventDefault(); ui.addressSuggestions.hidden = true; submitAddress(ui.address.value).catch(error => showError(error, 'Search or navigation failed')); });
  ui.heroSearchForm.addEventListener('submit', event => { event.preventDefault(); const query = ui.heroSearch.value.trim(); if (query) { ui.addressSuggestions.hidden = true; submitAddress(query).catch(error => showError(error, 'Search failed')); } });
  $('#voiceButton').addEventListener('click', startVoiceSearch);
  const homeButton = $('#homeButton');
  if (homeButton && homeButton.tagName !== 'A') homeButton.addEventListener('click', async () => {
    const tab = getActiveTab();
    if (!tab) await createNewTab();
    else await navigateTabView({ kind: 'home', title: 'New tab', url: '', query: '', category: 'web' });
    ui.addressSuggestions.hidden = true;
    await renderActiveTab();
  });
  $('#navHistoryButton')?.addEventListener('click', () => openDrawer('history', 'all'));
  $('#searchHistoryButton')?.addEventListener('click', () => openDrawer('history', 'search'));
  $('#navRefreshButton')?.addEventListener('click', () => $('#reloadButton')?.click());
  $('#historyButton')?.addEventListener('click', () => openDrawer('history', 'all'));
  $('#searchModeButton')?.addEventListener('click', () => { ui.address.focus(); ui.categoryRow.hidden = false; showToast('Search mode ready. Enter a phrase or a website address.'); });
  $('#incognitoModeButton')?.addEventListener('click', async () => { preferences.privateSession = true; preferences.saveHistory = false; preferences.accountSync = false; writeJSON(STORAGE.prefs, preferences); applyPreferences(); await createNewTab(); showToast('Private session enabled for this browser workspace. Network activity is still visible to websites and network providers.'); });
  $('#refreshFrequentSitesButton')?.addEventListener('click', renderFrequentSites);
  $('#refreshNewsButton').addEventListener('click', () => loadHomeFeed({ force: true }));
  ui.address.addEventListener('focus', () => renderAddressSuggestions(ui.address.value));
  ui.address.addEventListener('input', () => renderAddressSuggestions(ui.address.value));
  ui.address.addEventListener('keydown', event => { if (event.key === 'Escape') ui.addressSuggestions.hidden = true; });
  document.addEventListener('click', event => { if (!event.target.closest('.address-form')) ui.addressSuggestions.hidden = true; });
  $('#newTabButton').addEventListener('click', () => createNewTab().catch(error => showError(error, 'New tab failed')));
  $('#bookmarkCurrentButton')?.addEventListener('click', saveCurrentBookmark);
  $('#toolbarDownloadButton')?.addEventListener('click', () => downloadCurrent().catch(error => showError(error, 'Download failed')));
  $('#emptyNewTab').addEventListener('click', () => createNewTab().catch(error => showError(error, 'New tab failed')));
  $('#backButton').addEventListener('click', () => backForward(-1)); $('#forwardButton').addEventListener('click', () => backForward(1));
  $('#reloadButton').addEventListener('click', () => { const tab = getActiveTab(); if (tab?.kind === 'site') retryCurrentFrame(); else if (tab?.kind === 'search') performSearch(tab.query, tab.category, { silent: true }); else showToast('New tab is already ready.'); });
  $$('.category-chip').forEach(button => button.addEventListener('click', () => {
    const category = button.dataset.category; if (!CATEGORIES.includes(category)) return;
    setSelectedCategory(category);
    const active = getActiveTab();
    let query = active?.kind === 'site' ? safeDomain(active.url).replace(/^www\./i, '') : (lastSearchQuery || active?.query || ui.heroSearch.value || ui.address.value);
    if (query && looksLikeWebsite(query) && category !== 'web') query = query.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split(/[/?#]/)[0];
    if (query) performSearch(query, category).catch(error => showError(error, 'Category search failed'));
    else if (category !== 'web') { ui.address.value = ''; ui.heroSearch.value = ''; showToast(`Type something to search ${categoryLabel(category).toLowerCase()}.`); }
  }));
  $$('.quick-link[data-open-url]').forEach(button => button.addEventListener('click', () => openAddress(button.dataset.openUrl, { createTab: false }).catch(error => showError(error, 'Open site failed'))));
  $('#importImageQuick').addEventListener('click', () => { ui.filePicker.accept = 'image/*'; ui.filePicker.click(); });
  $('#filesButton')?.addEventListener('click', () => openDrawer('files'));
  $('#importFileButton').addEventListener('click', () => { ui.filePicker.accept = 'image/*,.pdf,.txt,.json,.csv,.html,.css,.js,.zip'; ui.filePicker.click(); });
  $('#filePicker').addEventListener('change', async event => {
    const files = Array.from(event.target.files || []); for (const file of files) { try { await storeLocalAsset(file); } catch (error) { showError(error, `Import failed for ${file.name}`); } }
    event.target.value = ''; if (files.length) openDrawer('files');
  });
  $('#historyFilter').addEventListener('input', renderHistory); $('#clearHistoryButton').addEventListener('click', clearHistory);
  $$('[data-close-drawer]').forEach(button => button.addEventListener('click', closeDrawers)); ui.backdrop.addEventListener('click', closeDrawers);
  $('#exportHistoryButton').addEventListener('click', () => exportHistoryList().catch(error => showError(error, 'History export failed')));
  $('#moreButton').addEventListener('click', event => { event.stopPropagation(); ui.moreMenu.hidden = !ui.moreMenu.hidden; });
  ui.moreMenu.addEventListener('click', async event => {
    const button = event.target.closest('[data-action]'); if (!button) return;
    try {
      switch (button.dataset.action) {
      case 'new-tab': await createNewTab(); break;
      case 'new-incognito':
        preferences.privateSession = true; preferences.saveHistory = false; preferences.accountSync = false;
        writeJSON(STORAGE.prefs, preferences); applyPreferences(); await createNewTab();
        showToast('Private session enabled. New tabs and history will not be saved or synced; this does not make network activity anonymous.'); break;
      case 'new-group': {
        const active = getActiveTab(); if (!active) { showToast('Open a tab before creating a tab group.', 'warn'); break; }
        const groupName = window.prompt('Name this tab group:'); if (!groupName || !groupName.trim()) break;
        active.groupName = groupName.trim().slice(0, 40); active.updatedAt = now(); persistLocalTabs(); saveTabRemote(active); renderTabs(); showToast(`Current tab added to “${active.groupName}”.`); break;
      }
      case 'history': openDrawer('history'); break;
      case 'clear-data': await clearBrowsingData(); break;
      case 'bookmarks': location.href = './browser-bookmarks.html'; break;
      case 'recent-tabs': location.href = './browser-recent-tabs.html'; break;
      case 'profile': location.href = './browser-profile.html'; break;
      case 'customize': location.href = './browser-settings.html#appearance'; break;
      case 'help': location.href = './help-feedback.html'; break;
      case 'files': openDrawer('files'); break;
      case 'desktop': preferences.desktopMode = !preferences.desktopMode; writeJSON(STORAGE.prefs, preferences); applyPreferences(); showToast(`Desktop layout ${preferences.desktopMode ? 'enabled' : 'disabled'}.`); break;
      case 'install': openInstallDialog(); break;
      case 'download': downloadCurrent().catch(error => showError(error, 'Download failed')); break;
      case 'share': openShareDialog(); break;
      case 'settings': location.href = './browser-settings.html'; break;
      case 'password-manager': location.href = './browser-password-manager.html'; break;
      }
    } catch (error) {
      showError(error, `${String(button.textContent || 'Menu action').trim()} failed`);
    } finally {
      ui.moreMenu.hidden = true;
    }
  });
  document.addEventListener('click', event => { if (!ui.moreMenu.hidden && !ui.moreMenu.contains(event.target) && event.target !== $('#moreButton')) ui.moreMenu.hidden = true; });
  $('#installButton')?.addEventListener('click', openInstallDialog); $('#confirmInstallButton')?.addEventListener('click', installBrowser);
  const dismissInstall = () => { ui.installDialog.hidden = true; try { localStorage.setItem('ca_browser_install_prompt_dismissed_v2', '1'); } catch {} };
  $('#closeInstallDialog').addEventListener('click', dismissInstall); $('#dismissInstallDialog').addEventListener('click', dismissInstall);
  $('#shareCurrentButton').addEventListener('click', openShareDialog);
  $('#closeShareDialog').addEventListener('click', closeShareDialog); $('#dismissShareDialog').addEventListener('click', closeShareDialog);
  $('#shareAppButton').addEventListener('click', shareApplication); $('#shareCurrentSiteButton').addEventListener('click', shareCurrentTab);
  $('#downloadCurrentButton').addEventListener('click', () => downloadCurrent().catch(error => showError(error, 'Download failed')));
  $('#dismissSiteHint').addEventListener('click', () => { ui.siteHint.hidden = true; });
  const openFullBrowser = () => {
    const tab = getActiveTab();
    if (!tab?.url || !safeExternalUrl(tab.url)) { showToast('There is no valid HTTP/HTTPS website open in this tab.', 'warn'); return; }
    openAddress(tab.url, { createTab: false, title: tab.title || 'Website' }).catch(error => showError(error, 'Could not reopen this website inside Code Academy Browser'));
  };
  $('#openFullBrowserButton').addEventListener('click', openFullBrowser);
  ui.openExternal.addEventListener('click', openFullBrowser);
  ui.retryFrame.addEventListener('click', retryCurrentFrame);
  $('#saveSearchButton').addEventListener('click', async () => { if (!lastSearchQuery) return; await saveHistoryEntry({ title: `Saved search: ${lastSearchQuery}`, query: lastSearchQuery, kind: 'search', category: activeCategory }); showToast('Search saved to history.'); });
  ['preferredEngineFallback','googleFallback','duckFallback','censysFallback','fofaFallback'].forEach(id => {
    const link = $('#'+id); if (!link) return;
    link.addEventListener('click', event => {
      event.preventDefault();
      if (!link.href || link.href === location.href) { showToast(link.title || 'This search engine needs a trusted HTTPS URL in Browser Settings.', 'warn'); return; }
      const label = (link.textContent || 'Search provider').replace(/↗/g, '').trim();
      openAddress(link.href, { createTab: false, title: label }).catch(error => showError(error, `${label} navigation failed`));
    });
  });
  window.addEventListener('resize', applyDesktopMode);
  window.addEventListener('keydown', event => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); createNewTab(); } if (event.key === 'Escape') { closeDrawers(); ui.installDialog.hidden = true; closeShareDialog(); ui.moreMenu.hidden = true; ui.addressSuggestions.hidden = true; } });
  window.addEventListener('storage', event => {
    if (event.key !== STORAGE.prefs) return;
    preferences = { ...defaultPreferences(), ...readJSON(STORAGE.prefs, {}) };
    if (preferences.privateSession) { historyEntries = []; try { localStorage.setItem(STORAGE.history, '[]'); } catch {} }
    applyPreferences(); setSelectedCategory(preferences.defaultCategory || 'web'); scheduleNewsRefresh();
    if (getActiveTab()?.kind === 'home' && preferences.liveNews) loadHomeFeed({ force: true });
  });
  window.addEventListener('online', () => setStatus('Online')); window.addEventListener('offline', () => setStatus('Offline — cached pages may still open'));
}

async function initializeBrowser(user) {
  currentUser = user;
  preferences = { ...defaultPreferences(), ...readJSON(STORAGE.prefs, {}) };
  const local = (preferences.privateSession || !preferences.saveHistory) ? [] : localHistory(); historyEntries = Array.isArray(local) ? local.slice(0, HISTORY_LIMIT) : [];
  fileEntries = localFiles().slice(0, HISTORY_LIMIT); applyPreferences();
  setSelectedCategory(preferences.defaultCategory || 'web');
  attachEvents();
  renderFrequentSites();
  if ('serviceWorker' in navigator && !window.CodeAcademyNative) {
    navigator.serviceWorker.register('./sw.js', { scope: new URL('./', location.href).pathname }).catch(error => {
      console.warn('[Code Academy Browser] Service worker registration failed:', error);
      ui.footerStatus.textContent = `Offline/PWA service worker could not register: ${getErrorText(error)}`;
    });
  }
  await loadSavedTabs();
  scheduleNewsRefresh();
  if (preferences.liveNews) loadHomeFeed().catch(error => console.info('[Code Academy Browser] Home feed startup request did not complete:', getErrorText(error)));
  try {
    const params = new URLSearchParams(location.search);
    const sharedUrl = params.get('shared_url'); const sharedTitle = params.get('shared_title') || '';
    const queryText = params.get('q'); const cat = params.get('category') || 'web';
    if (params.get('newtab') === '1') await createNewTab();
    if (sharedUrl) { const safeShared = safeExternalUrl(sharedUrl); if (safeShared) await openAddress(safeShared, { createTab: false, title: sharedTitle || safeDomain(safeShared) }); else showError(new Error('Shared URL is not a valid HTTP/HTTPS destination.'), 'Invalid shared link'); }
    else if (queryText) await performSearch(queryText, CATEGORIES.includes(cat) ? cat : 'web', { silent: false });
    if (params.get('files') === '1') openDrawer('files');
    const openUrl = params.get('open'); if (openUrl) { const safeOpen = safeExternalUrl(openUrl); if (safeOpen) await openAddress(safeOpen, { createTab: true }); else showError(new Error('Only valid HTTP or HTTPS destinations can be reopened.'), 'Invalid recent-tab destination'); }
    const installed = Boolean(window.CodeAcademyNative) || window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
    let installDismissed = false; try { installDismissed = localStorage.getItem('ca_browser_install_prompt_dismissed_v2') === '1'; } catch {}
    if (!installed && !installDismissed) window.setTimeout(() => { if (!ui.installDialog.hidden) return; openInstallDialog(); }, 1700);
  } catch (error) { showError(error, 'Browser startup error'); }
  window.addEventListener('pagehide', () => {
    if (preferences.clearHistoryOnExit && !preferences.privateSession) {
      try { localStorage.setItem(STORAGE.history, '[]'); } catch {}
    }
  });
}

async function connectOptionalAccountSync() {
  try {
    const [authentication, firestore] = await Promise.all([
      import('./browser-auth.js'),
      import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js')
    ]);
    auth = authentication.auth; db = authentication.db;
    ({ collection, addDoc, doc, setDoc, getDocs, getDoc, deleteDoc, query, orderBy, limit, serverTimestamp } = firestore);
    authentication.onAuthStateChanged(auth, async user => {
      const needsInitialSync = Boolean(user && syncedUserUid !== user.uid);
      currentUser = user || null;
      if (!user) {
        setStatus(navigator.onLine ? 'Guest browsing' : 'Offline');
        if (ui.footerStatus) ui.footerStatus.textContent = 'Guest mode: browsing, search and local history work without signing in. Account sync becomes available after sign-in.';
        return;
      }
      setStatus('Signed in');
      const avatar = $('#headerProfileImage'); if (avatar) avatar.src = user.photoURL || './browser-icon-192.png';
      if (needsInitialSync && preferences.accountSync && !preferences.privateSession && !browserHadUserActivity) {
        try {
          const remotePrefs = await getDoc(doc(db, 'browserProfiles', user.uid, 'browserSettings', 'preferences'));
          if (remotePrefs.exists()) {
            preferences = { ...preferences, ...remotePrefs.data() };
            writeJSON(STORAGE.prefs, preferences); applyPreferences(); setSelectedCategory(preferences.defaultCategory || 'web');
          }
          await loadSavedTabs();
          await loadHistory();
          await renderActiveTab();
          syncedUserUid = user.uid;
        } catch (error) { console.info('[Code Academy Browser] Account sync initialization failed; local data remains available:', getErrorText(error)); syncedUserUid = user.uid; }
      }
      if (ui.footerStatus) ui.footerStatus.textContent = preferences.accountSync && !preferences.privateSession ? 'Signed in. Account sync is available when your Code Academy database rules allow it.' : 'Signed in. Browser history and preferences are stored locally according to your settings.';
    }, error => {
      console.warn('[Code Academy Browser] Authentication status unavailable; browser remains usable:', error);
      setStatus('Guest browsing');
    });
  } catch (error) {
    currentUser = null;
    console.info('[Code Academy Browser] Firebase account sync could not be loaded. Continuing in device-only mode:', getErrorText(error));
    setStatus(navigator.onLine ? 'Guest browsing' : 'Offline');
    if (ui.footerStatus) ui.footerStatus.textContent = 'Device-only mode: account sync is unavailable, but local tabs, search controls and browsing remain available.';
  }
}

async function bootBrowser() {
  if (browserInitialized) return;
  browserInitialized = true;
  try {
    const authentication = await import('./browser-auth.js');
    auth = authentication.auth; db = authentication.db;
    const user = await new Promise((resolve, reject) => {
      let unsubscribe = () => {};
      const timer = window.setTimeout(() => { unsubscribe(); reject(new Error('Timed out checking the browser sign-in session.')); }, 12000);
      unsubscribe = authentication.onAuthStateChanged(auth, current => { window.clearTimeout(timer); unsubscribe(); resolve(current || null); }, error => { window.clearTimeout(timer); unsubscribe(); reject(error); });
    });
    if (!user) { location.replace('./login.html?next=browser.html'); return; }
    await initializeBrowser(user);
    // Account sync is optional after login; a Firestore rule or network error must not blank the UI.
    connectOptionalAccountSync();
  } catch (error) { browserInitialized = false; showError(error, 'Browser initialization failed'); }
}

// Native APK bridge entry points. These keep the browser state/history in the page
// while the Android Activity displays the destination in a top-level WebView.
window.CodeAcademyBrowser = {
  submitAddress: value => submitAddress(String(value || '')).catch(error => showError(error, 'Native address bar failed')),
  returnToHome: async () => {
    nativeActiveUrl = '';
    const active = getActiveTab();
    if (active && active.kind === 'home') await renderActiveTab();
    else await createNewTab({ focus: true });
  },
  openTabSwitcher: () => {
    nativeActiveUrl = '';
    const tab = getActiveTab();
    if (tab && tab.kind !== 'home') return createNewTab({ focus: true });
    return renderActiveTab();
  },
  refresh: () => {
    const tab = getActiveTab();
    if (tab?.kind === 'search') performSearch(tab.query, tab.category, { silent: true });
    else if (preferences.liveNews) loadHomeFeed({ force: true });
    else location.reload();
  },
  nativePageStatus: (url, title) => {
    nativeActiveUrl = String(url || '');
    setStatus(title || safeDomain(url) || 'Website open');
  },
  openSettings: () => { location.href = './browser-settings.html'; }
};

bootBrowser();
