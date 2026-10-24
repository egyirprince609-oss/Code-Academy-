import {
  auth, onAuthStateChanged, createBrowserAccount, signInBrowserEmail,
  signInBrowserGoogle, requestBrowserPasswordReset, checkPasswordResetCode,
  finishPasswordReset, sendBrowserPhoneCode, finishBrowserPhoneSignIn,
  clearPhoneVerifier, ensureBrowserProfile, errorText
} from './browser-auth.js';

const $ = id => document.getElementById(id);
const page = document.body.dataset.page || 'login';
const messageBox = $('authMessage');
let busy = false;
let mode = 'email';
let smsConfirmation = null;
let phoneCodeSent = false;
let resetCode = '';

function showMessage(kind, title, detail = '') {
  if (!messageBox) return;
  messageBox.className = `auth-message show ${kind}`;
  messageBox.textContent = `${title}${detail ? `\n${detail}` : ''}`;
}
function clearMessage() { if (messageBox) { messageBox.className = 'auth-message'; messageBox.textContent = ''; } }
function exactError(error, context) {
  const details = errorText(error);
  console.error(`[Code Academy Browser] ${context}: ${details}`, error);
  showMessage('error', context, details);
}
function busyState(value, button, label) {
  busy = value;
  document.querySelectorAll('button').forEach(item => {
    if (item.dataset.busyExempt === 'true') return;
    item.disabled = value;
  });
  if (button) {
    if (value) { button.dataset.originalLabel = button.textContent; button.textContent = label || 'Please wait…'; button.setAttribute('aria-busy', 'true'); }
    else { button.textContent = button.dataset.originalLabel || button.textContent; delete button.dataset.originalLabel; button.removeAttribute('aria-busy'); }
  }
}
function setMode(next) {
  mode = next === 'phone' ? 'phone' : 'email';
  document.querySelectorAll('[data-auth-mode]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.authMode === mode)));
  if ($('emailAuthForm')) $('emailAuthForm').hidden = mode !== 'email';
  if ($('phoneAuthForm')) $('phoneAuthForm').hidden = mode !== 'phone';
  if (mode !== 'phone') { clearPhoneVerifier(); smsConfirmation = null; phoneCodeSent = false; }
  clearMessage();
}
function nextAfterAuth() {
  const params = new URLSearchParams(location.search);
  const next = params.get('next') || 'index.html';
  const safePages = new Set(['index.html', 'browser.html', 'browser-settings.html', 'browser-profile.html', 'onboarding.html']);
  const safe = safePages.has(next) ? next : 'index.html';
  location.replace(safe === 'index.html' ? './index.html?welcome=1' : `./${safe}`);
}

const initialParams = new URLSearchParams(location.search);
if (page === 'login' && initialParams.get('verified') === '1') {
  showMessage('success', 'Email verification finished.', 'Your browser sign-in page is ready. Sign in with the verified email address.');
}

function passwordIsStrong(password) {
  const checks = {
    length: password.length >= 8,
    upper: /[A-Z]/.test(password),
    lower: /[a-z]/.test(password),
    special: /[0-9]|[^A-Za-z0-9]/.test(password)
  };
  Object.entries(checks).forEach(([key, good]) => {
    const element = document.querySelector(`[data-check="${key}"]`);
    if (element) element.classList.toggle('ok', good);
  });
  return Object.values(checks).every(Boolean);
}

for (const button of document.querySelectorAll('[data-auth-mode]')) button.addEventListener('click', () => setMode(button.dataset.authMode));
if ($('password')) $('password').addEventListener('input', () => passwordIsStrong($('password').value));

const googleButton = $('googleSignInButton');
if (googleButton) googleButton.addEventListener('click', async () => {
  if (busy) return;
  clearMessage(); busyState(true, googleButton, 'Connecting to Google…');
  try {
    const result = await signInBrowserGoogle();
    if (result?.redirected) return;
    if (result?.profileSyncError) showMessage('info', 'Signed in, but the browser profile could not sync.', errorText(result.profileSyncError));
    else showMessage('success', 'Google sign-in complete.', 'Opening your browser workspace…');
    setTimeout(nextAfterAuth, 350);
  } catch (error) { exactError(error, 'Google sign-in failed'); }
  finally { busyState(false, googleButton); }
});

if (page === 'signup') {
  const form = $('emailAuthForm');
  form?.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy) return;
    clearMessage();
    const displayName = $('displayName')?.value.trim() || '';
    const email = $('email')?.value.trim() || '';
    const password = $('password')?.value || '';
    const confirmPassword = $('confirmPassword')?.value || '';
    if (!displayName) return showMessage('error', 'Full name required.', 'Enter the name you want to use for your browser profile.');
    if (!passwordIsStrong(password)) return showMessage('error', 'Choose a stronger password.', 'Use at least 8 characters, an uppercase letter, a lowercase letter, and a number or symbol.');
    if (password !== confirmPassword) return showMessage('error', 'Passwords do not match.', 'Enter the same password in both password fields.');
    if (!$('termsCheck')?.checked) return showMessage('error', 'Please confirm.', 'Tick the account-responsibility checkbox to continue.');
    const button = $('createAccountButton'); busyState(true, button, 'Creating your account…');
    try {
      const result = await createBrowserAccount({ displayName, email, password });
      const warnings = [];
      if (result.profileSyncError) warnings.push(`Profile cloud sync failed: ${errorText(result.profileSyncError)}`);
      if (result.verificationError) warnings.push(`Verification email could not be sent: ${errorText(result.verificationError)}`);
      if (warnings.length) showMessage('info', 'Your Firebase account was created successfully, but there are follow-up issues.', warnings.join('\n'));
      else showMessage('success', 'Your browser account was created.', 'A verification message was requested. Opening your browser setup…');
      setTimeout(nextAfterAuth, 650);
    } catch (error) { exactError(error, 'Account creation failed'); }
    finally { busyState(false, button); }
  });
}

