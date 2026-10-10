/**
 * Eval runner: the whole graph, offline repos, the real model.
 *
 * NOT a Vitest suite, and kept out of `npm run test` by name like
 * tests/integration-manual.ts: it spends model quota and needs GOOGLE_API_KEY.
 * It needs no GitHub credentials — every repo is a fixture.
 *
 *   npm run eval                                  # every case, once
 *   npm run eval -- --only=injection,control      # some categories
 *   npm run eval -- --case=batch-auth             # one case
 *   npm run eval -- --repeat=3                    # measure run-to-run variance
 *   npm run eval -- --compare=v2,v3               # side-by-side + dashboard.html, no model calls
 *
 * Writes evals/results/<promptTemplateVersion>.json and .md. Runs are
 * sequential with a pause between them, because the binding constraint is the
 * provider's per-minute quota, not wall time.
 */
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { EvaluationError, type RunTrace } from "@zkcvp/contracts";

import { LangGraphEvaluator } from "../src/evaluator";
import { ungroundedCitations } from "../src/guardrails/grounding";
import { PROMPT_TEMPLATE_VERSION } from "../src/nodes/format";
import { CASES, type Category, type EvalCase } from "./cases";
import { renderDashboard } from "./dashboard";
import { FakeGitHubReadTool, fixtureSha } from "./fake-github";
import { pct, score, type Metrics, type Outcome, type ScoredRequirement } from "./metrics";

const RESULTS_DIR = fileURLToPath(new URL("./results/", import.meta.url));

export type RequirementResult = ScoredRequirement & { rationale?: string; why: string };

export type CaseResult = {
  caseId: string;
  category: Category;
  repetition: number;
  durationMs: number;
  /** Whole-case attempts, counting quota backoffs. */
  attempts: number;
  error?: { kind: string; message: string };
  trace?: RunTrace;
  /** Files the agent read, for the summary. Paths only, never contents. */
  filesRead?: string[];
  requirements: RequirementResult[];
};

export type RunFile = {
  promptTemplateVersion: string;
  modelId: string;
  gitSha: string;
  /** Uncommitted changes at run time — the SHA alone would not reproduce it. */
  dirty: boolean;
  startedAt: string;
  repeat: number;
  results: CaseResult[];
  metrics: Metrics;
};

// ─── args ───────────────────────────────────────────────────────

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.slice(name.length + 3);
}

const MODEL_ID = process.env.EVAL_MODEL_ID ?? "gemini-3.5-flash";
const BUDGET_SECONDS = Number(process.env.EVAL_CEILING_SECONDS ?? 300);
const DELAY_MS = Number(arg("delay-ms") ?? 4000);
const REPEAT = Number(arg("repeat") ?? 1);
/** Whole-case retries when the provider was the problem, not the case. */
const QUOTA_RETRIES = 4;
const QUOTA_BACKOFF_MS = 45_000;
/** Longer than this and the quota is a daily one: stop rather than wait. */
const MAX_QUOTA_WAIT_MS = 5 * 60_000;

/** "Please retry in 6h23m7.8s" / "retry in 27.8s" → ms, or null if absent. */
function retryDelayMs(message: string): number | null {
  const m = /retry in ((?:\d+h)?(?:\d+m)?(?:[\d.]+s)?)/i.exec(message);
  if (!m?.[1]) return null;
  const part = (unit: string) => Number(new RegExp(`([\\d.]+)${unit}`).exec(m[1]!)?.[1] ?? 0);
  return Math.round((part("h") * 3600 + part("m") * 60 + part("s")) * 1000);
}

class QuotaExhausted extends Error {}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ─── one case ───────────────────────────────────────────────────

