/* Junior Quizmaster — app logic. Content (questions, lines, name list) comes from content.js. */
const AUDIO_VERSION = "202610170923";
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const pad = n => String(n).padStart(2, "0");
const todayKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const dayNumber = (d = new Date()) => Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(2026, 0, 1)) / 864e5);
const hash = s => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const band = age => age <= 5 ? "a" : age <= 7 ? "b" : age <= 9 ? "c" : "d";
const nameKey = n => String(n).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
const canSayName = n => VOICE_NAMES.has(nameKey(n));
function toast(msg){ const t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => t.hidden = true, 2800); }

/* ---------------- Answer matching ---------------- */
const NUMS = {zero:0,oh:0,nought:0,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12,thirteen:13,fourteen:14,fifteen:15,sixteen:16,seventeen:17,eighteen:18,nineteen:19,twenty:20,thirty:30,forty:40,fourty:40,fifty:50,sixty:60,seventy:70,eighty:80,ninety:90};
function wordsToNumbers(text){
  const out = []; let cur = null; const flush = () => { if (cur !== null) { out.push(String(cur)); cur = null; } };
  for (const t of text.split(" ")) {
    if (t in NUMS) { const v = NUMS[t]; if (cur !== null && ((cur >= 100 && cur % 100 === 0 && v < 100) || (cur % 100 >= 20 && cur % 10 === 0 && v < 10))) cur += v; else { flush(); cur = v; } }
    else if (t === "hundred" && cur !== null) cur *= 100;
    else if (t === "thousand" && cur !== null) cur *= 1000;
    else if (t === "and" && cur !== null && cur >= 100) {}
    else { flush(); out.push(t); }
  }
  flush(); return out.join(" ");
}
function norm(s){
  let t = String(s).toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
  t = wordsToNumbers(t);
  t = t.replace(/^(its|it is|i think|um|uh|erm|maybe)\s+/, "").replace(/\b(a|an|the)\b/g, " ").replace(/\s+/g, " ").trim();
  return t;
}
function lev(a, b){ const m = a.length, n = b.length; if (!m) return n; if (!n) return m; let p = [...Array(n+1).keys()];
  for (let i = 1; i <= m; i++) { const c = [i]; for (let j = 1; j <= n; j++) c[j] = Math.min(p[j]+1, c[j-1]+1, p[j-1] + (a[i-1] === b[j-1] ? 0 : 1)); p = c; } return p[n]; }
