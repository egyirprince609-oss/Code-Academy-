import { auth, onAuthStateChanged } from "./authentication.js";

const API_BASE = (document.querySelector('meta[name="payment-api-base"]')?.content || "").trim().replace(/\/+$/, "");
const byId = (id) => document.getElementById(id);
let signedInUser = null;

function report(message, bad = false) {
  const el = byId("adminNotice");
  el.textContent = message;
  el.classList.toggle("bad", bad);
}
function formatGhs(amount) { return `GH₵${Number(amount || 0).toFixed(2)}`; }
function formatDate(value) {
  if (!value) return "Not available";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}
async function api(path, options = {}, forceTokenRefresh = false) {
  if (!API_BASE) throw Object.assign(new Error("Set the payment-api-base meta tag to the HTTPS backend URL in premium-admin.html."), { code: "PAYMENT_API_URL_NOT_CONFIGURED" });
  if (!signedInUser) throw Object.assign(new Error("No Firebase user is signed in on this page. Open Code Academy login, sign in, then reopen this admin page in the same browser."), { code: "AUTH_REQUIRED" });

  let token;
  try {
    // If Firebase's existing ID token is rejected, retry once after refreshing it
    // through the Firebase SDK's persisted sign-in session.
    token = await signedInUser.getIdToken(forceTokenRefresh);
  } catch (error) {
    throw Object.assign(new Error(`Firebase could not refresh this sign-in session: ${error?.message || "unknown Firebase error"}`), { code: error?.code || "FIREBASE_TOKEN_REFRESH_FAILED" });
  }

  const headers = { Authorization: `Bearer ${token}`, Accept: "application/json" };
  if (options.body) headers["Content-Type"] = "application/json";
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
      cache: "no-store"
    });
  } catch (e) {
    throw Object.assign(new Error(`Cannot connect to secure backend: ${e?.message || "network error"}`), { code: "PAYMENT_API_UNREACHABLE" });
  }

  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }

  // One automatic retry with a freshly issued token avoids needless manual sign-in
  // when the browser's cached ID token has expired. Other errors are not retried.
  if (!response.ok && response.status === 401 && data?.error?.code === "INVALID_SESSION" && !forceTokenRefresh) {
    return api(path, options, true);
  }
  if (!response.ok) throw Object.assign(new Error(data?.error?.message || `HTTP ${response.status}`), { code: data?.error?.code || `HTTP_${response.status}` });
  return data;
}
function addDetail(grid, label, value) {
  const box = document.createElement("div"); box.className = "detail";
  const title = document.createElement("span"); title.textContent = label;
  const strong = document.createElement("strong"); strong.textContent = value || "Not supplied";
  box.append(title, strong); grid.append(box);
}
function makeOrderCard(order) {
  const article = document.createElement("article"); article.className = "order-card";
  const top = document.createElement("div"); top.className = "order-top";
  const identity = document.createElement("div");
  const title = document.createElement("h3"); title.textContent = `${order.planTitle} · ${order.id}`;
  const date = document.createElement("small"); date.textContent = `Reference submitted: ${formatDate(order.proofSubmittedAt)}`;
  identity.append(title, date);
  const amount = document.createElement("strong"); amount.className = "amount"; amount.textContent = formatGhs(order.amountGhs);
  top.append(identity, amount);
  const grid = document.createElement("div"); grid.className = "details-grid";
  addDetail(grid, "User name", order.displayName);
  addDetail(grid, "User email", order.email);
  addDetail(grid, "Firebase UID", order.uid);
  addDetail(grid, "Payer number", order.payerPhone);
  addDetail(grid, "Submitted transaction ID", order.manualTransactionId);
  addDetail(grid, "Order created", formatDate(order.createdAt));
  const actions = document.createElement("div"); actions.className = "order-actions";
  const approve = document.createElement("button"); approve.className = "admin-btn approve-btn"; approve.textContent = "Approve after wallet check";
  approve.addEventListener("click", () => reviewOrder(order, "approve", approve));
  const reject = document.createElement("button"); reject.className = "admin-btn reject-btn"; reject.textContent = "Reject / not found";
  reject.addEventListener("click", () => reviewOrder(order, "reject", reject));
  actions.append(approve, reject); article.append(top, grid, actions);
  return article;
}
async function loadOrders() {
  if (!signedInUser) return;
  byId("refreshOrders").disabled = true;
  byId("orderList").replaceChildren();
  const loading = document.createElement("div"); loading.className = "empty-state"; loading.textContent = "Loading payment reviews…"; byId("orderList").append(loading);
  try {
    const data = await api("/api/admin/orders");
    byId("orderList").replaceChildren();
    if (!data.orders?.length) {
      const empty = document.createElement("div"); empty.className = "empty-state"; empty.textContent = "No manual payments are waiting for review."; byId("orderList").append(empty);
      report("Secure backend connected. No manual transfer submissions are waiting for review.");
    } else {
      data.orders.forEach((order) => byId("orderList").append(makeOrderCard(order)));
      report(`${data.orders.length} manual payment(s) need verification. Check each in the actual receiving wallet before approving.`);
    }
  } catch (error) {
    byId("orderList").replaceChildren();
    const empty = document.createElement("div"); empty.className = "empty-state"; empty.textContent = `${error.code || "ERROR"}: ${error.message}`; byId("orderList").append(empty);
    report(`${error.code || "ERROR"}: ${error.message}`, true);
  } finally { byId("refreshOrders").disabled = false; }
}
async function reviewOrder(order, action, button) {
  if (action === "approve" && !window.confirm(`Only continue if you checked the actual MoMo wallet and confirmed GHS ${Number(order.amountGhs).toFixed(2)} reached the receiving account under transaction ${order.manualTransactionId}. Activate ${order.planTitle} for ${order.email}?`)) return;
  if (action === "reject" && !window.confirm(`Reject ${order.id}? No premium access will be granted.`)) return;
  button.disabled = true;
  const priorText = button.textContent; button.textContent = action === "approve" ? "Verifying…" : "Rejecting…";
  try {
    const result = await api(`/api/admin/orders/${encodeURIComponent(order.id)}/${action}`, { method: "POST", headers: {}, body: {} });
    report(result.message || `Order ${action} complete.`);
    await loadOrders();
  } catch (error) {
    report(`${error.code || "ERROR"}: ${error.message}`, true);
    button.disabled = false; button.textContent = priorText;
  }
}
byId("refreshOrders").addEventListener("click", loadOrders);
byId("copyUid").addEventListener("click", async () => {
  const uid = byId("adminUid").textContent;
  if (!uid || uid === "Sign in to display UID") return;
  try { await navigator.clipboard.writeText(uid); byId("copyUid").textContent = "Copied"; setTimeout(() => { byId("copyUid").textContent = "Copy UID"; }, 1200); }
  catch { report("Clipboard permission was blocked. Select the displayed UID and copy it manually.", true); }
});
onAuthStateChanged(auth, async (user) => {
  signedInUser = user;
  const state = byId("adminAuthState"); state.replaceChildren();
  const dot = document.createElement("i"); state.append(dot, document.createTextNode(user ? "Signed in" : "Not signed in"));
  if (!user) {
    byId("adminUid").textContent = "Sign in to display UID";
    report("Sign in to Code Academy with the authorized reviewer account. Then add that Firebase UID to ADMIN_UIDS on the backend host.", true);
    byId("orderList").replaceChildren();
    const note = document.createElement("div"); note.className = "empty-state"; note.textContent = "Sign-in required. Open the Code Academy login page first."; byId("orderList").append(note);
    return;
  }
  byId("adminUid").textContent = user.uid;
  report("Firebase account detected. Refreshing the sign-in token and checking reviewer access…");
  await loadOrders();
});
