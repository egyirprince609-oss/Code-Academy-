// ============================================================
// CODE ACADEMY - FIREBASE AUTHENTICATION
// Firebase SDK v10.7.1
// ============================================================


// ============================================================
// FIREBASE APP
// ============================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";


// ============================================================
// FIREBASE AUTH
// ============================================================
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  signInWithPopup,
  sendPasswordResetEmail,
  sendEmailVerification,
  signInWithPhoneNumber,
  RecaptchaVerifier,
  reload,
  applyActionCode,
  GoogleAuthProvider,
  signInWithRedirect,
  getRedirectResult,
  updateProfile,
  updateEmail,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";


// ============================================================
// FIRESTORE
// ============================================================
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  increment,
  arrayUnion,
  serverTimestamp,
  runTransaction
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";


// ============================================================
// FIREBASE STORAGE
// ============================================================
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

import {
  getDatabase
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";


// ============================================================
// FIREBASE CONFIGURATION
// ============================================================

const firebaseConfig = {
  apiKey: "AIzaSyC84eyA9-fxDiYFPBk3OXVH-AimkjVy9-s",
  authDomain: "codeacademybywm.firebaseapp.com",
  databaseURL: "https://codeacademybywm-default-rtdb.firebaseio.com",
  projectId: "codeacademybywm",
  storageBucket: "codeacademybywm.firebasestorage.app",
  messagingSenderId: "677581551464",
  appId: "1:677581551464:web:43d33c49806bf2099d48dd",
  measurementId: "G-Y0LPZQS5B0"
};









// ============================================================
// INITIALIZE FIREBASE
// ============================================================
const app = initializeApp(firebaseConfig);

const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
const rtdb = getDatabase(app, firebaseConfig.databaseURL);


// ============================================================
// AUTH PROVIDERS
// ============================================================
const googleProvider = new GoogleAuthProvider();


// ============================================================
// USER DEFAULT DATA
// ============================================================
function createDefaultUserData(user) {
  const referralCode = createReferralCode(user.uid);
  const profileURL = `${window.location.origin}${window.location.pathname.includes('/Code-Academy-/') ? '/Code-Academy-' : ''}/profile.html?uid=${encodeURIComponent(user.uid)}`;
  return {
    uid: user.uid,
    userId: user.uid,
    displayName: user.displayName || "User",
    email: user.email || "",
    phoneNumber: user.phoneNumber || "",
    photoURL: user.photoURL || "",
    userURL: profileURL,
    profileURL,
    referralCode,
    emailVerified: !!user.emailVerified,
    providerId: user.providerData?.[0]?.providerId || "password",
    accountStatus: "active",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    xp: 0,
    coins: 0,
    streak: 0,
    lastLoginDate: new Date().toISOString().slice(0, 10),
    certificates: { html: false, css: false, javascript: false, python: false, react: false },
    progress: { html: 0, css: 0, javascript: 0, python: 0, react: 0 },
    completedLessons: [],
    notificationPreferences: { email: true, inApp: true }
  };
}


// ============================================================
// CREATE USER FIRESTORE DOCUMENT IF NEEDED
// ============================================================
async function createUserDocIfNotExists(user) {
  const userRef = doc(db, "users", user.uid);
  const snap = await getDoc(userRef);
  if (!snap.exists()) {
    await setDoc(userRef, createDefaultUserData(user));
    // Referral-code indexing is helpful but must never roll back a valid auth account.
    try { await registerReferralCode(user); }
    catch (error) { console.warn("Referral code registration did not complete:", error); }
    return true;
  }
  const updates = { updatedAt: serverTimestamp() };
  if (user.displayName && snap.data().displayName !== user.displayName) updates.displayName = user.displayName;
  if (user.email && snap.data().email !== user.email) updates.email = user.email;
  if (user.phoneNumber && snap.data().phoneNumber !== user.phoneNumber) updates.phoneNumber = user.phoneNumber;
  if (user.photoURL && snap.data().photoURL !== user.photoURL) updates.photoURL = user.photoURL;
  if (snap.data().emailVerified !== !!user.emailVerified) updates.emailVerified = !!user.emailVerified;
  await updateDoc(userRef, updates);
  return false;
}


// ============================================================
// UPDATE LOGIN STREAK
// ============================================================
async function updateStreak(uid) {

  const userRef = doc(db, "users", uid);

  const snap = await getDoc(userRef);

  if (!snap.exists()) {
    return;
  }

  const data = snap.data();

  const today =
    new Date().toISOString().split("T")[0];

  const lastLogin =
    data.lastLoginDate;

  let newStreak =
    data.streak || 0;


  // ----------------------------------------------------------
  // Calculate yesterday
  // ----------------------------------------------------------
  const yesterday = new Date();

  yesterday.setDate(
    yesterday.getDate() - 1
  );

  const yesterdayStr =
    yesterday.toISOString().split("T")[0];


  // ----------------------------------------------------------
  // Streak logic
  // ----------------------------------------------------------
  if (lastLogin === yesterdayStr) {

    newStreak += 1;

  } else if (lastLogin !== today) {

    newStreak = 1;
  }


  // ----------------------------------------------------------
  // Save streak
  // ----------------------------------------------------------
  await updateDoc(userRef, {

    streak: newStreak,

    lastLoginDate: today

  });
}


// ============================================================
// SIGN UP
// ============================================================
export async function signUp(email, password, displayName) {
  const cleanEmail = String(email || "").trim().toLowerCase();
  const cleanName = String(displayName || "").trim();
  if (!cleanName) throw new Error("Enter your full name.");
  validatePasswordPolicy(password);
  let authUserCreated = false;
  try {
    const credential = await createUserWithEmailAndPassword(auth, cleanEmail, password);
    const user = credential.user;
    authUserCreated = true;
    await updateProfile(user, { displayName: cleanName });
    // Keep a single canonical profile path for all existing Code Academy pages.
    await setDoc(doc(db, "users", user.uid), {
      ...createDefaultUserData({
        uid: user.uid,
        displayName: cleanName,
        email: cleanEmail,
        phoneNumber: user.phoneNumber || "",
        photoURL: user.photoURL || "",
        emailVerified: false,
        providerData: user.providerData || []
      }),
      displayName: cleanName,
      email: cleanEmail,
      emailVerified: false,
      providerId: "password"
    }, { merge: true });
    try { await registerReferralCode(user); }
    catch (error) { console.warn("Referral code registration failed:", error); }
    return user;
  } catch (error) {
    if (authUserCreated && error && typeof error === "object") error.accountCreated = true;
    console.error("Code Academy email signup failed:", error);
    throw error;
  }
}

/** Enforce the client-side policy; Firebase remains the final authority. */
export function validatePasswordPolicy(password) {
  const value = String(password || "");
  const checks = {
    length: value.length >= 8,
    uppercase: /[A-Z]/.test(value),
    lowercase: /[a-z]/.test(value),
    special: /[^A-Za-z0-9]/.test(value)
  };
  if (!Object.values(checks).every(Boolean)) {
    const error = new Error("Password does not meet Code Academy's password requirements.");
    error.code = "auth/password-policy-not-met";
    error.checks = checks;
    throw error;
  }
  return true;
}

/** Human-readable context plus the exact SDK code/message is shown by the UI. */
export function getFirebaseErrorDetails(error) {
  const code = String(error?.code || "unknown");
  const message = String(error?.message || error || "Unknown Firebase error");
  const descriptions = {
    "auth/email-already-in-use": "An account already exists with this email address.",
    "auth/invalid-email": "The email address is not valid.",
    "auth/weak-password": "Firebase rejected the password. Check the configured password policy.",
    "auth/operation-not-allowed": "This sign-in method is disabled in Firebase Authentication.",
    "auth/unauthorized-domain": "This website domain is not authorized in Firebase Authentication settings.",
    "auth/invalid-api-key": "Firebase rejected the API key. Check the web app configuration.",
    "auth/network-request-failed": "The network request failed. Check your internet connection and retry.",
    "auth/too-many-requests": "Firebase temporarily blocked repeated attempts. Wait before trying again.",
    "auth/invalid-credential": "The credentials are invalid or expired.",
    "auth/user-disabled": "This account has been disabled in Firebase Authentication.",
    "auth/user-not-found": "No account was found for these credentials.",
    "auth/wrong-password": "The password is incorrect.",
    "auth/missing-phone-number": "Enter a phone number in international format, for example +233...",
    "auth/invalid-phone-number": "Firebase rejected the phone number. Include the country code.",
    "auth/quota-exceeded": "Firebase SMS quota was reached for this project.",
    "auth/captcha-check-failed": "The reCAPTCHA check failed. Reload the page and try again.",
    "auth/invalid-verification-code": "The SMS verification code is incorrect.",
    "auth/code-expired": "The SMS verification code expired. Request a new code.",
    "auth/unauthorized-continue-uri": "The email verification return URL is not authorized in Firebase.",
    "auth/invalid-continue-uri": "The email verification return URL is invalid.",
    "auth/invalid-app-credential": "Firebase rejected the app verification credential. Check reCAPTCHA, the authorized domain and phone-auth settings.",
    "auth/missing-verification-code": "Enter the SMS verification code sent by Firebase.",
    "auth/invalid-verification-id": "The SMS verification session is invalid or expired. Request a new code.",
    "auth/expired-action-code": "This email verification link has expired. Request a fresh link.",
    "auth/invalid-action-code": "This verification link is invalid or has already been used."
  };
  return { code, message, explanation: descriptions[code] || "Firebase returned an error. The exact SDK details are shown below." };
}

export async function sendEmailVerificationLink(user = auth.currentUser) {
  if (!user) throw new Error("No signed-in account is available to verify.");
  if (!user.email) throw new Error("This account does not have an email address to verify.");
  const isBrowserFlow = window.location.pathname.includes('/browser/');
  const base = `${window.location.origin}${window.location.pathname.includes('/Code-Academy-/') ? '/Code-Academy-' : ''}`;
  const continuation = isBrowserFlow
    ? `${window.location.origin}${window.location.pathname.split('/browser/')[0]}/browser/email-verification.html`
    : `${base}/email-verification.html`;
  await sendEmailVerification(user, {
    url: continuation,
    handleCodeInApp: false
  });
  return true;
}

export async function refreshCurrentUser() {
  if (!auth.currentUser) return null;
  await reload(auth.currentUser);
  const user = auth.currentUser;
  if (user) {
    const userRef = doc(db, "users", user.uid);
    await setDoc(userRef, {
      email: user.email || "",
      phoneNumber: user.phoneNumber || "",
      photoURL: user.photoURL || "",
      emailVerified: !!user.emailVerified,
      updatedAt: serverTimestamp()
    }, { merge: true });
  }
  return user;
}

export async function applyEmailVerificationCode(oobCode) {
  if (!oobCode) throw new Error("The email verification link does not contain a verification code.");
  await applyActionCode(auth, oobCode);
  await refreshCurrentUser();
  return true;
}

export async function setAuthPersistence(remember = true) {
  const { setPersistence, browserLocalPersistence, browserSessionPersistence } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js");
  await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence);
}