function isRight(said, q){
  const s = norm(said); if (!s) return false;
  for (const a of [q.a, ...(q.x || [])].map(norm).filter(Boolean)) {
    if (s === a) return true;
    const sw = s.split(" "), aw = a.split(" ");
    if (sw.length <= aw.length + 3 && (" " + s + " ").includes(" " + a + " ")) return true;
    if (!/\d/.test(a) && a.length >= 5 && lev(s, a) <= (a.length >= 9 ? 2 : 1)) return true;
    if (sw.length > 1 && sw.length <= aw.length + 3 && !/\d/.test(a) && a.length >= 5 && sw.some(w => lev(w, a) <= 1)) return true;
  }
  return false;
}
const PHRASE = /\bthe\s+answer\s*(?:is|'s|s|was)\b[\s,:.-]*(.*)$/i;
function extractAnswer(text){ const m = String(text).match(PHRASE); if (!m) return null; const a = m[1].replace(/[.!?]+$/, "").trim(); return a || null; }

/* ---------------- The wizard's voice (recorded clips) ---------------- */
let voiceOn = true;
let AC = null; const bufs = new Map(); let playing = []; let speakToken = 0;
function audioCtx(){ if (!AC) { const C = window.AudioContext || window.webkitAudioContext; if (C) AC = new C(); } return AC; }
// iOS/Safari only allow sound after a tap: unlock on the first touch anywhere.
function unlockAudio(){ const ac = audioCtx(); if (!ac) return; if (ac.state !== "running") ac.resume().catch(() => {});
  try { const b = ac.createBuffer(1, 1, 22050), s = ac.createBufferSource(); s.buffer = b; s.connect(ac.destination); s.start(0); } catch(e){} }
document.addEventListener("pointerdown", unlockAudio, { capture: true });
document.addEventListener("touchend", unlockAudio, { capture: true });
function load(path){
  if (!bufs.has(path)) {
    const ac = audioCtx();
    bufs.set(path, fetch(`audio/${path}.mp3?v=${AUDIO_VERSION}`).then(r => { if (!r.ok) throw new Error(path); return r.arrayBuffer(); })
      .then(ab => new Promise((res, rej) => ac.decodeAudioData(ab, res, rej))).catch(e => { bufs.delete(path); throw e; }));
  }
  return bufs.get(path);
}
const preload = paths => paths.forEach(p => load(p).catch(() => {}));
// A spoken line is a list of parts: clip paths ("q/b3") or {name: "Logan"}. Text is what the bubble shows.
function segs(parts){ return parts.flatMap(p => typeof p === "string" ? (p ? [p] : []) : (canSayName(p.name) ? ["n/" + nameKey(p.name)] : [])); }
function stopSpeaking(){ speakToken++; for (const s of playing) { try { s.stop(); } catch(e){} } playing = []; $("#stage").classList.remove("talking"); try { speechSynthesis.cancel(); } catch(e){} }
async function speak(parts, text){
  if (text) $("#bubbleText").textContent = text;
  stopSpeaking(); const my = speakToken;
  if (!voiceOn) return;
  const ac = audioCtx(); const paths = segs(parts);
  if (!ac || !paths.length) return deviceSay(text, my);
  let list;
  try { if (ac.state !== "running") await ac.resume(); list = await Promise.all(paths.map(load)); }
  catch(e){ return deviceSay(text, my); }   // a clip is missing or offline: fall back to the phone's own voice
  if (my !== speakToken) return;
  $("#stage").classList.add("talking");
  let t = ac.currentTime + 0.05;
  const done = list.map((b, i) => { const s = ac.createBufferSource(); s.buffer = b; s.connect(ac.destination); s.start(t); t += b.duration + (i < list.length - 1 ? 0.12 : 0); playing.push(s); return new Promise(r => s.onended = r); });
  await Promise.race([Promise.all(done), new Promise(r => setTimeout(r, (t - ac.currentTime) * 1000 + 1500))]);
  if (my === speakToken) { $("#stage").classList.remove("talking"); playing = []; }
}
function deviceSay(text, my){
  return new Promise(res => {
    if (!window.speechSynthesis || !text) return res();
    try { const u = new SpeechSynthesisUtterance(text); const v = speechSynthesis.getVoices().find(v => /en-(GB|IE)/i.test(v.lang)); if (v) u.voice = v;
      u.rate = 0.9; u.pitch = 0.75; u.onend = u.onerror = () => res(); speechSynthesis.speak(u); setTimeout(res, 2500 + text.length * 80); } catch(e){ res(); }
  });
}
$("#soundBtn").addEventListener("click", e => { voiceOn = !voiceOn; e.currentTarget.setAttribute("aria-pressed", voiceOn); e.currentTarget.textContent = voiceOn ? "🔊" : "🔇"; e.currentTarget.setAttribute("aria-label", voiceOn ? "Wizard voice on" : "Wizard voice off"); toast(voiceOn ? "Wizard voice on" : "Wizard voice off"); if (!voiceOn) stopSpeaking(); });
$("#wizard").addEventListener("click", () => speak(["l/demo"], LINES.demo));

/* ---------------- Storage (this device) ---------------- */
let state = { kids: [], reminder: "08:15", remDays: "school", history: {} };
try { const s = localStorage.getItem("jq-state"); if (s) state = Object.assign(state, JSON.parse(s)); } catch(e){}
function save(){ try { localStorage.setItem("jq-state", JSON.stringify(state)); } catch(e){} }
const tidyName = s => s.trim().replace(/\s+/g, " ").slice(0, 20).replace(/(^|[\s'\-])([a-zà-ÿ])/g, (m, p, c) => p + c.toUpperCase());
let editingId = null;

/* ---------------- Today's questions: a fixed shuffled order per age group, five new ones each day ---------------- */
function order(b){ const idx = BANK[b].map((_, i) => i); let seed = hash("jq-" + b); for (let i = idx.length - 1; i > 0; i--) { seed = Math.imul(seed ^ (seed >>> 15), 2246822519) >>> 0; const j = seed % (i + 1); [idx[i], idx[j]] = [idx[j], idx[i]]; } return idx; }
function todaysQuestions(age){ const b = band(age), o = order(b), d = dayNumber(); return [0,1,2,3,4].map(k => { const i = o[(d * 5 + k) % o.length]; return { ...BANK[b][i], id: b + i }; }); }
const factIndex = () => ((dayNumber() % FACTS.length) + FACTS.length) % FACTS.length;

/* ---------------- Home ---------------- */
function renderHome(){
  $("#todayDate").textContent = new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short" });
  const list = $("#kidList"); const today = state.history[todayKey()] || {};
  if (!state.kids.length) {
    list.innerHTML = `<div class="kid" style="grid-column:1/-1;background:var(--lilac)"><span class="name">No quizzers yet</span><p>Add your child's first name and age below, then tap their name to start.</p><button class="btn blue" type="button" id="tryDemo">Try a sample quiz first</button></div>`;
    $("#tryDemo").onclick = () => startQuiz({ id: "demo", name: "Superstar", age: 7 });
  } else {
    list.innerHTML = state.kids.map(k => {
      const r = today[k.id];
      if (editingId === k.id) return `<form class="kid" data-editform="${k.id}">
        <label for="en-${k.id}">First name</label><input id="en-${k.id}" maxlength="20" required value="${esc(k.name)}">
        <label for="ea-${k.id}">Age</label><select id="ea-${k.id}">${[4,5,6,7,8,9,10,11,12].map(a => `<option${a === k.age ? " selected" : ""}>${a}</option>`).join("")}</select>
        <div class="row"><button class="btn blue" type="submit">Save</button><button class="linkbtn" type="button" data-cancel="1">Cancel</button></div></form>`;
      return `<div class="kid">
        <div class="row" style="justify-content:space-between"><span class="name">${esc(k.name)}</span><span class="chip">Age ${k.age}</span></div>
        ${r ? `<span class="chip done">Done today · ${r.score}/5</span>` : `<span class="chip">5 questions waiting</span>`}
        ${canSayName(k.name) ? "" : `<span class="small muted">The wizard is still learning to say ${esc(k.name)}, so he'll cheer without the name for now.</span>`}
        <button class="btn ${r ? "ghost" : "blue"}" type="button" data-play="${k.id}">${r ? "Play again for fun" : "▶ Play now"}</button>
        <div class="row" style="gap:14px"><button class="linkbtn" type="button" data-edit="${k.id}">Edit name or age</button><button class="linkbtn" type="button" data-del="${k.id}">Remove</button></div>
      </div>`;
    }).join("");
  }
  list.querySelectorAll("[data-play]").forEach(b => b.onclick = () => startQuiz(state.kids.find(x => x.id === b.dataset.play)));
  list.querySelectorAll("[data-del]").forEach(b => b.onclick = () => { if (b.dataset.sure) { state.kids = state.kids.filter(x => x.id !== b.dataset.del); save(); renderHome(); } else { b.dataset.sure = "1"; b.textContent = "Tap again to remove"; } });
  list.querySelectorAll("[data-edit]").forEach(b => b.onclick = () => { editingId = b.dataset.edit; renderHome(); });
  list.querySelectorAll("[data-cancel]").forEach(b => b.onclick = () => { editingId = null; renderHome(); });
  list.querySelectorAll("[data-editform]").forEach(f => f.addEventListener("submit", e => { e.preventDefault(); const id = f.dataset.editform; const k = state.kids.find(x => x.id === id); const name = tidyName($("#en-" + id).value); if (!k || !name) return; k.name = name; k.age = +$("#ea-" + id).value; editingId = null; save(); renderHome(); }));
  $("#remTime").value = state.reminder; $("#remDays").value = state.remDays || "school";
}
$("#addKid").addEventListener("submit", e => { e.preventDefault(); const name = tidyName($("#kidName").value); if (!name) return;
  state.kids.push({ id: "k" + Math.random().toString(36).slice(2, 8), name, age: +$("#kidAge").value }); $("#kidName").value = ""; save(); renderHome();
  speak(["l/welcome_pre", { name }, "l/welcome_post"], `${LINES.welcome_pre} ${name}! ${LINES.welcome_post}`); });
$("#remTime").addEventListener("change", e => { state.reminder = e.target.value; save(); });
$("#remDays").addEventListener("change", e => { state.remDays = e.target.value; save(); });
$("#remBtn").addEventListener("click", () => {
  const [hh, mm] = (state.reminder || "08:15").split(":"); const start = `${todayKey().replace(/-/g, "")}T${hh}${mm}00`;
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, ""); const url = location.href.split("#")[0];
  const rule = state.remDays === "all" ? "RRULE:FREQ=DAILY" : "RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR";
  const ics = ["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//Junior Quizmaster//EN","BEGIN:VEVENT",`UID:jq-${Date.now()}@juniorquizmaster`,`DTSTAMP:${stamp}`,`DTSTART:${start}`,"DURATION:PT10M",rule,
    "SUMMARY:Junior Quizmaster time!",`DESCRIPTION:Professor Quizzard has 5 new questions ready. ${url}`,`URL:${url}`,"BEGIN:VALARM","TRIGGER:PT0M","ACTION:DISPLAY","DESCRIPTION:Quiz time!","END:VALARM","END:VEVENT","END:VCALENDAR"].join("\r\n");
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([ics], { type: "text/calendar" })); a.download = "junior-quizmaster-daily.ics"; document.body.appendChild(a); a.click(); a.remove();
  toast("Open the calendar file to add your daily alert");
});

/* ---------------- Listening ---------------- */
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const canListen = !!SR && window.isSecureContext;
let rec = null, listening = false, wantListen = false, onHeard = null, silenceTimer = null;
function startListening(handler){
  onHeard = handler; wantListen = true;
  if (!canListen) return false;
  if (rec) { try { rec.abort(); } catch(e){} }
  rec = new SR(); rec.lang = /^en/i.test(navigator.language) ? navigator.language : "en-IE"; rec.continuous = true; rec.interimResults = true;
  rec.onstart = () => { listening = true; paintTalk(); };
  rec.onresult = ev => { let t = ""; for (const r of ev.results) t += r[0].transcript + " "; t = t.trim(); onHeard && onHeard(t, false); clearTimeout(silenceTimer); silenceTimer = setTimeout(() => onHeard && onHeard(t, true), 1400); };
  rec.onerror = ev => { if (ev.error === "not-allowed" || ev.error === "service-not-allowed") { wantListen = false; toast("Please allow the microphone so the wizard can hear you."); showTyping(); } };
  rec.onend = () => { listening = false; paintTalk(); if (wantListen) { try { rec.start(); } catch(e){} } };
  try { rec.start(); return true; } catch(e){ return false; }
}
function stopListening(){ wantListen = false; clearTimeout(silenceTimer); if (rec) { try { rec.stop(); } catch(e){} } listening = false; paintTalk(); }
function paintTalk(){ const b = $("#talk"); if (!b) return; b.classList.toggle("on", listening); b.classList.toggle("wait", !listening && b.classList.contains("wait")); const l = b.querySelector(".lbl"); if (l && !b.classList.contains("wait")) l.textContent = listening ? "Listening… say “The answer is…”" : "Tap and talk"; }

/* ---------------- Quiz ---------------- */
let Q = null; const card = () => $("#quizCard");
function showView(v){ document.body.classList.toggle("inquiz", v === "quiz"); $("#home").hidden = v !== "home"; $("#quiz").hidden = v !== "quiz"; scrollTo({ top: 0, behavior: "smooth" }); }
$("#quitQuiz").onclick = () => { stopListening(); stopSpeaking(); Q = null; showView("home"); renderHome(); };
function dots(){ return `<div class="progress" aria-label="Question ${Q.i+1} of 5">${Q.qs.map((_, j) => `<span class="dot ${j < Q.results.length ? (Q.results[j].ok ? "ok" : "no") : j === Q.i ? "now" : ""}">${j+1}</span>`).join("")}</div>`; }
const cheerIdx = i => (dayNumber() + i * 7 + hash(Q.kid.id)) % CHEERS.length;
const oopsIdx = i => (dayNumber() + i) % OOPS.length;
const join = (a, n, b) => [a, n ? n + "!" : "", b].filter(Boolean).join(" ").replace(/,\s+(\w+)!/, ", $1!");

function startQuiz(kid){
  const qs = todaysQuestions(kid.age);
  Q = { kid, qs, i: 0, results: [] };
  const N = { name: kid.name };
  preload([..."ready_pre ready_post nudge fact_ask fact_intro fact_bye bye_pre bye_post".split(" ").map(k => "l/" + k),
    ...qs.flatMap((q, i) => ["qn/" + i, "q/" + q.id, "r/" + q.id, `c/${cheerIdx(i)}a`, `c/${cheerIdx(i)}b`, `o/${oopsIdx(i)}a`, `o/${oopsIdx(i)}b`]),
    ...segs([N]), "f/" + factIndex()].filter(p => !/c\/\d+b$/.test(p) || CHEERS[+p.match(/\d+/)[0]][1]));
  showView("quiz");
  card().innerHTML = `${dots()}<h2>Ready, ${esc(kid.name)}?</h2>
    <p>Here's the magic rule: think out loud as much as you like, but your answer only counts when you say <b>"The answer is…"</b> and then your answer.</p>
    <p class="muted small">Grown-ups: when your phone asks, allow the microphone. After each question the wizard listens by himself.</p>
    <button class="btn big blue" id="go" type="button">I'm ready! ✨</button>`;
  $("#go").onclick = () => { stopSpeaking(); if (canListen) { startListening(() => {}); setTimeout(() => { stopListening(); askQuestion(); }, 350); } else askQuestion(); };
  speak(["l/ready_pre", N, "l/ready_post"], `Ready, ${kid.name}? ${LINES.ready_post}`);
}

function askQuestion(){
  const q = Q.qs[Q.i]; let done = false;
  card().innerHTML = `${dots()}
    <span class="chip" style="justify-self:start">Question ${Q.i+1} of 5</span>
    <p class="qtext">${esc(q.q)}</p>
    <button class="btn talk wait" id="talk" type="button"><span class="ic">🎤</span><span class="lbl">The wizard is asking…</span></button>
    <div class="heard" id="heard" aria-live="polite"><span class="muted">I'll show what I hear here.</span></div>
    <div class="row"><button class="btn ghost" id="repeat" type="button">🔁 Hear the question again</button><button class="linkbtn" id="typeLink" type="button">Can't talk right now? Type instead</button></div>
    <div class="typefall" id="typeBox" hidden><input id="ans" autocomplete="off" placeholder="The answer is…" aria-label="Type your answer"><button class="btn mint" id="lockIn" type="button">Lock in</button></div>`;
  let nudged = false;
  const handle = (text, final) => {
    if (done) return;
    const a = extractAnswer(text); const lower = text.toLowerCase(); const at = lower.lastIndexOf("answer");
    $("#heard").innerHTML = a ? `${esc(text.slice(0, at))}<span class="hl">${esc(text.slice(at))}</span>` : (esc(text) || `<span class="muted">I'll show what I hear here.</span>`);
    if (a && final) { done = true; stopListening(); submitAnswer(a); }
    else if (!a && final && text.split(" ").length >= 2) {
      $("#heard").innerHTML += `<div class="small muted">Remember to say “The answer is…”</div>`;
      if (!nudged) { nudged = true; stopListening(); speak(["l/nudge"], LINES.nudge).then(listen); }
    }
  };
  const listen = () => { if (done || !Q) return; const t = $("#talk"); t.classList.remove("wait"); if (!startListening(handle)) showTyping(); paintTalk(); };
  $("#talk").onclick = () => { if (listening) stopListening(); else { stopSpeaking(); listen(); } };
  $("#repeat").onclick = () => { stopListening(); $("#talk").classList.add("wait"); speak(["q/" + q.id], q.q).then(listen); };
  $("#typeLink").onclick = showTyping;
  const typed = () => { const v = $("#ans").value; const a = extractAnswer(v) || v.trim(); if (a && !done) { done = true; stopListening(); submitAnswer(a); } };
  $("#lockIn").onclick = typed; $("#ans").addEventListener("keydown", e => { if (e.key === "Enter") typed(); });
  if (!canListen) showTyping();
  speak(["qn/" + Q.i, "q/" + q.id], `Question ${Q.i+1}. ${q.q}`).then(() => { if (Q && !done && canListen) listen(); });
}
function showTyping(){ const b = $("#typeBox"); if (b) { b.hidden = false; $("#ans").focus(); } }

async function submitAnswer(said){
  if (!Q) return;
  const q = Q.qs[Q.i], i = Q.i, ok = isRight(said, q); Q.results.push({ ok, said });
  const n = Q.kid.name, N = { name: n }; let parts, line;
  if (ok) { const [a, b] = CHEERS[cheerIdx(i)]; parts = [`c/${cheerIdx(i)}a`, N, b ? `c/${cheerIdx(i)}b` : ""]; line = join(a, n, b); confetti(); }
  else { const [a, b] = OOPS[oopsIdx(i)]; parts = [`o/${oopsIdx(i)}a`, N, "r/" + q.id, `o/${oopsIdx(i)}b`]; line = `${a} ${n}! The answer was ${q.a}. ${b}`; }
  const last = i === 4;
  card().innerHTML = `${dots()}<p class="qtext" style="font-size:1.3rem">${esc(q.q)}</p>
    <p class="muted">You said: “${esc(said)}”</p>
    <div class="verdict ${ok ? "ok" : "no"}">${ok ? "✅ " : "💡 "}${esc(line)}</div>
    <button class="btn big ${last ? "red" : "blue"}" id="next" type="button">${last ? "See my score!" : "Next question →"}</button>`;
  let moved = false; const go = () => { if (moved || !Q || Q.i !== i) return; moved = true; stopSpeaking(); if (last) finish(); else { Q.i++; askQuestion(); } };
  $("#next").onclick = go;
  await speak(parts, line);
  if (Q && canListen) setTimeout(go, 1000);   // hands-free: carry on by itself
}

async function finish(){
  const score = Q.results.filter(r => r.ok).length, n = Q.kid.name, N = { name: n };
  if (Q.kid.id !== "demo") { const t = todayKey(); state.history[t] = state.history[t] || {}; if (!state.history[t][Q.kid.id]) state.history[t][Q.kid.id] = { score, at: Date.now() };
    const keep = Object.keys(state.history).sort().slice(-60); state.history = Object.fromEntries(keep.map(k => [k, state.history[k]])); save(); }
  let answered = false;
  card().innerHTML = `${dots()}<h2 style="text-align:center">${esc(n)}'s score</h2>
    <div class="score">${score}<span style="font-size:2rem">/5</span></div>
    <p style="text-align:center;font-size:1.15rem;font-weight:600">${esc(FEEDBACK[score])}</p>
    <div class="card" style="box-shadow:none;background:var(--lilac)">
      <h3>Do you want to hear an interesting fact?</h3>
      <p class="muted small">Just say “yes” or “no”.</p>
      <button class="btn talk wait" id="talk" type="button"><span class="ic">🎤</span><span class="lbl">The wizard is talking…</span></button>
      <div class="row"><button class="btn mint" id="yes" type="button">Yes please!</button><button class="btn ghost" id="no" type="button">Not today</button></div>
    </div>`;
  if (score >= 3) confetti(score === 5 ? 220 : 120);
  const no = () => { if (answered) return; answered = true; stopListening(); speak(["l/bye_pre", N, "l/bye_post"], `No problem, ${n}! ${LINES.bye_post}`).then(() => Q && $("#quitQuiz").click()); };
  const yes = () => { if (answered) return; answered = true; stopListening(); tellFact(); };
  $("#yes").onclick = yes; $("#no").onclick = no;
  const handle = text => { const v = norm(text); if (/\b(yes|yeah|yep|yup|ok|okay|sure|please)\b/.test(v)) yes(); else if (/\b(no|nope|nah)\b/.test(v)) no(); };
  const listen = () => { const t = $("#talk"); if (!t) return; t.classList.remove("wait"); startListening(handle); paintTalk(); };
  $("#talk").onclick = () => listening ? stopListening() : (stopSpeaking(), listen());
  await speak(["sc/" + score, N, "fb/" + score, "l/fact_ask"], `${SCORE[score].replace(/,$/, "")}, ${n}! ${FEEDBACK[score]} ${LINES.fact_ask}`);
  if (!answered && canListen && Q) listen();
}
async function tellFact(){
  const i = factIndex(), fact = FACTS[i];
  card().innerHTML = `<h2>Today's amazing fact ✨</h2><div class="fact">${esc(fact)}</div>
    <p class="muted small">Grown-ups: a good one to chat about on the way home.</p>
    <div class="row"><button class="btn ghost" id="again" type="button">🔁 Hear it again</button><button class="btn blue" id="done" type="button">All done</button></div>`;
  $("#again").onclick = () => speak(["f/" + i], fact); $("#done").onclick = () => $("#quitQuiz").click();
  await speak(["l/fact_intro", "f/" + i, "l/fact_bye"], `${LINES.fact_intro} ${fact}`);
}

/* ---------------- Confetti ---------------- */
function confetti(n = 70){
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const c = $("#confetti"), x = c.getContext("2d"); c.width = innerWidth; c.height = innerHeight;
  const cols = ["#FFC43D", "#FF5A4E", "#22B98C", "#3557E6", "#9B66F0"];
  const ps = Array.from({ length: n }, () => ({ x: innerWidth / 2 + (Math.random() - .5) * 120, y: innerHeight * .35, vx: (Math.random() - .5) * 12, vy: -Math.random() * 12 - 4, r: Math.random() * 6 + 4, c: cols[Math.floor(Math.random() * cols.length)], a: Math.random() * 6 }));
  let f = 0; (function tick(){ x.clearRect(0, 0, c.width, c.height); for (const p of ps) { p.vy += .35; p.x += p.vx; p.y += p.vy; p.a += .2; x.save(); x.translate(p.x, p.y); x.rotate(p.a); x.fillStyle = p.c; x.fillRect(-p.r/2, -p.r/2, p.r, p.r * .6); x.restore(); } if (++f < 110) requestAnimationFrame(tick); else x.clearRect(0, 0, c.width, c.height); })();
}

if (!canListen) $("#noVoice").hidden = false;
state.kids.forEach(k => k.name = tidyName(k.name));
renderHome();
