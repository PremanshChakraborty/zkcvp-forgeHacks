# Claim Submission & Verification Invocation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a developer claim that pinned commits satisfy pinned requirement versions, run the Evaluator inside that request while streaming its progress to the browser, and record the verdicts where the stakeholder reads them.

**Architecture:** Five new tables. Two transactions with the evaluation between them: the claim is written before the run, the evaluation and verdicts and status write-back only after both artifacts exist. The submission endpoint streams newline-delimited JSON — progress frames followed by exactly one terminal frame — because the HTTP status code is spent before the outcome is known.

**Tech Stack:** Drizzle over `pg`, Next.js 15.5.22 route handlers with `ReadableStream`, LangGraph via `@zkcvp/orchestrator`, Vitest against real Postgres, Ledger design system.

**Spec:** `docs/plans/03-claim-submission.md`

**Depends on:** `docs/superpowers/plans/2026-09-11-repo-attachment.md` must be complete. Task 1 of that plan (the streaming spike) gates this entire plan — if streaming was found to buffer, stop and rewrite this plan for a buffered response before starting.

## Global Constraints

- **A verdict is a `done` frame. A failure is a `failed` frame. Never both, never neither.** This replaces "a verdict is a 200, a failure never is" for this endpoint only. The rule it protects is unchanged: an infrastructure failure must never reach a stakeholder as "Not satisfied".
- **No failure writes a status.** If the run throws, the second transaction never opens and every requirement version keeps exactly the status it had.
- **Evidence is stored and hashed, never returned.** No endpoint, page, or response body includes an `EvidenceBundle`.
- **The string `eval_failed` never reaches a screen.** `StatusBadge` renders it "Not satisfied". `eval_failed` means the Evaluator returned *not satisfied* — a legitimate verdict, not a malfunction.
- **A rationale cites file paths and line ranges, never source code.** The Evaluator enforces this at generation time; no display-layer filtering is added.
- **Progress frames are transport.** Never persisted, never shown to a stakeholder.
- **The ceiling is read from `EVAL_CEILING_SECONDS`, never hardcoded** — including in UI copy. Default 300; set to 60 on Vercel, whose function limit is 60s on the current plan.
- **No `export const runtime = 'edge'`, no `@vercel/*` import** in `apps/web`.
- **Dates are absolute, never relative.** Language stays relationship-neutral.
- **Commit messages end at the body.** No `Co-Authored-By`, no session trailer.
- Run `npm run test` without a pipe and read the exit code. Never run two suites at once.

---

## Progress

**Task 1 is built and merged** (`203c111`), reviewed clean with no findings. Start at Task 2.

The suite is green as of `95f333b` — 29 files, 202 tests, `npm run verify` exit 0. Any failure you
see now is real. If database tests start timing out at ~5000ms again, read the `testTimeout` note in
`vitest.config.ts` before assuming pooler exhaustion: the first test in a database file pays a
one-time ~4.8s schema build, that cost grows with every migration, and the failure signature is
almost indistinguishable from connection errors.

## Corrections applied before execution

A pre-flight scan of this plan found defects in its own code. They are recorded here rather than
fixed inline, so the task text still matches what was reviewed and the correction stays visible as a
correction. **Apply these — they override the task text.**

| # | Task | Correction |
|---|---|---|
| C1 | 5 | The file list omits `packages/design-system-ledger/components/index.ts`. `EvaluationPhase` must be added to its type re-export block, or Task 6 cannot compile — it imports that type from `@zkcvp/design-system-ledger`. |
| C3 | 3 | The 409 test writes `createdBy: requirement.createdBy`. `createRequirement` returns `RequirementView` (`apps/web/lib/requirements/service.ts:14`), which has no `createdBy`. Seed the v2 row with the stakeholder id the fixture already holds. |
| C4 | 3 | Same test: delete the no-op `db.update(requirementVersions).set({})`, and import `requirements` at module top rather than via a dynamic `await import("@zkcvp/db")`. |
| C5 | 3 | The "re-evaluation is symmetric" test gives `evidence.evaluationId` and `report.evaluationId` *different* `crypto.randomUUID()` values. The contract says both carry the same value, minted once per `evaluate()`. It passes either way because `recordEvaluation` keys off the report — so it silently teaches the contract wrong. Mint one id per iteration and use it for both. |
| C6 | 4 | `z.string().uuid()` → `z.uuid()`. This app is on Zod 4 (`zod ^4.4.3`), where the top-level form is the idiom. |
| C7 | 8 | Step 1 describes its second test in prose instead of giving code. Accepted as-is: the fixture it points at (`createClaim` then `recordEvaluation`, twice) is fully written out in Task 3 and named explicitly, so there is working code to copy. |
| C8 | 3 | Drop the `!` in `requirement.currentVersionId!` — `RequirementView.currentVersionId` is `string`, not nullable. |

