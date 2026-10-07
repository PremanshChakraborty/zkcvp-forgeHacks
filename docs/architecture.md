# Architecture

How ZKCVP is built and what is decided. `docs/plans/01-requirement-management.md` and
`docs/plans/02-repo-attachment.md` remain the authority on business rules — where this
document and those disagree about a rule, they win.

## Stack decisions

| Question | Decision |
|---|---|
| Repo layout | npm workspaces monorepo |
| Framework | Next.js **15.5.22, pinned exact**. React 19 |
| Auth | Auth.js v5 (`next-auth`, pinned exact), **two separate instances** |
| ORM / DB | Drizzle ORM over `pg`, against Supabase-as-hosted-Postgres |
| Magic-link delivery | Console transport behind a `MagicLinkSender` seam. No external provider |
| Tests | Vitest, integration-first against real Postgres |

Still deliberately open: the Transparency Log backend, evidence disclosure.

### Why Next 15, pinned exact

`next-auth@5` is a long-running beta validated against Next 15, not 16. Pinning removes a
compatibility risk at zero cost — nothing in the host-agnostic design needs a Next 16 feature.
`next-auth` is pinned exact for the same reason. React 19 matches what
`packages/design-system-ledger` already declares.

### Why Drizzle, and why Supabase is only Postgres

Drizzle emits readable `.sql` migrations and ships no query-engine binary, keeping cold starts
low on Vercel's serverless functions. Supabase supplies the Postgres instance and nothing else:
no `supabase-js`, no Row Level Security, no Supabase Auth. Authorization lives in the app layer
where plan 01's matrix is written. Moving to Neon, Railway, or local Postgres is a
connection-string change.

### Why two Auth.js instances

Plan 01 mandates two disjoint identity tables and no shared session type. Auth.js's adapter
interface assumes exactly one user table, and with an adapter present it routes OAuth sign-ins
through `adapter.createUser`/`linkAccount` regardless of session strategy — so a single
instance would need an adapter that inspects which provider is mid-call and writes to a
different table.

- **Developer** — GitHub provider, **no adapter**, JWT strategy. Auth.js needs no adapter for
  OAuth + JWT, so nothing tries to create a user row; the `developers` upsert happens in our
  own `signIn` callback.
- **Stakeholder** — custom `type: 'email'` provider with a small adapter mapping only to
  `stakeholders` and `verification_tokens`. It never sees a GitHub sign-in.

### Why email delivery is a seam

```ts
type MagicLinkSender = (args: { email: string; url: string }) => Promise<void>;
```

The stakeholder provider's `sendVerificationRequest` delegates to whichever sender `env.ts`
selects. Two senders ship: a console sender for development, and an SMTP sender selected by
the presence of `SMTP_HOST`. Adding the second cost one function and five env values —
provider, adapter, and token table were untouched, exactly as predicted. A domain-backed API
sender (Resend and similar) is the same shape again, should deliverability from an ordinary
mailbox stop being enough.

With `SMTP_HOST` unset the console sender is selected, so the full stakeholder flow stays
demoable with zero external configuration. `env.ts` validates the five SMTP values as a
group: a half-configured mailbox fails at startup rather than degrading to console logging,
which in production would post sign-in links to the server log while the deployment still
looked healthy.

---

## Repository layout

```
zkcvp/
├── apps/
│   └── web/                      Next.js — UI, CRUD API, orchestrator entrypoint
├── packages/
│   ├── contracts/                Evaluator I/O types, domain enums, GitHub tool interface
│   ├── db/                       Drizzle schema, migrations, client factory
│   ├── github/                   GitHub client — token funnel; methods added as needed
│   ├── design-system-ledger/     tokens, components, gallery
│   └── orchestrator/             LangGraph Evaluator — built in a parallel workstream
└── docs/
```

One deployable: Next transpiles workspace packages into the same bundle via
`transpilePackages`.

**Dependency rule:** packages never depend on `apps/web`. `packages/orchestrator` depends only
on `@zkcvp/contracts` in production — it receives a `GitHubReadTool` as a parameter and never
imports a concrete implementation.

---

## Status

Built: the workspace, `apps/web` with the design system wired in, `@zkcvp/contracts`,
and `@zkcvp/db` with all 10 tables migrated to Supabase (Gate A done — `DATABASE_URL` is
populated in `apps/web/.env.local` and `packages/db/.env`, both gitignored).

