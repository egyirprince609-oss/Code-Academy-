/* Code Academy certificate rules shared by the certificate pages. */
export const COURSES = [
  {id:'html',name:'HTML',title:'HTML Developer',icon:'fa-code',description:'Semantic structure, forms, accessibility and modern HTML.',skills:['Document Structure','Semantic HTML','Forms','Accessibility']},
  {id:'css',name:'CSS',title:'CSS Developer',icon:'fa-palette',description:'Styling systems, layout, responsive design and animation.',skills:['Selectors','Box Model','Flexbox','Grid','Responsive Design']},
  {id:'javascript',name:'JavaScript',title:'JavaScript Developer',icon:'fa-bolt',description:'Programming logic, browser interactions and modern JavaScript.',skills:['Variables','Functions','DOM','Events','Async JavaScript']},
  {id:'python',name:'Python',title:'Python Developer',icon:'fa-brands fa-python',description:'Readable programming, data structures and practical problem solving.',skills:['Syntax','Data Types','Loops','Functions','Object-Oriented Programming']},
  {id:'react',name:'React',title:'React Developer',icon:'fa-atom',description:'Reusable components, state, hooks and interface architecture.',skills:['Components','Props','State','Hooks','Application Architecture']},
  {id:'java',name:'Java',title:'Java Developer',icon:'fa-mug-hot',description:'Object-oriented programming and reliable application design.',skills:['Syntax','Methods','OOP','Collections','Exception Handling']},
  {id:'c',name:'C',title:'C Developer',icon:'fa-terminal',description:'Procedural programming, pointers and memory fundamentals.',skills:['Syntax','Functions','Pointers','Arrays','Memory Concepts']},
  {id:'cplusplus',name:'C++',title:'C++ Developer',icon:'fa-gears',description:'C++ programming, classes, algorithms and the standard library.',skills:['Syntax','OOP','Classes','STL','Algorithms']},
  {id:'csharp',name:'C#',title:'C# Developer',icon:'fa-hashtag',description:'Modern C# syntax, application patterns and data handling.',skills:['Syntax','Classes','OOP','LINQ','Application Development']},
  {id:'php',name:'PHP',title:'PHP Developer',icon:'fa-server',description:'Server-side scripting, forms, sessions and web application logic.',skills:['Syntax','Variables','Functions','Forms','Sessions']},
  {id:'typescript',name:'TypeScript',title:'TypeScript Developer',icon:'fa-shield-halved',description:'Typed JavaScript, interfaces and safer application architecture.',skills:['Types','Interfaces','Generics','Classes','Modules']},
  {id:'go',name:'Go',title:'Go Developer',icon:'fa-golang',description:'Go language foundations, concurrency and dependable services.',skills:['Syntax','Functions','Structs','Concurrency','Error Handling']},
  {id:'rust',name:'Rust',title:'Rust Developer',icon:'fa-cubes',description:'Ownership, borrowing and memory-safe systems programming.',skills:['Ownership','Borrowing','Structs','Traits','Memory Safety']},
  {id:'kotlin',name:'Kotlin',title:'Kotlin Developer',icon:'fa-mobile-screen',description:'Modern Kotlin language features and safe application development.',skills:['Syntax','Classes','Functions','Null Safety','Collections']},
  {id:'swift',name:'Swift',title:'Swift Developer',icon:'fa-feather-pointed',description:'Swift language foundations, protocols and application development.',skills:['Syntax','Functions','Classes','Protocols','App Development']},
  {id:'dart',name:'Dart',title:'Dart Developer',icon:'fa-bullseye',description:'Dart syntax, collections, classes and asynchronous programming.',skills:['Syntax','Functions','Classes','Collections','Async Programming']},
  {id:'ruby',name:'Ruby',title:'Ruby Developer',icon:'fa-gem',description:'Expressive syntax, methods, blocks and object-oriented design.',skills:['Syntax','Methods','Classes','Blocks','Collections']},
  {id:'sql',name:'SQL',title:'SQL Developer',icon:'fa-database',description:'Structured queries, filtering, joins and data aggregation.',skills:['Queries','Tables','Filtering','Joins','Aggregation']},
  {id:'r',name:'R',title:'R Developer',icon:'fa-chart-line',description:'Data analysis, statistics, vectors and visualization.',skills:['Syntax','Data Analysis','Vectors','Statistics','Visualization']},
  {id:'lua',name:'Lua',title:'Lua Developer',icon:'fa-moon',description:'Lightweight scripting, tables, functions and metatables.',skills:['Syntax','Functions','Tables','Modules','Scripting']}
];

export const ALIASES = {
  js:'javascript', py:'python', cpp:'cplusplus', 'c++':'cplusplus', 'c-plus-plus':'cplusplus',
  cplusplus:'cplusplus', 'c#':'csharp', 'c-sharp':'csharp', nodejs:'javascript'
};
export const normalizeCourseId = value => {
  const raw = String(value ?? '').trim().toLowerCase().replace(/\s+/g,'-');
  return ALIASES[raw] || raw.replace(/-+/g,'-');
};
export const courseById = id => COURSES.find(c => c.id === normalizeCourseId(id));
export const credentialKey = (courseId, level) => `${normalizeCourseId(courseId)}_${String(level||'').toLowerCase().replace(/[^a-z0-9]+/g,'_')}`;
export const levelInfo = level => {
  const value = String(level||'').toLowerCase();
  if (value.includes('grand') || value.includes('master')) return {key:'grand_master',title:'Grand Master',name:'Code Academy Grand Master Certificate',lessons:10,theme:'grandmaster'};
  if (value.includes('begin')) return {key:'beginner',title:'Beginner',name:'Certificate of Foundations',lessons:5,theme:'beginner'};
  return {key:'professional',title:'Professional',name:'Professional Certificate of Achievement',lessons:10,theme:'professional'};
};

