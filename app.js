// 電工2種試験対策 — 出題・採点・保存の仕組み
"use strict";

const STORE_KEY = "denko2-renshu-v1";
const RANDOM_COUNT = 10;
// 解いた問題が全体のこの割合以上になると投票できる。0.8 にすると80%
const VOTE_UNLOCK_RATE = 0.5;
const MARKS = ["ア", "イ", "ウ", "エ"];

// ---------- アクセス解析（任意） ----------
// 設定したサービスだけ公開先で読み込む。ローカルのfile://では何もしない。
const ANALYTICS_SITE = window.SITE || {};
const ANALYTICS_WEB = location.protocol === "http:" || location.protocol === "https:";
const SCREEN_TITLES = { home: "ホーム", bunya: "選んで解く", quiz: "問題", result: "結果", oen: "応援パック",
  mogi: "模擬試験", "mogi-q": "模擬試験の問題", "mogi-r": "模擬試験の結果" };

if (ANALYTICS_WEB) {
  if (ANALYTICS_SITE.goatcounter) {
    const script = document.createElement("script");
    script.async = true;
    script.src = "//gc.zgo.at/count.js";
    script.setAttribute("data-goatcounter", "https://" + ANALYTICS_SITE.goatcounter + ".goatcounter.com/count");
    document.head.appendChild(script);
  }
  if (ANALYTICS_SITE.cfBeacon) {
    const script = document.createElement("script");
    script.async = true;
    script.src = "https://static.cloudflareinsights.com/beacon.min.js";
    script.setAttribute("data-cf-beacon", JSON.stringify({ token: ANALYTICS_SITE.cfBeacon }));
    document.head.appendChild(script);
  }
}

function countScreen(name) {
  countEvent(SCREEN_TITLES[name]);
}

function countEvent(title, path) {
  if (!ANALYTICS_WEB || !ANALYTICS_SITE.goatcounter || !title ||
      !window.goatcounter || typeof window.goatcounter.count !== "function") return;
  // 画面名・リンク名だけをイベントとして送る（問題のid・回答・成績は送らない）。
  try {
    window.goatcounter.count({ path: path || "/" + title, title: title, event: true });
  } catch (e) {
    // 計測に失敗しても、練習はそのまま続けられる。
  }
}

document.querySelectorAll("[data-video]").forEach(link => {
  link.addEventListener("click", () => countEvent("動画リンク（" + link.dataset.video + "）"));
});

// ---------- 初回の流入元（成績とは別に保存） ----------
const SOURCE_KEY = "denko2-src-v1";
function loadSource() {
  try { return localStorage.getItem(SOURCE_KEY) !== null; } catch (e) { return false; }
}
let sourceAnswered = loadSource();

function renderSource() {
  document.getElementById("source-question").hidden = sourceAnswered;
}

function finishSource(source, title) {
  if (sourceAnswered || loadSource()) {
    sourceAnswered = true;
    renderSource();
    return;
  }
  sourceAnswered = true;
  try { localStorage.setItem(SOURCE_KEY, source); } catch (e) {
    // 保存できなくても、開いている間は再表示しない。
  }
  renderSource();
  if (title) countEvent("知った場所-" + title, "/src/" + source);
}

document.querySelectorAll("[data-source]").forEach(button => {
  button.addEventListener("click", () => finishSource(button.dataset.source, button.textContent));
});
document.getElementById("source-close").addEventListener("click", () => finishSource("closed"));
window.addEventListener("storage", e => {
  if (e.key === SOURCE_KEY && e.newValue !== null) {
    sourceAnswered = true;
    renderSource();
  }
});

// ---------- 鑑別写真の開発希望（成績とは別に保存） ----------
const VOTE_KEY = "denko2-vote-v1";
function loadPhotoVote() {
  try { return localStorage.getItem(VOTE_KEY) === "1"; } catch (e) { return false; }
}
let photoVoted = loadPhotoVote();

function photoVoteProgress() {
  const free = ALL.filter(q => !q.pack);
  const seen = new Set(store.seen);
  const required = Math.ceil(free.length * VOTE_UNLOCK_RATE);
  const done = free.filter(q => seen.has(q.id)).length;
  return { required, remaining: Math.max(0, required - done) };
}

function renderPhotoVote() {
  const { required, remaining } = photoVoteProgress();
  document.querySelectorAll(".photo-vote").forEach(box => {
    const button = box.querySelector(".photo-vote-btn");
    button.hidden = photoVoted || remaining > 0;
    button.disabled = photoVoted || remaining > 0;
    const progress = box.querySelector(".photo-vote-progress");
    progress.hidden = photoVoted || remaining === 0;
    progress.textContent = `全体の${VOTE_UNLOCK_RATE * 100}%（${required}問）を解くと「欲しい！」を押せます。あと${remaining}問`;
    box.querySelector(".photo-vote-thanks").hidden = !photoVoted;
  });
}

