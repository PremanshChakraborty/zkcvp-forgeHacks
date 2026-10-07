/**
 * Manual end-to-end check for the LangGraph Evaluator.
 *
 * NOT a Vitest suite, and deliberately not named like one: it hits a live repo
 * and a live model, so collecting it would make `npm run test` fail for anyone
 * without both credentials. The collectable tests live beside it in `*.test.ts`
 * and need neither.
 *
 * It evaluates THIS repository, which makes the result checkable: the
 * requirements below are ones whose answers are already known, and two of them
 * are deliberately NOT satisfied. An evaluator that returns "satisfied" for
 * everything is not being rigorous, it is being agreeable — and that is the
 * failure mode this script exists to catch.
 *
 * Run with:
 *   npx tsx --env-file=packages/orchestrator/.env \
 *     packages/orchestrator/tests/integration-manual.ts
 */
import { EvaluationError } from "@zkcvp/contracts";

import { LangGraphEvaluator } from "../src/evaluator";
import { createGitHubReadTool } from "../../github/src/read-tool";

// ─── CONFIG (all overridable from the env file) ─────────────────

const GITHUB_TOKEN = process.env.GITHUB_TOKEN ?? "";

/** This repo. Private, so the token needs `repo` scope. */
const TEST_REPO = process.env.TEST_REPO ?? "Snehaty/Code-evaluator";

/**
 * Head of `feat/orchestrator-hardening`. The Evaluator reads GitHub rather than
 * your working tree, so whatever you point this at must be PUSHED — an
 * unpushed commit 404s.
 */
const TEST_COMMIT_SHA =
  process.env.TEST_COMMIT_SHA ?? "ea42e70b8e5214da7459382b30bc344d46077c28";

const MODEL_ID = process.env.EVAL_MODEL_ID ?? "gemini-3.5-flash";
const BUDGET_SECONDS = Number(process.env.EVAL_CEILING_SECONDS ?? 300);

// ─── REQUIREMENTS, WITH KNOWN ANSWERS ───────────────────────────

/**
 * `expected` is never shown to the model. It is only used to print a
 * comparison at the end, so a run can be judged at a glance instead of read.
 */
const REQUIREMENTS = [
  {
    requirementVersionId: "req-versioning",
    title: "Requirement versioning",
    description:
      "Editing a requirement's text must create a new version rather than changing the existing one, and a verification result must attach to the specific version it was evaluated against rather than to whatever the current text happens to be.",
    expected: "satisfied" as const,
    why: "requirement_versions plus the edit path that inserts a new row",
  },
  {
    requirementVersionId: "req-dual-auth",
    title: "Two separate sign-in flows",
    description:
      "The application must support two distinct kinds of user: developers who sign in with GitHub OAuth, and stakeholders who sign in by emailed magic link without any GitHub account. The two sessions must be independent of each other.",
    expected: "satisfied" as const,
    why: "two Auth.js instances with disjoint session cookies",
  },
  {
    requirementVersionId: "req-transparency-log",
    title: "Tamper-evident transparency log",
    description:
      "Every requirement edit, claim submission, and verification result must be appended to a tamper-evident log, and anyone must be able to verify an entry's inclusion against an independently published checkpoint without trusting the application operator.",
    expected: "not_satisfied" as const,
    why: "designed in the README, implemented nowhere",
  },
  {
    requirementVersionId: "req-claim-persistence",
    title: "Claim submission with stored results",
    description:
      "A developer must be able to submit a claim that pins one or more commit SHAs to a set of requirements, and the resulting verdict and evidence must be stored so they can be read back later.",
    expected: "not_satisfied" as const,
    why: "no claims, evaluations, or reports tables exist",
  },
];

// ─── RUN ────────────────────────────────────────────────────────