/** Create a fresh, accessible reCAPTCHA verifier for Firebase phone auth. */
export function createPhoneVerifier(containerId) {
  const existing = window.__codeAcademyPhoneVerifier;
  if (existing && typeof existing.clear === "function") {
    try { existing.clear(); } catch (_) {}
  }
  const verifier = new RecaptchaVerifier(auth, containerId, {
    size: "normal",
    callback: () => console.info("Phone reCAPTCHA completed."),
    "expired-callback": () => console.warn("Phone reCAPTCHA expired; complete it again.")
  });
  window.__codeAcademyPhoneVerifier = verifier;
  return verifier;
}

export async function sendPhoneVerificationCode(phoneNumber, verifier) {
  const phone = String(phoneNumber || "").replace(/[\s()-]/g, "");
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) {
    const error = new Error("Enter the phone number in international format, for example +233241234567.");
    error.code = "auth/invalid-phone-number";
    throw error;
  }
  if (!verifier) throw new Error("Phone verification is not ready. Reload the page and try again.");
  return await signInWithPhoneNumber(auth, phone, verifier);
}

export async function completePhoneVerification(confirmationResult, smsCode, displayName = "") {
  if (!confirmationResult) throw new Error("Request an SMS verification code first.");
  const code = String(smsCode || "").trim();
  if (!/^\d{6}$/.test(code)) {
    const error = new Error("Enter the six-digit code sent to your phone.");
    error.code = "auth/invalid-verification-code";
    throw error;
  }
  const credential = await confirmationResult.confirm(code);
  const user = credential.user;
  try {
    if (displayName && !user.displayName) await updateProfile(user, { displayName: displayName.trim() });
    await createUserDocIfNotExists(user);
    await setDoc(doc(db, "users", user.uid), {
      uid: user.uid,
      userId: user.uid,
      displayName: user.displayName || displayName.trim() || "User",
      phoneNumber: user.phoneNumber || "",
      email: user.email || "",
      photoURL: user.photoURL || "",
      providerId: "phone",
      updatedAt: serverTimestamp()
    }, { merge: true });
    return user;
  } catch (error) {
    if (error && typeof error === "object") error.accountCreated = true;
    throw error;
  }
}

