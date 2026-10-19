/* Code Academy learning tools shared integration layer.
   Uses the existing Firebase auth/profile and central notification feed.
   Learner data is stored in users/{uid}/learningTools/{toolId}; no XP,
   coins, streaks, certificates, or course-progress fields are modified. */
import { auth, db, onAuthStateChanged, refreshCurrentUser, getUserProfile, logOut } from "./authentication.js";
import { collection, doc, getDoc, onSnapshot, orderBy, query, limit, serverTimestamp, setDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { markNotificationRead, markAllNotificationsRead, sendNotification } from "./notification-engine.js";

const $ = (id) => document.getElementById(id);
let notificationUnsubscribe = null;
let activeUser = null;
let notificationRows = [];

export function toolToast(message, kind = "") {
  const host = $("toolToasts");
  if (!host) return;
  const item = document.createElement("div");
  item.className = `lt-toast ${kind}`.trim();
  item.textContent = String(message || "");
  host.appendChild(item);
  window.setTimeout(() => item.remove(), 4300);
}

export async function loadToolData(uid, toolId, defaults = {}) {
  const key = `ca_learning_tool_${uid}_${toolId}`;
  try {
    const snap = await getDoc(doc(db, "users", uid, "learningTools", toolId));
    if (snap.exists()) {
      const data = snap.data() || {};
      try { localStorage.setItem(key, JSON.stringify(data)); } catch (_) {}
      return { ...defaults, ...data, _sync: "cloud" };
    }
  } catch (error) {
    console.warn(`Learning tool cloud read failed for ${toolId}; checking local backup.`, error);
  }
  try {
    const cached = JSON.parse(localStorage.getItem(key) || "null");
    if (cached && typeof cached === "object") return { ...defaults, ...cached, _sync: "local" };
  } catch (_) {}
  return { ...defaults, _sync: "local" };
}

export async function saveToolData(uid, toolId, payload) {
  const key = `ca_learning_tool_${uid}_${toolId}`;
  const safePayload = JSON.parse(JSON.stringify(payload || {}));
  try { localStorage.setItem(key, JSON.stringify(safePayload)); } catch (error) {
    console.warn("Could not save learning tool local backup:", error);
  }
  try {
    await setDoc(doc(db, "users", uid, "learningTools", toolId), {
      ...safePayload,
      updatedAt: serverTimestamp()
    }, { merge: true });
    return { synced: true };
  } catch (error) {
    console.warn(`Learning tool cloud write failed for ${toolId}; the local backup remains available.`, error);
    return { synced: false, error };
  }
}

export async function createToolNotification(details) {
  try {
    return await sendNotification(details);
  } catch (error) {
    console.warn("Could not create learning tool notification:", error);
    return null;
  }
}

function dateLabel(value) {
  if (!value) return "Just now";
  let date;
  try {
    date = typeof value.toDate === "function" ? value.toDate() : new Date(value);
  } catch (_) { return "Just now"; }
  if (Number.isNaN(date.getTime())) return "Just now";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}

function localNotificationHref(link) {
  if (!link) return "";
  try {
    const target = new URL(String(link), window.location.href);
    if (target.origin !== window.location.origin || !/^https?:$/.test(target.protocol)) return "";
    return target.href;
  } catch (_) { return ""; }
}

function renderNotifications() {
  const list = $("toolNotificationList");
  const count = $("toolNotificationCount");
  const unread = notificationRows.filter(item => item.read !== true).length;
  if (count) {
    count.textContent = unread > 99 ? "99+" : String(unread);
    count.hidden = unread === 0;
  }
  if (!list) return;
  list.replaceChildren();
  if (!notificationRows.length) {
    const empty = document.createElement("div");
    empty.className = "lt-notice-empty";
    empty.innerHTML = '<i class="fa-regular fa-bell-slash" style="display:block;font-size:22px;margin-bottom:10px"></i><strong style="display:block;color:#dce9fa;margin-bottom:5px">You are all caught up</strong><span>Learning reminders and account updates will appear here.</span>';
    list.appendChild(empty);
    return;
  }
  for (const item of notificationRows) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `lt-notice-item${item.read === true ? "" : " unread"}`;
    const icon = document.createElement("span");
    icon.className = "lt-notice-icon";
    icon.textContent = item.icon || "🔔";
    const content = document.createElement("span");
    content.className = "lt-notice-copy";
    const title = document.createElement("strong");
    title.textContent = item.title || "Code Academy";
    const message = document.createElement("span");
    message.textContent = item.message || "You have a new update.";
    const time = document.createElement("time");
    time.textContent = dateLabel(item.createdAt);
    content.append(title, message, time);
    button.append(icon, content);
    button.addEventListener("click", async () => {
      try { if (item.read !== true) await markNotificationRead(item.id); }
      catch (error) { console.warn("Could not mark notification read:", error); }
      const href = localNotificationHref(item.link);
      if (href) window.location.href = href;
      else if (item.read !== true) toolToast("Notification marked as read.", "good");
    });
    list.appendChild(button);
  }
}

