/* Browser adapter around Code Academy's existing authentication.js.
 * This deliberately reuses the same Firebase default app and core auth workflows,
 * rather than creating a second Code Academy Browser-only Firebase user system.
 */
import {
  auth, db, storage, onAuthStateChanged, doc, getDoc,
  signUp, logIn, signInWithGoogle as academySignInWithGoogle,
  completeGoogleRedirect, logOut, setAuthPersistence,
  createPhoneVerifier, sendPhoneVerificationCode,
  completePhoneVerification, getFirebaseErrorDetails
} from './authentication.js';
import { sendEmailVerification, sendPasswordResetEmail, verifyPasswordResetCode,
  confirmPasswordReset, signInWithRedirect, getRedirectResult, GoogleAuthProvider,
  reload, applyActionCode, updateProfile } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { ref, uploadBytes, getDownloadURL } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js';

export { auth, db, onAuthStateChanged, doc, getDoc, setDoc, serverTimestamp };
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export function errorText(error) {
  if (!error) return 'Unknown error';
  const code = String(error.code || '');
  const message = String(error.message || error);
  let explanation = '';
  try { explanation = getFirebaseErrorDetails(error).explanation || ''; } catch {}
  return `${error.name || 'Error'}${code ? ` [${code}]` : ''}: ${message}${explanation ? ` — ${explanation}` : ''}`;
}
function friendlyName(user) { return user?.displayName || user?.email?.split('@')[0] || 'Browser user'; }
function browserProfileDefaults(user, displayName = '') {
  return { uid:user.uid, displayName:displayName || friendlyName(user), email:user.email || '', phoneNumber:user.phoneNumber || '', photoURL:user.photoURL || '', providerId:user.providerData?.[0]?.providerId || 'password', emailVerified:Boolean(user.emailVerified), createdAt:serverTimestamp(), updatedAt:serverTimestamp(), lastSignInAt:serverTimestamp(), orientationComplete:false, accountType:'Code Academy Browser', schemaVersion:2 };
}
export async function ensureBrowserProfile(user, displayName = '') {
  if (!user?.uid) throw new Error('A signed-in Firebase user is required to create a browser profile.');
  const profileRef = doc(db, 'browserProfiles', user.uid);
  try {
    const snapshot = await getDoc(profileRef);
    if (!snapshot.exists()) await setDoc(profileRef, browserProfileDefaults(user, displayName));
    else await setDoc(profileRef, { displayName:displayName || user.displayName || snapshot.data().displayName || friendlyName(user), email:user.email || snapshot.data().email || '', phoneNumber:user.phoneNumber || snapshot.data().phoneNumber || '', photoURL:user.photoURL || snapshot.data().photoURL || '', providerId:user.providerData?.[0]?.providerId || snapshot.data().providerId || 'password', emailVerified:Boolean(user.emailVerified), updatedAt:serverTimestamp(), lastSignInAt:serverTimestamp() }, { merge:true });
    try { localStorage.setItem(`ca_browser_profile_hint_${user.uid}`, JSON.stringify({ email:user.email || '', displayName:user.displayName || displayName || '', providerId:user.providerData?.[0]?.providerId || 'password' })); } catch {}
    return { ok:true };
  } catch (error) {
    console.error('[Code Academy Browser] Browser profile cloud write failed:', error);
    try { localStorage.setItem('ca_browser_last_profile_sync_error', errorText(error)); } catch {}
    return { ok:false, error };
  }
}

export async function createBrowserAccount({ displayName, email, password }) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  const cleanName = String(displayName || '').trim();
  if (!cleanName) throw new Error('Enter your full name.');
  if (!/^\S+@\S+\.\S+$/.test(cleanEmail)) throw new Error('Enter a valid email address.');
  // The original Code Academy function applies the project's complete password policy and writes users/{uid}.
  const user = await signUp(cleanEmail, password, cleanName);
  const profile = await ensureBrowserProfile(user, cleanName);
  let verificationError = null;
  try {
    const actionUrl = new URL(`email-verification.html?email=${encodeURIComponent(cleanEmail)}`, new URL('./', location.href)).href;
    await sendEmailVerification(user, { url:actionUrl, handleCodeInApp:false });
  } catch (error) { verificationError = error; console.error('[Code Academy Browser] Verification email could not be sent:', error); }
  return { user, profileSyncError:profile.ok ? null : profile.error, verificationError };
}

