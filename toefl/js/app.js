/* ═══════════════════════════════════════════════════════
   TOEFL Kart — Uygulama Mantığı
   Leitner aralıklı tekrar + kaydırmalı kartlar + test modu
   ═══════════════════════════════════════════════════════ */
"use strict";

/* ─────────── Veri Kurulumu ─────────── */

const BATCHES = window.WORD_BATCHES || [];
const WORDS = [];
const WORD_MAP = {};
{
  const seen = new Set();
  for (const b of BATCHES) {
    for (const w of b.words || []) {
      const key = String(w.word).toLowerCase().trim();
      if (seen.has(key)) continue;
      seen.add(key);
      const entry = Object.assign({}, w, { deckId: b.id, deckTr: b.categoryTr, deckIcon: b.icon });
      WORDS.push(entry);
      WORD_MAP[key] = entry;
    }
  }
}
const DECKS = BATCHES.map((b) => ({
  id: b.id,
  name: b.categoryTr,
  icon: b.icon,
  count: WORDS.filter((w) => w.deckId === b.id).length,
}));

const POS_TR = {
  noun: "isim", verb: "fiil", adjective: "sıfat", adverb: "zarf",
  phrase: "ifade", conjunction: "bağlaç", preposition: "edat",
};

/* Deste kimliği → SVG ikon eşlemesi */
const DECK_ICONS = {
  "academic-verbs": "i-target",
  "academic-nouns": "i-book",
  "academic-adjectives": "i-feather",
  "science-nature": "i-flask",
  "society-culture": "i-landmark",
  "business-economy": "i-briefcase",
  "environment": "i-globe",
  "health-medicine": "i-pulse",
  "technology": "i-cpu",
  "connectors": "i-link",
  "b1-core": "i-layers",
  "b1-campus": "i-backpack",
  "academic-verbs-2": "i-target",
  "academic-nouns-2": "i-book",
  "academic-adjectives-2": "i-feather",
  "arts-literature": "i-palette",
  "astronomy-earth": "i-orbit",
  "biology-zoology": "i-leaf",
  "anthropology-archaeology": "i-scroll",
  "education-research": "i-cap",
  "law-politics": "i-scale",
  "us-history": "i-map",
  "phrasal-verbs": "i-chat",
  "idioms-collocations": "i-quote",
  "media-communication": "i-megaphone",
};
function icon(name, cls) {
  return '<svg class="ico' + (cls ? " " + cls : "") + '"><use href="#' + (name || "i-book") + '"/></svg>';
}
const deckIcon = (id) => icon(DECK_ICONS[id]);

/* ─────────── Kayıt (localStorage) ─────────── */

const STORE_KEY = "toefl_kart_v1";
const DAY_MS = 86400000;
// Leitner kutu aralıkları (gün): kutu 1 → 1 gün sonra, ... kutu 5 → 30 gün sonra
const BOX_INTERVALS = [0, 1, 2, 4, 10, 30];
const MAX_BOX = 5;

function defaultStore() {
  return {
    settings: { theme: "light", autoSpeak: true, accent: "en-US", sessionSize: 20, dailyGoal: 20 },
    profile: { name: "", photo: "", email: "", google: false },
    words: {},   // { kelime: {box, due, seen, right, wrong, fav} }
    days: {},    // { 'YYYY-AA-GG': {studied, known, quiz} }
  };
}

let store = defaultStore();
try {
  const raw = localStorage.getItem(STORE_KEY);
  if (raw) {
    const parsed = JSON.parse(raw);
    store = Object.assign(defaultStore(), parsed);
    store.settings = Object.assign(defaultStore().settings, parsed.settings || {});
    store.profile = Object.assign(defaultStore().profile, parsed.profile || {});
  }
} catch (e) { /* bozuk kayıt → sıfırdan */ }

function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch (e) {}
  if (window.TKHesap) window.TKHesap.degisti();   // girişliyse buluta da yaz (js/hesap.js)
}

function wp(word) {
  const key = word.toLowerCase();
  if (!store.words[key]) store.words[key] = { box: 0, due: 0, seen: 0, right: 0, wrong: 0, fav: false };
  return store.words[key];
}

function todayKey(offset = 0) {
  const d = new Date(Date.now() + offset * DAY_MS);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return d.getFullYear() + "-" + m + "-" + day;
}

function today() {
  const k = todayKey();
  if (!store.days[k]) store.days[k] = { studied: 0, known: 0, quiz: 0 };
  return store.days[k];
}

function streakDays() {
  let n = 0;
  let offset = 0;
  const t = store.days[todayKey()];
  if (!t || (t.studied + t.quiz) === 0) offset = -1; // bugün henüz yoksa dünden say
  for (let i = 0; i < 3650; i++) {
    const d = store.days[todayKey(offset - i)];
    if (d && (d.studied + d.quiz) > 0) n++;
    else break;
  }
  return n;
}

/* ─────────── Kelime kümeleri ─────────── */

const now = () => Date.now();
const isDue = (w) => { const p = wp(w.word); return p.box > 0 && p.box < MAX_BOX + 1 && p.due <= now(); };
const isNew = (w) => wp(w.word).seen === 0;
const isLearned = (w) => wp(w.word).box >= 4;
const isHard = (w) => { const p = wp(w.word); return p.wrong >= 2 && p.box < 4; };
const isFav = (w) => wp(w.word).fav;

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function highlightWord(sentence, word) {
  try {
    const esc = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp("(" + esc + "\\w*)", "gi");
    return escapeHtml(sentence).replace(re, "<b>$1</b>");
  } catch (e) { return escapeHtml(sentence); }
}