// ============================================================
// LOGIN - EMAIL + PASSWORD + reCAPTCHA
// ============================================================
export async function logIn(email, password) {
  try {
    const cleanEmail = String(email || "").trim().toLowerCase();
    const credential = await signInWithEmailAndPassword(auth, cleanEmail, password);
    const user = credential.user;
    try { await createUserDocIfNotExists(user); }
    catch (profileError) { if (profileError && typeof profileError === "object") profileError.accountAuthenticated = true; throw profileError; }
    try { await updateStreak(user.uid); }
    catch (streakError) { console.warn("Login succeeded but streak update failed:", streakError); }
    return user;
  } catch (error) {
    console.error("Code Academy email login failed:", error);
    throw error;
  }
}

// ============================================================
// GOOGLE LOGIN
//
// IMPORTANT:
// Google now uses REDIRECT instead of POPUP.
//
// This is better suited for mobile browsers.
// ============================================================

export async function signInWithGoogle() {

  try {

    console.log(
      "Starting Google popup login..."
    );

    const result =
      await signInWithPopup(
        auth,
        googleProvider
      );

    const user =
      result.user;


    // Create Firestore profile if needed
    await createUserDocIfNotExists(
      user
    );


    // Update login streak
    await updateStreak(
      user.uid
    );


    console.log(
      "Google login successful:",
      user.email
    );


    return user;

  } catch (error) {

    console.error(
      "Google popup login error:",
      error
    );

    throw error;
  }
}







