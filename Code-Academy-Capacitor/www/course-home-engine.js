import { auth, db, onAuthStateChanged, getDoc, doc } from "./authentication.js";

const CATALOG = {"html":{"name":"HTML","count":10,"topics":["Introduction to HTML","HTML Text and Headings","Links and Navigation","Images and Multimedia","Lists and Tables","HTML Forms and User Input","Semantic HTML and Professional Page Structure","Professional HTML: Metadata, SEO and Optimization","HTML Professional Capstone: Build a Complete Website","HTML Mastery Challenge"],"description":"Learn the structure of websites and build pages from the ground up.","level":"Beginner"},"css":{"name":"CSS","count":10,"topics":["Introduction to CSS","CSS Selectors","Colors, Backgrounds and Borders","CSS Box Model","Typography and Text Styling","CSS Flexbox","CSS Grid","Responsive Web Design","Animations and Transitions","Build a Complete CSS Website"],"description":"Master styling, layouts, responsive design, animations and modern UI.","level":"Beginner"},"javascript":{"name":"JavaScript","count":10,"topics":["Introduction to JavaScript","Variables and Data Types","Operators and Expressions","Conditions and Decision Making","Loops and Repetition","Functions","Arrays and Objects","DOM Manipulation","Events and Modern JavaScript","Capstone: Build Complete JavaScript Website"],"description":"Learn programming logic and create interactive websites and applications.","level":"Beginner"},"python":{"name":"Python","count":10,"topics":["Python Program Structure and Output","Variables, Constants and Types","Operators and Expressions","Conditions and Boolean Logic","Loops and Iteration","Lists, Tuples and Dictionaries","Functions, Parameters and Return Values","Modules and File Handling","Exceptions and Defensive Programming","Classes and a Practical Mini-Project"],"description":"Learn Python for automation, software development, data and AI.","level":"Beginner"},"react":{"name":"React Development","count":10,"topics":["Introduction to React - The Complete Guide","JSX and Components","Props and Component Communication","State and User Interaction","React Hooks","Forms and Events","Lists, Keys and Conditional Rendering","Styling in React","Advanced Patterns & Routing","Build Complete React Application"],"description":"Build modern component-based interfaces with the React ecosystem.","level":"Intermediate"},"java":{"name":"Java","count":10,"topics":["Java Program Structure and Output","Variables, Primitive Types and Strings","Operators and Expressions","Conditions and Boolean Logic","Loops and Iteration","Arrays and Collections","Methods, Parameters and Return Values","Classes, Objects and Encapsulation","Inheritance, Interfaces and Exceptions","Build a Small Java Progress Tracker"],"description":"Learn object-oriented programming and build powerful Java applications.","level":"Beginner"},"c":{"name":"C Programming","count":10,"topics":["C Program Structure and Output","Variables, Types and Input/Output","Operators and Expressions","Conditions and Boolean Logic","Loops and Iteration","Arrays and Strings","Functions and Parameter Passing","Pointers and Structures","Memory Safety and File Errors","Build a Small C Score Tracker"],"description":"Understand programming fundamentals and low-level computer concepts.","level":"Beginner"},"cplusplus":{"name":"C++ Programming","count":10,"topics":["C++ Program Structure and Output","Types, Variables and References","Operators and Expressions","Conditions and Boolean Logic","Loops and Iteration","Arrays, Strings and Vectors","Functions and Overloading","Classes, Objects and Encapsulation","Inheritance, Templates and Exceptions","Build a C++ Course Progress Tracker"],"description":"Learn powerful object-oriented and systems programming with C++.","level":"Intermediate"},"csharp":{"name":"C# Development","count":10,"topics":["C# Program Structure and Output","Variables, Types and Type Inference","Operators and Expressions","Conditions and Boolean Logic","Loops and Iteration","Arrays, Lists and Dictionaries","Methods and Parameters","Classes, Properties and Encapsulation","Interfaces, Exceptions and LINQ Concepts","Build a Small C# Progress Tracker"],"description":"Learn C# for applications, software development and game development.","level":"Beginner"},"php":{"name":"PHP Development","count":10,"topics":["PHP Syntax and Server-Side Output","Variables, Types and Conversion","Strings and Safe Formatting","Conditions and Validation","Loops and Iteration","Indexed and Associative Arrays","Functions and Reusable Logic","Forms, Input Validation and Escaping","Database Access with Parameterized Queries","Build a Secure PHP Request Flow"],"description":"Build dynamic websites and learn server-side web programming.","level":"Beginner"},"typescript":{"name":"TypeScript","count":10,"topics":["TypeScript Setup and Annotations","Type Inference and Variables","Union Types and Narrowing","Conditions and Exhaustive Logic","Iteration and Typed Loops","Typed Arrays, Objects and Generics","Functions and Function Types","Interfaces and Classes","Promises, Async/Await and Error Types","Build a Typed Course Progress Module"],"description":"Write scalable JavaScript applications with powerful type safety.","level":"Intermediate"},"go":{"name":"Go Programming","count":10,"topics":["Go Program Structure and Packages","Variables, Constants and Types","Operators and Expressions","Conditions and Boolean Logic","Loops and Iteration","Slices and Maps","Functions and Multiple Return Values","Structs, Methods and Interfaces","Explicit Error Handling","Goroutines, Channels and a Small Service"],"description":"Learn Go for fast, efficient and scalable modern software.","level":"Intermediate"},"rust":{"name":"Rust Programming","count":10,"topics":["Rust Program Structure and Output","Variables, Mutability and Types","Ownership and Moves","Borrowing and References","Control Flow and Loops","Vectors, Strings and Maps","Functions and Return Types","Structs, Enums and Methods","Option, Result and Error Handling","Build and Test a Small Rust Tracker"],"description":"Learn safe, fast and reliable systems programming with Rust.","level":"Advanced"},"kotlin":{"name":"Kotlin Development","count":10,"topics":["Kotlin Program Structure and Output","Val, Var, Types and Null Safety","Operators and Expressions","Conditions and When Expressions","Loops and Ranges","Collections and Null-Safe Access","Functions and Default Arguments","Classes, Data Classes and Properties","Interfaces, Lambdas and Errors","Build a Small Kotlin Progress Tracker"],"description":"Learn modern Kotlin programming for applications and Android development.","level":"Intermediate"},"swift":{"name":"Swift Development","count":10,"topics":["Swift Program Structure and Output","Constants, Variables and Types","Operators and Expressions","Optionals and Safe Conditions","Loops and Iteration","Arrays, Dictionaries and Sets","Functions and Return Values","Structs, Classes and Properties","Protocols and Error Handling","Build a Small Swift Progress Tracker"],"description":"Learn Apple's powerful programming language for application development.","level":"Intermediate"},"dart":{"name":"Dart Programming","count":10,"topics":["Dart Program Structure and Output","Variables, Types and Null Safety","Operators and Expressions","Conditions and Pattern-Friendly Logic","Loops and Iteration","Lists, Sets and Maps","Functions and Optional Parameters","Classes, Constructors and Inheritance","Futures, Async/Await and Exceptions","Model a Course Progress Feature"],"description":"Learn Dart and prepare for modern cross-platform application development.","level":"Beginner"},"ruby":{"name":"Ruby Programming","count":10,"topics":["Ruby Program Structure and Output","Variables, Types and Symbols","Operators and Expressions","Conditions and Boolean Logic","Loops and Enumerable Methods","Arrays and Hashes","Methods, Blocks and Return Values","Classes, Objects and Modules","Exceptions and File Operations","Build a Small Ruby Progress Tracker"],"description":"Learn elegant programming with Ruby and explore web development.","level":"Beginner"},"sql":{"name":"SQL & Databases","count":10,"topics":["SELECT: Read the Data You Need","WHERE: Filter Rows Precisely","ORDER BY and LIMIT: Shape Results","Aggregate Functions and NULL","GROUP BY and HAVING","JOINs and Relationships","Subqueries and Common Table Expressions","INSERT, UPDATE and DELETE Safely","Constraints and Indexes","Transactions, Least Privilege and Data Safety"],"description":"Learn databases, queries, tables and how applications work with data.","level":"Beginner"},"r":{"name":"R for Data Science","count":10,"topics":["R Objects, Vectors and Output","Data Types, Indexing and Missing Values","Matrices, Lists and Dimensions","Data Frames and Column Types","Logical Filtering and Subsetting","Vectorized Calculations","Writing Reusable Functions","Apply Patterns and List Processing","Clear Plots and Data Visualisation","Importing Data and Handling Missing Values"],"description":"Learn statistical programming, data analysis and data science with R.","level":"Intermediate"},"lua":{"name":"Lua Programming","count":10,"topics":["Lua Program Structure and Output","Variables, Types and Tables","Operators and Conditional Logic","Loops and Iteration","Functions, Scope and Return Values","Tables as Arrays and Dictionaries","Iterators and Generic For Loops","Modules and Reusable Files","Metatables and Object-Like Patterns","Errors, Coroutines and a Small Game Loop"],"description":"Learn a lightweight scripting language used in games and applications.","level":"Beginner"},"cybersecurity":{"name":"Cybersecurity","count":10,"topics":["Cybersecurity foundations and the CIA triad","Asset inventory, threat modeling and risk","Identity, authentication, MFA and least privilege","Network fundamentals, segmentation and firewalls","Endpoint hardening, patching and backups","Encryption, TLS, data classification and secrets","Logging, monitoring, detection and incident response","Secure web applications and OWASP risks","Cloud security, IAM and configuration hygiene","Cybersecurity capstone: design a safer organization"],"description":"Understand confidentiality, integrity, availability, assets, threats, weaknesses, impact and layered controls. Guided explanations, six original visual diagrams, safe practice, trusted resource links, worked examples and a randomized quiz.","level":"Beginner"},"ethicalhacking":{"name":"Ethical Hacking","count":10,"topics":["Ethics, permission, scope and rules of engagement","Build a safe Linux and virtual lab","Passive reconnaissance and approved asset context","Network discovery inside your own lab","Vulnerability assessment and risk prioritization","Web security testing with training applications","Password controls, hashing, MFA and account safety","Safe proof-of-concept thinking and remediation","Evidence, severity, disclosure and professional reports","Authorized assessment capstone and retest"],"description":"Learn written authorization, scope boundaries, safe methods, evidence handling and reporting. Guided explanations, six original visual diagrams, safe practice, trusted resource links, worked examples and a randomized quiz.","level":"Beginner"}};
const BASE_URL = "https://codeacademybywm.web.app/";
const courseId = document.body.dataset.course;
const course = CATALOG[courseId];
const byId = id => document.getElementById(id);
const safeNumber = value => { const n = Number(value); return Number.isFinite(n) ? Math.max(0, n) : 0; };
let currentUser = null;
let profileData = {};

