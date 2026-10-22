import { auth, db, doc, getDoc, onAuthStateChanged } from "./authentication.js";

const API_BASE = (document.querySelector('meta[name="payment-api-base"]')?.content || "").trim().replace(/\/+$/, "");
const byId = (id) => document.getElementById(id);
const checkoutOverlay = byId("checkoutOverlay");
const manualOverlay = byId("manualOverlay");
const checkoutError = byId("checkoutError");
const manualError = byId("manualError");
const continueButton = byId("continuePayment");
const submitReferenceButton = byId("submitReference");
const selectedMethodButtons = [...document.querySelectorAll("[data-method]")];
let signedInUser = null;
let apiConfig = null;
let selectedPlan = null;
let selectedMethod = "manual_momo";
let activeOrderId = null;
let activeOrderMode = null;
let pollHandle = null;
let apiReady = false;
let checkoutBusy = false;
let mtnPolling = false;

byId("year").textContent = String(new Date().getFullYear());

function setNotice(element, text, bad = true) {
  element.textContent = text;
  element.classList.remove("hidden", "bad");
  if (bad) element.classList.add("bad");
}
function hideNotice(element) { element.classList.add("hidden"); element.textContent = ""; }
function errorText(error) {
  const code = error?.code ? `${error.code}: ` : "";
  return `${code}${error?.message || "An unexpected error occurred."}`;
}
function formatGhs(value) {
  return `GH₵${Number(value || 0).toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function formatUsd(value) {
  return `$${Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}
function displayPhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.startsWith("233") && digits.length === 12) return `+233 ${digits.slice(3, 5)} ${digits.slice(5, 8)} ${digits.slice(8)}`;
  return value || "Not configured";
}
function getApiUrl(path) {
  if (!API_BASE) throw Object.assign(new Error("The secure payment API URL is not set. Deploy premium_api.py to an HTTPS Python host, then put that API base URL in premium.html's payment-api-base meta tag."), { code: "PAYMENT_API_URL_NOT_CONFIGURED" });
  return `${API_BASE}${path}`;
}
async function apiRequest(path, { method = "GET", body, needsAuth = true } = {}) {
  const headers = { "Accept": "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (needsAuth) {
    if (!signedInUser) throw Object.assign(new Error("Sign in to Code Academy before continuing."), { code: "AUTH_REQUIRED" });
    headers.Authorization = `Bearer ${await signedInUser.getIdToken()}`;
  }
  let response;
  try {
    response = await fetch(getApiUrl(path), { method, headers, body: body === undefined ? undefined : JSON.stringify(body), cache: "no-store" });
  } catch (cause) {
    throw Object.assign(new Error(`Could not reach the secure payment backend. Check the API URL, HTTPS deployment, CORS settings, and internet connection. ${cause?.message || ""}`.trim()), { code: "PAYMENT_API_UNREACHABLE" });
  }
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { error: { code: `HTTP_${response.status}`, message: text.slice(0, 400) || response.statusText } }; }
  if (!response.ok) {
    const payload = data?.error || {};
    throw Object.assign(new Error(payload.message || `Request failed with HTTP ${response.status}.`), { code: payload.code || `HTTP_${response.status}`, details: payload.details, status: response.status });
  }
  return data;
}