/* ─────────── Seslendirme (TTS) ─────────── */

let voices = [];
function loadVoices() { try { voices = speechSynthesis.getVoices(); } catch (e) {} }
if ("speechSynthesis" in window) {
  loadVoices();
  speechSynthesis.onvoiceschanged = loadVoices;
}

function speak(text) {
  if (!("speechSynthesis" in window) || !text) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = store.settings.accent;
    u.rate = 0.92;
    const v = voices.find((v) => v.lang.replace("_", "-") === store.settings.accent) ||
              voices.find((v) => v.lang.startsWith("en"));
    if (v) u.voice = v;
    speechSynthesis.speak(u);
  } catch (e) {}
}

/* ─────────── Küçük yardımcılar ─────────── */

const $ = (id) => document.getElementById(id);

let toastTimer = null;
function toast(msg) {
  let el = $("toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "toast";
    el.style.cssText = "position:fixed;bottom:96px;left:50%;transform:translateX(-50%);background:var(--surface-2);color:var(--text);border:1px solid var(--border);padding:11px 20px;border-radius:14px;font-size:13.5px;font-weight:600;z-index:300;box-shadow:var(--shadow);max-width:85%;text-align:center;transition:opacity .3s;pointer-events:none;";
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.style.opacity = "1";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.style.opacity = "0"; }, 2200);
}

function confettiBurst() {
  const layer = $("confetti-layer");
  const colors = ["#8b7cff", "#2dd4a8", "#ffb454", "#ff5c7a", "#5e8bff", "#f9f871"];
  for (let i = 0; i < 70; i++) {
    const p = document.createElement("div");
    p.className = "confetti";
    p.style.left = Math.random() * 100 + "%";
    p.style.background = colors[Math.floor(Math.random() * colors.length)];
    p.style.animationDuration = 2.2 + Math.random() * 1.8 + "s";
    p.style.animationDelay = Math.random() * 0.5 + "s";
    p.style.transform = "rotate(" + Math.random() * 360 + "deg)";
    layer.appendChild(p);
  }
  setTimeout(() => { layer.innerHTML = ""; }, 4600);
}

/* ─────────── Gezinme (sekmeler) ─────────── */

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
    tab.classList.add("active");
    $(tab.dataset.screen).classList.add("active");
    if (tab.dataset.screen === "screen-home") renderHome();
    if (tab.dataset.screen === "screen-browse") renderBrowse();
    if (tab.dataset.screen === "screen-stats") renderStats();
  });
});

/* ─────────── Ana Sayfa ─────────── */

function renderHome() {
  const t = today();
  const goal = store.settings.dailyGoal;
  const done = t.studied + t.quiz;

  $("ring-count").textContent = done;
  $("ring-goal").textContent = "/ " + goal;
  const pct = Math.min(1, done / goal);
  $("ring-fill").style.strokeDashoffset = String(326.7 * (1 - pct));

  const msgs = done === 0
    ? "Bugün henüz çalışmadın. Hadi başlayalım!"
    : done >= goal
      ? "Günlük hedefini tamamladın — harikasın! 🏆"
      : "Hedefe yalnızca " + (goal - done) + " kart kaldı.";
  $("daily-msg").textContent = msgs;

  $("streak-count").textContent = streakDays();
  $("learned-count").textContent = WORDS.filter(isLearned).length;

  const dueWords = WORDS.filter(isDue);
  $("due-count").textContent = dueWords.length;
  $("due-sub").textContent = dueWords.length
    ? dueWords.length + " kelimenin tekrar zamanı geldi"
    : "Şu an tekrar bekleyen kelime yok";

  $("qc-new").textContent = WORDS.filter(isNew).length;
  $("qc-hard").textContent = WORDS.filter(isHard).length;
  $("qc-fav").textContent = WORDS.filter(isFav).length;
  $("qc-all").textContent = WORDS.length;

  const grid = $("deck-grid");
  grid.innerHTML = "";
  for (const d of DECKS) {
    const deckWords = WORDS.filter((w) => w.deckId === d.id);
    const learned = deckWords.filter(isLearned).length;
    const pctd = d.count ? Math.round((learned / d.count) * 100) : 0;
    const btn = document.createElement("button");
    btn.className = "deck-card";
    btn.innerHTML =
      '<span class="deck-ico">' + deckIcon(d.id) + "</span>" +
      '<span class="deck-name">' + escapeHtml(d.name) + "</span>" +
      '<span class="deck-meta">' + d.count + " kelime • %" + pctd + " öğrenildi</span>" +
      '<span class="deck-bar"><i style="width:' + pctd + '%"></i></span>';
    btn.addEventListener("click", () => startSession({ deckId: d.id }));
    grid.appendChild(btn);
  }
  if (!DECKS.length) {
    grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><span class="es-ico">' + icon("i-book-open") + '</span>Kelime verisi yüklenemedi.<br>js/data klasörünü kontrol edin.</div>';
  }
}

$("btn-due").addEventListener("click", () => {
  const due = WORDS.filter(isDue);
  if (!due.length) return toast("Tekrar bekleyen kelime yok — yeni kelimeler çalışabilirsin");
  startSession({ list: shuffle(due), name: "Günün Tekrarı" });
});

