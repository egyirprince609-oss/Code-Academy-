import { auth, db, onAuthStateChanged, getDoc, doc } from "./authentication.js";
import {
  collection, query, limit, onSnapshot, updateDoc, getDocs, writeBatch
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const courses = [
  {slug:"html",name:"HTML",category:"Web Development",level:"Beginner",lessons:10,homeFile:"HTML.html",lessonTarget:"html_dashboard.html",editorTarget:"html-editor.html",editorLang:"html",editorLabel:"Open HTML Editor",cover:"ca-textbook-cover-html-v2.svg",accent:"#fb923c",accent2:"#60a5fa",tagline:"Shape the structure of the web.",description:"Go from your first semantic tag to complete, accessible webpages. Build a confident foundation with structure, links, media, forms and real page projects.",skills:["Semantic HTML","Forms & inputs","Images & links","Accessible structure"],snippet:"<!doctype html>\n<html lang=\"en\">\n  <head><title>My first page</title></head>\n  <body>\n    <h1>Hello, web!</h1>\n    <p>Built with Code Academy.</p>\n  </body>\n</html>",projects:["Build a personal profile page","Create an accessible event registration form","Design a small multi-page website"],quiz:{question:"Which element represents the main top-level heading of a page?",options:["<heading>","<h1>","<head>","<title>"],answer:1,explanation:"The h1 element is the primary heading in the document body. The head element contains page metadata."}},
  {slug:"css",name:"CSS",category:"Web Development",level:"Beginner",lessons:10,homeFile:"CSS.html",lessonTarget:"css_dashboard.html",editorTarget:"css-editor.html",editorLang:"css",editorLabel:"Open CSS Design Lab",cover:"ca-textbook-cover-css-v2.svg",accent:"#38bdf8",accent2:"#818cf8",tagline:"Turn plain pages into polished experiences.",description:"Master visual design, responsive layouts, grids, motion and reusable styling systems. Make every interface feel intentional on phone, tablet and desktop.",skills:["Flexbox & Grid","Responsive design","Color & typography","Transitions & animation"],snippet:".course-card {\n  display: grid;\n  gap: 1rem;\n  border-radius: 1.25rem;\n  background: linear-gradient(135deg, #101d35, #07101f);\n  transition: transform .2s ease;\n}\n.course-card:hover { transform: translateY(-4px); }",projects:["Design a responsive course card grid","Create a vibrant animated landing page","Build a dashboard layout with CSS Grid"],quiz:{question:"Which CSS feature is designed for two-dimensional row-and-column layouts?",options:["Float", "Flexbox", "Grid", "Position"],answer:2,explanation:"CSS Grid manages layouts across rows and columns. Flexbox is mainly suited to one-dimensional layout."}},
  {slug:"javascript",name:"JavaScript",category:"Web Development",level:"Beginner",lessons:10,homeFile:"JavaScript.html",lessonTarget:"javascript_dashboard.html",editorTarget:"javascript-editor.html",editorLang:"javascript",editorLabel:"Open JavaScript Lab",cover:"ca-textbook-cover-javascript-v2.svg",accent:"#facc15",accent2:"#f97316",tagline:"Bring websites to life with logic and motion.",description:"Learn variables, functions, arrays, events and DOM interactions, then turn those building blocks into useful browser apps and playful interactive experiences.",skills:["Variables & functions","DOM events","Arrays & objects","Async JavaScript"],snippet:"const startButton = document.querySelector(\"#start\");\n\nstartButton?.addEventListener(\"click\", () => {\n  document.body.classList.toggle(\"is-active\");\n  console.log(\"Interaction ready!\");\n});",projects:["Create an interactive quiz app","Build a to-do list with saved tasks","Make a keyboard-controlled mini game"],quiz:{question:"Which method attaches an event handler to a DOM element?",options:["querySelectorAll()", "addEventListener()", "JSON.parse()", "push()"],answer:1,explanation:"addEventListener registers a callback for events such as click, input, keydown and submit."}},
  {slug:"python",name:"Python",category:"Programming",level:"Beginner",lessons:10,homeFile:"Python.html",lessonTarget:"python_dashboard.html",editorTarget:"PythonEditor.html",editorLang:"python",editorLabel:"Launch Python Workbench",cover:"ca-textbook-cover-python-v2.svg",accent:"#60a5fa",accent2:"#facc15",tagline:"Automate tasks. Explore data. Build smart tools.",description:"Build programming confidence with clear Python fundamentals, practical automation, data workflows and project thinking that can grow into AI and machine learning.",skills:["Variables & data types","Loops & functions","Files & automation","AI-ready foundations"],snippet:"def greet(name: str) -> str:\n    return f\"Welcome to Code Academy, {name}!\"\n\nlearner = \"Developer\"\nprint(greet(learner))",projects:["Build a useful file-organizer script","Create a number-guessing game","Analyze a small data set and summarize it"],quiz:{question:"Which keyword defines a function in Python?",options:["func", "function", "def", "lambda"],answer:2,explanation:"The def keyword begins a standard named function definition in Python."}},
  {slug:"react",name:"React Development",shortName:"React",category:"Web Development",level:"Intermediate",lessons:10,homeFile:"React.html",lessonTarget:"react_dashboard.html",editorTarget:"ReactEditor.html",editorLang:"javascript",editorLabel:"Open React Component Studio",cover:"ca-textbook-cover-react-v2.svg",accent:"#67e8f9",accent2:"#818cf8",tagline:"Build responsive interfaces from reusable components.",description:"Learn how component-based UI works, from JSX and props through state, hooks and practical app structure. Build interfaces that feel fast and maintainable.",skills:["Components & JSX","Props & state","Hooks","Reusable app layouts"],snippet:"function WelcomeCard({ name }) {\n  return (\n    <article className=\"welcome-card\">\n      <h2>Welcome, {name}!</h2>\n      <p>Build something meaningful.</p>\n    </article>\n  );\n}",projects:["Build a reusable course dashboard","Create a searchable product catalogue","Design a small React task manager"],quiz:{question:"What is the usual purpose of a React component?",options:["To represent reusable UI", "To style every page globally", "To store database passwords", "To replace all HTML files"],answer:0,explanation:"Components package UI and related behavior so an interface can be composed and reused."}},
  {slug:"java",name:"Java",category:"Programming",level:"Beginner",lessons:10,homeFile:"java-home.html",lessonTarget:"Java.html",editorTarget:"java-editor.html",editorLang:"java",editorLabel:"Open Java Workbench",cover:"ca-textbook-cover-java-v2.svg",accent:"#fb923c",accent2:"#ef4444",tagline:"Learn strong foundations for real applications.",description:"Build with variables, methods, classes and object-oriented thinking. Develop the discipline needed for dependable application and backend programming.",skills:["Syntax & types","Methods & classes","Object-oriented design","Collections"],snippet:"public class Main {\n    public static void main(String[] args) {\n        String learner = \"Developer\";\n        System.out.println(\"Hello, \" + learner);\n    }\n}",projects:["Create a student grade manager","Build a simple banking model","Write a command-line quiz"],quiz:{question:"Which method is the standard entry point of a simple Java application?",options:["start()", "runMain()", "main(String[] args)", "init()"],answer:2,explanation:"Java applications commonly begin execution in public static void main(String[] args)."}},
  {slug:"c",name:"C Programming",shortName:"C",category:"Programming",level:"Beginner",lessons:10,homeFile:"c-home.html",lessonTarget:"C.html",editorTarget:"c-editor.html",editorLang:"c",editorLabel:"Open C Compiler",cover:"ca-textbook-cover-c-v2.svg",accent:"#60a5fa",accent2:"#94a3b8",tagline:"Understand what happens close to the machine.",description:"Practice core programming logic, types, functions, arrays, pointers and memory-aware thinking with a clear path from small programs to systems concepts.",skills:["Types & operators","Loops & functions","Arrays & pointers","Memory basics"],snippet:"#include <stdio.h>\n\nint main(void) {\n    printf(\"Hello, Code Academy!\\n\");\n    return 0;\n}",projects:["Build a menu-driven calculator","Create a student-record console app","Write a small text-processing utility"],quiz:{question:"Which header is needed for printf in a standard C example?",options:["<iostream>", "<stdio.h>", "<string>", "<console.h>"],answer:1,explanation:"stdio.h declares standard input/output functions such as printf and scanf."}},
  {slug:"cplusplus",name:"C++",category:"Programming",level:"Intermediate",lessons:10,homeFile:"cplusplus-home.html",lessonTarget:"CPlusPlus.html",editorTarget:"cpp-editor.html",editorLang:"cpp",editorLabel:"Open C++ Workbench",cover:"ca-textbook-cover-cplusplus-v2.svg",accent:"#818cf8",accent2:"#38bdf8",tagline:"Blend performance with expressive program design.",description:"Move from strong C++ fundamentals to classes, references, containers and resource-aware design, with practical examples that explain how the pieces fit together.",skills:["Functions & references","Classes & objects","STL containers","Resource management"],snippet:"#include <iostream>\n#include <string>\n\nint main() {\n    const std::string learner = \"Developer\";\n    std::cout << \"Hello, \" << learner << '\\n';\n}",projects:["Build a library catalogue","Create a turn-based console game","Design a simple inventory manager"],quiz:{question:"Which standard C++ container stores a sequence of elements and can grow dynamically?",options:["std::vector", "std::fixed", "std::block", "std::memory"],answer:0,explanation:"std::vector is a dynamically sized sequence container from the C++ standard library."}},
  {slug:"csharp",name:"C#",category:"Programming",level:"Beginner",lessons:10,homeFile:"csharp-home.html",lessonTarget:"CSharp.html",editorTarget:"csharp-editor.html",editorLang:"csharp",editorLabel:"Open C# Workbench",cover:"ca-textbook-cover-csharp-v2.svg",accent:"#c084fc",accent2:"#818cf8",tagline:"Create dependable apps with modern C#.",description:"Learn types, methods, classes and collections, then apply those skills to practical application logic and a clean object-oriented workflow.",skills:["Types & methods","Classes & interfaces","Collections","Error handling"],snippet:"using System;\n\nclass Program {\n    static void Main() {\n        string learner = \"Developer\";\n        Console.WriteLine($\"Hello, {learner}!\");\n    }\n}",projects:["Build a contact-book application","Create a small budgeting tool","Design a text-based adventure"],quiz:{question:"Which C# type represents a true/false value?",options:["int", "char", "bool", "decimal"],answer:2,explanation:"The bool type represents logical true and false values."}},
  {slug:"php",name:"PHP",category:"Web Development",level:"Beginner",lessons:10,homeFile:"php-home.html",lessonTarget:"PHP.html",editorTarget:"php-editor.html",editorLang:"php",editorLabel:"Open PHP Sandbox",cover:"ca-textbook-cover-php-v2.svg",accent:"#a5b4fc",accent2:"#60a5fa",tagline:"Build dynamic web experiences on the server.",description:"Learn PHP syntax and server-side thinking, handle form input, organize reusable logic and understand how dynamic pages connect to application data.",skills:["PHP syntax","Forms & requests","Arrays & functions","Server-side rendering"],snippet:"<?php\n$learner = \"Developer\";\n$message = \"Welcome, {$learner}!\";\necho $message;\n?>",projects:["Build a contact form flow","Create a basic product listing","Design a reusable page template"],quiz:{question:"Which opening tag begins a standard PHP code block?",options:["<php>", "<?php", "<script php>", "<?="],answer:1,explanation:"<?php starts a standard PHP block. The short echo tag is a different shorthand form."}},
  {slug:"typescript",name:"TypeScript",category:"Web Development",level:"Intermediate",lessons:10,homeFile:"typescript-home.html",lessonTarget:"TypeScript.html",editorTarget:"typescript-editor.html",editorLang:"typescript",editorLabel:"Open TypeScript Studio",cover:"ca-textbook-cover-typescript-v2.svg",accent:"#60a5fa",accent2:"#38bdf8",tagline:"Scale JavaScript with clearer, safer contracts.",description:"Add types to your JavaScript workflow, model data, use interfaces and generics, and make larger applications easier to maintain and refactor.",skills:["Type annotations","Interfaces & types","Generics","Safer app architecture"],snippet:"type Learner = {\n  name: string;\n  course: string;\n};\n\nconst learner: Learner = {\n  name: \"Developer\",\n  course: \"TypeScript\",\n};",projects:["Model a typed task manager","Create reusable validation types","Convert a small JS app to TypeScript"],quiz:{question:"What does TypeScript add to JavaScript during development?",options:["Static type checking", "A new browser engine", "Automatic database hosting", "A replacement for HTML"],answer:0,explanation:"TypeScript checks types during development and transpiles to JavaScript for execution."}},
  {slug:"go",name:"Go",category:"Programming",level:"Intermediate",lessons:10,homeFile:"go-home.html",lessonTarget:"Go.html",editorTarget:"go-editor.html",editorLang:"go",editorLabel:"Open Go Playground",cover:"ca-textbook-cover-go-v2.svg",accent:"#67e8f9",accent2:"#60a5fa",tagline:"Write clear software with speed and simplicity.",description:"Learn Go's concise syntax, functions, structs, interfaces, error handling and concurrency foundations while building practical command-line and service-oriented tools.",skills:["Packages & functions","Structs & interfaces","Errors","Concurrency basics"],snippet:"package main\n\nimport \"fmt\"\n\nfunc main() {\n    learner := \"Developer\"\n    fmt.Printf(\"Hello, %s!\\n\", learner)\n}",projects:["Build a command-line task tracker","Create a JSON data viewer","Design a small HTTP service"],quiz:{question:"Which keyword starts the entry function in a Go program?",options:["begin", "main", "func", "start"],answer:2,explanation:"A Go function declaration begins with func; the conventional entry point is func main()."}},
  {slug:"rust",name:"Rust",category:"Programming",level:"Advanced",lessons:10,homeFile:"rust-home.html",lessonTarget:"Rust.html",editorTarget:"CODEEDITOR.html?lang=rust",editorLang:"rust",editorLabel:"Open Rust Systems Workspace",cover:"ca-textbook-cover-rust-v2.svg",accent:"#fb923c",accent2:"#f97316",tagline:"Build fast systems with ownership in mind.",description:"Explore expressive systems programming through ownership, borrowing, types, pattern matching and error handling, with careful examples that reinforce safe design.",skills:["Ownership & borrowing","Enums & matching","Collections","Result & Option"],snippet:"fn main() {\n    let learner = \"Developer\";\n    println!(\"Hello, {}!\", learner);\n}",projects:["Build a command-line word counter","Create a safe configuration parser","Model a small inventory with enums"],quiz:{question:"What is the main purpose of Rust's ownership model?",options:["To remove all variable names", "To manage memory safety without a garbage collector", "To replace functions", "To make every value global"],answer:1,explanation:"Ownership and borrowing rules help enforce memory safety at compile time without a tracing garbage collector."}},
  {slug:"kotlin",name:"Kotlin",category:"Programming",level:"Intermediate",lessons:10,homeFile:"kotlin-home.html",lessonTarget:"Kotlin.html",editorTarget:"CODEEDITOR.html?lang=kotlin",editorLang:"kotlin",editorLabel:"Open Kotlin Workspace",cover:"ca-textbook-cover-kotlin-v2.svg",accent:"#c084fc",accent2:"#38bdf8",tagline:"Build expressive, modern applications.",description:"Learn Kotlin's concise syntax, null-safety, functions, classes and collection operations, with concepts that prepare you for modern app development.",skills:["Null safety","Functions & lambdas","Classes & data classes","Collections"],snippet:"data class Learner(val name: String, val course: String)\n\nfun main() {\n    val learner = Learner(\"Developer\", \"Kotlin\")\n    println(\"Hello, ${'$'}{learner.name}!\")\n}",projects:["Build a small grade tracker","Create a note model with data classes","Write a console-based habit tracker"],quiz:{question:"Which Kotlin operator safely calls a member when a value might be null?",options:["!!", "?.", "::", "=>"],answer:1,explanation:"The safe-call operator ?. accesses a member only when its receiver is not null."}},
  {slug:"swift",name:"Swift",category:"Programming",level:"Intermediate",lessons:10,homeFile:"swift-home.html",lessonTarget:"Swift.html",editorTarget:"swift-editor.html",editorLang:"swift",editorLabel:"Open Swift Playground",cover:"ca-textbook-cover-swift-v2.svg",accent:"#fb923c",accent2:"#f87171",tagline:"Learn a modern language for app experiences.",description:"Explore Swift variables, optionals, functions, structures and collections. Build readable logic and lay the groundwork for Apple-platform app development.",skills:["Variables & types","Optionals","Structs & methods","Collections"],snippet:"struct Learner {\n    let name: String\n    let course: String\n}\n\nlet learner = Learner(name: \"Developer\", course: \"Swift\")\nprint(\"Hello, \\(learner.name)!\")",projects:["Build a personal reading tracker","Create a unit converter","Model a simple travel itinerary"],quiz:{question:"What does Swift's optional type represent?",options:["A value that may be absent", "A value that is always zero", "A database row", "A loop counter"],answer:0,explanation:"An optional represents either a wrapped value or nil, making absence explicit in the type system."}},
  {slug:"dart",name:"Dart",category:"Programming",level:"Beginner",lessons:10,homeFile:"dart-home.html",lessonTarget:"Dart.html",editorTarget:"CODEEDITOR.html?lang=dart",editorLang:"dart",editorLabel:"Open Dart Workspace",cover:"ca-textbook-cover-dart-v2.svg",accent:"#38bdf8",accent2:"#22d3ee",tagline:"Create concise code for cross-platform products.",description:"Practice Dart types, functions, classes, collections and asynchronous patterns while building a strong base for Flutter and cross-platform interfaces.",skills:["Types & variables","Functions","Classes","Async foundations"],snippet:"class Learner {\n  final String name;\n  final String course;\n  Learner(this.name, this.course);\n}\n\nvoid main() {\n  final learner = Learner('Developer', 'Dart');\n  print('Hello, ${'$'}{learner.name}!');\n}",projects:["Create a command-line expense tracker","Build a quiz data model","Model a set of reusable app cards"],quiz:{question:"Which keyword declares a variable whose value is assigned once in Dart?",options:["var", "final", "loop", "staticOnly"],answer:1,explanation:"final variables are assigned once. const is used for compile-time constants."}},
  {slug:"ruby",name:"Ruby",category:"Programming",level:"Beginner",lessons:10,homeFile:"ruby-home.html",lessonTarget:"Ruby.html",editorTarget:"ruby-editor.html",editorLang:"ruby",editorLabel:"Open Ruby Workbench",cover:"ca-textbook-cover-ruby-v2.svg",accent:"#fb7185",accent2:"#c084fc",tagline:"Write expressive code with an elegant flow.",description:"Learn Ruby's readable syntax, collections, methods and object model, then apply those ideas to useful scripts and web-oriented programming.",skills:["Readable syntax","Methods & blocks","Arrays & hashes","Objects"],snippet:"def greet(name)\n  \"Welcome to Code Academy, #{name}!\"\nend\n\nputs greet(\"Developer\")",projects:["Build a command-line journal","Create a word-frequency analyzer","Write a small menu-driven tracker"],quiz:{question:"Which method commonly adds one item to the end of a Ruby array?",options:["push", "appendOnly", "joiner", "tail"],answer:0,explanation:"Array#push adds one or more elements to the end of a Ruby array; << is another common option."}},
  {slug:"sql",name:"SQL & Databases",shortName:"SQL",category:"Data",level:"Beginner",lessons:10,homeFile:"sql-home.html",lessonTarget:"SQL.html",editorTarget:"sql-editor.html",editorLang:"sql",editorLabel:"Open SQL Query Lab",cover:"ca-textbook-cover-sql-v2.svg",accent:"#60a5fa",accent2:"#34d399",tagline:"Ask better questions of your data.",description:"Build a practical understanding of tables, filtering, joins, grouping and updates. Learn to query structured information with clear, reliable SQL.",skills:["SELECT & WHERE","Sorting & grouping","Joins","Data integrity"],snippet:"SELECT course, COUNT(*) AS learners\nFROM enrollments\nWHERE status = 'active'\nGROUP BY course\nORDER BY learners DESC;",projects:["Design a student enrollment schema","Write reports for a mock store","Explore joins across a small database"],quiz:{question:"Which SQL clause filters rows before grouping occurs?",options:["ORDER BY", "WHERE", "SELECT", "LIMIT"],answer:1,explanation:"WHERE filters rows before GROUP BY; HAVING filters grouped results."}},
  {slug:"r",name:"R for Data Science",shortName:"R",category:"Data",level:"Intermediate",lessons:10,homeFile:"r-home.html",lessonTarget:"R.html",editorTarget:"r-editor.html",editorLang:"r",editorLabel:"Open R Data Lab",cover:"ca-textbook-cover-r-v2.svg",accent:"#60a5fa",accent2:"#a5b4fc",tagline:"Turn datasets into evidence and insight.",description:"Learn R foundations, vectors, data frames, summaries and visualization thinking for statistics and data analysis through practical, interpretable examples.",skills:["Vectors & data frames","Data cleaning","Summary statistics","Visualization"],snippet:"scores <- c(78, 84, 91, 69, 88)\n\naverage_score <- mean(scores)\nsummary(scores)\ncat(\"Average:\", average_score, \"\\n\")",projects:["Summarize a mock exam dataset","Compare groups with descriptive statistics","Create a clear chart for a small dataset"],quiz:{question:"Which R function calculates the arithmetic mean of a numeric vector?",options:["total()", "average()", "mean()", "middle()"],answer:2,explanation:"mean() returns the arithmetic mean of the supplied numeric values."}},
  {slug:"lua",name:"Lua",category:"Programming",level:"Beginner",lessons:10,homeFile:"lua-home.html",lessonTarget:"Lua.html",editorTarget:"lua-editor.html",editorLang:"lua",editorLabel:"Open Lua Workbench",cover:"ca-textbook-cover-lua-v2.svg",accent:"#818cf8",accent2:"#38bdf8",tagline:"Use lightweight scripts to power interactive logic.",description:"Learn Lua tables, functions, conditions and loops, then apply them to small tools, game logic and event-driven scripting patterns.",skills:["Tables & values","Functions","Loops & conditions","Game-script logic"],snippet:"local function greet(name)\n  return \"Hello, \" .. name .. \"!\"\nend\n\nprint(greet(\"Developer\"))",projects:["Create a score counter module","Build a text-based adventure","Write reusable game configuration tables"],quiz:{question:"Which operator joins strings in Lua?",options:["+", "..", "&", "::"],answer:1,explanation:"Lua uses the .. operator to concatenate strings."}},
  {slug:"cybersecurity",name:"Cybersecurity",category:"Security",level:"Beginner → Advanced",lessons:10,homeFile:"cybersecurity-home.html",lessonTarget:"cybersecurity%20dashboard.html",editorTarget:"security-center.html",editorLang:"javascript",editorLabel:"Open Security Center",cover:"cybersecurity-hero.png",accent:"#38bdf8",accent2:"#34d399",tagline:"Protect systems. Read signals. Respond with confidence.",description:"Learn defensive security, risk awareness, secure configuration, incident thinking and practical protection habits. Work through the original Code Academy security track in a responsible lab mindset.",skills:["Threat awareness","Defensive controls","Incident response","Secure habits"],snippet:"SECURITY CHECKLIST\n1. Identify the asset and its owner.\n2. Confirm written permission and scope.\n3. Collect only necessary evidence.\n4. Record findings and remediation.\n5. Verify the fix and report clearly.",projects:["Create a personal security checklist","Draft an incident-response timeline for a fictional case","Review a sample account-security configuration"],quiz:{question:"Before testing a system, what should you confirm first?",options:["That it looks interesting", "Written authorization and a defined scope", "That no one will notice", "That the system is public"],answer:1,explanation:"Security testing must stay within explicit authorization and scope, using safe and controlled systems."}},
  {slug:"ethicalhacking",name:"Ethical Hacking",category:"Security",level:"Beginner → Advanced",lessons:10,homeFile:"ethical-hacking-home.html",lessonTarget:"ethical%20hacking%20dashboard.html",editorTarget:"safe-browsing.html",editorLang:"javascript",editorLabel:"Open Safe Practice Tools",cover:"security-preview.jpg",accent:"#f97316",accent2:"#fb7185",tagline:"Assess carefully. Prove responsibly. Help fix the issue.",description:"Practice the ethics and process behind authorized security assessment: lab setup, defensive testing, evidence collection, vulnerability reporting and remediation.",skills:["Scope & authorization","Safe lab workflow","Findings & evidence","Remediation reports"],snippet:"AUTHORIZED TEST RECORD\nTarget: written-approved lab only\nScope: agreed assets and time window\nEvidence: minimum necessary, safely stored\nOutcome: clear severity + actionable fix\nClose: verify remediation and report",projects:["Write a safe test-scope document","Prepare a sample vulnerability report using fictional data","Build a remediation verification checklist"],quiz:{question:"What belongs in a responsible vulnerability report?",options:["Only a dramatic headline", "Reproducible evidence, impact and remediation steps", "Private data copied from real users", "Instructions to attack unrelated systems"],answer:1,explanation:"Good reports explain scope, evidence, impact and a practical fix without exposing unnecessary sensitive data."}}
];

const bySlug = new Map(courses.map(c => [c.slug, c]));
const root = document.getElementById("appRoot");
const pageType = document.body.dataset.page || "catalog";
const courseSlug = document.body.dataset.course || "";
let currentUser = null;
let userProfile = {};
let unsubscribeNotifications = null;
let notificationCache = [];
let firstNotificationSnapshot = true;
let activeFilter = "All";
let searchText = "";

const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
const urlFor = value => String(value || "").replace(/ /g, "%20");
const resourceUrl = (course, topic) => `course-resource.html?course=${encodeURIComponent(course.slug)}&topic=${encodeURIComponent(topic)}`;
const lessonUrl = course => urlFor(course.lessonTarget);
const editorUrl = course => course.editorTarget;
const formatCount = value => Number.isFinite(Number(value)) ? Number(value).toLocaleString() : "0";

function getProgressValue(slug) {
  const roots = [userProfile.progress, userProfile.courseProgress, userProfile.courses];
  let value;
  for (const rootValue of roots) {
    if (rootValue && Object.prototype.hasOwnProperty.call(rootValue, slug)) { value = rootValue[slug]; break; }
  }
  if (value && typeof value === "object") {
    const completed = Number(value.completed ?? value.completedLessons ?? value.done ?? 0);
    const total = Number(value.total ?? value.lessonCount ?? bySlug.get(slug)?.lessons ?? 10);
    const percent = Number(value.percent ?? value.percentage ?? (total > 0 ? completed / total * 100 : 0));
    return Math.max(0, Math.min(100, Number.isFinite(percent) ? percent : 0));
  }
  const numeric = Number(value ?? 0);
  const lessonTotal = Math.max(1, Number(bySlug.get(slug)?.lessons || 10));
  // Older course pages recorded the last completed lesson as a number; modern
  // records may store a percentage. Treat small integers as completed lessons.
  const percent = Number.isFinite(numeric) && numeric >= 0 && numeric <= lessonTotal
    ? (numeric / lessonTotal) * 100
    : numeric;
  return Math.max(0, Math.min(100, Number.isFinite(percent) ? percent : 0));
}
function completedLessonsTotal() {
  if (Array.isArray(userProfile.completedLessons)) return userProfile.completedLessons.length;
  if (userProfile.completedLessons && typeof userProfile.completedLessons === "object") return Object.values(userProfile.completedLessons).filter(Boolean).length;
  return Object.values(userProfile.progress || {}).reduce((sum, item) => {
    if (typeof item === "number") return sum + (item >= 100 ? 1 : 0);
    if (item && typeof item === "object") return sum + Number(item.completed ?? item.completedLessons ?? 0);
    return sum;
  }, 0);
}
function username() { return String(userProfile.displayName || currentUser?.displayName || currentUser?.email?.split("@")[0] || "Learner").trim() || "Learner"; }
function initials(value) { return String(value || "CA").split(/[\s._-]+/).filter(Boolean).slice(0,2).map(part => part[0].toUpperCase()).join("") || "CA"; }
function setAccent(course) {
  const config = course || {accent:"#60a5fa",accent2:"#8b5cf6"};
  document.documentElement.style.setProperty("--accent", config.accent || "#60a5fa");
  document.documentElement.style.setProperty("--accent-2", config.accent2 || "#8b5cf6");
}
function showToast(message, icon = "fa-circle-check") {
  const stack = document.getElementById("toastStack");
  if (!stack) return;
  const item = document.createElement("div"); item.className = "toast";
  const emblem = document.createElement("i"); emblem.className = `fa-solid ${icon}`;
  const text = document.createElement("span"); text.textContent = message;
  item.append(emblem, text); stack.append(item);
  window.setTimeout(() => item.remove(), 4200);
}
function safeNotificationUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^javascript:/i.test(raw) || /^data:/i.test(raw)) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  return urlFor(raw.replace(/^\.\//, ""));
}
function relativeDate(timestamp) {
  try {
    const date = timestamp?.toDate ? timestamp.toDate() : timestamp ? new Date(timestamp) : null;
    if (!date || Number.isNaN(date.getTime())) return "Recently";
    const delta = Math.max(0, Date.now() - date.getTime());
    if (delta < 60000) return "Just now";
    if (delta < 3600000) return `${Math.floor(delta / 60000)}m ago`;
    if (delta < 86400000) return `${Math.floor(delta / 3600000)}h ago`;
    if (delta < 604800000) return `${Math.floor(delta / 86400000)}d ago`;
    return date.toLocaleDateString(undefined, {month:"short", day:"numeric"});
  } catch { return "Recently"; }
}
function setUnreadBadge(count) {
  const badge = document.getElementById("notificationCount");
  if (!badge) return;
  badge.textContent = count > 99 ? "99+" : String(count);
  badge.classList.toggle("visible", count > 0);
  badge.setAttribute("aria-label", `${count} unread notifications`);
}
function renderNotificationItems(items) {
  notificationCache = [...items].sort((a,b) => {
    const getTime = x => { const d = x?.createdAt?.toDate ? x.createdAt.toDate() : new Date(x?.createdAt || 0); return Number.isNaN(d.getTime()) ? 0 : d.getTime(); };
    return getTime(b) - getTime(a);
  }).slice(0, 50);
  setUnreadBadge(notificationCache.filter(item => item.read !== true).length);
  const list = document.getElementById("notificationList");
  if (!list) return;
  list.replaceChildren();
  if (!notificationCache.length) {
    const empty = document.createElement("div"); empty.className = "notification-empty";
    const icon = document.createElement("i"); icon.className = "fa-regular fa-bell";
    const title = document.createElement("strong"); title.textContent = "You're all caught up";
    const message = document.createElement("p"); message.textContent = "Lesson events, course updates and account notifications saved to your Code Academy account will appear here.";
    empty.append(icon, title, message); list.append(empty); return;
  }
  notificationCache.forEach(item => {
    const href = safeNotificationUrl(item.link);
    const entry = document.createElement(href ? "a" : "button");
    entry.className = `notification-item${item.read === true ? "" : " unread"}`;
    if (href) entry.href = href; else entry.type = "button";
    const emblem = document.createElement("span"); emblem.className = "notification-emblem"; emblem.textContent = item.icon || "🔔";
    const copy = document.createElement("span"); copy.className = "notification-copy";
    const title = document.createElement("strong"); title.textContent = item.title || "Code Academy update";
    const message = document.createElement("p"); message.textContent = item.message || "There is a new update in your learning account.";
    const time = document.createElement("small"); time.textContent = relativeDate(item.createdAt);
    copy.append(title, message, time); entry.append(emblem, copy);
    if (item.read !== true) { const dot = document.createElement("span"); dot.className = "notification-unread-dot"; dot.setAttribute("aria-hidden", "true"); entry.append(dot); }
    entry.addEventListener("click", async event => {
      if (href) event.preventDefault();
      if (currentUser && item.read !== true && item.id) {
        try { await updateDoc(doc(db, "users", currentUser.uid, "notifications", item.id), {read:true, readAt:new Date()}); }
        catch (error) { console.warn("Could not mark notification as read", error); }
      }
      if (href) location.href = href;
      else showToast("This notification has no linked page.", "fa-bell");
    });
    list.append(entry);
  });
}
function startNotificationListener(user) {
  if (unsubscribeNotifications) unsubscribeNotifications();
  firstNotificationSnapshot = true;
  try {
    const notificationRef = collection(db, "users", user.uid, "notifications");
    unsubscribeNotifications = onSnapshot(query(notificationRef, limit(60)), snapshot => {
      const items = snapshot.docs.map(item => ({id:item.id, ...item.data()}));
      if (!firstNotificationSnapshot) {
        const fresh = snapshot.docChanges().filter(change => change.type === "added").slice(0,3);
        fresh.forEach(change => {
          const data = change.doc.data();
          if (data.read !== true && data.title) showToast(`${data.title}${data.message ? ` — ${data.message}` : ""}`, "fa-bell");
        });
      }
      firstNotificationSnapshot = false;
      renderNotificationItems(items);
    }, error => {
      console.warn("Notification feed unavailable", error);
      const list = document.getElementById("notificationList");
      if (list) list.innerHTML = '<div class="notification-empty"><i class="fa-solid fa-cloud-arrow-down"></i><strong>Notifications are temporarily unavailable</strong><p>Your learning pages still work. Check your connection and reload this page to retry.</p></div>';
      setUnreadBadge(0);
    });
  } catch (error) {
    console.warn("Could not attach notification listener", error);
    setUnreadBadge(0);
  }
}
async function markAllNotificationsRead() {
  if (!currentUser) return;
  const button = document.getElementById("markAllRead");
  if (button) button.disabled = true;
  try {
    const snapshot = await getDocs(query(collection(db, "users", currentUser.uid, "notifications"), limit(100)));
    const unread = snapshot.docs.filter(entry => entry.data().read !== true);
    if (!unread.length) { showToast("All notifications are already read.", "fa-check"); return; }
    const batch = writeBatch(db);
    unread.forEach(entry => batch.update(entry.ref, {read:true, readAt:new Date()}));
    await batch.commit();
    showToast(`${unread.length} notification${unread.length === 1 ? "" : "s"} marked as read.`, "fa-check-double");
  } catch (error) {
    console.warn("Could not mark notifications as read", error);
    showToast("Could not update notifications. Please try again.", "fa-triangle-exclamation");
  } finally { if (button) button.disabled = false; }
}

function pageChrome(content, active = "Courses") {
  root.innerHTML = `
    <header class="site-header"><div class="navbar">
      <a class="brand" href="menu.html" aria-label="Code Academy dashboard"><img src="code-academy-logo.png" alt="Code Academy logo"><span class="brand-copy"><strong>CODE ACADEMY</strong><small>Learn · Build · Grow</small></span></a>
      <button class="icon-button nav-toggle" id="navToggle" type="button" aria-label="Open navigation" aria-expanded="false"><i class="fa-solid fa-bars"></i></button>
      <nav class="main-nav" id="mainNav" aria-label="Primary navigation">
        <a class="nav-link ${active === "Courses" ? "current" : ""}" href="course.html"><i class="fa-solid fa-graduation-cap"></i><span class="nav-label">Courses</span></a>
        <a class="nav-link" href="menu.html"><i class="fa-solid fa-house"></i><span class="nav-label">Dashboard</span></a>
        <a class="nav-link" href="editor-dashboard.html"><i class="fa-solid fa-code"></i><span class="nav-label">Editors</span></a>
        <a class="nav-link" href="progress.html"><i class="fa-solid fa-chart-line"></i><span class="nav-label">Progress</span></a>
      </nav>
      <div class="nav-right"><button class="icon-button notification-toggle" id="notificationToggle" type="button" aria-label="Open notifications" aria-controls="notificationPanel" aria-expanded="false"><i class="fa-regular fa-bell"></i><span class="notification-count" id="notificationCount">0</span></button><a href="profile.html" class="profile-chip" aria-label="Open profile"><span class="profile-avatar" id="profileAvatar">CA</span><span class="profile-copy"><strong id="profileName">Learner</strong><small><span id="profileXp">0 XP</span> · <span id="profileStreak">0 day streak</span></small></span></a></div>
    </div></header>
    <main class="page-wrap">${content}</main>
    <footer class="site-footer"><div>© 2026 <strong>Code Academy</strong> · Learn · Build · Become a developer</div><nav class="footer-links" aria-label="Footer"><a href="aboutus.html">About</a><a href="community.html">Community</a><a href="contactus.html">Support</a><a href="privacy.html">Privacy</a></nav></footer>
    <div class="notification-scrim" id="notificationScrim"></div><aside class="notification-panel" id="notificationPanel" aria-label="Notifications" aria-hidden="true"><div class="notification-panel-head"><div><h2>Notifications</h2><p>Updates from your Code Academy account</p></div><div class="notification-actions"><button class="secondary-button button-small" type="button" id="markAllRead">Mark all read</button><button class="plain-icon-button" type="button" id="closeNotifications" aria-label="Close notifications"><i class="fa-solid fa-xmark"></i></button></div></div><div class="notification-list" id="notificationList"><div class="notification-empty"><div class="loading-orbit"></div><p>Loading your notification feed…</p></div></div></aside>
    <div class="toast-stack" id="toastStack" aria-live="polite" aria-atomic="false"></div>`;
  const navToggle = document.getElementById("navToggle");
  const nav = document.getElementById("mainNav");
  navToggle?.addEventListener("click", () => { const open = nav.classList.toggle("open"); navToggle.setAttribute("aria-expanded", String(open)); navToggle.innerHTML = `<i class="fa-solid ${open ? "fa-xmark" : "fa-bars"}"></i>`; });
  const panel = document.getElementById("notificationPanel");
  const scrim = document.getElementById("notificationScrim");
  const toggle = document.getElementById("notificationToggle");
  const close = () => { panel.classList.remove("open"); scrim.classList.remove("open"); panel.setAttribute("aria-hidden","true"); toggle?.setAttribute("aria-expanded","false"); };
  const open = () => { panel.classList.add("open"); scrim.classList.add("open"); panel.setAttribute("aria-hidden","false"); toggle?.setAttribute("aria-expanded","true"); document.getElementById("closeNotifications")?.focus(); };
  toggle?.addEventListener("click", () => panel.classList.contains("open") ? close() : open());
  document.getElementById("closeNotifications")?.addEventListener("click", close);
  scrim?.addEventListener("click", close);
  document.getElementById("markAllRead")?.addEventListener("click", markAllNotificationsRead);
  document.addEventListener("keydown", event => { if (event.key === "Escape") close(); }, {once:false});
}
function footerIcon(url, icon) { return url || icon || "fa-solid fa-code"; }
function renderCatalogCard(course) {
  const p = getProgressValue(course.slug);
  const imageClass = course.cover.endsWith(".png") || course.cover.endsWith(".jpg") ? "" : "";
  return `<article class="course-card" style="--accent:${course.accent}">
    <a class="course-card-art" href="${esc(course.homeFile)}" aria-label="Explore ${esc(course.name)} course"><span class="course-rank">Track ${String(courses.indexOf(course)+1).padStart(2,"0")}</span><span class="course-level">${esc(course.level)}</span><img class="${imageClass}" src="${esc(course.cover)}" alt="${esc(course.name)} course artwork" loading="lazy" onerror="this.style.display='none'"></a>
    <div class="course-card-body"><div class="course-card-heading"><div><h3>${esc(course.shortName || course.name)}</h3><div class="course-category">${esc(course.category)}</div></div><span class="path-icon" aria-hidden="true"><i class="fa-solid fa-arrow-up-right-from-square"></i></span></div>
      <p class="course-card-desc">${esc(course.description)}</p><div class="course-tags">${course.skills.slice(0,3).map(skill => `<span class="course-tag">${esc(skill)}</span>`).join("")}</div>
      <div class="course-card-bottom"><span class="course-lesson-count"><i class="fa-regular fa-bookmark"></i>${course.lessons} guided lessons · ${Math.round(p)}% progress</span><a class="primary-button" href="${esc(course.homeFile)}">Explore track <i class="fa-solid fa-arrow-right"></i></a></div><div class="progress-track" aria-label="${Math.round(p)} percent complete"><div class="progress-fill" style="width:${p}%"></div></div>
    </div></article>`;
}
function renderCatalog() {
  const content = `
    <section class="catalog-hero"><div><span class="eyebrow"><span class="eyebrow-dot"></span> Your next skill starts here</span><h1>Choose a path.<br><em>Build something real.</em></h1><p>Explore programming languages, modern web development and security tracks. Every course home brings the lesson dashboard, real coding tools, practice resources and learning shortcuts together in one responsive space.</p><div class="button-row"><a class="primary-button" href="#courseCatalogue"><i class="fa-solid fa-compass"></i> Explore 22 tracks</a><a class="secondary-button" href="menu.html"><i class="fa-solid fa-arrow-left"></i> Back to dashboard</a></div><div class="catalog-top-stats"><div class="catalog-top-stat"><strong>22</strong><span>Learning tracks</span></div><div class="catalog-top-stat"><strong>17+</strong><span>Focused coding workspaces</span></div><div class="catalog-top-stat"><strong>Hands-on</strong><span>Lessons & practice</span></div></div></div><div class="catalog-art" aria-label="Code Academy course artwork"><div class="orbit-ring"></div><img src="coding-hero.png" alt="Code Academy coding and learning illustration" loading="eager"></div></section>
    <section class="stats-grid" aria-label="Learning summary"><div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-bolt"></i></div><div class="stat-text"><strong id="catalogXp">0 XP</strong><span>Total experience earned</span></div></div><div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-check-double"></i></div><div class="stat-text"><strong id="catalogCompleted">0</strong><span>Recorded lesson completions</span></div></div><div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-fire"></i></div><div class="stat-text"><strong id="catalogStreak">0 days</strong><span>Current learning streak</span></div></div><div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-layer-group"></i></div><div class="stat-text"><strong>22</strong><span>Courses, including security</span></div></div></section>
    <section id="courseCatalogue" aria-labelledby="catalogHeading"><div class="section-heading"><div><span class="eyebrow"><span class="eyebrow-dot"></span> Course library</span><h2 id="catalogHeading">Find your next course</h2><p>Open the new course home first, then choose Start Lesson to enter the original lesson dashboard for that track.</p></div><a class="text-link" href="editor-dashboard.html">Browse coding editors <i class="fa-solid fa-arrow-right"></i></a></div>
    <div class="catalog-controls"><label class="search-box"><i class="fa-solid fa-magnifying-glass"></i><input id="courseSearch" type="search" placeholder="Search by language, skill, or course…" autocomplete="off" aria-label="Search courses"></label><div class="filter-row" id="courseFilters" aria-label="Filter courses"><button class="filter-chip active" type="button" data-filter="All">All tracks</button><button class="filter-chip" type="button" data-filter="Web Development">Web</button><button class="filter-chip" type="button" data-filter="Programming">Programming</button><button class="filter-chip" type="button" data-filter="Data">Data</button><button class="filter-chip" type="button" data-filter="Security">Security</button></div></div>
    <div class="catalog-subhead"><h2>Learning tracks</h2><span id="resultsCount">22 tracks available</span></div><div class="catalog-grid" id="catalogGrid">${courses.map(renderCatalogCard).join("")}</div></section>`;
  pageChrome(content, "Courses");
  const searchInput = document.getElementById("courseSearch");
  const grid = document.getElementById("catalogGrid");
  const results = document.getElementById("resultsCount");
  const rerender = () => {
    const queryText = searchText.toLowerCase();
    const items = courses.filter(course => (activeFilter === "All" || course.category === activeFilter) && `${course.name} ${course.shortName || ""} ${course.description} ${course.skills.join(" ")} ${course.category}`.toLowerCase().includes(queryText));
    grid.innerHTML = items.length ? items.map(renderCatalogCard).join("") : '<div class="empty-state"><i class="fa-solid fa-magnifying-glass"></i><h3>No matching tracks</h3><p>Try a different course name, skill, or category.</p></div>';
    results.textContent = `${items.length} track${items.length === 1 ? "" : "s"} ${items.length ? "available" : "found"}`;
  };
  searchInput.addEventListener("input", () => { searchText = searchInput.value.trim(); rerender(); });
  document.querySelectorAll("[data-filter]").forEach(button => button.addEventListener("click", () => { activeFilter = button.dataset.filter; document.querySelectorAll("[data-filter]").forEach(b => b.classList.toggle("active", b === button)); rerender(); }));
  updateProfileUI();
}

function actionList(course) {
  const hrefResource = topic => resourceUrl(course, topic);
  const actions = [
    ["Start lessons", lessonUrl(course), "fa-solid fa-play", "Enter the original dashboard and choose a lesson.", "Open lesson dashboard"],
    [course.editorLabel, editorUrl(course), "fa-solid fa-laptop-code", "Practice in an existing Code Academy tool.", "Open practice tool"],
    ["Quick knowledge check", hrefResource("quiz"), "fa-solid fa-list-check", "Check your understanding with a course-specific question.", "Try a quiz"],
    ["Mini project studio", hrefResource("projects"), "fa-solid fa-diagram-project", "Choose a real project idea and break it into steps.", "Build a project"],
    ["Learning roadmap", hrefResource("roadmap"), "fa-solid fa-route", "Follow a clear sequence of skills from foundations to projects.", "View roadmap"],
    ["Pocket cheat sheet", hrefResource("cheatsheet"), "fa-solid fa-book-open", "Keep the key syntax and concepts close while you practice.", "View reference"],
    ["Challenge lab", hrefResource("challenge"), "fa-solid fa-bullseye", "Work through a guided practical challenge.", "Start challenge"],
    ["7-day study sprint", hrefResource("study-plan"), "fa-solid fa-calendar-check", "Turn short daily practice sessions into a learning habit.", "Build a routine"],
    ["Core concepts", hrefResource("concepts"), "fa-solid fa-lightbulb", "Review the essential concepts and why they matter.", "Review concepts"],
    ["Course progress", "progress.html", "fa-solid fa-chart-line", "Review progress, activity and learning milestones.", "View progress"],
    ["Certificates & achievements", "certificate.html", "fa-solid fa-award", "Check course achievements and certificate requirements.", "Explore awards"],
    ["Learner community", "community.html", "fa-solid fa-people-group", "Connect with the Code Academy learning community.", "Visit community"],
    ["Ask the AI Mentor", "AI%20Mentor.html?course=" + encodeURIComponent(course.slug), "fa-solid fa-wand-magic-sparkles", "Get help unpacking a concept or planning what to practice.", "Open AI Mentor"],
    ["Personal study notes", "note.html?course=" + encodeURIComponent(course.slug), "fa-solid fa-note-sticky", "Save explanations and ideas for your next session.", "Open notes"],
    ["Multi-language workspace", `CODEEDITOR.html?lang=${encodeURIComponent(course.editorLang || "web")}`, "fa-solid fa-code", "Use the full editor workspace for files, projects and supported runtimes.", "Open workspace"],
    ["Editor library", "editor-dashboard.html", "fa-solid fa-terminal", "Browse the dedicated workspaces already built into Code Academy.", "Choose an editor"],
    ["Ready-made projects", "ready-projects.html", "fa-solid fa-cubes", "Browse practical project briefs you can build on.", "Browse projects"],
    ["Project workspace", "project.html?course=" + encodeURIComponent(course.slug), "fa-solid fa-folder-tree", "Organize and manage your coding projects.", "Open projects"],
    ["Textbook library", "textbook-library-v3.html?course=" + encodeURIComponent(course.slug), "fa-solid fa-book", "Browse learning materials from the Code Academy library.", "Open library"],
    ["Security & safety center", "security-center.html", "fa-solid fa-shield-halved", "Review account safety and responsible online practice.", "Open security center"],
    ["Browse all courses", "course.html", "fa-solid fa-compass", "Return to the full course catalogue and explore another path.", "View all tracks"]
  ];
  return actions;
}
function renderCourseHome(course) {
  setAccent(course);
  const p = getProgressValue(course.slug);
  const headline = course.name === "React Development" ? ["Build interfaces with", "React"]
    : course.name === "Cybersecurity" ? ["Build confidence through", "cyber defense"]
    : course.name === "Ethical Hacking" ? ["Practice security with", "ethical hacking"]
    : ["Master", course.shortName || course.name];
  const pillars = [
    {title:"Learn the foundations",desc:`Build a clear mental model of ${course.shortName || course.name} before moving into more advanced work.`,icon:"fa-solid fa-book-open"},
    {title:"Practice with feedback",desc:"Use real workspace routes, quizzes and step-by-step challenges to test what you understand.",icon:"fa-solid fa-code"},
    {title:"Make something useful",desc:"Apply each new skill in small projects and strengthen it through deliberate practice.",icon:"fa-solid fa-rocket"},
    {title:"Track your progress",desc:"Keep your lessons, study notes, progress and achievements connected to your account.",icon:"fa-solid fa-chart-line"}
  ];
  const content = `
    <section class="hero"><div class="hero-copy"><span class="eyebrow"><span class="eyebrow-dot"></span>${esc(course.category)} · Code Academy track</span><h1>${esc(headline[0])} <span class="accent-text">${esc(headline[1])}</span></h1><p class="hero-tagline">${esc(course.tagline)}</p><p class="hero-lead">${esc(course.description)}</p><div class="hero-mini-meta"><span class="meta-pill"><i class="fa-solid fa-signal"></i>${esc(course.level)}</span><span class="meta-pill"><i class="fa-regular fa-bookmark"></i>${course.lessons} lessons</span><span class="meta-pill"><i class="fa-solid fa-sparkles"></i>Practical learning path</span></div><div class="button-row"><a class="primary-button" href="${esc(lessonUrl(course))}"><i class="fa-solid fa-play"></i> Start Lesson <i class="fa-solid fa-arrow-right"></i></a><a class="secondary-button" href="${esc(editorUrl(course))}"><i class="fa-solid fa-laptop-code"></i>${esc(course.editorLabel)}</a><a class="secondary-button" href="${esc(resourceUrl(course,"roadmap"))}"><i class="fa-solid fa-route"></i>View learning path</a></div></div>
      <div class="hero-visual"><div class="hero-image-frame"><img class="${course.cover.endsWith(".png") || course.cover.endsWith(".jpg") ? "cover-photo" : ""}" src="${esc(course.cover)}" alt="${esc(course.name)} course artwork" onerror="this.style.display='none'"></div><div class="floating-chip one"><i class="fa-solid fa-bolt"></i><span>${esc(course.skills[0])}</span></div><div class="floating-chip two"><i class="fa-solid fa-check-circle"></i><span>Build · Practice · Improve</span></div><div class="floating-chip three"><i class="fa-solid fa-layer-group"></i><span>${course.lessons} guided lessons</span></div></div></section>
    <section class="stats-grid" aria-label="Course overview"><div class="stat-card"><div class="stat-icon"><i class="fa-regular fa-bookmark"></i></div><div class="stat-text"><strong>${course.lessons}</strong><span>Structured lessons</span></div></div><div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-chart-line"></i></div><div class="stat-text"><strong>${Math.round(p)}%</strong><span>Your track progress<div class="progress-track"><div class="progress-fill" style="width:${p}%"></div></div></span></div></div><div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-bolt"></i></div><div class="stat-text"><strong>${formatCount(userProfile.xp || 0)} XP</strong><span>Total account experience</span></div></div><div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-wand-magic-sparkles"></i></div><div class="stat-text"><strong>21</strong><span>Course actions & resources</span></div></div></section>
    <section class="learning-section"><div class="section-heading"><div><span class="eyebrow"><span class="eyebrow-dot"></span>Your learning journey</span><h2>A clear path from learning to building</h2><p>Use these stages to keep momentum, then jump into any of the course tools below.</p></div><a class="text-link" href="${esc(lessonUrl(course))}">Go to lesson dashboard <i class="fa-solid fa-arrow-right"></i></a></div><div class="learning-path">${pillars.map((pillar,index)=>`<article class="path-card"><div class="path-top"><span class="path-number">STAGE ${String(index+1).padStart(2,"0")}</span><span class="path-icon"><i class="${pillar.icon}"></i></span></div><h3>${esc(pillar.title)}</h3><p>${esc(pillar.desc)}</p></article>`).join("")}</div></section>
    <section class="learning-section" id="courseLaunchpad"><div class="section-heading"><div><span class="eyebrow"><span class="eyebrow-dot"></span>Course launchpad</span><h2>Everything for your next session</h2><p>Lesson dashboard, authentic editors, guided resources and account tools—each action has a working destination.</p></div><span class="meta-pill"><i class="fa-solid fa-link"></i>21 working actions</span></div><div class="launchpad">${actionList(course).map((action,index)=>`<a class="launch-card" href="${esc(urlFor(action[1]))}" aria-label="${esc(action[0])}"><div class="launch-top"><span class="launch-icon"><i class="${action[2]}"></i></span><i class="fa-solid fa-arrow-up-right-from-square launch-arrow"></i></div><h3>${esc(action[0])}</h3><p>${esc(action[3])}</p><span class="launch-link-label">${esc(action[4])} <i class="fa-solid fa-arrow-right"></i></span></a>`).join("")}</div></section>
    <section class="skills-band"><div class="skills-copy"><strong>Skills you will build in ${esc(course.shortName || course.name)}</strong><p>Revisit these focus areas as you complete lessons and practice tasks.</p></div><div class="skill-tags">${course.skills.map(skill=>`<span class="skill-tag">${esc(skill)}</span>`).join("")}</div></section>`;
  pageChrome(content, "Courses");
  updateProfileUI();
}

function topicData(course, topic) {
  const chosen = {
    roadmap:{eyebrow:"LEARNING ROADMAP",title:`Your ${course.shortName || course.name} path`,intro:"Move through a simple learning rhythm: understand one idea, see it in context, practice it, and use it in a small build.",steps:["Learn the core idea", "Read and test a worked example", "Complete a focused practice task", "Use the skill in a mini project"],sideTitle:"Make progress stick",sideText:"Short, regular practice is more useful than rushing through many concepts at once. After each lesson, explain the idea in your own words and change one thing in the example."},
    cheatsheet:{eyebrow:"POCKET CHEAT SHEET",title:`${course.shortName || course.name} quick reference`,intro:"A compact starter example from this track. Change the names, values and structure to see how the pieces behave, then return to the lessons for the full explanation.",steps:["Read the syntax slowly", "Change one value", "Predict the output before running it", "Save the version you understand"],sideTitle:"Practice with intent",sideText:"A cheat sheet is a reminder, not a replacement for understanding. When a line feels unfamiliar, visit the course lessons and rebuild the example yourself."},
    quiz:{eyebrow:"KNOWLEDGE CHECK",title:`Check your ${course.shortName || course.name} fundamentals`,intro:"Choose the strongest answer, submit it and read the explanation. Use the result to decide what to review next.",steps:["Choose one answer", "Submit to reveal feedback", "Read why it is correct", "Review the related lesson if needed"],sideTitle:"A useful quiz habit",sideText:"Try to explain why the other options are incorrect too. That turns a quick question into a stronger mental model."},
    projects:{eyebrow:"PROJECT STUDIO",title:`Build with ${course.shortName || course.name}`,intro:"Use these project prompts to turn course concepts into something tangible. Begin with the smallest working version before adding polish.",steps:course.projects,sideTitle:"How to start a project",sideText:"Write down the goal, list the smallest features, build one feature at a time, and test each change before adding more complexity."},
    challenge:{eyebrow:"PRACTICE CHALLENGE",title:`The ${course.shortName || course.name} skill sprint`,intro:"Turn theory into an outcome. Work through this short task without copying the answer, then compare your solution with the lesson concepts.",steps:[`Create a small example using ${course.skills[0]}.`,`Add a second requirement using ${course.skills[1]}.`,`Test an edge case and note what changed.`,`Write a two-sentence explanation of how your solution works.`],sideTitle:"Challenge rules",sideText:course.category === "Security" ? "Use only synthetic examples, local practice material or systems you own or are explicitly authorized to assess. Never test third-party systems without permission." : "Keep the first version simple and working. A clear solution you understand is a better starting point than a complex solution you cannot explain."},
    "study-plan":{eyebrow:"7-DAY STUDY SPRINT",title:`A steady week with ${course.shortName || course.name}`,intro:"A flexible one-week plan for building a routine. Adjust the length of each session to your schedule and repeat the week when a concept needs another pass.",steps:["Day 1 — Review the basics and take notes", "Day 2 — Work through one guided lesson", "Day 3 — Rebuild the example from memory", "Day 4 — Try the course knowledge check", "Day 5 — Add one feature to a mini project", "Day 6 — Review mistakes and revise notes", "Day 7 — Show what you built and plan the next topic"],sideTitle:"Keep the plan realistic",sideText:"A 20-minute focused session can move you forward. Mark a day complete after you actively practice—not merely after you open the page."},
    concepts:{eyebrow:"CONCEPT EXPLORER",title:`The ideas behind ${course.shortName || course.name}`,intro:`Use these core areas as a checklist. They connect the main ideas you will see throughout the ${course.name} course.`,steps:course.skills,sideTitle:"Learn actively",sideText:"For every concept, ask: what problem does it solve, when should I use it, and what is a small example I can write without looking?"}
  };
  return chosen[topic] || chosen.roadmap;
}
function renderResource() {
  const params = new URLSearchParams(location.search);
  const course = bySlug.get(params.get("course")) || courses[0];
  const topic = params.get("topic") || "roadmap";
  setAccent(course);
  const data = topicData(course, topic);
  const isQuiz = topic === "quiz";
  const isCode = topic === "cheatsheet";
  const stepHeadings = {
    roadmap:["Understand the idea","See it in context","Practice actively","Apply it in a build"],
    cheatsheet:["Read the syntax","Change one detail","Predict the result","Explain it yourself"],
    quiz:["Choose an answer","Submit your choice","Read the explanation","Pick a review topic"],
    projects:["Project idea 1","Project idea 2","Project idea 3"],
    challenge:["Challenge task 1","Challenge task 2","Challenge task 3","Challenge task 4"],
    "study-plan":["Day 1","Day 2","Day 3","Day 4","Day 5","Day 6","Day 7"],
    concepts:["Core area 1","Core area 2","Core area 3","Core area 4"]
  };
  const steps = data.steps.map((step,index)=>{
    const text = String(step);
    const daySplit = text.includes("—") ? text.split("—") : null;
    const heading = daySplit ? daySplit[0].trim() : (stepHeadings[topic]?.[index] || `Step ${index+1}`);
    const detail = daySplit ? daySplit.slice(1).join("—").trim() : text;
    return `<div class="resource-step"><span class="resource-step-num">${String(index+1).padStart(2,"0")}</span><div><strong>${esc(heading)}</strong><span>${esc(detail)}</span></div></div>`;
  }).join("");
  const quizBlock = isQuiz ? `<section class="resource-panel" id="quizCard"><h2>One question to check your understanding</h2><p>${esc(course.quiz.question)}</p><form id="resourceQuiz">${course.quiz.options.map((option,index)=>`<label class="quiz-option"><input type="radio" name="answer" value="${index}" required><span>${esc(option)}</span></label>`).join("")}<button class="primary-button" type="submit"><i class="fa-solid fa-check"></i> Check answer</button><div id="quizFeedback" class="quiz-feedback" role="status" aria-live="polite"></div></form></section>` : "";
  const codeBlock = isCode ? `<div class="code-sample"><div class="code-sample-head"><span>${esc(course.name)} · starter snippet</span><button type="button" class="secondary-button button-small" id="copySnippet"><i class="fa-regular fa-copy"></i> Copy code</button></div><pre><code id="snippetCode">${esc(course.snippet)}</code></pre></div>` : "";
  const content = `<section class="resource-hero"><span class="eyebrow"><span class="eyebrow-dot"></span>${esc(course.name)} · ${esc(data.eyebrow)}</span><h1>${esc(data.title)}</h1><p>${esc(data.intro)}</p><div class="button-row" style="margin-top:22px"><a class="primary-button" href="${esc(lessonUrl(course))}"><i class="fa-solid fa-play"></i> Start Lesson</a><a class="secondary-button" href="${esc(urlFor(course.homeFile))}"><i class="fa-solid fa-arrow-left"></i> Back to course home</a></div></section><div class="resource-layout"><section class="resource-panel"><h2>${isQuiz ? "How to use this check" : isCode ? "Starter example" : topic === "projects" ? "Choose a project prompt" : "Your next steps"}</h2><p>${esc(data.intro)}</p><div class="resource-list">${steps}</div>${codeBlock}</section><aside class="resource-panel"><h2>${esc(data.sideTitle)}</h2><p>${esc(data.sideText)}</p>${quizBlock}<div style="margin-top:20px" class="button-row"><a class="secondary-button button-small" href="${esc(editorUrl(course))}"><i class="fa-solid fa-laptop-code"></i> ${esc(course.editorLabel)}</a><a class="secondary-button button-small" href="${esc(resourceUrl(course,topic === "quiz" ? "cheatsheet" : "quiz"))}"><i class="fa-solid fa-arrow-right-arrow-left"></i> ${topic === "quiz" ? "Open cheat sheet" : "Try quick quiz"}</a></div></aside></div>`;
  pageChrome(content, "Courses");
  updateProfileUI();
  if (isQuiz) {
    document.getElementById("resourceQuiz")?.addEventListener("submit", event => {
      event.preventDefault();
      const selected = new FormData(event.currentTarget).get("answer");
      const feedback = document.getElementById("quizFeedback");
      const correct = Number(selected) === Number(course.quiz.answer);
      feedback.className = `quiz-feedback visible ${correct ? "correct" : "wrong"}`;
      feedback.textContent = `${correct ? "Correct — well done." : "Not quite yet."} ${course.quiz.explanation}`;
    });
  }
  if (isCode) {
    document.getElementById("copySnippet")?.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(course.snippet); showToast("Starter code copied.", "fa-copy"); }
      catch { showToast("Clipboard permission was blocked by this browser.", "fa-triangle-exclamation"); }
    });
  }
}
function updateProfileUI() {
  const profileName = document.getElementById("profileName");
  const profileXp = document.getElementById("profileXp");
  const profileStreak = document.getElementById("profileStreak");
  const avatar = document.getElementById("profileAvatar");
  if (profileName) profileName.textContent = username();
  if (profileXp) profileXp.textContent = `${formatCount(userProfile.xp || 0)} XP`;
  if (profileStreak) profileStreak.textContent = `${formatCount(userProfile.streak || 0)} day streak`;
  if (avatar) {
    if (userProfile.photoURL || currentUser?.photoURL) {
      const img = document.createElement("img"); img.src = userProfile.photoURL || currentUser.photoURL; img.alt = ""; img.referrerPolicy = "no-referrer";
      img.onerror = () => { avatar.textContent = initials(username()); };
      avatar.replaceChildren(img);
    } else avatar.textContent = initials(username());
  }
  const xp = document.getElementById("catalogXp"); if (xp) xp.textContent = `${formatCount(userProfile.xp || 0)} XP`;
  const completed = document.getElementById("catalogCompleted"); if (completed) completed.textContent = formatCount(completedLessonsTotal());
  const streak = document.getElementById("catalogStreak"); if (streak) streak.textContent = `${formatCount(userProfile.streak || 0)} days`;
}