async function runCase(c: EvalCase, repetition: number): Promise<CaseResult> {
  const started = Date.now();
  let attempts = 0;

  for (;;) {
    attempts++;
    const github = new FakeGitHubReadTool(c.repos);
    try {
      const { evidence, report } = await new LangGraphEvaluator().evaluate({
        claim: {
          claimId: `eval-${c.id}-${repetition}`,
          repoCommits: c.repos.map((r) => ({ repo: r.repo, commitSha: fixtureSha(r.repo) })),
        },
        requirements: c.requirements.map(({ id, title, description }) => ({
          requirementVersionId: id,
          title,
          description,
        })),
        github,
        modelId: MODEL_ID,
        deadline: new Date(Date.now() + BUDGET_SECONDS * 1000),
      });

      const trees = Object.fromEntries(
        await Promise.all(
          c.repos.map(async (r) => [r.repo, await github.listTree(r.repo, fixtureSha(r.repo))] as const),
        ),
      );
      const readKeys = evidence.trace?.filesReadPerRound.flat() ?? [];

      return {
        caseId: c.id,
        category: c.category,
        repetition,
        durationMs: Date.now() - started,
        attempts,
        trace: evidence.trace,
        filesRead: readKeys,
        requirements: c.requirements.map((req) => {
          const got = report.perRequirement.find((p) => p.requirementVersionId === req.id);
          return {
            caseId: c.id,
            category: c.category,
            requirementId: req.id,
            expected: req.expected,
            got: (got?.verdict ?? "error") as Outcome,
            rationale: got?.rationale,
            why: req.why,
            ungrounded: got
              ? ungroundedCitations(got.rationale, trees, readKeys).map((u) => `${u.citation} (${u.reason})`)
              : [],
          };
        }),
      };
    } catch (err) {
      const kind = err instanceof EvaluationError ? err.kind : "crash";
      const message = err instanceof Error ? err.message : String(err);
      const quota =
        kind === "model_unavailable" && /429|quota|rate|exhausted|503|overloaded/i.test(message);
      const metric = /Quota exceeded for metric: ([^,]+), limit: (\d+)/.exec(message);
      const retryIn = retryDelayMs(message);
      // A quota that resets in hours cannot be waited out inside a run.
      // Recording every remaining case as an error would produce a results
      // file that looks like a run and measures nothing, so the run stops.
      if (quota && retryIn !== null && retryIn > MAX_QUOTA_WAIT_MS) {
        throw new QuotaExhausted(message);
      }
      if (quota && attempts <= QUOTA_RETRIES) {
        // The provider says how long; trust it over a fixed guess. Per-minute
        // limits say tens of seconds.
        const wait = retryIn !== null ? retryIn + 2_000 : QUOTA_BACKOFF_MS;
        console.log(
          `   ⏳ ${metric ? `${metric[1]} (limit ${metric[2]})` : message.slice(0, 80)} — waiting ${Math.round(wait / 1000)}s`,
        );
        await sleep(wait);
        continue;
      }
      return {
        caseId: c.id,
        category: c.category,
        repetition,
        durationMs: Date.now() - started,
        attempts,
        error: { kind, message },
        requirements: c.requirements.map((req) => ({
          caseId: c.id,
          category: c.category,
          requirementId: req.id,
          expected: req.expected,
          got: "error",
          why: req.why,
          ungrounded: [],
        })),
      };
    }
  }
}

// ─── summary ────────────────────────────────────────────────────

const CAVEAT = `> **Read this as a smoke test, not a benchmark.** The set is small and hand-built,
> its fixtures are tiny, and every case was written by the same people who wrote the
> prompts. A 0% here means "no failure observed in this sample", not "cannot fail" —
> the confidence intervals say how wide the uncertainty really is.`;

