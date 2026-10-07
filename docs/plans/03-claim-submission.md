# Feature Plan: Claim Submission & Verification Invocation

## Status
Design finalized. Ready for implementation. Supersedes README's "Claim submission &
verification invocation — Not yet designed".

## Purpose

Lets a developer assert that specific commits satisfy specific requirements, have the
Evaluator read the real source at those commits, and record the verdicts where the
stakeholder can read them. This is the last piece of the web app; only the Transparency
Log remains after it.

## Scope

**In scope:** the claim data model, the streaming submission endpoint, verdict and
evidence persistence, the requirement-status write-back, the claim composition and result
screens, and the in-flight progress UI.

**Prerequisite, in the same sprint:** `docs/plans/02-repo-attachment.md`, which is designed
but unbuilt. A claim pins `(repo, commit SHA)` pairs, and there is no way to name one until
repos are attachable and commits browsable. Plan 02 ships first and unchanged.

**Out of scope:** the Transparency Log, evidence disclosure, un-archiving, any background
or queued execution, and any change to the Evaluator's internals.

## Core mechanism

Evaluation runs **synchronously inside the request that submits the claim**. This follows
from token custody, not from the runtime: the developer's GitHub OAuth token lives only in
their session and is never persisted, so there is no credential a background job could use.
The developer's own browser holds the request open for the duration.

Because the wait runs to the host's whole execution budget and is otherwise invisible, the
response **streams progress**.
The Evaluator already exposes `evaluateStream()`, which yields one event per graph node as
it completes. Those events drive the UI. They are transport only — never persisted, never
shown to a stakeholder, and never a status a requirement rests in.

---

## Data model

### `claims`

| field | type | notes |
|---|---|---|
| id | uuid, PK | echoed to the Evaluator as `claimId` |
| project_id | FK → projects.id, not null | |
| submitted_by | FK → developers.id, not null | |
| submitted_at | timestamptz, not null | |

### `claim_repos`

| field | type | notes |
|---|---|---|
| id | uuid, PK | |
| claim_id | FK → claims.id, not null | |
| project_repo_id | FK → project_repos.id, not null, ON DELETE RESTRICT | |
| commit_sha | text, not null | full 40-character SHA |

Unique on (`claim_id`, `project_repo_id`). This is the database-level form of the
Evaluator's **at most one commit per repo** rule: a commit is a full snapshot, and `repo` is
what maps a chosen file path back to a commit, so two commits of one repo would read the
same path at the wrong commit and succeed silently.

The FK references the *attachment row*, not a repo name, keeping `github_repo_id` the join
key. It cannot dangle: plan 02 makes attachment permanent past a 60-second undo window
precisely so "a claim referencing a repo since removed from under it" cannot occur.
`ON DELETE RESTRICT` makes the remaining 60-second case fail loudly rather than cascade.

`full_name` is dereferenced only at the GitHub boundary, where `RepoCommit.repo` wants
`"owner/name"`. A renamed repo leaves it stale; plan 02 already accepts that, since
GitHub's own redirect resolves API calls.

### `claim_requirement_versions`

| field | type | notes |
|---|---|---|
| claim_id | FK → claims.id, not null | |
| requirement_version_id | FK → requirement_versions.id, not null | |

Primary key (`claim_id`, `requirement_version_id`). A claim pins requirement **versions**,
never requirements — verification status attaches to the exact text that was evaluated.

### `evaluations`

| field | type | notes |
|---|---|---|
| id | uuid, PK | the Evaluator's own `evaluationId`, not a fresh one |
| claim_id | FK → claims.id, not null | |
| model_id | text, not null | which model actually produced the verdicts |
| prompt_template_version | text, not null | ties a verdict to the prompt that produced it |
| created_at | timestamptz, not null | |
| evidence | jsonb, not null | the full `EvidenceBundle`. Never returned by any endpoint |
| evidence_hash | text, not null | SHA-256 over canonical JSON of `evidence` |

`evidence_hash` is computed at write time and has no consumer yet. It is what the
Transparency Log will anchor, and it is what makes integrity checkable **without**
disclosing contents — withheld is not unverifiable.

### `verdicts`

| field | type | notes |
|---|---|---|
| id | uuid, PK | |
| evaluation_id | FK → evaluations.id, not null | |
| requirement_version_id | FK → requirement_versions.id, not null | |
| verdict | enum, not null | `satisfied` or `not_satisfied` |
| rationale | text, not null | prose; never verbatim source |

Unique on (`evaluation_id`, `requirement_version_id`), indexed on
`requirement_version_id`. Verdicts are rows rather than JSON inside a report blob because
`/requirements/[id]` reads them by requirement version on every page view, and because the
Transparency Log will want one hashable row per attestable result.

---

## Write ordering

Two transactions, and the gap between them is where the evaluation runs.

**Before evaluation:** `claims` + `claim_repos` + `claim_requirement_versions`, together.
The claim row exists from the moment of submission because README names *claim submitted*
as a Transparency Log event distinct from *verification result*.

