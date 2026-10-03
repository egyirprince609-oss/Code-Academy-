// pwa.js - ONE FILE installer for Code Academy
(function() {
  if (document.getElementById('pwa-install-container')) return;

  const css = `
    #pwa-install-container{position:fixed;bottom:20px;left:50%;transform:translateX(-50%) translateY(150px);width:92%;max-width:420px;background:#0a192f;color:#fff;border-radius:18px;padding:18px 20px;display:none;align-items:center;gap:15px;box-shadow:0 15px 40px rgba(0,0,0,.35);z-index:99999;transition:transform .5s ease;font-family:system-ui,sans-serif;border:1px solid rgba(255,255,255,.1)}
    #pwa-install-container.show{transform:translateX(-50%) translateY(0)}
    #pwa-install-container img{width:56px;height:56px;border-radius:14px;flex-shrink:0}
    .pwa-text{flex:1}.pwa-text h4{margin:0 0 4px;font-size:16px}.pwa-text p{margin:0;font-size:13px;opacity:.8}
    #pwa-install-btn{background:linear-gradient(135deg,#00c6ff,#0072ff);color:#fff;border:none;padding:10px 18px;border-radius:12px;font-weight:700;cursor:pointer;font-size:14px}
    #pwa-close-btn{background:transparent;color:rgba(255,255,255,.6);border:none;font-size:13px;cursor:pointer;margin-top:6px}
  `;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  const div = document.createElement('div');
  div.id = 'pwa-install-container';
  div.innerHTML = `
    <img src="/Code-Academy-/logo-192.png" alt="Code Academy">
    <div class="pwa-text"><h4>Install Code Academy</h4><p>Faster access, works offline like a real app.</p></div>
    <div style="text-align:center"><button id="pwa-install-btn">Install</button><br><button id="pwa-close-btn">Later</button></div>
  `;
  document.body.appendChild(div);

  let deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    const dismissed = localStorage.getItem('pwa-dismissed');
    if (!dismissed || Date.now() - parseInt(dismissed) > 7*24*60*60*1000) {
      div.style.display = 'flex';
      setTimeout(()=>div.classList.add('show'), 600);
    }
  });

  div.querySelector('#pwa-install-btn').addEventListener('click', async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt = null;
      div.classList.remove('show');
      setTimeout(()=>div.style.display='none', 500);
    }
  });

  div.querySelector('#pwa-close-btn').addEventListener('click', () => {
    div.classList.remove('show');
    setTimeout(()=>div.style.display='none', 500);
    localStorage.setItem('pwa-dismissed', Date.now().toString());
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/Code-Academy-/sw.js', { scope: '/Code-Academy-/' });
  }
})();