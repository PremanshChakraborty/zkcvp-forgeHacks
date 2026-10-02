# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Committed in `README.md` before this record existed: Next.js (TypeScript) as one app carrying
UI, CRUD API, and the orchestrator entrypoint; Postgres for all relational state; LangGraph
(TypeScript) for the Evaluator, calling Gemini — the provider is fixed, not configurable; only
the model id is, via `EVAL_MODEL_ID`; a single deployable. The *host* is Vercel. The
host-agnostic guarantees the app was built with were kept rather than spent, so a move to a
long-lived Node host remains a redeploy, not a rewrite. The scaffold now exists as an npm
workspace: `apps/web` (Next.js) plus `packages/contracts`, `packages/db`,
`packages/orchestrator`, and `packages/design-system-ledger`.

## Users

Two roles, and they are not variants of one person — they have different access, different
vocabulary, and opposite relationships to the code.

- **Developer** — holds the private repo. Authenticates with GitHub OAuth (`repo` scope),
  attaches repos, browses commits, and submits claims. Technical; reads SHAs fluently.
- **Stakeholder** — defines requirements as a versioned checklist and reads verdicts. Has no
  repo access and no GitHub identity. Authenticates by email magic link.

**The stakeholder relationship is deliberately unspecified.** Confirmed with the user: it may
be an agency's client, a non-technical internal manager, an investor or grant funder, or an
open-source bounty funder. The product must serve all four, so product and interface
vocabulary stays relationship-neutral — never "client", "investor", "manager", or any word
that presumes who is paying whom or why access is withheld.

## Product Purpose

Lets a developer give a stakeholder verifiable progress updates without granting direct access
to a private repo. The stakeholder defines requirements; the developer claims specific commits
satisfy a specific requirement; an LLM agent independently reads the actual code at those exact
commits and renders a per-requirement verdict; the result is recorded and made tamper-evident.

Success is a stakeholder trusting a verdict about code they will never see, without being
misled about *why* that verdict is trustworthy.

## Positioning

Independent machine attestation over real source at pinned commits, with the record's integrity
separable from the judgment's correctness. Two mechanisms, deliberately distinct:

1. An LLM agent reads real code and reports its own judgment. Not cryptographically verifiable.
2. A transparency log makes the *record* of that judgment tamper-evident after the fact. It
   proves the report was not quietly altered later. It does **not** prove the judgment was correct.

Conflating those two is the single most damaging thing any surface could do.

## Operating Context

- Requirements live as a versioned checklist. Editing text creates a new version; verification
  status attaches to the specific version it was evaluated against, never to "whatever is current".
- A developer attaches repos picked from what their own GitHub account can already see — no
  separate installation or consent step, no service credential.
- The OAuth token lives only in the developer's session and is never persisted to a table. This
  is a deliberate custody choice, not a limitation.
- Because repo reads are authenticated as the requesting developer's own live token, evaluation
  runs **synchronously inside the request that submits the claim**. The developer's own browser
  holds that request open. This follows from token custody, not from the runtime, so it holds on
  any host.
- How much Evaluator work fits in one submission depends on the deployment host. The host is
  Vercel, whose function limit is 60 seconds on the current plan, so `EVAL_CEILING_SECONDS` is
  60 there; the default stays 300 for a long-lived Node host, which caps nothing. No surface may
  promise a bound tighter than the ceiling in force, and the in-flight experience must tolerate
  a wait up to that limit.
- A claim pins one requirement version set plus one or more `(repo, commit SHA)` pairs. The
  Evaluator reads those exact SHAs, never live HEAD.
- The Evaluator returns two structurally separate artifacts: an **evidence bundle** (raw tool-call
  transcript, contains real private source, stored but never shown in this phase) and a **report**
  (human language, unconditionally stakeholder-visible the moment evaluation completes).

## Capabilities and Constraints

- `requirement_versions.status` is `new` | `verified` | `eval_failed`. **`eval_failed` means the
  Evaluator returned *not satisfied*** — it is a legitimate result, not a malfunction. The enum
  name is misleading and must never reach a screen.
- Verdicts are `satisfied` | `not_satisfied`, one per requirement per evaluation.
- There is deliberately **no pending or in-flight state** anywhere, and **no human approval step**.
  Status goes directly to a terminal outcome inside the submitting request.
- `requirements.archived_at` and version status are **orthogonal**. Archiving says nothing about
  whether something was ever verified. There is no un-archive.
- Re-evaluation is symmetric from `new`, `verified`, or `eval_failed`. None is a dead end.
- Repo attachment is permanent past a 60-second undo window. No detach, no soft delete.
- `github_repo_id` and `github_user_id`, never display names, are the join keys.
- A report's `rationale` must never embed verbatim source code — file paths and line ranges are
  fine. This is a **generation-time constraint on the agent**, not a display-layer filter.
- Deliberately undecided: claim submission and verification invocation (request/response shape,
  mid-run rate-limit handling, in-flight UI); the transparency log backend; the auth library;
  any evidence-disclosure feature.
- **This build is a portfolio and demo piece.** Confirmed with the user: realistic placeholder
  content is acceptable and narrative clarity outranks exhaustive edge-case coverage. It does
  not license invented customers, metrics, or endorsements — see Evidence on Hand.

## Brand Commitments

Name: **ZKCVP**.

The "zero-knowledge" in that name is positioning language and **not a technical claim.** These
are binding and apply to every surface, including marketing copy:

- Never imply cryptographic zero-knowledge proofs or zkML exist anywhere in this system.
- Never imply on-chain smart-contract execution. If the transparency log ever anchors a
  checkpoint externally, that is cheap notarization, not execution.
- Never present the transparency log as evidence the LLM's judgment was correct.
- Never present a withheld evidence bundle as if it were unverifiable — integrity checking and
  content disclosure are separate operations, and the first never requires the second.

## Evidence on Hand

Real, in-repo:

- `README.md` — the map: trust model, stack, component contracts, non-goals, open questions.
- `docs/plans/01-requirement-management.md` — projects, RBAC, checklist, versioning, lifecycle.
- `docs/plans/02-repo-attachment.md` — repo attachment and commit visibility.
- `packages/design-system-ledger/` — the token layer, plain-CSS component layer, React TSX
  components, a runnable gallery, and static preview pages. Colour, font family, and spacing
  were ported from the user's Claude Design project "ZKCVP Design System"; type scale, radii,
  elevation, and motion are local. An earlier, darker visual direction was explored and
  removed; Ledger was a strict superset of it.

Absent, and **must not be fabricated**: customers, testimonials, case studies, logos, press,
pricing, licensing, uptime or accuracy benchmarks, evaluation-quality metrics, user counts, and
any deployment claim. There is no running deployment.

## Product Principles

1. **The developer's claim flow is the center of gravity.** Confirmed with the user: when the two
   sides conflict, serve the developer. If claiming is painful, nothing ever reaches a
   stakeholder and the stakeholder-facing side has nothing to show.
2. **Never let a naming artifact mislead.** `eval_failed` is a verdict; a rate limit is a failure.
   These are different events and no surface may render them as the same thing.
3. **Withheld is not unverifiable.** When content is hidden, the integrity affordance stays live
   and visible, because that distinction is the product's entire trust argument.
4. **Honesty about the trust model outranks impressiveness.** No surface borrows credibility from
   cryptography, blockchain, or determinism this system does not have.
5. **Stay relationship-neutral.** The stakeholder may be a client, a manager, a funder, or a
   stranger paying a bounty. Language that presumes which one breaks the other three.