function planFromConfig(planId) {
  return apiConfig?.plans?.[planId] || null;
}
function updatePlanCards() {
  if (!apiConfig?.plans) return;
  document.querySelectorAll("[data-plan]").forEach((button) => {
    const plan = planFromConfig(button.dataset.plan);
    if (!plan) return;
    const card = button.closest(".plan-card");
    if (!card) return;
    const title = card.querySelector("h3");
    const usd = card.querySelector(".price-amount");
    const local = card.querySelector(".local-price");
    const caption = card.querySelector(".plan-caption");
    if (title) title.textContent = plan.title;
    if (usd) usd.textContent = Number(plan.usd).toLocaleString("en-US", { maximumFractionDigits: 2 });
    if (local) local.textContent = `Approx. ${formatGhs(plan.ghs)}`;
    if (caption) caption.textContent = plan.tagline || "Premium learning access";
  });
}
function setApiState(ready, label) {
  apiReady = ready;
  const state = byId("accountState");
  state.classList.toggle("ready", ready && !!signedInUser);
  state.innerHTML = "";
  const dot = document.createElement("i");
  state.append(dot, document.createTextNode(label));
  syncContinueButton();
}
function syncContinueButton() {
  const acknowledged = byId("nameAcknowledgement").checked;
  const phone = byId("payerPhone").value.trim().length > 0;
  continueButton.disabled = !apiReady || !signedInUser || !selectedPlan || !acknowledged || !phone || checkoutBusy || mtnPolling;
  if (checkoutBusy) continueButton.textContent = "Contacting secure server…";
  else if (mtnPolling) continueButton.textContent = "MTN transaction pending…";
  else if (!apiReady) continueButton.innerHTML = 'Connect secure backend first <span>→</span>';
  else if (!signedInUser) continueButton.innerHTML = 'Sign in to continue <span>→</span>';
  else continueButton.innerHTML = 'Continue securely <span>→</span>';
}
async function refreshConfig() {
  if (!API_BASE) {
    setApiState(false, "Payment server not connected");
    showPremiumStatus("The premium page is ready, but secure checkout is not yet connected. Set the backend URL after deploying premium_api.py. Do not transfer money until checkout has been enabled.");
    return;
  }
  try {
    const config = await apiRequest("/api/config", { needsAuth: false });
    apiConfig = config;
    updatePlanCards();
    byId("mtnAutoOption").classList.toggle("hidden", !config.automaticMtnMomoEnabled);
    byId("recipientPhoneText").textContent = displayPhone(config.manualRecipientPhone);
    byId("recipientNameText").textContent = config.manualRecipientName || "Not configured";
    setApiState(true, signedInUser ? "Secure backend connected" : "Sign in to upgrade");
    const note = document.querySelector(".rate-note");
    if (note && config.rateDisclaimer) note.textContent = config.rateDisclaimer;
    if (config.automaticMtnMomoEnabled) {
      showPremiumStatus("Automatic MTN MoMo requests are configured. Provider approval and server-side status verification are required before activation.");
    }
  } catch (error) {
    setApiState(false, "Payment backend unavailable");
    showPremiumStatus(`Secure checkout is not available: ${errorText(error)} Do not transfer money until this is resolved.`);
  }
}
function showPremiumStatus(message) {
  const el = byId("premiumStatus");
  el.textContent = message;
  el.classList.remove("hidden");
}
function openCheckout(planId) {
  if (!signedInUser) {
    const next = encodeURIComponent("premium.html");
    window.location.href = `./home.html?intent=login&return=${next}`;
    return;
  }
  selectedPlan = planFromConfig(planId) || fallbackPlan(planId);
  if (!selectedPlan) {
    showPremiumStatus("That plan is not available from the payment backend.");
    return;
  }
  hideNotice(checkoutError);
  byId("checkoutResult").classList.add("hidden");
  byId("checkMtnStatus").classList.add("hidden");
  byId("checkoutResult").textContent = "";
  byId("selectedPlanSummary").replaceChildren();
  const title = document.createElement("strong");
  title.textContent = selectedPlan.title;
  const price = document.createElement("span");
  price.textContent = `${formatUsd(selectedPlan.usd)} · ${formatGhs(selectedPlan.ghs)}`;
  byId("selectedPlanSummary").append(title, price);
  selectedMethod = "manual_momo";
  selectedMethodButtons.forEach((button) => {
    if (!button.classList.contains("unavailable")) button.classList.toggle("selected", button.dataset.method === selectedMethod);
  });
  byId("nameAcknowledgement").checked = false;
  byId("payerPhone").value = "";
  checkoutOverlay.classList.remove("hidden");
  document.body.style.overflow = "hidden";
  syncContinueButton();
}
function fallbackPlan(planId) {
  const plans = {
    monthly: { id: "monthly", title: "1 Month Premium", days: 30, usd: 2, ghs: 20 },
    yearly: { id: "yearly", title: "1 Year Premium", days: 365, usd: 18, ghs: 180 },
    three_years: { id: "three_years", title: "3 Years Premium", days: 1095, usd: 45, ghs: 450 },
    four_years: { id: "four_years", title: "4 Years Premium", days: 1460, usd: 55, ghs: 550 },
  };
  return plans[planId] || null;
}
function closeOverlay(overlay) {
  overlay.classList.add("hidden");
  if (checkoutOverlay.classList.contains("hidden") && manualOverlay.classList.contains("hidden")) document.body.style.overflow = "";
}
function openManual(order, instructions) {
  activeOrderId = order.id;
  activeOrderMode = "manual_momo";
  byId("recipientPhoneText").textContent = displayPhone(instructions.recipientPhone || apiConfig?.manualRecipientPhone);
  byId("recipientNameText").textContent = instructions.recipientName || apiConfig?.manualRecipientName || "Not configured";
  byId("recipientAmountText").textContent = formatGhs(instructions.amountGhs);
  byId("orderReferenceText").textContent = instructions.reference || order.id;
  byId("transactionId").value = "";
  byId("submitReference").disabled = false;
  byId("submitReference").classList.remove("hidden");
  byId("checkOrderStatus").classList.add("hidden");
  byId("manualStatus").classList.add("hidden");
  hideNotice(manualError);
  closeOverlay(checkoutOverlay);
  manualOverlay.classList.remove("hidden");
  document.body.style.overflow = "hidden";
}
function setStatusContent(element, message, bad = false) {
  element.textContent = message;
  element.classList.remove("hidden", "bad");
  if (bad) element.classList.add("bad");
}
async function checkOrderStatus() {
  if (!activeOrderId) return;
  try {
    const data = await apiRequest(`/api/orders/${encodeURIComponent(activeOrderId)}`);
    const order = data.order;
    if (order.status === "paid") {
      setStatusContent(byId("manualStatus"), `Payment verified. Premium is active until ${order.expiresAt ? new Date(order.expiresAt).toLocaleDateString() : "the recorded expiry date"}.`, false);
      byId("checkOrderStatus").classList.add("hidden");
      showPremiumStatus("Premium is active on your signed-in Code Academy account. Access is recorded in the server-controlled subscription record.");
      return "paid";
    }
    if (order.status === "failed" || order.status === "rejected") {
      const err = [order.errorCode, order.errorMessage].filter(Boolean).join(": ") || `Order status: ${order.status}`;
      setStatusContent(byId("manualStatus"), err, true);
      byId("checkOrderStatus").classList.remove("hidden");
      return order.status;
    }
    if (order.status === "review_required") {
      setStatusContent(byId("manualStatus"), "Your reference has been received. Payment is awaiting verification in the recipient's actual wallet. Premium is not active yet.", false);
      byId("checkOrderStatus").classList.remove("hidden");
      return "review_required";
    }
    if (order.status === "pending") {
      setStatusContent(byId("manualStatus"), `MTN status: ${order.providerStatus || "PENDING"}. Approve or reject only in your official MoMo client; this page is checking the provider's status.`, false);
      byId("checkOrderStatus").classList.remove("hidden");
      return "pending";
    }
    setStatusContent(byId("manualStatus"), `Order status: ${order.status}. If this is a manual transfer, submit the actual transaction reference.`, false);
    byId("checkOrderStatus").classList.remove("hidden");
    return order.status;
  } catch (error) {
    setStatusContent(byId("manualStatus"), errorText(error), true);
    return "error";
  }
}
async function startMtnPolling() {
  setStatusContent(byId("checkoutResult"), "Payment request submitted. Approve it in your official MTN MoMo app or provider prompt. Waiting for server-verified status…", false);
  byId("checkoutResult").classList.remove("bad");
  let attempts = 0;
  mtnPolling = true;
  syncContinueButton();
  if (pollHandle) clearTimeout(pollHandle);
  const poll = async () => {
    attempts += 1;
    try {
      const result = await apiRequest(`/api/orders/${encodeURIComponent(activeOrderId)}`);
      const order = result.order;
      if (order.status === "paid") {
        setStatusContent(byId("checkoutResult"), `Payment verified by MTN. Premium is active${order.expiresAt ? ` until ${new Date(order.expiresAt).toLocaleDateString()}` : ""}.`, false);
        showPremiumStatus("Your MTN payment was verified by the backend and premium access is now active on your account.");
        mtnPolling = false; syncContinueButton();
        return;
      }
      if (order.status === "failed" || order.status === "rejected" || order.status === "review_required") {
        const message = [order.errorCode, order.errorMessage].filter(Boolean).join(": ") || `MTN transaction status: ${order.providerStatus || order.status}`;
        setStatusContent(byId("checkoutResult"), message, true);
        mtnPolling = false; syncContinueButton();
        return;
      }
      if (attempts >= 36) {
        setStatusContent(byId("checkoutResult"), "The payment is still pending. Do not approve a second payment request. Close this dialog and use the order status check later, or contact support with your order ID.", false);
        byId("checkMtnStatus").classList.remove("hidden");
        mtnPolling = false; syncContinueButton();
        return;
      }
    } catch (error) {
      setStatusContent(byId("checkoutResult"), errorText(error), true);
      if (attempts >= 3) { mtnPolling = false; syncContinueButton(); return; }
    }
    pollHandle = setTimeout(poll, 5000);
  };
  pollHandle = setTimeout(poll, 3000);
}