if (page === 'login') {
  $('emailAuthForm')?.addEventListener('submit', async event => {
    event.preventDefault(); if (busy) return; clearMessage();
    const button = $('signInButton'); busyState(true, button, 'Checking your credentials…');
    try {
      const result = await signInBrowserEmail($('email')?.value, $('password')?.value, $('rememberMe')?.checked !== false);
      if (result.profileSyncError) showMessage('info', 'Signed in, but your browser profile did not synchronize.', errorText(result.profileSyncError));
      else showMessage('success', 'Sign-in successful.', 'Restoring your browser workspace…');
      setTimeout(nextAfterAuth, 500);
    } catch (error) { exactError(error, 'Sign-in failed'); }
    finally { busyState(false, button); }
  });
}

if (page === 'login' || page === 'signup') {
  $('sendPhoneCodeButton')?.addEventListener('click', async () => {
    if (busy) return; clearMessage();
    if (page === 'signup' && !$('phoneDisplayName')?.value.trim()) return showMessage('error', 'Name required.', 'Enter your full name before requesting a code.');
    const button = $('sendPhoneCodeButton'); busyState(true, button, 'Preparing secure SMS…');
    try {
      smsConfirmation = await sendBrowserPhoneCode($('phone')?.value, 'recaptcha-container');
      phoneCodeSent = true;
      $('smsCodeField').hidden = false;
      $('smsCode').required = true;
      $('phone').readOnly = true;
      $('sendPhoneCodeButton').hidden = true;
      $('verifyPhoneButton').hidden = false;
      showMessage('success', 'Verification code sent.', 'Enter the six-digit code from the SMS message. If no message arrives, verify the phone provider and SMS quota in Firebase.');
    } catch (error) { exactError(error, 'Could not send the SMS verification code'); }
    finally { busyState(false, button); if (phoneCodeSent) $('sendPhoneCodeButton').hidden = true; }
  });
  $('verifyPhoneButton')?.addEventListener('click', async () => {
    if (busy) return; clearMessage();
    const button = $('verifyPhoneButton'); busyState(true, button, 'Verifying code…');
    try {
      const result = await finishBrowserPhoneSignIn(smsConfirmation, $('smsCode')?.value, page === 'signup' ? $('phoneDisplayName')?.value.trim() : '');
      if (result.profileSyncError) showMessage('info', 'Phone verified; cloud profile sync failed.', errorText(result.profileSyncError));
      else showMessage('success', 'Phone verified.', 'Opening your browser workspace…');
      setTimeout(nextAfterAuth, 450);
    } catch (error) { exactError(error, 'Phone verification failed'); }
    finally { busyState(false, button); }
  });
}

