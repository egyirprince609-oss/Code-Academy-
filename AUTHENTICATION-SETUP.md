# Code Academy authentication update

This build keeps the existing `authentication.js` entry point so the app's current HTML/JavaScript pages continue importing the same `auth`, `db`, and user-data helpers. The web app configuration in that single file matches the Firebase project supplied for Code Academy (`codeacademybywm`). `java_quiz.html` was changed to use that shared module instead of creating a second Firebase app.

## New / updated files

- `authentication.js` — shared Firebase Auth, Firestore, Storage and Realtime Database instances; email/password creation and login; Google sign-in; phone-number SMS verification; password policy checks; email verification link and refresh helpers; profile initialization; referral helpers; and backward-compatible exports used across the project.
- `signup.html` — email/password and phone/SMS signup options, password strength checklist, show/hide controls, confirm-password feedback, loading states, Google sign-in, and exact error code/message display.
- `login.html` — email/password and phone/SMS sign-in, show/hide password, remember-session option, Google sign-in, busy states and exact Firebase error display.
- `email-verification.html` — verification-link landing/status page with check-again and resend actions. `verify.html` remains the existing public certificate-verification page.
- `share-preview*.jpg` — 1200 × 630 Open Graph / X (Twitter) card images.
- `index.html`, `forgot.html` and `verify.html` — updated canonical/social metadata and valid local share-image URLs.

## Required Firebase Console configuration

1. In **Authentication → Sign-in method**, enable Email/Password, Phone, and Google if Google sign-in is wanted.
2. In **Authentication → Settings → Authorized domains**, add `egyirprince609-oss.github.io`. Firebase requires the continue URL's domain to be authorized for email verification. Use the exact domain on which the app is deployed.
3. In **Authentication → Settings → SMS region policy**, allow Ghana (and only the other regions your audience needs). Phone sign-in uses Firebase reCAPTCHA and SMS delivery; the code surfaces Firebase's exact error if a provider, domain, reCAPTCHA, quota or network issue blocks it.
4. Under **Authentication → Templates**, review the Email address verification message and sender configuration.
5. In **Authentication → Password policy**, set the server policy to match the visible UI: at least 8 characters, uppercase, lowercase and a non-alphanumeric character. The UI validates those four checks before submission, but Firebase's server-side policy remains authoritative.
6. Keep Firestore, Realtime Database and Storage rules in their own Firebase Console sections. JavaScript initialization does not deploy or relax any rules.

## Important compatibility/security notes

- Email/password accounts are sent to `email-verification.html` after the verification email is requested. If email sending fails after account creation, the page reports that the Auth account may already exist; use sign-in/resend instead of repeatedly trying to register the same email.
- Phone authentication uses an SMS one-time code, not an account password. Firebase's standard phone provider verifies possession of a phone number. A phone-authenticated token normally does **not** have `email_verified == true`; if the custom Firestore rules require `isVerified()` to mean email verified for publishing, adjust the rule deliberately to also permit phone-authenticated accounts where appropriate. Do not simply grant all writes.
- Existing user data continues under `users/{uid}` and nested user collections so current course, editor, note, game, notification, profile, certificate and progress pages retain the shared data path. The editor and other pages still need their own Firestore rules to allow their exact collection operations.
- Realtime Database and Firestore remain distinct databases. Exporting `rtdb` lets future app code use the same configured project, but it does not mirror Firestore documents or automatically store every action in both databases.
- Firebase web config values are client configuration, not server-side secrets. Security depends on carefully tested database and Storage rules. Client-side checks for XP, coins and certificates cannot prevent a determined user from manipulating values if the rules permit those writes.

## Validation scope

The bundle was checked locally for JavaScript syntax and broken references to exports from `authentication.js`. Live signup, SMS delivery, OAuth popup behavior, email sending, Firestore rule authorization and actual certificate/referral transactions require testing in the deployed Firebase project; these cannot be proven by static inspection alone.