async function continueCheckout() {
  hideNotice(checkoutError);
  if (!apiReady) {
    setNotice(checkoutError, "The secure backend is not ready. Do not transfer money yet.");
    return;
  }
  if (!signedInUser) {
    window.location.href = "./home.html?intent=login";
    return;
  }
  const payerPhone = byId("payerPhone").value.trim();
  if (!payerPhone) return setNotice(checkoutError, "Enter the mobile number that will pay for this order.");
  if (!byId("nameAcknowledgement").checked) return setNotice(checkoutError, "Confirm that you will verify the recipient name shown by your wallet before transferring money.");
  if (!selectedPlan) return setNotice(checkoutError, "Choose a plan before continuing.");
  checkoutBusy = true;
  syncContinueButton();
  try {
    const response = await apiRequest("/api/orders", {
      method: "POST",
      body: { planId: selectedPlan.id || selectedPlan.planId, method: selectedMethod, payerPhone },
    });
    activeOrderId = response.order.id;
    activeOrderMode = selectedMethod;
    if (selectedMethod === "manual_momo") {
      checkoutBusy = false;
      openManual(response.order, response.paymentInstructions);
    } else {
      byId("checkoutResult").classList.remove("hidden", "bad");
      byId("checkoutResult").textContent = `${response.message || "MTN payment request submitted."} Order ID: ${activeOrderId}`;
      byId("checkMtnStatus").classList.remove("hidden");
      startMtnPolling();
    }
  } catch (error) {
    if (error.code === "MTN_PAYMENT_ALREADY_PENDING" && error.details?.orderId) {
      activeOrderId = error.details.orderId;
      selectedMethod = "mtn_momo";
      closeOverlay(checkoutOverlay);
      checkoutOverlay.classList.remove("hidden");
      byId("checkoutResult").classList.remove("hidden", "bad");
      byId("checkoutResult").textContent = `${error.message} Resuming order ${activeOrderId}.`;
      byId("checkMtnStatus").classList.remove("hidden");
      startMtnPolling();
    } else {
      setNotice(checkoutError, errorText(error));
    }
  } finally {
    checkoutBusy = false;
    syncContinueButton();
  }
}

