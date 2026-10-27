let auth, onAuthStateChanged, ensureBrowserProfile, getBrowserProfile, errorText;
const status = document.getElementById('launchStatus');
const actions = document.getElementById('launchActions');
let launching = false;
function showError(error, context) {
  const detail = typeof errorText === 'function' ? errorText(error) : (error instanceof Error ? `${error.name}: ${error.message}` : String(error));
  console.error(`[Code Academy Browser] ${context}: ${detail}`, error);
  status.textContent = `${context}: ${detail}`;
  actions.hidden = false;
}
async function launchForUser(user) {
  if (launching) return;
  launching = true; actions.hidden = true;
  if (!user) {
    status.textContent = 'Sign in or create a browser account to continue.';
    location.replace('./login.html?next=index.html');
    return;
  }
  if (user.email && !user.emailVerified && user.providerData?.some(provider => provider.providerId === 'password')) {
    location.replace(`./email-verification.html?email=${encodeURIComponent(user.email)}`);
    return;
  }
  try {
    status.textContent = 'Loading your browser profile and first-run setup…';
    const profileWrite = await ensureBrowserProfile(user);
    let profile = null;
    try { profile = await getBrowserProfile(user.uid); }
    catch (profileError) {
      console.warn('[Code Academy Browser] Cloud profile is unavailable; the device-local onboarding state will be used:', errorText(profileError));
      status.textContent = 'Cloud profile unavailable. Continuing with device-local browser setup.';
    }
    if (profileWrite?.error) console.warn('[Code Academy Browser] Browser profile write unavailable:', errorText(profileWrite.error));
    let localComplete = false;
    try { localComplete = localStorage.getItem(`ca_browser_orientation_complete_${user.uid}`) === '1'; } catch (storageError) { console.warn('[Code Academy Browser] Local onboarding state is unavailable:', errorText(storageError)); }
    const complete = Boolean(profile?.orientationComplete || localComplete);
    if (!complete) {
      status.textContent = 'Preparing your first-time browser tour…';
      location.replace('./onboarding.html');
      return;
    }
    status.textContent = 'Opening your browser workspace…';
    location.replace('./browser.html');
  } catch (error) {
    // Keep the exact error visible; don't silently send people to another page.
    showError(error, 'Browser startup could not finish');
    launching = false;
  }
}
async function start() {
  try {
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
      navigator.serviceWorker.register('./sw.js', { scope: new URL('./', location.href).pathname }).catch(error => console.warn('[Code Academy Browser] Offline shell registration failed:', error?.message || error));
    }
    const authentication = await import('./browser-auth.js');
    ({ auth, onAuthStateChanged, ensureBrowserProfile, getBrowserProfile, errorText } = authentication);
    await new Promise((resolve, reject) => {
      let stop = () => {};
      const safety = window.setTimeout(() => { stop(); reject(new Error('Timed out while waiting for Firebase Authentication. Check internet access and Firebase authorized domains.')); }, 15000);
      stop = onAuthStateChanged(auth, user => { window.clearTimeout(safety); stop(); resolve(user); launchForUser(user); }, error => { window.clearTimeout(safety); stop(); reject(error); });
    }).catch(error => { throw error; });
  } catch (error) { showError(error, 'Authentication service could not start'); }
}
document.getElementById('retryLaunch').addEventListener('click', () => { launching = false; status.textContent = 'Retrying…'; start(); });
start();

window.__codeAcademyPageReady = true;