Two corrections are already discharged and are listed only so they are not re-applied: **C2** (every
`developers` fixture insert must supply `displayName`, which is `NOT NULL` with no default) was
applied in Task 1 and still binds Task 3; **C9** (a foreign-key violation on `detachRepo`'s undo,
made reachable by `claim_repos`' `ON DELETE RESTRICT`) shipped with Task 1 as `isForeignKeyViolation`
plus a 409 translation.

Two facts changed under this plan while Task 1 was being built:

- **`project_repos` gained a `default_branch` column** (`NOT NULL`, migration `0002`), carried on
  `AttachedRepo`. Any `project_repos` fixture must now supply it. Task 6 should read it straight off
  the `AttachedRepo` to pre-select a branch — that is what `docs/plans/02-repo-attachment.md` asks
  for and what its Recorded deviations section defers to this screen.
- **A directly-inserted `projects` row creates no membership.** Authorization reads
  `project_stakeholders` / `project_developers`, never `projects.created_by`. A fixture whose test
  needs a stakeholder member must insert that row explicitly.

---

### Task 1: The five claim tables

**Files:**
- Create: `packages/db/src/schema/claims.ts`
- Modify: `packages/db/src/schema/index.ts`
- Create (generated): `packages/db/migrations/0002_*.sql`
- Test: `apps/web/tests/claims/schema.test.ts`

**Interfaces:**
- Consumes: `projects`, `developers`, `requirementVersions`, `projectRepos` from `@zkcvp/db/schema`; `VERDICTS` from `@zkcvp/contracts`
- Produces: `claims`, `claimRepos`, `claimRequirementVersions`, `evaluations`, `verdicts` tables and the `verdict` pgEnum

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/tests/claims/schema.test.ts
import { describe, expect, it } from "vitest";
import { withTestSchema } from "@zkcvp/db/testing";
import {
  claimRepos,
  claims,
  developers,
  projectRepos,
  projects,
  stakeholders,
  type Db,
} from "@zkcvp/db";
import { isUniqueViolation } from "../../lib/api/errors";

async function seed(db: Db) {
  const [s] = await db
    .insert(stakeholders)
    .values({ email: "s@example.com", displayName: "S" })
    .returning();
  const [p] = await db.insert(projects).values({ name: "P", createdBy: s.id }).returning();
  const [d] = await db
    .insert(developers)
    .values({ githubUserId: "1", githubUsername: "dev" })
    .returning();
  const [repo] = await db
    .insert(projectRepos)
    .values({
      projectId: p.id,
      githubRepoId: "1296269",
      fullName: "octocat/Hello-World",
      addedBy: d.id,
    })
    .returning();
  const [claim] = await db
    .insert(claims)
    .values({ projectId: p.id, submittedBy: d.id })
    .returning();
  return { p, d, repo, claim };
}

describe("claim_repos", () => {
  it("accepts one commit for a repo", async () => {
    await withTestSchema(async (db) => {
      const { repo, claim } = await seed(db);
      const [row] = await db
        .insert(claimRepos)
        .values({ claimId: claim.id, projectRepoId: repo.id, commitSha: "a".repeat(40) })
        .returning();
      expect(row.commitSha).toHaveLength(40);
    });
  });

  it("rejects a second commit for the same repo in one claim", async () => {
    await withTestSchema(async (db) => {
      const { repo, claim } = await seed(db);
      await db
        .insert(claimRepos)
        .values({ claimId: claim.id, projectRepoId: repo.id, commitSha: "a".repeat(40) });

      const err = await db
        .insert(claimRepos)
        .values({ claimId: claim.id, projectRepoId: repo.id, commitSha: "b".repeat(40) })
        .catch((e: unknown) => e);

      expect(isUniqueViolation(err)).toBe(true);
    });
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

```bash
npx vitest run apps/web/tests/claims/schema.test.ts
```

Expected: FAIL — `claims` is not exported from `@zkcvp/db`.

- [ ] **Step 3: Write the schema module**

```ts
// packages/db/src/schema/claims.ts
import { VERDICTS } from "@zkcvp/contracts";
import { jsonb, pgEnum, pgTable, primaryKey, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { developers } from "./identity";
import { projects } from "./projects";
import { projectRepos } from "./repos";
import { requirementVersions } from "./requirements";

export const verdictEnum = pgEnum("verdict", VERDICTS);

/**
 * A developer's assertion that specific commits satisfy specific requirement
 * versions. Written BEFORE the evaluation runs, because the Transparency Log
 * treats "claim submitted" as an event distinct from "verification result".
 *
 * A claim with no evaluation row is an abandoned submission, not a status. No
 * requirement version is left mid-flight by one.
 */
export const claims = pgTable("claims", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id),
  submittedBy: uuid("submitted_by")
    .notNull()
    .references(() => developers.id),
  submittedAt: timestamp("submitted_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const claimRepos = pgTable(
  "claim_repos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    claimId: uuid("claim_id")
      .notNull()
      .references(() => claims.id),
    /**
     * References the ATTACHMENT row, not a repo name, so `github_repo_id` stays
     * the join key. It cannot dangle: attachment is permanent past a 60-second
     * undo window, so `restrict` only ever fires inside that window.
     */
    projectRepoId: uuid("project_repo_id")
      .notNull()
      .references(() => projectRepos.id, { onDelete: "restrict" }),
    commitSha: text("commit_sha").notNull(),
  },
  /**
   * The database's form of the Evaluator's at-most-one-commit-per-repo rule. A
   * commit is a full snapshot and `repo` is what maps a planned file path back
   * to a commit — two commits of one repo would read the same path at the wrong
   * commit and succeed silently.
   */
  (t) => [unique().on(t.claimId, t.projectRepoId)],
);

export const claimRequirementVersions = pgTable(
  "claim_requirement_versions",
  {
    claimId: uuid("claim_id")
      .notNull()
      .references(() => claims.id),
    requirementVersionId: uuid("requirement_version_id")
      .notNull()
      .references(() => requirementVersions.id),
  },
  (t) => [primaryKey({ columns: [t.claimId, t.requirementVersionId] })],
);

/**
 * One execution of the Evaluator. Written only when BOTH artifacts exist — a
 * failed run leaves no row here and no status change anywhere.
 */
export const evaluations = pgTable("evaluations", {
  /** The Evaluator's own `evaluationId`, not a fresh one. */
  id: uuid("id").primaryKey(),
  claimId: uuid("claim_id")
    .notNull()
    .references(() => claims.id),
  /** The model that actually produced these verdicts. */
  modelId: text("model_id").notNull(),
  promptTemplateVersion: text("prompt_template_version").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  /**
   * The full EvidenceBundle, containing verbatim private source. NEVER returned
   * by any endpoint or rendered on any page in this phase.
   */
  evidence: jsonb("evidence").notNull(),
  /**
   * SHA-256 over canonical JSON of `evidence`. No consumer yet — this is what
   * the Transparency Log anchors, and what makes integrity checkable WITHOUT
   * disclosing contents.
   */
  evidenceHash: text("evidence_hash").notNull(),
});

export const verdicts = pgTable(
  "verdicts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    evaluationId: uuid("evaluation_id")
      .notNull()
      .references(() => evaluations.id),
    requirementVersionId: uuid("requirement_version_id")
      .notNull()
      .references(() => requirementVersions.id),
    verdict: verdictEnum("verdict").notNull(),
    /** Prose. Cites file paths and line ranges; never contains source code. */
    rationale: text("rationale").notNull(),
  },
  (t) => [unique().on(t.evaluationId, t.requirementVersionId)],
);
```

- [ ] **Step 4: Export it**

Add to `packages/db/src/schema/index.ts`:

```ts
export * from "./claims";
```

- [ ] **Step 5: Add the lookup index**

`verdicts` is read by requirement version on every requirement page view. Drizzle can declare it alongside the unique constraint — add `index` to the `drizzle-orm/pg-core` import and extend the `verdicts` table's second argument:

```ts
  (t) => [
    unique().on(t.evaluationId, t.requirementVersionId),
    index("verdicts_requirement_version_idx").on(t.requirementVersionId),
  ],
```

- [ ] **Step 6: Generate the migration and read it**

```bash
npm run generate -w @zkcvp/db
```

Open the generated SQL. Confirm: five `CREATE TABLE`s, one `CREATE TYPE ... AS ENUM ('satisfied', 'not_satisfied')`, the `claim_repos` unique constraint, the composite primary key on `claim_requirement_versions`, `ON DELETE RESTRICT` on `claim_repos.project_repo_id`, and one plain `CREATE INDEX`. It must **not** contain `CREATE INDEX CONCURRENTLY` — the harness runs the migration as one multi-statement query in an implicit transaction.

- [ ] **Step 7: Run the tests to verify they pass**

```bash
npx vitest run apps/web/tests/claims/schema.test.ts
```

Expected: PASS, 2 tests.

- [ ] **Step 8: Commit**

```bash
git add packages/db/src/schema/claims.ts packages/db/src/schema/index.ts packages/db/migrations apps/web/tests/claims/schema.test.ts
git commit -m "feat(db): claims, evaluations, and verdicts"
```

---

### Task 2: The frame protocol

Pure functions, no HTTP, no database. The encoder is used by the route, the decoder by the browser — and the decoder is the tricky half, because a network chunk can split a JSON line anywhere.

**Files:**
- Create: `apps/web/lib/claims/frames.ts`
- Test: `apps/web/tests/claims/frames.test.ts`

**Interfaces:**
- Consumes: `EvaluationErrorKind` from `@zkcvp/contracts`
- Produces:
  - `type ClaimPhase = "plan" | "gather" | "analyze" | "format"`
  - `type ClaimFrame` (the three-member union in the spec)
  - `encodeFrame(frame: ClaimFrame): string`
  - `decodeFrames(buffer: string): { frames: ClaimFrame[]; rest: string }`
  - `isTerminal(frame: ClaimFrame): frame is Extract<ClaimFrame, { t: "done" | "failed" }>`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/tests/claims/frames.test.ts
import { describe, expect, it } from "vitest";
import {
  decodeFrames,
  encodeFrame,
  isTerminal,
  type ClaimFrame,
} from "../../lib/claims/frames";

const progress: ClaimFrame = { t: "progress", phase: "gather", filesRead: 12, round: 1 };

describe("encodeFrame", () => {
  it("emits exactly one newline-terminated line", () => {
    const line = encodeFrame(progress);
    expect(line.endsWith("\n")).toBe(true);
    expect(line.trimEnd().split("\n")).toHaveLength(1);
  });
});

describe("decodeFrames", () => {
  it("reads whole frames and keeps the partial tail", () => {
    const buffer = encodeFrame(progress) + '{"t":"progress","phase":"ana';
    const { frames, rest } = decodeFrames(buffer);
    expect(frames).toEqual([progress]);
    expect(rest).toBe('{"t":"progress","phase":"ana');
  });

  it("reassembles a frame split across two chunks", () => {
    const whole = encodeFrame(progress);
    const first = decodeFrames(whole.slice(0, 10));
    expect(first.frames).toEqual([]);
    const second = decodeFrames(first.rest + whole.slice(10));
    expect(second.frames).toEqual([progress]);
    expect(second.rest).toBe("");
  });

  it("reads several frames from one chunk", () => {
    const done: ClaimFrame = { t: "done", claimId: "c1", evaluationId: "e1" };
    const { frames } = decodeFrames(encodeFrame(progress) + encodeFrame(done));
    expect(frames).toHaveLength(2);
    expect(frames[1]).toEqual(done);
  });
});

describe("isTerminal", () => {
  /**
   * The invariant this whole protocol exists to hold: a failure must be
   * structurally impossible to read as a completed evaluation. If this ever
   * passes for a `failed` frame, a rate limit can reach a stakeholder as
   * "Not satisfied".
   */
  it("separates done and failed from progress, and never conflates them", () => {
    const failed: ClaimFrame = {
      t: "failed",
      kind: "rate_limited",
      status: 429,
      message: "GitHub rate limit",
      retryAt: "2026-09-11T12:04:00Z",
    };
    const done: ClaimFrame = { t: "done", claimId: "c1", evaluationId: "e1" };

    expect(isTerminal(progress)).toBe(false);
    expect(isTerminal(failed)).toBe(true);
    expect(isTerminal(done)).toBe(true);
    expect(failed.t === "done").toBe(false);
    expect("claimId" in failed).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

```bash
npx vitest run apps/web/tests/claims/frames.test.ts
```

Expected: FAIL — cannot resolve `../../lib/claims/frames`.

- [ ] **Step 3: Write the protocol**

```ts
// apps/web/lib/claims/frames.ts
import type { EvaluationErrorKind } from "@zkcvp/contracts";

/** The Evaluator's graph nodes, in the order a run first reaches them. */
export type ClaimPhase = "plan" | "gather" | "analyze" | "format";

/**
 * The wire protocol for a claim submission.
 *
 * Streaming spends the HTTP status code before the outcome is known, so the
 * terminal FRAME carries the outcome instead of the status line:
 *
 *     A verdict is a `done` frame. A failure is a `failed` frame.
 *     Never both, never neither.
 *
 * `done` and `failed` are structurally different objects, which is what makes
 * an infrastructure failure impossible to read as a completed evaluation that
 * returned "not satisfied". `failed.status` carries the code the response
 * would have had, so a client can still treat a rate limit as a rate limit.
 */
export type ClaimFrame =
  | { t: "progress"; phase: ClaimPhase; filesRead: number; round: number }
  | { t: "done"; claimId: string; evaluationId: string }
  | {
      t: "failed";
      kind: EvaluationErrorKind;
      status: number;
      message: string;
      retryAt?: string;
    };

export function encodeFrame(frame: ClaimFrame): string {
  return JSON.stringify(frame) + "\n";
}

/**
 * Reads whole frames out of a buffer, returning the unterminated tail.
 *
 * A network chunk can split a line anywhere, so the caller keeps `rest` and
 * prepends it to the next chunk. Parsing eagerly on chunk boundaries would
 * throw on a half-written frame roughly whenever a run got interesting.
 */
export function decodeFrames(buffer: string): {
  frames: ClaimFrame[];
  rest: string;
} {
  const lines = buffer.split("\n");
  const rest = lines.pop() ?? "";
  const frames = lines
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line) as ClaimFrame);
  return { frames, rest };
}

export function isTerminal(
  frame: ClaimFrame,
): frame is Extract<ClaimFrame, { t: "done" | "failed" }> {
  return frame.t === "done" || frame.t === "failed";
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run apps/web/tests/claims/frames.test.ts
```

Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/claims/frames.ts apps/web/tests/claims/frames.test.ts
git commit -m "feat(web): NDJSON frame protocol for claim submission"
```

---

### Task 3: The claims service — two transactions, and nothing between them

**Files:**
- Create: `apps/web/lib/claims/service.ts`
- Test: `apps/web/tests/claims/service.test.ts`

**Interfaces:**
- Consumes: `assertDeveloperMember` from `../repos/service`; `conflict`, `notFound` from `../api/errors`; `Report`, `EvidenceBundle` from `@zkcvp/contracts`
- Produces:
  - `type NewClaim = { claimId: string; repoCommits: { repo: string; commitSha: string }[]; requirements: { requirementVersionId: string; title: string; description: string }[] }`
  - `createClaim(db, session, projectId, input): Promise<NewClaim>` where `input = { requirementVersionIds: string[]; repos: { projectRepoId: string; commitSha: string }[] }`
  - `recordEvaluation(db, claimId, artifacts): Promise<void>` where `artifacts = { evidence: EvidenceBundle; report: Report }`
  - `evidenceHash(evidence: EvidenceBundle): string`
  - `getClaim(db, session, claimId): Promise<ClaimDetail>`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/tests/claims/service.test.ts
import { describe, expect, it } from "vitest";
import { withTestSchema } from "@zkcvp/db/testing";
import { eq } from "drizzle-orm";
import {
  developers,
  evaluations,
  projectDevelopers,
  projectRepos,
  projects,
  requirementVersions,
  stakeholders,
  verdicts,
  type Db,
} from "@zkcvp/db";
import type { EvidenceBundle, Report } from "@zkcvp/contracts";
import { ServiceError } from "../../lib/api/errors";
import { createRequirement } from "../../lib/requirements/service";
import { createClaim, evidenceHash, recordEvaluation } from "../../lib/claims/service";

async function fixture(db: Db) {
  const [s] = await db
    .insert(stakeholders)
    .values({ email: "s@example.com", displayName: "S" })
    .returning();
  const [project] = await db
    .insert(projects)
    .values({ name: "P", createdBy: s.id })
    .returning();
  const [dev] = await db
    .insert(developers)
    .values({ githubUserId: "77", githubUsername: "mira" })
    .returning();
  await db
    .insert(projectDevelopers)
    .values({ projectId: project.id, developerId: dev.id, addedBy: s.id });
  const [repo] = await db
    .insert(projectRepos)
    .values({
      projectId: project.id,
      githubRepoId: "1296269",
      fullName: "octocat/Hello-World",
      addedBy: dev.id,
    })
    .returning();

  const shSession = { kind: "stakeholder" as const, stakeholderId: s.id };
  const requirement = await createRequirement(db, shSession, project.id, {
    title: "OAuth login works",
    description: "A developer can sign in with GitHub.",
  });

  return {
    project,
    repo,
    requirement,
    devSession: {
      kind: "developer" as const,
      developerId: dev.id,
      githubAccessToken: "gho_token",
    },
    shSession,
  };
}

const sha = "a".repeat(40);

describe("createClaim", () => {
  it("returns Evaluator input with the repo's full name and pinned sha", async () => {
    await withTestSchema(async (db) => {
      const { project, repo, requirement, devSession } = await fixture(db);

      const claim = await createClaim(db, devSession, project.id, {
        requirementVersionIds: [requirement.currentVersionId!],
        repos: [{ projectRepoId: repo.id, commitSha: sha }],
      });

      expect(claim.repoCommits).toEqual([
        { repo: "octocat/Hello-World", commitSha: sha },
      ]);
      expect(claim.requirements[0].title).toBe("OAuth login works");
    });
  });

  it("409s when a requirement version is no longer current", async () => {
    await withTestSchema(async (db) => {
      const { project, repo, requirement, devSession } = await fixture(db);
      const stale = requirement.currentVersionId!;
      // Simulate a stakeholder editing mid-compose: a new current version.
      const [next] = await db
        .insert(requirementVersions)
        .values({
          requirementId: requirement.id,
          versionNumber: 2,
          title: "OAuth login works",
          description: "Changed while the developer was composing.",
          createdBy: requirement.createdBy,
        })
        .returning();
      await db
        .update(requirementVersions)
        .set({})
        .where(eq(requirementVersions.id, next.id));
      const { requirements } = await import("@zkcvp/db");
      await db
        .update(requirements)
        .set({ currentVersionId: next.id })
        .where(eq(requirements.id, requirement.id));

      const err = await createClaim(db, devSession, project.id, {
        requirementVersionIds: [stale],
        repos: [{ projectRepoId: repo.id, commitSha: sha }],
      }).catch((e) => e);

      expect((err as ServiceError).status).toBe(409);
    });
  });

  it("404s for a repo not attached to this project", async () => {
    await withTestSchema(async (db) => {
      const { project, requirement, devSession } = await fixture(db);

      const err = await createClaim(db, devSession, project.id, {
        requirementVersionIds: [requirement.currentVersionId!],
        repos: [
          { projectRepoId: "00000000-0000-0000-0000-000000000000", commitSha: sha },
        ],
      }).catch((e) => e);

      expect((err as ServiceError).status).toBe(404);
    });
  });

  it("refuses a stakeholder", async () => {
    await withTestSchema(async (db) => {
      const { project, repo, requirement, shSession } = await fixture(db);

      const err = await createClaim(db, shSession, project.id, {
        requirementVersionIds: [requirement.currentVersionId!],
        repos: [{ projectRepoId: repo.id, commitSha: sha }],
      }).catch((e) => e);

      expect((err as ServiceError).status).toBe(403);
    });
  });
});

function artifacts(claimId: string, versionId: string, verdict: "satisfied" | "not_satisfied") {
  const evaluationId = "11111111-1111-1111-1111-111111111111";
  const evidence: EvidenceBundle = {
    evaluationId,
    claimId,
    toolCallLog: [],
    planReasoning: "Read the auth module.",
    droppedPaths: [],
  };
  const report: Report = {
    evaluationId,
    claimId,
    modelId: "gemini-3.5-flash",
    promptTemplateVersion: "v1",
    createdAt: new Date().toISOString(),
    perRequirement: [
      { requirementVersionId: versionId, verdict, rationale: "See src/auth.ts, lines 15-30." },
    ],
  };
  return { evidence, report };
}

describe("recordEvaluation", () => {
  it("writes the evaluation, the verdicts, and the status in one go", async () => {
    await withTestSchema(async (db) => {
      const { project, repo, requirement, devSession } = await fixture(db);
      const versionId = requirement.currentVersionId!;
      const claim = await createClaim(db, devSession, project.id, {
        requirementVersionIds: [versionId],
        repos: [{ projectRepoId: repo.id, commitSha: sha }],
      });

      await recordEvaluation(db, claim.claimId, artifacts(claim.claimId, versionId, "satisfied"));

      const [version] = await db
        .select()
        .from(requirementVersions)
        .where(eq(requirementVersions.id, versionId));
      expect(version.status).toBe("verified");

      const rows = await db.select().from(verdicts);
      expect(rows[0].verdict).toBe("satisfied");
    });
  });

  it("maps not_satisfied to eval_failed, which is a verdict and not a malfunction", async () => {
    await withTestSchema(async (db) => {
      const { project, repo, requirement, devSession } = await fixture(db);
      const versionId = requirement.currentVersionId!;
      const claim = await createClaim(db, devSession, project.id, {
        requirementVersionIds: [versionId],
        repos: [{ projectRepoId: repo.id, commitSha: sha }],
      });

      await recordEvaluation(
        db,
        claim.claimId,
        artifacts(claim.claimId, versionId, "not_satisfied"),
      );

      const [version] = await db
        .select()
        .from(requirementVersions)
        .where(eq(requirementVersions.id, versionId));
      expect(version.status).toBe("eval_failed");
    });
  });

  it("re-evaluation is symmetric — eval_failed can return to verified", async () => {
    await withTestSchema(async (db) => {
      const { project, repo, requirement, devSession } = await fixture(db);
      const versionId = requirement.currentVersionId!;

      for (const verdict of ["not_satisfied", "satisfied"] as const) {
        const claim = await createClaim(db, devSession, project.id, {
          requirementVersionIds: [versionId],
          repos: [{ projectRepoId: repo.id, commitSha: sha }],
        });
        await recordEvaluation(db, claim.claimId, {
          ...artifacts(claim.claimId, versionId, verdict),
          evidence: {
            ...artifacts(claim.claimId, versionId, verdict).evidence,
            evaluationId: crypto.randomUUID(),
          },
          report: {
            ...artifacts(claim.claimId, versionId, verdict).report,
            evaluationId: crypto.randomUUID(),
          },
        });
      }

      const [version] = await db
        .select()
        .from(requirementVersions)
        .where(eq(requirementVersions.id, versionId));
      expect(version.status).toBe("verified");
    });
  });

  it("leaves no evaluation row and no status change when nothing is recorded", async () => {
    await withTestSchema(async (db) => {
      const { project, repo, requirement, devSession } = await fixture(db);
      const versionId = requirement.currentVersionId!;
      await createClaim(db, devSession, project.id, {
        requirementVersionIds: [versionId],
        repos: [{ projectRepoId: repo.id, commitSha: sha }],
      });

      // recordEvaluation is simply never called — the shape of a failed run.
      expect(await db.select().from(evaluations)).toHaveLength(0);
      const [version] = await db
        .select()
        .from(requirementVersions)
        .where(eq(requirementVersions.id, versionId));
      expect(version.status).toBe("new");
    });
  });
});

describe("evidenceHash", () => {
  it("is stable regardless of key order", () => {
    const a = { evaluationId: "e", claimId: "c", toolCallLog: [], planReasoning: "p", droppedPaths: [] };
    const b = { droppedPaths: [], planReasoning: "p", toolCallLog: [], claimId: "c", evaluationId: "e" };
    expect(evidenceHash(a as EvidenceBundle)).toBe(evidenceHash(b as EvidenceBundle));
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

```bash
npx vitest run apps/web/tests/claims/service.test.ts
```

Expected: FAIL — cannot resolve `../../lib/claims/service`.

- [ ] **Step 3: Write the service**

```ts
// apps/web/lib/claims/service.ts
import { createHash } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import {
  claimRepos,
  claimRequirementVersions,
  claims,
  evaluations,
  projectRepos,
  requirementVersions,
  requirements,
  verdicts,
  type Db,
} from "@zkcvp/db";
import type { EvidenceBundle, Report, Verdict } from "@zkcvp/contracts";
import type { RequirementStatus } from "@zkcvp/contracts";
import { conflict, forbidden, notFound } from "../api/errors";
import { isProjectMember } from "../auth/authorization";
import type { Session } from "../auth/types";
import { assertDeveloperMember } from "../repos/service";

export type NewClaim = {
  claimId: string;
  repoCommits: { repo: string; commitSha: string }[];
  requirements: { requirementVersionId: string; title: string; description: string }[];
};

/**
 * A verdict's effect on the requirement version it judged.
 *
 * `eval_failed` means the Evaluator returned NOT SATISFIED. It is a legitimate
 * result, and the enum name is the only thing misleading about it — which is
 * why the string never reaches a screen.
 */
const STATUS_BY_VERDICT: Record<Verdict, RequirementStatus> = {
  satisfied: "verified",
  not_satisfied: "eval_failed",
};

/** Sorted-key JSON, so the same bundle always hashes the same. */
function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`);
  return `{${entries.join(",")}}`;
}

export function evidenceHash(evidence: EvidenceBundle): string {
  return createHash("sha256").update(canonical(evidence)).digest("hex");
}

/**
 * Writes the claim and returns exactly what the Evaluator needs.
 *
 * Everything fallible happens here, BEFORE the response starts streaming, so
 * each failure still gets a true HTTP status code.
 */
export async function createClaim(
  db: Db,
  session: Session,
  projectId: string,
  input: {
    requirementVersionIds: string[];
    repos: { projectRepoId: string; commitSha: string }[];
  },
): Promise<NewClaim> {
  const dev = await assertDeveloperMember(db, session, projectId);

  if (input.requirementVersionIds.length === 0) {
    throw conflict("A claim must name at least one requirement");
  }
  if (input.repos.length === 0) {
    throw conflict("A claim must name at least one commit");
  }

  const versions = await db
    .select({
      id: requirementVersions.id,
      title: requirementVersions.title,
      description: requirementVersions.description,
      requirementId: requirementVersions.requirementId,
      currentVersionId: requirements.currentVersionId,
      projectId: requirements.projectId,
      archivedAt: requirements.archivedAt,
    })
    .from(requirementVersions)
    .innerJoin(requirements, eq(requirements.id, requirementVersions.requirementId))
    .where(inArray(requirementVersions.id, input.requirementVersionIds));

  if (versions.length !== input.requirementVersionIds.length) {
    throw notFound("No such requirement version");
  }
  for (const v of versions) {
    if (v.projectId !== projectId) throw notFound("No such requirement version");
    if (v.archivedAt !== null) throw conflict("That requirement is archived");
    /* Pinned optimistically. Evaluating a version the developer never read
     * would attribute to them a claim they did not make; evaluating the
     * superseded one would judge text that no longer exists. */
    if (v.currentVersionId !== v.id) {
      throw conflict(
        "A requirement changed while this claim was being composed. Reload and try again.",
      );
    }
  }

  const repoIds = input.repos.map((r) => r.projectRepoId);
  const attached = await db
    .select()
    .from(projectRepos)
    .where(and(eq(projectRepos.projectId, projectId), inArray(projectRepos.id, repoIds)));

  if (attached.length !== new Set(repoIds).size) {
    throw notFound("No such attached repo");
  }

  const nameById = new Map(attached.map((r) => [r.id, r.fullName]));

  const claimId = await db.transaction(async (tx) => {
    const [claim] = await tx
      .insert(claims)
      .values({ projectId, submittedBy: dev.developerId })
      .returning();

    await tx.insert(claimRepos).values(
      input.repos.map((r) => ({
        claimId: claim.id,
        projectRepoId: r.projectRepoId,
        commitSha: r.commitSha,
      })),
    );

    await tx.insert(claimRequirementVersions).values(
      input.requirementVersionIds.map((requirementVersionId) => ({
        claimId: claim.id,
        requirementVersionId,
      })),
    );

    return claim.id;
  });

  return {
    claimId,
    repoCommits: input.repos.map((r) => ({
      repo: nameById.get(r.projectRepoId)!,
      commitSha: r.commitSha,
    })),
    requirements: versions.map((v) => ({
      requirementVersionId: v.id,
      title: v.title,
      description: v.description,
    })),
  };
}

/**
 * The second transaction. Called ONLY when both artifacts exist.
 *
 * A failed run never reaches this function, which is what leaves every
 * requirement version holding exactly the status it had. There is no draft
 * state to park a partial report in, so a partial report is strictly worse
 * than none.
 */
export async function recordEvaluation(
  db: Db,
  claimId: string,
  artifacts: { evidence: EvidenceBundle; report: Report },
): Promise<void> {
  const { evidence, report } = artifacts;

  await db.transaction(async (tx) => {
    await tx.insert(evaluations).values({
      id: report.evaluationId,
      claimId,
      modelId: report.modelId,
      promptTemplateVersion: report.promptTemplateVersion,
      createdAt: new Date(report.createdAt),
      evidence,
      evidenceHash: evidenceHash(evidence),
    });

    await tx.insert(verdicts).values(
      report.perRequirement.map((r) => ({
        evaluationId: report.evaluationId,
        requirementVersionId: r.requirementVersionId,
        verdict: r.verdict,
        rationale: r.rationale,
      })),
    );

    for (const r of report.perRequirement) {
      await tx
        .update(requirementVersions)
        .set({ status: STATUS_BY_VERDICT[r.verdict] })
        .where(eq(requirementVersions.id, r.requirementVersionId));
    }
  });
}

export type ClaimDetail = {
  id: string;
  projectId: string;
  submittedAt: Date;
  commits: { fullName: string; commitSha: string }[];
  /** Absent when the run was interrupted — an abandoned submission, not a status. */
  evaluation: {
    id: string;
    modelId: string;
    createdAt: Date;
    evidenceHash: string;
    results: { requirementVersionId: string; title: string; verdict: Verdict; rationale: string }[];
  } | null;
};

/**
 * Readable by any project member, stakeholders included: the report is
 * unconditionally visible the moment it exists. The evidence bundle is not
 * selected here at all, so it cannot leak through this path by accident.
 */
export async function getClaim(
  db: Db,
  session: Session,
  claimId: string,
): Promise<ClaimDetail> {
  const [claim] = await db.select().from(claims).where(eq(claims.id, claimId));
  if (!claim) throw notFound("No such claim");
  if (!(await isProjectMember(db, session, claim.projectId))) throw forbidden();

  const commits = await db
    .select({ fullName: projectRepos.fullName, commitSha: claimRepos.commitSha })
    .from(claimRepos)
    .innerJoin(projectRepos, eq(projectRepos.id, claimRepos.projectRepoId))
    .where(eq(claimRepos.claimId, claimId));

  const [evaluation] = await db
    .select({
      id: evaluations.id,
      modelId: evaluations.modelId,
      createdAt: evaluations.createdAt,
      evidenceHash: evaluations.evidenceHash,
    })
    .from(evaluations)
    .where(eq(evaluations.claimId, claimId));

  if (!evaluation) {
    return {
      id: claim.id,
      projectId: claim.projectId,
      submittedAt: claim.submittedAt,
      commits,
      evaluation: null,
    };
  }

  const results = await db
    .select({
      requirementVersionId: verdicts.requirementVersionId,
      title: requirementVersions.title,
      verdict: verdicts.verdict,
      rationale: verdicts.rationale,
    })
    .from(verdicts)
    .innerJoin(
      requirementVersions,
      eq(requirementVersions.id, verdicts.requirementVersionId),
    )
    .where(eq(verdicts.evaluationId, evaluation.id));

  return {
    id: claim.id,
    projectId: claim.projectId,
    submittedAt: claim.submittedAt,
    commits,
    evaluation: { ...evaluation, results },
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run apps/web/tests/claims/service.test.ts
```

Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/claims/service.ts apps/web/tests/claims/service.test.ts
git commit -m "feat(web): claim persistence, with status written only on a real verdict"
```

---

### Task 4: The streaming submission endpoint

**Files:**
- Create: `apps/web/app/api/projects/[projectId]/claims/route.ts`
- Delete: `apps/web/app/api/test-evaluate/route.ts`

**Interfaces:**
- Consumes: `createClaim`, `recordEvaluation` (Task 3); `encodeFrame`, `ClaimFrame` (Task 2); `LangGraphEvaluator` from `@zkcvp/orchestrator`; `createGitHubReadTool` from `@zkcvp/github/read-tool`
- Produces: `POST /api/projects/:projectId/claims`

- [ ] **Step 1: Write the route**

```ts
// apps/web/app/api/projects/[projectId]/claims/route.ts
import { z } from "zod";
import { EvaluationError, type EvaluationErrorKind } from "@zkcvp/contracts";
import { createGitHubReadTool } from "@zkcvp/github/read-tool";
import { LangGraphEvaluator } from "@zkcvp/orchestrator";
import { encodeFrame, type ClaimFrame } from "../../../../../lib/claims/frames";
import { createClaim, recordEvaluation } from "../../../../../lib/claims/service";
import { errorResponse } from "../../../../../lib/api/respond";
import { parseBody } from "../../../../../lib/api/parse";
import { getDb } from "../../../../../lib/db";
import { requireSession } from "../../../../../lib/auth/session";
import { env } from "../../../../../lib/env";

const submitSchema = z.object({
  requirementVersionIds: z.array(z.string().uuid()).min(1),
  repos: z
    .array(
      z.object({
        projectRepoId: z.string().uuid(),
        commitSha: z.string().regex(/^[0-9a-f]{40}$/, "Full 40-character SHA required"),
      }),
    )
    .min(1),
});

/**
 * A failure's status code, carried inside the terminal frame.
 *
 * The response line is already spent by the time a run can fail, so this table
 * populates `failed.status` instead. The rule it serves is unchanged: a rate
 * limit must never be mistakable for a completed evaluation that returned
 * "not satisfied".
 */
const STATUS_BY_KIND: Record<EvaluationErrorKind, number> = {
  unauthorized: 401,
  rate_limited: 429,
  repo_unreachable: 404,
  model_unavailable: 503,
  evidence_incomplete: 422,
  deadline_exceeded: 504,
  invalid_input: 400,
};

export async function POST(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const db = getDb();

  /* Everything fallible happens here, before a byte of body is written, so
   * each of these keeps a true HTTP status code. `handle()` is not used: it
   * wraps a whole response, and from the next line on there is no response
   * left to replace. */
  let claim: Awaited<ReturnType<typeof createClaim>>;
  let token: string;
  try {
    const { projectId } = await params;
    const session = await requireSession();
    const body = await parseBody(req, submitSchema);
    claim = await createClaim(db, session, projectId, body);
    if (session.kind !== "developer") throw new Error("unreachable: createClaim asserts developer");
    token = session.githubAccessToken;
  } catch (e) {
    return errorResponse(e);
  }

  const ceilingSeconds = env().EVAL_CEILING_SECONDS;
  const deadline = new Date(Date.now() + ceilingSeconds * 1000);
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (frame: ClaimFrame) =>
        controller.enqueue(encoder.encode(encodeFrame(frame)));

      try {
        const github = createGitHubReadTool(token, { deadline, signal: req.signal });
        const evaluator = new LangGraphEvaluator();

        const run = evaluator.evaluateStream({
          claim: { claimId: claim.claimId, repoCommits: claim.repoCommits },
          requirements: claim.requirements,
          github,
          modelId: env().EVAL_MODEL_ID,
          deadline,
          signal: req.signal,
        });

        /* The generator YIELDS progress and RETURNS the artifacts, so the
         * loop is written manually — `for await` discards the return value. */
        let next = await run.next();
        while (!next.done) {
          send({
            t: "progress",
            phase: next.value.node,
            filesRead: next.value.filesGathered,
            round: next.value.iteration,
          });
          next = await run.next();
        }

        const { evidence, report } = next.value;
        await recordEvaluation(db, claim.claimId, { evidence, report });

        send({ t: "done", claimId: claim.claimId, evaluationId: report.evaluationId });
        controller.close();
      } catch (e) {
        const frame: ClaimFrame =
          e instanceof EvaluationError
            ? {
                t: "failed",
                kind: e.kind,
                status: STATUS_BY_KIND[e.kind],
                message: e.message,
                ...(e.retryAt ? { retryAt: e.retryAt } : {}),
              }
            : {
                t: "failed",
                kind: "model_unavailable",
                status: 500,
                message: "The evaluation could not be completed.",
              };
        send(frame);
        /* Destroyed rather than closed: a truncated stream must never be
         * mistakable for a completed one, and this is the belt to the
         * terminal frame's braces. */
        controller.error(new Error(frame.message));
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson",
      "cache-control": "no-store",
      "x-accel-buffering": "no",
    },
  });
}
```

- [ ] **Step 2: Delete the endpoint this replaces**

```bash
rm apps/web/app/api/test-evaluate/route.ts
```

Its header says it is test-only and becomes `POST /api/claims` in production. That has now happened, and leaving it would leave a second, unauthenticated-by-project path into the Evaluator.

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```

Expected: exit 0. If `evaluateStream`'s generator return type does not narrow as written, read `packages/orchestrator/src/evaluator.ts` and match its actual `AsyncGenerator<EvaluationProgress, { evidence; report }>` signature rather than casting.

- [ ] **Step 4: Run the full suite**

```bash
npm run test
```

Expected: exit 0. Nothing should reference the deleted route.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/api/projects apps/web/app/api/test-evaluate
git commit -m "feat(web): stream claim evaluation as NDJSON, replacing the test endpoint"
```

---

### Task 5: Rewrite `EvaluationProgress` as a phase checklist

**Files:**
- Modify: `packages/design-system-ledger/components/Feedback.tsx`
- Modify: `packages/design-system-ledger/styles/domain.css`
- Modify: `packages/design-system-ledger/gallery/sections/Feedback.tsx`
- Modify: `packages/design-system-ledger/checks/render-check.tsx`

**Interfaces:**
- Consumes: `Spinner`, `Alert`, `cx` — all already in the package
- Produces:
  - `type EvaluationPhase = "claim" | "plan" | "gather" | "analyze" | "format"`
  - `EvaluationProgressProps = { elapsedSeconds: number; ceilingSeconds: number; phase: EvaluationPhase; completed: EvaluationPhase[]; filesRead: number; round: number; className?: string }`
  - `EvaluationProgress` (same export name as today)

- [ ] **Step 1: Invoke the impeccable skill**

Read the existing `EvaluationProgress` and its doc comment first. Its two honesty rules are the reason it exists and they carry over intact — rule 1 changes form (no bar at all, a checklist of phases that actually ran) but not substance. Do not weaken either while restyling.

- [ ] **Step 2: Write the render-check assertion first**

Open `packages/design-system-ledger/checks/render-check.tsx` and follow the file's existing assertion style. Add checks that:

- rendering with `phase="gather"`, `completed={["claim", "plan", "analyze"]}`, `round={2}` produces markup containing `round 2` and does **not** contain a `%` character anywhere
- rendering with `ceilingSeconds={60}` produces `1:00` and not `5:00`
- the rendered output never contains the string `eval_failed`

The no-percentage assertion is the one that matters: it is the mechanical guard on the rule that this system never renders a fraction it cannot honestly compute.

- [ ] **Step 3: Run the check to verify it fails**

```bash
npm run check -w @zkcvp/design-system-ledger
```

Expected: FAIL — `EvaluationProgress` does not accept `phase`.

- [ ] **Step 4: Rewrite the component**

Replace the existing `EvaluationProgressProps` and `EvaluationProgress` in `Feedback.tsx`:

```tsx
export type EvaluationPhase = "claim" | "plan" | "gather" | "analyze" | "format";

const PHASE_ORDER: EvaluationPhase[] = ["claim", "plan", "gather", "analyze", "format"];

/**
 * Each label names what actually happened, traced to the step that produces it.
 * "Listing" rather than "fetching" for `plan`: it reads the tree and the
 * commit's changed files, not file contents.
 */
const PHASE_LABEL: Record<EvaluationPhase, string> = {
  claim: "Reading the requirement",
  plan: "Listing files at the claimed commit",
  gather: "Agent reading source",
  analyze: "Forming a judgment",
  format: "Recording the result",
};

export interface EvaluationProgressProps {
  /** Seconds elapsed in the held-open request. */
  elapsedSeconds: number;
  /** The platform's execution ceiling for this deployment. Never hardcoded. */
  ceilingSeconds: number;
  /** The step running right now. */
  phase: EvaluationPhase;
  /** Every step that has run at least once. May include steps after `phase`. */
  completed: EvaluationPhase[];
  filesRead: number;
  /** Completed gather/analyze rounds. Shown only from round 2. */
  round: number;
  className?: string;
}

/**
 * Evaluation in flight.
 *
 * Evaluation runs synchronously inside the request that submits the claim, so
 * the developer's own tab is held open for its full duration. Three rules, all
 * about honesty rather than aesthetics:
 *
 *   1. NO FRACTION, and the interface says so out loud. There is no honest
 *      percentage for an LLM evaluation, and a fabricated one is the kind of
 *      small lie that costs a user their trust in everything else on the page.
 *      The earlier version of this component expressed that by omitting a
 *      `value` prop; stating it in the copy is stronger.
 *   2. The marker MOVES BACKWARD, because `gather` and `analyze` repeat. A tick
 *      means "this has run", which is true — not "this is finished forever",
 *      which would not be. The round indicator from round 2 onward is what
 *      makes a backward-moving marker unambiguous rather than alarming.
 *   3. The elapsed clock turns ochre past 70% of the ceiling, so the developer
 *      is warned BEFORE the request is cut off rather than after. Ochre is this
 *      system's attention colour and is not a verdict colour, so the clock
 *      cannot be misread as a result.
 */
export function EvaluationProgress({
  elapsedSeconds,
  ceilingSeconds,
  phase,
  completed,
  filesRead,
  round,
  className,
}: EvaluationProgressProps) {
  const nearCeiling = elapsedSeconds > ceilingSeconds * 0.7;
  const done = new Set(completed);

  const mmss = (s: number) =>
    `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

  return (
    <div className={cx("lg-eval", className)}>
      <div className="lg-eval__head">
        <span className="lg-eval__label">
          <Spinner label="Evaluating" />
          Agent is reading the code
        </span>
        <span className="lg-eval__clock" data-near-ceiling={nearCeiling || undefined}>
          {mmss(elapsedSeconds)}
        </span>
      </div>

      <ol className="lg-eval__steps">
        {PHASE_ORDER.map((p) => {
          const state = p === phase ? "active" : done.has(p) ? "done" : "pending";
          return (
            <li key={p} className="lg-eval__step" data-state={state}>
              <span className="lg-eval__mark" aria-hidden="true" />
              <span className="lg-eval__step-label">{PHASE_LABEL[p]}</span>
              {p === phase && round >= 2 && (
                <span className="lg-eval__round">round {round}</span>
              )}
            </li>
          );
        })}
      </ol>

      {filesRead > 0 && (
        <p className="lg-eval__count">
          {filesRead} {filesRead === 1 ? "file" : "files"} read
        </p>
      )}

      <p className="lg-eval__note">
        This runs inside your request. There is no percentage to show —
        evaluation takes as long as the reading takes, up to a hard limit of{" "}
        {mmss(ceilingSeconds)}.
      </p>

      <Alert tone="warning">
        Keep this tab open. Closing it abandons the run and no verdict is recorded.
      </Alert>
    </div>
  );
}
```

- [ ] **Step 5: Style the checklist**

Add rules for `.lg-eval__steps`, `.lg-eval__step`, `.lg-eval__mark`, `.lg-eval__round`, and `.lg-eval__count` to `styles/domain.css`, beside the existing `.lg-eval` rules. Use existing tokens only — no new colour values. The three `data-state` values need visually distinct marks: `done` a tick in the success ink, `active` the spinner-adjacent attention colour, `pending` a dimmed outline. Under the impeccable skill's direction, confirm all three read correctly in both light and dark, since Ledger is light-first with a real dark mode.

- [ ] **Step 6: Update the gallery section**

`gallery/sections/Feedback.tsx` currently renders `EvaluationProgress elapsedSeconds= ceilingSeconds=`. Update the API string and the live example to pass the new props, showing a mid-run state (`phase="gather"`, `completed={["claim", "plan", "analyze"]}`, `round={2}`, `filesRead={19}`) — the loop case is the one worth demonstrating, because it is the one whose display rule is non-obvious.

- [ ] **Step 7: Run the check and typecheck**

```bash
npm run verify -w @zkcvp/design-system-ledger
```

Expected: exit 0.

- [ ] **Step 8: Commit**

```bash
git add packages/design-system-ledger
git commit -m "feat(ledger): show evaluation phases that actually ran, not a bar"
```

---

### Task 6: The claim composition screen

**Files:**
- Create: `apps/web/app/projects/[id]/claims/new/page.tsx`
- Create: `apps/web/app/projects/[id]/claims/new/ClaimComposer.tsx`
- Create: `apps/web/lib/claims/use-claim-stream.ts`
- Modify: `apps/web/app/projects/[id]/page.tsx`

**Interfaces:**
- Consumes: `decodeFrames`, `isTerminal`, `ClaimFrame` (Task 2); `EvaluationProgress`, `EvaluationPhase` (Task 5); `listAttachedRepos` (repo plan); `listRequirements` from `lib/requirements/service`
- Produces: `useClaimStream()` — the hook that reads the NDJSON body

- [ ] **Step 1: Invoke the impeccable skill**

This screen carries both halves of a claim on one page. Read `apps/web/app/projects/[id]/requirements/new/page.tsx` for the routed-form pattern this follows.

- [ ] **Step 2: Write the stream-reading hook**

```ts
// apps/web/lib/claims/use-claim-stream.ts
"use client";
import { useCallback, useState } from "react";
import { decodeFrames, isTerminal, type ClaimFrame, type ClaimPhase } from "./frames";
import type { EvaluationPhase } from "@zkcvp/design-system-ledger";

export type ClaimRun =
  | { status: "idle" }
  | {
      status: "running";
      phase: EvaluationPhase;
      completed: EvaluationPhase[];
      filesRead: number;
      round: number;
      startedAt: number;
    }
  | { status: "done"; claimId: string }
  | { status: "failed"; message: string; retryAt?: string };

export function useClaimStream() {
  const [run, setRun] = useState<ClaimRun>({ status: "idle" });

  const submit = useCallback(
    async (projectId: string, body: unknown) => {
      const startedAt = Date.now();
      setRun({
        status: "running",
        /* "claim" is complete the instant the stream opens: the claim row is
         * written before a byte of body is sent. */
        phase: "plan",
        completed: ["claim"],
        filesRead: 0,
        round: 0,
        startedAt,
      });

      const res = await fetch(`/api/projects/${projectId}/claims`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok || !res.body) {
        const problem = await res.json().catch(() => null);
        setRun({
          status: "failed",
          message: problem?.error?.message ?? "The claim could not be submitted.",
        });
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let rest = "";

      const apply = (frame: ClaimFrame) => {
        if (frame.t === "progress") {
          setRun((prev) =>
            prev.status === "running"
              ? {
                  ...prev,
                  phase: frame.phase as EvaluationPhase,
                  completed: prev.completed.includes(frame.phase as EvaluationPhase)
                    ? prev.completed
                    : [...prev.completed, frame.phase as EvaluationPhase],
                  filesRead: frame.filesRead,
                  round: frame.round,
                }
              : prev,
          );
          return;
        }
        if (frame.t === "done") {
          setRun({ status: "done", claimId: frame.claimId });
          return;
        }
        setRun({ status: "failed", message: frame.message, retryAt: frame.retryAt });
      };

      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          const decoded = decodeFrames(rest + decoder.decode(value, { stream: true }));
          rest = decoded.rest;
          for (const frame of decoded.frames) {
            apply(frame);
            if (isTerminal(frame)) return;
          }
        }
        /* The stream ended with no terminal frame — the connection dropped or
         * the host cut the request. Never report this as a verdict. */
        setRun({
          status: "failed",
          message: "The connection ended before a verdict was recorded. Submit the claim again.",
        });
      } catch {
        setRun({
          status: "failed",
          message: "The run was interrupted before a verdict was recorded.",
        });
      }
    },
    [],
  );

  return { run, submit };
}
```

Note the `frame.phase as EvaluationPhase` casts: `ClaimPhase` is the four graph nodes and `EvaluationPhase` is those plus `"claim"`. If the cast is unpleasant, widen `ClaimPhase` is **not** the fix — the wire protocol should carry only what the graph emits. Import `EvaluationPhase` and narrow explicitly instead.

- [ ] **Step 3: Write the Server Component**

It loads the non-archived requirements at their current versions and the attached repos, then hands both to the client composer. A stakeholder never reaches it — `assertDeveloperMember` in `createClaim` is the enforcement, but the page should also render nothing useful to one, matching how every other role-gated page behaves.

- [ ] **Step 4: Write the composer**

Under the impeccable skill: requirement checkboxes with `StatusBadge` showing where each currently stands, a repo/branch/commit picker per repo, an "add another repo" affordance, and a submit that swaps the form for `EvaluationProgress` while `run.status === "running"`. Requirements already `verified` or `eval_failed` stay selectable — re-evaluation is symmetric and none is a dead end.

The elapsed clock ticks from `run.startedAt` with a local interval; the ceiling comes from the server as a prop, read from `EVAL_CEILING_SECONDS`. Never hardcode it.

On `run.status === "done"`, redirect to `/claims/<claimId>`. On `failed`, show the message in `Alert tone="danger"` — an infrastructure failure is red, never ink, and never a verdict.

- [ ] **Step 5: Link it from the project page**

Add a "Submit a claim" link for developer members beside the existing links. One line, one conditional — no selection state on that screen.

- [ ] **Step 6: Verify in a browser**

```bash
npm run dev
```

Sign in as a developer, attach a repo, compose a claim over two requirements, and submit. Confirm the checklist advances through the phases, that a run reaching round 2 shows the round chip with the marker back on "Agent reading source" while "Forming a judgment" stays ticked, and that the clock turns ochre past 70% of the ceiling.

Then force a failure: submit with `EVAL_CEILING_SECONDS=5` in `apps/web/.env.local` and confirm the deadline failure renders as a danger alert and that the requirement's status is unchanged afterward.

- [ ] **Step 7: Run the full verify**

```bash
npm run verify
```

Expected: exit 0.

- [ ] **Step 8: Commit**

```bash
git add apps/web/app/projects apps/web/lib/claims/use-claim-stream.ts
git commit -m "feat(web): compose a claim and watch the evaluation run"
```

---

### Task 7: The claim result screen

**Files:**
- Create: `apps/web/app/claims/[id]/page.tsx`
- Create: `apps/web/app/api/claims/[id]/route.ts`

**Interfaces:**
- Consumes: `getClaim`, `ClaimDetail` (Task 3)
- Produces: `GET /api/claims/:id`

- [ ] **Step 1: Invoke the impeccable skill**

- [ ] **Step 2: Write the route handler**

```ts
// apps/web/app/api/claims/[id]/route.ts
import { handle } from "../../../../lib/api/respond";
import { getDb } from "../../../../lib/db";
import { requireSession } from "../../../../lib/auth/session";
import { getClaim } from "../../../../lib/claims/service";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const { id } = await params;
    const session = await requireSession();
    const claim = await getClaim(getDb(), session, id);
    return Response.json({ claim });
  });
}
```

- [ ] **Step 3: Write the page**

Renders, under the impeccable skill:

- one `VerdictCard` per requirement, carrying the verdict and the rationale
- the pinned commits as `CommitRow`s — these are what the verdict is *about*, so they are not a footnote
- `EvidenceLock` for the withheld evidence bundle, with the integrity affordance live and visible. **Withheld is not unverifiable** — that distinction is the product's entire trust argument, so the lock must not read as "nothing to see here"
- the model id and an absolute `createdAt`
- when `evaluation === null`: "This run was interrupted. No verdict was recorded." with a link back to compose a new claim. This is not an error state and not a pending one — it is an abandoned submission

Do not present the evidence hash as proof the judgment was correct. It proves the record was not altered, and nothing more.

- [ ] **Step 4: Verify in a browser and run verify**

```bash
npm run verify
```

Expected: exit 0. Then open a completed claim and a claim whose run you interrupted by closing the tab, and confirm both render as designed.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/claims apps/web/app/api/claims
git commit -m "feat(web): show a claim's verdicts and its withheld evidence"
```

---

### Task 8: Verdicts on the requirement page

**Files:**
- Modify: `apps/web/lib/requirements/service.ts`
- Modify: `apps/web/app/requirements/[id]/page.tsx`
- Test: `apps/web/tests/requirements/verdicts.test.ts`

**Interfaces:**
- Consumes: `verdicts`, `evaluations` tables (Task 1)
- Produces: `latestVerdictFor(db, requirementVersionId): Promise<{ verdict: Verdict; rationale: string; modelId: string; createdAt: Date; claimId: string } | null>`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/tests/requirements/verdicts.test.ts
import { describe, expect, it } from "vitest";
import { withTestSchema } from "@zkcvp/db/testing";
import { latestVerdictFor } from "../../lib/requirements/service";

describe("latestVerdictFor", () => {
  it("returns null for a version never evaluated", async () => {
    await withTestSchema(async (db) => {
      await expect(
        latestVerdictFor(db, "00000000-0000-0000-0000-000000000000"),
      ).resolves.toBeNull();
    });
  });
});
```

Extend this with a second test that seeds two evaluations for one version at different `createdAt` values and asserts the newer one is returned. Build the fixture the way `apps/web/tests/claims/service.test.ts` does — `createClaim` then `recordEvaluation`, twice — rather than inserting rows by hand, so the test exercises the real write path.

- [ ] **Step 2: Run it to make sure it fails**

```bash
npx vitest run apps/web/tests/requirements/verdicts.test.ts
```

Expected: FAIL — `latestVerdictFor` is not exported.

- [ ] **Step 3: Implement it**

Add to `apps/web/lib/requirements/service.ts` a query joining `verdicts` to `evaluations` on `evaluation_id`, filtered by `requirement_version_id`, ordered by `evaluations.createdAt` descending, limited to one. The index added in Task 1 serves this.

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run apps/web/tests/requirements/verdicts.test.ts
```

Expected: PASS.

- [ ] **Step 5: Render it on the requirement page**

Fold the latest verdict and its rationale into the existing `Timeline` on `/requirements/[id]`, under the impeccable skill. The `StatusBadge` already renders `eval_failed` as "Not satisfied"; the rationale is prose beneath it. Link to the claim that produced it.

- [ ] **Step 6: Run verify and commit**

```bash
npm run verify
git add apps/web/lib/requirements/service.ts apps/web/app/requirements apps/web/tests/requirements/verdicts.test.ts
git commit -m "feat(web): show the latest verdict on a requirement"
```

---

### Task 9: Make the docs true

Six corrections approved during design, plus the orphaned stub. All small, none optional: several of these statements become false the moment Task 4 ships.

**Files:**
- Modify: `PRODUCT.md`, `README.md`, `docs/architecture.md`, `docs/orchestrator.md`
- Delete: `packages/orchestrator/src/stub.ts`
- Modify: `packages/orchestrator/src/index.ts`

- [ ] **Step 1: Remove the claims that the Evaluator does not exist**

- `PRODUCT.md` § Evidence on Hand — delete "The Evaluator does not exist yet, so no surface may present real verdict output as if produced by it."
- `docs/architecture.md` § Out of scope — delete the same sentence and remove "the Evaluator's internals" from the out-of-scope list, replacing it with a pointer to `docs/orchestrator.md`.

- [ ] **Step 2: Correct the LLM provider statement**

`PRODUCT.md` § Stack says "LangGraph (TypeScript) for the Evaluator with the LLM provider left configurable". The provider is Gemini and is not configurable; only the model id is, via `EVAL_MODEL_ID`. Match `docs/orchestrator.md` §10.

- [ ] **Step 3: Reconcile the deployment host**

Three places disagree. `docs/architecture.md` § Host-agnostic guarantees says the host is Vercel as of 2026-08-18; § Stack decisions still lists it as open; `PRODUCT.md` § Operating Context and § Capabilities both call it undecided. Make the latter three agree with the first: the host is Vercel, the host-agnostic guarantees were kept rather than spent, and a move to a long-lived Node host remains a redeploy.

Add, where the ceiling is discussed: Vercel's function limit is 60 seconds on the current plan, so `EVAL_CEILING_SECONDS` is 60 there while the default stays 300.

- [ ] **Step 4: Fix the stale milestone pointer**

`docs/architecture.md` § Status ends "Next: **M5 — Remaining checklist screens**", but the M5 section says all seven routes shipped in M4 and the table is "kept as the role-split reference, not a list of pending work". Replace with the real next step: the Transparency Log.

Add a short M6 section recording what this sprint built — repo attachment, claims, the streaming endpoint, and the verdict write-back — in the same voice as M3 and M4.

- [ ] **Step 5: Update the orchestrator doc**

- §8: restate "A verdict is a 200. A failure never is." in its streaming form, pointing at `docs/plans/03-claim-submission.md`. Keep the reasoning; the rule now lives in the terminal frame.
- §9: replace the `test-evaluate` walkthrough with the real caller, `POST /api/projects/:projectId/claims`.
- §12: persistence is no longer missing. Delete that bullet and note what the Transparency Log still lacks.

- [ ] **Step 6: Update README's status table**

Line 127 reads "Claim submission & verification invocation | Not yet designed". It is now designed and built — point at `docs/plans/03-claim-submission.md`.

- [ ] **Step 7: Delete the stub evaluator**

```bash
rm packages/orchestrator/src/stub.ts
```

Remove its export from `packages/orchestrator/src/index.ts`, including the "Re-export the stub for backwards compat / tests" comment. Then:

```bash
npm run typecheck
```

Expected: exit 0. If anything still imports `StubEvaluator`, that import is the thing to fix — the stub exists to let the app compile against an Evaluator that had never been instantiated, and that condition is over.

- [ ] **Step 8: Run the full verify**

```bash
npm run verify
```

Expected: exit 0.

- [ ] **Step 9: Commit**

```bash
git add PRODUCT.md README.md docs packages/orchestrator
git commit -m "docs: the Evaluator exists, the host is Vercel, and claims persist"
```

---

## Self-Review

**Spec coverage.** Every section of `docs/plans/03-claim-submission.md` maps to a task: the data model is Task 1; write ordering, the status write-back, and optimistic version pinning are Task 3; the frame protocol and the amended invariant are Task 2; the transport with its pre-stream status codes is Task 4; the API contract is Tasks 4 and 7; screens are Tasks 6, 7, and 8; the in-flight UI is Task 5; configuration lands in Tasks 4 and 9; the eight restated invariants are enforced across Tasks 1 (3), 3 (6), 4 (1, 2), 5 (7), 7 (4), and the Evaluator itself (5). Task 9 covers the doc scope approved during design.

**Deliberate gaps.** `GET /api/claims/:id` exists in Task 7 but the pages read services directly, matching how every other screen in this app works — the endpoint is for parity with the documented contract, not because a page needs it. Commit pickers read the first page of 50 commits from the repo plan; pagination stays unbuilt until a caller shapes its API.

**Type consistency.** `ClaimPhase` (Task 2, four graph nodes) and `EvaluationPhase` (Task 5, those plus `"claim"`) are deliberately different types, and Task 6 names the conversion explicitly rather than widening either. `NewClaim.repoCommits` is shaped as `RepoCommit` from `@zkcvp/contracts` so it passes into `evaluate` unmapped. `recordEvaluation` takes `{ evidence, report }`, exactly what `evaluateStream` returns, so Task 4 forwards it without restructuring. `STATUS_BY_VERDICT` (Task 3) and `STATUS_BY_KIND` (Task 4) are distinct tables with distinct jobs — verdict-to-status and error-kind-to-code — and are never merged.

**One risk carried forward.** Task 1 of the repo plan proves streaming on the local Node server only. Before Task 6 is called done, the same check must be repeated against the deployed host: a buffering proxy in front of Vercel would make the checklist render all at once at the end, which is worse than not having built it.
