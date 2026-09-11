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
  GoogleAuthProvider,
  OAuthProvider,
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
  serverTimestamp
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


// ============================================================
// FIREBASE CONFIGURATION
// ============================================================

const firebaseConfig = {
  apiKey: "AIzaSyC84eyA9-fxDiYFPBk3OXVH-AimkjVy9-s",
  authDomain: "codeacademybywm.firebaseapp.com",
  projectId: "codeacademybywm",
  storageBucket: "codeacademybywm.firebasestorage.app",
  messagingSenderId: "677581551464",
  appId: "1:677581551464:web:5eda0e67f5ef41f69d48dd",
  measurementId: "G-X2B2D3W3MP"
};









// ============================================================
// INITIALIZE FIREBASE
// ============================================================
const app = initializeApp(firebaseConfig);

const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);


// ============================================================
// AUTH PROVIDERS
// ============================================================
const googleProvider = new GoogleAuthProvider();
const yahooProvider = new OAuthProvider("yahoo.com");


// ============================================================
// USER DEFAULT DATA
// ============================================================
function createDefaultUserData(user) {
  return {
    displayName: user.displayName || "User",
    email: user.email || "",
    photoURL: user.photoURL || "",

    createdAt: new Date(),

    xp: 0,
    coins: 0,
    streak: 0,

    lastLoginDate: new Date().toISOString().split("T")[0],

    certificates: {
      html: false,
      css: false,
      javascript: false,
      python: false,
      react: false
    },

    progress: {
      html: 0,
      css: 0,
      javascript: 0,
      python: 0,
      react: 0
    },

    completedLessons: []
  };
}


// ============================================================
// CREATE USER FIRESTORE DOCUMENT IF NEEDED
// ============================================================
async function createUserDocIfNotExists(user) {

  const userRef = doc(db, "users", user.uid);

  const snap = await getDoc(userRef);

  if (!snap.exists()) {

    await setDoc(
      userRef,
      createDefaultUserData(user)
    );

    return true;
  }

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
export async function signUp(
  email,
  password,
  displayName
) {

  try {

    const userCredential =
      await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );


    const user =
      userCredential.user;


    // --------------------------------------------------------
    // Set Firebase display name
    // --------------------------------------------------------
    await updateProfile(
      user,
      {
        displayName: displayName
      }
    );


    // --------------------------------------------------------
    // Create Firestore profile
    // --------------------------------------------------------
    await setDoc(
      doc(db, "users", user.uid),
      {
        displayName: displayName,
        email: email,
        photoURL: "",

        createdAt: new Date(),

        xp: 0,
        coins: 0,
        streak: 0,

        lastLoginDate:
          new Date().toISOString().split("T")[0],

        certificates: {
          html: false,
          css: false,
          javascript: false,
          python: false,
          react: false
        },

        progress: {
          html: 0,
          css: 0,
          javascript: 0,
          python: 0,
          react: 0
        },

        completedLessons: []
      }
    );


    return user;

  } catch (error) {

    console.error(
      "Sign up error:",
      error
    );

    throw error;
  }
}


// ============================================================
// LOGIN - EMAIL + PASSWORD + reCAPTCHA
// ============================================================
export async function logIn(
  email,
  password
) {

  try {

    // --------------------------------------------------------
    // Check reCAPTCHA
    // --------------------------------------------------------
    if (
      typeof grecaptcha === "undefined"
    ) {

      throw new Error(
        "reCAPTCHA is not available. Please reload the page."
      );
    }


    const recaptchaResponse =
      grecaptcha.getResponse();


    if (!recaptchaResponse) {

      throw new Error(
        "Please complete the reCAPTCHA verification."
      );
    }


    // --------------------------------------------------------
    // Firebase email/password login
    // --------------------------------------------------------
    const userCredential =
      await signInWithEmailAndPassword(
        auth,
        email,
        password
      );


    // --------------------------------------------------------
    // Reset reCAPTCHA
    // --------------------------------------------------------
    grecaptcha.reset();


    // --------------------------------------------------------
    // Update streak
    // --------------------------------------------------------
    await updateStreak(
      userCredential.user.uid
    );


    return userCredential.user;

  } catch (error) {

    console.error(
      "Email login error:",
      error
    );


    // --------------------------------------------------------
    // Safely reset reCAPTCHA
    // --------------------------------------------------------
    if (
      typeof grecaptcha !== "undefined"
    ) {

      try {
        grecaptcha.reset();
      } catch (recaptchaError) {
        console.warn(
          "Could not reset reCAPTCHA:",
          recaptchaError
        );
      }
    }


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
// YAHOO LOGIN
//
// Yahoo remains POPUP-based because we are only changing
// the Google mobile authentication flow.
// ============================================================
export async function signInWithYahoo() {

  try {

    const result =
      await signInWithPopup(
        auth,
        yahooProvider
      );


    const user =
      result.user;


    // --------------------------------------------------------
    // Create user document if necessary
    // --------------------------------------------------------
    await createUserDocIfNotExists(
      user
    );


    // --------------------------------------------------------
    // Update streak
    // --------------------------------------------------------
    await updateStreak(
      user.uid
    );


    return user;

  } catch (error) {

    console.error(
      "Yahoo login error:",
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

    await sendPasswordResetEmail(
      auth,
      email
    );

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
            reason:
                error.message
        };

    }

}