async function main() {
  console.log("=== ZKCVP Orchestrator — live end-to-end check ===\n");

  if (!GITHUB_TOKEN) {
    console.error("❌ GITHUB_TOKEN is not set.");
    console.error("   Fill in packages/orchestrator/.env and pass --env-file.");
    process.exit(1);
  }
  if (!process.env.GOOGLE_API_KEY && !process.env.GEMINI_API_KEY) {
    console.error("❌ GOOGLE_API_KEY (or GEMINI_API_KEY) is not set.");
    process.exit(1);
  }
  if (!/^[0-9a-f]{40}$/.test(TEST_COMMIT_SHA)) {
    console.error(`❌ TEST_COMMIT_SHA must be a full 40-character SHA, got: ${TEST_COMMIT_SHA}`);
    process.exit(1);
  }

  console.log(`Repo:   ${TEST_REPO}`);
  console.log(`Commit: ${TEST_COMMIT_SHA.substring(0, 12)}`);
  console.log(`Model:  ${MODEL_ID}`);
  console.log(`Budget: ${BUDGET_SECONDS}s\n`);

  const deadline = new Date(Date.now() + BUDGET_SECONDS * 1000);
  const github = createGitHubReadTool(GITHUB_TOKEN, { deadline });

  // Fail on the token or the SHA here rather than three nodes deep, where the
  // same problem reads like an evaluator bug.
  console.log("📂 Checking repo access...");
  try {
    const tree = await github.listTree(TEST_REPO, TEST_COMMIT_SHA);
    const files = tree.entries.filter((e) => e.type === "file").length;
    console.log(`   ${files} files${tree.truncated ? " (listing truncated by GitHub)" : ""}\n`);
  } catch (err) {
    console.error(`❌ Could not read the repo: ${(err as Error).message}`);
    console.error("   Check the token has `repo` scope and the SHA is pushed.");
    process.exit(1);
  }

  console.log("🚀 Running the evaluator...\n");
  const startTime = Date.now();

  const run = new LangGraphEvaluator().evaluateStream({
    claim: {
      claimId: "manual-check-001",
      repoCommits: [{ repo: TEST_REPO, commitSha: TEST_COMMIT_SHA }],
    },
    requirements: REQUIREMENTS.map(({ requirementVersionId, title, description }) => ({
      requirementVersionId,
      title,
      description,
    })),
    github,
    modelId: MODEL_ID,
    deadline,
  });

  let step = await run.next();
  while (!step.done) {
    const p = step.value;
    console.log(
      `   … ${p.node.padEnd(8)} round ${p.iteration}, ${p.filesGathered} file(s) read`,
    );
    step = await run.next();
  }
  const { evidence, report } = step.value;
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  // ─── Report ───
  console.log(`\n⏱️  Completed in ${elapsed}s\n`);
  console.log("═══ REPORT ═══════════════════════════════════");
  console.log(`Evaluation ID: ${report.evaluationId}`);
  console.log(`Model:         ${report.modelId}`);
  console.log(`Prompt:        ${report.promptTemplateVersion}`);
  console.log(`Created:       ${report.createdAt}\n`);

  let asExpected = 0;
  for (const req of REQUIREMENTS) {
    const got = report.perRequirement.find(
      (r) => r.requirementVersionId === req.requirementVersionId,
    );
    if (!got) {
      console.log(`⚠️  [${req.requirementVersionId}] NO VERDICT RETURNED`);
      continue;
    }
    const matched = got.verdict === req.expected;
    if (matched) asExpected++;
    console.log(
      `${matched ? "✅" : "🔶"} ${req.title}\n` +
        `   expected ${req.expected} (${req.why})\n` +
        `   got      ${got.verdict}\n` +
        `   rationale: ${got.rationale}\n`,
    );
  }

  console.log(
    `Matched expectation on ${asExpected} of ${REQUIREMENTS.length} requirements.`,
  );
  console.log(
    "A mismatch is not automatically a bug — read the rationale and decide\n" +
      "whether the evaluator saw something you did not.\n",
  );

  // ─── Evidence ───
  console.log("═══ EVIDENCE ═════════════════════════════════");
  console.log(`Tool calls:     ${evidence.toolCallLog.length}`);
  console.log(`Plan reasoning: ${evidence.planReasoning}`);
  if (evidence.droppedPaths.length > 0) {
    console.log(`Dropped paths:  ${evidence.droppedPaths.length}`);
    for (const d of evidence.droppedPaths) console.log(`  - ${d}`);
  }

  const byOutcome = new Map<string, number>();
  for (const call of evidence.toolCallLog) {
    byOutcome.set(call.outcome, (byOutcome.get(call.outcome) ?? 0) + 1);
  }
  console.log(
    `Outcomes:       ${[...byOutcome].map(([k, v]) => `${k}=${v}`).join(", ")}`,
  );

  console.log("\nFiles read:");
  for (const call of evidence.toolCallLog.filter((c) => c.tool === "readFile")) {
    console.log(`  [${call.outcome}] ${(call.args as { path: string }).path}`);
  }

  console.log(
    "\n✅ Run complete. Check that no rationale above contains source code —\n" +
      "   file paths and line ranges are fine, pasted code is not.",
  );
}

main().catch((err) => {
  // A failed evaluation is not a failed verdict, and the two print differently
  // on purpose — see PRODUCT.md principle 2.
  if (err instanceof EvaluationError) {
    console.error(`\n🛑 Evaluation did not complete — ${err.kind}`);
    console.error(`   ${err.message}`);
    if (err.retryAt) console.error(`   Retry after: ${err.retryAt}`);
    process.exit(2);
  }
  console.error("\n💥 Unexpected failure:", err);
  process.exit(1);
});
