/* Code Academy Browser-only UI authentication layer.
 * Uses the Firebase project already configured in Code Academy, but maintains
 * browser-specific profile and data documents in browserProfiles/{uid}.
 * The Firebase API key below is a public web-app identifier, not a server secret.
 */
import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import {
  getAuth, onAuthStateChanged as firebaseOnAuthStateChanged,
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  sendPasswordResetEmail, verifyPasswordResetCode, confirmPasswordReset,
  updateProfile, signOut, GoogleAuthProvider, signInWithPopup,
  signInWithRedirect, getRedirectResult, setPersistence, sendEmailVerification,
  browserLocalPersistence, browserSessionPersistence,
  RecaptchaVerifier, signInWithPhoneNumber, updateEmail, updatePassword
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import {
  getFirestore, doc, getDoc, setDoc, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import {
  getStorage, ref, uploadBytes, getDownloadURL
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js';

const firebaseConfig = {
  apiKey: 'AIzaSyC84eyA9-fxDiYFPBk3OXVH-AimkjVy9-s',
  authDomain: 'codeacademybywm.firebaseapp.com',
  databaseURL: 'https://codeacademybywm-default-rtdb.firebaseio.com',
  projectId: 'codeacademybywm',
  storageBucket: 'codeacademybywm.firebasestorage.app',
  messagingSenderId: '677581551464',
  appId: '1:677581551464:web:43d33c49806bf2099d48dd',
  measurementId: 'G-Y0LPZQS5B0'
};

const APP_NAME = 'CodeAcademyBrowser';
const app = getApps().find(item => item.name === APP_NAME) || initializeApp(firebaseConfig, APP_NAME);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const onAuthStateChanged = firebaseOnAuthStateChanged;
export { doc, getDoc, setDoc, serverTimestamp, signOut, updateEmail, updatePassword };

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export function errorText(error) {
  if (!error) return 'Unknown error';
  const code = error.code ? ` [${error.code}]` : '';
  const message = error.message || String(error);
  return `${error.name || 'Error'}${code}: ${message}`;
}

function friendlyName(user) {
  return user?.displayName || (user?.email ? user.email.split('@')[0] : '') || 'Browser user';
}
function browserProfileDefaults(user, displayName = '') {
  return {
    uid: user.uid,
    displayName: displayName || friendlyName(user),
    email: user.email || '',
    phoneNumber: user.phoneNumber || '',
    photoURL: user.photoURL || '',
    providerId: user.providerData?.[0]?.providerId || 'password',
    emailVerified: Boolean(user.emailVerified),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    lastSignInAt: serverTimestamp(),
    orientationComplete: false,
    accountType: 'Code Academy Browser',
    schemaVersion: 1
  };
}

export async function ensureBrowserProfile(user, displayName = '') {
  if (!user?.uid) throw new Error('A signed-in Firebase user is required to create a browser profile.');
  const profileRef = doc(db, 'browserProfiles', user.uid);
  try {
    const snapshot = await getDoc(profileRef);
    if (!snapshot.exists()) {
      await setDoc(profileRef, browserProfileDefaults(user, displayName));
    } else {
      await setDoc(profileRef, {
        displayName: displayName || user.displayName || snapshot.data().displayName || friendlyName(user),
        email: user.email || snapshot.data().email || '',
        phoneNumber: user.phoneNumber || snapshot.data().phoneNumber || '',
        photoURL: user.photoURL || snapshot.data().photoURL || '',
        providerId: user.providerData?.[0]?.providerId || snapshot.data().providerId || 'password',
        emailVerified: Boolean(user.emailVerified),
        updatedAt: serverTimestamp(),
        lastSignInAt: serverTimestamp()
      }, { merge: true });
    }
    try { localStorage.setItem(`ca_browser_profile_hint_${user.uid}`, JSON.stringify({ email: user.email || '', displayName: user.displayName || displayName || '', providerId: user.providerData?.[0]?.providerId || 'password' })); } catch {}
    return { ok: true };
  } catch (error) {
    console.error('[Code Academy Browser] Browser profile cloud write failed:', error);
    try { localStorage.setItem('ca_browser_last_profile_sync_error', errorText(error)); } catch {}
    // Authentication should not be misreported as failed after Firebase has signed the user in.
    return { ok: false, error };
  }
}

export async function createBrowserAccount({ displayName, email, password }) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  const cleanName = String(displayName || '').trim();
  if (!cleanName) throw new Error('Enter your full name.');
  if (!/^\S+@\S+\.\S+$/.test(cleanEmail)) throw new Error('Enter a valid email address.');
  if (String(password || '').length < 8) throw new Error('Use a password with at least 8 characters.');
  const credential = await createUserWithEmailAndPassword(auth, cleanEmail, password);
  if (cleanName) await updateProfile(credential.user, { displayName: cleanName });
  const profile = await ensureBrowserProfile(credential.user, cleanName);
  let verificationError = null;
  try {
    const actionUrl = new URL('login.html?verified=1', new URL('./', location.href)).href;
    // Verification uses login.html as the post-action continuation. Configure Firebase's email action handler separately if you want the custom reset-password.html form to receive oobCode directly.
    await sendEmailVerification(credential.user, { url: actionUrl });
  } catch (error) {
    verificationError = error;
    console.error('[Code Academy Browser] Verification email could not be sent:', error);
  }
  return { user: credential.user, profileSyncError: profile.ok ? null : profile.error, verificationError };
}

export async function signInBrowserEmail(email, password, remember = true) {
  await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence);
  const credential = await signInWithEmailAndPassword(auth, String(email || '').trim().toLowerCase(), password);
  const profile = await ensureBrowserProfile(credential.user);
  return { user: credential.user, profileSyncError: profile.ok ? null : profile.error };
}

export async function signInBrowserGoogle() {
  if (window.Capacitor?.isNativePlatform?.() || window.CodeAcademyNative?.isNativeApp) {
    await signInWithRedirect(auth, googleProvider);
    return { redirected: true };
  }
  try {
    const credential = await signInWithPopup(auth, googleProvider);
    const profile = await ensureBrowserProfile(credential.user);
    return { user: credential.user, profileSyncError: profile.ok ? null : profile.error };
  } catch (error) {
    if (['auth/popup-blocked', 'auth/popup-closed-by-user', 'auth/cancelled-popup-request', 'auth/operation-not-supported-in-this-environment'].includes(error?.code)) {
      await signInWithRedirect(auth, googleProvider);
      return { redirected: true };
    }
    throw error;
  }
}

export async function consumeGoogleRedirect() {
  const result = await getRedirectResult(auth);
  if (result?.user) return ensureBrowserProfile(result.user);
  return null;
}

export async function requestBrowserPasswordReset(email) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(cleanEmail)) throw new Error('Enter a valid email address.');
  const continuation = new URL('reset-password.html', new URL('./', location.href)).href;
  await sendPasswordResetEmail(auth, cleanEmail, { url: continuation, handleCodeInApp: false });
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

