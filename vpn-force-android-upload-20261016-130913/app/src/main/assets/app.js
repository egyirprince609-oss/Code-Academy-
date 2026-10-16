(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const native = window.Native || null;
  let refreshTimer = null;
  let lastState = 'disconnected';
  let toastTimer = null;

  function toast(message) {
    const region = $('toastRegion');
    if (!region) return;
    region.innerHTML = '';
    const node = document.createElement('div');
    node.className = 'toast';
    node.textContent = message;
    region.appendChild(node);
    region.classList.add('show');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => region.classList.remove('show'), 3400);
  }
  function safeNative(method, fallback) {
    try { return native && typeof native[method] === 'function' ? native[method]() : fallback; }
    catch (_) { return fallback; }
  }
  function readState() {
    if (!native) return { state: 'unavailable', hasConfig: false, notifications: false };
    try { return JSON.parse(native.getStatus()); }
    catch (_) { return { state: 'disconnected', hasConfig: false, notifications: false }; }
  }
  function readNetwork() {
    if (!native) return { type: 'APK required', validated: false, internet: false };
    try { return JSON.parse(native.getNetworkInfo()); }
    catch (_) { return { type: 'Unavailable', validated: false, internet: false }; }
  }
  function setText(id, value) { const n = $(id); if (n) n.textContent = value; }

  function renderStatus() {
    const status = readState();
    const network = readNetwork();
    const connected = status.state === 'connected';
    const connecting = status.state === 'connecting';
    const unavailable = status.state === 'unavailable';
    lastState = status.state;

    $('livePill')?.classList.toggle('connected', connected);
    setText('livePillText', connected ? 'TUNNEL ACTIVE' : connecting ? 'CONNECTING' : unavailable ? 'NATIVE APK REQUIRED' : 'NOT CONNECTED');
    document.querySelector('.hero-panel')?.classList.toggle('connected', connected);
    $('connectButton')?.classList.toggle('connected', connected);
    setText('connectButtonIcon', connected ? '⏻' : connecting ? '◌' : '⏻');
    setText('connectButtonText', connected ? 'Disconnect VPN' : connecting ? 'Connecting…' : 'Connect VPN');
    if ($('connectButton')) $('connectButton').disabled = connecting;
    setText('heroTitle', connected ? 'Your secure route\nis active.' : 'A clearer path\nto your network.');
    setText('heroSubtitle', connected ? 'The WireGuard tunnel is active. Server reachability still depends on the profile and remote server.' : 'A VPN changes how traffic is routed. Actual speed depends on the Wi‑Fi or mobile network and the VPN server.');
    setText('heroStatusIcon', connected ? '✓' : '⛨');
    setText('heroStatusTitle', connected ? 'Tunnel is active' : connecting ? 'Starting tunnel' : 'Tunnel is off');
    setText('heroStatusText', connected ? 'Android has accepted the VPN session.' : connecting ? 'Waiting for the WireGuard engine.' : (status.lastError || (status.hasConfig ? 'VPN profile is ready to use.' : 'Import a WireGuard profile to begin.')));
    setText('orbitalState', connected ? 'ACTIVE' : connecting ? 'LINKING' : 'READY');
    setText('configStatus', status.hasConfig ? 'WireGuard profile imported' : 'No profile imported');
    setText('networkType', network.type || 'Unknown');
    setText('networkCaption', network.validated ? 'Internet validated by Android' : network.internet ? 'Network available; not validated' : 'No validated internet route detected');
    $('networkTrack')?.style.setProperty('width', network.validated ? '100%' : network.internet ? '62%' : '14%');
    setText('tunnelState', connected ? 'Active' : connecting ? 'Starting…' : 'Disconnected');
    setText('tunnelCaption', connected ? 'WireGuard interface is up' : (status.lastError || (status.hasConfig ? 'Ready when you connect' : 'A valid profile is required')));
    $('tunnelDot')?.classList.toggle('on', connected);
    $('tunnelDot')?.classList.toggle('off', !connected);
    setText('tunnelFoot', connected ? 'System VPN active' : 'Waiting for setup');
    setText('notificationState', status.notifications ? 'Enabled' : 'Not enabled');
    setText('notificationCaption', status.notifications ? 'System notifications allowed' : 'Allow in Android settings');
    setText('settingsProfileStatus', status.hasConfig ? 'Configuration saved in private app storage' : 'No profile imported yet');
    setText('settingsConfig', status.hasConfig ? 'Imported' : 'Not configured');
    setText('settingsNetwork', network.type || 'Unknown');
    setText('settingsInternet', network.validated ? 'Validated' : network.internet ? 'Available' : 'Not validated');
    const notifToggle = $('notificationToggle');
    if (notifToggle) notifToggle.checked = !!status.notifications;
    const killSwitchToggle = $('strictRoutingToggle');
    if (killSwitchToggle) killSwitchToggle.checked = !!status.killSwitchEnabled;
    const autoToggle = $('autoConnectToggle');
    if (autoToggle && native && typeof native.getAutoConnect === 'function') autoToggle.checked = native.getAutoConnect();
  }

  function showPage(page) {
    document.querySelectorAll('.page-view').forEach((section) => section.classList.toggle('active', section.id === `page-${page}`));
    document.querySelectorAll('[data-page]').forEach((button) => button.classList.toggle('active', button.dataset.page === page));
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (page === 'settings' || page === 'home') renderStatus();
  }
  document.querySelectorAll('[data-page]').forEach((button) => button.addEventListener('click', () => showPage(button.dataset.page)));

  function openDisclosure() {
    $('consentModal').classList.add('open');
    $('consentModal').setAttribute('aria-hidden', 'false');
  }
  function closeDisclosure() {
    $('consentModal').classList.remove('open');
    $('consentModal').setAttribute('aria-hidden', 'true');
  }
  $('closeModal').addEventListener('click', closeDisclosure);
  $('cancelConnect').addEventListener('click', closeDisclosure);
  $('consentModal').addEventListener('click', (event) => { if (event.target === $('consentModal')) closeDisclosure(); });

  $('connectButton').addEventListener('click', () => {
    const status = readState();
    if (status.state === 'connected' || status.state === 'connecting') {
      if (native) { safeNative('disconnect', null); toast('Disconnect request sent to Android.'); window.setTimeout(renderStatus, 500); }
      else toast('Install the native Android APK to control the VPN.');
      return;
    }
    if (!native) { toast('VPN connections are available in the native Android APK.'); return; }
    openDisclosure();
  });
  $('confirmConnect').addEventListener('click', () => {
    closeDisclosure();
    if (!native) { toast('Native Android VPN support is unavailable in this preview.'); return; }
    safeNative('connect', null);
    toast('Connection request sent. Follow any Android permission prompts.');
    window.setTimeout(renderStatus, 700);
  });

  function importProfile() {
    if (!native) { toast('Import a profile inside the native Android app.'); return; }
    safeNative('importConfig', null);
  }
  $('importFromHome').addEventListener('click', importProfile);
  $('importSetting').addEventListener('click', importProfile);
  $('removeProfileButton').addEventListener('click', () => {
    if (!native) { toast('Profile management is available in the native Android app.'); return; }
    const status = readState();
    if (status.state === 'connected' || status.state === 'connecting') { toast('Disconnect the VPN before removing its profile.'); return; }
    if (typeof native.removeConfig === 'function') { native.removeConfig(); toast('Saved VPN profile removed from this device.'); window.setTimeout(renderStatus, 400); }
  });
  $('refreshButton').addEventListener('click', () => { renderStatus(); toast('Device network status refreshed.'); });
  $('settingsRefresh').addEventListener('click', () => { renderStatus(); toast('Diagnostics refreshed from Android.'); });

  function manageNotifications() {
    if (!native) { toast('Notification permission is managed by Android on the installed app.'); return; }
    const result = safeNative('requestNotifications', 'OPENED_SETTINGS');
    if (result === 'GRANTED') toast('Android notifications are enabled.');
    else if (result === 'REQUESTED') toast('Review the Android notification permission prompt.');
    else toast('Check Code Academy VPN Force under Android app notification settings.');
    window.setTimeout(renderStatus, 1000);
  }
  $('enableNotifications').addEventListener('click', manageNotifications);
  $('notificationToggle').addEventListener('change', (event) => {
    if (event.target.checked) manageNotifications();
    else {
      if (native) safeNative('openNotificationSettings', null);
      toast('Use Android system settings to turn VPN notifications off. An active VPN should remain visible to the system.');
    }
    window.setTimeout(renderStatus, 800);
  });
  $('autoConnectToggle').addEventListener('change', (event) => {
    const enabled = event.target.checked;
    try { localStorage.setItem('ca_vpn_auto_open', enabled ? 'true' : 'false'); } catch (_) {}
    if (native && typeof native.setAutoConnect === 'function') native.setAutoConnect(enabled);
    toast(enabled ? 'Reconnect on app open is enabled. A saved profile and prior Android approval are required.' : 'Reconnect on app open is disabled.');
  });
  $('strictRoutingToggle').addEventListener('change', (event) => {
    if (event.target.checked) {
      if (!readState().hasConfig) {
        toast('Import and test a valid WireGuard profile first. Android lockdown can block internet traffic if the VPN is unavailable.');
        event.target.checked = false;
        return;
      }
      if (native) safeNative('openVpnSettings', null);
      toast('In Android VPN settings, choose Code Academy VPN Force and enable Always-on VPN and Block connections without VPN. Android controls this switch; the app refreshes its status when you return.');
      // The next status refresh reads the actual Android lockdown state; the app cannot toggle it directly.
    }
  });

  function openAccount() {
    if (!native) { toast('Open the Code Academy website to sign in and view your profile.'); return; }
    safeNative('openAccount', null);
  }
  $('openAccount').addEventListener('click', openAccount);
  $('signInButton').addEventListener('click', openAccount);
  $('openProfileButton').addEventListener('click', openAccount);
  $('shareButton').addEventListener('click', () => {
    if (native) safeNative('shareApp', null);
    else toast('Code Academy VPN Force is a native Android VPN dashboard.');
  });
  $('accountShareButton').addEventListener('click', () => { if (native) safeNative('shareApp', null); else toast('Share Code Academy VPN Force with someone who needs VPN controls.'); });

  // A saved setting can request a reconnect when the dashboard opens, but only if
  // a configuration exists and Android VPN permission was already granted.
  if (native && typeof native.setAutoConnect === 'function') {
    let auto = false;
    try { auto = localStorage.getItem('ca_vpn_auto_open') === 'true'; } catch (_) {}
    native.setAutoConnect(auto);
  }
  renderStatus();
  refreshTimer = window.setInterval(renderStatus, 2800);
  window.addEventListener('ca-native-message', (event) => toast(String(event.detail || '')));
  window.addEventListener('ca-refresh', renderStatus);
  window.addEventListener('focus', renderStatus);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) renderStatus(); });
  window.addEventListener('beforeunload', () => { if (refreshTimer) window.clearInterval(refreshTimer); });
})();