**M3 is built and Gate B is done.** Both Auth.js instances, `packages/github`'s token
funnel, session resolution, and the login pages are wired against the real Postgres
schema. Identity upsert, invite-acceptance, and the authorization matrix are
integration-tested. Both flows are confirmed end-to-end against the live database: the
stakeholder magic link (request → console link → callback → session cookie → row) and
the developer GitHub sign-in (a real `developers` row carrying the numeric
`github_user_id`, cached username and avatar).

`AUTH_SECRET`, `AUTH_GITHUB_ID` and `AUTH_GITHUB_SECRET` are all populated in
`apps/web/.env.local`.

**M4 is built.** All ten endpoints (`/api/projects` and its subroutes, `/api/requirements/:id`
and its subroutes), `resolveGithubUser` in `packages/github`, `apps/web/middleware.ts`, and the
seven stakeholder-facing screens — `/projects`, `/projects/new`, `/projects/[id]`,
`/projects/[id]/requirements/new`, `/requirements/[id]`, `/requirements/[id]/edit`, and
`/projects/[id]/members` — are wired against the real Postgres schema and integration-tested.

Plan 02's repo attachment has since landed on the same foundation: six more endpoints under
`/api/projects/:projectId/repos`, reusing the same `ServiceError` → JSON shape rather than
inventing one, and an eighth screen, `/projects/[id]/repos`. Plan 03's claim submission (M6
below) adds two more of each: eighteen endpoints and ten screens are wired and
integration-tested in total.

Known limitation, deliberately unaddressed in M4: nothing in `apps/web` catches a
`SessionError` or a `ServiceError` thrown from a Server Component, and there is no
`error.tsx` or `global-error.tsx` anywhere in `apps/web`. Middleware only checks cookie
presence, so an authenticated developer who is not a stakeholder can navigate to a
stakeholder-only page such as `/projects/new` and gets Next's generic framework error page
rather than a designed state. Four Server Actions (`projects/new/actions.ts`,
`projects/[id]/requirements/new/actions.ts`, `requirements/[id]/edit/actions.ts`,
`requirements/[id]/actions.ts`) let a thrown `ServiceError` escape the same way. The most
reachable case needs no role confusion at all: any member opening
`/requirements/<stale-or-mistyped-id>` gets `ServiceError(404)` from `loadRequirement` and
the same generic framework error page. The project owner decided not to address this in M4.

Next: **the Transparency Log** — the only piece of `docs/plans/03-claim-submission.md` not
yet built.

---

## M3 — OAuth and the GitHub token funnel (built)

Deliberately small: get both login flows working end to end, and stand up the seam that hands
a developer's GitHub token to whoever needs it. Nothing more — no GitHub API surface, no read
tool. Ordered before the plan-01 API so the orchestrator workstream has a real token source to
build against.

```
/api/auth/dev/*   GitHub provider · no adapter · JWT strategy
/api/auth/sh/*    custom email provider · stakeholders-only adapter · JWT strategy
```

**Developer callback** (plan 01, Identity & authentication):