function votePhoto() {
  // 同じブラウザの別タブですでに押していた場合も、重ねて送らない。
  if (photoVoted || loadPhotoVote()) {
    photoVoted = true;
    renderPhotoVote();
    return;
  }
  if (photoVoteProgress().remaining > 0) return;
  photoVoted = true;
  try { localStorage.setItem(VOTE_KEY, "1"); } catch (e) {
    // 保存できなくても、この画面を開いている間は投票済みとして扱う。
  }
  renderPhotoVote();
  if (!ANALYTICS_WEB || !ANALYTICS_SITE.goatcounter ||
      !window.goatcounter || typeof window.goatcounter.count !== "function") return;
  try {
    window.goatcounter.count({ path: "/vote/kanbetsu-photo", title: "鑑別写真が欲しい", event: true });
  } catch (e) {
    // 計測に失敗しても、投票済みの表示はそのままにする。
  }
}

document.querySelectorAll(".photo-vote-btn").forEach(b => b.addEventListener("click", votePhoto));
window.addEventListener("storage", e => {
  if (e.key === VOTE_KEY && e.newValue === "1") {
    photoVoted = true;
    renderPhotoVote();
  }
});

// 問題の状態（ステータス）の決まり
const KANPEKI_STREAK = 3; // この回数だけ続けて正解すると「完璧」
const NIGATE_MISS = 2;    // この回数以上まちがえると「苦手」（完璧になるまで）
const JOTAI_LIST = ["未回答", "苦手", "うろ覚え", "完璧"];
const COUNT_OPTIONS = [10, 20, 0]; // 0 は「全部」

// 応援パック：解除済みなら追加問題も出し、広告を消す
const OEN_KEY = "denko2-oen-v1";
function loadUnlocked() {
  try { return localStorage.getItem(OEN_KEY) === "1"; } catch (e) { return false; }
}
let unlocked = loadUnlocked();

const ALL = (window.QUESTIONS || []).filter(q => !q.pack || unlocked);
const byId = new Map(ALL.map(q => [q.id, q]));
// 分野（「配線図」は応援パックの問題があるときだけ出る）
const BUNYA_LIST = ["計算", "法令", "器具・材料", "施工方法", "配線図"].filter(b => ALL.some(q => q.bunya === b));

// ---------- 保存（localStorage） ----------
// 形：{ answers: 回答した回数, corrects: 正解した回数, seen: [解いた問題のid], wrong: [間違えて未復習のid],
//       q: { id: { c: 正解数, w: 不正解数, s: 連続正解数 } }, skipKanpeki: true/false,
//       pick: { bunya: [...], jotai: [...], count: 10 } }
function emptyStore() {
  return { answers: 0, corrects: 0, seen: [], wrong: [], q: {}, skipKanpeki: true, pick: null };
}

function loadStore() {
  try {
    const data = JSON.parse(localStorage.getItem(STORE_KEY));
    if (!data) return emptyStore();
    const s = { ...emptyStore(), ...data };
    // 状態の記録がない古い保存データは、解いた・間違えたの記録から作る
    if (!data.q) {
      s.seen.forEach(id => { s.q[id] = s.wrong.includes(id) ? { c: 0, w: 1, s: 0 } : { c: 1, w: 0, s: 1 }; });
    }
    return s;
  } catch (e) {
    return emptyStore();
  }
}

function saveStore() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
  } catch (e) {
    // 保存できない環境（プライベートモード等）でも、アプリはそのまま使える
  }
}

let store = loadStore();
// 問題を消したときに、存在しないidが残らないようにする
store.wrong = store.wrong.filter(id => byId.has(id));
store.seen = store.seen.filter(id => byId.has(id));

function jotaiOf(id) {
  const r = store.q[id];
  if (!r || r.c + r.w === 0) return "未回答";
  if (r.s >= KANPEKI_STREAK) return "完璧";
  if (r.w >= NIGATE_MISS) return "苦手";
  return "うろ覚え";
}

function countJotai(list) {
  const n = { "未回答": 0, "苦手": 0, "うろ覚え": 0, "完璧": 0 };
  list.forEach(q => n[jotaiOf(q.id)]++);
  return n;
}

// ---------- 小さな道具 ----------
const $ = id => document.getElementById(id);

function shuffle(list) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function percent(part, whole) {
  return whole ? Math.round((part / whole) * 100) : 0;
}

function show(name) {
  document.querySelectorAll(".screen").forEach(s => { s.hidden = s.id !== "screen-" + name; });
  window.scrollTo(0, 0);
  if (name === "home") renderHome();
  if (name === "bunya") renderPick();
  if (name === "oen") renderOen();
  if (name === "mogi") renderMogiStart();
  clearInterval(mogiTimer); // 時計は模擬試験の問題画面にいる間だけ動かす
  if (name === "mogi-q") mogiTimer = setInterval(tickMogi, 1000);
  countScreen(name);
}

