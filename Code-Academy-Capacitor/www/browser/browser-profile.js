import { auth, onAuthStateChanged, getBrowserProfile, uploadBrowserAvatar, signOutBrowser, errorText } from './browser-auth.js';
const $ = id => document.getElementById(id);
const storageKeys = { tabs:'ca_browser_tabs_v1', history:'ca_browser_history_v1', bookmarks:'ca_browser_bookmarks_v1', prefs:'ca_browser_preferences_v1' };
const message = value => { $('profileMessage').textContent = String(value || ''); };
function dateLabel(value) {
  if (!value) return 'Not available';
  try {
    const date = value.toDate ? value.toDate() : new Date(value);
    return Number.isNaN(date.getTime()) ? 'Not available' : new Intl.DateTimeFormat(undefined, { dateStyle:'medium', timeStyle:'short' }).format(date);
  } catch { return 'Not available'; }
}
function readCount(key) { try { const value = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(value) ? value.length : (value && typeof value === 'object' ? Object.keys(value).length : 0); } catch { return 'Unavailable'; } }
function refreshLocalData() {
  $('tabCount').textContent = readCount(storageKeys.tabs);
  $('historyCount').textContent = readCount(storageKeys.history);
  $('bookmarkCount').textContent = readCount(storageKeys.bookmarks);
  let pref = 'Not saved'; try { pref = localStorage.getItem(storageKeys.prefs) ? 'Saved on this device' : 'Not saved'; } catch { pref = 'Storage unavailable'; }
  $('preferenceCount').textContent = pref;
}
async function loadProfile(user) {
  $('profileName').textContent = user.displayName || user.email?.split('@')[0] || 'Browser user';
  $('profileEmail').textContent = user.email || user.phoneNumber || 'Email/phone not provided';
  $('profileProvider').textContent = `Sign-in method: ${user.providerData?.map(provider => provider.providerId).join(', ') || 'Firebase Authentication'}`;
  $('verificationState').textContent = user.email ? (user.emailVerified ? 'Verified' : 'Not verified') : 'Not applicable to phone sign-in';
  $('profilePhoto').src = user.photoURL || './browser-icon-192.png';
  $('profilePhoto').alt = `${user.displayName || 'Browser'} profile photo`;
  $('createdAt').textContent = 'Stored in browser profile';
  $('lastSignInAt').textContent = dateLabel(user.metadata?.lastSignInTime);
  try {
    const profile = await getBrowserProfile(user.uid);
    if (profile) {
      $('profileName').textContent = profile.displayName || user.displayName || 'Browser user';
      $('profileEmail').textContent = profile.email || user.email || user.phoneNumber || 'Email/phone not provided';
      $('profileProvider').textContent = `Sign-in method: ${profile.providerId || user.providerData?.[0]?.providerId || 'Firebase Authentication'}`;
      $('createdAt').textContent = dateLabel(profile.createdAt);
      $('lastSignInAt').textContent = dateLabel(profile.lastSignInAt || user.metadata?.lastSignInTime);
      if (profile.photoURL) $('profilePhoto').src = profile.photoURL;
      $('syncState').textContent = 'Browser profile reachable';
    } else $('syncState').textContent = 'Profile record not found';
  } catch (error) { $('syncState').textContent = 'Cloud sync unavailable'; message(`Cloud profile read failed: ${errorText(error)}\nLocal browser data is still available.`); }
  refreshLocalData();
}
$('avatarFile').addEventListener('change', async event => {
  const file = event.target.files?.[0]; if (!file) return; message('Uploading profile photo…');
  try { const url = await uploadBrowserAvatar(file); $('profilePhoto').src = url; message('Profile photo updated.'); }
  catch (error) { message(`Profile photo update failed: ${errorText(error)}`); }
  finally { event.target.value = ''; }
});
$('viewBookmarksButton').addEventListener('click', () => location.href = './browser-bookmarks.html');
$('clearLocalDataButton').addEventListener('click', () => {
  const keep = ['ca_browser_profile_hint_', 'ca_browser_orientation_complete_'];
  if (!confirm('Clear this device’s saved browser tabs, local history, bookmarks and browser preferences? This does not remove cloud records.')) return;
  try { for (const key of Object.keys(localStorage)) if (!keep.some(prefix => key.startsWith(prefix))) localStorage.removeItem(key); }
  catch (error) { message(`Could not clear all local data: ${errorText(error)}`); return; }
  refreshLocalData(); message('Local browser data cleared. Cloud-synced records were not deleted.');
});
$('switchAccountButton').addEventListener('click', async () => { try { await signOutBrowser(); location.replace('./login.html?stay=1'); } catch (error) { message(`Could not switch accounts: ${errorText(error)}`); } });
$('signOutButton').addEventListener('click', async () => { try { await signOutBrowser(); location.replace('./login.html'); } catch (error) { message(`Sign out failed: ${errorText(error)}`); } });
onAuthStateChanged(auth, user => { if (!user) location.replace('./login.html'); else loadProfile(user); }, error => message(`Authentication status failed: ${errorText(error)}`));

window.__codeAcademyPageReady = true;
