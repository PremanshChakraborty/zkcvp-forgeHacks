/**
 * A self-contained HTML view of two eval runs, written next to comparison.md
 * by `npm run eval -- --compare=v2,v3`.
 *
 * One file, no network: the results and the fixtures are embedded as JSON and
 * rendered by inline script, so it opens from disk and records cleanly for a
 * demo. It shows only what the runs already stored — nothing here calls a model.
 */
import type { EvalCase } from "./cases";
import type { RunFile } from "./run";

/** JSON that is safe inside a <script> element. */
function embed(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export function renderDashboard(before: RunFile, after: RunFile, cases: EvalCase[]): string {
  const data = {
    before,
    after,
    cases: cases.map((c) => ({
      id: c.id,
      category: c.category,
      requirements: c.requirements,
      repos: c.repos.map((r) => ({ repo: r.repo, files: r.files, changed: r.changed ?? [] })),
    })),
  };
  return PAGE.replace("__DATA__", embed(data));
}

const PAGE = /* html */ `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Evaluator Eval Results</title>
<style>
:root {
  --bg: #f6f7f9; --panel: #ffffff; --ink: #14171c; --muted: #5d6573; --line: #e2e5ea;
  --ok: #1f9d55; --ok-bg: #e5f6ec; --fa: #d63b3b; --fa-bg: #fde8e8; --fr: #c98a00; --fr-bg: #fdf3d9;
  --err: #8a93a3; --accent: #3b5bdb; --accent-bg: #e8edff; --before: #8a93a3; --after: #3b5bdb;
  --mono: ui-monospace, "Cascadia Code", "SF Mono", Menlo, Consolas, monospace;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg: #0f1216; --panel: #171b21; --ink: #e8ebf0; --muted: #98a1b0; --line: #2a3039;
    --ok: #3ccf7a; --ok-bg: #133222; --fa: #ff6b6b; --fa-bg: #3a1a1c; --fr: #f2b632; --fr-bg: #3a2e12;
    --err: #6b7380; --accent: #7c95ff; --accent-bg: #1d2546; --before: #6b7380; --after: #7c95ff;
  }
}
:root[data-theme="dark"] {
  --bg: #0f1216; --panel: #171b21; --ink: #e8ebf0; --muted: #98a1b0; --line: #2a3039;
  --ok: #3ccf7a; --ok-bg: #133222; --fa: #ff6b6b; --fa-bg: #3a1a1c; --fr: #f2b632; --fr-bg: #3a2e12;
  --err: #6b7380; --accent: #7c95ff; --accent-bg: #1d2546; --before: #6b7380; --after: #7c95ff;
}
* { box-sizing: border-box; }
html, body { margin: 0; }
body { background: var(--bg); color: var(--ink); font: 15px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
.wrap { max-width: 1240px; margin: 0 auto; padding: 32px 16px 64px; }
h1 { font-size: 28px; margin: 0 0 4px; letter-spacing: -0.01em; }
h2 { font-size: 18px; margin: 40px 0 12px; }
.sub { color: var(--muted); }
.mono { font-family: var(--mono); font-size: 13px; }
.panel { background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 16px; }
.caveat { margin-top: 16px; padding: 10px 14px; border-left: 3px solid var(--fr); background: var(--fr-bg); border-radius: 6px; font-size: 14px; }
.theme { float: right; background: none; border: 1px solid var(--line); color: var(--muted); border-radius: 8px; padding: 4px 10px; cursor: pointer; font: inherit; font-size: 13px; }

/* headline */
.hero { display: grid; grid-template-columns: 1.4fr 1fr; gap: 16px; margin-top: 24px; }
.big .label { font-weight: 600; }
.big .vals { display: flex; align-items: baseline; gap: 18px; margin: 10px 0 4px; }
.big .num { font-size: 56px; font-weight: 700; letter-spacing: -0.03em; line-height: 1; }
.big .num.before { color: var(--before); }
.big .num.after { color: var(--after); }
.big .arrow { font-size: 28px; color: var(--muted); }
.frac { color: var(--muted); font-size: 14px; }
.ci { margin-top: 14px; }
.ci-row { display: grid; grid-template-columns: 34px 1fr 140px; align-items: center; gap: 8px; font-size: 13px; color: var(--muted); margin: 6px 0; }
.ci-track { position: relative; height: 10px; background: var(--bg); border-radius: 5px; }
.ci-bar { position: absolute; top: 0; height: 10px; border-radius: 5px; opacity: .35; }
.ci-dot { position: absolute; top: -3px; width: 4px; height: 16px; border-radius: 2px; transform: translateX(-2px); }
.ci-axis { display: grid; grid-template-columns: 34px 1fr 140px; gap: 8px; font-size: 11px; color: var(--muted); }
.ci-axis span:nth-child(2) { display: flex; justify-content: space-between; }
.small { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.metric .label { font-size: 13px; color: var(--muted); }
.metric .pair { font-size: 22px; font-weight: 650; margin-top: 4px; }
.metric .pair .b { color: var(--before); }
.metric .pair .a { color: var(--after); }
.metric .pair .to { color: var(--muted); font-weight: 400; font-size: 16px; margin: 0 6px; }

/* categories */
.cats { display: grid; grid-template-columns: 150px 1fr 1fr; gap: 0; }
.cats > div { padding: 9px 12px; border-bottom: 1px solid var(--line); display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.cats .h { font-size: 12px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); }
.cats .changed { background: var(--accent-bg); }
.cats .name { font-weight: 600; }
.dot { width: 16px; height: 16px; border-radius: 4px; display: inline-block; cursor: pointer; }
.dot.ok { background: var(--ok); } .dot.fa { background: var(--fa); } .dot.fr { background: var(--fr); } .dot.err { background: var(--err); }
.legend { display: flex; gap: 16px; font-size: 13px; color: var(--muted); margin-top: 10px; flex-wrap: wrap; }
.legend span { display: inline-flex; align-items: center; gap: 6px; }
.legend .dot { width: 12px; height: 12px; cursor: default; }
.tally { margin-left: auto; font-size: 13px; color: var(--muted); }

/* injection gallery */
.gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(270px, 1fr)); gap: 12px; }
.card { cursor: pointer; transition: border-color .15s; }
.card:hover { border-color: var(--accent); }
.card h3 { font-size: 15px; margin: 0 0 6px; }
.card p { margin: 0 0 10px; font-size: 13px; color: var(--muted); }
.badges { display: flex; gap: 6px; flex-wrap: wrap; }
.badge { font-size: 12px; padding: 2px 8px; border-radius: 999px; font-weight: 600; }
.badge.ok { background: var(--ok-bg); color: var(--ok); }
.badge.fa { background: var(--fa-bg); color: var(--fa); }
.badge.fr { background: var(--fr-bg); color: var(--fr); }
.badge.err { background: var(--bg); color: var(--err); }
.badge.neutral { background: var(--bg); color: var(--muted); font-weight: 500; }

/* explorer */
.explorer { display: grid; grid-template-columns: 300px 1fr; gap: 16px; align-items: start; }
.filters { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 10px; }
.chip { border: 1px solid var(--line); background: var(--panel); color: var(--ink); border-radius: 999px; padding: 3px 10px; font: inherit; font-size: 12px; cursor: pointer; }
.chip.on { background: var(--accent); color: #fff; border-color: var(--accent); }
.list { max-height: 720px; overflow: auto; padding: 4px; }
.item { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-radius: 8px; cursor: pointer; font-size: 13px; }
.item:hover { background: var(--bg); }
.item.sel { background: var(--accent-bg); }
.item .id { flex: 1; font-family: var(--mono); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.item .mini { display: flex; gap: 3px; }
.item .mini .dot { width: 10px; height: 10px; cursor: inherit; }
.detail h3 { margin: 0; font-size: 20px; font-family: var(--mono); }
.req { margin-top: 14px; padding: 12px; border: 1px solid var(--line); border-radius: 10px; }
.req .t { font-weight: 600; }
.req .d { color: var(--muted); font-size: 14px; margin-top: 2px; }
.req .why { font-size: 13px; margin-top: 8px; }
.sides { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 16px; }
.side { border: 1px solid var(--line); border-radius: 10px; padding: 14px; min-width: 0; }
.side h4 { margin: 0 0 10px; font-size: 14px; display: flex; justify-content: space-between; }
.verdict { padding: 10px; border-radius: 8px; margin-bottom: 10px; font-size: 14px; }
.verdict.ok { background: var(--ok-bg); } .verdict.fa { background: var(--fa-bg); } .verdict.fr { background: var(--fr-bg); } .verdict.err { background: var(--bg); }
.verdict .r { margin-top: 6px; color: var(--ink); }
.k { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); margin: 14px 0 6px; }
.gantt { position: relative; height: 26px; background: var(--bg); border-radius: 6px; overflow: hidden; }
.seg { position: absolute; top: 3px; height: 20px; border-radius: 4px; font-size: 10px; color: #fff; padding: 2px 4px; overflow: hidden; white-space: nowrap; }
.seg.plan { background: #7048e8; } .seg.gather { background: #1c7ed6; } .seg.analyze { background: #0ca678; } .seg.format { background: #e8590c; }
.round { display: flex; gap: 8px; align-items: flex-start; margin: 4px 0; font-size: 13px; }
.round .n { color: var(--muted); width: 60px; flex: none; }
.files { display: flex; gap: 4px; flex-wrap: wrap; }
.file { font-family: var(--mono); font-size: 11.5px; background: var(--bg); border: 1px solid var(--line); border-radius: 5px; padding: 1px 6px; }
.file.win { border-color: var(--accent); color: var(--accent); }
table.calls { width: 100%; border-collapse: collapse; font-size: 12.5px; }
table.calls td, table.calls th { text-align: left; padding: 4px 6px; border-bottom: 1px solid var(--line); }
table.calls th { color: var(--muted); font-weight: 500; }
.repair { font-size: 12px; color: var(--fr); margin-top: 4px; }
details.fixture { margin-top: 16px; }
details.fixture summary { cursor: pointer; color: var(--muted); font-size: 14px; }
details.fixture pre { background: var(--bg); border: 1px solid var(--line); border-radius: 8px; padding: 10px; font: 12px/1.45 var(--mono); max-height: 360px; overflow: auto; white-space: pre; }
details.fixture .fname { font-family: var(--mono); font-size: 12.5px; margin-top: 10px; }
details.fixture .fname .tag { color: var(--accent); margin-left: 6px; }

@media (max-width: 900px) {
  .hero, .explorer, .sides { grid-template-columns: 1fr; }
  .cats { grid-template-columns: 110px 1fr 1fr; }
  .list { max-height: 320px; }
  .big .num { font-size: 42px; }
}
</style>
</head>
<body>
<div class="wrap">
  <button class="theme" id="theme" type="button">Theme</button>
  <h1>Is the Evaluator right?</h1>
  <div class="sub" id="meta"></div>
  <div class="caveat"><b>Smoke test, not a benchmark.</b> 30 hand-built cases, one run each, written by the
    people who wrote the prompts. Read the 95% intervals, not the point estimates: 0/22 means
    "no false approval observed", not "cannot falsely approve".</div>

  <div class="hero">
    <div class="panel big" id="fa"></div>
    <div class="small" id="small"></div>
  </div>

  <h2>Every verdict, by category</h2>
  <div class="panel">
    <div class="cats" id="cats"></div>
    <div class="legend">
      <span><i class="dot ok"></i>correct</span>
      <span><i class="dot fa"></i>false approval — said satisfied, wasn't</span>
      <span><i class="dot fr"></i>false rejection — said not satisfied, was</span>
      <span><i class="dot err"></i>run failed</span>
      <span>Click any square to open that case.</span>
    </div>
  </div>

  <h2>Prompt-injection attempts</h2>
  <div class="sub" style="margin:-6px 0 12px">Files in these repos try to talk the agent into approving work that isn't there. Controls are genuine work that merely contains instruction-like text — the agent must not punish it.</div>
  <div class="gallery" id="gallery"></div>

  <h2>Case explorer</h2>
  <div class="explorer">
    <div class="panel">
      <div class="filters" id="filters"></div>
      <div class="list" id="list"></div>
    </div>
    <div class="panel detail" id="detail"></div>
  </div>
</div>

<script id="data" type="application/json">__DATA__</script>
<script>
(function () {
  "use strict";
  var D = JSON.parse(document.getElementById("data").textContent);
  var A = D.before, B = D.after;
  var VA = A.promptTemplateVersion, VB = B.promptTemplateVersion;
  var CASES = {}; D.cases.forEach(function (c) { CASES[c.id] = c; });
  var resA = index(A), resB = index(B);
  var ORDER = D.cases.map(function (c) { return c.id; });
  var CATS = []; D.cases.forEach(function (c) { if (CATS.indexOf(c.category) < 0) CATS.push(c.category); });

  function index(run) { var m = {}; run.results.forEach(function (r) { if (!m[r.caseId]) m[r.caseId] = r; }); return m; }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function pc(x) { return (x * 100).toFixed(x > 0 && x < 0.1 ? 1 : 0).replace(/\\.0$/, "") + "%"; }
  function cls(q) { if (!q || q.got === "error") return "err"; if (q.got === q.expected) return "ok"; return q.got === "satisfied" ? "fa" : "fr"; }
  var WORD = { ok: "correct", fa: "false approval", fr: "false rejection", err: "run failed" };
  function nice(id) { return id.replace(/^(injection|control)-/, "").replace(/-/g, " "); }

  // theme toggle, remembered per viewer
  var root = document.documentElement;
  try { var t = localStorage.getItem("eval-theme"); if (t) root.dataset.theme = t; } catch (e) {}
  document.getElementById("theme").onclick = function () {
    var dark = root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
    root.dataset.theme = dark ? "light" : "dark";
    try { localStorage.setItem("eval-theme", root.dataset.theme); } catch (e) {}
  };

  // meta
  document.getElementById("meta").textContent =
    "Model " + B.modelId + " · " + D.cases.length + " cases · " + B.metrics.n + " requirement verdicts · prompts " +
    VA + " (" + A.gitSha.slice(0, 8) + ") vs " + VB + " (" + B.gitSha.slice(0, 8) + ") · " + B.startedAt.slice(0, 10);

  // headline: false approvals with CIs
  (function () {
    var box = document.getElementById("fa"), a = A.metrics.falseApprovalRate, b = B.metrics.falseApprovalRate;
    box.appendChild(el("div", "label", "False-approval rate"));
    box.appendChild(el("div", "sub", "Of the requirements that were NOT met, how often the agent said they were. The error that costs a stakeholder."));
    var v = el("div", "vals");
    v.appendChild(el("span", "num before", pc(a.value)));
    v.appendChild(el("span", "arrow", "→"));
    v.appendChild(el("span", "num after", pc(b.value)));
    box.appendChild(v);
    box.appendChild(el("div", "frac", VA + ": " + a.num + "/" + a.den + "   ·   " + VB + ": " + b.num + "/" + b.den));
    var max = 0.5, ci = el("div", "ci");
    [[VA, a, "var(--before)"], [VB, b, "var(--after)"]].forEach(function (x) {
      var row = el("div", "ci-row"); row.appendChild(el("span", "", x[0]));
      var tr = el("div", "ci-track"), bar = el("div", "ci-bar"), dot = el("div", "ci-dot");
      bar.style.left = (x[1].ci[0] / max * 100) + "%"; bar.style.width = Math.max(1, (x[1].ci[1] - x[1].ci[0]) / max * 100) + "%"; bar.style.background = x[2];
      dot.style.left = (x[1].value / max * 100) + "%"; dot.style.background = x[2];
      tr.appendChild(bar); tr.appendChild(dot); row.appendChild(tr);
      row.appendChild(el("span", "", "95% CI " + pc(x[1].ci[0]) + "–" + pc(x[1].ci[1])));
      ci.appendChild(row);
    });
    var ax = el("div", "ci-axis"); ax.appendChild(el("span")); var t = el("span");
    ["0%", "10%", "20%", "30%", "40%", "50%"].forEach(function (s) { t.appendChild(el("span", "", s)); });
    ax.appendChild(t); ax.appendChild(el("span")); ci.appendChild(ax);
    box.appendChild(ci);

    var small = document.getElementById("small");
    function tokens(run) { var ok = run.results.filter(function (r) { return r.trace; }); return Math.round(ok.reduce(function (s, r) { return s + r.trace.totalUsage.totalTokens; }, 0) / ok.length); }
    [["False-rejection rate", A.metrics.falseRejectionRate, B.metrics.falseRejectionRate],
     ["Precision · “satisfied”", A.metrics.precision, B.metrics.precision],
     ["Recall · “satisfied”", A.metrics.recall, B.metrics.recall],
     ["Accuracy", A.metrics.accuracy, B.metrics.accuracy],
     ["Rationales citing unread files", A.metrics.ungroundedRationales, B.metrics.ungroundedRationales],
     ["Mean tokens per run", tokens(A), tokens(B)]].forEach(function (m) {
      var p = el("div", "panel metric"); p.appendChild(el("div", "label", m[0]));
      var pair = el("div", "pair");
      var f = function (x) { return typeof x === "number" ? x.toLocaleString() : pc(x.value); };
      pair.appendChild(el("span", "b", f(m[1]))); pair.appendChild(el("span", "to", "→")); pair.appendChild(el("span", "a", f(m[2])));
      p.appendChild(pair);
      if (typeof m[1] !== "number") p.appendChild(el("div", "frac", m[1].num + "/" + m[1].den + " → " + m[2].num + "/" + m[2].den));
      small.appendChild(p);
    });
  })();

  // categories
  (function () {
    var g = document.getElementById("cats");
    ["Category", "Prompts " + VA + " (before)", "Prompts " + VB + " (after)"].forEach(function (h) { g.appendChild(el("div", "h", h)); });
    CATS.forEach(function (cat) {
      var ids = ORDER.filter(function (id) { return CASES[id].category === cat; });
      var rowsA = [], rowsB = [];
      ids.forEach(function (id) {
        CASES[id].requirements.forEach(function (r) {
          rowsA.push([id, find(resA[id], r.id)]); rowsB.push([id, find(resB[id], r.id)]);
        });
      });
      var changed = rowsA.some(function (x, i) { return cls(x[1]) !== cls(rowsB[i][1]); });
      var name = el("div", "name" + (changed ? " changed" : ""), cat.replace("_", " "));
      g.appendChild(name);
      [rowsA, rowsB].forEach(function (rows) {
        var c = el("div", changed ? "changed" : "");
        var right = 0;
        rows.forEach(function (x) {
          var k = cls(x[1]); if (k === "ok") right++;
          var d = el("i", "dot " + k); d.title = x[0] + " · " + (x[1] ? x[1].requirementId : "") + " · " + WORD[k];
          d.onclick = function () { open(x[0], true); }; c.appendChild(d);
        });
        c.appendChild(el("span", "tally", right + "/" + rows.length));
        g.appendChild(c);
      });
    });
  })();
  function find(res, reqId) { return res && res.requirements.filter(function (q) { return q.requirementId === reqId; })[0]; }

  // injection gallery
  (function () {
    var g = document.getElementById("gallery");
    ORDER.filter(function (id) { var c = CASES[id].category; return c === "injection" || c === "control"; }).forEach(function (id) {
      var c = CASES[id], r = c.requirements[0];
      var card = el("div", "panel card");
      card.appendChild(el("h3", "", (c.category === "control" ? "Control: " : "") + nice(id)));
      card.appendChild(el("p", "", r.why));
      var b = el("div", "badges");
      b.appendChild(el("span", "badge neutral", "expected " + r.expected.replace("_", " ")));
      [[VA, resA], [VB, resB]].forEach(function (x) { var q = find(x[1][id], r.id), k = cls(q); b.appendChild(el("span", "badge " + k, x[0] + ": " + (k === "ok" ? "resisted" : WORD[k]))); });
      card.appendChild(b);
      card.onclick = function () { open(id, true); };
      g.appendChild(card);
    });
  })();

  // explorer
  var filter = "all", selected = null;
  function renderFilters() {
    var f = document.getElementById("filters"); f.innerHTML = "";
    ["all", "differs"].concat(CATS).forEach(function (k) {
      var b = el("button", "chip" + (filter === k ? " on" : ""), k === "differs" ? "only differences" : k.replace("_", " "));
      b.type = "button"; b.onclick = function () { filter = k; renderFilters(); renderList(); }; f.appendChild(b);
    });
  }
  function differs(id) { return CASES[id].requirements.some(function (r) { return cls(find(resA[id], r.id)) !== cls(find(resB[id], r.id)); }); }
  function renderList() {
    var l = document.getElementById("list"); l.innerHTML = "";
    ORDER.filter(function (id) { return filter === "all" || (filter === "differs" ? differs(id) : CASES[id].category === filter); }).forEach(function (id) {
      var it = el("div", "item" + (id === selected ? " sel" : ""));
      it.appendChild(el("span", "id", id));
      [resA, resB].forEach(function (res) {
        var m = el("span", "mini");
        CASES[id].requirements.forEach(function (r) { m.appendChild(el("i", "dot " + cls(find(res[id], r.id)))); });
        it.appendChild(m);
      });
      it.onclick = function () { open(id, false); };
      l.appendChild(it);
    });
  }

  function open(id, scroll) {
    selected = id; renderList();
    try { history.replaceState(null, "", "#case=" + id); } catch (e) {}
    var c = CASES[id], d = document.getElementById("detail"); d.innerHTML = "";
    d.appendChild(el("h3", "", id));
    d.appendChild(el("div", "sub", c.category.replace("_", " ") + " · " + c.repos.map(function (r) { return r.repo; }).join(", ")));
    c.requirements.forEach(function (r) {
      var q = el("div", "req");
      q.appendChild(el("div", "t", r.title + "  —  expected: " + r.expected.replace("_", " ")));
      q.appendChild(el("div", "d", r.description));
      q.appendChild(el("div", "why", "Why this label: " + r.why));
      d.appendChild(q);
    });
    var sides = el("div", "sides");
    [[VA, resA[id]], [VB, resB[id]]].forEach(function (x) { sides.appendChild(side(x[0], x[1], c)); });
    d.appendChild(sides);
    d.appendChild(fixture(c));
    if (scroll) d.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function side(version, res, c) {
    var s = el("div", "side"), h = el("h4");
    h.appendChild(el("span", "", "Prompts " + version));
    if (res) h.appendChild(el("span", "sub", (res.durationMs / 1000).toFixed(1) + "s" + (res.trace ? " · " + res.trace.totalUsage.totalTokens.toLocaleString() + " tokens" : "")));
    s.appendChild(h);
    if (!res) { s.appendChild(el("div", "sub", "Not run.")); return s; }
    if (res.error) s.appendChild(el("div", "verdict err", "Run failed: " + res.error.kind + " — " + res.error.message));
    c.requirements.forEach(function (r) {
      var q = find(res, r.id), k = cls(q), v = el("div", "verdict " + k);
      var head = el("div"); head.appendChild(el("b", "", (c.requirements.length > 1 ? r.title + ": " : "") + (q ? q.got.replace("_", " ") : "—")));
      head.appendChild(el("span", "sub", "  · " + WORD[k])); v.appendChild(head);
      if (q && q.rationale) v.appendChild(el("div", "r", q.rationale));
      if (q && q.ungrounded && q.ungrounded.length) v.appendChild(el("div", "repair", "Cites unread files: " + q.ungrounded.join(", ")));
      s.appendChild(v);
    });
    var t = res.trace; if (!t) return s;

    s.appendChild(el("div", "k", "Timeline · " + t.rounds + " round" + (t.rounds === 1 ? "" : "s") + " · stopped: " + t.stopReason.replace(/_/g, " ")));
    var start = Date.parse(t.nodes[0].startedAt), end = Math.max.apply(null, t.nodes.map(function (n) { return Date.parse(n.startedAt) + n.durationMs; }));
    var span = Math.max(1, end - start), g = el("div", "gantt");
    t.nodes.forEach(function (n) {
      var seg = el("div", "seg " + n.node, n.node + (n.round ? " " + n.round : ""));
      seg.style.left = ((Date.parse(n.startedAt) - start) / span * 100) + "%";
      seg.style.width = "max(3px, " + (n.durationMs / span * 100) + "%)";
      seg.title = n.node + " round " + n.round + " · " + n.durationMs + "ms";
      g.appendChild(seg);
    });
    s.appendChild(g);

    s.appendChild(el("div", "k", "Files read"));
    t.filesReadPerRound.forEach(function (files, i) {
      var row = el("div", "round"); row.appendChild(el("span", "n", "round " + (i + 1)));
      var fs = el("div", "files");
      files.forEach(function (f) {
        var m = /^(.*?):(.*?)(?:#(\\d+))?$/.exec(f), win = m && m[3];
        fs.appendChild(el("span", "file" + (win ? " win" : ""), (c.repos.length > 1 ? m[1] + ":" : "") + m[2] + (win ? "  from char " + Number(win).toLocaleString() : "")));
      });
      row.appendChild(fs); s.appendChild(row);
    });

    s.appendChild(el("div", "k", "Model calls"));
    var tb = el("table", "calls"), hr = el("tr");
    ["node", "round", "attempts", "in", "out"].forEach(function (x) { hr.appendChild(el("th", "", x)); });
    tb.appendChild(hr);
    t.modelCalls.forEach(function (m) {
      var tr = el("tr");
      [m.node, m.round, m.attempts, m.usage.inputTokens.toLocaleString(), m.usage.outputTokens.toLocaleString()].forEach(function (x) { tr.appendChild(el("td", "", String(x))); });
      tb.appendChild(tr);
      m.repairs.forEach(function (p) { var rr = el("tr"), td = el("td", "repair", "Repair asked: " + p); td.colSpan = 5; rr.appendChild(td); tb.appendChild(rr); });
    });
    s.appendChild(tb);
    if (t.redactions.length) {
      s.appendChild(el("div", "k", "Withheld at FORMAT"));
      t.redactions.forEach(function (r) { s.appendChild(el("div", "repair", r.requirementVersionId + ": " + (r.reason === "code" ? "rationale looked like source code" : "rationale cited a file the run never read"))); });
    }
    return s;
  }

  function fixture(c) {
    var det = el("details", "fixture");
    det.appendChild(el("summary", "", "The fixture repo this case runs against (" + c.repos.reduce(function (n, r) { return n + Object.keys(r.files).length; }, 0) + " files)"));
    c.repos.forEach(function (r) {
      Object.keys(r.files).sort().forEach(function (p) {
        var n = el("div", "fname", r.repo + ":" + p);
        if (r.changed.indexOf(p) >= 0) n.appendChild(el("span", "tag", "touched by the claimed commit"));
        det.appendChild(n);
        var body = r.files[p];
        det.appendChild(el("pre", "", body.length > 6000 ? body.slice(0, 6000) + "\\n… (" + (body.length - 6000).toLocaleString() + " more characters)" : body));
      });
    });
    return det;
  }

  renderFilters();
  var m = /case=([\\w-]+)/.exec(location.hash);
  open(m && CASES[m[1]] ? m[1] : (ORDER.filter(differs)[0] || ORDER[0]), false);
})();
</script>
</body>
</html>
`;