// ============================================================
// COMPLETE GOOGLE REDIRECT LOGIN
//
// This must be called when login.html or signup.html loads.
// It checks whether Firebase has returned from Google.
// ============================================================
export async function completeGoogleRedirect() {

  try {

    console.log(
      "Checking for Google redirect result..."
    );


    const result =
      await getRedirectResult(auth);


    // --------------------------------------------------------
    // No Google redirect happened
    // --------------------------------------------------------
    if (!result) {

      return null;
    }


    // --------------------------------------------------------
    // Google login successful
    // --------------------------------------------------------
    const user =
      result.user;


    console.log(
      "Google login successful:",
      user.email
    );


    // --------------------------------------------------------
    // Create Firestore document if this is a new user
    // --------------------------------------------------------
    const created =
      await createUserDocIfNotExists(
        user
      );


    // --------------------------------------------------------
    // Update streak
    //
    // Only update it for an existing user.
    // A brand-new user already starts with streak = 0.
    // --------------------------------------------------------
    if (!created) {

      await updateStreak(
        user.uid
      );
    }


    return user;

  } catch (error) {

    console.error(
      "Google redirect result error:",
      error
    );

    throw error;
  }
}


// ============================================================
// LOGOUT
// ============================================================
export async function logOut() {

  try {

    await signOut(auth);

  } catch (error) {

    console.error(
      "Logout error:",
      error
    );

    throw error;
  }
}


