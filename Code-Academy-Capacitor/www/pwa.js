/* Code Academy PWA installer — one shared install prompt for the banner and menu button. */
(function () {
  'use strict';
  if (window.__codeAcademyPwaHelperLoaded) return;
  window.__codeAcademyPwaHelperLoaded = true;

  const base = new URL('./', location.href);
  const manifestUrl = new URL('manifest.json', base).href;
  const workerUrl = new URL('sw.js', base).href;
  const iconUrl = new URL('web-app-manifest-192x192.png', base).href;
  const INSTALLED_KEY = 'code_academy_pwa_installed';
  const DISMISSED_KEY = 'code_academy_pwa_dismissed_at';
  const DISMISS_TTL = 7 * 24 * 60 * 60 * 1000;
  let deferredPrompt = null;
  let hasPrompt = false;
  let card = null;

  if (!document.querySelector('link[rel="manifest"]')) {
    const link = document.createElement('link');
    link.rel = 'manifest';
    link.href = manifestUrl;
    document.head.appendChild(link);
  }

  if ('serviceWorker' in navigator && (window.isSecureContext || location.hostname === 'localhost')) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register(workerUrl, { scope: base.pathname })
        .catch(error => console.warn('[Code Academy] Service worker registration failed:', error));
    }, { once: true });
  }

  function isInstalled() {
    try {
      return window.matchMedia('(display-mode: standalone)').matches
        || window.navigator.standalone === true
        || localStorage.getItem(INSTALLED_KEY) === '1'
        || localStorage.getItem('codeAcademyInstalled_v1') === 'yes';
    } catch (_) {
      return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    }
  }

  function wasDismissedRecently() {
    try { return Date.now() - Number(localStorage.getItem(DISMISSED_KEY) || 0) < DISMISS_TTL; }
    catch (_) { return false; }
  }

  function markInstalled() {
    try {
      localStorage.setItem(INSTALLED_KEY, '1');
      localStorage.setItem('codeAcademyInstalled_v1', 'yes');
    } catch (_) {}
  }

  const css = `
    #pwa-install-container{position:fixed;left:50%;bottom:calc(14px + env(safe-area-inset-bottom));transform:translate(-50%,24px);width:min(470px,calc(100% - 24px));display:none;align-items:center;gap:13px;padding:15px;border-radius:20px;border:1px solid #3c5475;background:linear-gradient(145deg,#0a192f,#111b36 70%,#20183e);color:#f8fafc;box-shadow:0 24px 80px #0009;z-index:999999;font-family:system-ui,-apple-system,Segoe UI,sans-serif;opacity:0;transition:transform .24s ease,opacity .24s ease}
    #pwa-install-container.show{display:flex;transform:translate(-50%,0);opacity:1}
    #pwa-install-container img{width:54px;height:54px;flex:none;border-radius:14px;object-fit:contain;background:#fff;padding:3px}
    #pwa-install-container .pwa-copy{flex:1;min-width:0}
    #pwa-install-container h4{margin:0 0 4px;font-size:15px;line-height:1.3}
    #pwa-install-container p{margin:0;color:#bdcbe0;font-size:12px;line-height:1.45}
    #pwa-install-container .pwa-actions{display:flex;flex-direction:column;gap:6px;align-items:stretch}
    #pwa-install-btn{border:0;border-radius:11px;padding:10px 12px;color:white;background:linear-gradient(135deg,#0891b2,#4f46e5);font-weight:800;font-size:12px;white-space:nowrap;cursor:pointer}
    #pwa-close-btn{border:0;background:transparent;color:#9aaec9;font-size:11px;cursor:pointer;padding:3px}
    #pwa-install-container .pwa-help{display:none;color:#a6bad5;font-size:11px;margin-top:5px}
    @media(max-width:390px){#pwa-install-container{gap:9px;padding:12px}#pwa-install-container img{width:43px;height:43px}#pwa-install-container h4{font-size:13px}#pwa-install-btn{padding:9px;font-size:11px}}
    @media(prefers-reduced-motion:reduce){#pwa-install-container{transition:none}}
  `;

  function createCard() {
    if (card || document.getElementById('pwa-install-container')) {
      card = card || document.getElementById('pwa-install-container');
      return;
    }
    const style = document.createElement('style');
    style.id = 'pwa-install-style';
    style.textContent = css;
    document.head.appendChild(style);

    card = document.createElement('aside');
    card.id = 'pwa-install-container';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-label', 'Install Code Academy');
    card.setAttribute('aria-live', 'polite');
    card.innerHTML = `
      <img src="${iconUrl}" alt="Code Academy app icon">
      <div class="pwa-copy">
        <h4>Take Code Academy with you</h4>
        <p>Install your learning space for quick access to courses, coding tools and projects.</p>
        <p class="pwa-help" id="pwa-install-help">Open your browser menu and choose “Install app” or “Add to Home Screen”.</p>
      </div>
      <div class="pwa-actions">
        <button id="pwa-install-btn" type="button">Install app</button>
        <button id="pwa-close-btn" type="button">Not now</button>
      </div>`;
    document.body.appendChild(card);
    card.querySelector('#pwa-install-btn').addEventListener('click', () => window.codeAcademyRequestInstall());
    card.querySelector('#pwa-close-btn').addEventListener('click', () => {
      try { localStorage.setItem(DISMISSED_KEY, String(Date.now())); } catch (_) {}
      hideCard();
    });
  }

  function showCard(force = false) {
    if (isInstalled() || (!force && wasDismissedRecently())) return;
    createCard();
    if (!card) return;
    card.style.display = 'flex';
    requestAnimationFrame(() => card.classList.add('show'));
  }

  function hideCard() {
    if (!card) return;
    card.classList.remove('show');
    window.setTimeout(() => { if (card) card.style.display = 'none'; }, 260);
  }

  function showInstallInstructions() {
    createCard();
    if (!card) return;
    const help = card.querySelector('.pwa-help');
    const button = card.querySelector('#pwa-install-btn');
    if (help) {
      help.style.display = 'block';
      help.textContent = /iphone|ipad|ipod/i.test(navigator.userAgent)
        ? 'In Safari, tap Share and choose “Add to Home Screen”.'
        : 'Install availability depends on your browser. Open its menu and choose “Install app” or “Add to Home Screen”.';
    }
    if (button) button.textContent = 'Try install';
    showCard(true);
  }

  window.codeAcademyRequestInstall = async function () {
    if (isInstalled()) {
      hideCard();
      return { outcome: 'already-installed' };
    }
    if (deferredPrompt) {
      const prompt = deferredPrompt;
      deferredPrompt = null;
      try {
        await prompt.prompt();
        const choice = await prompt.userChoice;
        if (choice && choice.outcome === 'accepted') {
          markInstalled();
          hideCard();
        } else if (choice && choice.outcome === 'dismissed') {
          hideCard();
        }
        return choice || { outcome: 'unknown' };
      } catch (error) {
        console.warn('[Code Academy] Native install prompt failed:', error);
        showInstallInstructions();
        return { outcome: 'unavailable' };
      }
    }
    showInstallInstructions();
    return { outcome: 'instructions' };
  };

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredPrompt = event;
    hasPrompt = true;
    createCard();
    if (card) {
      const help = card.querySelector('.pwa-help');
      const button = card.querySelector('#pwa-install-btn');
      if (help) help.style.display = 'none';
      if (button) button.textContent = 'Install app';
    }
    showCard();
  });

  window.addEventListener('appinstalled', () => {
    markInstalled();
    deferredPrompt = null;
    hideCard();
  });

  // This is the single prompt event owner. Menu/settings buttons call the shared function above.
  window.setTimeout(() => {
    if (!hasPrompt && !isInstalled() && !wasDismissedRecently()) showInstallInstructions();
  }, 6500);
})();