// 解説の【要確認】を目立たせて表示する
function setTextWithKakunin(el, text) {
  el.textContent = "";
  text.split(/(【要確認】)/).forEach(part => {
    if (part === "【要確認】") {
      const s = document.createElement("span");
      s.className = "kakunin";
      s.textContent = part;
      el.appendChild(s);
    } else if (part) {
      el.appendChild(document.createTextNode(part));
    }
  });
}

// ---------- ホーム ----------
function renderHome() {
  renderSource();
  renderHomeOsusume();
  renderPhotoVote();
  $("stat-rate").textContent = store.answers ? percent(store.corrects, store.answers) + "%" : "—";
  $("stat-done").textContent = store.seen.length;
  $("stat-done-label").textContent = `解いた問題／${ALL.length}問`;
  const n = store.wrong.length;
  $("review-count").textContent = n;
  $("review-count").classList.toggle("zero", n === 0);
  $("btn-review").disabled = n === 0;
  $("opt-skip-kanpeki").checked = store.skipKanpeki;
  $("btn-oen").hidden = !(window.OEN && window.OEN.enabled);
  const m = loadMogi();
  $("btn-mogi").textContent = m ? `模擬試験のつづき（残り${Math.ceil(mogiLeft(m) / 60000)}分）` : "模擬試験（50問・120分）";
  $("about-report").hidden = !reportUrl("");

  // 分野ごとに、状態の割合を1本の帯で見せる（完璧率を大きく）
  const list = $("progress-list");
  list.textContent = "";
  [["全体", ALL]].concat(BUNYA_LIST.map(b => [b, ALL.filter(q => q.bunya === b)])).forEach(([name, qs]) => {
    if (!qs.length) return;
    const counts = countJotai(qs);
    const li = document.createElement("li");
    li.className = "progress-row" + (name === "全体" ? " is-total" : "");
    li.innerHTML = '<span class="p-name"></span><span class="p-rate"></span><span class="jotai-bar"></span><span class="p-sub"></span>';
    const nameEl = li.querySelector(".p-name");
    nameEl.textContent = name;
    if (name !== "全体") nameEl.dataset.bunya = name;
    li.querySelector(".p-rate").innerHTML = `${percent(counts["完璧"], qs.length)}<small>%</small>`;
    li.querySelector(".p-sub").textContent = `完璧 ${counts["完璧"]} / ${qs.length}問　苦手 ${counts["苦手"]}問`;
    const bar = li.querySelector(".jotai-bar");
    ["完璧", "うろ覚え", "苦手", "未回答"].forEach(j => {
      if (!counts[j]) return;
      const seg = document.createElement("span");
      seg.dataset.jotai = j;
      seg.style.flexGrow = counts[j];
      bar.appendChild(seg);
    });
    list.appendChild(li);
  });

  const legend = $("jotai-legend");
  legend.textContent = "";
  ["完璧", "うろ覚え", "苦手", "未回答"].forEach(j => {
    const li = document.createElement("li");
    li.dataset.jotai = j;
    li.innerHTML = '<span class="dot"></span>';
    li.appendChild(document.createTextNode(j));
    legend.appendChild(li);
  });
}

// ---------- 選んで解く（分野・状態・問題数） ----------
function pickState() {
  const p = store.pick || {};
  return {
    bunya: p.bunya && p.bunya.length ? p.bunya : BUNYA_LIST.slice(),
    jotai: p.jotai && p.jotai.length ? p.jotai : ["未回答", "苦手", "うろ覚え"],
    count: p.count !== undefined ? p.count : 10
  };
}

function pickedQuestions(p) {
  return ALL.filter(q => p.bunya.includes(q.bunya) && p.jotai.includes(jotaiOf(q.id)));
}

function makeChip(label, sub, on, onClick, data) {
  const b = document.createElement("button");
  b.className = "chip";
  b.setAttribute("aria-pressed", on ? "true" : "false");
  Object.assign(b.dataset, data || {});
  b.innerHTML = '<span class="chip-label"></span><span class="chip-sub"></span>';
  b.querySelector(".chip-label").textContent = label;
  b.querySelector(".chip-sub").textContent = sub;
  b.addEventListener("click", onClick);
  return b;
}