// ============================================================
// FORGOT PASSWORD
// ============================================================
export async function resetPassword(
  email
) {

  try {

    const isBrowserFlow = window.location.pathname.includes('/browser/');
    if (isBrowserFlow) {
      const continuation = `${window.location.origin}${window.location.pathname.split('/browser/')[0]}/browser/reset-password.html`;
      await sendPasswordResetEmail(auth, String(email || '').trim().toLowerCase(), { url: continuation, handleCodeInApp: false });
    } else {
      await sendPasswordResetEmail(auth, email);
    }

  } catch (error) {

    console.error(
      "Password reset error:",
      error
    );

    throw error;
  }
}


// ============================================================
// GET USER PROFILE
// ============================================================
export async function getUserProfile(
  uid
) {

  try {

    const userRef =
      doc(db, "users", uid);

    const snap =
      await getDoc(userRef);


    if (snap.exists()) {

      return snap.data();
    }


    return null;

  } catch (error) {

    console.error(
      "Error getting user profile:",
      error
    );

    return null;
  }
}


// ============================================================
// ADD XP
// ============================================================
export async function addXP(
  uid,
  amount
) {

  try {

    const userRef =
      doc(db, "users", uid);


    await updateDoc(
      userRef,
      {
        xp: increment(amount)
      }
    );

  } catch (error) {

    console.error(
      "Error adding XP:",
      error
    );
  }
}


// ============================================================
// ADD COINS
// ============================================================
export async function addCoins(
  uid,
  amount
) {

  try {

    const userRef =
      doc(db, "users", uid);


    await updateDoc(
      userRef,
      {
        coins: increment(amount)
      }
    );

  } catch (error) {

    console.error(
      "Error adding Coins:",
      error
    );
  }
}


// ============================================================
// UPDATE COURSE PROGRESS
// ============================================================
export async function updateProgress(
  uid,
  courseId,
  lessonNumber
) {

  try {

    const userRef =
      doc(db, "users", uid);


    await updateDoc(
      userRef,
      {
        [`progress.${courseId}`]:
          lessonNumber
      }
    );

  } catch (error) {

    console.error(
      "Error updating progress:",
      error
    );
  }
}


// ============================================================
// COMPLETE LESSON
// ============================================================
export async function completeLesson(
  uid,
  lessonId
) {

  try {

    const userRef =
      doc(db, "users", uid);


    await updateDoc(
      userRef,
      {
        completedLessons:
          arrayUnion(lessonId)
      }
    );

  } catch (error) {

    console.error(
      "Error completing lesson:",
      error
    );
  }
}


// ============================================================
// AWARD CERTIFICATE
// ============================================================
export async function awardCertificate(
  uid,
  courseId
) {

  try {

    const userRef =
      doc(db, "users", uid);


    await updateDoc(
      userRef,
      {

        [`certificates.${courseId}`]:
          true,

        coins:
          increment(500),

        xp:
          increment(200)
      }
    );

  } catch (error) {

    console.error(
      "Error awarding certificate:",
      error
    );
  }
}


