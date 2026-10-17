/* Junior Quizmaster — app logic. Content (questions, lines, name list) comes from content.js. */
const AUDIO_VERSION = "__AV__";
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
// Strict on meaning, kind to speech slips:
//  - filler words ("um", "it's a", "I think") are ignored
//  - a number answer must be the one and only number said ("180 minutes" counts for 180, "3 4" does not count for 4)
//  - a word answer must match the whole phrase, allowing a plural and a small slip across the phrase (never word by word)
const FILLER = new Set("um uh erm er ah oh hmm it its is i think maybe a an the my your our called they are was that be about around exactly like".split(" "));
const toks = t => norm(t).split(" ").filter(w => w && !FILLER.has(w));
const isNum = w => /^\d+$/.test(w);
function isRight(said, q){
  const st = toks(said); if (!st.length) return false;
  const sNums = st.filter(isNum), s = st.join(" ");
  for (const ans of [q.a, ...(q.x || [])]) {
    const at = toks(ans); if (!at.length) continue;
    const aNums = at.filter(isNum), A = at.join(" ");
    if (aNums.length) { if (sNums.join(" ") === aNums.join(" ") && (aNums.length === at.length || s === A || st.length <= at.length)) return true; if (aNums.length === at.length) continue; }
    if (s === A || s === A + "s" || s + "s" === A || s === A + "es" || s + "es" === A) return true;
    if (!aNums.length && A.length >= 6 && lev(s, A) <= (A.length >= 10 ? 2 : 1)) return true;
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
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, c => (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)));
state.speed = state.speed || {};
state.kids.forEach(k => { if (!k.pid) k.pid = uuid(); if (k.initial == null) k.initial = ""; });
const boardName = k => k.name + (k.initial ? " " + k.initial + "." : "");
const secs = ms => (ms / 1000).toFixed(1);
const tidyName = s => s.trim().replace(/\s+/g, " ").slice(0, 20).replace(/(^|[\s'\-])([a-zà-ÿ])/g, (m, p, c) => p + c.toUpperCase());
let editingId = null;

/* ---------------- Today's questions: a fixed shuffled order per age group, five new ones each day ---------------- */
function shuffled(list, seedKey){ const idx = [...list]; let seed = hash(seedKey); for (let i = idx.length - 1; i > 0; i--) { seed = Math.imul(seed ^ (seed >>> 15), 2246822519) >>> 0; const j = seed % (i + 1); [idx[i], idx[j]] = [idx[j], idx[i]]; } return idx; }
const at = (arr, n) => arr[((n % arr.length) + arr.length) % arr.length];
// Every child of the same age group gets the same five each day: one maths question (for Lightning maths) at a
// different spot each day, plus four others. Each list is walked in a fixed shuffled order, so nothing repeats
// until that list has been used up (about 6 weeks).
function todaysQuestions(age){
  const b = band(age), d = dayNumber(), all = BANK[b].map((_, i) => i);
  const maths = shuffled(all.filter(i => BANK[b][i].m), "jqm-" + b), rest = shuffled(all.filter(i => !BANK[b][i].m), "jq-" + b);
  const picks = [0, 1, 2, 3].map(k => at(rest, d * 4 + k));
  picks.splice(hash(b + d) % 5, 0, at(maths, d));
  return picks.map(i => ({ ...BANK[b][i], id: b + i }));
}
const factIndex = () => ((dayNumber() % FACTS.length) + FACTS.length) % FACTS.length;

/* ---------------- Class challenge (shared Lightning maths board) ---------------- */
const SB = { url: "https://rjztcyzyvnfdpfzbswfh.supabase.co/rest/v1/rpc/", key: "sb_publishable_T4ZpGtsuYY8S9eZ3hJdLKQ_skme_-fX" };
async function rpc(fn, body){
  const r = await fetch(SB.url + fn, { method: "POST", headers: { apikey: SB.key, "Content-Type": "application/json" }, body: JSON.stringify(body || {}) });
  if (!r.ok) throw new Error(fn + " " + r.status); return r.json();
}
const CODE_RE = /^[A-Z]{3,4}[0-9]{4}$/;
const cleanCode = c => String(c || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const showCode = c => String(c || "").replace(/^([A-Z]+)(\d+)$/, "$1-$2");
const classLink = c => appUrl() + "?class=" + showCode(c);
const boards = {}; // class code -> latest board from the server (includes .info: school, area, year)
const YEARS = [["JI", "Junior Infants"], ["SI", "Senior Infants"], ["1", "1st class"], ["2", "2nd class"], ["3", "3rd class"], ["4", "4th class"], ["5", "5th class"], ["6", "6th class"]];
const yearName = y => (YEARS.find(x => x[0] === y) || [, ""])[1];
const COUNTIES = ["Carlow","Cavan","Clare","Cork","Donegal","Dublin","Galway","Kerry","Kildare","Kilkenny","Laois","Leitrim","Limerick","Longford","Louth","Mayo","Meath","Monaghan","Offaly","Roscommon","Sligo","Tipperary","Waterford","Westmeath","Wexford","Wicklow"];
const schoolLists = {};   // county -> [[roll, name, town, area, level, kind], ...]
const cleanTown = t => /^(B[áa]c|Baile [ÁA]tha Cliath)\s*\d/i.test(t || "") ? "" : (t || "");
function classTitle(info){ if (!info || !info.school) return null; return `${info.school} · ${yearName(info.year)}${info.label ? " (" + info.label + ")" : ""}`; }
function classPlace(info){ if (!info || !info.school) return ""; const t = cleanTown(info.town); return [t, info.area !== t ? info.area : "", info.county !== "Dublin" ? "Co. " + info.county : ""].filter(Boolean).join(", "); }
let pick = null;          // the school picker currently open: { kid, county, area, q, roll, year, label, busy, msg }
async function joinClass(kid, code){
  const r = await rpc("jq_join", { p_code: code, p_player: kid.pid, p_first: kid.name, p_initial: kid.initial || "", p_age: kid.age });
  if (!r.ok) throw new Error(r.error || "join_failed");
  kid.classCode = r.class; save(); return r.class;
}
async function refreshBoards(){
  const codes = [...new Set(state.kids.map(k => k.classCode).filter(Boolean))];
  await Promise.all(codes.map(async c => { try { boards[c] = await rpc("jq_board", { p_code: c }); } catch(e){ boards[c] = boards[c] || { offline: true }; } }));
  renderHome();
}
const inviteText = kid => { const info = (boards[kid.classCode] || {}).info, t = classTitle(info);
  return `${t ? t + " is" : "Our class is"} playing Junior Quizmaster 🧙 Five fun questions a day from Professor Quizzard, and a Lightning Maths board for the fastest answers. Join here: ${classLink(kid.classCode)}`; };
const MEDALS = ["🥇", "🥈", "🥉"];
function boardList(rows, empty){ return rows && rows.length ? `<ol class="board">${rows.map((r, i) => `<li><span>${MEDALS[i]}</span><b>${esc(r.name)}</b><span class="t">${secs(r.ms)}s</span></li>`).join("")}</ol>` : `<p class="small muted">${empty}</p>`; }
function classBlock(k){
  if (k.id === "demo") return "";
  if (!k.classCode) {
    if (!pick || pick.kid !== k.id) return `<div class="classbox"><b>🏆 Class challenge</b><span class="small muted">Race classmates on Lightning maths. Pick ${esc(k.name)}'s school and class, then share the link with other parents.</span>
      <button class="btn mint" type="button" data-pickstart="${k.id}">Find ${esc(k.name)}'s school</button></div>`;
    return pickerBlock(k);
  }
  const b = boards[k.classCode];
  const body = !b ? `<p class="small muted">Loading the class board…</p>` : b.offline ? `<p class="small muted">Couldn't reach the class board just now.</p>` :
    `<div class="boards"><div><span class="lab">This week</span>${boardList(b.week, "No times yet this week. Answer a maths question fast to get on the board!")}</div>
     <div><span class="lab">All-time</span>${boardList(b.alltime, "No times yet.")}</div></div>`;
  const info = b && b.info, title = classTitle(info);
  return `<div class="classbox"><div class="row" style="justify-content:space-between;align-items:flex-start"><div style="display:grid;gap:2px;min-width:0"><b>🏆 ${esc(title || "Class " + showCode(k.classCode))}</b>
      <span class="small muted">${esc([classPlace(info), "code " + showCode(k.classCode)].filter(Boolean).join(" · "))}</span></div>${b && b.players ? `<span class="small muted">${b.players} quizzer${b.players === 1 ? "" : "s"}</span>` : ""}</div>
    ${body}
    <div class="row"><a class="btn mint" href="https://wa.me/?text=${encodeURIComponent(inviteText(k))}" target="_blank" rel="noopener">Invite on WhatsApp</a><button class="btn ghost" type="button" data-copy="${k.id}">Copy link</button></div>
    <button class="linkbtn" type="button" data-leave="${k.id}">Leave this class</button></div>`;
}
function pickerBlock(k){
  const list = pick.county ? schoolLists[pick.county] : null;
  const areas = list && pick.county === "Dublin" ? [...new Set(list.map(s => s[3]))].sort((a, b) => { const na = a.match(/^Dublin (\d+)/), nb = b.match(/^Dublin (\d+)/); return na && nb ? (+na[1] - +nb[1]) || a.localeCompare(b) : na ? -1 : nb ? 1 : a.localeCompare(b); }) : [];
  const q = (pick.q || "").toLowerCase().trim();
  const shown = list ? list.filter(s => (!areas.length || !pick.area || s[3] === pick.area) && (!q || (s[1] + " " + s[2] + " " + s[3]).toLowerCase().includes(q))) : [];
  const sch = list && list.find(s => s[0] === pick.roll);
  const years = sch ? YEARS.filter(([y]) => sch[4] === "junior" ? ["JI", "SI", "1", "2"].includes(y) : sch[4] === "senior" ? ["3", "4", "5", "6"].includes(y) : true) : [];
  const needArea = areas.length && !pick.area && !q;
  return `<div class="classbox picker"><b>🏆 Find ${esc(k.name)}'s school and class</b>
    ${pick.msg ? `<p class="banner">${esc(pick.msg)}</p>` : ""}
    <label for="pkCounty">County</label>
    <select id="pkCounty"><option value="">Choose a county…</option>${COUNTIES.map(c => `<option${c === pick.county ? " selected" : ""}>${c}</option>`).join("")}</select>
    ${pick.county && !list ? `<p class="small muted">Loading schools in ${esc(pick.county)}…</p>` : ""}
    ${areas.length ? `<label for="pkArea">Area</label><select id="pkArea"><option value="">All Dublin areas</option>${areas.map(a => `<option${a === pick.area ? " selected" : ""}>${esc(a)}</option>`).join("")}</select>` : ""}
    ${list ? `<label for="pkSearch">Search by school or town</label><input id="pkSearch" value="${esc(pick.q || "")}" placeholder="e.g. Brigid's or Foxrock" autocomplete="off">
      ${needArea ? `<p class="small muted">Pick an area or type part of the school's name.</p>` :
        `<label for="pkSchool">School <span class="muted small">(${shown.length})</span></label>
         <select id="pkSchool" size="${Math.min(8, Math.max(3, shown.length))}">${shown.map(s => `<option value="${s[0]}"${s[0] === pick.roll ? " selected" : ""}>${esc(s[1])}${cleanTown(s[2]) ? " – " + esc(cleanTown(s[2])) : ""}</option>`).join("")}</select>`}` : ""}
    ${sch ? `<label for="pkYear">Class</label><select id="pkYear"><option value="">Choose…</option>${years.map(([y, n]) => `<option value="${y}"${y === pick.year ? " selected" : ""}>${n}</option>`).join("")}</select>
      <label for="pkLabel">Class name <span class="muted small">(only if there's more than one ${esc(yearName(pick.year) || "class")}, e.g. Ms Byrne or 1A)</span></label>
      <input id="pkLabel" maxlength="30" value="${esc(pick.label || "")}" placeholder="Leave blank if there's just one">` : ""}
    <div class="row"><button class="btn mint" type="button" id="pkGo" ${sch && pick.year && !pick.busy ? "" : "disabled"}>${pick.busy ? "Setting up…" : "Join or start this class board"}</button>
      <button class="linkbtn" type="button" id="pkCancel">Cancel</button></div>
    <button class="linkbtn" type="button" id="pkNoSchool">School not listed? Start a class link without a school</button>
  </div>`;
}
async function loadCounty(c){ if (schoolLists[c]) return; try { schoolLists[c] = await rpc("jq_school_list", { p_county: c }); } catch(e){ pick.msg = "Couldn't load the schools. Check your connection and try again."; pick.county = ""; } }
function wirePicker(){
  const k = pick && state.kids.find(x => x.id === pick.kid); if (!k || !$("#pkCounty")) return;
  const redo = (focus) => { renderHome(); if (focus && $(focus)) { const el = $(focus); el.focus(); if (el.setSelectionRange && el.value) el.setSelectionRange(el.value.length, el.value.length); } };
  $("#pkCounty").onchange = async e => { Object.assign(pick, { county: e.target.value, area: "", q: "", roll: "", year: "", msg: "" }); redo(); if (pick.county) { await loadCounty(pick.county); redo(); } };
  if ($("#pkArea")) $("#pkArea").onchange = e => { Object.assign(pick, { area: e.target.value, roll: "", year: "" }); redo(); };
  if ($("#pkSearch")) $("#pkSearch").oninput = e => { clearTimeout(wirePicker._t); const v = e.target.value; wirePicker._t = setTimeout(() => { pick.q = v; pick.roll = ""; redo("#pkSearch"); }, 250); };
  if ($("#pkSchool")) $("#pkSchool").onchange = e => { pick.roll = e.target.value; pick.year = ""; redo(); };
  if ($("#pkYear")) $("#pkYear").onchange = e => { pick.year = e.target.value; redo(); };
  if ($("#pkLabel")) $("#pkLabel").oninput = e => { pick.label = e.target.value; };
  $("#pkCancel").onclick = () => { pick = null; renderHome(); };
  $("#pkNoSchool").onclick = async () => { pick.busy = true; redo();
    try { const code = await rpc("jq_create_class"); await joinClass(k, code); pick = null; toast(`Class ${showCode(code)} is ready. Invite the other parents!`); await refreshBoards(); }
    catch(e){ pick.busy = false; pick.msg = "Couldn't start a class just now. Check your connection and try again."; redo(); } };
  $("#pkGo").onclick = async () => { pick.busy = true; redo();
    try { const code = await rpc("jq_school_class", { p_roll: pick.roll, p_year: pick.year, p_label: (pick.label || "").trim() }); await joinClass(k, code); pick = null; await refreshBoards();
      const info = (boards[k.classCode] || {}).info; toast(`${k.name} is on the ${classTitle(info) || "class"} board. Invite the other parents!`); }
    catch(e){ pick.busy = false; pick.msg = "Couldn't set up the class board just now. Check your connection and try again."; redo(); } };
}
function speedBlock(k){ const s = state.speed[k.id]; if (!s || !s.length) return ""; return `<div class="small"><b>⚡ ${esc(k.name)}'s lightning maths:</b> ${s.map((r, i) => `${MEDALS[i]} ${secs(r.ms)}s`).join(" &nbsp;")}</div>`; }

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
        <label for="ei-${k.id}">Surname initial</label><input id="ei-${k.id}" maxlength="1" value="${esc(k.initial || "")}" style="width:4.5em">
        <label for="ea-${k.id}">Age</label><select id="ea-${k.id}">${[4,5,6,7,8,9,10,11,12].map(a => `<option${a === k.age ? " selected" : ""}>${a}</option>`).join("")}</select>
        <div class="row"><button class="btn blue" type="submit">Save</button><button class="linkbtn" type="button" data-cancel="1">Cancel</button></div></form>`;
      return `<div class="kid">
        <div class="row" style="justify-content:space-between"><span class="name">${esc(boardName(k))}</span><span class="chip">Age ${k.age}</span></div>
        ${r ? `<span class="chip done">Done today · ${r.score}/5</span>` : `<span class="chip">5 questions waiting</span>`}
        ${canSayName(k.name) ? "" : `<span class="small muted">The wizard is still learning to say ${esc(k.name)}, so he'll cheer without the name for now.</span>`}
        <button class="btn ${r ? "ghost" : "blue"}" type="button" data-play="${k.id}">${r ? "Play again for fun" : "▶ Play now"}</button>
        ${speedBlock(k)}
        ${classBlock(k)}
        <div class="row" style="gap:14px"><button class="linkbtn" type="button" data-edit="${k.id}">Edit name or age</button><button class="linkbtn" type="button" data-del="${k.id}">Remove</button></div>
      </div>`;
    }).join("");
  }
  list.querySelectorAll("[data-play]").forEach(b => b.onclick = () => startQuiz(state.kids.find(x => x.id === b.dataset.play)));
  list.querySelectorAll("[data-del]").forEach(b => b.onclick = () => { if (b.dataset.sure) { const k = state.kids.find(x => x.id === b.dataset.del); if (k && k.classCode) rpc("jq_leave", { p_player: k.pid }).catch(() => {}); state.kids = state.kids.filter(x => x.id !== b.dataset.del); delete state.speed[b.dataset.del]; save(); renderHome(); } else { b.dataset.sure = "1"; b.textContent = "Tap again to remove"; } });
  const kidOf = el => state.kids.find(x => x.id === el.dataset.copy || x.id === el.dataset.leave);
  list.querySelectorAll("[data-pickstart]").forEach(b => b.onclick = () => { pick = { kid: b.dataset.pickstart, county: "", area: "", q: "", roll: "", year: "", label: "" }; renderHome(); });
  wirePicker();
  list.querySelectorAll("[data-copy]").forEach(b => b.onclick = async () => { const k = kidOf(b);
    try { await navigator.clipboard.writeText(inviteText(k)); toast("Invite copied. Paste it into the class group chat."); }
    catch(e){ if (navigator.share) navigator.share({ title: "Junior Quizmaster class", text: inviteText(k) }).catch(() => {}); else toast(classLink(k.classCode)); } });
  list.querySelectorAll("[data-leave]").forEach(b => b.onclick = async () => { const k = kidOf(b); if (!b.dataset.sure) { b.dataset.sure = "1"; b.textContent = `Tap again: ${k.name}'s times leave the board`; return; }
    try { await rpc("jq_leave", { p_player: k.pid }); } catch(e){} k.classCode = ""; save(); renderHome(); });
  list.querySelectorAll("[data-edit]").forEach(b => b.onclick = () => { editingId = b.dataset.edit; renderHome(); });
  list.querySelectorAll("[data-cancel]").forEach(b => b.onclick = () => { editingId = null; renderHome(); });
  list.querySelectorAll("[data-editform]").forEach(f => f.addEventListener("submit", e => { e.preventDefault(); const id = f.dataset.editform; const k = state.kids.find(x => x.id === id); const name = tidyName($("#en-" + id).value); if (!k || !name) return; k.name = name; k.initial = ($("#ei-" + id).value || "").trim().slice(0, 1).toUpperCase(); k.age = +$("#ea-" + id).value; editingId = null; save(); renderHome();
    if (k.classCode) joinClass(k, k.classCode).then(refreshBoards).catch(() => {}); }));
  $("#remTime").value = state.reminder; $("#remDays").value = state.remDays || "school"; renderReminder();
}
$("#addKid").addEventListener("submit", e => { e.preventDefault(); const name = tidyName($("#kidName").value); if (!name) return;
  state.kids.push({ id: "k" + Math.random().toString(36).slice(2, 8), pid: uuid(), name, initial: ($("#kidInitial").value || "").trim().slice(0, 1).toUpperCase(), age: +$("#kidAge").value });
  $("#kidName").value = ""; $("#kidInitial").value = ""; save(); renderHome();
  speak(["l/welcome_pre", { name }, "l/welcome_post"], `${LINES.welcome_pre} ${name}! ${LINES.welcome_post}`); });
$("#remTime").addEventListener("change", e => { state.reminder = e.target.value; save(); renderReminder(); });
$("#remDays").addEventListener("change", e => { state.remDays = e.target.value; save(); renderReminder(); });
/* ---------------- Daily reminder (a repeating calendar event with a link back here) ---------------- */
const appUrl = () => location.href.split(/[?#]/)[0];
const daysLabel = () => state.remDays === "all" ? "every day" : "school days";
const timeLabel = () => { const [h, m] = (state.reminder || "08:15").split(":").map(Number); return new Date(2026, 0, 1, h, m).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }); };
function nextStart(){ // first occurrence from today, as local YYYYMMDDTHHMMSS
  const [h, m] = (state.reminder || "08:15").split(":").map(Number); const d = new Date(); d.setHours(h, m, 0, 0);
  if (d < new Date()) d.setDate(d.getDate() + 1);
  while (state.remDays !== "all" && (d.getDay() === 0 || d.getDay() === 6)) d.setDate(d.getDate() + 1);
  return d;
}
const fmt = d => `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
const rrule = () => state.remDays === "all" ? "RRULE:FREQ=DAILY" : "RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR";
const tz = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Dublin"; } catch(e){ return "Europe/Dublin"; } };
function markReminderSet(){ state.reminderSet = true; save(); renderReminder(); }
function renderReminder(){
  const set = !!state.reminderSet;
  $("#remStatus").hidden = !set; $("#remStatus").textContent = `Set · ${timeLabel()}, ${daysLabel()}`;
  $("#remIntro").textContent = set ? "Changed the time? Add the new one and delete the old event from your calendar." : "Get a nudge on your phone each day when it's quiz time, like on the way to school or after pick-up.";
  $("#remNudge").hidden = set || !state.kids.length;
}
$("#remApple").addEventListener("click", () => {
  const s = nextStart(), e = new Date(s.getTime() + 10 * 60000), url = appUrl();
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const ics = ["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//Junior Quizmaster//EN","METHOD:PUBLISH","BEGIN:VEVENT",`UID:jq-${Date.now()}@juniorquizmaster`,`DTSTAMP:${stamp}`,
    `DTSTART;TZID=${tz()}:${fmt(s)}`,`DTEND;TZID=${tz()}:${fmt(e)}`,rrule(),"SUMMARY:🧙 Junior Quizmaster time!",
    `DESCRIPTION:Professor Quizzard has 5 new questions ready.\\n${url}`,`URL:${url}`,"BEGIN:VALARM","TRIGGER:PT0M","ACTION:DISPLAY","DESCRIPTION:Quiz time!","END:VALARM","END:VEVENT","END:VCALENDAR"].join("\r\n");
  const iOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (iOS) location.href = "data:text/calendar;charset=utf-8," + encodeURIComponent(ics);   // Safari offers "Add to Calendar"
  else { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([ics], { type: "text/calendar" })); a.download = "junior-quizmaster-reminder.ics"; document.body.appendChild(a); a.click(); a.remove(); }
  $("#remNote").textContent = iOS ? "Tap “Add All” to put the daily reminder in your calendar." : "Open the downloaded file to add the reminder to your calendar.";
  markReminderSet();
});
$("#remGoogle").addEventListener("click", () => {
  const s = nextStart(), e = new Date(s.getTime() + 10 * 60000), url = appUrl();
  const q = new URLSearchParams({ action: "TEMPLATE", text: "🧙 Junior Quizmaster time!", dates: `${fmt(s)}/${fmt(e)}`, ctz: tz(), recur: rrule(), details: `Professor Quizzard has 5 new questions ready.\n${url}` });
  window.open("https://calendar.google.com/calendar/render?" + q.toString(), "_blank", "noopener");
  $("#remNote").textContent = "In Google Calendar, tap Save. Then set the notification to “At time of event” so it pings at quiz time.";
  markReminderSet();
});
$("#remNudge").addEventListener("click", () => { $("#reminder").scrollIntoView({ behavior: "smooth", block: "start" }); });

/* ---------------- Listening ---------------- */
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const canListen = !!SR && window.isSecureContext;
let rec = null, listening = false, wantListen = false, onHeard = null, silenceTimer = null, onListenStart = null;
function startListening(handler){
  onHeard = handler; wantListen = true;
  if (!canListen) return false;
  if (rec) { try { rec.abort(); } catch(e){} }
  rec = new SR(); rec.lang = /^en/i.test(navigator.language) ? navigator.language : "en-IE"; rec.continuous = true; rec.interimResults = true;
  rec.onstart = () => { listening = true; paintTalk(); onListenStart && onListenStart(); };
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
$("#quitQuiz").onclick = () => { stopListening(); stopSpeaking(); Q = null; showView("home"); renderHome(); refreshBoards(); };
function dots(){ return `<div class="progress" aria-label="Question ${Q.i+1} of 5">${Q.qs.map((_, j) => `<span class="dot ${j < Q.results.length ? (Q.results[j].ok ? "ok" : "no") : j === Q.i ? "now" : ""}">${j+1}</span>`).join("")}</div>`; }
const cheerIdx = i => (dayNumber() + i * 7 + hash(Q.kid.id)) % CHEERS.length;
const oopsIdx = i => (dayNumber() + i) % OOPS.length;
const join = (a, n, b) => [a, n ? n + "!" : "", b].filter(Boolean).join(" ").replace(/,\s+(\w+)!/, ", $1!");

function startQuiz(kid){
  const qs = todaysQuestions(kid.age);
  Q = { kid, qs, i: 0, results: [], replay: !!((state.history[todayKey()] || {})[kid.id]) };   // replays never set records
  const N = { name: kid.name };
  preload([..."ready_pre ready_post nudge fact_ask fact_intro fact_bye bye_pre bye_post speed_best speed_top3".split(" ").map(k => "l/" + k),
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
  let nudged = false, tStart = null, tAnswer = null, timed = !!q.m;
  // Lightning maths: from when the wizard starts listening to the moment "the answer is …" is heard.
  onListenStart = () => { if (tStart === null) tStart = performance.now(); };
  const handle = (text, final) => {
    if (done) return;
    const a = extractAnswer(text);
    if (a && tAnswer === null && tStart !== null) tAnswer = performance.now(); const lower = text.toLowerCase(); const at = lower.lastIndexOf("answer");
    $("#heard").innerHTML = a ? `${esc(text.slice(0, at))}<span class="hl">${esc(text.slice(at))}</span>` : (esc(text) || `<span class="muted">I'll show what I hear here.</span>`);
    if (a && final) { done = true; stopListening(); submitAnswer(a, timed && tAnswer !== null ? Math.round(tAnswer - tStart) : null); }
    else if (!a && final && text.split(" ").length >= 2) {
      $("#heard").innerHTML += `<div class="small muted">Remember to say “The answer is…”</div>`;
      if (!nudged) { nudged = true; timed = false; stopListening(); speak(["l/nudge"], LINES.nudge).then(listen); }
    }
  };
  const listen = () => { if (done || !Q) return; const t = $("#talk"); t.classList.remove("wait"); if (!startListening(handle)) showTyping(); paintTalk(); };
  $("#talk").onclick = () => { if (listening) stopListening(); else { stopSpeaking(); listen(); } };
  $("#repeat").onclick = () => { timed = false; stopListening(); $("#talk").classList.add("wait"); speak(["q/" + q.id], q.q).then(listen); };
  $("#typeLink").onclick = showTyping;
  const typed = () => { const v = $("#ans").value; const a = extractAnswer(v) || v.trim(); if (a && !done) { done = true; stopListening(); submitAnswer(a, null); } };   // typed answers aren't timed
  $("#lockIn").onclick = typed; $("#ans").addEventListener("keydown", e => { if (e.key === "Enter") typed(); });
  if (!canListen) showTyping();
  speak(["qn/" + Q.i, "q/" + q.id], `Question ${Q.i+1}. ${q.q}`).then(() => { if (Q && !done && canListen) listen(); });
}
function showTyping(){ const b = $("#typeBox"); if (b) { b.hidden = false; $("#ans").focus(); } }