function renderPick() {
  const p = pickState();
  const toggle = (key, value) => {
    const list = p[key];
    const i = list.indexOf(value);
    if (i >= 0) {
      if (list.length > 1) list.splice(i, 1); // 最低1つは選んだままにする
    } else {
      list.push(value);
    }
    store.pick = p;
    saveStore();
    renderPick();
  };

  const bunyaBox = $("pick-bunya");
  bunyaBox.textContent = "";
  BUNYA_LIST.forEach(b => {
    const n = ALL.filter(q => q.bunya === b).length;
    bunyaBox.appendChild(makeChip(b, `${n}問`, p.bunya.includes(b), () => toggle("bunya", b), { bunya: b }));
  });

  const inBunya = ALL.filter(q => p.bunya.includes(q.bunya));
  const counts = countJotai(inBunya);
  const jotaiBox = $("pick-jotai");
  jotaiBox.textContent = "";
  JOTAI_LIST.forEach(j => {
    jotaiBox.appendChild(makeChip(j, `${counts[j]}問`, p.jotai.includes(j), () => toggle("jotai", j), { jotai: j }));
  });

  const countBox = $("pick-count");
  countBox.textContent = "";
  COUNT_OPTIONS.forEach(c => {
    countBox.appendChild(makeChip(c ? `${c}問` : "全部", "", p.count === c, () => {
      p.count = c;
      store.pick = p;
      saveStore();
      renderPick();
    }));
  });

  const hits = pickedQuestions(p).length;
  const n = p.count ? Math.min(p.count, hits) : hits;
  const go = $("btn-pick-start");
  go.disabled = n === 0;
  go.textContent = n ? `${n}問を解く（対象 ${hits}問）` : "当てはまる問題がありません";
}

// ---------- 出題 ----------
let quiz = null; // { list, index, results: [true/false...] }

function startQuiz(list) {
  if (!list.length) return;
  quiz = { list, index: 0, results: [] };
  show("quiz");
  renderQuestion();
}

function renderMeter(el, total, results, nowIndex) {
  el.textContent = "";
  for (let i = 0; i < total; i++) {
    const li = document.createElement("li");
    if (i < results.length) li.className = results[i] ? "ok" : "ng";
    else if (i === nowIndex) li.className = "now";
    el.appendChild(li);
  }
}

function renderQuestion() {
  const q = quiz.list[quiz.index];
  const total = quiz.list.length;
  $("q-count").textContent = `${quiz.index + 1} / ${total}問`;
  renderMeter($("q-meter"), total, quiz.results, quiz.index);
  $("q-bunya").textContent = q.bunya;
  $("q-bunya").dataset.bunya = q.bunya;
  $("q-text").textContent = q.mondai;
  const zu = $("q-zu");
  if (q.zu) {
    zu.src = q.zu;
    zu.alt = q.zuAlt || "問題の図";
    zu.hidden = false;
  } else {
    zu.hidden = true;
    zu.removeAttribute("src");
  }
  $("q-answer").hidden = true;

  // 選択肢は毎回並べ替える（元の番号を覚えておいて採点に使う）
  const order = shuffle([0, 1, 2, 3]);
  const box = $("q-choices");
  box.textContent = "";
  order.forEach((orig, pos) => {
    const b = document.createElement("button");
    b.className = "choice";
    b.dataset.orig = orig;
    b.innerHTML = '<span class="mark"></span><span class="label"></span>';
    b.querySelector(".mark").textContent = MARKS[pos];
    b.querySelector(".label").textContent = q.sentakushi[orig];
    b.addEventListener("click", () => answer(orig));
    box.appendChild(b);
  });
}

// 1問の結果を成績に入れる（保存は呼び出し側で saveStore する）
function recordAnswer(q, correct) {
  store.answers++;
  if (correct) store.corrects++;
  if (!store.seen.includes(q.id)) store.seen.push(q.id);
  if (correct) store.wrong = store.wrong.filter(id => id !== q.id);
  else if (!store.wrong.includes(q.id)) store.wrong.push(q.id);
  const r = store.q[q.id] || (store.q[q.id] = { c: 0, w: 0, s: 0 });
  if (correct) { r.c++; r.s++; } else { r.w++; r.s = 0; }
  return r;
}

function answer(chosen) {
  const q = quiz.list[quiz.index];
  const correct = chosen === q.seikai;

  document.querySelectorAll("#q-choices .choice").forEach(b => {
    const orig = Number(b.dataset.orig);
    b.disabled = true;
    if (orig === q.seikai) b.classList.add("ok");
    else if (orig === chosen) b.classList.add("ng");
    else b.classList.add("dim");
  });

  const r = recordAnswer(q, correct);
  saveStore();

  quiz.results.push(correct);
  renderMeter($("q-meter"), quiz.list.length, quiz.results, -1);

  const v = $("q-verdict");
  v.textContent = correct ? "正解" : "不正解";
  v.className = "verdict " + (correct ? "ok" : "ng");

  // この問題の状態と、完璧まであと何回か
  const j = jotaiOf(q.id);
  const rest = KANPEKI_STREAK - r.s;
  const jt = $("q-jotai");
  jt.dataset.jotai = j;
  jt.textContent = j === "完璧" ? "完璧" : `${j}・完璧まであと${rest}回`;

  setTextWithKakunin($("q-kaisetsu"), q.kaisetsu);
  $("q-genba").textContent = q.genba;
  $("btn-next").textContent = quiz.index + 1 < quiz.list.length ? "次の問題へ" : "結果を見る";
  const rep = $("q-report");
  const url = reportUrl(q.id);
  rep.hidden = !url;
  if (url) rep.href = url;
  $("q-answer").hidden = false;
  $("q-answer").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "nearest" });
}