function startApp(user) {
  currentUser = user;
  const isGoogle = user.providerData?.some(provider => provider.providerId === "google.com");
  const requiresVerification = !user.emailVerified && !isGoogle && user.providerData?.some(provider => provider.providerId === "password");
  if (requiresVerification) { location.replace("email-action.html?pending=1"); return; }
  getDoc(doc(db, "users", user.uid)).then(snapshot => {
    if (snapshot.exists()) userProfile = snapshot.data() || {};
    else userProfile = {displayName:user.displayName || "Learner", email:user.email || "", xp:0, streak:0};
    if (pageType === "home") {
      const course = bySlug.get(courseSlug);
      if (!course) { location.replace("course.html"); return; }
      document.title = `${course.name} Course Home | Code Academy`;
      renderCourseHome(course);
    } else if (pageType === "resource") {
      const params = new URLSearchParams(location.search);
      const resourceCourse = bySlug.get(params.get("course")) || courses[0];
      document.title = `${resourceCourse.name} Learning Resource | Code Academy`;
      renderResource();
    } else {
      document.title = "Code Academy | Courses";
      renderCatalog();
    }
    startNotificationListener(user);
    const loader = document.getElementById("bootScreen");
    loader?.classList.add("is-hidden");
  }).catch(error => {
    console.error("Could not load learner profile", error);
    userProfile = {displayName:user.displayName || "Learner", email:user.email || "", xp:0, streak:0};
    if (pageType === "home" && bySlug.has(courseSlug)) renderCourseHome(bySlug.get(courseSlug));
    else if (pageType === "resource") renderResource();
    else renderCatalog();
    startNotificationListener(user);
    document.getElementById("bootScreen")?.classList.add("is-hidden");
    showToast("Your pages are ready, but account statistics could not be loaded.", "fa-circle-info");
  });
}

if (root) {
  document.body.insertAdjacentHTML("afterbegin", '<div class="boot-screen" id="bootScreen"><div class="boot-card"><div class="boot-mark">CA</div><div class="loading-orbit"></div><strong>Preparing your learning space…</strong><span style="font-size:11px;color:#8fa2bb">Connecting your Code Academy account</span></div></div>');
  onAuthStateChanged(auth, user => {
    if (!user) { location.replace("login.html"); return; }
    startApp(user);
  });
}
