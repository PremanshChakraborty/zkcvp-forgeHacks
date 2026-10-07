# The Orchestrator

`packages/orchestrator` is the agent that reads real source code and decides whether it
satisfies a requirement. Given a claim — some requirements, plus one commit per repo — it picks
files to read, reads them, judges each requirement, and returns two things: a private evidence
transcript and a stakeholder-visible report.

---

## 1. Why it runs inside the request

The developer's GitHub token lives only in their session. It is never stored in a table.

Everything else follows from that:

- **Evaluation is synchronous**, inside the request that submits the claim. A background job
  would need a stored token, and there isn't one.
- **There is no pending state.** A requirement goes straight from its old status to a final one.
- **The time budget belongs to the host**, not the agent. Serverless caps the request; a
  long-lived Node process doesn't.

So the agent is a batch pipeline with one request to finish in. That is why it works against a
deadline and spends retries carefully.

---

## 2. Input and output

The contract is `packages/contracts/src/evaluator.ts`:

```ts
interface Evaluator {
  evaluate(input: EvaluatorInput): Promise<{ evidence: EvidenceBundle; report: Report }>;
}
```

**Input** — `claimId`, one or more requirements, `repoCommits` (**at most one commit per repo**,
enforced), a `GitHubReadTool`, and optionally `modelId`, `deadline`, `signal`.

One commit per repo matters: a commit is a full snapshot, and `repo` is what maps a chosen file
path back to a commit. Two commits of one repo would make that mapping ambiguous, and the
resulting read would return the wrong content without failing.

**Output** — two separate objects, never merged:

| | Contents | Who sees it |
|---|---|---|
| `EvidenceBundle` | Full tool transcript, plan reasoning, dropped paths | Nobody yet. Stored, and hashed for the transparency log. |
| `Report` | Prose only: verdict + rationale per requirement | The stakeholder, immediately and unconditionally |

Keeping them apart is the product's trust argument. The evidence can be hashed to prove the
record wasn't altered, without showing anyone the source. Note the limit: that proves the
**record** is intact, not that the **judgment** was right.

---

## 3. The graph

A LangGraph `StateGraph`, compiled once at module load:

```
PLAN ──▶ GATHER ──▶ ANALYZE ──┬── needs more? ──▶ back to GATHER
                              └── done ──▶ FORMAT ──▶ END
```

| Node | Uses the model | Calls GitHub | Job |
|---|---|---|---|
| `plan` | yes | `listTree`, `changedFiles` | Choose which files to read |
| `gather` | no | `readFile` | Read them; classify anything that fails |
| `analyze` | yes | no | One verdict per requirement; decide whether to loop |
| `format` | no | no | Build the two artifacts, run the code guardrail |

The model decides **what to look at** and **what it means**. It never touches the token, never
makes an API call, never builds the output.

**PLAN** gets the file tree for each claimed commit, plus a list of files that commit touched.
That list is only a hint — "look here first" — while the whole tree stays available. If the hint
is empty (a merge or first commit), planning just uses the tree.

**GATHER** reads each file and truncates at 15,000 characters. It never uses the model.

**ANALYZE** sees the file contents *and* the list of files it hasn't read yet, so when it asks
for more it is choosing from a real list rather than guessing. Each requirement is judged on its
own — never one pooled answer for the batch.

**FORMAT** assembles the evidence bundle and the report, and stamps `promptTemplateVersion` so a
verdict stays tied to the prompt that produced it.

---

## 4. State vs. context

Two different things travel through the graph.

**State** (`src/state.ts`) is plain data: the trees, the plan, gathered file contents, the tool
log, verdicts, the iteration count. All serialisable.

**Context** (`src/context.ts`) is the runtime stuff: the `GitHubReadTool`, the model id, the
deadline. It rides in `config.configurable`.

The split exists so the token never sits in state. It also keeps state clean enough to
checkpoint or log.

