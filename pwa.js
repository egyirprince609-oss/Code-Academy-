// pwa.js - ALL IN ONE - paste only once
(function() {
  // 1. Auto-add manifest and theme-color to head (so you don't paste it yourself)
  if (!document.querySelector('link[rel="manifest"]')) {
    const link = document.createElement('link');
    link.rel = 'manifest';
    link.href = '/Code-Academy-/manifest.json';
    document.head.appendChild(link);
  }
  if (!document.querySelector('meta[name="theme-color"]')) {
    const meta = document.createElement('meta');
    meta.name = 'theme-color';
    meta.content = '#0a192f';
    document.head.appendChild(meta);
  }

  // 2. CSS + HTML for install popup
  if (document.getElementById('pwa-install-container')) return;
  const css = `#pwa-install-container{position:fixed;bottom:20px;left:50%;transform:translateX(-50%) translateY(150px);width:92%;max-width:420px;background:#0a192f;color:#fff;border-radius:18px;padding:18px 20px;display:none;align-items:center;gap:15px;box-shadow:0 15px 40px rgba(0,0,0,.35);z-index:99999;transition:transform .5s ease;font-family:system-ui,sans-serif;border:1px solid rgba(255,255,255,.1)}#pwa-install-container.show{transform:translateX(-50%) translateY(0)}#pwa-install-container img{width:56px;height:56px;border-radius:14px}#pwa-install-btn{background:linear-gradient(135deg,#00c6ff,#0072ff);color:#fff;border:none;padding:10px 18px;border-radius:12px;font-weight:700;cursor:pointer}#pwa-close-btn{background:transparent;color:rgba(255,255,255,.6);border:none;font-size:13px;cursor:pointer;margin-top:6px}`;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  const div = document.createElement('div');
  div.id = 'pwa-install-container';
  div.innerHTML = `<img src="/Code-Academy-/logo-192.png" alt="Code Academy"><div style="flex:1"><h4 style="margin:0 0 4px;font-size:16px">Install Code Academy</h4><p style="margin:0;font-size:13px;opacity:.8">Faster access, works offline like a real app.</p></div><div style="text-align:center"><button id="pwa-install-btn">Install</button><br><button id="pwa-close-btn">Later</button></div>`;
  document.body.appendChild(div);

  let deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); deferredPrompt = e;
    const dismissed = localStorage.getItem('pwa-dismissed');
    if (!dismissed || Date.now() - parseInt(dismissed) > 7*24*60*60*1000) {
      div.style.display = 'flex'; setTimeout(()=>div.classList.add('show'), 600);
    }
  });
  div.querySelector('#pwa-install-btn').addEventListener('click', async () => {
    if (deferredPrompt) { deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt = null; div.classList.remove('show'); setTimeout(()=>div.style.display='none', 500); }
  });
  div.querySelector('#pwa-close-btn').addEventListener('click', () => {
    div.classList.remove('show'); setTimeout(()=>div.style.display='none', 500);
    localStorage.setItem('pwa-dismissed', Date.now().toString());
  });

  // 3. Register service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/Code-Academy-/sw.js', { scope: '/Code-Academy-/' });
  }
})();