1. Extract GitHub numeric user ID, username, avatar.
2. Upsert `developers` by `github_user_id`, refreshing cached `github_username`/`avatar_url`.
3. In one transaction: for every `project_developer_invites` row matching that
   `github_user_id` with `status = 'pending'`, create the `project_developers` row
   (`added_by` = the invite's `invited_by`) and set the invite to `accepted`.
4. Establish the session, retaining the OAuth access token **in the encrypted JWE cookie
   only** — never written to a table, never logged, never in an API response.

**Stakeholder callback**: upsert `stakeholders` by email; equivalent (currently no-op) pass
over `project_stakeholder_invites`; establish the session.

**Session resolution** — the only place plan 01's authorization matrix is expressed. No
authorization logic is duplicated into route handlers, server components, or middleware.

```ts
type Session =
  | { kind: 'stakeholder'; stakeholderId: string }
  | { kind: 'developer'; developerId: string; githubAccessToken: string };

requireSession(): Promise<Session>                                // 401
requireStakeholder(): Promise<StakeholderSession>
requireDeveloper(): Promise<DeveloperSession>
requireProjectMember(projectId): Promise<Session>                 // 403
requireStakeholderMember(projectId): Promise<StakeholderSession>  // 403
```

**Middleware carries no authorization** — unauthenticated redirects only. Middleware runs on
Edge on Vercel and in Node self-hosted; keeping authorization out of it eliminates the largest
behavioural difference between deployment targets.

`apps/web/middleware.ts` itself is written in **M4**, not here — M3 shipped no page that needed
a redirect, and the stakeholder screens are its first real consumer.

### `packages/github` — token funnel only

M3 creates this package with **only** the auth-token plumbing: a client constructed from a
developer's session access token, and nothing else. No fetch calls, no API methods.

```ts
// the whole M3 surface
export function createGitHubClient(accessToken: string): GitHubClient;
```

Native `fetch`, no SDK, no dependency on Next.js. Methods get added **as a caller actually
needs them**, not up front — `resolveGithubUser` arrives in M4 with the invite endpoint.

**The `GitHubReadTool` implementation is not built here.** Reading repo contents at pinned
commits is the orchestrator workstream's concern; it owns that implementation and takes a
token. `apps/web`'s job is to hold the token in the session and hand it over — that seam is
what this package is for.

Wiring the two together end-to-end (a disposable endpoint that constructs a read tool and
calls `evaluate()`) belongs to whoever has a working read tool first. Not M3.

> **✅ Gate B — GitHub OAuth app.** Done. Supplies `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`,
> requesting `repo` scope — no GitHub App, no installation, no service credential.
> Stakeholder login needed no gate; the magic link prints to the console.

Login pages ship here, styled with Ledger components: `/login`, `/login/email`,
`/login/error`.

### The `@auth/core` patch — required, not optional

`patches/@auth+core+0.41.3.patch` moves three `let` declarations inside `assertConfig`.
Upstream keeps `hasCredentials`/`hasEmail`/`hasWebAuthn` at **module scope**, sets them to
`true`, and never resets them. Two Auth.js instances in one process therefore share them:
once the stakeholder instance (email provider) asserts, the adapter-less developer instance
is told *"Email login requires an adapter"* and **every GitHub sign-in 500s**.

It is order-dependent and so looks intermittent — GitHub login works on a freshly started
server right up until something touches the stakeholder flow. It also reports itself as a
*second*, unrelated `UnknownAction` error, because the config failure redirects to a signin
page that rejects the provider id in the path.

Adding an adapter to the developer instance is **not** an alternative: with one present,
`handle-login.js` calls `createUser` + `linkAccount` on the OAuth path unconditionally,
regardless of session strategy, which would write developers through the stakeholder-shaped
adapter and break the two-disjoint-tables rule.

- `0.41.3` is the latest published `@auth/core`, and `next-auth@5.0.0-beta.32` the latest
  v5 beta — there is no version to upgrade to. Both are pinned exact, so the patch cannot
  drift silently; `patch-package` fails the install if the target file changes.
- `apps/web/tests/auth/authjs-patch.test.ts` guards it. The failure mode is silent and
  delayed, so this test is the thing that catches `npm ci --ignore-scripts` or a fresh
  clone whose `postinstall` never ran.
- **After applying or changing the patch, delete `apps/web/.next`.** Webpack's persistent
  cache keeps the pre-patch copy of `@auth/core` and does not invalidate on the patch, so
  the bug appears to survive a fix that is actually applied. This cost real debugging time.
- `postinstall` runs `patch-package`, which is a **devDependency** — a deploy step doing
  `npm ci --omit=dev` will fail on it. Install with dev dependencies present (which a Next
  build needs anyway), or promote the dependency.

### `trustHost`

Both instances set `trustHost: true` in `lib/auth/base-config.ts`. Auth.js's default is
`!!(AUTH_URL ?? AUTH_TRUST_HOST ?? VERCEL ?? CF_PAGES ?? NODE_ENV !== "production")`, and
it is the *first* check in `assertConfig`. On the self-hosted Node targets this project
commits to, none of those are set in production — so the default is `false` and **both
logins would 500 in production**, while working fine in development off the last clause.

Setting `AUTH_URL` in production is strongly recommended alongside it: Auth.js then builds
callback URLs from that value instead of the request's `Host` header, which is what makes
trusting the proxy safe.

---

## M4 — Requirement management and the stakeholder UI

Plan 01's ten endpoints plus the stakeholder-facing screens, built together rather than as two
separate passes. `packages/github` gains `resolveGithubUser` here — the invite endpoint is its
first real caller. Keep adding GitHub methods only when a caller needs one.

All ten endpoints, test-first:

```
POST   /api/projects
GET    /api/projects
GET    /api/projects/:projectId
POST   /api/projects/:projectId/developers/invites
GET    /api/projects/:projectId/developers
POST   /api/projects/:projectId/requirements
GET    /api/projects/:projectId/requirements
GET    /api/requirements/:id
PATCH  /api/requirements/:id
DELETE /api/requirements/:id
```

### Where the rules live

```
apps/web/
├── middleware.ts               cookie-presence redirect to /login. No authorization.
├── lib/
│   ├── db.ts                   getDb()
│   ├── api/errors.ts           ServiceError(status, code, message)
│   ├── api/respond.ts          ServiceError | SessionError → JSON. The only catch block.
│   ├── projects/service.ts     createProject, listProjects, getProject,
│   │                           assertStakeholderMember
│   ├── projects/members.ts     listMembers, inviteDeveloper
│   ├── requirements/service.ts createRequirement, listRequirements, getRequirement,
│   │                           loadRequirement
│   └── requirements/mutate.ts  editRequirement, archiveRequirement
├── app/api/…                   ten route handlers, thin JSON adapters
└── app/(screens)               Server Components + Server Actions
```

Every service function is shaped `(db, session, args)` and calls the predicates in
`lib/auth/authorization.ts` itself, throwing `ServiceError(403)`. Route handlers and Server
Components both call these services; **neither contains a rule**. This is what stops the REST
path and the Server Component path from diverging — they are the same function.

`requireSession()` remains the cookie boundary — *who is this*. Services answer *may they do
this*. `requireProjectMember`/`requireStakeholderMember` in `session.ts` are page-level
conveniences over the same predicates, so each rule still has exactly one implementation.

Uniform error body across all eighteen endpoints — plan 01 fixes the status codes and shape for
its ten, and plan 02's six repo endpoints plus plan 03's two claim endpoints reuse the same
`ServiceError` rather than defining their own. The one exception is
`POST /api/projects/:projectId/claims`: once its response has started streaming, a failure
cannot carry a status line, so it arrives instead as a terminal `failed` frame in the body
(see M6) rather than this JSON shape:

```json
{ "error": { "code": "conflict", "message": "Already a member of this project" } }
```

`unauthenticated` 401 · `forbidden` 403 · `not_found` 404 · `conflict` 409 ·
`invalid_body` 400 (Zod issues attached) · `github_unavailable` 503.

### Two behaviours carry real concurrency risk

- **Requirement create** is one transaction: `requirements` row → `requirement_versions` row
  (`version_number = 1`, `status = 'new'`) → set `current_version_id`. The nullable
  `current_version_id` exists only for the width of this transaction.
- **Requirement edit** takes `SELECT ... FOR UPDATE` on the parent `requirements` row before
  computing `version_number = max + 1`. Without it, concurrent edits collide on the
  `(requirement_id, version_number)` unique constraint.
- **Developer invite** does not check-then-insert. The partial unique index on
  `(project_id, github_user_id) where status = 'pending'` is the arbiter; a duplicate surfaces
  as a unique violation and is translated to 409.

A new `requirement_versions` row always starts at `status = 'new'` unconditionally (plan 01
invariant 4) — this is what makes "editing a verified requirement reopens it" fall out with no
special-case logic. It must not become conditional. It is written explicitly at the insert
rather than left to the column default, so the invariant is visible at the line that could
break it.

### `resolveGithubUser` is unauthenticated, and that is a rate limit

The caller is a stakeholder, who has no GitHub token, and plan 01 forbids any service-level
credential — so `GET /users/{username}` goes out unauthenticated, which GitHub caps at **60
requests/hour per IP, shared by every stakeholder on the deployment**.

A 403/429 carrying `x-ratelimit-remaining: 0` must map to **503 `github_unavailable`**, never
to 404. Reporting exhaustion as "no such user" would tell a stakeholder something false about
a real person. This is an infrastructure failure and renders as such — `Alert tone="danger"`,
never ink.

### Screens

Ledger ships no modal and no pagination, so create and edit are routed pages with inline forms.

| Route | Renders |
|---|---|
| `/projects` | project list, `EmptyState` when none |
| `/projects/new` | name field |
| `/projects/[id]` | checklist, `ChecklistProgress`, links to `/projects/[id]/members` and `/projects/[id]/repos` |
| `/projects/[id]/requirements/new` | title + description |
| `/requirements/[id]` | detail plus version history as a `Timeline` |
| `/requirements/[id]/edit` | prefilled title + description |
| `/projects/[id]/members` | members, pending invites, stakeholder-only invite form |
| `/projects/[id]/repos` | attached repos, developer-only attach form with 60-second undo |

`/projects` and `/projects/[id]` are built role-aware in one pass — stakeholders get the
create/edit/archive actions, developer members get the same data read-only. Same query, one
conditional on `session.kind`, no rewrite when M5 lands.

Mutations are Server Actions in `actions.ts` beside each page, following
`app/login/email/actions.ts`: `requireStakeholder()` → `getDb()` → service → `revalidatePath`
→ `redirect`. Validation failures return through `useActionState` into `Field`'s `error` prop,
never a thrown error page.

---

## M5 — Remaining checklist screens

All seven routes below were delivered during M4, built role-aware from the start rather than
revisited later (see M4, Screens — `/projects` and `/projects/[id]` share one query with a
single `session.kind` conditional; `/requirements/[id]` and `/projects/[id]/members` follow the
same pattern). This table is kept as the role-split reference, not a list of pending work.

| Route | Role | Notes |
|---|---|---|
| `/projects` | both | project list |
| `/projects/new` | stakeholder | |
| `/projects/[id]` | both | checklist, `ChecklistProgress`, links to `/projects/[id]/members` and `/projects/[id]/repos` |
| `/projects/[id]/requirements/new` | stakeholder | routed page, not a dialog |
| `/requirements/[id]` | both | detail plus version history as a `Timeline` |
| `/requirements/[id]/edit` | stakeholder | routed page, not a dialog |
| `/projects/[id]/members` | both | list; invite form is stakeholder-only |
| `/projects/[id]/repos` | both | list; attach form and undo are developer-only |

Ledger ships no modal and no pagination — deliberately absent until a real caller shapes their
API. Create and edit are routed pages with inline forms. If a dialog proves necessary it is
added to the design system properly, with a render-check assertion, not hand-rolled in the app.

Display rules, all already encoded in the Ledger components:

- The string `eval_failed` never reaches a screen. `StatusBadge` renders it as **"Not
  satisfied"** — a legitimate verdict, not a malfunction.
- Infrastructure failures use `SystemErrorBadge` / `Alert tone="danger"` in red, never ink.
- `archived` is not a fourth status; it dims the title, keeps the badge, takes a dashed chip.
  `RequirementDisplayStatus` folds the two axes for display only and is never persisted.
- Dates are absolute, never relative.
- Language stays relationship-neutral — never "client", "investor", or "manager".

---

## M6 — Repo attachment and claim submission

Plan 02 and plan 03 land together, completing the web app short of the Transparency Log.

Repo attachment: six endpoints under `/api/projects/:projectId/repos`, `packages/github`
gains `listUserRepos`, `listBranches`, and `listCommits`, and `/projects/[id]/repos` lets a
developer attach a repo picked from what their own GitHub account can already see, with a
60-second undo.

Claim submission: five tables — `claims`, `claim_repos`, `claim_requirement_versions`,
`evaluations`, `verdicts`. `POST /api/projects/:projectId/claims` validates the request,
opens a transaction writing `claims` + `claim_repos` + `claim_requirement_versions`, then
streams newline-delimited JSON: progress frames from `evaluateStream()`, followed by exactly
one terminal frame, `done` or `failed`. A `done` frame is written only once a second
transaction has recorded `evaluations`, `verdicts`, and the `requirement_versions.status`
write-back together; a thrown evaluation writes none of the three, so a failure never leaves
a status behind. `GET /api/claims/:id` returns a claim, its pinned commits, and its
verdicts — never the evidence bundle, which is stored and hashed (`evidence_hash`, a
SHA-256 over canonical JSON) but returned by nothing.

Screens: `/projects/[id]/claims/new` composes a claim and watches it run; `/claims/[id]`
shows verdicts, pinned commits, and a withheld-evidence affordance; `/requirements/[id]`
folds the latest verdict into its Timeline.

---

## Host-agnostic guarantees

The deployment host is Vercel as of 2026-08-18. The guarantees below were kept rather than
spent: no `vercel.json`, no Vercel primitives, no edge runtime, and `output: 'standalone'`
still emits a runnable Node server. Moving to a long-lived Node host stays a redeploy, not
a rewrite — which matters because Vercel's function limit is 60 seconds on the current plan
and can truncate a run that a long-lived host would finish.

| Concern | Commitment |
|---|---|
| Build output | `output: 'standalone'` — self-contained Node server. Runs under `node server.js` on Railway/Render/Fly/Docker; ignored by Vercel |
| Runtime | Node everywhere. No `export const runtime = 'edge'` |
| DB driver | `pg` over a pooled connection string. Not `@vercel/postgres`, not an HTTP driver |
| Session | Stateless encrypted JWT cookie. No session table, no sticky sessions — also forced by token custody |
| Vercel primitives | None. No `waitUntil`, no `@vercel/blob`, no `vercel.json` crons |
| Middleware | Unauthenticated redirects only |
| Evaluator | A plain `async` function behind the `Evaluator` interface; the route handler is a thin adapter |
| Execution ceiling | `EVAL_CEILING_SECONDS`, read at runtime. 60 on Vercel (its function limit on the current plan); default 300 otherwise. Feeds `EvaluationProgress`'s `ceilingSeconds` |

Accepted consequence: Vercel Cron and edge-middleware performance are unavailable. Neither is
needed.

---

## Testing

Vitest, integration-first, against real Postgres (`packages/db/tests/harness.ts`). Handlers are
written after their tests.

The orchestrator's live end-to-end check is `packages/orchestrator/tests/integration-manual.ts`,
which hits a real repo and a real model. It is kept outside the `*.test.ts` include by its name
rather than by an exclude rule: the directory-wide exclude it used to need also hid the pure
unit tests beside it (the code guardrail, the model-output validators, the retry policy), none
of which touch a network or a database. Run it by hand with
`GITHUB_TOKEN=... GOOGLE_API_KEY=... npx tsx`.

### The harness, and what not to undo

Against a hosted database the whole cost is round trips, and the harness is shaped around them.
Each piece looks removable until you know why it is there:

- **One schema per test FILE**, memoised in module scope, with `TRUNCATE ... RESTART IDENTITY
  CASCADE` between tests. A schema per *test* costs ~32 round trips each and took the suite
  from 90s to 313s.
- **The migration is one multi-statement query.** Postgres runs semicolon-separated statements
  in a single round trip when there are no bind parameters, and in an implicit transaction, so
  a partial failure cannot leave a half-built schema. Check for `CREATE INDEX CONCURRENTLY`,
  `VACUUM`, or `REINDEX` before relying on it.
- **Teardown is an `afterAll` from `setupFiles`** (`packages/db/tests/setup.ts`), which runs
  once per file. Required, not tidiness: the module-level pool keeps the worker's event loop
  alive and Vitest hangs at exit without it.
- **The stale-schema sweep is age-gated** on the timestamp in the schema name. Workers sweep
  concurrently; an ungated sweep drops a sibling worker's live schema mid-test.
- **Tests within a file run sequentially, and that is load-bearing.** `test.concurrent` would
  make them share a schema concurrently, and the fixtures' reused emails would collide on the
  unique index.

Connection errors — `sorry, too many clients already`, `remaining connection slots are reserved
for roles with the SUPERUSER attribute`, `(EMAXPOOLSREACHED) max pools count reached` — mean
fixing what the harness opens per file, **not** lowering the worker count, which hides the cause
and doubles the runtime. `DATABASE_URL` is the Supavisor transaction pooler, which cannot share
a backend between clients whose startup parameters differ, so a unique `search_path` per
connection defeats pooling entirely. These arrive as scattered, unrelated-looking test failures
rather than a resource message, so a green run is the only evidence that counts.

Coverage targets invariants that actually break, not line count: new versions starting at
`new` (including from `verified`), partial-index behaviour on duplicate pending invites, the
invite-to-existing-developer branch, every cell of plan 01's authorization matrix, archiving in
any status, and `resolveGithubUser` mapping a rate-limited response to 503 rather than 404.

Tests live at the service layer, since that is where the rules are — `(db, session, args)`
functions exercised directly under `withTestSchema`, not over HTTP.

Two mechanisms are implemented but deliberately **not** covered by tests: the `db.transaction`
in `createRequirement` and the `SELECT ... FOR UPDATE` in `editRequirement`. Both are load-bearing
(see M4, "Two behaviours carry real concurrency risk") and a regression in either is silent — if
this suite ever grows, they are the first things to add back.

Two structural guardrails:

1. **Host-agnosticism** — asserts no `runtime = 'edge'` export and no `@vercel/*` import in
   `apps/web`. Extend to `packages/**` when a package gains a runtime adapter.
2. **Enum parity** — asserts `@zkcvp/contracts` domain enums match
   `packages/design-system-ledger/components/types.ts`, which is the UI-facing source of truth.
   The two packages have no compile-time link, so textual comparison is the only available
   check.

`npm run verify` runs typecheck, tests, and the design system's render check — the render check
is where the `eval_failed` display rule is actually enforced.

---

## Out of scope

The Transparency Log, stakeholder-invite endpoint or UI, un-archiving, evidence disclosure.
The Evaluator itself — see `docs/orchestrator.md`.
