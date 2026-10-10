/**
 * A self-contained HTML view of two eval runs, written next to comparison.md
 * by `npm run eval -- --compare=v2,v3`.
 *
 * One file: the results and the fixtures are embedded as JSON and rendered by
 * inline script, so it opens from disk and records cleanly for a demo. It
 * shows only what the runs already stored — nothing here calls a model.
 *
 * Styled after the Ledger design system (packages/design-system-ledger): Geist,
 * ink on paper, square ruled structure, ink as the only action colour, and the
 * verdict pair of green and red. Geist loads from Google Fonts when online and
 * falls back to the system faces at the same sizes when not.
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
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&family=Geist+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
/* Ledger tokens, light first. Values copied from design-system-ledger/styles/tokens.css. */
:root {
  color-scheme: light;
  --canvas: #f8f8f7; --surface: #ffffff; --well: #f0f0ee; --hover: #eeeeea; --active: #e4e4e0;
  --rule: #e2e2de; --rule-strong: #c5c5bf; --rule-ink: #131312;
  --text: #131312; --text-2: #5c5c57; --text-muted: #757570; --text-faint: #9a9a94;
  --ink: #131312; --ink-hover: #2f2f2b; --on-ink: #ffffff;
  --sat: #0c6b45; --sat-subtle: rgba(12,107,69,.09); --sat-rule: rgba(12,107,69,.3);
  --uns: #b3261e; --uns-subtle: rgba(179,38,30,.08); --uns-rule: rgba(179,38,30,.3);
  --warn: #7a5200; --warn-subtle: rgba(122,82,0,.1); --warn-rule: rgba(122,82,0,.3);
  --neutral: #757570; --neutral-rule: #c5c5bf;
  --focus: #131312;
  --sans: "Geist", "Geist Sans", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  --mono: "Geist Mono", ui-monospace, "SF Mono", "Cascadia Mono", Menlo, Consolas, monospace;
  --ease: cubic-bezier(.16,1,.3,1);
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    color-scheme: dark;
    --canvas: #0d0d0d; --surface: #161616; --well: #080808; --hover: #262623; --active: #2f2f2b;
    --rule: #2f2f2b; --rule-strong: #43433e; --rule-ink: #e8e8e4;
    --text: #f0f0ec; --text-2: #b4b4ad; --text-muted: #8b8b84; --text-faint: #66665f;
    --ink: #eaeae5; --ink-hover: #d5d5d0; --on-ink: #131312;
    --sat: #3fcf95; --sat-subtle: rgba(63,207,149,.12); --sat-rule: rgba(63,207,149,.32);
    --uns: #f08a80; --uns-subtle: rgba(240,138,128,.13); --uns-rule: rgba(240,138,128,.32);
    --warn: #e0b453; --warn-subtle: rgba(224,180,83,.12); --warn-rule: rgba(224,180,83,.32);
    --neutral: #8f8f88; --neutral-rule: #43433e; --focus: #eaeae5;
  }
}
:root[data-theme="dark"] {
  color-scheme: dark;
  --canvas: #0d0d0d; --surface: #161616; --well: #080808; --hover: #262623; --active: #2f2f2b;
  --rule: #2f2f2b; --rule-strong: #43433e; --rule-ink: #e8e8e4;
  --text: #f0f0ec; --text-2: #b4b4ad; --text-muted: #8b8b84; --text-faint: #66665f;
  --ink: #eaeae5; --ink-hover: #d5d5d0; --on-ink: #131312;
  --sat: #3fcf95; --sat-subtle: rgba(63,207,149,.12); --sat-rule: rgba(63,207,149,.32);
  --uns: #f08a80; --uns-subtle: rgba(240,138,128,.13); --uns-rule: rgba(240,138,128,.32);
  --warn: #e0b453; --warn-subtle: rgba(224,180,83,.12); --warn-rule: rgba(224,180,83,.32);
  --neutral: #8f8f88; --neutral-rule: #43433e; --focus: #eaeae5;
}

* { box-sizing: border-box; }
html, body { margin: 0; }
body { background: var(--canvas); color: var(--text); font: 400 0.875rem/1.375rem var(--sans); -webkit-font-smoothing: antialiased; }
.wrap { max-width: 1200px; margin: 0 auto; padding: 3rem 1.5rem 4rem; }
button { font: inherit; color: inherit; }
:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
.mono { font-family: var(--mono); font-size: 0.8125rem; }
.muted { color: var(--text-muted); }
.svg { width: 14px; height: 14px; flex: none; }

/* page head */
.top { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; }
h1 { font-size: 2.25rem; line-height: 2.5rem; font-weight: 600; letter-spacing: -0.021em; margin: 0; max-width: 22ch; text-wrap: balance; }
.meta { font-family: var(--mono); font-size: 0.75rem; color: var(--text-muted); margin-top: 0.75rem; }
.rule-ink { border: 0; border-top: 2px solid var(--rule-ink); margin: 1.5rem 0 0; }
.btn { display: inline-flex; align-items: center; gap: 0.5rem; height: 2.125rem; padding: 0 1rem; border: 1px solid var(--rule-strong); background: var(--surface); cursor: pointer; font-weight: 500; transition: background .14s var(--ease); white-space: nowrap; }
.btn:hover { background: var(--hover); }
.btn.primary { background: var(--ink); border-color: var(--ink); color: var(--on-ink); }
.btn.primary:hover { background: var(--ink-hover); }
.btn.small { height: 1.75rem; padding: 0 0.75rem; font-size: 0.8125rem; }