Two details worth knowing:

- Every file reference is `{ repo, path }`, so a path always knows which repo it came from.
- Verdicts merge by requirement ID, so a requirement decided in an early round isn't lost if a
  later round doesn't revisit it.

---

## 5. When the loop stops

All the bounds live in `src/limits.ts`. The loop is capped at 5 rounds. It ends when any of
these happen:

1. ANALYZE says it has enough evidence.
2. The cap is hit. ANALYZE is told to decide now, and the code overrides its flags so it can't
   vote to continue.
3. ANALYZE asks for more files but names nothing readable. Looping would re-run GATHER with
   nothing to do and show ANALYZE the exact same evidence.
4. The deadline passes.

---

## 6. Checking what the model returns

`withStructuredOutput` guarantees the *shape* of a response. It cannot know which requirement
IDs are real or which file paths exist. `src/validation.ts` handles that, and treats the two
nodes differently:

- **PLAN output gets filtered.** Paths that aren't in the tree are dropped and recorded. A
  planner naming a few bad paths is normal, and failing the run over it would be brittle. Only a
  plan with nothing usable gets sent back for a retry.
- **ANALYZE output gets repaired.** A missing, duplicated, or invented requirement ID can't be
  filtered around — there's nothing to fall back on. The model is told exactly what was wrong and
  asked again, up to twice.

If GitHub truncated a tree listing, unknown paths are allowed through instead of dropped. The
file may exist in a part of the tree that was never listed.

---

## 7. Keeping source code out of the report

A rationale may cite `src/auth.ts, lines 15-30`. It may not contain the code itself. The
stakeholder never sees the repo, and the report is the one thing they always see.

Three layers:

1. A rule in the ANALYZE prompt.
2. The same rule on the Zod field description, right where the model fills it in.
3. `containsCode()` at FORMAT time — ten patterns, needing two matches, since one alone flags
   ordinary prose like "the function handles authentication".

If layer 3 fires, the whole rationale is replaced and the verdict kept. Partial redaction that
leaks a few lines would be worse than an unhelpful sentence.

---

## 8. Errors and retries

**The report is all-or-nothing.** It is visible the moment it exists, and there's no draft state
to hide a bad one in. So anything unrecoverable throws `EvaluationError` — no report, no status
written, the requirement keeps what it had.

This is why `Verdict` still has two values and `RequirementStatus` three. A failed request is not
a state a requirement sits in.

Everything runs against one deadline, from `EVAL_CEILING_SECONDS`. Retries check the remaining
budget before sleeping.

| What happened | What we do |
|---|---|
| File 404s, or is over 100 MB | No retry. It's a fact about the repo and feeds the verdict. |
| 429, rate-limited 403, 5xx, network error | 3 tries with backoff. Respects `Retry-After`, but fails fast rather than sleeping past the deadline. |
| 401, plain 403, unreachable repo or commit | Stop immediately. Retrying can't help. |
| Model call fails or won't parse | 3 tries with backoff. |
| Model output fails validation | 2 repair attempts, then stop. |

The 403 case needs care: GitHub uses one status for both a spent rate limit and a real
permission failure, and only the response headers tell them apart.

**If any transient failure is still unresolved after retries, the run stops.** Every planned path
was checked against the tree first, so an unresolved failure means a file we know exists and
couldn't read. A verdict over that gap wouldn't be sound.

**A verdict is a `done` frame. A failure is a `failed` frame. Never both, never neither.**
Streaming spends the HTTP status code before the outcome is known, so the original rule — a
verdict is a 200, a failure never is — is restated in its streaming form; see
`docs/plans/03-claim-submission.md`. What it protects is unchanged: an infrastructure failure
must never reach a stakeholder as "Not satisfied". The error-kind-to-status mapping survives
intact — 401, 429 (with `retryAt`), 404, 503, 422, 504, 400 — it now populates `failed.status`
instead of the response line, so none of them can be mistaken for a completed evaluation that
returned `not_satisfied`.