document.querySelectorAll(".quick-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const q = btn.dataset.quick;
    let list, name;
    if (q === "new") { list = WORDS.filter(isNew); name = "Yeni Kelimeler"; }
    if (q === "hard") { list = WORDS.filter(isHard); name = "Zor Kelimeler"; }
    if (q === "fav") { list = WORDS.filter(isFav); name = "Favorilerim"; }
    if (q === "all") { list = WORDS.slice(); name = "Karışık"; }
    if (!list || !list.length) {
      const empty = { new: "Tüm kelimeleri en az bir kez gördün.", hard: "Zor kelimen yok — harika gidiyorsun.", fav: "Henüz favori eklemedin. Karttaki yıldız simgesine dokun.", all: "Kelime verisi bulunamadı." };
      return toast(empty[q]);
    }
    startSession({ list: shuffle(list), name });
  });
});

/* ─────────── Çalışma Oturumu ─────────── */

const session = {
  queue: [], idx: 0, known: 0, again: 0,
  againList: [], name: "", active: false,
};

function buildDeckSession(deckId) {
  const words = WORDS.filter((w) => w.deckId === deckId);
  const due = shuffle(words.filter(isDue));
  const fresh = shuffle(words.filter(isNew));
  const rest = shuffle(words.filter((w) => !isDue(w) && !isNew(w)));
  return due.concat(fresh, rest);
}

function startSession(opts) {
  const size = store.settings.sessionSize;
  let list, name;
  if (opts.deckId) {
    const d = DECKS.find((x) => x.id === opts.deckId);
    list = buildDeckSession(opts.deckId);
    name = d ? d.name : "Deste";
  } else {
    list = opts.list;
    name = opts.name;
  }
  session.queue = list.slice(0, size);
  session.idx = 0;
  session.known = 0;
  session.again = 0;
  session.againList = [];
  session.name = name;
  session.active = true;

  $("study-deck-name").textContent = name;
  $("study-end").classList.add("hidden");
  $("study").classList.remove("hidden");
  renderStack(true);
  updateStudyHeader();
}

function updateStudyHeader() {
  const total = session.queue.length;
  const cur = Math.min(session.idx + 1, total);
  $("study-counter").textContent = cur + " / " + total;
  $("study-progress-fill").style.width = (session.idx / total) * 100 + "%";
}

function cardHTML(w) {
  const p = wp(w.word);
  const posTr = POS_TR[w.pos] || w.pos;
  const examples = (w.examples || []).map((en, i) => {
    const tr = (w.exampleTr || [])[i] || "";
    return '<div class="example"><p class="en">' + highlightWord(en, w.word) + '</p><p class="tr">' + escapeHtml(tr) + "</p></div>";
  }).join("");
  const syns = (w.synonyms || []).map((s) => '<span class="syn-chip">' + escapeHtml(s) + "</span>").join("");
  return (
    '<div class="card-inner">' +
      '<div class="card-face card-front">' +
        '<div class="card-top">' +
          '<span class="chip level">' + escapeHtml(w.level || "") + "</span>" +
          '<span class="chip pos">' + escapeHtml(posTr) + "</span>" +
          '<button class="card-fav' + (p.fav ? " on" : "") + '">' + icon("i-star") + "</button>" +
        "</div>" +
        '<div class="card-word">' + escapeHtml(w.word) + "</div>" +
        '<div class="card-ipa">' + escapeHtml(w.ipa || "") + ' <button class="speak-inline">' + icon("i-volume") + "</button></div>" +
        '<div class="card-hint">Dokun ve çevir</div>' +
        '<div class="card-deck">' + escapeHtml(w.deckTr) + "</div>" +
      "</div>" +
      '<div class="card-face card-back">' +
        '<div class="back-word">' + escapeHtml(w.word) + " " + escapeHtml(w.ipa || "") + "</div>" +
        '<div class="back-tr">' + escapeHtml(w.tr) + "</div>" +
        '<div class="back-def">' + escapeHtml(w.def || "") + "</div>" +
        '<div class="back-divider"></div>' +
        '<div class="back-label">Örnek Cümleler</div>' + examples +
        (syns ? '<div class="back-label" style="margin-top:4px">Eş Anlamlılar</div><div class="back-syns">' + syns + "</div>" : "") +
      "</div>" +
    "</div>" +
    '<div class="swipe-label label-know">BİLİYORUM</div>' +
    '<div class="swipe-label label-again">TEKRAR</div>'
  );
}

function makeCardEl(queueIdx, pos) {
  const w = session.queue[queueIdx];
  const el = document.createElement("div");
  el.className = "card";
  el.dataset.pos = String(pos);
  el.dataset.qidx = String(queueIdx);
  el.innerHTML = cardHTML(w);
  if (pos === 0) attachDrag(el, w);
  return el;
}

function renderStack(fresh) {
  const stack = $("card-stack");
  stack.innerHTML = "";
  for (let i = 2; i >= 0; i--) {
    const qi = session.idx + i;
    if (qi < session.queue.length) stack.appendChild(makeCardEl(qi, i));
  }
  syncFavButton();
}

function topCard() {
  return document.querySelector('#card-stack .card[data-pos="0"]');
}

function advanceStack() {
  // uçan kart zaten kaldırıldı; kalanları öne al, arkaya yeni kart ekle
  const stack = $("card-stack");
  stack.querySelectorAll(".card").forEach((el) => {
    const pos = parseInt(el.dataset.pos, 10) - 1;
    el.dataset.pos = String(pos);
    if (pos === 0) {
      const w = session.queue[parseInt(el.dataset.qidx, 10)];
      attachDrag(el, w);
    }
  });
  const nextIdx = session.idx + 2;
  if (nextIdx < session.queue.length) {
    stack.insertBefore(makeCardEl(nextIdx, 2), stack.firstChild);
  }
  syncFavButton();
}

/* ── Sürükleme / kaydırma / dokunma ── */

let animating = false;