// ============================================================
// UPLOAD PROFILE PHOTO
// ============================================================
export async function uploadProfilePhoto(
  uid,
  file
) {

  try {

    const storageRef =
      ref(
        storage,
        `profilePhotos/${uid}`
      );


    // --------------------------------------------------------
    // Upload file
    // --------------------------------------------------------
    await uploadBytes(
      storageRef,
      file
    );


    // --------------------------------------------------------
    // Get download URL
    // --------------------------------------------------------
    const photoURL =
      await getDownloadURL(
        storageRef
      );


    // --------------------------------------------------------
    // Update Firebase Auth profile
    // --------------------------------------------------------
    if (auth.currentUser) {

      await updateProfile(
        auth.currentUser,
        {
          photoURL: photoURL
        }
      );
    }


    // --------------------------------------------------------
    // Update Firestore profile
    // --------------------------------------------------------
    await updateDoc(
      doc(db, "users", uid),
      {
        photoURL: photoURL
      }
    );


    return photoURL;

  } catch (error) {

    console.error(
      "Profile photo upload error:",
      error
    );

    throw error;
  }
}


// ============================================================
// UPDATE USER PROFILE
// ============================================================
export async function updateUserProfile(
  uid,
  data
) {

  try {

    const userRef =
      doc(db, "users", uid);


    await updateDoc(
      userRef,
      data
    );

  } catch (error) {

    console.error(
      "Error updating user profile:",
      error
    );

    throw error;
  }
}


// ============================================================
// EXPORT EVERYTHING REQUIRED BY THE APP
// ============================================================
export {
  auth,
  db,
  storage,
  rtdb,
  firebaseConfig,

  onAuthStateChanged,

  getDoc,
  updateDoc,
  increment,
  doc
};






/* =========================================================
   CODE ACADEMY REFERRAL ENGINE
========================================================= */

const REFERRAL_REWARD_XP = 100;
const REFERRAL_REWARD_COINS = 10;

const NEW_USER_REWARD_XP = 50;
const NEW_USER_REWARD_COINS = 5;


/* ---------------------------------------------------------
   CREATE SHORT REFERRAL CODE
--------------------------------------------------------- */

export function createReferralCode(uid){

    const clean =
        String(uid)
        .replace(/[^a-zA-Z0-9]/g, "")
        .toUpperCase();

    return "CA" + clean.slice(-8);
}


/* ---------------------------------------------------------
   GET REFERRAL CODE FROM CURRENT URL
--------------------------------------------------------- */

export function getReferralCodeFromURL(){

    const params =
        new URLSearchParams(
            window.location.search
        );

    return (
        params.get("ref") ||
        ""
    ).trim().toUpperCase();

}


/* ---------------------------------------------------------
   REMEMBER REFERRAL CODE
--------------------------------------------------------- */

export function rememberReferral(){

    const code =
        getReferralCodeFromURL();

    if(!code){

        return "";
    }


    /*
       Keep it locally so the referral survives
       signup/login navigation.
    */

    localStorage.setItem(
        "codeAcademyReferral",
        code
    );

    return code;
}


/* ---------------------------------------------------------
   GET SAVED REFERRAL
--------------------------------------------------------- */

export function getSavedReferral(){

    return (
        localStorage.getItem(
            "codeAcademyReferral"
        ) || ""
    ).trim().toUpperCase();

}


/* ---------------------------------------------------------
   CLEAR SAVED REFERRAL
--------------------------------------------------------- */

export function clearSavedReferral(){

    localStorage.removeItem(
        "codeAcademyReferral"
    );

}


/* ---------------------------------------------------------
   FIND USER BY REFERRAL CODE
---------------------------------------------------------

   Because our code is generated from UID,
   we can derive the UID from the code only if
   we store a referralCodes collection.

   Recommended structure:

   referralCodes/{CODE}

   {
      uid: "firebase-user-id"
   }

--------------------------------------------------------- */