**After evaluation, only if both artifacts exist:** `evaluations` + `verdicts` + the
`requirement_versions.status` write, together.

| Verdict | `requirement_versions.status` becomes |
|---|---|
| `satisfied` | `verified` |
| `not_satisfied` | `eval_failed` |

`eval_failed` means the Evaluator returned *not satisfied*. It is a legitimate result, not
a malfunction, and the string never reaches a screen — `StatusBadge` renders it
"Not satisfied".

**No failure writes a status.** If the run throws, the second transaction never opens and
each requirement version keeps exactly the status it had. This is the persistence form of
the Evaluator's all-or-nothing rule: there is no draft state to park a bad report in, so a
partial report is strictly worse than none.

### This introduces no pending state

The rule that there is no pending or in-flight state anywhere is about
`requirement_versions.status`, which here moves directly from its old value to a terminal
one inside a single transaction, or does not move at all.

A `claims` row with no `evaluations` row is not a status. It is an abandoned submission —
the tab closed, or the host cut the request — and `/claims/[id]` renders it as
"This run was interrupted. No verdict was recorded." The claim can simply be submitted
again; re-evaluation is symmetric from every status.

### Requirement versions are pinned optimistically

The submission body carries the `requirementVersionId`s the developer actually saw. The
server checks each is still its requirement's `current_version_id` and returns **409** if
not.

Evaluating a version the developer never read, because a stakeholder edited it mid-compose,
would attribute to them a claim they did not make. Evaluating the superseded version would
produce a verdict against text that no longer exists. Neither is acceptable, so the
submission is refused and recomposed.

---

## Transport: a streamed response

`POST /api/projects/:projectId/claims`

Every fallible step happens **before a byte of body is written**, so each keeps a true HTTP
status code:

| Step | Failure |
|---|---|
| `requireDeveloper()` | 401 |
| developer is a member of this project | 403 |
| Zod body validation | 400 |
| every `requirementVersionId` belongs to this project | 404 |
| every `requirementVersionId` is still current | 409 |
| every `projectRepoId` is attached to this project | 404 |
| the pre-evaluation transaction | 500 |

Only then: `200 OK`, `content-type: application/x-ndjson`, `cache-control: no-store`,
`x-accel-buffering: no`.

### Frames

One JSON object per line. Exactly one terminal frame, then the connection closes.

```ts
type ClaimFrame =
  | { t: "progress"; phase: "plan" | "gather" | "analyze" | "format";
      filesRead: number; round: number }
  | { t: "done";   claimId: string; evaluationId: string }
  | { t: "failed"; kind: EvaluationErrorKind; status: number;
      message: string; retryAt?: string };
```

`progress` frames are a direct mapping of what `evaluateStream()` yields. They carry no
total and no percentage, because neither exists.

### The amended invariant

The Evaluator's error taxonomy previously stated: *a verdict is a 200, a failure never is.*
Streaming spends the status code before the outcome is known, so that rule is restated in
its streaming form:

> **A verdict is a `done` frame. A failure is a `failed` frame. Never both, never neither.**

What the rule protects is unchanged and is the reason it exists: an infrastructure failure
must never reach a stakeholder as "Not satisfied". A typed terminal frame enforces that at
least as strictly as a status code did, because `done` and `failed` are structurally
different objects rather than the same object behind a different number.

The error-kind to status mapping survives intact; it now populates `failed.status` instead
of the response line, so a client can still treat a rate limit as a rate limit. After
writing a `failed` frame the server destroys the connection, so a truncated stream can
never be mistaken for a completed one either.

---

## API contract

Plan 02's six endpoints ship unchanged. This plan adds:

| Endpoint | Auth | Notes |
|---|---|---|
| `POST /api/projects/:projectId/claims` | developer member | streams NDJSON, above |
| `GET /api/claims/:id` | any project member | claim, pinned commits, verdicts. **Never** evidence |

`packages/github` gains exactly the three methods plan 02 names — `listUserRepos`,
`listBranches`, `listCommits` — following its rule that a method is added when a caller
needs it, not before.

## Authorization matrix

| Action | Stakeholder member | Developer member | Non-member |
|---|---|---|---|
| Submit a claim | ❌ (no GitHub identity) | ✅ | ❌ |
| View a claim and its verdicts | ✅ | ✅ | ❌ |
| View the evidence bundle | ❌ | ❌ | ❌ |

No one reads evidence in this phase. It is stored and hashed only.

---

## Screens

| Route | Role | Renders |
|---|---|---|
| `/projects/[id]` | both | unchanged, plus a "Submit a claim" link for developer members |
| `/projects/[id]/repos` | both | attached repos; picker and 60s undo are developer-only |
| `/projects/[id]/claims/new` | developer | requirement picker, commit picker, submit, live progress |
| `/claims/[id]` | both | verdict per requirement, pinned commits, withheld-evidence affordance |
| `/requirements/[id]` | both | unchanged, plus the latest verdict and rationale in the Timeline |