export async function signInBrowserEmail(email, password, remember = true) {
  await setAuthPersistence(remember);
  const user = await logIn(String(email || '').trim().toLowerCase(), password);
  if (user.email && !user.emailVerified && user.providerData?.some(provider => provider.providerId === 'password')) {
    const error = new Error('Email address is not verified. Open the email verification page and use the verification link before continuing.');
    error.code = 'auth/email-not-verified';
    throw error;
  }
  const profile = await ensureBrowserProfile(user);
  return { user, profileSyncError:profile.ok ? null : profile.error };
}

export async function signInBrowserGoogle() {
  // Redirect is more reliable on mobile/installed PWAs than popups.
  await signInWithRedirect(auth, googleProvider);
  return { redirected:true };
}
export async function consumeGoogleRedirect() {
  const user = await completeGoogleRedirect();
  if (!user) return null;
  const profile = await ensureBrowserProfile(user);
  return { user, profileSyncError:profile.ok ? null : profile.error };
}

export async function requestBrowserPasswordReset(email) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(cleanEmail)) throw new Error('Enter a valid email address.');
  const continuation = new URL('reset-password.html', new URL('./', location.href)).href;
  await sendPasswordResetEmail(auth, cleanEmail, { url:continuation, handleCodeInApp:false });
  return true;
}
export async function checkPasswordResetCode(code) {
  if (!code) throw new Error('The password-reset link has no action code. Open the complete link from your email.');
  return verifyPasswordResetCode(auth, code);
}
export async function finishPasswordReset(code, password) {
  if (String(password || '').length < 8) throw new Error('Use a password with at least 8 characters.');
  await confirmPasswordReset(auth, code, password);
}
export async function signOutBrowser() { await logOut(); }
export async function getBrowserProfile(uid = auth.currentUser?.uid) {
  if (!uid) throw new Error('No browser account is signed in.');
  const snapshot = await getDoc(doc(db, 'browserProfiles', uid));
  return snapshot.exists() ? snapshot.data() : null;
}
export async function saveBrowserProfile(data) {
  if (!auth.currentUser) throw new Error('Sign in before saving browser profile settings.');
  await setDoc(doc(db, 'browserProfiles', auth.currentUser.uid), { ...data, updatedAt:serverTimestamp() }, { merge:true });
}
export async function uploadBrowserAvatar(file) {
  if (!auth.currentUser) throw new Error('Sign in before uploading a profile image.');
  if (!(file instanceof File)) throw new Error('Choose an image file.');
  if (!file.type.startsWith('image/')) throw new Error('The selected file is not an image.');
  if (file.size > 5 * 1024 * 1024) throw new Error('Profile images must be 5 MB or smaller.');
  const cleanName = file.name.replace(/[^a-z0-9._-]/gi, '_').slice(0,90) || 'avatar.jpg';
  const imageRef = ref(storage, `browserProfileImages/${auth.currentUser.uid}/${Date.now()}_${cleanName}`);
  await uploadBytes(imageRef, file, { contentType:file.type });
  const photoURL = await getDownloadURL(imageRef);
  await updateProfile(auth.currentUser, { photoURL });
  await saveBrowserProfile({ photoURL });
  return photoURL;
}

export async function resendBrowserVerificationEmail() {
  const user = auth.currentUser;
  if (!user) throw new Error('Sign in with your email and password before requesting a verification email.');
  if (!user.email) throw new Error('This account does not have an email address to verify.');
  if (user.emailVerified) return true;
  const continueUrl = new URL('email-verification.html', new URL('./', location.href)).href;
  await sendEmailVerification(user, { url:continueUrl, handleCodeInApp:false });
  return true;
}
export async function refreshBrowserVerificationStatus() {
  if (!auth.currentUser) throw new Error('No signed-in account is available to refresh verification status.');
  await reload(auth.currentUser);
  return auth.currentUser;
}
export async function applyBrowserVerificationCode(code) {
  if (!code) throw new Error('The verification link does not include the Firebase action code. Open the full link from your email.');
  await applyActionCode(auth, code);
  if (auth.currentUser) await reload(auth.currentUser);
  return true;
}
export async function sendBrowserPhoneCode(phoneNumber, containerId = 'recaptcha-container') {
  const verifier = createPhoneVerifier(containerId);
  return sendPhoneVerificationCode(phoneNumber, verifier);
}
export async function finishBrowserPhoneSignIn(confirmationResult, smsCode, displayName = '') {
  const user = await completePhoneVerification(confirmationResult, smsCode, displayName);
  const profile = await ensureBrowserProfile(user, displayName);
  return { user, profileSyncError:profile.ok ? null : profile.error };
}
export function clearPhoneVerifier() {
  const verifier = window.__codeAcademyPhoneVerifier;
  if (verifier && typeof verifier.clear === 'function') { try { verifier.clear(); } catch {} }
  window.__codeAcademyPhoneVerifier = null;
}
