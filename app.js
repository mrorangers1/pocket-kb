(function () {
  "use strict";

  /* ============================================================
     随身知识库 PWA · 多知识库学习（概念卡 + 精讲 + 碎片刷题）
     数据来自 Obsidian vault 构建产物（app/data/*.json）
     ============================================================ */

  var APP_VERSION = "1.3.1";
  var STORE_KEY = "pocket_kb_v1";

  var FALLBACK_LIBS = [
    { key: "power", name: "电力交易员", short: "电力", color: "#f5a524" },
    { key: "sghc", name: "源网荷储", short: "源网荷储", color: "#34d399" },
    { key: "model", name: "建模与认知", short: "建模", color: "#38c6e0" },
    { key: "soft", name: "工业软件", short: "工业", color: "#a78bfa" }
  ];

  /* ---------------- utils ---------------- */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function ymd(d) {
    var x = d || new Date();
    var m = String(x.getMonth() + 1).padStart(2, "0");
    var day = String(x.getDate()).padStart(2, "0");
    return x.getFullYear() + "-" + m + "-" + day;
  }
  function todayStr() { return ymd(new Date()); }
  function parseDate(s) {
    var p2 = String(s || "").split("-").map(Number);
    if (p2.length !== 3 || p2.some(isNaN)) return new Date();
    return new Date(p2[0], p2[1] - 1, p2[2]);
  }
  function addDays(s, n) { var d = parseDate(s); d.setDate(d.getDate() + Number(n || 0)); return ymd(d); }
  function diffDays(a, b) { return Math.round((parseDate(b) - parseDate(a)) / 86400000); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c];
    });
  }
  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function clamp(n, a, b) { return Math.min(b, Math.max(a, n)); }
  function pct(a, b) { return b ? Math.round((a / b) * 100) : 0; }
  function fmtTime(sec) {
    sec = Math.max(0, Math.floor(sec || 0));
    return String(Math.floor(sec / 60)).padStart(2, "0") + ":" + String(sec % 60).padStart(2, "0");
  }
  function toast(msg) {
    var el = $("#toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { el.classList.remove("show"); }, 2200);
  }

  /* ---------------- state ---------------- */
  function defaultState() {
    return {
      v: 1,
      settings: { theme: "dark", fontSize: 16, dailyNew: 8, dailyReview: 16, commute: true },
      cards: {},
      nodes: {},
      lessons: {},
      log: [],
      daily: { date: todayStr(), answered: 0, correct: 0, seconds: 0 },
      streak: { last: null, days: 0, best: 0 },
      custom: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
  }
  var state = defaultState();
  var DB = { questions: [] };
  var KDB = { libraries: FALLBACK_LIBS, nodes: [] };
  var LDB = { lessons: [] };
  var route = "today";
  var learnLib = "all";
  var learnQuery = "";
  var lessonLib = "all";
  var quizLib = "all";
  var nodeStack = [];
  var nodeCurrent = null;
  var session = null;
  var readerLesson = null;

  function loadState() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (!raw) return defaultState();
      var s = JSON.parse(raw);
      var d = defaultState();
      var out = {};
      for (var k in d) out[k] = d[k];
      for (var k2 in s) out[k2] = s[k2];
      out.settings = {}; for (var a in d.settings) out.settings[a] = d.settings[a];
      for (var b in (s.settings || {})) out.settings[b] = s.settings[b];
      out.daily = {}; for (var c in d.daily) out.daily[c] = d.daily[c];
      for (var e in (s.daily || {})) out.daily[e] = s.daily[e];
      out.streak = {}; for (var f in d.streak) out.streak[f] = d.streak[f];
      for (var g in (s.streak || {})) out.streak[g] = s.streak[g];
      return out;
    } catch (err) { return defaultState(); }
  }
  function saveState() {
    state.updatedAt = Date.now();
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) {}
  }
  function ensureDaily() {
    var t = todayStr();
    if (!state.daily || state.daily.date !== t) {
      state.daily = { date: t, answered: 0, correct: 0, seconds: 0 };
      saveState();
    }
  }
  function touchStreak() {
    var t = todayStr();
    if (state.streak.last === t) return;
    state.streak.days = (state.streak.last && diffDays(state.streak.last, t) === 1) ? state.streak.days + 1 : 1;
    state.streak.last = t;
    state.streak.best = Math.max(state.streak.best || 0, state.streak.days);
  }

  /* ---------------- data ---------------- */
  function libs() { return KDB.libraries && KDB.libraries.length ? KDB.libraries : FALLBACK_LIBS; }
  function libOf(key) {
    var ls = libs();
    for (var i = 0; i < ls.length; i++) if (ls[i].key === key) return ls[i];
    return { key: key, name: key, short: key, color: "#888" };
  }
  function libColor(key) { return libOf(key).color; }
  function libName(key) { return libOf(key).name; }
  function allQuestions() { return DB.questions.concat(state.custom || []); }
  function allNodes() { return KDB.nodes || []; }
  function allLessons() { return LDB.lessons || []; }
  function nodeById(id) {
    var ns = allNodes();
    for (var i = 0; i < ns.length; i++) if (ns[i].id === id) return ns[i];
    return null;
  }
  function lessonById(id) {
    var ls = allLessons();
    for (var i = 0; i < ls.length; i++) if (ls[i].id === id) return ls[i];
    return null;
  }
  function loadJSON(url) {
    return fetch(url, { cache: "no-store" }).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    });
  }
  function renderMath(root) {
    if (!window.renderMathInElement) return;
    try {
      window.renderMathInElement(root, {
        delimiters: [
          { left: "$$", right: "$$", display: true },
          { left: "$", right: "$", display: false }
        ],
        throwOnError: false
      });
    } catch (e) {}
  }


  /* ---------------- quiz normalize ---------------- */
  function letterIndex(x) {
    if (typeof x === "number") return x;
    return "ABCDEF".indexOf(String(x || "").trim().toUpperCase());
  }
  function normalizeQuestion(q) {
    if (!q || !q.id || !q.stem) return null;
    var type = q.type || "choice";
    if (["choice", "multi", "short"].indexOf(type) < 0) type = "choice";
    var options = Array.isArray(q.options) ? q.options.map(String) : [];
    var answer = [];
    var answerText = "";
    if (type === "short") {
      answerText = String(q.answerText || q.answer || "").trim();
    } else {
      if (Array.isArray(q.answer)) {
        answer = q.answer.map(function (x) { return typeof x === "number" ? x : letterIndex(x); })
          .filter(function (i) { return i >= 0 && i < options.length; });
      } else if (typeof q.answer === "number") {
        answer = [q.answer];
      } else if (typeof q.answer === "string") {
        answer = q.answer.split(/[,\s]+/).map(letterIndex).filter(function (i) { return i >= 0 && i < options.length; });
      }
      if (!answer.length && options.length) answer = [0];
    }
    return {
      id: q.id, library: q.library || "power", topic: q.topic || "未分类",
      node: q.node || null, type: type, stem: String(q.stem),
      options: options, answer: answer, answerText: answerText,
      difficulty: Number(q.difficulty) || 2,
      explain: q.explain || "", source: q.source || "", auto: !!q.auto
    };
  }
  function normalizeAll(list) {
    return (list || []).map(normalizeQuestion).filter(Boolean);
  }

  /* ---------------- SRS ---------------- */
  function getCard(id) {
    if (!state.cards[id]) {
      state.cards[id] = { ease: 2.5, interval: 0, reps: 0, lapses: 0, due: null, last: null, seen: 0, correct: 0, wrong: 0, lastOk: null };
    }
    return state.cards[id];
  }
  function isNew(q) { var c = state.cards[q.id]; return !c || !c.seen; }
  function isDue(q) {
    var c = state.cards[q.id];
    return !!(c && c.seen > 0 && c.due && c.due <= todayStr());
  }
  function isWrong(q) {
    var c = state.cards[q.id];
    return !!(c && c.wrong > 0 && c.lastOk !== true);
  }
  function gradeQuestion(q, ok, opts) {
    var o = opts || {};
    var c = getCard(q.id);
    ensureDaily();
    c.seen += 1;
    c.last = todayStr();
    c.lastOk = !!ok;
    if (ok) {
      c.correct += 1;
      c.reps += 1;
      if (c.reps === 1) c.interval = 1;
      else if (c.reps === 2) c.interval = 3;
      else c.interval = Math.max(1, Math.round(c.interval * c.ease));
      if (o.hard) c.interval = Math.max(1, Math.round(c.interval * 0.6));
      if (o.easy) c.interval = Math.max(c.interval + 1, Math.round(c.interval * 1.5));
      c.ease = Math.min(2.8, Number((c.ease + 0.05).toFixed(2)));
      c.due = addDays(todayStr(), c.interval);
    } else {
      c.wrong += 1;
      c.lapses += 1;
      c.reps = 0;
      c.interval = 1;
      c.ease = Math.max(1.3, Number((c.ease - 0.2).toFixed(2)));
      c.due = addDays(todayStr(), 1);
    }
    state.daily.answered += 1;
    if (ok) state.daily.correct += 1;
    touchStreak();
    state.log.push({ id: q.id, ok: !!ok, t: Date.now(), lib: q.library });
    if (state.log.length > 3000) state.log = state.log.slice(-2000);
    saveState();
  }
  function countsFor(pool) {
    var due = 0, fresh = 0, wrong = 0;
    for (var i = 0; i < pool.length; i++) {
      var q = pool[i];
      if (isNew(q)) fresh++;
      else if (isDue(q)) due++;
      if (isWrong(q)) wrong++;
    }
    return { due: due, fresh: fresh, wrong: wrong, total: pool.length };
  }
  function libPool(key) {
    var all = allQuestions();
    if (!key || key === "all") return all;
    return all.filter(function (q) { return q.library === key; });
  }
  function nodeQuestions(nodeId) {
    return allQuestions().filter(function (q) { return q.node === nodeId; });
  }
  function interleave(a, b) {
    var groups = {};
    var order = [];
    a.concat(b).forEach(function (q) {
      if (!groups[q.library]) { groups[q.library] = []; order.push(q.library); }
      groups[q.library].push(q);
    });
    var out = [], more = true;
    while (more) {
      more = false;
      for (var i = 0; i < order.length; i++) {
        if (groups[order[i]].length) { out.push(groups[order[i]].shift()); more = true; }
      }
    }
    return out;
  }
  function buildQueue(opts) {
    var o = opts || {};
    var pool = libPool(o.library);
    if (o.nodeId) pool = nodeQuestions(o.nodeId);
    var due = [], fresh = [];
    pool.forEach(function (q) {
      if (isNew(q)) fresh.push(q);
      else if (isDue(q)) due.push(q);
    });
    shuffle(due); shuffle(fresh);
    var qs;
    if (o.mode === "due") qs = due;
    else if (o.mode === "wrong") qs = shuffle(pool.filter(isWrong));
    else if (o.mode === "random") qs = shuffle(pool);
    else if (o.mode === "fresh") qs = interleave(due, fresh);
    else if (o.mode === "daily") qs = interleave(due.slice(0, state.settings.dailyReview), fresh.slice(0, state.settings.dailyNew));
    else qs = interleave(due, fresh);
    if (o.limit) qs = qs.slice(0, o.limit);
    return qs;
  }

  /* ---------------- node progress ---------------- */
  function nodeStatus(id) {
    var n = state.nodes[id];
    return n && (n.status === 1 || n.status === 2) ? n.status : 0;
  }
  function setNodeStatus(id, status) {
    state.nodes[id] = { status: status, updated: Date.now() };
    saveState();
  }
  function libNodeStats(key) {
    var ns = allNodes().filter(function (n) { return !key || n.library === key; });
    var s0 = 0, s1 = 0, s2 = 0;
    ns.forEach(function (n) {
      var s = nodeStatus(n.id);
      if (s === 2) s2++; else if (s === 1) s1++; else s0++;
    });
    return { total: ns.length, newCount: s0, learning: s1, mastered: s2 };
  }

  /* ================= render: TODAY ================= */
  function vToday() {
    ensureDaily();
    var pool = libPool("all");
    var c = countsFor(pool);
    var nodeStats = libNodeStats("all");
    var target = state.settings.dailyNew + state.settings.dailyReview;
    var done = state.daily.answered;
    var ringOff = 195.6 * (1 - clamp(done / Math.max(1, target), 0, 1));
    var lessonsTodo = allLessons().filter(function (l) { return !(state.lessons[l.id] && state.lessons[l.id].done); });
    var lastL = null;
    var ls = state.lessons;
    for (var k in ls) { if (ls[k].pos && !ls[k].done) { var L = lessonById(k); if (L) { lastL = L; break; } } }
    var greet = greeting();
    var html = "";
    html += "<div class=\"hero\">";
    html += "  <h1>" + greet + "</h1>";
    html += "  <p>" + todayStr() + " · 连续 " + (state.streak.days || 0) + " 天 · 待复习 " + c.due + " 题 · 新概念 " + c.fresh + " 题</p>";
    html += "  <svg class=\"ring\" viewBox=\"0 0 80 80\">";
    html += "    <circle class=\"bgc\" cx=\"40\" cy=\"40\" r=\"31\"></circle>";
    html += "    <circle class=\"fgc\" cx=\"40\" cy=\"40\" r=\"31\" style=\"stroke-dashoffset:" + ringOff.toFixed(1) + "\"></circle>";
    html += "    <text x=\"40\" y=\"45\">" + Math.min(done, 99) + "</text>";
    html += "  </svg>";
    html += "</div>";

    html += "<div class=\"qrow\">";
    html += qbtn("flash5", "⚡", "5 分钟速刷", c.due + c.fresh > 0 ? "约 12 题 · 通勤神器" : "今日无待刷");
    html += qbtn("flash10", "⏳", "10 分钟沉浸", "约 25 题 · 加深印象");
    html += "</div>";
    html += "<div class=\"qrow\">";
    if (lastL) {
      html += qbtn("resumeLsn|" + lastL.id, "▶", "继续精讲", esc(lastL.title));
    } else if (lessonsTodo.length) {
      html += qbtn("openLsn|" + lessonsTodo[0].id, "▶", "今日精讲", esc(lessonsTodo[0].title) + " · " + lessonsTodo[0].minutes + " 分钟");
    } else {
      html += qbtn("gotoLsn", "✓", "精讲已全部读完", "去复习一遍");
    }
    html += qbtn("dailyQuiz", "🎯", "每日刷题", "复习 " + Math.min(c.due, state.settings.dailyReview) + " + 新 " + Math.min(c.fresh, state.settings.dailyNew));
    html += "</div>";

    html += todayPath(c);
    html += "<h2 class=\"sec\">知识库覆盖</h2>";
    html += "<div class=\"stat3\">";
    html += miniStat(nodeStats.total, "概念卡") + miniStat(nodeStats.mastered, "已掌握") + miniStat(allQuestions().length, "题目");
    html += "</div>";

    html += "<h2 class=\"sec\">各库进度</h2>";
    libs().forEach(function (lib) {
      var st = libNodeStats(lib.key);
      var qc = countsFor(libPool(lib.key));
      var p2 = st.total ? Math.round(((st.learning + st.mastered) / st.total) * 100) : 0;
      html += "<div class=\"card\" style=\"padding:12px 14px\">";
      html += "  <div style=\"display:flex;align-items:center;gap:8px\">";
      html += "    <span class=\"dot\" style=\"background:" + lib.color + "\"></span>";
      html += "    <b style=\"flex:1\">" + esc(lib.name) + "</b>";
      html += "    <small style=\"color:var(--sub)\">待刷 " + (qc.due + qc.fresh) + " · 错题 " + qc.wrong + "</small>";
      html += "  </div>";
      html += "  <div style=\"height:5px;background:var(--card2);border-radius:3px;margin-top:9px\"><i style=\"display:block;height:100%;width:" + p2 + "%;background:" + lib.color + ";border-radius:3px\"></i></div>";
      html += "  <small style=\"color:var(--sub2)\">概念 " + (st.learning + st.mastered) + "/" + st.total + " 已学习</small>";
      html += "</div>";
    });
    return html;
  }
  function greeting() {
    var h = new Date().getHours();
    if (h < 6) return "夜深了";
    if (h < 9) return "早上好";
    if (h < 12) return "上午好";
    if (h < 14) return "中午好";
    if (h < 18) return "下午好";
    return "晚上好";
  }
  function qbtn(action, ico, title, sub) {
    return "<button class=\"qbtn\" data-action=\"" + action + "\"><span class=\"ico\">" + ico + "</span><b>" + esc(title) + "</b><span>" + esc(sub) + "</span></button>";
  }
  function miniStat(n, label) {
    return "<div class=\"card\"><b>" + n + "</b><span>" + label + "</span></div>";
  }
  function todayPath(c) {
    var wrongN = c.wrong;
    var nextL = null, bestP = -1;
    allLessons().forEach(function (l) {
      var p = state.lessons[l.id] || {};
      if (p.done) return;
      var prog = (p.pos || 0) / Math.max(1, l.blocks.length);
      if (p.pos && prog > bestP) { bestP = prog; nextL = l; }
      if (!p.pos && !nextL) nextL = l;
    });
    var steps = [
      { ico: "📚", title: "复习到期题 " + Math.min(c.due, state.settings.dailyReview) + " 道", sub: "间隔重复，趁遗忘曲线还没掉完", done: c.due === 0, act: "dailyQuiz" },
      { ico: "✨", title: "认识 " + Math.min(c.fresh, state.settings.dailyNew) + " 个新概念", sub: "自评题 · 5 分钟速刷", done: c.fresh === 0, act: "flash5" },
      { ico: "▶", title: nextL ? "读精讲《" + nextL.title + "》" : "精讲全部读完", sub: nextL ? nextL.minutes + " 分钟 · 通勤推荐" : "复习任意一课", done: !nextL, act: nextL ? "openLsn|" + nextL.id : "gotoLsn" },
      { ico: "🔥", title: "消灭错题 " + wrongN + " 道", sub: "错题不过夜", done: wrongN === 0, act: "m-wrong" }
    ];
    var firstTodo = steps.findIndex(function (s) { return !s.done; });
    var html = "<h2 class=\"sec\">今日建议路径</h2>";
    html += "<div class=\"card\" style=\"padding:6px 14px\">";
    steps.forEach(function (s, i) {
      var hot = (i === firstTodo);
      html += "<div class=\"pathstep" + (s.done ? " done" : "") + (hot ? " hot" : "") + "\" data-action=\"" + s.act + "\">";
      html += "<span class=\"pi\">" + (s.done ? "✓" : (i + 1)) + "</span>";
      html += "<div style=\"flex:1;min-width:0\"><b>" + esc(s.title) + "</b><small>" + esc(s.sub) + "</small></div>";
      html += (hot && !s.done) ? "<span class=\"go\">开始 ›</span>" : "";
      html += "</div>";
    });
    html += "</div>";
    return html;
  }

  /* ================= render: LEARN ================= */
  function vLearn() {
    var html = "<h2 class=\"sec\">概念卡</h2>";
    html += "<input class=\"search\" id=\"learnQ\" placeholder=\"搜索概念（如：容量电价 / 注意力 / TDengine）\" value=\"" + esc(learnQuery) + "\">";
    html += "<div class=\"chips\">";
    html += chip("all", "全部", learnLib);
    libs().forEach(function (lib) { html += chip(lib.key, lib.name, learnLib, lib.color); });
    html += "</div>";
    var nodes = allNodes().filter(function (n) {
      if (learnLib !== "all" && n.library !== learnLib) return false;
      if (learnQuery) {
        var q = learnQuery.toLowerCase();
        var hay = (n.title + " " + (n.summary || "") + " " + (n.tags || []).join(" ")).toLowerCase();
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    });
    if (!nodes.length) {
      html += "<div class=\"empty\">没有匹配的概念卡<br><small>换个关键词，或先跑一次 ./build.sh 生成数据</small></div>";
      return html;
    }
    var byFolder = {};
    var folders = [];
    nodes.forEach(function (n) {
      var f = n.library + "/" + (n.folder || "其他");
      if (!byFolder[f]) { byFolder[f] = []; folders.push(f); }
      byFolder[f].push(n);
    });
    folders.forEach(function (f) {
      var parts = f.split("/");
      html += "<div class=\"folder-h\">" + esc(libName(parts[0]) + " · " + parts[1]) + "（" + byFolder[f].length + "）</div>";
      byFolder[f].forEach(function (n) {
        var st = nodeStatus(n.id);
        html += "<div class=\"node s" + st + "\" data-action=\"open-node\" data-id=\"" + n.id + "\">";
        html += "  <span class=\"st\">" + (st === 2 ? "✓" : st === 1 ? "…" : "") + "</span>";
        html += "  <div style=\"flex:1;min-width:0\"><b>" + esc(n.title) + "</b>";
        if (n.summary) html += "<p>" + esc(n.summary) + "</p>";
        html += "<div class=\"meta\"><span class=\"tag\" style=\"color:" + libColor(n.library) + "\">" + esc(libName(n.library)) + "</span>";
        if (n.words) html += "<span class=\"tag\">" + n.words + " 字</span>";
        if (n.hasMath) html += "<span class=\"tag\">∑ 公式</span>";
        html += "</div></div></div>";
      });
    });
    return html;
  }
  function chip(key, label, cur, color) {
    var c = color ? "<span class=\"dot\" style=\"background:" + color + "\"></span>" : "";
    return "<button class=\"chip" + (cur === key ? " on" : "") + "\" data-action=\"chip\" data-k=\"" + key + "\">" + c + esc(label) + "</button>";
  }

  /* node sheet */
  function openNode(id) {
    var n = nodeById(id);
    if (!n) return;
    nodeCurrent = id;
    var st = nodeStatus(id);
    var html = "<div class=\"sheet\"><div class=\"grab\"></div>";
    html += "<div class=\"sheet-hd\">";
    if (nodeStack.length) html += "<button class=\"backbtn\" data-action=\"node-back\">‹</button>";
    html += "<b>" + esc(n.title) + "</b><button class=\"close-x\" data-action=\"close-sheet\">✕</button></div>";
    html += "<div class=\"sheet-bd\">";
    html += "<div style=\"margin-bottom:10px\"><span class=\"tag\" style=\"color:" + libColor(n.library) + "\">" + esc(libName(n.library)) + "</span> ";
    if (n.folder) html += "<span class=\"tag\">" + esc(n.folder) + "</span> ";
    if (n.updated) html += "<span class=\"tag\">更新 " + esc(n.updated) + "</span>";
    html += "</div>";
    if (n.summary) html += "<div class=\"summary\">" + esc(n.summary) + "</div>";
    if (n.links && n.links.length) {
      html += "<div class=\"linkchips\">";
      n.links.forEach(function (lk) {
        html += "<button class=\"wlbtn\" data-action=\"open-node\" data-id=\"" + lk.id + "\">" + esc(lk.t) + "</button>";
      });
      html += "</div>";
    }
    if (n.plain) { html += "<div class=\"sec-h\">大白话</div><p>" + esc(n.plain) + "</p>"; }
    if (n.formal) { html += "<div class=\"sec-h\">名词解释</div>" + n.formal; }
    if (n.formulas) { html += "<div class=\"sec-h\">公式</div>" + n.formulas; }
    if (n.analogy) { html += "<div class=\"sec-h\">类比 / 图</div>" + n.analogy; }
    (n.sections || []).forEach(function (s) {
      if (s.html) html += (s.h ? "<div class=\"sec-h\">" + esc(s.h) + "</div>" : "") + s.html;
    });
    if (n.pitfalls && n.pitfalls.length) {
      html += "<div class=\"sec-h\">常见误区</div>";
      n.pitfalls.forEach(function (pit) { html += "<div class=\"pitfall\">" + esc(pit) + "</div>"; });
    }
    var qs = nodeQuestions(id);
    html += "<div class=\"node-actions\">";
    html += "<button class=\"btn\" data-action=\"node-status\" data-id=\"" + id + "\" data-s=\"1\">" + (st === 1 ? "✓ 学习中" : "标为学习中") + "</button>";
    html += "<button class=\"btn primary\" data-action=\"node-status\" data-id=\"" + id + "\" data-s=\"2\">" + (st === 2 ? "✓ 已掌握" : "标为已掌握") + "</button>";
    html += "</div>";
    if (qs.length) {
      html += "<button class=\"btn block\" style=\"margin-top:10px\" data-action=\"node-quiz\" data-id=\"" + id + "\">练一练（" + qs.length + " 道自评题）</button>";
    }
    html += "</div></div>";
    openSheet(html);
    renderMath($("#sheet .sheet-bd"));
  }

  /* ================= render: LESSONS list ================= */
  function vLessons() {
    var html = "<h2 class=\"sec\">精讲 · 通勤路上读</h2>";
    html += "<div class=\"chips\">";
    html += chip("all", "全部", lessonLib);
    libs().forEach(function (lib) { html += chip("l" + lib.key, lib.name, lessonLib, lib.color); });
    html += "</div>";
    var lsns = allLessons().filter(function (l) {
      return lessonLib === "all" || lessonLib === "l" + l.library;
    });
    if (!lsns.length) {
      html += "<div class=\"empty\">该分类下还没有精讲课<br><small>在 content/lessons/ 加一个 .md 再构建就有了</small></div>";
      return html;
    }
    lsns.forEach(function (l) {
      var prog = state.lessons[l.id] || {};
      var doneBlocks = prog.pos || 0;
      var total = l.blocks.length;
      var p2 = prog.done ? 100 : (total ? Math.round((doneBlocks / total) * 100) : 0);
      var lib = libOf(l.library);
      html += "<div class=\"lesson\" data-action=\"open-lesson\" data-id=\"" + l.id + "\">";
      html += "  <div class=\"cover\" style=\"background:linear-gradient(135deg,hsl(" + l.hue + " 62% 30%),hsl(" + (l.hue + 40) + " 55% 18%))\">";
      html += "    <span class=\"mins\">⏱ " + l.minutes + " 分钟</span>";
      html += "    <b>" + esc(l.title) + "</b><span>" + esc(l.subtitle) + "</span>";
      html += "  </div>";
      html += "  <div class=\"prog\"><i style=\"width:" + p2 + "%\"></i></div>";
      html += "  <div class=\"body\"><small><span class=\"dot\" style=\"background:" + lib.color + "\"></span>" + esc(lib.name) + " · " + total + " 节" + (prog.done ? " · 已读完 ✓" : doneBlocks ? " · 读到 " + doneBlocks + "/" + total : "") + "</small><small style=\"color:var(--acc)\">" + (prog.done ? "复习" : "开始") + " →</small></div>";
      html += "</div>";
    });
    html += "<div class=\"about\" style=\"padding:6px 4px\">精讲为构建期打包：图片、动图全部本地内联，<b>无网络也能看</b>。</div>";
    return html;
  }

  /* ================= render: QUIZ ================= */
  function vQuiz() {
    var c = countsFor(libPool("all"));
    var html = "<h2 class=\"sec\">刷题 · 5–10 分钟加深印象</h2>";
    html += "<div class=\"card\" style=\"text-align:center;padding:16px\">";
    html += "  <div style=\"font-size:13px;color:var(--sub)\">题库总量 <b style=\"color:var(--txt)\">" + c.total + "</b> · 待复习 <b style=\"color:var(--gold)\">" + c.due + "</b> · 未练 <b style=\"color:var(--blue)\">" + c.fresh + "</b> · 错题 <b style=\"color:var(--red)\">" + c.wrong + "</b></div>";
    html += "</div>";
    html += "<div class=\"chips\" id=\"quizLibChips\">";
    html += chip("all", "全部", quizLib);
    libs().forEach(function (lib) { html += chip(lib.key, lib.name, quizLib, lib.color); });
    html += "</div>";
    html += "<div class=\"qrow\">";
    html += qbtn("m-daily", "🎯", "每日刷题", "到期复习 + 新题");
    html += qbtn("m-wrong", "🔥", "只刷错题", c.wrong + " 道待消灭");
    html += "</div>";
    html += "<div class=\"qrow\">";
    html += qbtn("m-flash5", "⚡", "5 分钟速刷", "定时 5 分钟 · 约 12 题");
    html += qbtn("m-flash10", "⏳", "10 分钟沉浸", "定时 10 分钟 · 约 25 题");
    html += "</div>";
    html += "<div class=\"qrow\">";
    html += qbtn("m-random", "🎲", "随机 20 题", "不限新旧混刷");
    html += qbtn("m-due", "📚", "清到期", "把所有到期复习清掉");
    html += "</div>";
    html += "<div class=\"about\" style=\"padding:8px 4px\">简答自评题：看答案后诚实点「记住了/没记住」，间隔重复会自动安排下次见面时间。</div>";
    return html;
  }


  /* ---------------- charts (pure SVG, offline) ---------------- */
  function last7Days() {
    var out = [];
    for (var i = 6; i >= 0; i--) {
      var d = new Date();
      d.setDate(d.getDate() - i);
      out.push(ymd(d));
    }
    return out;
  }
  function chart7() {
    var days = last7Days();
    var agg = {};
    days.forEach(function (d) { agg[d] = { n: 0, ok: 0 }; });
    (state.log || []).forEach(function (e) {
      var d = ymd(new Date(e.t));
      if (agg[d]) { agg[d].n++; if (e.ok) agg[d].ok++; }
    });
    var maxN = 1;
    days.forEach(function (d) { maxN = Math.max(maxN, agg[d].n); });
    var w = 316, h = 96, bw = 26, gap = (w - bw * 7) / 6;
    var svg = "<svg viewBox=\"0 0 " + w + " " + h + "\" style=\"width:100%;display:block\">";
    days.forEach(function (d, i) {
      var a = agg[d];
      var bh = Math.round((a.n / maxN) * 52) || 0;
      var acc = a.n ? Math.round((a.ok / a.n) * 100) : 0;
      var x = Math.round(i * (bw + gap));
      var y = 70 - bh;
      var fill = a.n ? (acc >= 70 ? "#34d399" : acc >= 45 ? "#f5a524" : "#f87171") : "#223052";
      svg += "<rect x=\"" + x + "\" y=\"" + y + "\" width=\"" + bw + "\" height=\"" + bh + "\" rx=\"5\" fill=\"" + fill + "\">"
      svg += "<title>" + d + " 答 " + a.n + " 题 · 正确率 " + acc + "%</title></rect>";
      svg += "<text x=\"" + (x + bw / 2) + "\" y=\"84\" font-size=\"8.5\" fill=\"#66779a\" text-anchor=\"middle\">" + d.slice(5).replace("-", "/") + "</text>";
      if (a.n) svg += "<text x=\"" + (x + bw / 2) + "\" y=\"" + (y - 4) + "\" font-size=\"9\" font-weight=\"700\" fill=\"#8fa1c0\" text-anchor=\"middle\">" + acc + "%</text>";
    });
    svg += "</svg>";
    return svg;
  }
  function libBars() {
    var w = 316;
    var rows = libs().map(function (lib) {
      var st = libNodeStats(lib.key);
      var pool = libPool(lib.key);
      var seen = 0, ok = 0;
      pool.forEach(function (q) {
        var c = state.cards[q.id];
        if (c && c.seen) { seen += c.seen; ok += c.correct; }
      });
      var acc = seen ? Math.round((ok / seen) * 100) : 0;
      var pct = st.total ? Math.round(((st.learning + st.mastered) / st.total) * 100) : 0;
      return { lib: lib, st: st, acc: acc, pct: pct };
    });
    var svg = "<svg viewBox=\"0 0 " + w + " " + (rows.length * 40 + 6) + "\" style=\"width:100%;display:block\">";
    rows.forEach(function (r, i) {
      var y = i * 40;
      svg += "<text x=\"0\" y=\"" + (y + 11) + "\" font-size=\"10.5\" font-weight=\"600\" fill=\"#e8eefb\">" + esc(r.lib.name) + "</text>";
      svg += "<rect x=\"0\" y=\"" + (y + 17) + "\" width=\"" + w + "\" height=\"10\" rx=\"5\" fill=\"#131f38\" stroke=\"#223052\"></rect>";
      svg += "<rect x=\"0\" y=\"" + (y + 17) + "\" width=\"" + Math.round(w * r.pct / 100) + "\" height=\"10\" rx=\"5\" fill=\"" + r.lib.color + "\"></rect>";
      svg += "<text x=\"" + w + "\" y=\"" + (y + 11) + "\" font-size=\"9.5\" fill=\"#8fa1c0\" text-anchor=\"end\">概念 " + (r.st.learning + r.st.mastered) + "/" + r.st.total + " · 答题正确率 " + r.acc + "%</text>";
      svg += "<text x=\"" + w + "\" y=\"" + (y + 34) + "\" font-size=\"8.5\" fill=\"#66779a\" text-anchor=\"end\">已掌握 " + r.st.mastered + " · 学习中 " + r.st.learning + "</text>";
    });
    svg += "</svg>";
    return svg;
  }
  /* ================= render: ME ================= */
  function vMe() {
    var pool = libPool("all");
    var totalSeen = 0, totalOk = 0, wrongCount = 0;
    pool.forEach(function (q) {
      var c = state.cards[q.id];
      if (c && c.seen) { totalSeen += c.seen; totalOk += c.correct; }
      if (isWrong(q)) wrongCount++;
    });
    var acc = totalSeen ? Math.round((totalOk / totalSeen) * 100) : 0;
    var html = "";
    html += "<div class=\"me-hd\"><div class=\"ava\">库</div><b>我的学习</b><p>连续 " + (state.streak.days || 0) + " 天 · 最长 " + (state.streak.best || 0) + " 天 · 今日已答 " + state.daily.answered + " 题</p></div>";
    html += "<div class=\"stat3\" style=\"margin:12px 0\">";
    html += miniStat(acc + "%", "正确率") + miniStat(totalSeen, "累计作答") + miniStat(wrongCount, "在案错题");
    html += "</div>";

    html += "<div class=\"card\"><b>近 7 天正确率</b><div style=\"margin-top:8px\">" + chart7() + "</div><small style=\"color:var(--sub2)\">柱高=当天答题量 · 顶部数字=正确率（绿≥70% 黄≥45% 红<45%）</small></div>";
    html += "<div class=\"card\"><b>各库掌握度</b><div style=\"margin-top:8px\">" + libBars() + "</div><small style=\"color:var(--sub2)\">彩条=已学概念占比 · 右侧=答题正确率</small></div>";

    html += "<div class=\"card\"><b>设置</b>";
    html += setrow("每日新题", "每天新引入的题量", stepper("set-dailyNew", state.settings.dailyNew));
    html += setrow("每日复习上限", "到期复习题量上限", stepper("set-dailyReview", state.settings.dailyReview));
    html += setrow("字体大小", "概念卡与精讲正文", "<input type=\"range\" min=\"14\" max=\"22\" value=\"" + state.settings.fontSize + "\" data-action=\"set-font\">");
    html += setrow("深色模式", "护眼 · 通勤推荐", "<div class=\"switch" + (state.settings.theme === "dark" ? " on" : "") + "\" data-action=\"toggle-theme\"><i></i></div>");
    html += "</div>";

    html += "<div class=\"card\"><b>数据</b>";
    html += setrow("导出进度", "JSON 备份到文件", "<button class=\"btn sm\" data-action=\"export\">导出</button>");
    html += setrow("导入进度", "从备份文件恢复", "<button class=\"btn sm\" data-action=\"import\">导入</button><input type=\"file\" id=\"importFile\" accept=\".json\" style=\"display:none\">");
    html += setrow("重置", "清空本机学习记录（不动题库）", "<button class=\"btn sm\" data-action=\"reset\" style=\"color:var(--red)\">重置</button>");
    html += "</div>";

    html += "<div class=\"card about\"><b>关于</b><br>";
    html += "随身知识库 v" + APP_VERSION + " · 数据构建自 Obsidian vault<br>";
    html += "概念卡 " + allNodes().length + " 张 · 精讲 " + allLessons().length + " 课 · 题目 " + allQuestions().length + " 道（含自动生成）<br>";
    html += "离线能力：首次打开后全部内容缓存到本机，飞行模式可用。<br>";
    html += "存储键 <code>" + STORE_KEY + "</code>（与考研刷题 App 互不干扰）";
    html += "</div>";
    return html;
  }
  function setrow(title, sub, ctrl) {
    return "<div class=\"setrow\"><div class=\"l\"><b>" + esc(title) + "</b><small>" + esc(sub) + "</small></div><div>" + ctrl + "</div></div>";
  }
  function stepper(action, val) {
    return "<div class=\"stepper\"><button data-action=\"" + action + "\" data-d=\"-1\">−</button><b>" + val + "</b><button data-action=\"" + action + "\" data-d=\"1\">＋</button></div>";
  }

  /* ================= sheets ================= */
  function openSheet(inner) {
    var sw = $("#sheet");
    sw.innerHTML = inner;
    sw.hidden = false;
  }
  function closeSheet() {
    var sw = $("#sheet");
    sw.hidden = true;
    sw.innerHTML = "";
    nodeStack = [];
    nodeCurrent = null;
  }

  /* ================= PRACTICE session ================= */
  function startSession(opts) {
    var o = opts || {};
    var lib = o.library || (route === "quiz" ? quizLib : "all");
    var qs = buildQueue({ mode: o.mode || "fresh", library: lib, nodeId: o.nodeId, limit: o.limit });
    if (!qs.length) {
      toast(o.mode === "wrong" ? "没有待消灭的错题 🎉" : "这个范围暂时没有题～");
      return;
    }
    session = {
      qs: qs, idx: 0, mode: o.mode || "fresh",
      sel: [], revealed: false, correct: 0, wrongIds: [],
      secondsLeft: o.seconds || 0, timerId: null, nodeId: o.nodeId || null
    };
    var el = $("#practice");
    el.hidden = false;
    document.body.style.overflow = "hidden";
    renderQuestion();
    if (session.secondsLeft > 0) {
      session.timerId = setInterval(function () {
        session.secondsLeft -= 1;
        var t = $("#pTimer");
        if (t) {
          t.textContent = fmtTime(session.secondsLeft);
          t.classList.toggle("low", session.secondsLeft <= 60);
        }
        if (session.secondsLeft <= 0) {
          clearInterval(session.timerId);
          toast("时间到！");
          finishSession();
        }
      }, 1000);
    }
  }
  function closePractice() {
    if (session && session.timerId) clearInterval(session.timerId);
    session = null;
    $("#practice").hidden = true;
    $("#practice").innerHTML = "";
    document.body.style.overflow = "";
    render();
  }
  function renderQuestion() {
    var s = session;
    if (!s) return;
    if (s.idx >= s.qs.length) { finishSession(); return; }
    var q = s.qs[s.idx];
    s.sel = [];
    s.revealed = false;
    var el = $("#practice");
    var html = "";
    html += "<div class=\"p-hd\">";
    html += "  <button class=\"icon-btn\" data-action=\"p-quit\">✕</button>";
    html += "  <div class=\"meta\"><b>第 " + (s.idx + 1) + " / " + s.qs.length + " 题</b><div>" + esc(libName(q.library)) + " · " + esc(q.topic) + (q.auto ? " · 自评" : "") + "</div></div>";
    html += s.secondsLeft > 0 ? "<span class=\"timer\" id=\"pTimer\">" + fmtTime(s.secondsLeft) + "</span>" : "";
    html += "</div>";
    html += "<div class=\"p-prog\"><i style=\"width:" + Math.round((s.idx / s.qs.length) * 100) + "%\"></i></div>";
    html += "<div class=\"p-bd\" id=\"pBd\">";
    html += "  <div class=\"q-lib\">" + (q.type === "multi" ? "多选题" : q.type === "short" ? "简答自评" : "单选题") + " · 难度 " + "★".repeat(q.difficulty) + "</div>";
    html += "  <div class=\"q-stem\">" + esc(q.stem) + "</div>";
    if (q.type === "short") {
    html += "  <textarea class=\"q-input\" id=\"shortInput\" placeholder=\"先用自己的话写，再点「看答案」对照…\"></textarea>";
    } else {
      for (var i = 0; i < q.options.length; i++) {
        html += "  <div class=\"opt\" data-action=\"p-select\" data-i=\"" + i + "\"><span class=\"k\">" + "ABCDEF"[i] + "</span><span style=\"flex:1\">" + esc(q.options[i]) + "</span></div>";
      }
    }
    html += "  <div id=\"pResult\"></div>";
    html += "</div>";
    html += "<div class=\"p-ft\" id=\"pFt\">";
    if (q.type === "short") {
      html += "<button class=\"btn\" data-action=\"p-reveal-short\">看答案</button>";
      html += "<button class=\"btn primary\" data-action=\"p-next\" disabled style=\"opacity:.4\">下一题</button>";
    } else {
      html += "<button class=\"btn primary block\" data-action=\"p-submit\">提交</button>";
    }
    html += "</div>";
    el.innerHTML = html;
    renderMath(el);
  }
  function pSelect(i) {
    var s = session;
    if (!s || s.revealed) return;
    var q = s.qs[s.idx];
    var opts = $$("#practice .opt");
    if (q.type === "choice") {
      s.sel = [i];
      opts.forEach(function (o, j) { o.classList.toggle("sel", j === i); });
    } else {
      var at = s.sel.indexOf(i);
      if (at >= 0) s.sel.splice(at, 1); else s.sel.push(i);
      opts.forEach(function (o, j) { o.classList.toggle("sel", s.sel.indexOf(j) >= 0); });
    }
  }
  function pSubmit() {
    var s = session;
    if (!s || s.revealed) return;
    var q = s.qs[s.idx];
    if (!s.sel.length) { toast("先选一个选项"); return; }
    var ok = s.sel.length === q.answer.length && s.sel.every(function (i) { return q.answer.indexOf(i) >= 0; });
    s.revealed = true;
    if (ok) s.correct++; else s.wrongIds.push(q.id);
    gradeQuestion(q, ok);
    paintResult(q, ok, s.sel);
  }
  function pRevealShort() {
    var s = session;
    if (!s || s.revealed) return;
    s.revealed = true;
    var q = s.qs[s.idx];
    var r = $("#pResult");
    r.innerHTML = "<div class=\"explain\"><b>参考答案</b><br>" + esc(q.answerText).replace(/\n/g, "<br>") + (q.explain ? "<br><span style=\"color:var(--sub)\">" + esc(q.explain) + "</span>" : "") + "</div>" +
      "<div style=\"display:flex;gap:10px;margin-top:12px\">" +
      "<button class=\"btn\" data-action=\"p-grade-short\" data-ok=\"0\">没记住</button>" +
      "<button class=\"btn primary\" style=\"flex:1\" data-action=\"p-grade-short\" data-ok=\"1\">记住了</button></div>";
    renderMath(r);
  }
  function pGradeShort(okStr) {
    var s = session;
    if (!s || !s.revealed) return;
    var ok = okStr === "1";
    var q = s.qs[s.idx];
    if (!ok) s.wrongIds.push(q.id); else s.correct++;
    gradeQuestion(q, ok, { hard: !ok });
    toast(ok ? "好记性！下次更久以后再考你" : "已加入错题，明天见");
    pNext();
  }
  function paintResult(q, ok, sel) {
    var opts = $$("#practice .opt");
    opts.forEach(function (o, j) {
      o.classList.add("lock");
      if (q.answer.indexOf(j) >= 0) o.classList.add("ok");
      else if (sel.indexOf(j) >= 0) o.classList.add("bad");
    });
    var r = $("#pResult");
    r.innerHTML = "<div class=\"verdict " + (ok ? "ok" : "bad") + "\">" + (ok ? "✓ 回答正确" : "✗ 回答错误") + "</div>" +
      (q.explain ? "<div class=\"explain\">" + esc(q.explain) + "</div>" : "") +
      (q.source ? "<div style=\"margin-top:8px;font-size:12px;color:var(--sub2)\">来源：" + esc(q.source) + "</div>" : "");
    $("#pFt").innerHTML = "<button class=\"btn primary block\" data-action=\"p-next\">" + (session.idx + 1 >= session.qs.length ? "完成" : "下一题") + "</button>";
    renderMath(r);
  }
  function pNext() {
    var s = session;
    if (!s) return;
    s.idx += 1;
    if (s.idx >= s.qs.length) finishSession();
    else renderQuestion();
  }
  function finishSession() {
    var s = session;
    if (!s) return;
    if (s.timerId) clearInterval(s.timerId);
    var el = $("#practice");
    var total = s.qs.length;
    var answered = Math.min(s.idx + (s.revealed ? 1 : 0), total);
    var acc = answered ? Math.round((s.correct / answered) * 100) : 0;
    var html = "";
    html += "<div class=\"p-hd\"><button class=\"icon-btn\" data-action=\"p-quit\">✕</button><div class=\"meta\"><b>本组完成</b></div></div>";
    html += "<div class=\"p-bd\">";
    html += "<div style=\"text-align:center;margin:18px 0 6px;font-size:40px\">" + (acc >= 80 ? "🏆" : acc >= 60 ? "💪" : "🌱") + "</div>";
    html += "<div style=\"text-align:center\"><b style=\"font-size:19px\">正确率 " + acc + "%</b></div>";
    html += "<div class=\"res-grid\">";
    html += "<div class=\"card\"><b>" + answered + "</b><span>已答</span></div>";
    html += "<div class=\"card\"><b style=\"color:var(--green)\">" + s.correct + "</b><span>答对</span></div>";
    html += "<div class=\"card\"><b style=\"color:var(--red)\">" + s.wrongIds.length + "</b><span>答错</span></div>";
    html += "</div>";
    if (s.wrongIds.length) {
      html += "<h2 class=\"sec\">本次错题 · 点卡片重练</h2>";
      s.wrongIds.forEach(function (id) {
        var q = null;
        for (var i = 0; i < s.qs.length; i++) if (s.qs[i].id === id) q = s.qs[i];
        if (!q) return;
        html += "<div class=\"wrong-item\" data-action=\"p-review-one\" data-id=\"" + q.id + "\"><span style=\"flex:1\">" + esc(q.stem.slice(0, 46)) + (q.stem.length > 46 ? "…" : "") + "</span><span>" + esc(q.topic) + "</span></div>";
      });
    } else {
      html += "<div class=\"empty\">零错题，完美！</div>";
    }
    html += "</div>";
    html += "<div class=\"p-ft\"><button class=\"btn\" data-action=\"p-quit\">返回</button><button class=\"btn primary\" data-action=\"p-again\" style=\"flex:1\">再来一组</button></div>";
    el.innerHTML = html;
  }
  function pAgain() {
    var mode = session ? session.mode : "random";
    var nodeId = session ? session.nodeId : null;
    var limit = session ? (session.qs.length > 20 ? 25 : 12) : 0;
    closePractice();
    startSession({ mode: mode === "daily" ? "fresh" : mode, nodeId: nodeId, limit: mode === "flash5" ? 12 : mode === "flash10" ? 25 : limit });
  }

  /* ================= READER ================= */
  function openLesson(id) {
    var l = lessonById(id);
    if (!l) return;
    readerLesson = l;
    var prog = state.lessons[l.id] || { pos: 0 };
    var el = $("#reader");
    var html = "";
    html += "<div class=\"p-hd\">";
    html += "  <button class=\"icon-btn\" data-action=\"r-close\">‹</button>";
    html += "  <div class=\"meta\"><b>" + esc(l.title) + "</b><div>" + esc(l.subtitle) + " · " + l.minutes + " 分钟</div></div>";
    html += "  <button class=\"btn sm\" data-action=\"r-done\">" + (prog.done ? "已读完 ✓" : "标记读完") + "</button>";
    html += "</div>";
    html += "<div class=\"p-bd reader\"><div class=\"lesson-bd\">";
    if (l.intro) html += "<p style=\"color:var(--sub)\">" + l.intro + "</p>";
    l.blocks.forEach(function (b, i) {
      if (b.type === "html") {
        html += b.html;
      } else if (b.type === "figure" || b.type === "anim") {
        html += "<div class=\"figbox\" data-bi=\"" + i + "\">";
        html += "  <div class=\"figbar\"><small>" + (b.type === "anim" ? "▶ 动图 · 点图重播" : "插图") + " · " + esc(b.name) + "</small>" +
                 (b.type === "anim" ? "<button class=\"btn sm ghost\" data-action=\"r-replay\">重播</button>" : "") + "</div>";
        html += b.svg;
        html += "</div>";
      } else if (b.type === "quiz") {
        html += lessonQuizCard(b.question, i);
      }
    });
    html += "<div style=\"margin:26px 0\"><button class=\"btn primary block\" data-action=\"r-done\">读完本课 ✓</button></div>";
    html += "</div></div>";
    el.innerHTML = html;
    el.hidden = false;
    document.body.style.overflow = "hidden";
    renderMath(el);
    // 恢复进度：滚动到上次读到的块
    var target = Math.min(prog.pos || 0, Math.max(0, l.blocks.length - 1));
    if (target > 0) {
      var boxes = $$("#reader .figbox[data-bi], #reader .quiz-card");
      if (boxes[target - 1]) {
        setTimeout(function () { boxes[target - 1].scrollIntoView({ block: "start" }); }, 60);
      }
    }
    // 滚动记录进度
    var bd = $("#reader .p-bd");
    bd.addEventListener("scroll", function () {
      var boxes2 = $$("#reader .figbox[data-bi], #reader .quiz-card");
      var pos = 0;
      for (var i = 0; i < boxes2.length; i++) {
        if (boxes2[i].getBoundingClientRect().top < window.innerHeight * 0.5) pos = i + 1;
      }
      state.lessons[l.id] = state.lessons[l.id] || {};
      if ((state.lessons[l.id].pos || 0) < pos) {
        state.lessons[l.id].pos = pos;
        saveState();
      }
    }, { passive: true });
  }
  function closeReader() {
    readerLesson = null;
    $("#reader").hidden = true;
    $("#reader").innerHTML = "";
    document.body.style.overflow = "";
    render();
  }
  function lessonQuizCard(q, bi) {
    var c = state.cards[q.id] || {};
    var doneCls = c.seen ? (c.lastOk ? " done-ok" : " done-bad") : "";
    var html = "<div class=\"quiz-card" + doneCls + "\" data-qid=\"" + q.id + "\" data-bi=\"" + bi + "\">";
    html += "<div class=\"qc-h\">课中思考 · " + (q.type === "multi" ? "多选" : "单选") + "</div>";
    html += "<div class=\"q-stem\" style=\"font-size:16px\">" + esc(q.stem) + "</div>";
    for (var i = 0; i < q.options.length; i++) {
      html += "<div class=\"opt\" data-action=\"lq-select\" data-i=\"" + i + "\"><span class=\"k\">" + "ABCDEF"[i] + "</span><span style=\"flex:1\">" + esc(q.options[i]) + "</span></div>";
    }
    html += "<div class=\"lq-result\"></div>";
    html += "<button class=\"btn primary block\" style=\"margin-top:10px\" data-action=\"lq-submit\">提交</button>";
    html += "</div>";
    return html;
  }
  var lqSel = [];
  function lqSelect(card, i) {
    var q = findQ(card.getAttribute("data-qid"));
    if (!q || card.getAttribute("data-done")) return;
    if (q.type === "choice") {
      lqSel = [i];
      $$(".opt", card).forEach(function (o, j) { o.classList.toggle("sel", j === i); });
    } else {
      var at = lqSel.indexOf(i);
      if (at >= 0) lqSel.splice(at, 1); else lqSel.push(i);
      $$(".opt", card).forEach(function (o, j) { o.classList.toggle("sel", lqSel.indexOf(j) >= 0); });
    }
  }
  function lqSubmit(card) {
    var q = findQ(card.getAttribute("data-qid"));
    if (!q || card.getAttribute("data-done")) return;
    if (!lqSel.length) { toast("先选一个选项"); return; }
    var ok = lqSel.length === q.answer.length && lqSel.every(function (i) { return q.answer.indexOf(i) >= 0; });
    card.setAttribute("data-done", "1");
    gradeQuestion(q, ok);
    $$(".opt", card).forEach(function (o, j) {
      o.classList.add("lock");
      if (q.answer.indexOf(j) >= 0) o.classList.add("ok");
      else if (lqSel.indexOf(j) >= 0) o.classList.add("bad");
    });
    card.querySelector(".lq-result").innerHTML =
      "<div class=\"verdict " + (ok ? "ok" : "bad") + "\">" + (ok ? "✓ 答对了" : "✗ 再看一眼解析") + "</div>" +
      (q.explain ? "<div class=\"explain\">" + esc(q.explain) + "</div>" : "");
    card.classList.add(ok ? "done-ok" : "done-bad");
    var btn = card.querySelector("[data-action=\"lq-submit\"]");
    if (btn) btn.style.display = "none";
    renderMath(card);
  }
  function findQ(id) {
    var all = allQuestions();
    for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i];
    return null;
  }
  function replayAnim(btn) {
    var box = btn.closest(".figbox");
    if (!box) return;
    var svg = box.querySelector("svg");
    if (!svg) return;
    var clone = svg.cloneNode(true);
    svg.parentNode.replaceChild(clone, svg);
  }

  /* ================= export / import ================= */
  function exportData() {
    var blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "pocket-kb-backup-" + todayStr() + ".json";
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 3000);
    toast("已导出学习进度");
  }
  function importData(file) {
    var rd = new FileReader();
    rd.onload = function () {
      try {
        var s = JSON.parse(rd.result);
        if (!s || typeof s !== "object") throw new Error("bad");
        localStorage.setItem(STORE_KEY, JSON.stringify(s));
        state = loadState();
        applyTheme();
        render();
        toast("导入成功");
      } catch (e) { toast("导入失败：文件格式不对"); }
    };
    rd.readAsText(file);
  }

  /* ================= theme / render / router ================= */
  function applyTheme() {
    document.documentElement.setAttribute("data-theme", state.settings.theme || "dark");
    document.documentElement.style.setProperty("--fs", (state.settings.fontSize || 16) + "px");
  }
  function render() {
    applyTheme();
    ensureDaily();
    var v = $("#view");
    var html = "";
    if (route === "today") html = vToday();
    else if (route === "learn") html = vLearn();
    else if (route === "lessons") html = vLessons();
    else if (route === "quiz") html = vQuiz();
    else if (route === "me") html = vMe();
    v.innerHTML = html;
    renderMath(v);
    var pill = $("#streakPill");
    if (pill) pill.textContent = (state.streak.days || 0) + " 天连击";
    $$(".tab").forEach(function (t) { t.classList.toggle("active", t.getAttribute("data-route") === route); });
    window.scrollTo(0, 0);
  }

  /* ================= global events ================= */
  document.addEventListener("click", function (e) {
    var t = e.target.closest("[data-action]");
    if (!t) {
      if (e.target.id === "sheet") closeSheet();
      return;
    }
    var act = t.getAttribute("data-action");
    var id = t.getAttribute("data-id");

    if (act === "toggle-theme") {
      state.settings.theme = state.settings.theme === "dark" ? "light" : "dark";
      saveState(); applyTheme(); render();
    } else if (act === "chip") {
      var k = t.getAttribute("data-k");
      if (route === "learn") learnLib = k;
      else if (route === "lessons") lessonLib = k;
      else if (route === "quiz") quizLib = k;
      render();
    } else if (act === "open-node") {
      if (t.classList && t.classList.contains("wlbtn")) {
        if (nodeCurrent && nodeCurrent !== id) nodeStack.push(nodeCurrent);
        openNode(id);
      } else {
        nodeStack = [];
        openNode(id);
      }
    }
    else if (act === "node-back") {
      var prevNode = nodeStack.pop();
      if (prevNode) openNode(prevNode); else closeSheet();
    }
    else if (act === "close-sheet") { closeSheet(); }
    else if (act === "node-status") {
      setNodeStatus(id, Number(t.getAttribute("data-s")));
      closeSheet(); openNode(id);
    }
    else if (act === "node-quiz") { closeSheet(); startSession({ mode: "fresh", nodeId: id }); }
    else if (act === "open-lesson") { openLesson(id); }
    else if (act === "resumeLsn") { openLesson(id); }
    else if (act === "openLsn") { openLesson(id); }

    else if (act === "gotoLsn") { route = "lessons"; render(); }
    else if (act === "flash5") { startSession({ mode: "random", seconds: 300, limit: 12 }); }
    else if (act === "flash10") { startSession({ mode: "random", seconds: 600, limit: 25 }); }
    else if (act === "dailyQuiz") { startSession({ mode: "daily" }); }
    else if (act === "m-daily") { startSession({ mode: "daily" }); }
    else if (act === "m-wrong") { startSession({ mode: "wrong" }); }
    else if (act === "m-flash5") { startSession({ mode: "random", seconds: 300, limit: 12 }); }
    else if (act === "m-flash10") { startSession({ mode: "random", seconds: 600, limit: 25 }); }
    else if (act === "m-random") { startSession({ mode: "random", limit: 20 }); }
    else if (act === "m-due") { startSession({ mode: "due" }); }
    else if (act === "p-select") { pSelect(Number(t.getAttribute("data-i"))); }
    else if (act === "p-submit") { pSubmit(); }
    else if (act === "p-reveal-short") { pRevealShort(); }
    else if (act === "p-grade-short") { pGradeShort(t.getAttribute("data-ok")); }
    else if (act === "p-next") { pNext(); }
    else if (act === "p-again") { pAgain(); }
    else if (act === "p-quit") { closePractice(); }
    else if (act === "p-review-one") {
      var q1 = findQ(id);
      if (q1 && session) {
        session.qs = [q1];
        session.idx = 0;
        session.revealed = false;
        session.wrongIds = [];
        session.correct = 0;
        renderQuestion();
      }
    }
    else if (act === "r-close") { closeReader(); }
    else if (act === "r-done") {
      if (readerLesson) {
        state.lessons[readerLesson.id] = state.lessons[readerLesson.id] || {};
        state.lessons[readerLesson.id].done = true;
        state.lessons[readerLesson.id].pos = readerLesson.blocks.length;
        saveState();
        toast("已记录读完 🎉");
        closeReader();
      }
    }
    else if (act === "r-replay") { replayAnim(t); }
    else if (act === "lq-select") { lqSelect(t.closest(".quiz-card"), Number(t.getAttribute("data-i"))); }
    else if (act === "lq-submit") { lqSubmit(t.closest(".quiz-card")); }
    else if (act === "set-dailyNew") {
      state.settings.dailyNew = clamp(state.settings.dailyNew + Number(t.getAttribute("data-d")), 2, 30);
      saveState(); render();
    }
    else if (act === "set-dailyReview") {
      state.settings.dailyReview = clamp(state.settings.dailyReview + Number(t.getAttribute("data-d")), 5, 60);
      saveState(); render();
    }
    else if (act === "export") { exportData(); }
    else if (act === "import") { var fi = $("#importFile"); if (fi) fi.click(); }
    else if (act === "reset") {
      if (confirm("确定清空本机全部学习记录？题库不会受影响。")) {
        localStorage.removeItem(STORE_KEY);
        state = defaultState();
        saveState(); applyTheme(); render();
        toast("已重置");
      }
    }
  });

  document.addEventListener("input", function (e) {
    if (e.target.id === "learnQ") {
      learnQuery = e.target.value.trim();
      var pos = e.target.selectionStart;
      render();
      var nq = $("#learnQ");
      if (nq) { nq.focus(); nq.setSelectionRange(pos, pos); }
    } else if (e.target.getAttribute && e.target.getAttribute("data-action") === "set-font") {
      state.settings.fontSize = Number(e.target.value);
      saveState(); applyTheme();
    }
  });

  document.addEventListener("change", function (e) {
    if (e.target.id === "importFile" && e.target.files && e.target.files[0]) {
      importData(e.target.files[0]);
    }
  });

  $$(".tab").forEach(function (t) {
    t.addEventListener("click", function () {
      route = t.getAttribute("data-route");
      render();
    });
  });

  /* ---------------- SW update prompt ---------------- */
  var updateBarShown = false;
  function showUpdateBar() {
    if (updateBarShown || document.querySelector(".updatebar")) return;
    updateBarShown = true;
    var bar = document.createElement("div");
    bar.className = "updatebar";
    bar.innerHTML = "<span>📦 新版本已就绪</span><button class=\"btn sm primary\" id=\"updBtn\">刷新更新</button>";
    document.body.appendChild(bar);
    document.getElementById("updBtn").addEventListener("click", function () {
      navigator.serviceWorker.getRegistrations().then(function (rs) {
        rs.forEach(function (r) { if (r.waiting) r.waiting.postMessage({ type: "SKIP_WAITING" }); });
      });
      setTimeout(function () { location.reload(); }, 400);
    });
  }
  function watchSWUpdate() {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.getRegistration().then(function (reg) {
      if (reg && reg.waiting) showUpdateBar();
      if (!reg) return;
      reg.addEventListener("updatefound", function () {
        var nw = reg.installing;
        if (!nw) return;
        nw.addEventListener("statechange", function () {
          if (nw.state === "installed" && navigator.serviceWorker.controller) showUpdateBar();
        });
      });
    });
    setInterval(function () {
      navigator.serviceWorker.getRegistration().then(function (reg) {
        if (reg) reg.update().catch(function () {});
      });
    }, 30 * 60 * 1000);
  }

  /* ================= boot ================= */
  function boot() {
    state = loadState();
    applyTheme();
    Promise.all([
      loadJSON("data/nodes.json").catch(function () { return { libraries: FALLBACK_LIBS, nodes: [] }; }),
      loadJSON("data/questions.json").catch(function () { return { questions: [] }; }),
      loadJSON("data/lessons.json").catch(function () { return { lessons: [] }; })
    ]).then(function (rs) {
      KDB = rs[0];
      KDB.nodes = KDB.nodes || [];
      KDB.libraries = KDB.libraries && KDB.libraries.length ? KDB.libraries : FALLBACK_LIBS;
      DB.questions = normalizeAll(rs[1].questions || []);
      LDB = rs[2];
      render();
    });
    if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "127.0.0.1" || location.hostname === "localhost")) {
      navigator.serviceWorker.register("./sw.js").then(function () { setTimeout(watchSWUpdate, 1500); }).catch(function () {});
    }
  }
  window.__pkbShowUpdate = showUpdateBar;
  boot();

})();