### `/projects/[id]/claims/new`

Both halves of the claim live on one screen, because a claim is one decision:

```
Requirements                        all non-archived, at their current version
  [x] OAuth login works end to end       v3   New
  [x] Sessions expire after 30 days      v1   Verified
  [ ] Users can reset their password     v2   Not satisfied

Commits
  Repo  acme/api    Branch  main    Commit  a3f91c2 "merge..."
  [ + add another repo ]

  [ Submit claim ]
```

Requirements already `verified` or `eval_failed` stay selectable — re-evaluation is
symmetric from every status and none is a dead end. Their badge shows only where they
currently stand.

Requirement selection is deliberately **not** on `/projects/[id]`. That screen is shared
with stakeholders and built as one query with a single conditional on `session.kind`;
selection state and a count-bearing action bar would be well past that. Splitting the claim
across two screens would also commit the developer to half of it before they have seen the
commits, and the server must re-validate any passed-through selection regardless.

### The in-flight UI

`EvaluationProgress` in `packages/design-system-ledger` is rewritten in place. The export
name, the elapsed clock and the ochre-past-70%-of-ceiling rule are all retained; the
indeterminate bar is replaced by a checklist of phases that actually occurred.

```
(spinner) Agent is reading the code                  0:13

  [done]    Reading the requirement
  [done]    Listing files at the claimed commit
  [active]  Agent reading source...            round 2
  [done]    Forming a judgment
  [pending] Recording the result

  19 files read

  This runs inside your request. There is no percentage to show —
  evaluation takes as long as the reading takes, up to a hard limit of 1:00.

  (warning) Keep this tab open. Closing it abandons the run and no verdict
  is recorded.
```

| Step | Source |
|---|---|
| Reading the requirement | server work before the stream opens; completes on the first byte |
| Listing files at the claimed commit | `plan` — lists the tree and the commit's changed files |
| Agent reading source | `gather` — reads file contents |
| Forming a judgment | `analyze` — one verdict per requirement |
| Recording the result | `format` plus the post-evaluation transaction |

Two display rules, both about honesty rather than aesthetics:

1. **No percentage, and the interface says so.** There is no honest fraction for an LLM
   evaluation. The previous component expressed this by omitting a `value` prop; this one
   states it in the copy, which is stronger.
2. **`gather` and `analyze` repeat, so the marker moves backward.** A check means *this has
   run*, which is true, not *this is finished forever*, which would not be. A round
   indicator appears from round 2 so a backward-moving marker is never ambiguous.

The ceiling is rendered from `EVAL_CEILING_SECONDS`, never hardcoded, so the copy stays
true when the host changes.

---

## Configuration

| Variable | Purpose | Note |
|---|---|---|
| `EVAL_CEILING_SECONDS` | budget for one run; feeds the clock and the copy | default 300; **set to 60 on Vercel**, whose function limit is 60s on the current plan |

At a 60-second ceiling the `gather` and `analyze` loop will rarely reach round 2: `plan` is
one model call plus two GitHub calls, and `analyze` is another. Runs will typically either
return a round-one verdict or stop at `deadline_exceeded`. No code changes — the loop
already ends when the deadline passes — but it is the reason the streamed checklist matters
most on this host: a run that dies at 58 seconds shows *where* it died.

---

## Testing

Service-layer, against real Postgres, through the existing harness. Coverage targets
invariants that actually break:

- Two commits for one repo in one claim are rejected by the unique constraint.
- `satisfied` becomes `verified`, `not_satisfied` becomes `eval_failed`.
- Re-evaluation works from `new`, from `verified`, and from `eval_failed`.
- A thrown evaluation writes no `evaluations` row, no `verdicts`, and no status change.
- A claim naming a repo not attached to the project is 404.
- A claim naming a superseded requirement version is 409.
- Removing a repo outside the 60-second window is 409.

Frame encoding is pure and tested without HTTP, including that a `failed` frame can never
be parsed as `done`.

**Streaming is proven before anything is built on it.** The first task is a throwaway
streaming route verified in a real browser. If any layer between the route handler and the
browser buffers the response, the progress UI is decoration and the design falls back to a
buffered response with an elapsed-time-only wait.

---

## Invariants worth re-stating

1. The GitHub token reaches the Evaluator through the session and the read tool, and is
   never written to a table, logged, or returned.
2. The Evaluator reads the pinned SHA, never live HEAD.
3. A claim carries at most one commit per repo, enforced in the database as well as in the
   Evaluator.
4. Evidence and report stay structurally separate. No endpoint returns evidence.
5. A rationale cites file paths and line ranges and never contains source code.
6. A failure writes no status. A verdict writes exactly one, in the same transaction as the
   `verdicts` rows.
7. `eval_failed` never reaches a screen as that string.
8. Progress frames are transport. They are never persisted and never shown to a stakeholder.