function attachDrag(el, w) {
  let drag = null;
  const inner = el.querySelector(".card-inner");
  const labelKnow = el.querySelector(".label-know");
  const labelAgain = el.querySelector(".label-again");

  el.addEventListener("pointerdown", (e) => {
    if (animating || !session.active) return;
    drag = { x: e.clientX, y: e.clientY, t: Date.now(), moved: false, id: e.pointerId };
    el.classList.remove("snap-back");
    try { el.setPointerCapture(e.pointerId); } catch (err) {}
  });

  el.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (Math.abs(dx) > 8 || Math.abs(dy) > 8) drag.moved = true;
    if (!drag.moved) return;
    el.style.transform = "translate(" + dx + "px," + dy * 0.35 + "px) rotate(" + dx * 0.055 + "deg)";
    labelKnow.style.opacity = dx > 0 ? Math.min(dx / 80, 1) : 0;
    labelAgain.style.opacity = dx < 0 ? Math.min(-dx / 80, 1) : 0;
  });

  const finish = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x;
    const wasTap = !drag.moved && Date.now() - drag.t < 450;
    drag = null;

    if (wasTap) {
      const t = e.target;
      if (t.closest(".card-fav")) { toggleFav(w); return; }
      if (t.closest(".speak-inline")) { speak(w.word); return; }
      flipTop();
      return;
    }
    const threshold = Math.min(100, el.offsetWidth * 0.3);
    if (dx > threshold) return answer(true, el, w);
    if (dx < -threshold) return answer(false, el, w);
    // geri yerine otur
    el.classList.add("snap-back");
    el.style.transform = "";
    labelKnow.style.opacity = 0;
    labelAgain.style.opacity = 0;
  };

  el.addEventListener("pointerup", finish);
  el.addEventListener("pointercancel", (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    drag = null;
    el.classList.add("snap-back");
    el.style.transform = "";
    labelKnow.style.opacity = 0;
    labelAgain.style.opacity = 0;
  });
}

function flipTop() {
  const el = topCard();
  if (!el) return;
  el.classList.toggle("flipped");
  if (el.classList.contains("flipped") && store.settings.autoSpeak) {
    const w = session.queue[parseInt(el.dataset.qidx, 10)];
    speak(w.word);
  }
}

/* ── Cevap + SRS ── */

function applySrs(w, known) {
  const p = wp(w.word);
  p.seen++;
  if (known) {
    p.right++;
    p.box = Math.min(MAX_BOX, p.box + 1);
    p.due = now() + BOX_INTERVALS[p.box] * DAY_MS;
  } else {
    p.wrong++;
    p.box = 1;
    p.due = now(); // hemen tekrar edilebilir
  }
  const t = today();
  t.studied++;
  if (known) t.known++;
  save();
}

function answer(known, el, w) {
  if (animating || !session.active) return;
  el = el || topCard();
  if (!el) return;
  w = w || session.queue[parseInt(el.dataset.qidx, 10)];
  animating = true;

  applySrs(w, known);
  if (known) session.known++;
  else { session.again++; session.againList.push(w); }

  // kartı uçur
  el.classList.remove("snap-back");
  const flyX = (known ? 1 : -1) * (el.offsetWidth * 1.6 + 100);
  el.style.transition = "transform .38s cubic-bezier(.3,.7,.5,1), opacity .38s";
  el.style.transform = "translate(" + flyX + "px,-30px) rotate(" + (known ? 26 : -26) + "deg)";
  el.style.opacity = "0";
  el.querySelector(known ? ".label-know" : ".label-again").style.opacity = "1";

  setTimeout(() => {
    el.remove();
    session.idx++;
    updateStudyHeader();
    if (session.idx >= session.queue.length) endSession();
    else advanceStack();
    animating = false;
  }, 380);
}

function toggleFav(w) {
  const p = wp(w.word);
  p.fav = !p.fav;
  save();
  syncFavButton();
  const el = topCard();
  if (el) {
    const btn = el.querySelector(".card-fav");
    if (btn) btn.classList.toggle("on", p.fav);
  }
  toast(p.fav ? "Favorilere eklendi" : "Favorilerden çıkarıldı");
}

function syncFavButton() {
  const el = topCard();
  if (!el || !session.queue.length) return;
  const w = session.queue[parseInt(el.dataset.qidx, 10)];
  if (!w) return;
  const on = wp(w.word).fav;
  $("ctl-fav").classList.toggle("on", on);
}

/* ── Oturum sonu ── */

function endSession() {
  session.active = false;
  const total = session.known + session.again;
  const acc = total ? Math.round((session.known / total) * 100) : 0;
  $("end-known").textContent = session.known;
  $("end-again").textContent = session.again;
  $("end-acc").textContent = "%" + acc;
  $("end-emoji").textContent = acc >= 90 ? "🏆" : acc >= 70 ? "🎉" : acc >= 50 ? "💪" : "📚";
  $("end-title").textContent = acc >= 90 ? "Muhteşem!" : acc >= 70 ? "Çok İyi!" : acc >= 50 ? "İyi Gidiyorsun!" : "Devam Et, Öğreniyorsun!";
  $("end-retry").classList.toggle("hidden", session.againList.length === 0);
  $("study-end").classList.remove("hidden");
  if (acc >= 80 && total >= 5) confettiBurst();
}

$("end-retry").addEventListener("click", () => {
  startSession({ list: shuffle(session.againList), name: "Tekrar Turu" });
});
$("end-new").addEventListener("click", () => {
  $("study").classList.add("hidden");
  renderHome();
});
$("end-home").addEventListener("click", () => {
  $("study").classList.add("hidden");
  document.querySelector('.tab[data-screen="screen-home"]').click();
});

/* ── Çalışma kontrolleri ── */