export async function registerReferralCode(
    user
){

    if(!user){

        throw new Error(
            "User is required."
        );

    }


    const code =
        createReferralCode(
            user.uid
        );


    await setDoc(
        doc(
            db,
            "referralCodes",
            code
        ),
        {
            uid: user.uid,
            createdAt: serverTimestamp()
        },
        {
            merge: true
        }
    );


    return code;
}


/* ---------------------------------------------------------
   PROCESS REFERRAL
--------------------------------------------------------- */

export async function processReferral(
    newUser
){

    if(!newUser){

        return {
            success:false,
            reason:"NO_USER"
        };

    }


    const referralCode =
        getSavedReferral();


    if(!referralCode){

        return {
            success:false,
            reason:"NO_REFERRAL"
        };

    }


    const newUid =
        newUser.uid;


    try{

        const result =
            await runTransaction(
                db,
                async transaction => {

                    /*
                       Find referrer.
                    */

                    const codeRef =
                        doc(
                            db,
                            "referralCodes",
                            referralCode
                        );

                    const codeSnap =
                        await transaction.get(
                            codeRef
                        );


                    if(!codeSnap.exists()){

                        throw new Error(
                            "INVALID_REFERRAL"
                        );

                    }


                    const referrerUid =
                        codeSnap.data().uid;


                    /*
                       Prevent self-referral.
                    */

                    if(
                        referrerUid ===
                        newUid
                    ){

                        throw new Error(
                            "SELF_REFERRAL"
                        );

                    }


                    /*
                       Referral document.

                       The document ID is the
                       NEW USER ID.

                       This means the same new
                       account cannot be rewarded
                       twice.
                    */

                    const referralRef =
                        doc(
                            db,
                            "users",
                            referrerUid,
                            "referrals",
                            newUid
                        );


                    const referralSnap =
                        await transaction.get(
                            referralRef
                        );


                    if(
                        referralSnap.exists()
                    ){

                        return {
                            alreadyProcessed:true
                        };

                    }


                    /*
                       Referrer profile.
                    */

                    const referrerRef =
                        doc(
                            db,
                            "users",
                            referrerUid
                        );


                    /*
                       New user's profile.
                    */

                    const newUserRef =
                        doc(
                            db,
                            "users",
                            newUid
                        );


                    /*
                       Give referrer reward.
                    */

                    transaction.set(
                        referrerRef,
                        {
                            xp:
                                increment(
                                    REFERRAL_REWARD_XP
                                ),

                            coins:
                                increment(
                                    REFERRAL_REWARD_COINS
                                )
                        },
                        {
                            merge:true
                        }
                    );


                    /*
                       Give new user half reward.
                    */

                    transaction.set(
                        newUserRef,
                        {
                            xp:
                                increment(
                                    NEW_USER_REWARD_XP
                                ),

                            coins:
                                increment(
                                    NEW_USER_REWARD_COINS
                                ),

                            referredBy:
                                referrerUid,

                            referralCodeUsed:
                                referralCode
                        },
                        {
                            merge:true
                        }
                    );


                    /*
                       Record referral.
                    */

                    transaction.set(
                        referralRef,
                        {
                            referredUserId:
                                newUid,

                            referralCode:
                                referralCode,

                            xpAwarded:
                                REFERRAL_REWARD_XP,

                            coinsAwarded:
                                REFERRAL_REWARD_COINS,

                            newUserXP:
                                NEW_USER_REWARD_XP,

                            newUserCoins:
                                NEW_USER_REWARD_COINS,

                            createdAt:
                                serverTimestamp()
                        }
                    );


                    return {
                        alreadyProcessed:false
                    };

                }
            );


        clearSavedReferral();


        return {
            success:true,
            ...result
        };


    }catch(error){

        console.error(
            "Referral processing failed:",
            error
        );


        return {
            success:false,
            reason: error.message || "Referral processing failed.",
            code: error.code || "unknown"
        };

    }

}