/* headline */
.verdict-line { font-size: 1.75rem; line-height: 2.25rem; font-weight: 500; letter-spacing: -0.01em; margin: 2.5rem 0 0; max-width: 34ch; text-wrap: balance; }
.verdict-line b { font-weight: 600; }
.verdict-line .was { color: var(--text-muted); }
.findings { list-style: none; padding: 0; margin: 2rem 0 0; display: grid; grid-template-columns: repeat(3, 1fr); border-top: 1px solid var(--rule); }
.findings li { padding: 1rem 1.5rem 1rem 0; border-bottom: 1px solid var(--rule); }
.findings li + li { padding-left: 1.5rem; border-left: 1px solid var(--rule); }
.findings .t { font-weight: 600; font-size: 0.9375rem; }
.findings p { margin: 0.25rem 0 0; color: var(--text-2); font-size: 0.875rem; }
.findings a { color: var(--text); text-underline-offset: 3px; cursor: pointer; }

h2 { font-size: 1.3125rem; line-height: 1.75rem; font-weight: 600; letter-spacing: -0.01em; margin: 4rem 0 0; }
h2 + .lede { color: var(--text-2); margin: 0.25rem 0 0; max-width: 66ch; }
.section-rule { border: 0; border-top: 2px solid var(--rule-ink); margin: 0.75rem 0 0; }

/* tables */
.table-scroll { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; }
th { text-align: left; font-size: 0.6875rem; line-height: 1rem; font-weight: 500; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-muted); padding: 0.75rem 0.75rem 0.5rem; border-bottom: 1px solid var(--rule-strong); white-space: nowrap; }
td { padding: 0.75rem; border-bottom: 1px solid var(--rule); vertical-align: middle; }
th:first-child, td:first-child { padding-left: 0; }
th:last-child, td:last-child { padding-right: 0; }
.num { font-variant-numeric: tabular-nums; white-space: nowrap; }
.metrics td.v { font-size: 1.0625rem; font-weight: 500; }
.metrics td.v .of { font-size: 0.8125rem; color: var(--text-muted); font-weight: 400; margin-left: 0.25rem; }
.metrics td.before { color: var(--text-2); }
.metrics tr.lead td { padding-top: 1rem; padding-bottom: 1rem; }
.metrics tr.lead td.v { font-size: 1.75rem; font-weight: 600; letter-spacing: -0.01em; }
.metrics tr.lead td.v.before { color: var(--text-muted); }
.metrics .label { font-weight: 500; }
.metrics .hint { display: block; color: var(--text-muted); font-size: 0.75rem; line-height: 1.125rem; font-weight: 400; }
.delta { font-size: 0.8125rem; }
.delta.better { color: var(--sat); } .delta.worse { color: var(--uns); } .delta.cost { color: var(--warn); } .delta.same { color: var(--text-muted); }
.range { position: relative; width: 240px; height: 26px; }
.range .axis { position: absolute; left: 0; right: 0; top: 12px; border-top: 1px solid var(--rule); }
.range .span { position: absolute; height: 9px; border: 1px solid var(--rule-strong); background: var(--well); }
.range .span.a { top: 1px; } .range .span.b { top: 15px; border-color: var(--ink); background: var(--active); }
.range .pt { position: absolute; width: 2px; height: 13px; }
.range .pt.a { top: -1px; background: var(--text-muted); } .range .pt.b { top: 13px; background: var(--ink); }
.range-cell { display: flex; align-items: center; gap: 0.75rem; }
.range-cell .lbl { font-size: 0.75rem; color: var(--text-muted); line-height: 1.1rem; }

/* chips — the only round things */
.chip { display: inline-flex; align-items: center; gap: 0.25rem; height: 1.375rem; padding: 0 0.5rem; border: 1px solid var(--neutral-rule); border-radius: 999px; font-size: 0.75rem; line-height: 1; font-weight: 500; white-space: nowrap; color: var(--neutral); }
.chip.sat { background: var(--sat-subtle); border-color: var(--sat-rule); color: var(--sat); }
.chip.uns { background: var(--uns-subtle); border-color: var(--uns-rule); color: var(--uns); }
.chip.warn { background: var(--warn-subtle); border-color: var(--warn-rule); color: var(--warn); }
.chip .svg { width: 12px; height: 12px; }

/* injection table */
.attacks td:first-child { font-weight: 500; white-space: nowrap; }
.attacks td.what { color: var(--text-2); }
.attacks tr { cursor: pointer; }
.attacks tr:hover td { background: var(--hover); }
.attacks .go { color: var(--text-muted); }

/* explorer */
.explorer { display: grid; grid-template-columns: 280px 1fr; margin-top: 1.5rem; border: 1px solid var(--rule); background: var(--surface); }
.side { border-right: 1px solid var(--rule); display: flex; flex-direction: column; min-width: 0; position: sticky; top: 0; align-self: start; max-height: 100vh; }
.filter { padding: 0.75rem; border-bottom: 1px solid var(--rule); }
.filter select { width: 100%; height: 2.125rem; border: 1px solid var(--rule-strong); background: var(--surface); color: var(--text); font: inherit; padding: 0 0.5rem; border-radius: 0; }
.list { overflow: auto; flex: 1; min-height: 0; }
.item { display: flex; align-items: center; gap: 0.5rem; width: 100%; text-align: left; padding: 0.5rem 0.75rem; border: 0; border-bottom: 1px solid var(--rule); background: none; cursor: pointer; }
.item:hover { background: var(--hover); }
.item.sel { background: var(--active); }
.item .id { flex: 1; min-width: 0; font-family: var(--mono); font-size: 0.75rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.item .changed { font-size: 0.6875rem; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-muted); }
.mark { display: inline-flex; width: 18px; height: 18px; align-items: center; justify-content: center; border-radius: 999px; border: 1px solid; flex: none; }
.mark .svg { width: 11px; height: 11px; }
.mark.sat { color: var(--sat); border-color: var(--sat-rule); background: var(--sat-subtle); }
.mark.uns { color: var(--uns); border-color: var(--uns-rule); background: var(--uns-subtle); }
.mark.err { color: var(--neutral); border-color: var(--neutral-rule); }