function maxCompletedFromProgress(progress, key) {
  const aliases = key === "cplusplus" ? ["cplusplus", "cpp"] : [key];
  let best = 0;
  for (const item of aliases) {
    const raw = progress?.[item];
    if (typeof raw === "number" || typeof raw === "string") best = Math.max(best, safeNumber(raw));
    else if (raw && typeof raw === "object") best = Math.max(best, safeNumber(raw.completed ?? raw.lastCompleted ?? 0));
  }
  return Math.min(10, best);
}
function getIds(completedLessons) {
  if (Array.isArray(completedLessons)) return completedLessons.map(String);
  if (completedLessons && typeof completedLessons === "object") {
    return Object.entries(completedLessons).filter(([,v]) => v === true || v === 1 || (v && typeof v === "object")).map(([k]) => k);
  }
  return [];
}
function contiguousFromLegacy(data, id) {
  const ids = new Set(getIds(data?.completedLessons));
  let n = 0;
  for (let i = 1; i <= 10; i++) {
    const candidates = [`${id}_lesson_${i}`,`${id}-lesson-${i}`,`${id}_lesson-${i}`,`${id}-lesson_${i}`];
    if (id === "cplusplus") candidates.push(`cpp_lesson_${i}`,`cpp-lesson-${i}`);
    if (candidates.some(item => ids.has(item))) n = i; else break;
  }
  return n;
}
function getCompleted(data) {
  // Existing Firestore profile is the source of truth. This page intentionally does not write rewards or progress.
  return Math.min(10, Math.max(maxCompletedFromProgress(data?.progress, courseId), contiguousFromLegacy(data, courseId)));
}
function safeText(id, value) { const el = byId(id); if (el) el.textContent = String(value ?? ""); }
function setStatus(text, kind) { const el = byId("cloudStatus"); if (el) { el.textContent = text; el.dataset.kind = kind || ""; } }
function setFeatureStatus(id, text, kind="") { const el = byId(id); if (el) { el.textContent = text; el.dataset.kind = kind; } }
function updateProgress(data) {
  const done = Math.min(course.count, getCompleted(data));
  const pct = Math.round(done / course.count * 100);
  safeText("completedValue", `${done}/${course.count}`);
  safeText("progressPercent", `${pct}%`);
  safeText("nextLesson", done >= course.count ? "Course complete" : `Lesson ${done + 1} is next`);
  const track = byId("progressTrack"); if (track) track.setAttribute("aria-valuenow", String(pct));
  const bar = byId("progressFill"); if (bar) bar.style.width = `${pct}%`;
  safeText("progressLabel", `${done} of ${course.count} lessons completed`);
  safeText("nextLessonHint", done >= course.count ? "All lessons are complete — revisit any topic." : `Next up: Lesson ${done + 1} — ${course.topics[done]}.`);
  const mainBtn = byId("continueButton");
  if (mainBtn) mainBtn.textContent = done === 0 ? "Start learning →" : done >= course.count ? "Review final lesson →" : "Continue learning →";
  safeText("xpValue", safeNumber(data?.xp).toLocaleString());
  safeText("coinsValue", safeNumber(data?.coins).toLocaleString());
  safeText("streakValue", safeNumber(data?.streak ?? data?.currentStreak).toLocaleString());
  renderLessons(done);
  const displayName = data?.displayName || data?.name || currentUser?.displayName || "future developer";
  setStatus(`Signed in as ${displayName}. This page reads your current progress and rewards without changing them.`, "ok");
  const code = typeof data?.referralCode === "string" ? data.referralCode.trim() : "";
  safeText("referralCodeValue", code || "No referral code saved yet");
  safeText("referralHint", code ? "Your account referral code is ready to include in an invite link." : "A referral code has not been saved on this profile. You can still share the course.");
  byId("referralCodeValue")?.setAttribute("data-has-code", code ? "yes" : "no");
}
function renderLessons(done) {
  const grid = byId("lessonGrid"); if (!grid) return;
  grid.replaceChildren();
  course.topics.forEach((topic, index) => {
    const number = index + 1;
    const isComplete = number <= done;
    const isUnlocked = number <= done + 1;
    const article = document.createElement("article");
    article.className = `lesson-card${isComplete ? " is-complete" : ""}${!isUnlocked ? " is-locked" : ""}`;
    const bubble = document.createElement("div"); bubble.className = "lesson-number"; bubble.textContent = isComplete ? "✓" : String(number);
    const content = document.createElement("div"); content.className = "lesson-content";
    const tag = document.createElement("div"); tag.className = "lesson-tag"; tag.textContent = isComplete ? "COMPLETED · REVISIT ANYTIME" : isUnlocked ? "NEXT IN YOUR PATH" : "LOCKED · COMPLETE IN ORDER";
    const title = document.createElement("h3"); title.className = "lesson-title"; title.textContent = `Lesson ${number} — ${topic}`;
    const desc = document.createElement("p"); desc.className = "lesson-description"; desc.textContent = isComplete ? "Your saved progress marks this lesson complete. Open it again for revision." : isUnlocked ? "Open this lesson to read, answer questions and practise the concept." : `Complete Lesson ${number-1} first to keep your course progress in order.`;
    const btn = document.createElement("button"); btn.className = `lesson-action${isUnlocked && !isComplete ? " ready" : ""}`; btn.type = "button"; btn.textContent = isComplete ? "Review lesson ↗" : isUnlocked ? "Start lesson →" : "Locked"; btn.disabled = !isUnlocked; btn.addEventListener("click", () => openLesson(number));
    content.append(tag,title,desc,btn); article.append(bubble,content); grid.append(article);
  });
}
function openLesson(number) {
  const params = new URLSearchParams({course: courseId, lesson: String(number), from: location.pathname.split("/").pop() || `course-home-${courseId}.html`});
  location.href = `lesson.html?${params.toString()}`;
}
function inviteUrl(includeReferral=true) {
  const url = new URL(`course-home-${courseId}.html`, BASE_URL);
  const referral = String(profileData?.referralCode || "").trim();
  if (includeReferral && referral) url.searchParams.set("ref", referral);
  return url.toString();
}
function currentShareUrl(includeReferral=true) {
  const url = new URL(location.href);
  url.hash = "";
  if (includeReferral && profileData?.referralCode) url.searchParams.set("ref", String(profileData.referralCode).trim());
  else url.searchParams.delete("ref");
  return url.toString();
}
async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText && window.isSecureContext) { await navigator.clipboard.writeText(text); return true; }
  } catch (_) {}
  try {
    const box = document.createElement("textarea"); box.value = text; box.setAttribute("readonly", ""); box.style.position = "fixed"; box.style.opacity = "0"; document.body.append(box); box.select();
    const ok = document.execCommand("copy"); box.remove(); if (ok) return true;
  } catch (_) {}
  window.prompt("Copy this link", text);
  return false;
}
function wireSharing() {
  const title = `${course.name} | Code Academy`;
  const message = `Learn ${course.name} with Code Academy: ${inviteUrl(true)}`;
  const doNativeShare = async () => {
    const payload = {title, text:`Explore the ${course.name} learning path on Code Academy.`, url:inviteUrl(true)};
    if (navigator.share) {
      try { await navigator.share(payload); setFeatureStatus("shareStatus", "Share sheet opened.", "ok"); }
      catch (error) { if (error?.name !== "AbortError") setFeatureStatus("shareStatus", "Sharing was cancelled or unavailable. You can copy the invite link instead.", "warn"); }
    } else {
      const wa = `https://wa.me/?text=${encodeURIComponent(message)}`;
      window.open(wa, "_blank", "noopener,noreferrer");
      setFeatureStatus("shareStatus", "WhatsApp sharing opened. You can also copy the link.", "ok");
    }
  };
  byId("shareCourseButton")?.addEventListener("click", doNativeShare);
  byId("nativeShareButton")?.addEventListener("click", doNativeShare);
  byId("copyCourseLinkButton")?.addEventListener("click", async () => {
    const copied = await copyText(currentShareUrl(false));
    setFeatureStatus("shareStatus", copied ? "Course link copied (without referral code)." : "Copy dialog opened. Copy the course link from the dialog.", copied ? "ok" : "warn");
  });
  byId("copyReferralButton")?.addEventListener("click", async () => {
    const copied = await copyText(inviteUrl(true));
    const detail = profileData?.referralCode ? "Invite link includes your referral code." : "No referral code was available on this account, so this is a course link.";
    setFeatureStatus("shareStatus", copied ? `Invite link copied. ${detail}` : `Copy dialog opened. ${detail}`, copied ? "ok" : "warn");
  });
  byId("whatsappReferralButton")?.addEventListener("click", () => {
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
    setFeatureStatus("shareStatus", "WhatsApp invite opened.", "ok");
  });
}
function wireNotifications() {
  byId("enableNotificationsButton")?.addEventListener("click", async () => {
    if (!("Notification" in window)) { setFeatureStatus("notificationStatus", "This browser does not support device notifications. Use the account notification feed instead.", "warn"); return; }
    if (Notification.permission === "denied") { setFeatureStatus("notificationStatus", "Notifications are blocked in device/browser settings. Allow them there, then try again.", "warn"); return; }
    try {
      const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
      if (permission !== "granted") { setFeatureStatus("notificationStatus", "Permission was not granted. You can still save reminders to your account feed.", "warn"); return; }
      if ("serviceWorker" in navigator) {
        try {
          await navigator.serviceWorker.register("./sw.js");
          const registration = await navigator.serviceWorker.ready;
          await registration.showNotification("Code Academy notifications enabled", {body:`Notifications are enabled on this device for your ${course.name} learning path.`, icon:"./web-app-manifest-192x192.png", data:{url:`./course-home-${courseId}.html`}});
        } catch (swError) {
          console.warn("Service-worker notification display was unavailable:", swError);
          new Notification("Code Academy notifications enabled", {body:`Device notification permission is enabled for ${course.name}.`});
        }
      } else new Notification("Code Academy notifications enabled", {body:`Device notification permission is enabled for ${course.name}.`});
      setFeatureStatus("notificationStatus", "Device notification permission is enabled. Account course-completion notices still use the existing notification engine.", "ok");
    } catch (error) { console.warn(error); setFeatureStatus("notificationStatus", "Could not enable device notifications. Check your browser settings.", "warn"); }
  });
  byId("saveReminderButton")?.addEventListener("click", async () => {
    try {
      const {sendNotification} = await import("./notification-engine.js");
      const today = new Date().toISOString().slice(0,10);
      await sendNotification({title:`${course.name} learning reminder 📘`, message:`Your ${course.name} learning path is ready. Continue with a short lesson when you have time.`, type:"course", icon:"📘", link:`course-home-${courseId}.html`, uniqueKey:`course_home_reminder_${courseId}_${today}`});
      setFeatureStatus("notificationStatus", "Reminder saved to the signed-in account notification feed.", "ok");
    } catch (error) { console.warn("Could not save course reminder:", error); setFeatureStatus("notificationStatus", "Could not save the reminder. Check your connection and account permissions.", "warn"); }
  });
}
function wireActions() {
  byId("continueButton")?.addEventListener("click", () => {
    const text = byId("completedValue")?.textContent || "0/10";
    const done = Math.min(10, safeNumber(text.split("/")[0]));
    openLesson(done >= 10 ? 10 : done + 1);
  });
  wireSharing();
  wireNotifications();
}

if (!course) {
  setStatus("This course page could not be matched to an existing course. Return to the course catalogue.", "warn");
  byId("continueButton")?.setAttribute("disabled", "disabled");
} else {
  safeText("courseName", course.name);
  safeText("courseCount", `${course.count} guided lessons`);
  renderLessons(0);
  wireActions();
  onAuthStateChanged(auth, async user => {
    if (!user) {
      const returnTo = `${location.pathname}${location.search}`;
      location.replace(`login.html?redirect=${encodeURIComponent(returnTo)}`);
      return;
    }
    currentUser = user;
    try {
      const snapshot = await getDoc(doc(db, "users", user.uid));
      profileData = snapshot.exists() ? snapshot.data() || {} : {};
      updateProgress(profileData);
      if (!snapshot.exists()) setStatus("Signed in. No saved account profile was found yet; the page will not alter rewards or progress.", "warn");
    } catch (error) {
      console.warn("Course home could not read the profile:", error);
      profileData = {};
      updateProgress(profileData);
      setStatus("Cloud profile could not be read right now. Reconnect to load your saved account progress.", "warn");
      setFeatureStatus("referralHint", "Referral details could not be loaded. You can still share this course.", "warn");
    }
  });
}