async function submitManualReference() {
  hideNotice(manualError);
  const transactionId = byId("transactionId").value.trim();
  const payerPhone = byId("payerPhone").value.trim();
  if (!activeOrderId) return setNotice(manualError, "No active order was found. Start again from a plan card.");
  if (!/^[A-Za-z0-9._/-]{4,100}$/.test(transactionId)) return setNotice(manualError, "Enter the real provider transaction ID/reference from the receipt or SMS. Do not enter a PIN or OTP.");
  submitReferenceButton.disabled = true;
  submitReferenceButton.textContent = "Submitting reference…";
  try {
    const response = await apiRequest(`/api/orders/${encodeURIComponent(activeOrderId)}/proof`, { method: "POST", body: { transactionId, payerPhone } });
    setStatusContent(byId("manualStatus"), response.message || "Submitted for review. Premium is not active yet.", false);
    submitReferenceButton.classList.add("hidden");
    byId("checkOrderStatus").classList.remove("hidden");
  } catch (error) {
    setNotice(manualError, errorText(error));
  } finally {
    submitReferenceButton.disabled = false;
    submitReferenceButton.innerHTML = 'Submit for verification <span>→</span>';
  }
}

async function loadAccountStatus(user) {
  if (!user || !API_BASE) return;
  try {
    const result = await apiRequest("/api/me");
    if (result.premium) {
      const expiry = result.expiresAt ? new Date(result.expiresAt).toLocaleDateString() : "your recorded expiry date";
      showPremiumStatus(`Premium active${result.planName ? ` — ${result.planName}` : ""}. Access expires ${expiry}.`);
    } else {
      showPremiumStatus("You are signed in with a free account. Choose a premium plan below to upgrade.");
    }
  } catch (error) {
    showPremiumStatus(`Signed in, but premium status could not be checked by the secure backend: ${errorText(error)}`);
  }
}

