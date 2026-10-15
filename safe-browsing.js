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
  clearTimeout(frameFallbackTimer); $('#startPage').hidden = false; $('#frameShell').hidden = true; $('#webFrame').src = 'about:blank';
  $('#securityMark').textContent = '⌕'; $('#addressInput').value = ''; lastRiskReport = null;
}
function loadFrame(url, addVisit = true, skipWarning = false) {
  clearTimeout(frameFallbackTimer); clearBanner();
  const tab = activeTab(); if (!tab) return;
  let normalized;
  try { normalized = normalizeURL(url); } catch (error) { toast(error.message, 'error'); return; }
  lastRiskReport = analyzeURL(normalized);
  $('#startPage').hidden = true; $('#frameShell').hidden = false; $('#frameFallback').hidden = true;
  $('#addressInput').value = normalized; $('#currentPageLabel').textContent = hostname(normalized);
  $('#currentDomain').textContent = normalized; $('#securityMark').textContent = new URL(normalized).protocol === 'https:' ? '🔒' : '⚠';
  const status = $('#frameSafetyLabel'); status.className = `safety-pill ${lastRiskReport.level === 'no-obvious-flags' ? 'safe' : lastRiskReport.level === 'caution' ? 'caution' : 'risk'}`;
  status.textContent = lastRiskReport.level === 'no-obvious-flags' ? 'No obvious local flags' : lastRiskReport.level === 'caution' ? 'Review recommended' : 'Potential risk';
  if (addVisit) recordTabVisit(tab, normalized, hostname(normalized)); else { tab.url = normalized; tab.title = hostname(normalized); renderTabs(); }
  $('#webFrame').setAttribute('loading', prefs.dataSaver ? 'lazy' : 'eager');
  $('#webFrame').src = normalized;
  if (!skipWarning && lastRiskReport.level !== 'no-obvious-flags' && prefs.warnRisky) showSafetyDialog(lastRiskReport, normalized, false);
  else if (!skipWarning && new URL(normalized).protocol !== 'https:' && prefs.confirmInsecure) showSafetyDialog(lastRiskReport, normalized, false);
  else if (lastRiskReport.findings.length) showBanner('A local link check found items to review. This is not a definitive malware scan.', 'warn');
}
function navigateInput(value) {
  const text = String(value || '').trim(); if (!text) { toast('Enter a search or web address.', 'warn'); return; }
  if (!isLikelyURL(text)) { const url = searchURL(text); lastRiskReport = analyzeURL(url); loadFrame(url); notifyLocal('Search opened', `Searched for: ${text.slice(0, 120)}`); return; }
  try { const url = normalizeURL(text); const report = analyzeURL(url); lastRiskReport = report; if (report.findings.length && prefs.warnRisky) showSafetyDialog(report, url, true); else loadFrame(url); }
  catch (error) { toast(error.message, 'error'); }
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
    { label: 'Open in device browser', onClick: () => { window.open(url, '_blank', 'noopener,noreferrer'); notifyLocal('Link opened externally', `Opened ${hostname(url)} in the device browser.`, 'risk'); } },
    { label: 'Continue in this view', danger: true, onClick: () => { loadFrame(url, true, true); } }
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
    bindCheck('prefDataSaver', 'dataSaver', () => { document.body.classList.toggle('data-saver', !!prefs.dataSaver); $('#webFrame').setAttribute('loading', prefs.dataSaver ? 'lazy' : 'eager'); toast('Data Saver preference saved. External sites control their own network use.'); });
    bindCheck('prefSafeSearch', 'safeSearch', () => toast('Safe Search preference saved for supported providers.'));
    bindCheck('prefWarnRisky', 'warnRisky'); bindCheck('prefInsecure', 'confirmInsecure'); bindCheck('prefVoice', 'voice');
    bindCheck('prefNotifications', 'notifications', async enabled => { if (!enabled) return; if (!('Notification' in window)) { prefs.notifications = false; persistPrefs(); return toast('This browser does not support web notifications.', 'warn'); } const result = await Notification.requestPermission(); prefs.notifications = result === 'granted'; persistPrefs(); $$('#prefNotifications', parent).forEach(el => el.checked = prefs.notifications); toast(prefs.notifications ? 'Browser notifications enabled.' : 'Notification permission was not granted.', prefs.notifications ? 'success' : 'warn'); });
    $('#prefRestore', parent).checked = !!prefs.restoreTabs; $('#prefRestore', parent).addEventListener('change', e => { prefs.restoreTabs = e.target.checked; persistPrefs(); });
    $('#dnsGuideButton', parent).addEventListener('click', showDNSGuide); $('#defaultGuideButton', parent).addEventListener('click', showDefaultGuide);
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
    voiceRecognition.onresult = event => { const text = event.results?.[0]?.[0]?.transcript || ''; if (text) { $('#addressInput').value = text; $('#startSearch').value = text; navigateInput(text); } };
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
function onFrameLoad() {
  if ($('#frameShell').hidden) return;
  const frame = $('#webFrame'); if (!frame.src || frame.src === 'about:blank') return;
  $('#frameFallback').hidden = true;
  try { const frameURL = new URL(frame.src); $('#currentDomain').textContent = frameURL.origin; }
  catch { $('#currentDomain').textContent = 'Web content'; }
  // Reading title or scanning anchors of a cross-origin frame is restricted by the same-origin policy.
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
  $('#exitBrowser').addEventListener('click', exitToPreviousPage);
  $('#addressForm').addEventListener('submit', event => { event.preventDefault(); navigateInput($('#addressInput').value); });
  $('#startSearchForm').addEventListener('submit', event => { event.preventDefault(); navigateInput($('#startSearch').value); });
  $('#searchProvider').value = prefs.provider; $('#searchProvider').addEventListener('change', event => { prefs.provider = event.target.value; persistPrefs(); });
  $('#scanAddress').addEventListener('click', () => { const value = $('#addressInput').value.trim(); if (!value) return toast('Enter a URL to scan.', 'warn'); try { const url = normalizeURL(value); const report = analyzeURL(url); lastRiskReport = report; showSafetyDialog(report, url, true); } catch (error) { toast(error.message, 'error'); } });
  $('#newTab').addEventListener('click', () => newTab()); $('#openTabs').addEventListener('click', showTabsPanel); $('#openSettings').addEventListener('click', settingsPanel);
  $('#goBack').addEventListener('click', () => { const tab = activeTab(); if (!tab || tab.cursor <= 0) return toast('No previous page in this tab.'); tab.cursor -= 1; const visit = tab.visits[tab.cursor]; tab.url = visit.url; tab.title = visit.title; persistTabs(); renderTabs(); loadFrame(tab.url, false); });
  $('#goForward').addEventListener('click', () => { const tab = activeTab(); if (!tab || tab.cursor >= tab.visits.length - 1) return toast('No forward page in this tab.'); tab.cursor += 1; const visit = tab.visits[tab.cursor]; tab.url = visit.url; tab.title = visit.title; persistTabs(); renderTabs(); loadFrame(tab.url, false); });
  $('#reloadPage').addEventListener('click', () => { const tab = activeTab(); if (!tab?.url) return toast('Open a page first.'); loadFrame(tab.url, false); });
  $('#bookmarkCurrent').addEventListener('click', saveBookmark); $('#openExternal').addEventListener('click', () => { const url = activeTab()?.url; if (!url) return toast('Open a page first.'); window.open(url, '_blank', 'noopener,noreferrer'); notifyLocal('Page opened in device browser', hostname(url)); });
  $('#showHistory').addEventListener('click', showHistoryPanel); $('#showBookmarks').addEventListener('click', showBookmarksPanel); $('#showGroups').addEventListener('click', showTabsPanel); $('#readPage').addEventListener('click', readPageAloud);
  $('#voiceSearch').addEventListener('click', startVoiceSearch); $('#startVoice').addEventListener('click', startVoiceSearch);
  $$('.shortcut').forEach(button => button.addEventListener('click', () => { const url = button.dataset.url; if (url) navigateInput(url); }));
  $('#fallbackOpen').addEventListener('click', () => { const url = activeTab()?.url; if (url) { window.open(url, '_blank', 'noopener,noreferrer'); notifyLocal('Site opened externally', `${hostname(url)} may block embedded browsing.`); } });
  $('#frameFallbackBtn').addEventListener('click', () => { $('#frameFallback').hidden = !$('#frameFallback').hidden; });
  $('#checkCurrentSafety').addEventListener('click', showSafetyCheck); $('#quickSafeCheck').addEventListener('click', () => { $('#addressInput').focus(); toast('Paste or type the link, then tap Scan before opening it.'); });
  $('#copyCurrentUrl').addEventListener('click', currentLinkCopy); $('#quickIp').addEventListener('click', showPublicIP); $('#quickLocation').addEventListener('click', showLocation);
  $('#defaultBrowserHelp').addEventListener('click', showDefaultGuide); $('#expandFrame').addEventListener('click', () => $('#frameShell').classList.toggle('expanded'));
  $('#closePanel').addEventListener('click', closePanel); $('#panelShade').addEventListener('click', closePanel); $('#dialogClose').addEventListener('click', hideDialog); $('#dialogShade').addEventListener('click', event => { if (event.target === $('#dialogShade')) hideDialog(); });
  $('#webFrame').addEventListener('load', onFrameLoad);
  window.addEventListener('keydown', event => { if (event.key === 'Escape') { hideDialog(); closePanel(); } if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'l') { event.preventDefault(); $('#addressInput').focus(); $('#addressInput').select(); } if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 't') { event.preventDefault(); newTab(); } });
}
window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); installPrompt = event; });
window.addEventListener('appinstalled', () => toast('Code Academy Safe Browser was installed as a web app. It is not automatically the system default browser.', 'success'));
applyTheme(); applyDeviceMode(); document.body.classList.toggle('data-saver', !!prefs.dataSaver); setInitialTabs(); bindUI(); initAccountSync(); registerServiceWorker();
if (prefs.restoreTabs && activeTab()?.url) activateTab(activeTabId);
else showStartPage();
showWelcomeDialog();