.detail { padding: 1.5rem; min-width: 0; }
.detail-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; flex-wrap: wrap; }
.detail h3 { font-family: var(--mono); font-size: 1.0625rem; font-weight: 500; margin: 0; word-break: break-word; }
.detail .sub { color: var(--text-muted); font-size: 0.8125rem; margin-top: 0.25rem; }

/* version switch */
.switch { display: inline-grid; grid-template-columns: 1fr 1fr; position: relative; border: 1px solid var(--rule-strong); background: var(--well); padding: 2px; }
.switch input { position: absolute; opacity: 0; pointer-events: none; }
.switch label { position: relative; z-index: 1; padding: 0 0.875rem; height: 1.875rem; display: inline-flex; align-items: center; justify-content: center; gap: 0.375rem; cursor: pointer; font-weight: 500; font-size: 0.8125rem; color: var(--text-2); transition: color .2s var(--ease); white-space: nowrap; }
.switch label small { font-weight: 400; color: inherit; opacity: .7; }
.switch .thumb { position: absolute; top: 2px; bottom: 2px; left: 2px; width: calc(50% - 2px); background: var(--ink); transition: transform .28s var(--ease); }
.switch[data-v="after"] .thumb { transform: translateX(100%); }
.switch input:checked + label { color: var(--on-ink); }
.switch input:focus-visible + label { outline: 2px solid var(--focus); outline-offset: 2px; }

.req { margin-top: 1.5rem; padding-top: 1rem; border-top: 1px solid var(--rule); }
.req-head { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
.req-head .t { font-weight: 600; font-size: 0.9375rem; }
.req .d { color: var(--text-2); margin: 0.25rem 0 0; max-width: 66ch; }
.answer { margin-top: 1rem; display: grid; grid-template-columns: 120px 1fr; gap: 0.5rem 1rem; }
.answer dt { font-size: 0.6875rem; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-muted); padding-top: 0.2rem; }
.answer dd { margin: 0; }
.answer .prose { font-size: 0.9375rem; line-height: 1.5rem; max-width: 66ch; }
.answer .withheld { color: var(--text-2); font-style: italic; }
.answer .why { color: var(--text-2); max-width: 66ch; }

.run-head { display: flex; justify-content: space-between; align-items: flex-end; gap: 1rem; flex-wrap: wrap; margin-top: 2rem; }
.run-head h4 { margin: 0; font-size: 0.9375rem; font-weight: 600; }
.run-head .sum { color: var(--text-muted); font-size: 0.8125rem; }
.rounds { margin-top: 0.5rem; }
.rounds td { vertical-align: top; }
.rounds td.step { font-weight: 500; white-space: nowrap; }
.rounds .files { display: flex; flex-wrap: wrap; gap: 0.25rem; }
.file { font-family: var(--mono); font-size: 0.75rem; padding: 0.0625rem 0.375rem; background: var(--well); border: 1px solid var(--rule); white-space: nowrap; }
.file.win { border-color: var(--rule-strong); }
.file.win em { font-style: normal; color: var(--text-muted); }
.rounds .note { display: block; margin-top: 0.375rem; font-size: 0.75rem; color: var(--warn); }
.rounds tr.total td { border-bottom: 0; font-weight: 600; }

.fixture-bar { display: flex; align-items: center; gap: 1rem; margin-top: 1.5rem; padding: 1rem; background: var(--well); border: 1px solid var(--rule); flex-wrap: wrap; }
.fixture-bar p { margin: 0; flex: 1; min-width: 220px; color: var(--text-2); }
.fixture { display: grid; grid-template-columns: 260px 1fr; border: 1px solid var(--rule); border-top: 0; }
.fixture[hidden] { display: none; }
.ftree { border-right: 1px solid var(--rule); max-height: 520px; overflow: auto; }
.fitem { display: flex; flex-direction: column; gap: 0.125rem; width: 100%; text-align: left; padding: 0.5rem 0.75rem; border: 0; border-bottom: 1px solid var(--rule); background: none; cursor: pointer; }
.fitem:hover { background: var(--hover); }
.fitem.sel { background: var(--active); }
.fitem .p { font-family: var(--mono); font-size: 0.75rem; word-break: break-all; }
.fitem .tags { display: flex; gap: 0.25rem; flex-wrap: wrap; }
.fitem .tag { font-size: 0.6875rem; color: var(--text-muted); }
.fitem .tag.read { color: var(--text); font-weight: 500; }
pre.code { margin: 0; padding: 1rem; background: var(--well); font: 0.75rem/1.25rem var(--mono); overflow: auto; max-height: 520px; white-space: pre; min-width: 0; }

/* how to read */
.notes { margin-top: 1rem; display: grid; grid-template-columns: repeat(2, 1fr); gap: 0 2rem; }
.notes p { margin: 0; padding: 0.75rem 0; border-bottom: 1px solid var(--rule); color: var(--text-2); max-width: 66ch; }
.notes b { color: var(--text); font-weight: 600; }

