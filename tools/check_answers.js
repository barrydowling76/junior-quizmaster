// Pre-deploy guard for answer matching. Fails (exit 1) if any question rejects its own accepted answers,
// or accepts the main answer of a different question that means something else.
const fs = require('fs'), path = require('path');
const [appFile, contentFile] = process.argv.slice(2);
const src = fs.readFileSync(appFile, 'utf8');
eval(src.slice(src.indexOf('/* ---------------- Answer matching'), src.indexOf('/* ---------------- The wizard')).replace(/^const /gm, 'global.').replace(/^function (\w+)/gm, 'global.$1=function $1'));
eval(fs.readFileSync(contentFile, 'utf8').replace(/^const /gm, 'global.'));
const all = []; for (const b of Object.keys(BANK)) BANK[b].forEach((q, i) => all.push({ ...q, id: b + i }));
const words = { "2": "two", "4": "four", "11": "eleven", "24": "twenty four", "144": "one hundred and forty four", "1916": "nineteen sixteen" };
let own = 0, cross = 0;
for (const q of all) for (const s of [q.a, ...q.x, words[q.a]].filter(Boolean)) { const a = extractAnswer('um the answer is ' + s); if (!a || !isRight(a, q)) { own++; console.log('REJECTS OWN', q.id, q.q, '|', s); } }
// Sound-alikes speech recognition can't tell apart; accepting them is deliberate.
const ALLOWED = [["Indian Ocean", "India"], ["Wright brothers", "right"]];
const allowed = (q, other) => ALLOWED.some(([qa, oa]) => q.a.toLowerCase().includes(qa.toLowerCase()) && norm(other) === norm(oa));
const same = (q, o) => [q.a, ...q.x].some(x => isRight(x, { a: o.a, x: o.x })) && [o.a, ...o.x].some(x => isRight(x, { a: q.a, x: q.x }));
for (const q of all) for (const o of all) {
  if (o === q || norm(o.a) === norm(q.a) || same(q, o)) continue;   // same answer in a different question is fine
  if (isRight(o.a, q) && !allowed(q, o.a)) { cross++; console.log('ACCEPTS OTHER', q.id, q.q, '| correct:', q.a, '| also accepts:', o.a); }
}
console.log(`${all.length} questions: ${own} reject their own answer, ${cross} accept another question's answer`);
process.exit(own || cross ? 1 : 0);