function next() {
  quiz.index++;
  if (quiz.index < quiz.list.length) {
    renderQuestion();
    window.scrollTo(0, 0);
  } else {
    renderResult();
    show("result");
  }
}

// ---------- 結果 ----------
function renderResult() {
  const total = quiz.list.length;
  const ok = quiz.results.filter(Boolean).length;
  $("r-rate").textContent = percent(ok, total);
  $("r-sub").textContent = `${total}問中 ${ok}問 正解`;
  renderMeter($("r-meter"), total, quiz.results, -1);

  const body = $("r-table");
  body.textContent = "";
  BUNYA_LIST.forEach(bunya => {
    const idx = quiz.list.map((q, i) => (q.bunya === bunya ? i : -1)).filter(i => i >= 0);
    if (!idx.length) return;
    const okCount = idx.filter(i => quiz.results[i]).length;
    const tr = document.createElement("tr");
    tr.innerHTML = '<td><span class="tag"></span></td><td></td>';
    const tag = tr.querySelector(".tag");
    tag.textContent = bunya;
    tag.dataset.bunya = bunya;
    tr.lastChild.textContent = `${okCount} / ${idx.length}`;
    body.appendChild(tr);
  });

  renderOsusume();

  const wrongCount = total - ok;
  const retry = $("btn-retry-wrong");
  retry.disabled = wrongCount === 0;
  retry.textContent = wrongCount ? `間違えた問題だけもう一度（${wrongCount}問）` : "全問正解です";
}

// おすすめ欄（osusume.js で show: true にしたときだけ出す）
function renderOsusume() {
  const o = window.OSUSUME;
  const box = $("osusume");
  if (unlocked || !o || !o.show || !o.items || !o.items.length) {
    box.hidden = true;
    return;
  }
  $("osusume-title").textContent = o.title;
  const list = $("osusume-list");
  list.textContent = "";
  o.items.forEach((item, index) => {
    const li = document.createElement("li");
    const a = document.createElement("a");
    a.href = item.url;
    a.target = "_blank";
    a.rel = "sponsored noopener";
    a.addEventListener("click", () => countEvent("おすすめ-" + Array.from(item.name).slice(0, 15).join(""),
      "/click/osusume-" + (index + 1)));
    a.innerHTML = '<span class="o-name"></span><span class="o-note"></span>';
    a.querySelector(".o-name").textContent = item.name;
    a.querySelector(".o-note").textContent = item.note || "";
    li.appendChild(a);
    list.appendChild(li);
  });
  box.hidden = false;
}

function renderHomeOsusume() {
  const o = window.OSUSUME;
  const box = $("home-osusume");
  const item = o && Number.isInteger(o.homeIndex) && o.items && o.items[o.homeIndex];
  box.hidden = unlocked || !o || !o.show || !item;
  if (box.hidden) return;
  const link = $("home-osusume-link");
  link.href = item.url;
  link.querySelector(".o-name").textContent = item.name;
  link.querySelector(".o-note").textContent = item.note || "";
}

$("home-osusume-link").addEventListener("click", () => countEvent("おすすめ-ホーム", "/click/home-osusume"));

// 誤りの報告先（site.js の reportUrl）。{id} は問題の id に置き換える
function reportUrl(id) {
  const u = window.SITE && window.SITE.reportUrl;
  return u ? u.replace(/\{id\}|%7Bid%7D/gi, encodeURIComponent(id)) : "";
}

// ---------- 応援パック ----------
function normalizeCode(code) {
  return code.toUpperCase().replace(/[\s\-ー－]/g, "");
}

async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, "0")).join("");
}

function fillList(el, items) {
  el.textContent = "";
  items.forEach(t => {
    const li = document.createElement("li");
    li.textContent = t;
    el.appendChild(li);
  });
}

function renderOen() {
  renderPhotoVote();
  const o = window.OEN || {};
  $("oen-name").textContent = o.name || "応援パック";
  $("oen-sell").hidden = unlocked;
  $("oen-done").hidden = !unlocked;
  fillList($("oen-benefits"), o.benefits || []);
  fillList($("oen-benefits-done"), o.benefits || []);
  $("oen-price").textContent = o.price ? `価格：${o.price}（買い切り）` : "";
  const buy = $("oen-buy");
  buy.hidden = !o.buyUrl;
  if (o.buyUrl) buy.href = o.buyUrl;
  $("oen-msg").textContent = "";
}

$("oen-form").addEventListener("submit", async e => {
  e.preventDefault();
  const msg = $("oen-msg");
  const code = normalizeCode($("oen-code").value);
  if (!code) {
    msg.textContent = "解除コードを入力してください。";
    return;
  }
  let hash = "";
  try {
    hash = await sha256(code);
  } catch (err) {
    msg.textContent = "このブラウザでは解除できません。Chrome か Safari の最新版で開いてください。";
    return;
  }
  if ((window.OEN && window.OEN.codeHashes || []).includes(hash)) {
    try { localStorage.setItem(OEN_KEY, "1"); } catch (err) {}
    location.reload(); // 追加問題を読み込み直す
  } else {
    msg.textContent = "解除コードが違います。購入時に届いたコードを、そのまま入力してください。";
  }
});