if (page === 'forgot') {
  $('forgotForm')?.addEventListener('submit', async event => {
    event.preventDefault(); if (busy) return; clearMessage();
    const button = $('sendResetButton'); busyState(true, button, 'Requesting reset link…');
    try {
      await requestBrowserPasswordReset($('email')?.value);
      showMessage('success', 'Password-reset request accepted.', 'Check your inbox and spam folder. If your Firebase project uses a custom action handler, set its Password reset email action URL to this browser folder’s reset-password.html page.');
      $('forgotForm').reset();
    } catch (error) { exactError(error, 'Password-reset request failed'); }
    finally { busyState(false, button); }
  });
}

if (page === 'reset') {
  const params = new URLSearchParams(location.search);
  resetCode = params.get('oobCode') || '';
  const actionMode = params.get('mode') || '';
  if (!resetCode || (actionMode && actionMode !== 'resetPassword')) {
    showMessage('error', 'Password-reset action code missing.', 'Open the complete password reset link sent by Firebase. If Firebase opens its hosted action page instead, finish the reset there or configure the Firebase email template to use this custom reset page.');
    if ($('resetForm')) $('resetForm').hidden = true;
  } else {
    checkPasswordResetCode(resetCode).then(email => {
      $('resetIntro').textContent = `Choose a new password for ${email}.`;
    }).catch(error => {
      exactError(error, 'Password-reset link could not be verified');
      if ($('resetForm')) $('resetForm').hidden = true;
    });
    $('resetForm')?.addEventListener('submit', async event => {
      event.preventDefault(); if (busy) return; clearMessage();
      const password = $('password')?.value || '';
      if (password.length < 8) return showMessage('error', 'Password is too short.', 'Use at least 8 characters.');
      if (password !== ($('confirmPassword')?.value || '')) return showMessage('error', 'Passwords do not match.', 'Enter the same password in both fields.');
      const button = $('finishResetButton'); busyState(true, button, 'Updating password…');
      try {
        await finishPasswordReset(resetCode, password);
        showMessage('success', 'Password updated successfully.', 'Your password has been changed. Return to sign in with the new password.');
        $('resetForm').hidden = true;
      } catch (error) { exactError(error, 'Password could not be updated'); }
      finally { busyState(false, button); }
    });
  }
}

// Resolve auth redirects after Google returns to this page. Only the page flow
// decides where to navigate; there is no caller-controlled external redirect.
try {
  const { consumeGoogleRedirect } = await import('./browser-auth.js');
  await consumeGoogleRedirect();
} catch (error) {
  if (error?.code && error.code !== 'auth/redirect-cancelled-by-user') exactError(error, 'Google sign-in return failed');
}
if ((page === 'login' || page === 'signup') && !new URLSearchParams(location.search).has('stay')) {
  onAuthStateChanged(auth, user => {
    if (user && !busy) {
      // Wait for a direct user action on sign-up pages; login pages with an
      // existing session are allowed to resume the browser workspace.
      if (page === 'login') nextAfterAuth();
    }
  }, error => exactError(error, 'Could not read sign-in state'));
}
window.addEventListener('pagehide', clearPhoneVerifier);