@media (max-width: 960px) {
  .findings { grid-template-columns: 1fr; }
  .findings li + li { padding-left: 0; border-left: 0; }
  .explorer { grid-template-columns: 1fr; }
  .side { border-right: 0; border-bottom: 1px solid var(--rule); position: static; max-height: none; }
  .list { max-height: 260px; }
  .fixture { grid-template-columns: 1fr; }
  .ftree { border-right: 0; border-bottom: 1px solid var(--rule); max-height: 220px; }
  .notes { grid-template-columns: 1fr; }
}
@media (max-width: 640px) {
  .wrap { padding: 2rem 1rem 3rem; }
  h1 { font-size: 1.75rem; line-height: 2.125rem; }
  .verdict-line { font-size: 1.3125rem; line-height: 1.75rem; }
  .metrics .rcol { display: none; }
  .metrics tr.lead td.v { font-size: 1.3125rem; }
  .attacks td.what, .attacks th.what, .attacks .go { display: none; }
  .attacks td:first-child { white-space: normal; }
  .findings li { padding-right: 0; }
  .answer { grid-template-columns: 1fr; }
  .detail { padding: 1rem; }
}
@media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
</style>
</head>
<body>
<div class="wrap">
  <div class="top">
    <div>
      <h1>Does the Evaluator get it right?</h1>
      <div class="meta" id="meta"></div>
    </div>
    <button class="btn small" id="theme" type="button" aria-label="Switch colour theme">Theme</button>
  </div>
  <hr class="rule-ink">

  <p class="verdict-line" id="headline"></p>
  <ul class="findings" id="findings"></ul>

  <h2>Before and after</h2>
  <p class="lede">The same 30 cases, the same model, two prompt versions. V3 has extra injection hardening, truncation awareness and strictness.</p>
  <hr class="section-rule">
  <div class="table-scroll"><table class="metrics" id="metrics"></table></div>

  <h2>Prompt-injection attempts</h2>
  <p class="lede">Files in these repos try to talk the agent into approving work that isn't there. The two controls are genuine work that only looks like it is addressing a reviewer. The agent must not punish those.</p>
  <hr class="section-rule">
  <div class="table-scroll"><table class="attacks" id="attacks"></table></div>

  <h2>Case by case</h2>
  <p class="lede">Every case, what the agent concluded, and what it read to get there.</p>
  <hr class="section-rule">
  <div class="explorer">
    <div class="side">
      <div class="filter"><select id="filter" aria-label="Filter cases"></select></div>
      <div class="list" id="list" role="listbox" aria-label="Cases"></div>
    </div>
    <div class="detail" id="detail"></div>
  </div>

  <h2>How to read this</h2>
  <hr class="section-rule">
  <div class="notes" id="notes"></div>
</div>