// ---------- 模擬試験（50問・120分・最後にまとめて採点） ----------
const MOGI_KEY = "denko2-mogi-v1"; // 途中の答案（成績とは別に保存）
const MOGI_MINUTES = 120;
const MOGI_PASS = 30; // 30問正解（60点）で合格ライン
// 分野ごとの出題数（合計50問）。本番は一般問題30問（計算10・器具材料8・施工と検査9・法令3が目安）＋配線図20問。
// 配線図の問題がないときは、配線図で問われる器具・施工の分を中心に4分野へ振り分ける。
const MOGI_HAIBUN = { "計算": 12, "器具・材料": 15, "施工方法": 18, "法令": 5 };
const MOGI_HAIBUN_HAISEN = { "計算": 10, "器具・材料": 8, "施工方法": 9, "法令": 3, "配線図": 20 };
const MOGI_TOTAL = 50;

let mogi = null;      // { ids, order: [[選択肢の並び]], picks: [選んだ元の番号 or null], index, deadline, started }
let mogiTimer = null;
let mogiResult = null; // 直前の採点結果（解き直し用）

function mogiHaibun() {
  return ALL.some(q => q.bunya === "配線図") ? MOGI_HAIBUN_HAISEN : MOGI_HAIBUN;
}

function loadMogi() {
  if (mogi) return mogi;
  try {
    const m = JSON.parse(localStorage.getItem(MOGI_KEY));
    // 問題を消したなどで、答案の問題がそろわないときは捨てる
    if (m && Array.isArray(m.ids) && m.ids.every(id => byId.has(id))) mogi = m;
  } catch (e) {}
  return mogi;
}

function saveMogi() {
  try {
    if (mogi) localStorage.setItem(MOGI_KEY, JSON.stringify(mogi));
    else localStorage.removeItem(MOGI_KEY);
  } catch (e) {
    // 保存できなくても、開いている間は続けられる
  }
}

function mogiLeft(m) {
  return Math.max(0, m.deadline - Date.now());
}

function renderMogiStart() {
  const haibun = mogiHaibun();
  const body = $("mogi-haibun");
  body.textContent = "";
  Object.keys(haibun).forEach(bunya => {
    const tr = document.createElement("tr");
    tr.innerHTML = '<td><span class="tag"></span></td><td></td>';
    const tag = tr.querySelector(".tag");
    tag.textContent = bunya;
    tag.dataset.bunya = bunya;
    tr.lastChild.textContent = `${haibun[bunya]}問`;
    body.appendChild(tr);
  });
  const m = loadMogi();
  $("btn-mogi-start").textContent = m ? `つづきから（残り${Math.ceil(mogiLeft(m) / 60000)}分）` : "開始する";
  $("btn-mogi-restart").hidden = !m;
}

function newMogi() {
  // 分野ごとに決まった数を選ぶ。足りない分はほかの分野から補う
  const haibun = mogiHaibun();
  let picked = [];
  Object.keys(haibun).forEach(bunya => {
    picked = picked.concat(shuffle(ALL.filter(q => q.bunya === bunya)).slice(0, haibun[bunya]));
  });
  const used = new Set(picked.map(q => q.id));
  picked = picked.concat(shuffle(ALL.filter(q => !used.has(q.id))).slice(0, MOGI_TOTAL - picked.length));
  // 本番と同じく、分野ごとにまとめて並べる
  const rank = Object.keys(haibun);
  picked.sort((a, b) => rank.indexOf(a.bunya) - rank.indexOf(b.bunya));
  const now = Date.now();
  mogi = {
    ids: picked.map(q => q.id),
    order: picked.map(() => shuffle([0, 1, 2, 3])),
    picks: picked.map(() => null),
    index: 0,
    started: now,
    deadline: now + MOGI_MINUTES * 60000
  };
  saveMogi();
}

function openMogi() {
  if (!loadMogi()) newMogi();
  if (mogiLeft(mogi) === 0) {
    finishMogi(); // 中断中に時間切れになっていた
    return;
  }
  show("mogi-q");
  renderMogiQuestion();
  tickMogi();
}

