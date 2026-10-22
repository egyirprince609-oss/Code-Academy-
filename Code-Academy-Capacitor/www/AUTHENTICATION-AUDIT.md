# Code Academy — Authentication Audit and Update Notes

## What was inspected

The audit covered the shared `authentication.js` module and the authentication/data-flow portions of `index.html`, `home.html`, `menu.html`, `signup.html`, `login.html`, `forgot.html`, `email-action.html`, `verify.html`, `certificate_setup.html`, `certificate_view.html`, `certificate.html`, `CODEEDITOR.html`, `project.html`, `profile.html`, `progress.html`, `lesson.html`, `community.html`, and `notification-engine.js`.

The requested filename `projects.html` is not present in the uploaded project. The existing project-management page is `project.html`; this page and the code editor were inspected instead. `verify.html` is the public certificate-verification page, so it was not repurposed for account email verification.

## Main issues found and addressed

1. **Signup had a broken import.** The original signup page imported `referral-engine.js`, but that file was absent from the repository. The signup page now uses the referral helpers already exported by `authentication.js`.
2. **Authentication logic was duplicated.** Signup, login, and Google sign-in now use the shared auth module rather than separate Firebase account-creation logic.
3. **Email verification was missing from the normal email/password signup flow.** Signup now asks Firebase Authentication to send its genuine one-time verification link. Unverified password accounts are routed to the verification screen instead of the learning dashboard.
4. **Google sign-in fallback was incomplete.** Signup and login try Google's popup first. If the browser blocks or does not support it, the page displays a bottom-anchored fallback panel with a retry action and a full-page redirect option. The actual placement of Google's native account chooser is controlled by Google/the browser; the app can control its own fallback panel, not Google's native window.
5. **Raw Firebase errors could reach learners.** Signup, login, verification, and reset views now translate common Firebase error codes into plain-language messages. Raw details are reserved for the browser console for troubleshooting.
6. **Password reset needed a matching custom action route.** A new `email-action.html` handles Firebase's `resetPassword`, `verifyEmail`, and `recoverEmail` action modes. It validates one-time action codes with Firebase before applying them.
7. **Verification gates were inconsistent.** The splash router, dashboard, lesson, progress, profile, project/editor, and certificate-related account pages now refresh the Firebase user state and route unverified email/password accounts to `email-action.html?pending=1`. Google accounts are not required to verify again through the password-provider flow.
8. **Course progress stored mixed formats.** Existing records may contain numeric progress, while the current lesson and profile pages read objects such as `{ "completed": 3 }`. The shared `updateProgress()` helper now reads old numeric or object values and writes the modern object shape without replacing other courses' progress.
9. **Shared user data was preserved.** The auth profile helper still uses `users/{uid}` and does not replace an existing learner document wholesale. The dashboard's notification listener continues to read `users/{uid}/notifications`, which is also the location used by the notification/lesson flow.

## Email verification and branding: important platform limitation

A front-end JavaScript file cannot securely invent an independent verification URL, email that URL, and make Firebase mark `emailVerified = true`. Firebase must generate and validate the one-time verification action code. The updated code uses Firebase's secure link flow.

You do **not** need to upgrade to Blaze solely to send the standard Firebase verification and password-reset emails. Firebase currently documents Spark limits of 1,000 address-verification emails/day and 150 password-reset emails/day; quotas and abuse protections can change. See [Firebase Authentication limits](https://firebase.google.com/docs/auth/limits).

The new `email-action.html` displays Code Academy branding and the app logo on the page opened from the email link. Firebase's default email template itself is managed in the Firebase Console. A custom HTML email containing the logo requires a trusted server/email provider that keeps its private credentials off the web page; those credentials must not be embedded in `authentication.js`.

## Required Firebase Console setup before publishing

1. Open **Firebase Console → Authentication → Settings → Authorized domains** and ensure `egyirprince609-oss.github.io` is listed.
2. Open **Authentication → Sign-in method** and ensure **Email/Password** and **Google** are enabled. Configure Google's provider/OAuth details if the console requests them. Yahoo sign-in remains in the code only for continuity; its provider must also be enabled to use it.
3. Open **Authentication → Templates**. For the email verification and password reset templates, choose **Customize action URL** and set the handler URL to:
   `https://egyirprince609-oss.github.io/Code-Academy-/email-action.html`
   Firebase adds parameters such as `mode` and `oobCode` to the email action URL. The handler supports verification and reset links. Firebase's official custom-handler guide describes this setup: [Create custom email action handlers](https://firebase.google.com/docs/auth/custom-email-handler).
4. Publish the updated files to the same GitHub Pages repository. Check that `authentication.js`, `signup.html`, `login.html`, and `email-action.html` all deploy together.
5. Test with a new email/password account: submit signup → receive Firebase's verification email → open the link in the same browser → confirm it returns to the dashboard. Also test a link opened in another browser; it should ask the learner to log in rather than treating a UID in the URL as proof of login.
6. Test password reset from `forgot.html` / the login page and confirm the reset email opens `email-action.html`, accepts a new password, and returns to login.
7. Test Google sign-in with popup allowed and blocked, including the full-page redirect option on the phone browser you use.

## Security item still requiring backend work

The existing referral reward implementation writes rewards to both the new user's and another user's Firestore documents from browser code. Whether this succeeds depends on the Firestore Security Rules, and if the rules allow untrusted clients to award themselves or other users XP/coins, rewards can be manipulated. Do **not** loosen rules to make referrals work. For production, award referral rewards in a trusted backend/Cloud Function or a similarly protected service, with server-side checks and idempotency.

The browser-side code was reviewed and syntax-checked, but this environment cannot sign into your live Firebase project, send test emails, validate your live Security Rules, or confirm the deployed OAuth settings. Those live integration steps still need to be tested against the Firebase Console configuration above.
