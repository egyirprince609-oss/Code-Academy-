import { auth, onAuthStateChanged, saveBrowserProfile, signOutBrowser, errorText } from './browser-auth.js';
const $ = id => document.getElementById(id);
let activeUser = null;
const tips = [
  [/clear.*history|delete.*data/i, 'Open the browser menu (⋮), choose History, and use Clear. The page also has a private-session setting in Settings. Clearing local history does not automatically delete cloud data unless sync rules and the delete action permit it.'],
  [/search engine|bing|ecos(i|y)a|brave/i, 'Open Settings and choose the Search engine section. Select a provider and save. The engine selector controls where the browser sends search queries; it does not change Android-wide browser settings.'],
  [/private|incognito/i, 'Choose New incognito tab from the browser menu. In this first release, private mode disables persistent tab/history saves for the browser session. It does not hide your activity from the network, websites, employer, or internet provider.'],
  [/site.*not open|iframe|blocked|website/i, 'Some websites block embedding using their own security headers. A webpage cannot override these controls. The native Android WebView wrapper can open a destination as a top-level native page; ordinary PWA viewing may be restricted by the destination.'],
  [/profile|account|switch/i, 'Tap the profile avatar in the browser header. From Browser Profile you can review your signed-in email, profile photo and browser data; Switch account signs you out and returns to the browser sign-in page.'],
  [/password|reset/i, 'Use the Forgot password link on the browser sign-in page. Firebase sends a reset message to your email. If the custom reset screen does not receive the action code, finish the process using Firebase’s hosted action page or set the Firebase email template URL to this folder’s reset-password.html.'],
  [/install|pwa|apk|android/i, 'For PWA installation, use the browser’s Install button from a supported HTTPS origin. To build the standalone Android package, follow browser/native-android/README.md (preferred for the top-level WebView) or browser/capacitor/README.md for the Capacitor shell scaffold. Installing a PWA is not the same as downloading a signed APK.'],
  [/camera|microphone|location|permission/i, 'Open Settings → Privacy & security → Site settings. Web pages can request supported permissions, but the operating system controls the final permission grant and a PWA cannot toggle every Android system permission directly.'],
  [/news|feed|headline/i, 'The home screen loads news when the device is online. If feeds fail, the browser shows the connection error rather than inventing current headlines. Try Refresh on the feed.'],
  [/save|sync|cloud/i, 'Browser data is stored locally first. Cloud synchronization uses the browserProfiles Firestore collection. If rules deny access, the exact sync error appears and the page continues using local data.']
];