function tickMogi() {
  if (!mogi) return;
  const left = mogiLeft(mogi);
  const sec = Math.ceil(left / 1000);
  const t = $("mq-timer");
  t.textContent = `残り ${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
  t.classList.toggle("is-low", left <= 10 * 60000);
  if (left === 0) {
    alert("時間切れです。ここまでの答えで採点します。");
    finishMogi();
  }
}

function renderMogiQuestion() {
  const i = mogi.index;
  const q = byId.get(mogi.ids[i]);
  const total = mogi.ids.length;
  $("mq-count").textContent = `${i + 1} / ${total}問`;

  const nums = $("mq-nums");
  nums.textContent = "";
  mogi.ids.forEach((id, n) => {
    const li = document.createElement("li");
    const b = document.createElement("button");
    b.textContent = n + 1;
    b.className = (mogi.picks[n] !== null ? "done" : "") + (n === i ? " now" : "");
    b.setAttribute("aria-label", `${n + 1}問目` + (mogi.picks[n] !== null ? "（回答済み）" : ""));
    b.addEventListener("click", () => moveMogi(n));
    li.appendChild(b);
    nums.appendChild(li);
  });

  $("mq-bunya").textContent = q.bunya;
  $("mq-bunya").dataset.bunya = q.bunya;
  $("mq-text").textContent = q.mondai;
  const zu = $("mq-zu");
  if (q.zu) {
    zu.src = q.zu;
    zu.alt = q.zuAlt || "問題の図";
    zu.hidden = false;
  } else {
    zu.hidden = true;
    zu.removeAttribute("src");
  }

  const box = $("mq-choices");
  box.textContent = "";
  mogi.order[i].forEach((orig, pos) => {
    const b = document.createElement("button");
    b.className = "choice";
    b.dataset.orig = orig;
    b.setAttribute("aria-pressed", mogi.picks[i] === orig ? "true" : "false");
    b.innerHTML = '<span class="mark"></span><span class="label"></span>';
    b.querySelector(".mark").textContent = MARKS[pos];
    b.querySelector(".label").textContent = q.sentakushi[orig];
    b.addEventListener("click", () => {
      mogi.picks[i] = orig;
      saveMogi();
      renderMogiQuestion();
    });
    box.appendChild(b);
  });

  $("btn-mogi-prev").disabled = i === 0;
  $("btn-mogi-next").disabled = i === total - 1;
  const rest = mogi.picks.filter(p => p === null).length;
  $("btn-mogi-finish").textContent = rest ? `採点する（未回答 ${rest}問）` : "採点する";
}

function moveMogi(n) {
  mogi.index = Math.max(0, Math.min(mogi.ids.length - 1, n));
  saveMogi();
  renderMogiQuestion();
  window.scrollTo(0, 0);
}

function finishMogi() {
  clearInterval(mogiTimer);
  const m = mogi;
  const list = m.ids.map(id => byId.get(id));
  const results = list.map((q, i) => m.picks[i] === q.seikai);
  // 答えた問題だけ、ふだんの成績（苦手・完璧など）にも入れる。未回答は記録しない
  list.forEach((q, i) => { if (m.picks[i] !== null) recordAnswer(q, results[i]); });
  saveStore();
  mogiResult = { list, picks: m.picks.slice(), results, timeUp: Date.now() >= m.deadline,
    used: Math.min(Date.now(), m.deadline) - m.started };
  mogi = null;
  saveMogi();
  renderMogiResult();
  show("mogi-r");
}

function renderMogiResult() {
  const { list, picks, results, used, timeUp } = mogiResult;
  const total = list.length;
  const ok = results.filter(Boolean).length;
  $("mr-score").textContent = Math.round((ok / total) * 100);
  const line = $("mr-line");
  const pass = ok >= MOGI_PASS;
  line.className = "mogi-line " + (pass ? "ok" : "ng");
  line.textContent = pass ? "合格ライン" : `合格ラインまで あと${MOGI_PASS - ok}問`;
  const min = Math.ceil(used / 60000);
  const blank = picks.filter(p => p === null).length;
  $("mr-sub").textContent = `${total}問中 ${ok}問 正解・` + (timeUp ? "時間切れ" : `かかった時間 ${min}分`) +
    (blank ? `・未回答 ${blank}問` : "");
  renderMeter($("mr-meter"), total, results, -1);

  const body = $("mr-table");
  body.textContent = "";
  BUNYA_LIST.forEach(bunya => {
    const idx = list.map((q, i) => (q.bunya === bunya ? i : -1)).filter(i => i >= 0);
    if (!idx.length) return;
    const tr = document.createElement("tr");
    tr.innerHTML = '<td><span class="tag"></span></td><td></td>';
    const tag = tr.querySelector(".tag");
    tag.textContent = bunya;
    tag.dataset.bunya = bunya;
    tr.lastChild.textContent = `${idx.filter(i => results[i]).length} / ${idx.length}`;
    body.appendChild(tr);
  });

  // 間違えた問題の一覧（あなたの答え・正解・解説）
  const box = $("mr-wrong");
  box.textContent = "";
  list.forEach((q, i) => {
    if (results[i]) return;
    const li = document.createElement("li");
    li.className = "mogi-card";
    li.innerHTML = '<p class="mogi-card-head"><span class="mogi-card-no"></span><span class="tag"></span></p>' +
      '<p class="mogi-card-q"></p><img class="zu" alt="" hidden>' +
      '<p class="mogi-ans ng"><b>あなたの答え</b><span></span></p>' +
      '<p class="mogi-ans ok"><b>正解</b><span></span></p>' +
      '<div class="note"><h3>解説</h3><p class="mogi-kaisetsu"></p></div>';
    li.querySelector(".mogi-card-no").textContent = `${i + 1}問目`;
    const tag = li.querySelector(".tag");
    tag.textContent = q.bunya;
    tag.dataset.bunya = q.bunya;
    li.querySelector(".mogi-card-q").textContent = q.mondai;
    if (q.zu) {
      const zu = li.querySelector(".zu");
      zu.src = q.zu;
      zu.alt = q.zuAlt || "問題の図";
      zu.hidden = false;
    }
    li.querySelector(".mogi-ans.ng span").textContent = picks[i] === null ? "未回答" : q.sentakushi[picks[i]];
    li.querySelector(".mogi-ans.ok span").textContent = q.sentakushi[q.seikai];
    setTextWithKakunin(li.querySelector(".mogi-kaisetsu"), q.kaisetsu);
    box.appendChild(li);
  });
  const wrongCount = total - ok;
  $("mr-wrong-title").hidden = wrongCount === 0;
  const retry = $("btn-mogi-retry-wrong");
  retry.disabled = wrongCount === 0;
  retry.textContent = wrongCount ? `間違えた問題を解き直す（${wrongCount}問）` : "全問正解です";
}

// ---------- ボタンの動き ----------
$("btn-random").addEventListener("click", () => {
  let pool = ALL;
  if (store.skipKanpeki) {
    const notYet = ALL.filter(q => jotaiOf(q.id) !== "完璧");
    pool = notYet.length ? notYet : ALL; // 全部完璧なら、全問から出す
  }
  startQuiz(shuffle(pool).slice(0, RANDOM_COUNT));
});
$("btn-bunya").addEventListener("click", () => show("bunya"));
$("btn-mogi").addEventListener("click", () => show("mogi"));
$("btn-mogi-start").addEventListener("click", openMogi);
$("btn-mogi-restart").addEventListener("click", () => {
  if (!confirm("途中の答えを消して、新しい50問で始めます。よろしいですか？")) return;
  mogi = null;
  saveMogi();
  openMogi();
});
$("btn-mogi-pause").addEventListener("click", () => show("home"));
$("btn-mogi-prev").addEventListener("click", () => moveMogi(mogi.index - 1));
$("btn-mogi-next").addEventListener("click", () => moveMogi(mogi.index + 1));
$("btn-mogi-finish").addEventListener("click", () => {
  const rest = mogi.picks.filter(p => p === null).length;
  if (rest && !confirm(`まだ答えていない問題が${rest}問あります（不正解になります）。採点しますか？`)) return;
  finishMogi();
});
$("btn-mogi-retry-wrong").addEventListener("click", () => {
  startQuiz(shuffle(mogiResult.list.filter((q, i) => !mogiResult.results[i])));
});
$("btn-oen").addEventListener("click", () => show("oen"));
$("btn-pick-start").addEventListener("click", () => {
  const p = pickState();
  const list = shuffle(pickedQuestions(p));
  startQuiz(p.count ? list.slice(0, p.count) : list);
});
$("opt-skip-kanpeki").addEventListener("change", e => {
  store.skipKanpeki = e.target.checked;
  saveStore();
});
$("btn-review").addEventListener("click", () => startQuiz(shuffle(store.wrong.map(id => byId.get(id)))));
$("btn-next").addEventListener("click", next);
$("btn-retry-wrong").addEventListener("click", () => {
  startQuiz(shuffle(quiz.list.filter((q, i) => !quiz.results[i])));
});
$("btn-reset").addEventListener("click", () => {
  if (confirm("これまでの成績と、問題ごとの状態（苦手・完璧など）の記録を消します。よろしいですか？")) {
    store = emptyStore();
    saveStore();
    renderHome();
  }
});
document.querySelectorAll("[data-go]").forEach(b => {
  b.addEventListener("click", () => show(b.dataset.go));
});

// 動画の固定コメントからの直リンク（例：?bunya=keisan）。その分野から10問をすぐ出す
const LINK_BUNYA = { keisan: "計算", hourei: "法令", kizai: "器具・材料", sekou: "施工方法" };
const linkBunya = LINK_BUNYA[new URLSearchParams(location.search).get("bunya")];
if (linkBunya) {
  history.replaceState(null, "", location.pathname); // 再読み込みで同じ出題をくり返さない
  const inBunya = ALL.filter(q => q.bunya === linkBunya);
  const notYet = inBunya.filter(q => jotaiOf(q.id) !== "完璧");
  startQuiz(shuffle(store.skipKanpeki && notYet.length ? notYet : inBunya).slice(0, RANDOM_COUNT));
  setTimeout(() => countEvent("直リンク-" + linkBunya), 3000); // 計測の読み込みを待つ
} else {
  show("home");
}

// 公開先（https）で開いたときだけ、オフライン用の仕組みを有効にする
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
