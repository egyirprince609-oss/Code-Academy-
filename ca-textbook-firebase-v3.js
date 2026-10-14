/* Code Academy Textbook Registry v3 — Firebase Realtime Database. Registry records are global publisher records, not user profiles. */
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getDatabase, ref, get, set, update } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

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

// Reuse the existing default Firebase app when authentication.js has already initialized it.
const app = getApps().some(a => a.name === "[DEFAULT]") ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app, firebaseConfig.databaseURL);
const REGISTRY_PATH = "textbookRegistryV3";
const PUBLISHER_EMAILS = ["egyirwisemanprince@gmail.com", "egyirpnce609@gmail.com"];
let latestUser = auth.currentUser || null;
let authSettled = !!auth.currentUser;
let settleAuth;
const authReady = new Promise(resolve => { settleAuth = resolve; });
onAuthStateChanged(auth, user => {
  latestUser = user || null;
  authSettled = true;
  settleAuth(latestUser);
}, error => {
  console.warn("Textbook registry auth state could not be read:", error?.message || error);
  authSettled = true;
  settleAuth(null);
});

export const textbookFirebase = { app, auth, db };
export function publisherEmails() { return PUBLISHER_EMAILS.slice(); }
export async function currentUser() {
  if (authSettled) return latestUser;
  return await authReady;
}
export function isPublisher(user) {
  return !!(user && user.email && user.emailVerified === true && PUBLISHER_EMAILS.includes(String(user.email).trim().toLowerCase()));
}
function dbError(error) {
  const message = String(error?.message || error || "Unknown Firebase error");
  if (/permission_denied|PERMISSION_DENIED|permission/i.test(message)) return "Firebase denied access. Merge the v3 textbook registry rules fragment into your existing Realtime Database rules. Do not replace the rules for the rest of Code Academy.";
  if (/network|offline|fetch/i.test(message)) return "Firebase could not be reached. Check the network and your Realtime Database URL/rules.";
  return message;
}
export async function getRegistry() {
  try {
    const snap = await get(ref(db, REGISTRY_PATH));
    return snap.exists() ? snap.val() : {};
  } catch (error) { throw new Error(dbError(error)); }
}
export async function getRecordForCourse(courseId) {
  try {
    const snap = await get(ref(db, `${REGISTRY_PATH}/${courseId}`));
    return snap.exists() ? snap.val() : null;
  } catch (error) { throw new Error(dbError(error)); }
}
export async function getRecordById(bookId) {
  const all = await getRegistry();
  return Object.values(all || {}).find(record => record && record.bookId === String(bookId || "").trim()) || null;
}
function randomToken(length = 7) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(length);
  if (window.crypto?.getRandomValues) window.crypto.getRandomValues(bytes);
  else for (let i=0;i<length;i++) bytes[i] = Math.floor(Math.random()*256);
  return Array.from(bytes, n => alphabet[n % alphabet.length]).join("");
}
function makeVerifyUrl(bookId, code) {
  // Keep codes printed in books pointed at the official GitHub Pages site even when testing locally.
  const url = new URL("verify-textbook-v3.html", "https://egyirprince609-oss.github.io/Code-Academy-/");
  url.searchParams.set("book", bookId);
  url.searchParams.set("code", code);
  return url.href;
}
export async function issueBookRecord(course) {
  const user = await currentUser();
  if (!isPublisher(user)) {
    throw new Error("Only a signed-in, email-verified publisher account can issue official textbook IDs. Sign in to Code Academy with one of the publisher emails first.");
  }
  const existing = await getRecordForCourse(course.id);
  if (existing && existing.status === "valid") return existing;
  const year = new Date().getFullYear();
  const slug = String(course.id || "BOOK").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5) || "BOOK";
  const bookId = `CAP-${year}-${slug}-${randomToken(8)}`;
  const verificationCode = `CA-${year}-${slug}-${randomToken(10)}`;
  const record = {
    bookId,
    verificationCode,
    courseId: course.id,
    course: course.label,
    fullName: course.fullName,
    edition: `First digital edition, ${year}`,
    publisher: "CODE ACADEMY Publication",
    author: "Prince Egyir (Wise Man)",
    country: "Ghana",
    status: "valid",
    registryVersion: 3,
    issuedAt: new Date().toISOString(),
    publisherUid: user.uid,
    publisherEmail: String(user.email).toLowerCase(),
    verifyUrl: makeVerifyUrl(bookId, verificationCode)
  };
  try {
    await set(ref(db, `${REGISTRY_PATH}/${course.id}`), record);
    return record;
  } catch (error) { throw new Error(dbError(error)); }
}
export async function revokeBookRecord(courseId, reason = "Publisher revoked this edition") {
  const user = await currentUser();
  if (!isPublisher(user)) throw new Error("Publisher sign-in is required to revoke an edition.");
  const rec = await getRecordForCourse(courseId);
  if (!rec) throw new Error("No registered textbook exists for this course.");
  try {
    await update(ref(db, `${REGISTRY_PATH}/${courseId}`), { status: "revoked", revokedAt: new Date().toISOString(), revocationReason: String(reason).slice(0, 240) });
    return true;
  } catch (error) { throw new Error(dbError(error)); }
}
export async function verifyBook(bookId, code = "") {
  const cleanId = String(bookId || "").trim();
  if (!cleanId) return { valid: false, reason: "Enter or scan a textbook ID." };
  let rec;
  try { rec = await getRecordById(cleanId); }
  catch (error) { return { valid: false, reason: error.message, unavailable: true }; }
  if (!rec) return { valid: false, reason: "No matching record was found in the official Code Academy textbook registry. Treat this copy as unverified." };
  if (rec.status !== "valid") return { valid: false, record: rec, reason: "This textbook record is not currently valid. Contact CODE ACADEMY Publication before relying on it." };
  if (code && String(code).trim().toUpperCase() !== String(rec.verificationCode || "").trim().toUpperCase()) {
    return { valid: false, record: rec, reason: "The textbook ID is registered, but the verification code does not match this official record." };
  }
  return { valid: true, record: rec, idOnly: !code, reason: code ? "Textbook ID and verification code both match the official registry." : "This barcode ID exists in the official registry. Scan the QR code or enter the printed verification code for a full two-part match." };
}
export function makeVerifyUrlForRecord(record) {
  if (record?.verifyUrl) return record.verifyUrl;
  return makeVerifyUrl(record?.bookId || "", record?.verificationCode || "");
}