---

## 9. How the app calls it

`POST /api/projects/:projectId/claims` is the caller:

1. `requireSession()`, then validate the body and confirm every `requirementVersionId` and
   `projectRepoId` — each of these still keeps a true HTTP status code, since all of it runs
   before a byte of the response is written.
2. `createClaim()` writes the pre-evaluation transaction (`claims` + `claim_repos` +
   `claim_requirement_versions`) and returns the pinned commits and requirements.
3. Work out the deadline from `EVAL_CEILING_SECONDS`, then
   `createGitHubReadTool(token, { deadline, signal })`.
4. `evaluateStream()` — the route sends one `progress` frame per node the generator yields,
   then reads the two returned artifacts once it is done.
5. `recordEvaluation()` writes `evaluations`, `verdicts`, and the
   `requirement_versions.status` write-back together, in one transaction, only once both
   artifacts exist.
6. Send the terminal frame — `done` with the claim and evaluation id, or `failed` if anything
   above threw — and close the stream. The evidence bundle is persisted by `recordEvaluation`;
   no frame and no response ever carries it.

The token goes session → tool → GitHub, and nowhere else. `GitHubReadToolImpl` uses plain
`fetch` (no SDK), and always reads at the claimed commit SHA rather than live HEAD.

See `docs/plans/03-claim-submission.md` for the frame protocol and the full request
contract.

---

## 10. Configuration

| Variable | Purpose |
|---|---|
| `EVAL_CEILING_SECONDS` | Budget for one run. Default 300. |
| `EVAL_MODEL_ID` | Which Gemini model to use. Default `gemini-3.5-flash`. Recorded in every report. |
| `GOOGLE_API_KEY` | Read by LangChain directly. |

The provider is Gemini and isn't configurable. Only the model id is.

---

## 11. Tests

`npm run test` covers the pure logic: the code guardrail (both directions), the output
validators, verdict merging, retry backoff, and HTTP error classification. It also checks that
the graph compiles — the `StateGraph` is built at module load, so a topology mistake throws on
import, and nothing else in the suite imports it. None of this needs a network or a database.

The live end-to-end check is `tests/integration-manual.ts`. It hits a real repo and a real
model, so it's kept out of the test pattern by name — run it by hand:

```
GITHUB_TOKEN=... GOOGLE_API_KEY=... npx tsx packages/orchestrator/tests/integration-manual.ts
```

---

## 12. Not built yet

- **The Transparency Log.** `evaluations.evidence_hash` (SHA-256 over canonical JSON of the
  evidence bundle) is computed and stored at write time, ready to anchor — but there is no log
  to append it to yet, and no `verify()` a stakeholder could call.
- **A measure of quality.** No reference set, no comparison against human judgment, no
  regression suite. `modelId` and `promptTemplateVersion` exist so verdicts stay attributable
  when that work starts, but today there's no answer to "is it any good".
- **An offline test of a whole run.** The graph is checked for compiling, not for behaving. A
  fake `GitHubReadTool` and a stub model would make the loop and error paths testable without
  credentials.
- **Diff-based evaluation.** `diff()` exists but isn't used. Judging the change rather than the
  snapshot would need a decision about what to compare against.

---

## Where things live

```
contracts/src/evaluator.ts     contract, EvaluationError, artifact shapes
contracts/src/github.ts        GitHubReadTool, error kinds
orchestrator/src/state.ts      graph channels
orchestrator/src/context.ts    runtime deps and the deadline check
orchestrator/src/evaluator.ts  the graph
orchestrator/src/limits.ts     every bound, in one place
orchestrator/src/validation.ts checks the schema can't make
orchestrator/src/llm.ts        model access, retries, repairs
orchestrator/src/nodes/        plan, gather, analyze, format
github/src/read-tool.ts        HTTP, retries, error classification
```