function addSpeed(kid, ms, qid){   // personal top 3; returns 0, 1 or 2 if this answer made it, otherwise -1
  const list = state.speed[kid.id] || [], entry = { ms, q: qid, d: todayKey() };
  const top = [...list, entry].sort((a, b) => a.ms - b.ms).slice(0, 3);
  state.speed[kid.id] = top; save(); return top.indexOf(entry);
}
async function submitAnswer(said, ms){
  if (!Q) return;
  const q = Q.qs[Q.i], i = Q.i, ok = isRight(said, q); Q.results.push({ ok, said });
  const n = Q.kid.name, N = { name: n }; let parts, line;
  let speedNote = "";
  if (ok) { const [a, b] = CHEERS[cheerIdx(i)]; parts = [`c/${cheerIdx(i)}a`, N, b ? `c/${cheerIdx(i)}b` : ""]; line = join(a, n, b); confetti();
    if (q.m && ms && ms >= 700 && !Q.replay && Q.kid.id !== "demo") {
      const rank = addSpeed(Q.kid, ms, q.id);
      speedNote = `⚡ ${secs(ms)} seconds` + (rank === 0 ? ". Your fastest maths answer ever!" : rank > 0 ? `. That's number ${rank + 1} in your lightning maths top three!` : "");
      if (rank === 0) parts.push("l/speed_best"); else if (rank > 0) parts.push("l/speed_top3");
      if (Q.kid.classCode) rpc("jq_record", { p_player: Q.kid.pid, p_ms: ms, p_question: q.id }).catch(() => {});
    } }
  else { const [a, b] = OOPS[oopsIdx(i)]; parts = [`o/${oopsIdx(i)}a`, N, "r/" + q.id, `o/${oopsIdx(i)}b`]; line = `${a} ${n}! The answer was ${q.a}. ${b}`; }
  const last = i === 4;
  card().innerHTML = `${dots()}<p class="qtext" style="font-size:1.3rem">${esc(q.q)}</p>
    <p class="muted">You said: “${esc(said)}”</p>
    <div class="verdict ${ok ? "ok" : "no"}">${ok ? "✅ " : "💡 "}${esc(line)}</div>
    ${speedNote ? `<div class="speednote">${esc(speedNote)}</div>` : ""}
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
    ${state.reminderSet ? "" : `<button class="remnudge" id="remAfter" type="button">⏰ <span>Grown-ups: want a reminder for tomorrow's quiz?</span> <b>Set it up →</b></button>`}
    <div class="row"><button class="btn ghost" id="again" type="button">🔁 Hear it again</button><button class="btn blue" id="done" type="button">All done</button></div>`;
  $("#again").onclick = () => speak(["f/" + i], fact); $("#done").onclick = () => $("#quitQuiz").click();
  const ra = $("#remAfter"); if (ra) ra.onclick = () => { $("#quitQuiz").click(); setTimeout(() => $("#reminder").scrollIntoView({ behavior: "smooth", block: "start" }), 350); };
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

/* ---------------- Opening a class link from another parent ---------------- */
const invited = cleanCode(new URLSearchParams(location.search).get("class"));
let joinInfo = null;
if (CODE_RE.test(invited)) rpc("jq_class_info", { p_code: invited }).then(i => { joinInfo = i; if (i && i.exists === false) renderJoin("That class link doesn't work. Ask the parent who sent it to share it again."); else renderJoin(); }).catch(() => {});
function renderJoin(msg){
  const p = $("#joinPanel"); if (!CODE_RE.test(invited)) { p.hidden = true; return; }
  p.hidden = false;
  const kids = state.kids.map(k => `<div class="row" style="justify-content:space-between"><b>${esc(boardName(k))}</b>${k.classCode === invited ? `<span class="chip done">In this class ✓</span>` : `<button class="btn blue" type="button" data-joinkid="${k.id}">${k.classCode ? "Move to this class" : "Join"}</button>`}</div>`).join("");
  $("#joinBody").innerHTML = `${msg ? `<p class="banner">${esc(msg)}</p>` : ""}${kids ? `<p class="muted">Which child is in this class? Brothers and sisters can each be in their own class.</p>${kids}<p class="small muted">Or add another child:</p>` : `<p class="muted">Add your child to join the class board.</p>`}`;
  $("#joinCode").textContent = joinInfo && joinInfo.school ? classTitle(joinInfo) : "class " + showCode(invited);
  $("#joinPlace").textContent = joinInfo && joinInfo.school ? classPlace(joinInfo) : "";
  $("#joinBody").querySelectorAll("[data-joinkid]").forEach(b => b.onclick = async () => { const k = state.kids.find(x => x.id === b.dataset.joinkid); b.disabled = true;
    try { await joinClass(k, invited); toast(`${k.name} joined class ${showCode(invited)}!`); await refreshBoards(); renderJoin(); }
    catch(e){ renderJoin(e.message === "no_class" ? "That class link doesn't work. Ask the parent who sent it to share it again." : "Couldn't join just now. Check your connection and try again."); } });
}
$("#joinAdd").addEventListener("submit", async e => { e.preventDefault(); const name = tidyName($("#jName").value); if (!name) return;
  const k = { id: "k" + Math.random().toString(36).slice(2, 8), pid: uuid(), name, initial: ($("#jInitial").value || "").trim().slice(0, 1).toUpperCase(), age: +$("#jAge").value };
  state.kids.push(k); save(); $("#jName").value = ""; $("#jInitial").value = "";
  try { await joinClass(k, invited); toast(`${name} joined class ${showCode(invited)}!`); } catch(err){ renderJoin("Couldn't join just now. Check your connection and try again."); }
  await refreshBoards(); renderJoin(); speak(["l/welcome_pre", { name }, "l/welcome_post"], `${LINES.welcome_pre} ${name}! ${LINES.welcome_post}`); });
$("#joinDone").onclick = () => { history.replaceState(null, "", appUrl()); $("#joinPanel").hidden = true; };

if (!canListen) $("#noVoice").hidden = false;
state.kids.forEach(k => k.name = tidyName(k.name));
renderHome(); renderJoin(); refreshBoards();