let narrationQueue = [];
let narrationIndex = 0;
let narrationActive = false;
function tourStatus(text) { const target = $('tourError'); if (target) target.textContent = text; }
function stopTourNarration() {
  try { if ('speechSynthesis' in window) window.speechSynthesis.cancel(); }
  catch (error) { console.warn('[Code Academy Browser Tour] Could not stop speech:', error); }
  narrationQueue = []; narrationIndex = 0; narrationActive = false;
  const button = $('readTourButton'); if (button) { button.disabled = false; button.textContent = '▶ Read tour aloud'; }
  tourStatus('Voice narration stopped.');
}
function readTourAloud() {
  if (!('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') {
    tourStatus('Voice narration is not available in this browser/WebView. Check that Android Text-to-Speech is installed and enabled, or use the written tour.');
    return;
  }
  stopTourNarration();
  const chunks = Array.from(document.querySelectorAll('.tour-head h1,.tour-head p,.tour-card b,.tour-card p'))
    .map(node => (node.textContent || '').trim()).filter(Boolean);
  if (!chunks.length) { tourStatus('No tour text was available for narration.'); return; }
  narrationQueue = chunks;
  narrationIndex = 0;
  narrationActive = true;
  const button = $('readTourButton'); if (button) { button.disabled = true; button.textContent = 'Speaking…'; }
  let voices = [];
  try { voices = window.speechSynthesis.getVoices() || []; } catch {}
  const voice = voices.find(item => /^en(-|_)/i.test(item.lang) && /natural|enhanced|google|microsoft|english/i.test(item.name))
    || voices.find(item => /^en(-|_)/i.test(item.lang)) || null;
  tourStatus(voice ? `Reading the tour aloud using ${voice.name}.` : 'Reading the tour aloud using the default system voice.');
  const speakNext = () => {
    if (!narrationActive || narrationIndex >= narrationQueue.length) {
      narrationActive = false;
      if (button) { button.disabled = false; button.textContent = '▶ Read tour aloud'; }
      tourStatus('Tour narration is complete.');
      return;
    }
    const text = narrationQueue[narrationIndex++];
    const utterance = new SpeechSynthesisUtterance(text);
    if (voice) utterance.voice = voice;
    utterance.lang = voice?.lang || 'en-US'; utterance.rate = 0.94; utterance.pitch = 1; utterance.volume = 1;
    utterance.onend = () => window.setTimeout(speakNext, 120);
    utterance.onerror = event => {
      narrationActive = false;
      if (button) { button.disabled = false; button.textContent = '▶ Read tour aloud'; }
      tourStatus(`Speech synthesis failed: ${event.error || 'the device text-to-speech service returned an unspecified error'}. Check Android Text-to-Speech settings, then retry.`);
    };
    try { window.speechSynthesis.speak(utterance); }
    catch (error) { narrationActive = false; if (button) { button.disabled = false; button.textContent = '▶ Read tour aloud'; } tourStatus(`Speech synthesis failed: ${error && error.message ? error.message : String(error)}.`); }
  };
  // User-initiated speech is required by mobile browsers. Re-check voices once they become available.
  if (!voices.length) {
    let started = false;
    const startOnce = () => { if (started || !narrationActive) return; started = true; try { window.speechSynthesis.removeEventListener?.('voiceschanged', startOnce); } catch {} speakNext(); };
    try { window.speechSynthesis.addEventListener?.('voiceschanged', startOnce, { once:true }); } catch {}
    window.setTimeout(startOnce, 700);
  } else speakNext();
}
$('readTourButton')?.addEventListener('click', readTourAloud);
$('stopTourVoiceButton')?.addEventListener('click', stopTourNarration);
window.addEventListener('pagehide', () => { try { window.speechSynthesis?.cancel(); } catch {} });

function answerGuide() {
  const q = $('guideQuestion').value.trim();
  if (!q) { $('guideAnswer').textContent = 'Type a question first.'; return; }
  const match = tips.find(([pattern]) => pattern.test(q));
  $('guideAnswer').textContent = match ? match[1] : 'I could not match that question to the built-in browser help. Try asking about search, history, private tabs, profile, password reset, installation, permissions, news or cloud sync.';
  if (match) tourStatus('The built-in guide answered from the on-device help library. For live AI answers, configure a trusted AI endpoint in a backend; this tour does not send your question to an outside service.');
}
async function finishTour() {
  $('finishTourButton').disabled = true; $('skipTourButton').disabled = true;
  try {
    if (!activeUser) throw new Error('No authenticated browser account was found. Please sign in again.');
    let localSaved = false;
    try { localStorage.setItem(`ca_browser_orientation_complete_${activeUser.uid}`, '1'); localSaved = true; }
    catch (storageError) { console.warn('[Code Academy Browser] Could not save device-local orientation state:', errorText(storageError)); }
    try { await saveBrowserProfile({ orientationComplete: true, orientationCompletedAt: new Date().toISOString() }); }
    catch (cloudError) {
      $('tourError').textContent = `The tour is complete, but cloud sync failed: ${errorText(cloudError)}\n${localSaved ? 'This device has saved completion locally.' : 'The device could not save completion, so the tour may appear again.'}`;
      if (!localSaved) { $('finishTourButton').disabled = false; $('skipTourButton').disabled = false; return; }
      await new Promise(resolve => setTimeout(resolve, 700));
    }
    location.replace('./browser.html');
  } catch (error) {
    $('tourError').textContent = `Could not finish orientation: ${errorText(error)}\nCheck the sign-in state, then retry.`;
    $('finishTourButton').disabled = false; $('skipTourButton').disabled = false;
  }
}
$('askGuideButton').addEventListener('click', answerGuide);
$('guideQuestion').addEventListener('keydown', event => { if (event.key === 'Enter') answerGuide(); });
$('finishTourButton').addEventListener('click', finishTour);
$('skipTourButton').addEventListener('click', finishTour);
$('finishTourButton').addEventListener('click', stopTourNarration);
$('skipTourButton').addEventListener('click', stopTourNarration);
$('signOutTourButton').addEventListener('click', async () => { try { await signOutBrowser(); location.replace('./login.html'); } catch (error) { $('tourError').textContent = `Sign out failed: ${errorText(error)}`; } });
onAuthStateChanged(auth, user => { activeUser = user || null; if (!activeUser) location.replace('./login.html?next=index.html'); }, error => { $('tourError').textContent = `Authentication check failed: ${errorText(error)}`; });

window.__codeAcademyPageReady = true;