export async function signOutBrowser() { await signOut(auth); }
export async function getBrowserProfile(uid = auth.currentUser?.uid) {
  if (!uid) throw new Error('No browser account is signed in.');
  const snap = await getDoc(doc(db, 'browserProfiles', uid));
  return snap.exists() ? snap.data() : null;
}
export async function saveBrowserProfile(data) {
  if (!auth.currentUser) throw new Error('Sign in before saving browser profile settings.');
  await setDoc(doc(db, 'browserProfiles', auth.currentUser.uid), { ...data, updatedAt: serverTimestamp() }, { merge: true });
}
export async function uploadBrowserAvatar(file) {
  if (!auth.currentUser) throw new Error('Sign in before uploading a profile image.');
  if (!(file instanceof File)) throw new Error('Choose an image file.');
  if (!file.type.startsWith('image/')) throw new Error('The selected file is not an image.');
  if (file.size > 5 * 1024 * 1024) throw new Error('Profile images must be 5 MB or smaller.');
  const cleanName = file.name.replace(/[^a-z0-9._-]/gi, '_').slice(0, 90) || 'avatar.jpg';
  const imageRef = ref(storage, `browserProfileImages/${auth.currentUser.uid}/${Date.now()}_${cleanName}`);
  await uploadBytes(imageRef, file, { contentType: file.type });
  const photoURL = await getDownloadURL(imageRef);
  await updateProfile(auth.currentUser, { photoURL });
  await saveBrowserProfile({ photoURL });
  return photoURL;
}

let phoneVerifier = null;
export function clearPhoneVerifier() {
  if (phoneVerifier) { try { phoneVerifier.clear(); } catch {} }
  phoneVerifier = null;
}
export function getPhoneVerifier(containerId = 'recaptcha-container') {
  clearPhoneVerifier();
  phoneVerifier = new RecaptchaVerifier(auth, containerId, { size: 'normal' });
  return phoneVerifier;
}
export async function sendBrowserPhoneCode(phoneNumber, containerId = 'recaptcha-container') {
  const phone = String(phoneNumber || '').trim().replace(/[\s()-]/g, '');
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) throw new Error('Enter a full international phone number, including + and country code.');
  const verifier = getPhoneVerifier(containerId);
  try { return await signInWithPhoneNumber(auth, phone, verifier); }
  catch (error) { clearPhoneVerifier(); throw error; }
}
export async function finishBrowserPhoneSignIn(confirmationResult, smsCode, displayName = '') {
  if (!confirmationResult) throw new Error('Request an SMS verification code first.');
  if (!/^\d{6}$/.test(String(smsCode || '').trim())) throw new Error('Enter the six-digit SMS verification code.');
  const credential = await confirmationResult.confirm(String(smsCode).trim());
  if (displayName && !credential.user.displayName) await updateProfile(credential.user, { displayName: String(displayName).trim() });
  const profile = await ensureBrowserProfile(credential.user, displayName);
  clearPhoneVerifier();
  return { user: credential.user, profileSyncError: profile.ok ? null : profile.error };
}