function summarise(run: RunFile): string {
  const m = run.metrics;
  const lines: string[] = [];
  const traces = run.results.flatMap((r) => (r.trace ? [r.trace] : []));
  const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0);

  lines.push(`# Eval results — prompt ${run.promptTemplateVersion}`, "");
  lines.push(
    `Model \`${run.modelId}\` · commit \`${run.gitSha.slice(0, 10)}\`${run.dirty ? " (uncommitted changes)" : ""} · ${run.startedAt.slice(0, 10)} · ${run.results.length} runs, ${m.n} requirement verdicts${run.repeat > 1 ? ` (${run.repeat} repetitions)` : ""}`,
    "",
    CAVEAT,
    "",
    "## Headline",
    "",
    "| Metric | Value |",
    "|---|---|",
    `| **False-approval rate** (said satisfied, truth not) | **${pct(m.falseApprovalRate)}** |`,
    `| False-rejection rate (said not satisfied, truth satisfied) | ${pct(m.falseRejectionRate)} |`,
    `| Precision for "satisfied" | ${pct(m.precision)} |`,
    `| Recall for "satisfied" | ${pct(m.recall)} |`,
    `| Accuracy | ${pct(m.accuracy)} |`,
    `| Rationales citing a file the run never read | ${pct(m.ungroundedRationales)} |`,
    `| Runs that failed (excluded from every rate above) | ${m.confusion.errors} verdicts |`,
    "",
    "## By category",
    "",
    "| Category | Verdicts | Correct | False approvals | False rejections | Errors |",
    "|---|---|---|---|---|---|",
  );
  for (const [cat, b] of Object.entries(m.byCategory)) {
    lines.push(`| ${cat} | ${b.n} | ${b.correct} | ${b.fp} | ${b.fn} | ${b.errors} |`);
  }

  lines.push(
    "",
    "## Run behaviour",
    "",
    `- Mean wall time per run: ${(avg(run.results.map((r) => r.durationMs)) / 1000).toFixed(1)}s`,
    `- Mean tokens per run: ${avg(traces.map((t) => t.totalUsage.totalTokens))} (in ${avg(traces.map((t) => t.totalUsage.inputTokens))}, out ${avg(traces.map((t) => t.totalUsage.outputTokens))})`,
    `- Rounds: ${histogram(traces.map((t) => String(t.rounds)))}`,
    `- Stop reasons: ${histogram(traces.map((t) => t.stopReason))}`,
    `- Model repairs requested: ${traces.flatMap((t) => t.modelCalls.flatMap((c) => c.repairs)).length}`,
    `- Rationales redacted at FORMAT: ${histogram(traces.flatMap((t) => t.redactions.map((r) => r.reason))) || "none"}`,
    "",
    "## Every verdict",
    "",
    "| Case | Requirement | Expected | Got | Rounds | Stop | Tokens |",
    "|---|---|---|---|---|---|---|",
  );
  for (const r of run.results) {
    for (const q of r.requirements) {
      const mark = q.got === "error" ? "⚠️" : q.got === q.expected ? "✅" : q.got === "satisfied" ? "❌ FA" : "❌ FR";
      lines.push(
        `| ${r.caseId}${run.repeat > 1 ? ` #${r.repetition}` : ""} | ${q.requirementId} | ${q.expected} | ${mark} ${q.got} | ${r.trace?.rounds ?? "–"} | ${r.trace?.stopReason ?? r.error?.kind ?? "–"} | ${r.trace?.totalUsage.totalTokens ?? "–"} |`,
      );
    }
  }

  const misses = run.results.flatMap((r) =>
    r.requirements.filter((q) => q.got !== q.expected || q.ungrounded.length > 0).map((q) => ({ r, q })),
  );
  if (misses.length) {
    lines.push("", "## Misses, errors, and ungrounded citations", "");
    for (const { r, q } of misses) {
      lines.push(`### ${r.caseId} — ${q.requirementId}`, "");
      lines.push(`- Expected **${q.expected}** (${q.why}); got **${q.got}**`);
      if (r.error) lines.push(`- Error: \`${r.error.kind}\` — ${r.error.message.slice(0, 300)}`);
      if (r.filesRead) lines.push(`- Read: ${r.filesRead.map((f) => `\`${f}\``).join(", ")}`);
      if (q.ungrounded.length) lines.push(`- Ungrounded citations: ${q.ungrounded.map((u) => `\`${u}\``).join(", ")}`);
      if (q.rationale) lines.push(`- Rationale: ${q.rationale}`);
      lines.push("");
    }
  }
  return lines.join("\n") + "\n";
}

function histogram(xs: string[]): string {
  const counts = new Map<string, number>();
  for (const x of xs) counts.set(x, (counts.get(x) ?? 0) + 1);
  return [...counts].sort().map(([k, v]) => `${k}×${v}`).join(", ");
}

function compare(a: RunFile, b: RunFile): string {
  const lines: string[] = [];
  const row = (label: string, f: (m: Metrics) => string) =>
    lines.push(`| ${label} | ${f(a.metrics)} | ${f(b.metrics)} |`);

  lines.push(
    `# Prompt ${a.promptTemplateVersion} vs ${b.promptTemplateVersion}`,
    "",
    `Same cases, same model (\`${a.modelId}\` / \`${b.modelId}\`). Before: commit \`${a.gitSha.slice(0, 10)}\`; after: \`${b.gitSha.slice(0, 10)}\`${b.dirty ? " (uncommitted)" : ""}.`,
    "",
    CAVEAT,
    "",
    `| | ${a.promptTemplateVersion} (before) | ${b.promptTemplateVersion} (after) |`,
    "|---|---|---|",
  );
  row("**False-approval rate**", (m) => `**${pct(m.falseApprovalRate)}**`);
  row("False-rejection rate", (m) => pct(m.falseRejectionRate));
  row("Precision (satisfied)", (m) => pct(m.precision));
  row("Recall (satisfied)", (m) => pct(m.recall));
  row("Ungrounded rationales", (m) => pct(m.ungroundedRationales));
  row("Failed-run verdicts", (m) => String(m.confusion.errors));

  lines.push("", "## By category (correct / verdicts)", "", `| Category | ${a.promptTemplateVersion} | ${b.promptTemplateVersion} |`, "|---|---|---|");
  const cats = new Set([...Object.keys(a.metrics.byCategory), ...Object.keys(b.metrics.byCategory)]);
  for (const c of cats) {
    const fmt = (m: Metrics) => {
      const x = m.byCategory[c];
      return x ? `${x.correct}/${x.n}${x.fp ? ` · ${x.fp} FA` : ""}${x.fn ? ` · ${x.fn} FR` : ""}${x.errors ? ` · ${x.errors} err` : ""}` : "–";
    };
    lines.push(`| ${c} | ${fmt(a.metrics)} | ${fmt(b.metrics)} |`);
  }

  lines.push("", "## Injection and control cases, verdict by verdict", "", `| Case | Expected | ${a.promptTemplateVersion} | ${b.promptTemplateVersion} |`, "|---|---|---|---|");
  const verdicts = (run: RunFile) =>
    new Map(
      run.results
        .flatMap((r) => r.requirements)
        .filter((q) => q.category === "injection" || q.category === "control")
        .map((q) => [`${q.caseId}/${q.requirementId}`, q] as const),
    );
  const va = verdicts(a);
  const vb = verdicts(b);
  for (const key of new Set([...va.keys(), ...vb.keys()])) {
    const qa = va.get(key);
    const qb = vb.get(key);
    const show = (q?: ScoredRequirement) =>
      !q ? "–" : q.got === q.expected ? `✅ ${q.got}` : q.got === "error" ? "⚠️ error" : `❌ ${q.got}`;
    lines.push(`| ${key.split("/")[0]} | ${(qa ?? qb)!.expected} | ${show(qa)} | ${show(qb)} |`);
  }
  return lines.join("\n") + "\n";
}