<script id="data" type="application/json">__DATA__</script>
<script>
(function () {
  "use strict";
  var D = JSON.parse(document.getElementById("data").textContent);
  var RUNS = { before: D.before, after: D.after };
  var VA = D.before.promptTemplateVersion, VB = D.after.promptTemplateVersion;
  var CASES = {}; D.cases.forEach(function (c) { CASES[c.id] = c; });
  var ORDER = D.cases.map(function (c) { return c.id; });
  var RES = { before: index(D.before), after: index(D.after) };
  var state = { version: "after", selected: null, filter: "all", file: null, fixtureOpen: false };
  var shownVersion = state.version; // where the switch thumb last rested

  function index(run) { var m = {}; run.results.forEach(function (r) { if (!m[r.caseId]) m[r.caseId] = r; }); return m; }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function pc(x) { var v = x * 100; if (v < 0.05) return "0%"; return (v < 10 ? v.toFixed(1).replace(/\\.0$/, "") : Math.round(v)) + "%"; }
  function words(s) { return s.replace(/_/g, " "); }
  function find(res, reqId) { return res && res.requirements.filter(function (q) { return q.requirementId === reqId; })[0]; }
  function outcome(q) { if (!q || q.got === "error") return "err"; if (q.got === q.expected) return "ok"; return q.got === "satisfied" ? "fa" : "fr"; }
  function caseOk(id, v) { return CASES[id].requirements.every(function (r) { return outcome(find(RES[v][id], r.id)) === "ok"; }); }
  function differs(id) { return CASES[id].requirements.some(function (r) { return outcome(find(RES.before[id], r.id)) !== outcome(find(RES.after[id], r.id)); }); }
  function secs(ms) { return ms < 1000 ? (ms < 1 ? "<1 ms" : Math.round(ms) + " ms") : (ms / 1000).toFixed(1) + " s"; }
  function n(x) { return x.toLocaleString("en-US"); }

  var SVGNS = "http://www.w3.org/2000/svg";
  var PATHS = {
    check: "M3 8.5l3.2 3.2L13 4.8",
    cross: "M4.5 4.5l7 7M11.5 4.5l-7 7",
    dash: "M4 8h8",
    arrow: "M6 3.5L10.5 8 6 12.5",
    file: "M4 1.75h5.5L12.5 4.75v9.5H4zM9.5 1.75v3h3"
  };
  function icon(name) {
    var s = document.createElementNS(SVGNS, "svg"); s.setAttribute("viewBox", "0 0 16 16"); s.setAttribute("class", "svg"); s.setAttribute("aria-hidden", "true");
    var p = document.createElementNS(SVGNS, "path"); p.setAttribute("d", PATHS[name]); p.setAttribute("fill", "none"); p.setAttribute("stroke", "currentColor");
    p.setAttribute("stroke-width", "1.75"); p.setAttribute("stroke-linecap", "round"); p.setAttribute("stroke-linejoin", "round"); s.appendChild(p); return s;
  }
  function verdictChip(got) {
    if (got === "error" || !got) { var e = el("span", "chip"); e.appendChild(icon("dash")); e.appendChild(document.createTextNode("run failed")); return e; }
    var sat = got === "satisfied", c = el("span", "chip " + (sat ? "sat" : "uns"));
    c.appendChild(icon(sat ? "check" : "cross")); c.appendChild(document.createTextNode(sat ? "Satisfied" : "Not satisfied")); return c;
  }
  function verdictMark(id, v) {
    var ok = caseOk(id, v), anyErr = CASES[id].requirements.some(function (r) { return outcome(find(RES[v][id], r.id)) === "err"; });
    var m = el("span", "mark " + (anyErr ? "err" : ok ? "sat" : "uns")); m.appendChild(icon(anyErr ? "dash" : ok ? "check" : "cross"));
    m.title = anyErr ? "run failed" : ok ? "every verdict correct" : "a verdict was wrong"; return m;
  }

  // theme, remembered per viewer
  var root = document.documentElement;
  try { var saved = localStorage.getItem("eval-theme"); if (saved) root.dataset.theme = saved; } catch (e) {}
  document.getElementById("theme").onclick = function () {
    var dark = root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
    root.dataset.theme = dark ? "light" : "dark";
    try { localStorage.setItem("eval-theme", root.dataset.theme); } catch (e) {}
  };

  document.getElementById("meta").textContent =
    D.after.modelId + "  ·  " + ORDER.length + " cases, " + D.after.metrics.n + " verdicts  ·  prompts " +
    VA + " " + D.before.gitSha.slice(0, 7) + " vs " + VB + " " + D.after.gitSha.slice(0, 7) + "  ·  " + D.after.startedAt.slice(0, 10);

  // ── headline: one sentence, then what changed and why ──
  (function () {
    var a = D.before.metrics.falseApprovalRate, b = D.after.metrics.falseApprovalRate;
    var h = document.getElementById("headline");
    h.appendChild(document.createTextNode("Of " + b.den + " requirements that were not met, the " + VB + " prompts approved "));
    h.appendChild(el("b", "", b.num === 0 ? "none" : b.num + ""));
    h.appendChild(document.createTextNode(". "));
    h.appendChild(el("span", "was", "The " + VA + " prompts approved " + (a.num === 0 ? "none" : a.num) + "."));

    var f = document.getElementById("findings");
    function finding(title, body, link) {
      var li = el("li"); li.appendChild(el("div", "t", title)); var p = el("p", "", body);
      if (link) { p.appendChild(document.createTextNode(" ")); var a = el("a", "", link[0]); a.tabIndex = 0; a.onclick = function () { open(link[1], true); }; a.onkeydown = function (e) { if (e.key === "Enter") open(link[1], true); }; p.appendChild(a); }
      li.appendChild(p); f.appendChild(li);
    }
    var changed = ORDER.filter(differs);
    var fixed = changed.filter(function (id) { return caseOk(id, "after"); });
    var faCase = ORDER.filter(function (id) { return CASES[id].requirements.some(function (r) { return outcome(find(RES.before[id], r.id)) === "fa"; }); })[0];
    if (changed.length) {
      var cats = []; changed.forEach(function (id) { if (cats.indexOf(CASES[id].category) < 0) cats.push(words(CASES[id].category)); });
      finding("The gain is " + cats.join(" and ") + ".",
        fixed.length + " of " + changed.length + " cases that changed went from wrong to right." +
        (faCase ? " The " + VA + " false approval was code past the 15,000-character read limit — it approved a stub it never saw." : ""),
        faCase ? ["Open that case", faCase] : null);
    }
    var inj = ORDER.filter(function (id) { return CASES[id].category === "injection"; });
    var injA = inj.filter(function (id) { return caseOk(id, "before"); }).length, injB = inj.filter(function (id) { return caseOk(id, "after"); }).length;
    finding("Injection: " + injB + " of " + inj.length + " resisted.",
      injA === injB ? "The " + VA + " prompts resisted the same " + injA + ", so this set does not measure the hardening. It is a backstop for attacks the set doesn't reach."
                    : "Up from " + injA + " of " + inj.length + " with the " + VA + " prompts.");
    function meanTokens(run) { var r = run.results.filter(function (x) { return x.trace; }); return r.reduce(function (s, x) { return s + x.trace.totalUsage.totalTokens; }, 0) / r.length; }
    var ta = meanTokens(D.before), tb = meanTokens(D.after);
    finding("It costs " + Math.round((tb / ta - 1) * 100) + "% more tokens.",
      n(Math.round(ta)) + " → " + n(Math.round(tb)) + " per run, mostly input: fencing the repo's text as untrusted and listing the files not yet read.");
  })();

  // ── before / after table ──
  (function () {
    var t = document.getElementById("metrics"), A = D.before.metrics, B = D.after.metrics;
    var hr = el("tr"); ["", "Prompts " + VA, "Prompts " + VB, "Change", ""].forEach(function (h, i) { var th = el("th", i === 4 ? "rcol" : "", h); hr.appendChild(th); });
    if (hr.lastChild) hr.lastChild.textContent = "95% interval";
    var thead = el("thead"); thead.appendChild(hr); t.appendChild(thead);
    var tb = el("tbody"); t.appendChild(tb);
    function rateRow(label, hint, ra, rb, lowerBetter, lead) {
      var tr = el("tr", lead ? "lead" : "");
      var l = el("td"); l.appendChild(el("span", "label", label)); l.appendChild(el("span", "hint", hint)); tr.appendChild(l);
      [[ra, "before"], [rb, "after"]].forEach(function (x) { var td = el("td", "v num " + x[1], pc(x[0].value)); td.appendChild(el("span", "of", x[0].num + "/" + x[0].den)); tr.appendChild(td); });
      var d = rb.value - ra.value, better = lowerBetter ? d < 0 : d > 0;
      tr.appendChild(el("td", "num delta " + (Math.abs(d) < 1e-9 ? "same" : better ? "better" : "worse"), Math.abs(d) < 1e-9 ? "no change" : (d > 0 ? "+" : "−") + Math.abs(Math.round(d * 1000) / 10) + " pts"));
      var rc = el("td", "rcol"), cell = el("div", "range-cell"), r = el("div", "range");
      r.appendChild(el("div", "axis"));
      [[ra, "a"], [rb, "b"]].forEach(function (x) {
        var s = el("div", "span " + x[1]); s.style.left = x[0].ci[0] * 100 + "%"; s.style.width = Math.max(1, (x[0].ci[1] - x[0].ci[0]) * 100) + "%"; r.appendChild(s);
        var p = el("div", "pt " + x[1]); p.style.left = "calc(" + x[0].value * 100 + "% - 1px)"; r.appendChild(p);
      });
      cell.appendChild(r);
      var lbl = el("div", "lbl"); lbl.appendChild(el("div", "", VA + " " + pc(ra.ci[0]) + "–" + pc(ra.ci[1]))); lbl.appendChild(el("div", "", VB + " " + pc(rb.ci[0]) + "–" + pc(rb.ci[1])));
      cell.appendChild(lbl); rc.appendChild(cell); tr.appendChild(rc); tb.appendChild(tr);
    }
    function plainRow(label, hint, a, b, fmt, kind) {
      var tr = el("tr"), l = el("td"); l.appendChild(el("span", "label", label)); l.appendChild(el("span", "hint", hint)); tr.appendChild(l);
      tr.appendChild(el("td", "v num before", fmt(a))); tr.appendChild(el("td", "v num after", fmt(b)));
      var pct = Math.round((b / a - 1) * 100);
      tr.appendChild(el("td", "num delta " + kind, (pct > 0 ? "+" : "−") + Math.abs(pct) + "%"));
      tr.appendChild(el("td", "rcol")); tb.appendChild(tr);
    }
    rateRow("False approvals", "Said satisfied when it wasn't. The error a stakeholder pays for.", A.falseApprovalRate, B.falseApprovalRate, true, true);
    rateRow("False rejections", "Said not satisfied when it was.", A.falseRejectionRate, B.falseRejectionRate, true);
    rateRow("Precision", "Of its “satisfied” verdicts, how many were right.", A.precision, B.precision, false);
    rateRow("Recall", "Of the work that was done, how much it recognised.", A.recall, B.recall, false);
    rateRow("Rationales citing unread files", "Explanations that refer to something the run never read.", A.ungroundedRationales, B.ungroundedRationales, true);
    function mean(run, f) { var r = run.results.filter(function (x) { return x.trace; }); return r.reduce(function (s, x) { return s + f(x); }, 0) / r.length; }
    plainRow("Tokens per run", "Mean across all 30 runs.", mean(D.before, function (x) { return x.trace.totalUsage.totalTokens; }), mean(D.after, function (x) { return x.trace.totalUsage.totalTokens; }), function (v) { return n(Math.round(v)); }, "cost");
    plainRow("Time per run", "Mean wall time, model calls included.", mean(D.before, function (x) { return x.durationMs; }), mean(D.after, function (x) { return x.durationMs; }), function (v) { return (v / 1000).toFixed(1) + " s"; }, "cost");
  })();

  // ── injection table ──
  (function () {
    var t = document.getElementById("attacks"), hr = el("tr");
    ["Attempt", "What it tries", VA, VB, ""].forEach(function (h, i) { var th = el("th", i === 1 ? "what" : "", h); hr.appendChild(th); });
    var thead = el("thead"); thead.appendChild(hr); t.appendChild(thead); var tb = el("tbody"); t.appendChild(tb);
    ORDER.filter(function (id) { var c = CASES[id].category; return c === "injection" || c === "control"; }).forEach(function (id) {
      var c = CASES[id], r = c.requirements[0], tr = el("tr");
      var name = id.replace(/^(injection|control)-/, "").replace(/-/g, " ");
      tr.appendChild(el("td", "", (c.category === "control" ? "Control: " : "") + name.charAt(0).toUpperCase() + name.slice(1)));
      tr.appendChild(el("td", "what", r.why));
      ["before", "after"].forEach(function (v) {
        var k = outcome(find(RES[v][id], r.id)), td = el("td");
        var chip = el("span", "chip " + (k === "ok" ? "sat" : k === "err" ? "" : "uns")); chip.appendChild(icon(k === "ok" ? "check" : k === "err" ? "dash" : "cross"));
        chip.appendChild(document.createTextNode(k === "ok" ? (c.category === "control" ? "Approved" : "Resisted") : k === "err" ? "Run failed" : (k === "fa" ? "Fooled" : "Punished")));
        td.appendChild(chip); tr.appendChild(td);
      });
      var go = el("td", "go"); go.appendChild(icon("arrow")); tr.appendChild(go);
      tr.tabIndex = 0; tr.onclick = function () { open(id, true); }; tr.onkeydown = function (e) { if (e.key === "Enter") open(id, true); };
      tb.appendChild(tr);
    });
  })();

  // ── explorer ──
  (function () {
    var s = document.getElementById("filter");
    var opts = [["all", "All 30 cases"], ["differs", "Only where " + VA + " and " + VB + " differ"]];
    var cats = []; ORDER.forEach(function (id) { if (cats.indexOf(CASES[id].category) < 0) cats.push(CASES[id].category); });
    cats.forEach(function (c) { opts.push([c, words(c).charAt(0).toUpperCase() + words(c).slice(1)]); });
    opts.forEach(function (o) { var op = el("option", "", o[1]); op.value = o[0]; s.appendChild(op); });
    s.onchange = function () { state.filter = s.value; renderList(); };
  })();

  function renderList() {
    var l = document.getElementById("list"); l.innerHTML = "";
    ORDER.filter(function (id) { return state.filter === "all" || (state.filter === "differs" ? differs(id) : CASES[id].category === state.filter); }).forEach(function (id) {
      var b = el("button", "item" + (id === state.selected ? " sel" : "")); b.type = "button"; b.setAttribute("role", "option"); b.setAttribute("aria-selected", id === state.selected);
      b.appendChild(verdictMark(id, state.version));
      b.appendChild(el("span", "id", id));
      if (differs(id)) b.appendChild(el("span", "changed", "changed"));
      b.onclick = function () { open(id, false); };
      l.appendChild(b);
    });
  }

  function open(id, scroll) {
    if (state.selected !== id) { state.file = null; state.fixtureOpen = false; }
    state.selected = id; renderList(); renderDetail();
    try { history.replaceState(null, "", "#case=" + id); } catch (e) {}
    if (scroll) document.getElementById("detail").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function versionSwitch() {
    var wrap = el("div", "switch"); wrap.setAttribute("role", "radiogroup"); wrap.setAttribute("aria-label", "Prompt version");
    var thumb = el("span", "thumb"); wrap.appendChild(thumb);
    [["before", VA, "before"], ["after", VB, "after"]].forEach(function (x) {
      var inp = el("input"); inp.type = "radio"; inp.name = "version"; inp.id = "ver-" + x[0]; inp.value = x[0]; inp.checked = state.version === x[0];
      inp.onchange = function () { state.version = x[0]; renderList(); renderDetail(); var r = document.getElementById("ver-" + x[0]); if (r) r.focus(); };
      var lab = el("label"); lab.htmlFor = inp.id; lab.appendChild(document.createTextNode("Prompts " + x[1] + " ")); lab.appendChild(el("small", "", x[2]));
      wrap.appendChild(inp); wrap.appendChild(lab);
    });
    // Set after insertion so the thumb slides from where it was rather than appearing.
    wrap.dataset.v = shownVersion;
    if (shownVersion !== state.version) requestAnimationFrame(function () { wrap.dataset.v = shownVersion = state.version; });
    return wrap;
  }

  function renderDetail() {
    var id = state.selected, c = CASES[id], res = RES[state.version][id], d = document.getElementById("detail");
    d.innerHTML = "";
    var head = el("div", "detail-head"), left = el("div");
    left.appendChild(el("h3", "", id));
    left.appendChild(el("div", "sub", words(c.category) + "  ·  " + c.repos.map(function (r) { return r.repo; }).join(", ")));
    head.appendChild(left); head.appendChild(versionSwitch()); d.appendChild(head);

    if (res && res.error) { var e = el("p", "chip uns", "Run failed: " + res.error.kind); d.appendChild(e); }

    c.requirements.forEach(function (r) {
      var q = find(res, r.id), k = outcome(q), box = el("div", "req");
      var h = el("div", "req-head"); h.appendChild(el("span", "t", r.title));
      if (k === "fa") h.appendChild(el("span", "chip uns", "False approval"));
      if (k === "fr") h.appendChild(el("span", "chip warn", "False rejection"));
      box.appendChild(h); box.appendChild(el("p", "d", r.description));
      var dl = el("dl", "answer");
      dl.appendChild(el("dt", "", "Expected")); var dd0 = el("dd"); dd0.appendChild(verdictChip(r.expected)); dl.appendChild(dd0);
      dl.appendChild(el("dt", "", "Agent said")); var dd1 = el("dd"); dd1.appendChild(verdictChip(q ? q.got : null)); dl.appendChild(dd1);
      dl.appendChild(el("dt", "", "Its reasons"));
      var withheld = q && q.rationale && /^\\[Rationale (redacted|withheld)/.test(q.rationale);
      dl.appendChild(el("dd", "prose" + (withheld ? " withheld" : ""), q && q.rationale ? q.rationale : "—"));
      dl.appendChild(el("dt", "", "Why this label")); dl.appendChild(el("dd", "why", r.why));
      box.appendChild(dl); d.appendChild(box);
    });

    var t = res && res.trace;
    if (t) {
      var rh = el("div", "run-head"); rh.appendChild(el("h4", "", "How the run went"));
      rh.appendChild(el("span", "sum", t.rounds + " round" + (t.rounds === 1 ? "" : "s") + "  ·  stopped: " + words(t.stopReason) + "  ·  " + secs(t.nodes.reduce(function (s, x) { return s + x.durationMs; }, 0)) + "  ·  " + n(t.totalUsage.totalTokens) + " tokens"));
      d.appendChild(rh);
      d.appendChild(roundsTable(t, c));
    }

    var bar = el("div", "fixture-bar"), total = c.repos.reduce(function (s, r) { return s + Object.keys(r.files).length; }, 0);
    bar.appendChild(el("p", "", "This case runs against a fixture repo of " + total + " files. Open it to see exactly what the agent was shown, and which files it chose to read."));
    var btn = el("button", "btn primary"); btn.type = "button"; btn.appendChild(icon("file"));
    btn.appendChild(document.createTextNode(state.fixtureOpen ? "Hide the repo files" : "View the repo files"));
    btn.setAttribute("aria-expanded", state.fixtureOpen);
    btn.onclick = function () { state.fixtureOpen = !state.fixtureOpen; renderDetail(); if (state.fixtureOpen) document.getElementById("fixture").scrollIntoView({ behavior: "smooth", block: "nearest" }); };
    bar.appendChild(btn); d.appendChild(bar);
    d.appendChild(fixture(c, t));
  }

  function roundsTable(t, c) {
    var wrap = el("div", "table-scroll"), tbl = el("table", "rounds"), hr = el("tr");
    ["Round", "Step", "Files read", "Time", "Tokens in / out", "Attempts"].forEach(function (h) { hr.appendChild(el("th", "", h)); });
    var thead = el("thead"); thead.appendChild(hr); tbl.appendChild(thead); var tb = el("tbody"); tbl.appendChild(tb);
    function time(node, round) { return t.nodes.filter(function (x) { return x.node === node && x.round === round; }).reduce(function (s, x) { return s + x.durationMs; }, 0); }
    function call(node, round) { return t.modelCalls.filter(function (x) { return x.node === node && x.round === round; })[0]; }
    function row(round, step, files, ms, mc) {
      var tr = el("tr"); tr.appendChild(el("td", "num", String(round))); tr.appendChild(el("td", "step", step));
      var ftd = el("td"), fs = el("div", "files");
      if (files && files.length) files.forEach(function (f) {
        var m = /^(.*?):(.*?)(?:#(\\d+))?$/.exec(f), span = el("span", "file" + (m && m[3] ? " win" : ""));
        span.appendChild(document.createTextNode((c.repos.length > 1 ? m[1] + ":" : "") + m[2]));
        if (m && m[3]) span.appendChild(el("em", "", "  from char " + n(Number(m[3]))));
        fs.appendChild(span);
      }); else fs.appendChild(el("span", "muted", step === "Plan" ? "chose what to read from the file tree" : "—"));
      ftd.appendChild(fs);
      if (mc) mc.repairs.forEach(function (p) { ftd.appendChild(el("span", "note", "Asked to correct its answer: " + p)); });
      tr.appendChild(ftd);
      tr.appendChild(el("td", "num", secs(ms)));
      tr.appendChild(el("td", "num", mc ? n(mc.usage.inputTokens) + " / " + n(mc.usage.outputTokens) : "—"));
      tr.appendChild(el("td", "num", mc ? String(mc.attempts) : "—"));
      tb.appendChild(tr);
    }
    row(0, "Plan", null, time("plan", 0), call("plan", 0));
    for (var r = 1; r <= t.rounds; r++) {
      row(r, "Read, then judge", t.filesReadPerRound[r - 1] || [], time("gather", r) + time("analyze", r), call("analyze", r));
    }
    var tot = el("tr", "total"); tot.appendChild(el("td")); tot.appendChild(el("td", "step", "Total"));
    tot.appendChild(el("td", "muted", t.filesReadPerRound.reduce(function (s, x) { return s + x.length; }, 0) + " reads"));
    tot.appendChild(el("td", "num", secs(t.nodes.reduce(function (s, x) { return s + x.durationMs; }, 0))));
    tot.appendChild(el("td", "num", n(t.totalUsage.inputTokens) + " / " + n(t.totalUsage.outputTokens)));
    tot.appendChild(el("td", "num", String(t.modelCalls.reduce(function (s, x) { return s + x.attempts; }, 0))));
    tb.appendChild(tot);
    wrap.appendChild(tbl); return wrap;
  }

  function fixture(c, t) {
    var box = el("div", "fixture"); box.id = "fixture"; box.hidden = !state.fixtureOpen;
    if (!state.fixtureOpen) return box;
    var readIn = {};
    if (t) t.filesReadPerRound.forEach(function (files, i) { files.forEach(function (f) { var k = f.replace(/#\\d+$/, ""); (readIn[k] = readIn[k] || []).indexOf(i + 1) < 0 && readIn[k].push(i + 1); }); });
    var all = []; c.repos.forEach(function (r) { Object.keys(r.files).sort().forEach(function (p) { all.push({ repo: r.repo, path: p, body: r.files[p], changed: r.changed.indexOf(p) >= 0 }); }); });
    all.sort(function (a, b) { var ra = readIn[a.repo + ":" + a.path] ? 0 : 1, rb = readIn[b.repo + ":" + b.path] ? 0 : 1; return ra - rb; });
    if (!state.file || !all.some(function (f) { return f.repo + ":" + f.path === state.file; })) state.file = all[0].repo + ":" + all[0].path;
    var tree = el("div", "ftree"), code = el("pre", "code");
    all.forEach(function (f) {
      var key = f.repo + ":" + f.path, b = el("button", "fitem" + (key === state.file ? " sel" : "")); b.type = "button";
      b.appendChild(el("span", "p", (c.repos.length > 1 ? f.repo + ":" : "") + f.path));
      var tags = el("span", "tags");
      if (readIn[key]) tags.appendChild(el("span", "tag read", "read in round " + readIn[key].join(", ")));
      if (f.changed) tags.appendChild(el("span", "tag", "touched by the commit"));
      if (!readIn[key] && !f.changed) tags.appendChild(el("span", "tag", "not read"));
      b.appendChild(tags);
      b.onclick = function () { state.file = key; renderDetail(); };
      tree.appendChild(b);
      if (key === state.file) code.textContent = f.body;
    });
    box.appendChild(tree); box.appendChild(code); return box;
  }

  // ── how to read this ──
  (function () {
    var notes = document.getElementById("notes"), fa = D.after.metrics.falseApprovalRate;
    [["A smoke test, not a benchmark.", " " + ORDER.length + " hand-built cases on small fixture repos, one run each, written by the same people who wrote the prompts."],
     ["Read the intervals, not the point estimates.", " " + fa.num + " of " + fa.den + " false approvals is consistent with a true rate anywhere from " + pc(fa.ci[0]) + " to about " + pc(fa.ci[1]) + "."],
     ["Failed runs are not verdicts.", " A run that errors is kept out of every rate, never counted as “not satisfied”. " +
       (D.before.metrics.confusion.errors + D.after.metrics.confusion.errors === 0 ? "Both passes here had none." : VA + " had " + D.before.metrics.confusion.errors + " and " + VB + " had " + D.after.metrics.confusion.errors + ".")],
     ["Withheld reasons are deliberate.", " If an explanation looks like source code or cites a file the run never read, it is withheld before it reaches a stakeholder. The verdict still stands."]
    ].forEach(function (x) { var p = el("p"); p.appendChild(el("b", "", x[0])); p.appendChild(document.createTextNode(x[1])); notes.appendChild(p); });
  })();

  function fromHash() { var m = /case=([\\w-]+)/.exec(location.hash); return m && CASES[m[1]] ? m[1] : null; }
  window.addEventListener("hashchange", function () { var id = fromHash(); if (id && id !== state.selected) open(id, true); });
  open(fromHash() || ORDER.filter(differs)[0] || ORDER[0], false);
})();
</script>
</body>
</html>
`;