$("study-close").addEventListener("click", () => {
  session.active = false;
  $("study").classList.add("hidden");
  renderHome();
});
$("study-shuffle").addEventListener("click", () => {
  const rest = shuffle(session.queue.slice(session.idx));
  session.queue = session.queue.slice(0, session.idx).concat(rest);
  renderStack(true);
  toast("Kalan kartlar karıştırıldı");
});
$("ctl-know").addEventListener("click", () => answer(true));
$("ctl-again").addEventListener("click", () => answer(false));
$("ctl-flip").addEventListener("click", flipTop);
$("ctl-speak").addEventListener("click", () => {
  const el = topCard();
  if (!el) return;
  speak(session.queue[parseInt(el.dataset.qidx, 10)].word);
});
$("ctl-fav").addEventListener("click", () => {
  const el = topCard();
  if (!el) return;
  toggleFav(session.queue[parseInt(el.dataset.qidx, 10)]);
});

document.addEventListener("keydown", (e) => {
  if ($("study").classList.contains("hidden")) return;
  if (!session.active) return;
  if (e.code === "Space") { e.preventDefault(); flipTop(); }
  else if (e.code === "ArrowRight") answer(true);
  else if (e.code === "ArrowLeft") answer(false);
  else if (e.code === "KeyS") $("ctl-speak").click();
  else if (e.code === "KeyF") $("ctl-fav").click();
  else if (e.code === "Escape") $("study-close").click();
});

/* ─────────── Kelimeler (Gözat) ─────────── */

function fillDeckSelects() {
  for (const selId of ["browse-deck", "quiz-deck"]) {
    const sel = $(selId);
    for (const d of DECKS) {
      const o = document.createElement("option");
      o.value = d.id;
      o.textContent = d.name;
      sel.appendChild(o);
    }
  }
}

function renderBrowse() {
  const q = $("browse-search").value.trim().toLowerCase();
  const deck = $("browse-deck").value;
  const list = $("browse-list");
  list.innerHTML = "";

  let words = WORDS;
  if (deck !== "all") words = words.filter((w) => w.deckId === deck);
  if (q) words = words.filter((w) =>
    w.word.toLowerCase().includes(q) ||
    (w.tr || "").toLowerCase().includes(q) ||
    (w.def || "").toLowerCase().includes(q)
  );

  if (!words.length) {
    list.innerHTML = '<div class="empty-state"><span class="es-ico">' + icon("i-search") + '</span>Sonuç bulunamadı.</div>';
    return;
  }

  const frag = document.createDocumentFragment();
  for (const w of words) {
    const p = wp(w.word);
    const row = document.createElement("div");
    row.className = "word-row";
    const boxCls = p.box >= 4 ? " learned" : p.box > 0 ? " progress" : "";
    const boxIco = p.box >= 4 ? "i-check" : p.box > 0 ? "i-layers" : "i-sparkles";
    row.innerHTML =
      '<button class="word-row-head">' +
        '<span class="w-box' + boxCls + '">' + icon(boxIco) + "</span>" +
        '<span class="w-main">' +
          '<span class="w-word">' + escapeHtml(w.word) + "<small>" + escapeHtml(POS_TR[w.pos] || w.pos) + " • " + escapeHtml(w.level || "") + "</small></span>" +
          '<span class="w-tr">' + escapeHtml(w.tr) + "</span>" +
        "</span>" +
        '<span class="w-arrow">' + icon("i-chevron") + "</span>" +
      "</button>" +
      '<div class="word-row-body">' +
        '<div class="back-def">' + escapeHtml(w.def || "") + "</div>" +
        (w.examples || []).map((en, i) =>
          '<div class="example"><p class="en">' + highlightWord(en, w.word) + '</p><p class="tr">' + escapeHtml((w.exampleTr || [])[i] || "") + "</p></div>"
        ).join("") +
        '<div class="back-syns">' + (w.synonyms || []).map((s) => '<span class="syn-chip">' + escapeHtml(s) + "</span>").join("") + "</div>" +
        '<div class="word-actions">' +
          '<button class="wa-speak">' + icon("i-volume") + "Dinle</button>" +
          '<button class="wa-fav' + (p.fav ? " on" : "") + '">' + icon("i-star") + (p.fav ? "Favoride" : "Favori") + "</button>" +
        "</div>" +
      "</div>";
    row.querySelector(".word-row-head").addEventListener("click", () => row.classList.toggle("open"));
    row.querySelector(".wa-speak").addEventListener("click", () => speak(w.word));
    row.querySelector(".wa-fav").addEventListener("click", (e) => {
      const pp = wp(w.word);
      pp.fav = !pp.fav;
      save();
      const btn = e.currentTarget;
      btn.classList.toggle("on", pp.fav);
      btn.innerHTML = icon("i-star") + (pp.fav ? "Favoride" : "Favori");
    });
    frag.appendChild(row);
  }
  list.appendChild(frag);
}

$("browse-search").addEventListener("input", renderBrowse);
$("browse-deck").addEventListener("change", renderBrowse);

/* ─────────── Test (Quiz) ─────────── */

const quiz = { qs: [], idx: 0, right: 0, wrong: 0, wrongItems: [], mode: "en-tr", count: 10, locked: false };

document.querySelectorAll("#quiz-mode button").forEach((b) => {
  b.addEventListener("click", () => {
    document.querySelectorAll("#quiz-mode button").forEach((x) => x.classList.remove("seg-active"));
    b.classList.add("seg-active");
    quiz.mode = b.dataset.mode;
  });
});
document.querySelectorAll("#quiz-count button").forEach((b) => {
  b.addEventListener("click", () => {
    document.querySelectorAll("#quiz-count button").forEach((x) => x.classList.remove("seg-active"));
    b.classList.add("seg-active");
    quiz.count = parseInt(b.dataset.count, 10);
  });
});