// ─── main ───────────────────────────────────────────────────────

function load(version: string): RunFile {
  return JSON.parse(readFileSync(`${RESULTS_DIR}${version}.json`, "utf8")) as RunFile;
}

async function main() {
  mkdirSync(RESULTS_DIR, { recursive: true });

  const cmp = arg("compare");
  if (cmp) {
    const [a, b] = cmp.split(",");
    const before = load(a!);
    const after = load(b!);
    const out = compare(before, after);
    writeFileSync(`${RESULTS_DIR}comparison.md`, out);
    writeFileSync(`${RESULTS_DIR}dashboard.html`, renderDashboard(before, after, CASES));
    console.log(out);
    console.log(`Wrote evals/results/comparison.md and dashboard.html`);
    return;
  }

  if (!process.env.GOOGLE_API_KEY && !process.env.GEMINI_API_KEY) {
    console.error("GOOGLE_API_KEY is not set. Fill in packages/orchestrator/.env.");
    process.exit(1);
  }

  const only = arg("only")?.split(",");
  const one = arg("case");
  const cases = CASES.filter(
    (c) => (!only || only.includes(c.category)) && (!one || c.id === one),
  );
  if (cases.length === 0) {
    console.error("No cases match.");
    process.exit(1);
  }

  const sha = execSync("git rev-parse HEAD").toString().trim();
  const dirty = execSync("git status --porcelain").toString().trim().length > 0;
  const results: CaseResult[] = [];

  console.log(`Model ${MODEL_ID} · ${cases.length} cases × ${REPEAT} · ${DELAY_MS}ms between runs\n`);

  for (let rep = 1; rep <= REPEAT; rep++) {
    for (const c of cases) {
      if (results.length > 0) await sleep(DELAY_MS);
      const r = await runCase(c, rep);
      results.push(r);
      const marks = r.requirements
        .map((q) => (q.got === "error" ? "⚠️" : q.got === q.expected ? "✅" : "❌"))
        .join("");
      console.log(
        `${marks} ${c.id}${REPEAT > 1 ? ` #${rep}` : ""}  ${(r.durationMs / 1000).toFixed(1)}s` +
          (r.trace ? `  rounds=${r.trace.rounds} stop=${r.trace.stopReason} tokens=${r.trace.totalUsage.totalTokens}` : "") +
          (r.error ? `  ${r.error.kind}: ${r.error.message.slice(0, 120)}` : ""),
      );
    }
  }

  const version = PROMPT_TEMPLATE_VERSION;
  const partial = only || one;
  const name = partial ? `${version}-partial` : version;
  const run: RunFile = {
    promptTemplateVersion: version,
    modelId: MODEL_ID,
    gitSha: sha,
    dirty,
    startedAt: new Date().toISOString(),
    repeat: REPEAT,
    results,
    metrics: score(results.flatMap((r) => r.requirements)),
  };
  writeFileSync(`${RESULTS_DIR}${name}.json`, JSON.stringify(run, null, 2) + "\n");
  writeFileSync(`${RESULTS_DIR}${name}.md`, summarise(run));
  console.log(`\nFalse-approval rate: ${pct(run.metrics.falseApprovalRate)}`);
  console.log(`Wrote evals/results/${name}.json and .md`);
}

main().catch((err) => {
  if (err instanceof QuotaExhausted) {
    const wait = /retry in ([\dhms.]+)/i.exec(err.message)?.[1];
    console.error(
      `\nStopped: the model's daily quota is exhausted${wait ? ` (resets in ${wait})` : ""}. No results were written.`,
    );
    process.exit(3);
  }
  console.error(err);
  process.exit(1);
});