function startNotificationSubscription(uid) {
  if (typeof notificationUnsubscribe === "function") notificationUnsubscribe();
  const list = $("toolNoticePanel");
  if (!list) return;
  const notices = collection(db, "users", uid, "notifications");
  const feed = query(notices, orderBy("createdAt", "desc"), limit(30));
  notificationUnsubscribe = onSnapshot(feed, snapshot => {
    notificationRows = snapshot.docs.map(row => ({ id: row.id, ...row.data() }));
    renderNotifications();
  }, error => {
    console.warn("Could not load the central Code Academy notification feed:", error);
    const content = $("toolNotificationList");
    if (content) content.innerHTML = '<div class="lt-notice-empty">Notifications could not be loaded. Check your connection or Firestore rules.</div>';
  });
}

function bindSharedControls() {
  const navToggle = $("toolNavToggle");
  const nav = $("toolPrimaryNav");
  navToggle?.addEventListener("click", () => {
    const open = nav?.classList.toggle("open") || false;
    navToggle.setAttribute("aria-expanded", String(open));
  });
  const noticeButton = $("toolNotificationToggle");
  const panel = $("toolNoticePanel");
  noticeButton?.addEventListener("click", () => {
    if (!panel) return;
    const opening = panel.hidden;
    panel.hidden = !opening;
    noticeButton.setAttribute("aria-expanded", String(opening));
  });
  document.addEventListener("click", event => {
    if (!panel || panel.hidden) return;
    if (panel.contains(event.target) || noticeButton?.contains(event.target)) return;
    panel.hidden = true;
    noticeButton?.setAttribute("aria-expanded", "false");
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && panel && !panel.hidden) {
      panel.hidden = true;
      noticeButton?.setAttribute("aria-expanded", "false");
    }
  });
  $("toolMarkAllRead")?.addEventListener("click", async () => {
    try {
      await markAllNotificationsRead();
      toolToast("All notifications marked as read.", "good");
    } catch (error) {
      console.warn(error);
      toolToast("Could not mark notifications as read. Check your connection.", "bad");
    }
  });
  $("toolSignOut")?.addEventListener("click", async () => {
    const button = $("toolSignOut");
    if (button) button.disabled = true;
    try {
      await logOut();
      window.location.replace("login.html");
    } catch (error) {
      console.error("Sign out failed:", error);
      toolToast("Could not sign out. Please try again.", "bad");
      if (button) button.disabled = false;
    }
  });
  window.addEventListener("pagehide", () => {
    if (typeof notificationUnsubscribe === "function") notificationUnsubscribe();
  }, { once: true });
}

export function initLearningToolPage(activePage) {
  bindSharedControls();
  const currentNav = document.querySelector(`[data-tool-nav="${activePage}"]`);
  currentNav?.classList.add("active");
  return new Promise(resolve => {
    let initialized = false;
    onAuthStateChanged(auth, async user => {
      if (!user) {
        window.location.replace("login.html");
        return;
      }
      if (initialized) return;
      let current = user;
      try { current = await refreshCurrentUser() || user; }
      catch (error) { console.warn("Could not refresh the signed-in account before loading the tool:", error); }
      const passwordAccount = (current.providerData || []).some(provider => provider.providerId === "password");
      if (passwordAccount && current.email && !current.emailVerified) {
        window.location.replace("email-action.html?pending=1");
        return;
      }
      let profile = {};
      try { profile = await getUserProfile(current.uid) || {}; }
      catch (error) { console.warn("Could not load profile metadata:", error); }
      activeUser = current;
      const rawRole = profile.role || profile.accountRole || profile.userRole || "student";
      const role = String(rawRole).trim().toLowerCase().replace(/[^a-z0-9_-]/g, "") || "student";
      document.body.dataset.userRole = role;
      const name = profile.displayName || current.displayName || (current.email ? current.email.split("@")[0] : "Learner");
      const nameElement = $("toolAccountName");
      if (nameElement) nameElement.textContent = name;
      const roleElement = $("toolAccountRole");
      if (roleElement) roleElement.textContent = role === "admin" ? "Admin account" : (["teacher", "instructor", "mentor"].includes(role) ? "Instructor account" : "Student workspace");
      const avatar = $("toolAccountAvatar");
      if (avatar) {
        avatar.src = profile.photoURL || current.photoURL || "logo.png";
        avatar.onerror = () => { avatar.onerror = null; avatar.src = "logo.png"; };
      }
      startNotificationSubscription(current.uid);
      initialized = true;
      resolve({ user: current, profile, role });
    });
  });
}

export function currentLearningToolUser() {
  return activeUser;
}