function buildQuiz() {
  const deck = $("quiz-deck").value;
  let pool = deck === "all" ? WORDS.slice() : WORDS.filter((w) => w.deckId === deck);
  if (pool.length < 4) return null;
  pool = shuffle(pool);
  const qs = [];
  const n = Math.min(quiz.count, pool.length);
  for (let i = 0; i < n; i++) {
    const w = pool[i];
    const isEnTr = quiz.mode === "en-tr";
    const correct = isEnTr ? w.tr : w.word;
    const distractorPool = shuffle(pool.filter((x) => x !== w));
    const opts = [correct];
    for (const d of distractorPool) {
      const val = isEnTr ? d.tr : d.word;
      if (!opts.includes(val)) opts.push(val);
      if (opts.length === 4) break;
    }
    qs.push({ w, prompt: isEnTr ? w.word : w.tr, correct, options: shuffle(opts) });
  }
  return qs;
}

$("quiz-start").addEventListener("click", () => {
  const qs = buildQuiz();
  if (!qs) return toast("Bu destede test için yeterli kelime yok.");
  quiz.qs = qs;
  quiz.idx = 0;
  quiz.right = 0;
  quiz.wrong = 0;
  quiz.wrongItems = [];
  $("quiz-setup").classList.add("hidden");
  $("quiz-result").classList.add("hidden");
  $("quiz-active").classList.remove("hidden");
  renderQuizQuestion();
});

function renderQuizQuestion() {
  const q = quiz.qs[quiz.idx];
  quiz.locked = false;
  $("quiz-qnum").textContent = (quiz.idx + 1) + " / " + quiz.qs.length;
  $("quiz-score").textContent = quiz.right + " doğru · " + quiz.wrong + " yanlış";
  $("quiz-progress-fill").style.width = (quiz.idx / quiz.qs.length) * 100 + "%";
  $("quiz-prompt-label").textContent = quiz.mode === "en-tr" ? "Bu kelimenin anlamı nedir?" : "Bu anlamın İngilizcesi hangisi?";
  $("quiz-word").textContent = q.prompt;
  $("quiz-speak").style.display = quiz.mode === "en-tr" ? "" : "none";

  const box = $("quiz-options");
  box.innerHTML = "";
  for (const opt of q.options) {
    const b = document.createElement("button");
    b.className = "quiz-opt";
    b.textContent = opt;
    b.addEventListener("click", () => answerQuiz(b, opt, q));
    box.appendChild(b);
  }
}

function answerQuiz(btn, opt, q) {
  if (quiz.locked) return;
  quiz.locked = true;
  const correct = opt === q.correct;
  const p = wp(q.w.word);
  p.seen++;
  document.querySelectorAll(".quiz-opt").forEach((b) => {
    b.disabled = true;
    if (b.textContent === q.correct) b.classList.add("correct");
  });
  if (correct) {
    quiz.right++;
    p.right++;
  } else {
    btn.classList.add("wrong");
    quiz.wrong++;
    p.wrong++;
    quiz.wrongItems.push(q);
  }
  today().quiz++;
  save();

  setTimeout(() => {
    quiz.idx++;
    if (quiz.idx >= quiz.qs.length) showQuizResult();
    else renderQuizQuestion();
  }, correct ? 750 : 1400);
}

function showQuizResult() {
  const total = quiz.qs.length;
  const pct = Math.round((quiz.right / total) * 100);
  $("quiz-active").classList.add("hidden");
  $("quiz-result").classList.remove("hidden");
  $("quiz-result-emoji").textContent = pct >= 90 ? "🏆" : pct >= 70 ? "🎉" : pct >= 50 ? "💪" : "📚";
  $("quiz-result-title").textContent = pct >= 90 ? "Muhteşem!" : pct >= 70 ? "Çok İyi!" : pct >= 50 ? "Fena Değil!" : "Biraz Daha Çalışalım!";
  $("quiz-result-sub").textContent = total + " soruda " + quiz.right + " doğru";
  $("quiz-result-score").textContent = "%" + pct;
  const wl = $("quiz-wrong-list");
  wl.innerHTML = quiz.wrongItems.map((q) =>
    '<div class="wrong-item"><b>' + escapeHtml(q.w.word) + "</b> <span>= " + escapeHtml(q.w.tr) + "</span></div>"
  ).join("");
  if (pct >= 80) confettiBurst();
}

$("quiz-again").addEventListener("click", () => {
  $("quiz-result").classList.add("hidden");
  $("quiz-setup").classList.remove("hidden");
});
$("quiz-speak").addEventListener("click", () => {
  const q = quiz.qs[quiz.idx];
  if (q) speak(q.w.word);
});

/* ─────────── İstatistik ─────────── */

const BOX_META = [
  { label: "Yeni", color: "#8b93b1" },
  { label: "Kutu 1", color: "#ee6480" },
  { label: "Kutu 2", color: "#dfb257" },
  { label: "Kutu 3", color: "#5e8bff" },
  { label: "Kutu 4", color: "#8b95ff" },
  { label: "Kutu 5", color: "#3ecf9e" },
];
const DAY_NAMES = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"];