function object(value){ return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
function courseAliases(id){
  const canonical = normalizeCourseId(id);
  return canonical === 'cplusplus' ? ['cplusplus','cpp','c++','c-plus-plus'] : [canonical];
}
function lessonNumberFromId(value, aliases){
  const str = String(value||'').toLowerCase();
  for (const alias of aliases) {
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    const match = str.match(new RegExp(`^${escaped}(?:_lesson_|-lesson-|_lesson-|_lesson)(\\d+)$`));
    if (match) return Number(match[1]);
  }
  return null;
}

export function completedLessons(data, courseId){
  const aliases = courseAliases(courseId);
  const progress = object(data?.progress);
  let count = 0;
  for (const alias of aliases) {
    const item = progress[alias];
    if (typeof item === 'number' && Number.isFinite(item)) count = Math.max(count, item);
    else if (item && typeof item === 'object') {
      const value = Number(item.completed ?? item.lastCompleted ?? 0);
      if (Number.isFinite(value)) count = Math.max(count, value);
    }
  }
  const raw = data?.completedLessons;
  const ids = Array.isArray(raw) ? raw.map(String) : Object.entries(object(raw)).filter(([,v])=>v===true||v===1).map(([k])=>k);
  const lessonIds = new Set();
  for (const id of ids) {
    const n = lessonNumberFromId(id, aliases);
    if (n && n >= 1 && n <= 10) lessonIds.add(n);
  }
  if (lessonIds.size) count = Math.max(count, ...lessonIds);
  return Math.max(0, Math.min(10, Math.floor(count)));
}

function scoreFromResults(data, courseId, maxLesson){
  const results = object(data?.lessonQuestionResults);
  const aliases = courseAliases(courseId);
  let correct = 0, total = 0;
  for (let n=1;n<=maxLesson;n++) {
    let record = null;
    for (const alias of aliases) {
      const candidate = results[`${alias}_${n}`];
      if (candidate && typeof candidate === 'object') { record = candidate; break; }
    }
    for (const result of Object.values(object(record))) {
      if (!result || result.answered !== true || typeof result.correct !== 'boolean') continue;
      total++;
      if (result.correct) correct++;
    }
  }
  return {correct,total,percent:total ? Math.round(correct/total*100) : 0};
}

function scoreFromHistory(history, courseId, maxLesson){
  const aliases = new Set(courseAliases(courseId));
  const latest = new Map();
  for (const item of history || []) {
    if (!aliases.has(normalizeCourseId(item.course))) continue;
    const lesson = Number(item.lesson);
    if (!Number.isFinite(lesson) || lesson < 1 || lesson > maxLesson) continue;
    const correctValue = typeof item.isCorrect === 'boolean' ? item.isCorrect : (typeof item.correctResult === 'boolean' ? item.correctResult : null);
    if (correctValue === null) continue;
    const qid = String(item.questionId || item.question || item.id || `${lesson}_${latest.size}`);
    const key = `${lesson}_${qid}`;
    const time = item.createdAt?.seconds ? item.createdAt.seconds*1000 : (typeof item.createdAt === 'number' ? item.createdAt : Date.parse(item.createdAt||'') || 0);
    const previous = latest.get(key);
    if (!previous || time >= previous.time) latest.set(key,{correct:correctValue,time});
  }
  const list = [...latest.values()];
  const correct = list.filter(x=>x.correct).length, total=list.length;
  return {correct,total,percent:total?Math.round(correct/total*100):0};
}

export function courseScore(data, history, courseId, maxLesson=10){
  const main = scoreFromResults(data, courseId, maxLesson);
  if (main.total) return main;
  return scoreFromHistory(history, courseId, maxLesson);
}

export function averageCourseAccuracy(data, history){
  const scores = COURSES.map(course => courseScore(data,history,course.id,10)).filter(score=>score.total>0);
  return {percent:scores.length ? Math.round(scores.reduce((sum,s)=>sum+s.percent,0)/scores.length) : 0, coursesScored:scores.length, scores};
}

export function inferCertificateLevel(certificate, docId=''){
  if (String(certificate?.credentialKey||docId).includes('grand_master') || String(certificate?.level||'').toLowerCase().includes('grand')) return 'grand_master';
  const raw = String(certificate?.certificateLevel || certificate?.levelKey || certificate?.tier || certificate?.level || '').toLowerCase();
  if (raw.includes('begin') || Number(certificate?.lessonsRequired)===5) return 'beginner';
  return 'professional';
}

export function certificateKeyFromRecord(certificate, docId=''){
  if (certificate?.credentialKey) return String(certificate.credentialKey);
  if (String(docId).includes('_beginner') || String(docId).includes('_professional') || String(docId)==='grand_master') return String(docId);
  const courseId = normalizeCourseId(certificate?.courseId || docId);
  return credentialKey(courseId,inferCertificateLevel(certificate,docId));
}