// Bind controls once; no card details or wallet PIN are collected by this page.
document.querySelectorAll("[data-plan]").forEach((button) => button.addEventListener("click", () => openCheckout(button.dataset.plan)));
selectedMethodButtons.forEach((button) => button.addEventListener("click", () => {
  if (button.classList.contains("unavailable") || button.classList.contains("hidden")) return;
  selectedMethod = button.dataset.method;
  selectedMethodButtons.forEach((item) => {
    if (!item.classList.contains("unavailable")) item.classList.toggle("selected", item.dataset.method === selectedMethod);
  });
  syncContinueButton();
}));
byId("nameAcknowledgement").addEventListener("change", syncContinueButton);
byId("payerPhone").addEventListener("input", syncContinueButton);
continueButton.addEventListener("click", continueCheckout);
submitReferenceButton.addEventListener("click", submitManualReference);
byId("closeCheckout").addEventListener("click", () => closeOverlay(checkoutOverlay));
byId("closeManual").addEventListener("click", () => closeOverlay(manualOverlay));
byId("checkOrderStatus").addEventListener("click", checkOrderStatus);
byId("checkMtnStatus").addEventListener("click", async () => {
  byId("checkMtnStatus").disabled = true;
  try {
    const result = await apiRequest(`/api/orders/${encodeURIComponent(activeOrderId)}`);
    if (result.order.status === "paid") {
      setStatusContent(byId("checkoutResult"), `Payment verified by MTN. Premium is active${result.order.expiresAt ? ` until ${new Date(result.order.expiresAt).toLocaleDateString()}` : ""}.`, false);
      showPremiumStatus("Your MTN payment was verified by the backend and premium access is now active on your account.");
      mtnPolling = false;
    } else if (result.order.status === "failed" || result.order.status === "review_required") {
      setStatusContent(byId("checkoutResult"), [result.order.errorCode, result.order.errorMessage].filter(Boolean).join(": ") || `MTN status: ${result.order.providerStatus || result.order.status}`, true);
      mtnPolling = false;
    } else {
      setStatusContent(byId("checkoutResult"), `MTN transaction status: ${result.order.providerStatus || result.order.status}.`, false);
      mtnPolling = result.order.status === "pending";
    }
    syncContinueButton();
  } catch (error) { setStatusContent(byId("checkoutResult"), errorText(error), true); }
  finally { byId("checkMtnStatus").disabled = false; }
});
byId("copyRecipient").addEventListener("click", () => copyText(apiConfig?.manualRecipientPhone || byId("recipientPhoneText").textContent, byId("copyRecipient")));
byId("copyReference").addEventListener("click", () => copyText(byId("orderReferenceText").textContent, byId("copyReference")));
[checkoutOverlay, manualOverlay].forEach((overlay) => overlay.addEventListener("click", (event) => { if (event.target === overlay) closeOverlay(overlay); }));
document.addEventListener("keydown", (event) => { if (event.key === "Escape") { closeOverlay(checkoutOverlay); closeOverlay(manualOverlay); } });
async function copyText(value, button) {
  try {
    await navigator.clipboard.writeText(String(value || ""));
    const old = button.textContent;
    button.textContent = "Copied";
    setTimeout(() => { button.textContent = old; }, 1200);
  } catch {
    setNotice(manualError, "Copy is not available in this browser. Press and hold the displayed value to copy it.");
  }
}

onAuthStateChanged(auth, async (user) => {
  signedInUser = user;
  if (user) {
    setApiState(apiReady, "Signed in");
    await loadAccountStatus(user);
  } else {
    setApiState(apiReady, "Not signed in");
    showPremiumStatus("Sign in to your Code Academy account before starting a premium purchase. Payment status is linked to that account.");
  }
});
refreshConfig();