function renderStats() {
  $("st-total").textContent = WORDS.length;
  $("st-learned").textContent = WORDS.filter(isLearned).length;
  $("st-streak").textContent = streakDays();
  const t = today();
  $("st-today").textContent = t.studied + t.quiz;

  // Leitner kutuları
  const counts = [0, 0, 0, 0, 0, 0];
  for (const w of WORDS) counts[Math.min(wp(w.word).box, 5)]++;
  const max = Math.max(1, ...counts);
  $("box-bars").innerHTML = counts.map((c, i) =>
    '<div class="box-bar-row">' +
      '<span class="bb-label">' + BOX_META[i].label + "</span>" +
      '<span class="bb-track"><span class="bb-fill" style="width:' + Math.round((c / max) * 100) + "%;background:" + BOX_META[i].color + '"></span></span>' +
      '<span class="bb-count">' + c + "</span>" +
    "</div>"
  ).join("");

  // Son 7 gün
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const key = todayKey(-i);
    const d = store.days[key] || { studied: 0, quiz: 0 };
    const date = new Date(Date.now() - i * DAY_MS);
    days.push({ label: DAY_NAMES[date.getDay()], val: d.studied + d.quiz, isToday: i === 0 });
  }
  const wmax = Math.max(1, ...days.map((d) => d.val));
  $("week-bars").innerHTML = days.map((d) =>
    '<div class="week-col' + (d.isToday ? " today" : "") + '">' +
      '<span class="wk-val">' + (d.val || "") + "</span>" +
      '<span class="wk-bar" style="height:' + Math.max(4, (d.val / wmax) * 78) + 'px"></span>' +
      '<span class="wk-day">' + d.label + "</span>" +
    "</div>"
  ).join("");

  // Deste ilerlemesi
  $("deck-progress").innerHTML = DECKS.map((d) => {
    const words = WORDS.filter((w) => w.deckId === d.id);
    const learned = words.filter(isLearned).length;
    const pct = words.length ? Math.round((learned / words.length) * 100) : 0;
    return '<div class="deck-prog-row">' +
      '<span class="dp-ico">' + deckIcon(d.id) + "</span>" +
      '<span class="dp-name">' + escapeHtml(d.name) + "</span>" +
      '<span class="dp-track"><span class="dp-fill" style="width:' + pct + '%"></span></span>' +
      '<span class="dp-pct">%' + pct + "</span>" +
    "</div>";
  }).join("");
}

/* ─────────── Ayarlar ─────────── */

function applyTheme() {
  document.documentElement.dataset.theme = store.settings.theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = store.settings.theme === "dark" ? "#0e1016" : "#f6f7fb";
}

function syncSettingsUI() {
  document.querySelectorAll("#set-theme button").forEach((b) =>
    b.classList.toggle("seg-active", b.dataset.theme === store.settings.theme));
  document.querySelectorAll("#set-accent button").forEach((b) =>
    b.classList.toggle("seg-active", b.dataset.accent === store.settings.accent));
  $("set-autospeak").checked = store.settings.autoSpeak;
  $("set-session").value = String(store.settings.sessionSize);
  $("set-goal").value = String(store.settings.dailyGoal);
}

function openSettings() {
  syncSettingsUI();
  $("modal-settings").classList.remove("hidden");
}
$("settings-close").addEventListener("click", () => $("modal-settings").classList.add("hidden"));
$("modal-settings").addEventListener("click", (e) => {
  if (e.target === $("modal-settings")) $("modal-settings").classList.add("hidden");
});

document.querySelectorAll("#set-theme button").forEach((b) => {
  b.addEventListener("click", () => {
    store.settings.theme = b.dataset.theme;
    save();
    applyTheme();
    syncSettingsUI();
  });
});
document.querySelectorAll("#set-accent button").forEach((b) => {
  b.addEventListener("click", () => {
    store.settings.accent = b.dataset.accent;
    save();
    syncSettingsUI();
    speak("hypothesis");
  });
});
$("set-autospeak").addEventListener("change", (e) => { store.settings.autoSpeak = e.target.checked; save(); });
$("set-session").addEventListener("change", (e) => { store.settings.sessionSize = parseInt(e.target.value, 10); save(); });
$("set-goal").addEventListener("change", (e) => { store.settings.dailyGoal = parseInt(e.target.value, 10); save(); renderHome(); });

$("btn-reset").addEventListener("click", () => {
  if (!confirm("Tüm ilerlemen (kutular, istatistikler, favoriler) silinecek. Emin misin?")) return;
  const settings = store.settings;
  const profile = store.profile;
  store = defaultStore();
  store.settings = settings;
  store.profile = profile;
  save();
  $("modal-settings").classList.add("hidden");
  renderHome();
  toast("İlerleme sıfırlandı");
});

/* ─────────── Profil ─────────── */

function initialsOf(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "";
  const first = parts[0][0] || "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toLocaleUpperCase("tr-TR");
}

function avatarHTML() {
  const p = store.profile;
  if (p.photo) return '<img src="' + p.photo + '" alt="" />';
  const ini = initialsOf(p.name);
  if (ini) return "<span>" + escapeHtml(ini) + "</span>";
  return icon("i-user");
}

function renderProfile() {
  const p = store.profile;
  $("avatar-header").innerHTML = avatarHTML();
  $("avatar-edit").innerHTML = avatarHTML() + '<span class="avatar-cam">' + icon("i-camera", "ico-xs") + "</span>";
  $("profile-name").textContent = p.name || "Misafir";
  $("profile-sub").textContent = p.email
    ? p.email
    : (p.name || p.photo ? "Yerel profil — verilerin bu cihazda" : "Fotoğrafa dokunarak resim ekle");
  $("pr-logout").classList.toggle("hidden", !authState.girisli);
  $("pr-delete").classList.toggle("hidden", !authState.girisli);
  $("auth-box").classList.toggle("hidden", authState.girisli || !authState.hazir);
  $("btn-apple").classList.toggle("hidden", !authState.native);
  $("auth-sync").classList.toggle("hidden", !authState.girisli);
  $("auth-sync").textContent = authState.bekliyor ? "Eşitleniyor…" : "İlerlemen hesabına kaydediliyor, her cihazda aynı";
}

