/* Code Academy Safe Browser. Browser-native capabilities are used only after explicit user actions. */
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const KEYS = {
  prefs: 'ca_safe_browser_prefs_v1', history: 'ca_safe_browser_history_v1',
  bookmarks: 'ca_safe_browser_bookmarks_v1', tabs: 'ca_safe_browser_tabs_v1',
  groups: 'ca_safe_browser_groups_v1', inbox: 'ca_safe_browser_local_events_v1',
  returnTo: 'ca_safe_browser_return_to_v1'
};
const DEFAULT_PREFS = {
  theme: 'dark', provider: 'duckduckgo', dataSaver: true, safeSearch: true,
  voice: true, notifications: false, restoreTabs: false, deviceMode: 'fluid',
  dnsPreference: 'system', confirmInsecure: true, warnRisky: true, compactInterface: false
};
const readStore = (key, fallback) => {
  try { const val = JSON.parse(localStorage.getItem(key)); return val ?? fallback; }
  catch { return fallback; }
};
const writeStore = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; } };
const uuid = () => (globalThis.crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
const escapeHTML = (value) => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
let prefs = { ...DEFAULT_PREFS, ...readStore(KEYS.prefs, {}) };
let browserTabs = [];
let activeTabId = '';
let historyItems = readStore(KEYS.history, []);
let bookmarkItems = readStore(KEYS.bookmarks, []);
let tabGroups = readStore(KEYS.groups, ['Research', 'Learning', 'Work']);
let currentUser = null;
let lastRiskReport = null;
let installPrompt = null;
let frameFallbackTimer = null;
let firebaseApi = null;
let authSyncReady = false;
const pendingCloudEvents = [];
let voiceRecognition = null;

function makeTab(url = '', title = 'New tab', group = '') {
  return { id: uuid(), url, title, group, visits: url ? [{ url, title, at: Date.now() }] : [], cursor: 0 };
}
function activeTab() { return browserTabs.find(tab => tab.id === activeTabId) || browserTabs[0]; }
function persistPrefs() { writeStore(KEYS.prefs, prefs); }
function notifyLocal(title, message, kind = 'info', link = 'safe-browsing.html') {
  const event = { id: uuid(), title, message, type: kind === 'risk' ? 'security' : 'academy', courseName: 'Safe Browser', link, createdAt: new Date().toISOString(), read: false };
  const events = readStore(KEYS.inbox, []);
  events.unshift(event);
  writeStore(KEYS.inbox, events.slice(0, 100));
  try { localStorage.setItem('ca_menu_notification_bridge', JSON.stringify({ ...event, nonce: uuid() })); } catch {}
  try { const channel = new BroadcastChannel('codeacademy-notifications'); channel.postMessage(event); channel.close(); } catch {}
  void writeFirestoreNotification(event);
  if (prefs.notifications && 'Notification' in window && Notification.permission === 'granted' && document.visibilityState === 'visible') {
    try { new Notification(title, { body: message, icon: 'safe-browser-icon-192.png', tag: event.id }); } catch {}
  }
  return event;
}
async function writeFirestoreNotification(event) {
  if (!firebaseApi?.addDoc) { if (pendingCloudEvents.length < 30) pendingCloudEvents.push(event); return; }
  if (!currentUser) { if (!authSyncReady && pendingCloudEvents.length < 30) pendingCloudEvents.push(event); return; }
  try {
    const { addDoc, collection, serverTimestamp, db } = firebaseApi;
    await addDoc(collection(db, 'users', currentUser.uid, 'notifications'), {
      title: event.title, message: event.message, type: event.type,
      courseName: 'Safe Browser', link: event.link || 'safe-browsing.html',
      read: false, createdAt: serverTimestamp()
    });
  } catch (error) {
    console.warn('Safe Browser event could not be synced to the account notification feed. Local event remains saved.', error?.code || error?.message || 'Unknown error');
  }
}
async function initAccountSync() {
  const status = $('#accountStatus');
  try {
    const authModule = await import('./authentication.js');
    const firestore = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
    firebaseApi = { db: authModule.db, addDoc: firestore.addDoc, collection: firestore.collection, serverTimestamp: firestore.serverTimestamp };
    authModule.onAuthStateChanged(authModule.auth, user => {
      currentUser = user || null; authSyncReady = true;
      if (status) status.innerHTML = `<span class="status-dot" style="background:${user ? 'var(--green)' : 'var(--amber)'}"></span><span>${user ? escapeHTML(user.displayName || user.email || 'Account connected') : 'Guest browsing'}</span>`;
      if (currentUser && pendingCloudEvents.length) { const queued = pendingCloudEvents.splice(0, pendingCloudEvents.length); queued.forEach(event => void writeFirestoreNotification(event)); }
    });
  } catch (error) {
    authSyncReady = true; pendingCloudEvents.length = 0;
    if (status) status.innerHTML = '<span class="status-dot" style="background:var(--amber)"></span><span>Local browsing mode</span>';
    console.info('Account sync is unavailable in this session; local browser tools remain available.', error?.message || error);
  }
}
function toast(message, type = '') {
  const stack = $('#toastStack');
  const el = document.createElement('div'); el.className = `toast ${type}`; el.textContent = message;
  stack.appendChild(el); window.setTimeout(() => el.remove(), 4300);
}
function showBanner(message, type = 'warn') {
  const banner = $('#alertBanner'); banner.className = `alert-banner ${type}`; banner.textContent = message; banner.hidden = false;
}
function clearBanner() { $('#alertBanner').hidden = true; }
function pushHistory(url, title, risk) {
  historyItems.unshift({ id: uuid(), url, title: title || hostname(url), at: Date.now(), risk: risk?.level || 'unknown' });
  historyItems = historyItems.slice(0, 300); writeStore(KEYS.history, historyItems);
}
function hostname(url) { try { return new URL(url).hostname; } catch { return String(url || 'New tab'); } }
function prettyURL(url) { try { const u = new URL(url); return `${u.protocol}//${u.host}${u.pathname === '/' ? '' : u.pathname}`; } catch { return url || 'New tab'; } }
function isLikelyURL(value) {
  const text = String(value || '').trim();
  return /^(https?:\/\/|www\.)/i.test(text) || (!/\s/.test(text) && /\.[a-z]{2,}(?::\d+)?(?:[/?#]|$)/i.test(text));
}
function normalizeURL(value) {
  let text = String(value || '').trim();
  if (!text) throw new Error('Enter a search query or a web address first.');
  if (/^(javascript|data|file|vbscript|chrome|intent|about|blob):/i.test(text)) throw new Error('This address scheme is blocked for safety. Only ordinary HTTPS/HTTP website addresses are supported.');
  if (/^www\./i.test(text)) text = `https://${text}`;
  else if (!/^https?:\/\//i.test(text)) text = `https://${text}`;
  let url;
  try { url = new URL(text); } catch { throw new Error('That address does not look valid. Check the spelling and try again.'); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only HTTP and HTTPS website addresses can be opened here.');
  if (url.username || url.password) throw new Error('Addresses containing embedded usernames or passwords are blocked. Open the site and sign in there instead.');
  if (!url.hostname || !url.hostname.includes('.')) throw new Error('Enter a valid domain such as example.com.');
  return url.href;
}
function searchURL(query) {
  const q = encodeURIComponent(query.trim());
  const provider = prefs.provider || 'duckduckgo';
  const strict = !!prefs.safeSearch;
  const urls = {
    duckduckgo: `https://duckduckgo.com/?q=${q}${strict ? '&kp=1' : ''}`,
    google: `https://www.google.com/search?q=${q}${strict ? '&safe=active' : ''}`,
    bing: `https://www.bing.com/search?q=${q}${strict ? '&adlt=strict' : ''}`,
    brave: `https://search.brave.com/search?q=${q}${strict ? '&safesearch=strict' : ''}`
  };
  return urls[provider] || urls.duckduckgo;
}
function analyzeURL(url) {
  const findings = [];
  let parsed;
  try { parsed = new URL(url); } catch { return { level: 'high', title: 'Invalid address', findings: ['The address could not be parsed as a normal website URL.'] }; }
  const host = parsed.hostname.toLowerCase();
  const ipHost = /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) || host.startsWith('[');
  if (parsed.protocol !== 'https:') findings.push('This page uses HTTP rather than HTTPS, so the connection is not encrypted by TLS.');
  if (host.startsWith('xn--') || host.includes('.xn--')) findings.push('The domain contains internationalized/punycode labels; check for look-alike characters.');
  if (ipHost) findings.push('The address uses a raw IP instead of a recognizable domain name. This can be legitimate, but verify who owns it.');
  if (host.split('.').length >= 5) findings.push('The domain has many subdomain levels. Confirm the actual registrable domain before signing in.');
  if (host.length > 55) findings.push('The hostname is unusually long. Look carefully for misspellings and added words.');
  if (/\b(login|verify|secure|account|wallet|support|update|password|gift|claim|bonus|recover)\b/i.test(host)) findings.push('The hostname contains words commonly used in impersonation lures. This alone does not prove a scam.');
  if (/(bit\.ly|tinyurl\.com|t\.co|is\.gd|cutt\.ly|shorturl\.at)$/i.test(host)) findings.push('This is a URL-shortening service; the final destination is not obvious from the address.');
  if (/(paypal|google|microsoft|apple|facebook|whatsapp|binance|github)[.-].*(login|verify|secure|support)|(?:login|verify|secure|support)[.-].*(paypal|google|microsoft|apple|facebook|whatsapp|binance|github)/i.test(host)) findings.push('The domain may imitate a well-known brand. Use a saved official bookmark instead of signing in from this link.');
  if (parsed.port && !['80', '443'].includes(parsed.port)) findings.push(`The site uses a non-standard port (${parsed.port}). Only continue if you expect this. `);
  if (parsed.href.length > 220) findings.push('The full address is unusually long; long tracking and redirect chains can hide the final destination.');
  if (parsed.pathname.toLowerCase().includes('%2f%2f') || parsed.search.toLowerCase().includes('redirect=')) findings.push('The URL appears to contain redirect parameters. Check the destination after redirects.');
  const level = findings.some(x => /not encrypted|imitate|punycode|shortening|not obvious|long.*hostname/i.test(x)) ? 'high' : findings.length ? 'caution' : 'no-obvious-flags';
  return { level, title: level === 'high' ? 'Review this link carefully' : level === 'caution' ? 'Some details deserve a closer look' : 'No obvious local warning found', findings, url, host };
}
function recordTabVisit(tab, url, title = '') {
  const visits = tab.visits || [];
  const kept = visits.slice(0, (tab.cursor || 0) + 1);
  kept.push({ url, title: title || hostname(url), at: Date.now() });
  tab.visits = kept.slice(-80); tab.cursor = tab.visits.length - 1;
  tab.url = url; tab.title = title || hostname(url);
  pushHistory(url, tab.title, lastRiskReport);
  persistTabs(); renderTabs();
}
function persistTabs() { writeStore(KEYS.tabs, browserTabs.map(t => ({ id: t.id, url: t.url, title: t.title, group: t.group, visits: t.visits, cursor: t.cursor }))); }
function renderTabs() {
  const strip = $('#tabStrip'); strip.replaceChildren();
  browserTabs.forEach(tab => {
    const button = document.createElement('button'); button.type = 'button'; button.className = `tab-chip${tab.id === activeTabId ? ' active' : ''}`;
    const mark = document.createElement('span'); mark.textContent = tab.url ? (tab.url.startsWith('https:') ? '🔒' : '⚠') : '✦';
    const title = document.createElement('span'); title.textContent = tab.group ? `${tab.group} · ${tab.title}` : tab.title;
    const close = document.createElement('button'); close.type = 'button'; close.className = 'tab-close'; close.textContent = '×'; close.setAttribute('aria-label', `Close ${tab.title}`);
    close.addEventListener('click', event => { event.stopPropagation(); closeTab(tab.id); });
    button.append(mark, title, close); button.addEventListener('click', () => activateTab(tab.id)); strip.appendChild(button);
  });
  $('#openTabs').textContent = String(browserTabs.length); $('#openTabs').title = `${browserTabs.length} open tab${browserTabs.length === 1 ? '' : 's'}`;
}
function activateTab(id) {
  const target = browserTabs.find(tab => tab.id === id); if (!target) return;
  activeTabId = id; renderTabs();
  if (target.url) loadFrame(target.url, false); else showStartPage();
}
function newTab({ focus = true, group = '' } = {}) {
  const tab = makeTab('', 'New tab', group); browserTabs.push(tab); activeTabId = tab.id; persistTabs(); renderTabs();
  if (focus) showStartPage(); return tab;
}
function closeTab(id) {
  const index = browserTabs.findIndex(tab => tab.id === id); if (index < 0) return;
  browserTabs.splice(index, 1);
  if (!browserTabs.length) newTab();
  else if (activeTabId === id) { activeTabId = browserTabs[Math.max(0, index - 1)].id; activateTab(activeTabId); }
  persistTabs(); renderTabs();
}
function showStartPage() {
  clearTimeout(frameFallbackTimer);
  $('#startPage').hidden = false;
  $('#frameShell').hidden = true;
  const frame = $('#webFrame'); if (frame) frame.src = 'about:blank';
  $('#securityMark').textContent = '⌕';
  $('#addressInput').value = '';
  lastRiskReport = null;
}
function showExternalStatus(url, message, title = 'Open website in your browser') {
  const tab = activeTab();
  $('#startPage').hidden = true;
  $('#frameShell').hidden = false;
  const frame = $('#webFrame'); if (frame) frame.src = 'about:blank';
  $('#frameFallback').hidden = false;
  $('#frameFallbackBtn').hidden = true;
  $('#expandFrame').hidden = true;
  $('#currentPageLabel').textContent = hostname(url);
  $('#currentDomain').textContent = url;
  $('#addressInput').value = url;
  $('#securityMark').textContent = url.startsWith('https:') ? '🔒' : '⚠';
  $('#externalStatusTitle').textContent = title;
  $('#externalStatusMessage').textContent = message;
  $('#externalStatusURL').textContent = url;
  $('#externalDirectLink').href = url;
  $('#fallbackOpen').onclick = () => launchExternalTab(url, { force: true });
  const status = $('#frameSafetyLabel');
  const report = analyzeURL(url);
  status.className = `safety-pill ${report.level === 'no-obvious-flags' ? 'safe' : report.level === 'caution' ? 'caution' : 'risk'}`;
  status.textContent = report.level === 'no-obvious-flags' ? 'Local checks found no obvious flags' : report.level === 'caution' ? 'Review recommended' : 'Potential risk';
  if (tab) { tab.url = url; tab.title = hostname(url); renderTabs(); persistTabs(); }
}
function launchExternalTab(url, { force = false } = {}) {
  if (navigator.onLine === false && !force) {
    showExternalStatus(url, 'Your device currently reports that it is offline. Reconnect to mobile data or Wi-Fi; you may also try opening the address anyway.', 'No internet connection detected');
    showDialog({ title: 'Device reports no internet connection', subtitle: hostname(url), icon: '⌁', body: '<p>Your device reports that it is offline. This is the only connection state this page can reliably check before opening another site.</p><p>Check mobile data, Wi‑Fi or your connection settings. You can still attempt to open the address.</p>', actions: [{ label: 'Stay here', primary: true }, { label: 'Try opening anyway', onClick: () => launchExternalTab(url, { force: true }) }] });
    return false;
  }
  let opened = null;
  try {
    // A top-level page is not subject to another site's iframe restrictions.
    // Use a user-initiated new tab so the Safe Browser workspace remains available.
    opened = window.open(url, '_blank');
    if (opened) { try { opened.opener = null; } catch {} }
  } catch (error) {
    console.info('Top-level link open was refused by this browser:', error?.message || error);
  }
  if (opened) {
    showExternalStatus(url, 'The destination has been handed to your device browser in a separate tab. Switch back to this tab to use Code Academy history, bookmarks, safety checks and settings. The target page loads normally, not inside a restricted frame.', 'Website opened in a browser tab');
    toast('Website opened in a separate browser tab.', 'success');
    notifyLocal('Website opened', `Opened ${hostname(url)} in a separate browser tab.`);
    return true;
  }
  showExternalStatus(url, 'This browser did not return a new-tab handle. Pop-up handling varies by device. Tap “Open website in browser tab” or use the direct link below. If the site itself fails, the device browser will display its own connection error.', 'One more tap may be needed');
  toast('No new-tab confirmation was returned. Use the direct link if no tab appeared.', 'warn');
  return false;
}
function loadFrame(url, addVisit = true, skipWarning = false) {
  clearTimeout(frameFallbackTimer); clearBanner();
  const tab = activeTab(); if (!tab) return;
  let normalized;
  try { normalized = normalizeURL(url); } catch (error) { toast(error.message, 'error'); return; }
  lastRiskReport = analyzeURL(normalized);
  if (addVisit) recordTabVisit(tab, normalized, hostname(normalized));
  else { tab.url = normalized; tab.title = hostname(normalized); renderTabs(); persistTabs(); }
  showExternalStatus(normalized, 'Opening this site as a normal browser page prevents the blank “refused to connect” problem caused by iframe restrictions.', 'Preparing website');
  if (!skipWarning && lastRiskReport.level !== 'no-obvious-flags' && prefs.warnRisky) {
    showSafetyDialog(lastRiskReport, normalized, false);
    return;
  }
  if (!skipWarning && new URL(normalized).protocol !== 'https:' && prefs.confirmInsecure) {
    showSafetyDialog(lastRiskReport, normalized, false);
    return;
  }
  if (lastRiskReport.findings.length) showBanner('The local URL check found signals to review. It is not a live malware verdict.', 'warn');
  launchExternalTab(normalized);
}
function navigateInput(value) {
  const text = String(value || '').trim();
  if (!text) { toast('Enter a search or web address.', 'warn'); return; }
  if (!navigator.onLine) { toast('Your device reports that it is offline. Reconnect, then try again.', 'error'); }
  if (!isLikelyURL(text)) {
    const url = searchURL(text);
    lastRiskReport = analyzeURL(url);
    loadFrame(url, true, true);
    notifyLocal('Search opened', `Searched for: ${text.slice(0, 120)}`);
    return;
  }
  try {
    const url = normalizeURL(text); const report = analyzeURL(url); lastRiskReport = report;
    if (report.findings.length && prefs.warnRisky) showSafetyDialog(report, url, true);
    else loadFrame(url);
  } catch (error) { toast(error.message, 'error'); }
}
function showDialog({ title, subtitle = '', icon = 'ⓘ', body = '', actions = [] }) {
  $('#dialogTitle').textContent = title; $('#dialogSubtitle').textContent = subtitle; $('#dialogIcon').textContent = icon;
  $('#dialogBody').innerHTML = body; const container = $('#dialogActions'); container.replaceChildren();
  actions.forEach(action => {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = action.label; if (action.primary) button.classList.add('primary'); if (action.danger) button.classList.add('danger');
    button.disabled = !!action.disabled; button.addEventListener('click', () => { if (action.close !== false) hideDialog(); action.onClick?.(); }); container.appendChild(button);
  });
  $('#dialogShade').hidden = false;
}
function hideDialog() { $('#dialogShade').hidden = true; }
function showSafetyDialog(report, url, pendingNavigation = false) {
  if (report.findings.length) notifyLocal('Suspicious-link warning', `${hostname(url)} raised a local safety warning. Review before entering sensitive information.`, 'risk');
  const levelText = report.level === 'high' ? 'Potentially suspicious' : report.level === 'caution' ? 'Review recommended' : 'No obvious flags';
  const findings = report.findings.length ? `<ul class="risk-list">${report.findings.map(item => `<li>${escapeHTML(item)}</li>`).join('')}</ul>` : '<p>No obvious local indicators were detected. This does not mean that the website is verified safe.</p>';
  showDialog({ title: 'Check this link before continuing', subtitle: `${levelText} · ${hostname(url)}`, icon: report.level === 'high' ? '⚠' : '🛡', body: `<p><strong>${escapeHTML(url)}</strong></p><p>${report.findings.length ? 'The local address check found these signals:' : 'The local address check did not find its common warning signals.'}</p>${findings}<p><strong>Important:</strong> this is a lightweight URL heuristic, not a live threat-intelligence verdict. Never enter passwords, payment details or verification codes if you are unsure.</p><p><a href="${'https://transparencyreport.google.com/safe-browsing/search?url=' + encodeURIComponent(url)}" target="_blank" rel="noopener noreferrer">Check this address with Google Safe Browsing ↗</a></p>`, actions: [
    { label: 'Cancel / stay safe', primary: true },
    { label: 'Open in device browser', onClick: () => { loadFrame(url, true, true); notifyLocal('Link opened externally', `Opened ${hostname(url)} in the device browser after the safety warning.`, 'risk'); } },
    { label: 'Continue to website', danger: true, onClick: () => { loadFrame(url, true, true); } }
  ] });
}
function openPanel(title, contentBuilder) {
  $('#panelTitle').textContent = title; const content = $('#panelContent'); content.replaceChildren(); contentBuilder(content);
  $('#panelShade').hidden = false; $('#sidePanel').classList.add('open'); $('#sidePanel').setAttribute('aria-hidden', 'false');
}
function closePanel() { $('#sidePanel').classList.remove('open'); $('#sidePanel').setAttribute('aria-hidden', 'true'); $('#panelShade').hidden = true; }
function panelEmpty(parent, message) { const box = document.createElement('div'); box.className = 'panel-empty'; box.textContent = message; parent.appendChild(box); }
function showHistoryPanel() {
  openPanel('Browsing history', parent => {
    const actions = document.createElement('button'); actions.className = 'panel-action'; actions.textContent = 'Export history as JSON'; actions.addEventListener('click', () => downloadBlob('code-academy-browser-history.json', JSON.stringify(historyItems, null, 2), 'application/json')); parent.appendChild(actions);
    const clear = document.createElement('button'); clear.className = 'panel-action'; clear.textContent = 'Clear history'; clear.addEventListener('click', () => showDialog({ title: 'Clear browsing history?', body: 'This deletes locally saved history for this Safe Browser on this device. It does not delete your provider search history or browsing data held by websites.', actions: [{ label: 'Keep history', primary: true }, { label: 'Clear local history', danger: true, onClick: () => { historyItems = []; writeStore(KEYS.history, historyItems); closePanel(); toast('Local browsing history cleared.', 'success'); } }] })); parent.appendChild(clear);
    if (!historyItems.length) return panelEmpty(parent, 'Your browsing history will appear here after you open pages.');
    historyItems.slice(0, 100).forEach(item => {
      const card = document.createElement('div'); card.className = 'panel-item'; const main = document.createElement('div'); main.className = 'panel-item-main';
      const title = document.createElement('strong'); title.textContent = item.title || hostname(item.url); const url = document.createElement('p'); url.textContent = item.url; const time = document.createElement('small'); time.textContent = new Date(item.at).toLocaleString(); main.append(title, url, time);
      const open = document.createElement('button'); open.textContent = 'Open'; open.addEventListener('click', () => { closePanel(); activateTab(activeTabId); navigateInput(item.url); }); card.append(main, open); parent.appendChild(card);
    });
  });
}
function showBookmarksPanel() {
  openPanel('Bookmarks', parent => {
    const add = document.createElement('button'); add.className = 'panel-action'; add.textContent = 'Bookmark current page'; add.addEventListener('click', () => saveBookmark()); parent.appendChild(add);
    if (!bookmarkItems.length) return panelEmpty(parent, 'Save sites you trust so you can return to their exact domain.');
    bookmarkItems.forEach(item => { const card = document.createElement('div'); card.className = 'panel-item'; const main = document.createElement('div'); main.className = 'panel-item-main'; const title = document.createElement('strong'); title.textContent = item.title; const url = document.createElement('p'); url.textContent = item.url; main.append(title, url); const open = document.createElement('button'); open.textContent = 'Open'; open.addEventListener('click', () => { closePanel(); navigateInput(item.url); }); const remove = document.createElement('button'); remove.textContent = 'Remove'; remove.addEventListener('click', () => { bookmarkItems = bookmarkItems.filter(x => x.id !== item.id); writeStore(KEYS.bookmarks, bookmarkItems); showBookmarksPanel(); }); card.append(main, open, remove); parent.appendChild(card); });
  });
}
function showTabsPanel() {
  openPanel('Tabs & tab groups', parent => {
    const makeGroup = document.createElement('button'); makeGroup.className = 'panel-action'; makeGroup.textContent = '+ Create a tab group'; makeGroup.addEventListener('click', () => showDialog({ title: 'Create a tab group', body: '<label for="newGroupName">Group name</label><input id="newGroupName" type="text" maxlength="32" placeholder="Research" style="display:block;width:100%;padding:10px;margin-top:8px;border-radius:9px;border:1px solid #2a4564;background:#0d2037;color:#fff">', actions: [{ label: 'Cancel' }, { label: 'Create group', primary: true, onClick: () => { const name = ($('#newGroupName')?.value || '').trim(); if (!name) return toast('Enter a group name.', 'warn'); if (!tabGroups.includes(name)) tabGroups.push(name); writeStore(KEYS.groups, tabGroups); const tab = activeTab(); if (tab) tab.group = name; persistTabs(); renderTabs(); showTabsPanel(); toast(`Tab group “${name}” created.`, 'success'); } }] })); parent.appendChild(makeGroup);
    const groupSelect = document.createElement('select'); groupSelect.className = 'panel-action'; groupSelect.setAttribute('aria-label', 'Move current tab to group'); groupSelect.innerHTML = '<option value="">Ungrouped</option>' + tabGroups.map(g => `<option value="${escapeHTML(g)}">${escapeHTML(g)}</option>`).join(''); groupSelect.value = activeTab()?.group || ''; groupSelect.addEventListener('change', () => { const tab = activeTab(); if (tab) tab.group = groupSelect.value; persistTabs(); renderTabs(); toast('Current tab group updated.', 'success'); }); parent.appendChild(groupSelect);
    browserTabs.forEach(tab => { const item = document.createElement('div'); item.className = 'panel-item'; const main = document.createElement('div'); main.className = 'panel-item-main'; const strong = document.createElement('strong'); strong.textContent = tab.title; const url = document.createElement('p'); url.textContent = tab.url || 'Start page'; const grp = document.createElement('small'); grp.textContent = tab.group ? `Group: ${tab.group}` : 'Ungrouped'; main.append(strong, url, grp); const open = document.createElement('button'); open.textContent = tab.id === activeTabId ? 'Current' : 'Switch'; open.addEventListener('click', () => { closePanel(); activateTab(tab.id); }); item.append(main, open); parent.appendChild(item); });
  });
}
function saveBookmark() {
  const tab = activeTab(); const url = tab?.url; if (!url) return toast('Open a page before bookmarking it.', 'warn');
  if (bookmarkItems.some(item => item.url === url)) return toast('This page is already bookmarked.');
  bookmarkItems.unshift({ id: uuid(), url, title: tab.title || hostname(url), at: Date.now() }); bookmarkItems = bookmarkItems.slice(0, 200); writeStore(KEYS.bookmarks, bookmarkItems); toast('Bookmark saved on this device.', 'success'); notifyLocal('Bookmark saved', `Saved ${hostname(url)} to your local bookmarks.`);
}
function downloadBlob(filename, data, mime) {
  const blob = new Blob([data], { type: mime }); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = filename; link.rel = 'noopener'; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(link.href), 1200);
  notifyLocal('Download prepared', `${filename} was prepared by Safe Browser. Website downloads from embedded pages may need to be opened in the device browser.`);
}
function settingsPanel() {
  openPanel('Browser settings', parent => {
    parent.innerHTML = `
      <section class="settings-section"><h3>APPEARANCE</h3>
        <div class="setting-row"><label for="prefTheme"><b>Colour theme</b><small>Switch between dark and light reading tones.</small></label><select id="prefTheme"><option value="dark">Dark</option><option value="light">Light</option></select></div>
        <div class="setting-row"><label for="prefDevice"><b>Viewport preview</b><small>Changes this app's viewing window; it does not change device-wide browser settings.</small></label><select id="prefDevice"><option value="fluid">Responsive</option><option value="mobile">Mobile</option><option value="compact">Small phone</option><option value="tablet">Tablet / iPad</option><option value="desktop">Desktop / PC</option></select></div>
      </section>
      <section class="settings-section"><h3>PRIVACY & DATA</h3>
        <div class="setting-row"><label for="prefDataSaver"><b>Data Saver mode</b><small>Reduces this app's preloading and visual overhead. It cannot compress or control data that external websites send.</small></label><input type="checkbox" id="prefDataSaver"></div>
        <div class="setting-row"><label for="prefSafeSearch"><b>Safe Search preference</b><small>Requests strict/moderate filtering from supported search providers.</small></label><input type="checkbox" id="prefSafeSearch"></div>
        <div class="setting-row"><label for="prefWarnRisky"><b>Show suspicious-link warnings</b><small>Local URL heuristic; never a guarantee that a page is safe.</small></label><input type="checkbox" id="prefWarnRisky"></div>
        <div class="setting-row"><label for="prefInsecure"><b>Warn on HTTP pages</b><small>HTTP has no TLS transport encryption.</small></label><input type="checkbox" id="prefInsecure"></div>
        <div class="setting-row"><label for="prefDns"><b>DNS guide preference</b><small>A website cannot change your system DNS resolver. This preference only selects which setup guide to show.</small></label><select id="prefDns"><option value="system">Device default</option><option value="cloudflare">Cloudflare (1.1.1.1)</option><option value="google">Google Public DNS</option><option value="quad9">Quad9</option></select></div>
      </section>
      <section class="settings-section"><h3>VOICE & NOTIFICATIONS</h3>
        <div class="setting-row"><label for="prefVoice"><b>Voice tools</b><small>Uses the speech tools available in your browser/device; support depends on your browser and language.</small></label><input type="checkbox" id="prefVoice"></div>
        <div class="setting-row"><label for="prefNotifications"><b>Browser notifications</b><small>Notifications work only where the browser grants permission; reliable background push requires a configured push service.</small></label><input type="checkbox" id="prefNotifications"></div>
      </section>
      <section class="settings-section"><h3>SEARCH & OPENING PAGES</h3>
        <div class="setting-row"><label for="prefProvider"><b>Default search provider</b><small>Applies to searches entered in the address bar.</small></label><select id="prefProvider"><option value="duckduckgo">DuckDuckGo</option><option value="google">Google</option><option value="bing">Bing</option><option value="brave">Brave Search</option></select></div>
        <div class="setting-row"><label class="setting-label"><b>Open behavior</b><small>External websites open as ordinary pages in a new browser tab because many sites explicitly block embedding.</small></label><span class="status-pill">Top-level tab</span></div>
      </section>
      <section class="settings-section"><h3>DEVICE TOOLS & DIAGNOSTICS</h3>
        <p class="settings-note">These tools run only after you tap them. Location requires your browser permission. Public IP lookup contacts an external IP service.</p>
        <button id="settingsConnection" class="panel-action" type="button">Check connection status</button>
        <button id="settingsIP" class="panel-action" type="button">View public IP address</button>
        <button id="settingsLocation" class="panel-action" type="button">Request device location</button>
        <button id="settingsSafetyCheck" class="panel-action" type="button">Check current destination safety</button>
        <button id="settingsSharePage" class="panel-action" type="button">Share current destination</button>
        <button id="settingsNotificationPermission" class="panel-action" type="button">Request notification permission</button>
        <a class="panel-action settings-link" href="https://transparencyreport.google.com/safe-browsing/search" target="_blank" rel="noopener noreferrer">Google Safe Browsing site-status check ↗</a>
        <a class="panel-action settings-link" href="https://support.google.com/android/answer/9654714" target="_blank" rel="noopener noreferrer">Android Private DNS guide ↗</a>
      </section>
      <section class="settings-section"><h3>PUBLIC RESEARCH SOURCES</h3>
        <p class="settings-note">These are separate research services, not extra general-purpose search engines. Use them for domains and assets you own or are authorized to review.</p>
        <a class="panel-action settings-link" href="https://search.censys.io/" target="_blank" rel="noopener noreferrer">Censys Search — public internet asset research ↗</a>
        <a class="panel-action settings-link" href="https://urlscan.io/" target="_blank" rel="noopener noreferrer">urlscan.io — inspect submitted page scans ↗</a>
        <a class="panel-action settings-link" href="https://crt.sh/" target="_blank" rel="noopener noreferrer">crt.sh — public certificate transparency search ↗</a>
      </section>
      <section class="settings-section"><h3>SESSION</h3>
        <div class="setting-row"><label for="prefRestore"><b>Restore saved tabs next time</b><small>Restoring tabs may load websites and use mobile data.</small></label><input type="checkbox" id="prefRestore"></div>
        <button id="dnsGuideButton" class="panel-action" type="button">View DNS setup guide</button>
        <button id="defaultGuideButton" class="panel-action" type="button">Default-browser setup guide</button>
        <button id="resetPreferences" class="panel-action" type="button">Reset browser preferences</button>
        <button id="clearBrowserData" class="panel-action" type="button">Clear local browser data</button>
      </section>
      <p class="small-note">Settings apply to this Safe Browser page and are stored on this device. IP checks and geolocation are not performed unless you tap the relevant tool.</p>`;
    const bindSelect = (id, key, onChange) => { const el = $(`#${id}`, parent); el.value = prefs[key]; el.addEventListener('change', () => { prefs[key] = el.value; persistPrefs(); onChange?.(el.value); }); };
    const bindCheck = (id, key, onChange) => { const el = $(`#${id}`, parent); el.checked = !!prefs[key]; el.addEventListener('change', () => { prefs[key] = el.checked; persistPrefs(); onChange?.(el.checked); }); };
    bindSelect('prefTheme', 'theme', applyTheme); bindSelect('prefDevice', 'deviceMode', applyDeviceMode); bindSelect('prefDns', 'dnsPreference', () => toast('DNS guide preference saved; the system DNS has not changed.'));
    const prefProvider = $('#prefProvider', parent); if (prefProvider) { prefProvider.value = prefs.provider; prefProvider.addEventListener('change', event => { prefs.provider = event.target.value; persistPrefs(); if ($('#searchProvider')) $('#searchProvider').value = prefs.provider; toast('Default search provider saved.', 'success'); }); }
    bindCheck('prefDataSaver', 'dataSaver', () => { document.body.classList.toggle('data-saver', !!prefs.dataSaver); toast('Data Saver preference saved. Headlines are cached longer and the home page avoids artwork preloading; external sites still control their own data use.'); });
    bindCheck('prefSafeSearch', 'safeSearch', () => toast('Safe Search preference saved for supported providers.'));
    bindCheck('prefWarnRisky', 'warnRisky'); bindCheck('prefInsecure', 'confirmInsecure'); bindCheck('prefVoice', 'voice');
    bindCheck('prefNotifications', 'notifications', async enabled => { if (!enabled) return; if (!('Notification' in window)) { prefs.notifications = false; persistPrefs(); return toast('This browser does not support web notifications.', 'warn'); } const result = await Notification.requestPermission(); prefs.notifications = result === 'granted'; persistPrefs(); $$('#prefNotifications', parent).forEach(el => el.checked = prefs.notifications); toast(prefs.notifications ? 'Browser notifications enabled.' : 'Notification permission was not granted.', prefs.notifications ? 'success' : 'warn'); });
    $('#prefRestore', parent).checked = !!prefs.restoreTabs; $('#prefRestore', parent).addEventListener('change', e => { prefs.restoreTabs = e.target.checked; persistPrefs(); });
    $('#dnsGuideButton', parent).addEventListener('click', showDNSGuide); $('#defaultGuideButton', parent).addEventListener('click', showDefaultGuide);
    $('#settingsConnection', parent).addEventListener('click', showConnectionStatus);
    $('#settingsIP', parent).addEventListener('click', showPublicIP);
    $('#settingsLocation', parent).addEventListener('click', showLocation);
    $('#settingsSafetyCheck', parent).addEventListener('click', showSafetyCheck);
    $('#settingsSharePage', parent).addEventListener('click', shareCurrentPage);
    $('#settingsNotificationPermission', parent).addEventListener('click', async () => { if (!('Notification' in window)) return toast('This browser does not support web notifications.', 'warn'); const result = await Notification.requestPermission(); prefs.notifications = result === 'granted'; persistPrefs(); toast(prefs.notifications ? 'Browser notifications enabled.' : 'Notification permission was not granted.', prefs.notifications ? 'success' : 'warn'); });
    $('#resetPreferences', parent).addEventListener('click', () => showDialog({ title: 'Reset browser preferences?', body: 'Theme, provider and local safety preferences will return to their defaults. History and bookmarks will remain.', actions: [{ label: 'Cancel', primary: true }, { label: 'Reset preferences', danger: true, onClick: () => { prefs = { ...DEFAULT_PREFS }; persistPrefs(); applyTheme(); applyDeviceMode(); closePanel(); toast('Preferences reset.', 'success'); } }] }));
    $('#clearBrowserData', parent).addEventListener('click', () => showDialog({ title: 'Clear local browser data?', body: 'This will remove local history, bookmarks, tab-group names and saved tab session from this device. It does not erase information kept by search engines or websites.', actions: [{ label: 'Cancel', primary: true }, { label: 'Clear local data', danger: true, onClick: () => { historyItems = []; bookmarkItems = []; tabGroups = []; writeStore(KEYS.history, historyItems); writeStore(KEYS.bookmarks, bookmarkItems); writeStore(KEYS.groups, tabGroups); localStorage.removeItem(KEYS.tabs); closePanel(); toast('Local history, bookmarks and saved tab session cleared.', 'success'); } }] }));
  });
}
function applyTheme() { document.documentElement.dataset.theme = prefs.theme === 'light' ? 'light' : 'dark'; const meta = $('meta[name="theme-color"]'); if (meta) meta.content = prefs.theme === 'light' ? '#edf4fc' : '#061126'; }
function applyDeviceMode() { const viewport = $('#deviceViewport'); viewport.className = `device-viewport mode-${prefs.deviceMode || 'fluid'}`; }
function showDNSGuide() {
  const choice = prefs.dnsPreference; const info = {
    system: ['Use your device default DNS', 'Your device or current network chooses the resolver. This Safe Browser page cannot override it.'],
    cloudflare: ['Cloudflare DNS guide', 'Android: open Settings → Network & internet → Private DNS (wording varies) → choose Private DNS provider hostname and enter one.one.one.one. Confirm that your network supports it before saving.'],
    google: ['Google Public DNS guide', 'Android: open Settings → Network & internet → Private DNS (wording varies) → choose provider hostname and enter dns.google. This changes the device/network resolver, not only this website.'],
    quad9: ['Quad9 DNS guide', 'Android: open Settings → Network & internet → Private DNS (wording varies) → choose provider hostname and enter dns.quad9.net. Provider features, availability and device menus can vary.']
  }[choice] || ['DNS settings', 'This browser page cannot change system DNS.'];
  showDialog({ title: info[0], subtitle: 'System setting — this web page cannot apply the change itself', icon: '⌘', body: `<p>${escapeHTML(info[1])}</p><p>Changing DNS does not make every website safe and does not hide your IP address from websites you visit.</p>`, actions: [{ label: 'Close', primary: true }, { label: 'Open Android Settings help', onClick: () => window.open('https://support.google.com/android/answer/9654714', '_blank', 'noopener,noreferrer') }] });
}
function showWelcomeDialog() {
  const key = 'ca_safe_browser_orientation_seen_v1';
  if (readStore(key, false)) return;
  writeStore(key, true);
  showDialog({ title: 'Welcome to Code Academy Safe Browser', subtitle: 'Your in-app browsing workspace', icon: '🛡', body: '<p>Search using a provider, check a URL before opening it, manage tabs and bookmarks, and enable voice or location tools only when you choose.</p><p><strong>About default-browser setup:</strong> this page can be installed as a web app, but a normal website cannot become Android’s system browser by itself. Setting the system default requires a native Android app that registers to handle web links.</p><p>You can continue using Safe Browser even if you decline installation or setup help. Links opened externally continue to use your current device browser.</p>', actions: [{ label: 'Continue without setup', primary: true }, { label: 'Show setup options', onClick: showDefaultGuide }, { label: 'Install web app', onClick: installPWA }] });
}
function showDefaultGuide() {
  showDialog({ title: 'Use Code Academy as your default browser', subtitle: 'Installable web app versus system browser role', icon: '📱', body: '<p><strong>This site can be installed as a PWA, but a normal website cannot claim Android’s system-wide browser role.</strong> Android requires an installed native app with browser intent filters and a user-approved browser role.</p><ol><li>Install this page from your browser menu when “Install app” is available.</li><li>For system-wide default-browser behavior, Code Academy needs a native Android wrapper/app that handles HTTP/HTTPS links.</li><li>Once that native build is installed, choose Settings → Apps → Default apps → Browser app and select Code Academy (if it is listed).</li></ol><p>Until that native app exists, declining does not block this in-app browsing workspace; links opened externally continue to use your device’s existing browser.</p>', actions: [{ label: 'Got it', primary: true }, { label: 'Install web app', onClick: installPWA }] });
}
async function installPWA() {
  if (installPrompt) { installPrompt.prompt(); const result = await installPrompt.userChoice; installPrompt = null; if (result?.outcome === 'accepted') toast('Code Academy Safe Browser installation accepted.', 'success'); else toast('Installation was not completed. You can use this page in your browser.'); }
  else showDialog({ title: 'Install this web app', body: '<p>Open your browser menu and choose <strong>Install app</strong> or <strong>Add to Home screen</strong> if offered.</p><p>Installing the web app does not set it as the system-wide default browser.</p>', actions: [{ label: 'Close', primary: true }] });
}
async function showPublicIP() {
  showDialog({ title: 'Public IP address', subtitle: 'Fetched only after your request', icon: '◈', body: '<p>Contacting a public IP lookup endpoint. This request reveals your request to that service.</p><p id="ipResult"><strong>Loading…</strong></p>', actions: [{ label: 'Close', primary: true }] });
  try {
    const response = await fetch('https://api.ipify.org?format=json', { cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' });
    if (!response.ok) throw new Error('IP service returned an error.');
    const data = await response.json(); const result = $('#ipResult'); if (result) result.innerHTML = `<strong>Your public IP:</strong> ${escapeHTML(data.ip)}<p class="small-note">This is the public address visible to that endpoint; VPNs, carrier NAT and network routing can affect it.</p>`;
    notifyLocal('Public IP checked', 'You requested a public IP lookup.');
  } catch { const result = $('#ipResult'); if (result) result.textContent = 'Could not reach the IP service. Check your connection or try again later.'; }
}
function showLocation() {
  if (!navigator.geolocation) return showDialog({ title: 'Location is unavailable', body: 'This browser/device does not expose the Geolocation API. Location was not accessed.', actions: [{ label: 'Close', primary: true }] });
  showDialog({ title: 'Share device location?', subtitle: 'Your permission is required', icon: '⌖', body: '<p>Code Academy will request a one-time location fix from your device. Your coordinates will be shown only in this dialog and will not be saved to browsing history.</p>', actions: [{ label: 'Cancel', primary: true }, { label: 'Allow location request', onClick: () => navigator.geolocation.getCurrentPosition(position => {
    showDialog({ title: 'Location received', subtitle: 'Device-reported coordinates', icon: '⌖', body: `<p><strong>Latitude:</strong> ${position.coords.latitude.toFixed(5)}<br><strong>Longitude:</strong> ${position.coords.longitude.toFixed(5)}<br><strong>Accuracy:</strong> about ${Math.round(position.coords.accuracy)} m</p><p>Your device may use GPS, Wi‑Fi, mobile network information, or a combination depending on settings. This page has no direct satellite control.</p><p><a target="_blank" rel="noopener noreferrer" href="https://www.openstreetmap.org/?mlat=${position.coords.latitude}&mlon=${position.coords.longitude}#map=15/${position.coords.latitude}/${position.coords.longitude}">View approximate point on OpenStreetMap ↗</a></p>`, actions: [{ label: 'Close', primary: true }] }); notifyLocal('Location request completed', 'Device location was requested by you.');
  }, error => { showDialog({ title: 'Location unavailable', body: escapeHTML(({ 1: 'Permission was denied. You can change site permissions in your browser settings.', 2: 'The device could not determine a location right now.', 3: 'The location request timed out.' })[error.code] || 'Location could not be retrieved.') , actions: [{ label: 'Close', primary: true }] }); }, { enableHighAccuracy: false, timeout: 12000, maximumAge: 60000 }) }] });
}
function showSafetyCheck() {
  const val = activeTab()?.url || $('#addressInput').value.trim(); if (!val) return toast('Enter or open a URL first.', 'warn');
  let url; try { url = normalizeURL(val); } catch (error) { return toast(error.message, 'error'); }
  const report = analyzeURL(url); lastRiskReport = report;
  showDialog({ title: 'Link safety review', subtitle: `${report.title} · ${hostname(url)}`, icon: report.level === 'high' ? '⚠' : '🛡', body: `<p><strong>Address:</strong> ${escapeHTML(url)}</p>${report.findings.length ? `<ul class="risk-list">${report.findings.map(x => `<li>${escapeHTML(x)}</li>`).join('')}</ul>` : '<p>No obvious local warning indicators were detected. This does not verify that the page is safe.</p>'}<p>For another view, open the official Google Safe Browsing site-status page. Do not enter sensitive information on a site you do not trust.</p>`, actions: [{ label: 'Close', primary: true }, { label: 'Open official status check', onClick: () => window.open(`https://transparencyreport.google.com/safe-browsing/search?url=${encodeURIComponent(url)}`, '_blank', 'noopener,noreferrer') }, { label: 'Continue to link', danger: true, onClick: () => { loadFrame(url, true); notifyLocal('Manual link check', `You chose to continue to ${hostname(url)} after the warning.`, 'risk'); } }] });
}
function startVoiceSearch() {
  if (!prefs.voice) return toast('Voice tools are disabled in settings.', 'warn');
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) return showDialog({ title: 'Voice search is unavailable', body: 'This browser does not expose speech recognition. You can still use the keyboard, or use your device keyboard’s microphone if it offers one.', actions: [{ label: 'Close', primary: true }] });
  try {
    voiceRecognition?.stop(); voiceRecognition = new Recognition(); voiceRecognition.lang = navigator.language || 'en-US'; voiceRecognition.interimResults = false; voiceRecognition.maxAlternatives = 1;
    toast('Listening… speak a search or web address.');
    voiceRecognition.onresult = event => { const text = event.results?.[0]?.[0]?.transcript || ''; if (text) { $('#addressInput').value = text; if ($('#startSearch')) $('#startSearch').value = text; navigateInput(text); } };
    voiceRecognition.onerror = event => toast(`Voice search: ${String(event.error || 'not available')}. You can type instead.`, 'warn');
    voiceRecognition.onend = () => { voiceRecognition = null; };
    voiceRecognition.start();
  } catch { toast('Voice recognition could not start. Type your search instead.', 'warn'); }
}
function readPageAloud() {
  if (!('speechSynthesis' in window)) return toast('Text-to-speech is not available in this browser.', 'warn');
  if (speechSynthesis.speaking) { speechSynthesis.cancel(); return toast('Read aloud stopped.'); }
  const text = activeTab()?.url ? `${activeTab().title}. Address: ${activeTab().url}. Note: Code Academy link checks are heuristic only.` : 'Code Academy Safe Browser. Search the web, scan a URL before opening it, and use the privacy and safety tools.';
  const utterance = new SpeechSynthesisUtterance(text); utterance.lang = navigator.language || 'en-US'; utterance.rate = 1; utterance.onerror = () => toast('The device speech engine could not complete read aloud.', 'warn'); speechSynthesis.speak(utterance);
}
function exitToPreviousPage() {
  let target = '';
  try {
    const supplied = new URLSearchParams(location.search).get('returnTo');
    if (supplied) { const u = new URL(supplied, location.href); if (u.origin === location.origin && u.href !== location.href) target = u.href; }
  } catch {}
  if (!target && document.referrer) { try { const ref = new URL(document.referrer); if (ref.origin === location.origin && ref.href !== location.href) target = ref.href; } catch {} }
  if (target) { location.href = target; return; }
  if (history.length > 1) { history.back(); return; }
  location.href = 'menu.html';
}
function currentLinkCopy() { const url = activeTab()?.url; if (!url) return toast('There is no page address to copy.'); if (navigator.clipboard?.writeText) navigator.clipboard.writeText(url).then(() => toast('Link copied.', 'success')).catch(() => fallbackCopy(url)); else fallbackCopy(url); }
function fallbackCopy(text) { const input = document.createElement('textarea'); input.value = text; input.style.position = 'fixed'; input.style.opacity = '0'; document.body.appendChild(input); input.select(); try { document.execCommand('copy'); toast('Link copied.', 'success'); } catch { toast(text); } input.remove(); }
function onFrameLoad() { /* External sites are deliberately opened top-level; this legacy frame remains about:blank. */ }
function shareCurrentPage() {
  const url = activeTab()?.url || location.href;
  const data = { title: 'Code Academy Safe Browser', text: activeTab()?.url ? `Open this page: ${url}` : 'Search the web with Code Academy Safe Browser.', url };
  if (navigator.share) {
    navigator.share(data).then(() => toast('Share sheet opened.', 'success')).catch(error => { if (error?.name !== 'AbortError') fallbackCopy(url); });
  } else fallbackCopy(url);
}
function renderTrendingStories(items, statusText = '') {
  const feed = $('#trendingFeed'); if (!feed) return;
  feed.replaceChildren();
  if (!items?.length) {
    const empty = document.createElement('div'); empty.className = 'feed-empty';
    empty.textContent = statusText || 'Current headlines are unavailable. Try Refresh or enter a search above.';
    feed.appendChild(empty); return;
  }
  items.forEach((story, index) => {
    const card = document.createElement('article'); card.className = 'trend-card';
    const line = document.createElement('div'); line.className = 'trend-card-top';
    const tag = document.createElement('span'); tag.className = 'trend-number'; tag.textContent = String(index + 1).padStart(2, '0');
    const points = document.createElement('span'); points.className = 'trend-points'; points.textContent = `${Number(story.score) || 0} points`;
    line.append(tag, points);
    const title = document.createElement('h3'); title.textContent = story.title || 'Untitled story';
    const meta = document.createElement('p'); meta.className = 'trend-meta';
    let host = 'news.ycombinator.com'; try { host = new URL(story.url || `https://news.ycombinator.com/item?id=${story.id}`).hostname.replace(/^www\./, ''); } catch {}
    meta.textContent = `${host} · ${new Date((Number(story.time) || Math.floor(Date.now()/1000)) * 1000).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}`;
    const actions = document.createElement('div'); actions.className = 'trend-actions';
    const open = document.createElement('button'); open.type = 'button'; open.className = 'trend-open'; open.textContent = 'Open story ↗';
    const targetURL = story.url || `https://news.ycombinator.com/item?id=${encodeURIComponent(story.id)}`;
    open.addEventListener('click', () => navigateInput(targetURL));
    const discussion = document.createElement('a'); discussion.href = `https://news.ycombinator.com/item?id=${encodeURIComponent(story.id)}`; discussion.target = '_blank'; discussion.rel = 'noopener noreferrer'; discussion.textContent = 'Discussion';
    actions.append(open, discussion); card.append(line, title, meta, actions); feed.appendChild(card);
  });
  const status = $('#trendingStatus'); if (status && statusText) status.textContent = statusText;
}
async function loadTrendingStories(force = false) {
  const status = $('#trendingStatus');
  const feed = $('#trendingFeed'); if (!feed) return;
  const cacheKey = 'ca_safe_browser_trending_v2';
  let cached = readStore(cacheKey, null);
  const ttl = prefs.dataSaver ? 15 * 60 * 1000 : 5 * 60 * 1000;
  if (!force && cached?.items?.length && Date.now() - cached.at < ttl) {
    renderTrendingStories(cached.items, `Updated ${new Date(cached.at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})} · cached to save mobile data`);
    return;
  }
  if (!navigator.onLine) {
    if (cached?.items?.length) renderTrendingStories(cached.items, 'Offline · showing recently cached headlines');
    else renderTrendingStories([], 'Your device reports that it is offline. Headlines will appear after connection returns.');
    return;
  }
  if (status) status.textContent = 'Fetching live top stories…';
  if (!cached?.items?.length) {
    feed.replaceChildren(); const loading = document.createElement('div'); loading.className = 'feed-empty'; loading.textContent = 'Loading live public headlines…'; feed.appendChild(loading);
  }
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 9000);
  try {
    const idsResponse = await fetch('https://hacker-news.firebaseio.com/v0/topstories.json', { signal: controller.signal, cache: 'no-store' });
    if (!idsResponse.ok) throw new Error(`Headline source returned HTTP ${idsResponse.status}.`);
    const ids = await idsResponse.json();
    const limit = prefs.dataSaver ? 6 : 8;
    const rows = await Promise.all((Array.isArray(ids) ? ids.slice(0, limit) : []).map(async id => {
      const response = await fetch(`https://hacker-news.firebaseio.com/v0/item/${encodeURIComponent(id)}.json`, { signal: controller.signal, cache: 'no-store' });
      if (!response.ok) return null;
      const story = await response.json();
      return story && story.type === 'story' && story.title ? { id: story.id, title: story.title, url: story.url || '', score: story.score || 0, time: story.time || 0 } : null;
    }));
    const items = rows.filter(Boolean);
    if (!items.length) throw new Error('The headline source returned no stories.');
    cached = { at: Date.now(), items }; writeStore(cacheKey, cached);
    renderTrendingStories(items, `Live top stories · refreshed ${new Date(cached.at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})} · Source: Hacker News`);
  } catch (error) {
    if (cached?.items?.length) renderTrendingStories(cached.items, `Live refresh failed (${error?.name === 'AbortError' ? 'request timed out' : 'source unavailable'}) · showing cached headlines`);
    else renderTrendingStories([], `Live headlines could not load: ${error?.name === 'AbortError' ? 'the request timed out' : (error?.message || 'the source did not respond')}. Search still works when the network is available.`);
    console.info('Live technology feed unavailable:', error?.message || error);
  } finally { clearTimeout(timer); }
}
function showConnectionStatus() {
  const state = navigator.onLine ? 'The browser currently reports that the device is online.' : 'The browser currently reports that the device is offline.';
  showDialog({ title: 'Connection status', subtitle: 'Device network signal', icon: '⌁', body: `<p>${escapeHTML(state)}</p><p>This is only the browser’s online/offline signal, not a test of every website. A specific website may still fail because of DNS, TLS certificates, its own outage, a login requirement, a network filter or browser policy.</p><p>Try a lightweight live check using the headline refresh control. For errors shown after a page opens externally, use the device browser’s exact error text.</p>`, actions: [{ label: 'Refresh tech feed', primary: true, onClick: () => { hideDialog(); void loadTrendingStories(true); } }, { label: 'Close' }] });
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('./safe-browser-sw.js').catch(error => console.info('Offline shell registration unavailable:', error?.message || error));
}
function setInitialTabs() {
  const saved = readStore(KEYS.tabs, []);
  if (prefs.restoreTabs && Array.isArray(saved) && saved.length) {
    browserTabs = saved.filter(tab => tab && typeof tab.id === 'string').slice(0, 12).map(t => ({ ...t, visits: Array.isArray(t.visits) ? t.visits : [], cursor: Number.isInteger(t.cursor) ? t.cursor : -1 }));
  }
  if (!browserTabs.length) browserTabs = [makeTab()];
  activeTabId = browserTabs[0].id; renderTabs();
}
function bindUI() {
  const on = (selector, event, handler, root = document) => { const node = $(selector, root); if (node) node.addEventListener(event, handler); };
  on('#exitBrowser', 'click', exitToPreviousPage);
  on('#addressForm', 'submit', event => { event.preventDefault(); navigateInput($('#addressInput').value); });
  on('#startSearchForm', 'submit', event => { event.preventDefault(); if ($('#startSearch')?.value) navigateInput($('#startSearch').value); });
  const provider = $('#searchProvider'); if (provider) { provider.value = prefs.provider; provider.addEventListener('change', event => { prefs.provider = event.target.value; persistPrefs(); }); }
  on('#scanAddress', 'click', () => { const value = $('#addressInput').value.trim(); if (!value) return toast('Enter a URL to scan.', 'warn'); try { const url = isLikelyURL(value) ? normalizeURL(value) : searchURL(value); lastRiskReport = analyzeURL(url); showSafetyDialog(lastRiskReport, url, true); } catch (error) { toast(error.message, 'error'); } });
  on('#newTab', 'click', () => newTab()); on('#openTabs', 'click', showTabsPanel); on('#openSettings', 'click', settingsPanel);
  on('#goBack', 'click', () => { const tab = activeTab(); if (!tab || tab.cursor <= 0) return toast('No previous destination in this Code Academy tab.'); tab.cursor -= 1; const visit = tab.visits[tab.cursor]; tab.url = visit.url; tab.title = visit.title; persistTabs(); renderTabs(); loadFrame(tab.url, false); });
  on('#goForward', 'click', () => { const tab = activeTab(); if (!tab || tab.cursor >= tab.visits.length - 1) return toast('No next destination in this Code Academy tab.'); tab.cursor += 1; const visit = tab.visits[tab.cursor]; tab.url = visit.url; tab.title = visit.title; persistTabs(); renderTabs(); loadFrame(tab.url, false); });
  on('#reloadPage', 'click', () => { const tab = activeTab(); if (!tab?.url) { void loadTrendingStories(true); return; } loadFrame(tab.url, false); });
  on('#bookmarkCurrent', 'click', saveBookmark); on('#openExternal', 'click', () => { const url = activeTab()?.url; if (!url) return toast('Open a destination first.', 'warn'); launchExternalTab(url, { force: true }); });
  on('#showHistory', 'click', showHistoryPanel); on('#showBookmarks', 'click', showBookmarksPanel); on('#showGroups', 'click', showTabsPanel); on('#readPage', 'click', readPageAloud);
  on('#voiceSearch', 'click', startVoiceSearch); on('#startVoice', 'click', startVoiceSearch);
  $$('.shortcut').forEach(button => button.addEventListener('click', () => { const url = button.dataset.url; if (url) navigateInput(url); }));
  // #fallbackOpen gets a URL-specific handler when the external status card is rendered.
  on('#frameFallbackBtn', 'click', () => { const fallback = $('#frameFallback'); if (fallback) fallback.hidden = !fallback.hidden; });
  on('#checkCurrentSafety', 'click', showSafetyCheck); on('#quickSafeCheck', 'click', () => { $('#addressInput').focus(); toast('Paste or type the link, then tap Scan before opening it.'); });
  on('#copyCurrentUrl', 'click', currentLinkCopy); on('#quickIp', 'click', showPublicIP); on('#quickLocation', 'click', showLocation);
  on('#defaultBrowserHelp', 'click', showDefaultGuide); on('#expandFrame', 'click', () => toast('Websites open as normal top-level pages; there is no restricted embedded view to expand.'));
  on('#refreshTrending', 'click', () => void loadTrendingStories(true));
  on('#closePanel', 'click', closePanel); on('#panelShade', 'click', closePanel); on('#dialogClose', 'click', hideDialog); on('#dialogShade', 'click', event => { if (event.target === $('#dialogShade')) hideDialog(); });
  on('#webFrame', 'load', onFrameLoad);
  window.addEventListener('online', () => { toast('Internet connection is available again.', 'success'); void loadTrendingStories(true); });
  window.addEventListener('offline', () => { toast('Device reports no internet connection.', 'error'); });
  window.addEventListener('keydown', event => { if (event.key === 'Escape') { hideDialog(); closePanel(); } if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'l') { event.preventDefault(); $('#addressInput').focus(); $('#addressInput').select(); } if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 't') { event.preventDefault(); newTab(); } });
}
window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); installPrompt = event; });
window.addEventListener('appinstalled', () => toast('Code Academy Safe Browser was installed as a web app. It is not automatically the system default browser.', 'success'));
applyTheme(); applyDeviceMode(); document.body.classList.toggle('data-saver', !!prefs.dataSaver); setInitialTabs(); bindUI(); initAccountSync(); registerServiceWorker();
if (prefs.restoreTabs && activeTab()?.url) showExternalStatus(activeTab().url, 'A saved tab was restored from local storage. Tap Open website in browser tab to revisit it.', 'Saved tab restored');
else showStartPage();
void loadTrendingStories(false);
// Start directly on the search-focused home screen; onboarding remains available in Settings. 