$("btn-profile").addEventListener("click", () => {
  renderProfile();
  $("modal-profile").classList.remove("hidden");
});
$("profile-close").addEventListener("click", () => $("modal-profile").classList.add("hidden"));
$("modal-profile").addEventListener("click", (e) => {
  if (e.target === $("modal-profile")) $("modal-profile").classList.add("hidden");
});

/* Fotoğraf seç + küçült (144px, localStorage dostu) */
$("avatar-edit").addEventListener("click", () => $("photo-input").click());
$("photo-input").addEventListener("change", (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  const img = new Image();
  const url = URL.createObjectURL(file);
  img.onload = () => {
    const S = 144;
    const canvas = document.createElement("canvas");
    canvas.width = S; canvas.height = S;
    const ctx = canvas.getContext("2d");
    const m = Math.min(img.width, img.height);
    ctx.drawImage(img, (img.width - m) / 2, (img.height - m) / 2, m, m, 0, 0, S, S);
    URL.revokeObjectURL(url);
    try {
      store.profile.photo = canvas.toDataURL("image/jpeg", 0.85);
      save();
      renderProfile();
      toast("Profil fotoğrafı güncellendi");
    } catch (err) { toast("Fotoğraf kaydedilemedi"); }
  };
  img.onerror = () => { URL.revokeObjectURL(url); toast("Bu dosya bir resim gibi görünmüyor"); };
  img.src = url;
  e.target.value = "";
});

$("name-edit").addEventListener("click", () => {
  const yeni = prompt("Adın:", store.profile.name || "");
  if (yeni === null) return;
  store.profile.name = yeni.trim().slice(0, 40);
  save();
  renderProfile();
});

/* Satırlar */
$("pr-settings").addEventListener("click", () => {
  $("modal-profile").classList.add("hidden");
  openSettings();
});
$("pr-stats").addEventListener("click", () => {
  $("modal-profile").classList.add("hidden");
  document.querySelector('.tab[data-screen="screen-stats"]').click();
});
$("pr-privacy").addEventListener("click", () => window.open("https://sersoz.com/toefl-gizlilik.html", "_blank"));

/* Yedekleme: dışa / içe aktarma */
$("pr-export").addEventListener("click", () => {
  const payload = { app: "toefl-kart", version: 2, exportedAt: new Date().toISOString(), data: store };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "toefl-kart-yedek-" + todayKey() + ".json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast("Yedek dosyası indirildi");
});

$("pr-import").addEventListener("click", () => $("import-input").click());
$("import-input").addEventListener("change", (e) => {
  const file = e.target.files && e.target.files[0];
  e.target.value = "";
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      const data = parsed && parsed.app === "toefl-kart" ? parsed.data : parsed;
      if (!data || typeof data.words !== "object" || typeof data.settings !== "object") {
        return toast("Bu dosya geçerli bir TOEFL Kart yedeği değil");
      }
      if (!confirm("Mevcut ilerlemenin üzerine bu yedek yazılacak. Devam edilsin mi?")) return;
      store = Object.assign(defaultStore(), data);
      store.settings = Object.assign(defaultStore().settings, data.settings || {});
      store.profile = Object.assign(defaultStore().profile, data.profile || {});
      save();
      applyTheme();
      renderProfile();
      renderHome();
      toast("Yedek geri yüklendi ✓");
    } catch (err) { toast("Dosya okunamadı"); }
  };
  reader.readAsText(file, "utf-8");
});

/* Hesap: giriş, çıkış ve eşitleme js/hesap.js içinde (Firebase). Giriş isteğe bağlı;
   girişsiz ilerleme yalnız bu cihazda kalır. hesap.js yüklenemezse (çevrimdışı) düğmeler gizli kalır. */
let authState = { girisli: false, native: false, hazir: false, bekliyor: false };

$("btn-google").addEventListener("click", () => window.TKHesap && window.TKHesap.giris("google"));
$("btn-apple").addEventListener("click", () => window.TKHesap && window.TKHesap.giris("apple"));

$("pr-logout").addEventListener("click", async () => {
  if (!confirm("Hesaptan çıkılsın mı? (Öğrenme ilerlemen bu cihazda da kalır)")) return;
  if (window.TKHesap) await window.TKHesap.cikis();
  toast("Çıkış yapıldı");
});

$("pr-delete").addEventListener("click", () => {
  if (!confirm("Hesabın ve buluta kaydedilmiş ilerlemen kalıcı olarak silinecek. Bu cihazdaki ilerleme kalır. Emin misin?")) return;
  if (window.TKHesap) window.TKHesap.hesabiSil();
});

// js/hesap.js'in kullandığı arayüz
window.TK = {
  get store() { return store; },
  save,
  toast,
  replace(yeni) {
    store = Object.assign(defaultStore(), yeni);
    store.settings = Object.assign(defaultStore().settings, yeni.settings || {});
    store.profile = Object.assign(defaultStore().profile, yeni.profile || {});
    try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch (e) {}
    applyTheme();
    renderProfile();
    renderHome();
  },
  setAuthState(st) {
    authState = Object.assign({}, authState, st, { bekliyor: !!st.bekliyor });
    renderProfile();
  },
};

/* ─────────── Başlatma ─────────── */

applyTheme();
fillDeckSelects();
renderHome();
renderProfile();

if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}
