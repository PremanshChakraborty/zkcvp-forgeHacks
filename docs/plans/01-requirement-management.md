# Feature Plan: Requirement Management (incl. Projects & RBAC)

## Status
Design finalized. Ready for implementation.

## Purpose
This document specifies everything needed to implement the foundational slice of ZKCVP:
projects, the stakeholder/developer identity & membership model, and the requirement
checklist with its versioning and lifecycle. It intentionally excludes tech stack choices
(framework, database engine, ORM, hosting) and UI/visual specifications — those are
supplied separately. Every business rule, schema field, state transition, and API
contract needed to build this feature correctly is contained here.

## Scope

**In scope:**
- Stakeholder and developer identity models and authentication behavior
- Project creation and membership (stakeholders and developers)
- Developer invitation via GitHub identity lookup
- Requirement CRUD, versioning, and lifecycle (status state machine)
- Authorization rules for every action above

**Explicitly out of scope for this phase** (do not implement, do not design around
assumptions not stated here — these are separate, future plan documents):
- Repo attachment and commit visibility
- Commit-to-requirement claim submission and verification invocation
- The LangGraph verification agent and its file-reading tool
- Any stakeholder decision/approval step on verification results (there is none —
  verification outcome is fully automatic; see Lifecycle section)
- Stakeholder-invite UI/API (the data model supports multiple stakeholders per project,
  but only the project-creation path produces a stakeholder membership row in this phase —
  no endpoint exists yet to invite an *additional* stakeholder)
- The transparency log / tamper-evidence layer (deliberately deferred until this feature
  and the ones after it exist end-to-end)

## Core concepts

- **Stakeholder**: a human who creates projects and defines requirements. Authenticates
  via email (magic link). Never has a GitHub identity in this system.
- **Developer**: a human who does implementation work and (in a later phase) attaches
  repos and submits verification claims. Authenticates via GitHub OAuth exclusively,
  requesting `repo` scope so the same token later authenticates repo reads — see
  Identity & authentication behavior. There is no separate GitHub App/installation
  concept anywhere in this design; repo access is always the requesting developer's own
  live GitHub permission, never a service-level grant.
- **Project**: owned by one or more stakeholders; developers are added to it by a
  stakeholder.
- **Requirement**: a stable, long-lived identity ("this is one piece of scope") that
  never itself holds text or status.
- **Requirement version**: an immutable snapshot of a requirement's title/description at
  a point in time, plus the verification status *for that specific text*. Editing a
  requirement never mutates a version — it creates a new one.

Stakeholders and developers are modeled as **entirely separate entities**, not a single
`users` table with a role flag. Rationale: every action and every audit/actor field in
this feature (and, on inspection, in the rest of ZKCVP's design so far) is performed by
exactly one of the two — there is no field or query anywhere that needs to reference
"whichever kind of user did this." Separate tables give real, database-enforced foreign
keys and eliminate nullable-union columns (e.g. an `email OR github_id` column) that a
single-table design would otherwise require. A shared `AppUser` shape exists only at the
application/type level for generic UI chrome (nav bar, session display) — never in the
database and never in business logic.

## Data model

Types are described abstractly (string / uuid / enum / timestamp / boolean / FK) —
translate into whatever schema language the chosen stack uses.

### `stakeholders`
| field | type | notes |
|---|---|---|
| id | uuid, PK | |
| email | string, unique, not null | sole identity key |
| display_name | string, not null | |
| created_at | timestamp, not null | |

### `developers`
| field | type | notes |
|---|---|---|
| id | uuid, PK | |
| github_user_id | string/int, unique, not null | GitHub's **numeric** user ID — never the username. Usernames are mutable; this must not be. |
| github_username | string, not null | cached for display only; refresh on each login |
| display_name | string, not null | |
| avatar_url | string, nullable | |
| created_at | timestamp, not null | |

### `projects`
| field | type | notes |
|---|---|---|
| id | uuid, PK | |
| name | string, not null | |
| created_by | FK → stakeholders.id, not null | for display/audit only — **not** the access-control source of truth |
| created_at | timestamp, not null | |

### `project_stakeholders`
| field | type | notes |
|---|---|---|
| id | uuid, PK | |
| project_id | FK → projects.id, not null | |
| stakeholder_id | FK → stakeholders.id, not null | |
| added_by | FK → stakeholders.id, not null | |
| added_at | timestamp, not null | |

Unique constraint on (`project_id`, `stakeholder_id`).

### `project_developers`
| field | type | notes |
|---|---|---|
| id | uuid, PK | |
| project_id | FK → projects.id, not null | |
| developer_id | FK → developers.id, not null | |
| added_by | FK → stakeholders.id, not null | |
| added_at | timestamp, not null | |

Unique constraint on (`project_id`, `developer_id`).

### `project_developer_invites`
| field | type | notes |
|---|---|---|
| id | uuid, PK | |
| project_id | FK → projects.id, not null | |
| github_user_id | string/int, not null | resolved at invite time via GitHub's public API, never the raw username |
| github_username | string, not null | cached for display |
| invited_by | FK → stakeholders.id, not null | |
| status | enum: `pending`, `accepted` | |
| invited_at | timestamp, not null | |

Partial unique constraint on (`project_id`, `github_user_id`) where `status = 'pending'`
— prevents duplicate pending invites to the same person for the same project.

### `project_stakeholder_invites` (schema only — no API/UI in this phase)
| field | type | notes |
|---|---|---|
| id | uuid, PK | |
| project_id | FK → projects.id, not null | |
| email | string, not null | |
| invited_by | FK → stakeholders.id, not null | |
| status | enum: `pending`, `accepted` | |
| invited_at | timestamp, not null | |

This table exists so multi-stakeholder support requires no migration later. Do not build
an endpoint or UI that writes to it in this phase.

### `requirements`
| field | type | notes |
|---|---|---|
| id | uuid, PK | |
| project_id | FK → projects.id, not null | |
| current_version_id | FK → requirement_versions.id, nullable* | *nullable only transiently during the create transaction; never null once created |
| created_by | FK → stakeholders.id, not null | |
| archived_at | timestamp, nullable | soft-delete flag. Orthogonal to version status — see Lifecycle section |
| created_at | timestamp, not null | |

### `requirement_versions`
| field | type | notes |
|---|---|---|
| id | uuid, PK | |
| requirement_id | FK → requirements.id, not null | |
| version_number | integer, not null | starts at 1, increments per requirement |
| title | string, not null | |
| description | text, not null | |
| status | enum: `new`, `verified`, `eval_failed` | see Lifecycle section |
| created_by | FK → stakeholders.id, not null | |
| created_at | timestamp, not null | |

Unique constraint on (`requirement_id`, `version_number`).

### Forward references (not implemented in this phase — informational only)
A future `project_repos` table will hang off `project_id` and `developer_id` (added_by) —
no installation or access-token reference belongs on it; repo access is always checked
live via whichever developer is currently acting, never cached. A future verification-request
entity will reference a specific `requirement_version_id` plus one or more (repo, commit
sha) pairs, and will drive `requirement_versions.status` directly to `verified` or
`eval_failed` — synchronously, within the request that submits the claim. There is no
intermediate pending status anywhere in this design; see Lifecycle section. Do not build
either now; they are named here only so this phase's schema doesn't need to change shape
when they arrive.

## Identity & authentication behavior

Two entirely separate auth flows; there is no shared login form or shared session type
beyond the discriminated union described in Core concepts.

**Developer — GitHub OAuth**, requesting `repo` scope, on every successful callback:
1. Extract the authenticated GitHub numeric user ID, username, avatar.
2. Upsert `developers` by `github_user_id` (refresh cached `github_username`/`avatar_url`
   if changed since last login).
3. Query `project_developer_invites` where `github_user_id` matches and
   `status = 'pending'`. For each match, in a transaction: create the corresponding
   `project_developers` row (`added_by` = the invite's `invited_by`), set the invite's
   `status = 'accepted'`.
4. Establish a developer session, **retaining the OAuth access token in the session**
   (never persisted to a table). Later phases (repo attachment, claim verification) read
   repos using this same token, authenticated as this developer — never a separate
   service-level credential. This is also why those later operations must run
   synchronously within a live session: there is no stored token a background process
   could use once the session ends.

**Stakeholder — email magic link**, on every successful verification:
1. Upsert `stakeholders` by `email`.
2. (Same pattern as above against `project_stakeholder_invites`, for forward-compatibility
   once that feature ships — harmless no-op today since nothing ever writes a pending row
   there yet.)
3. Establish a stakeholder session.

Neither flow ever creates a row in the other role's table. A person who is both a
developer somewhere and a stakeholder elsewhere ends up as two unrelated rows — this is
accepted, not a bug, in this phase.

## Authorization matrix

| Action | Stakeholder member of project | Developer member of project | Non-member |
|---|---|---|---|
| Create a project | ✅ (any authenticated stakeholder; becomes a member of the new project) | ❌ | n/a |
| List/view own projects | ✅ | ✅ | n/a |
| View a specific project's requirements | ✅ | ✅ | ❌ |
| Create a requirement | ✅ | ❌ | ❌ |
| Edit a requirement | ✅ | ❌ | ❌ |
| Archive a requirement | ✅ | ❌ | ❌ |
| Invite a developer | ✅ | ❌ | ❌ |
| List project members | ✅ | ✅ | ❌ |

All `project_stakeholders` rows on a project carry equal permissions — there is no
distinct "owner" tier above other stakeholders in this phase, even though `projects.created_by`
records who originally created it.

## Requirement lifecycle

### States (on `requirement_versions.status`)
- **`new`** — never had a verification attempt against this exact text.
- **`verified`** — most recent verification attempt against this version succeeded.
- **`eval_failed`** — most recent verification attempt against this version failed.

There is deliberately no `verification_pending` (or any other in-flight) state.
Verification runs synchronously within the request that submits a claim — the
developer's own browser waits on that single call, and status is written directly to
its terminal outcome once the Evaluator returns. Nothing is ever left mid-flight in a
way another session could observe.

There is no separate stakeholder approval step. Verification outcome is the terminal
authority — `verified`/`eval_failed` are set purely by the (future) automated verification
result, never by a stakeholder action.

A requirement's *effective* status is always its current version's status, resolved via
`requirements.current_version_id` — it must be **derived at read time (a join), never
stored redundantly on `requirements`.** Two copies of the same fact will desync.

### Transitions
| From | Trigger | To |
|---|---|---|
| `new` / `eval_failed` / `verified` | developer submits a claim (future phase); Evaluator returns synchronously within the same request | `verified` (satisfied) or `eval_failed` (not satisfied) |
| any status, via a requirement edit | new version created | new version always starts at `new`, regardless of the prior version's status |

Re-evaluation is allowed symmetrically from `new`, `verified`, or `eval_failed` — none of
the three is a dead end, and `verified` is deliberately not treated as more terminal than
the others (this phase does not implement the trigger for it, but the state field must
not prevent it later).

### No edit lock
A requirement may be edited or archived regardless of its current version's status —
there is no in-flight state to protect against (see States, above). The one residual
race — a stakeholder edits the text while a synchronous evaluation against the
previously-current version is still running — is harmless: the Evaluator's result writes
to the specific `requirement_version_id` it was invoked against, never to "whichever
version is current," so a belated result lands on the now-superseded version's own row as
accurate history and has no effect on the requirement's current (post-edit) status.

### Archiving vs. status — do not conflate these
`archived_at` (on `requirements`) and `status` (on `requirement_versions`) are orthogonal.
Archiving removes a requirement from the active checklist view; it says nothing about
whether it was ever verified. Archiving has no status-based restriction — a requirement
can be archived regardless of its current version's status. There is no un-archive
endpoint in this phase — if reactivation is needed, create a new requirement.

## API contract

All endpoints below assume the session middleware has already resolved the caller into
either `{ kind: 'stakeholder', stakeholderId }` or `{ kind: 'developer', developerId }`
(or rejected the request as unauthenticated). Authorization checks below are in addition
to that.

### `POST /api/projects`
- Auth: stakeholder session.
- Body: `{ name: string }`.
- Effect (single transaction): create `projects` row (`created_by` = caller); create
  `project_stakeholders` row (`project_id`, `stakeholder_id` = caller, `added_by` = caller).
- Response: `201 { project }`.

### `GET /api/projects`
- Auth: any session.
- Effect: return projects where the caller has a `project_stakeholders` or
  `project_developers` row, according to caller's kind.
- Response: `200 { projects: [...] }`.

### `GET /api/projects/:projectId`
- Auth: caller must have a membership row (either table) on this project; else `403`.
- Response: `200 { project }`.

### `POST /api/projects/:projectId/developers/invites`
- Auth: stakeholder member of `:projectId`.
- Body: `{ githubUsername: string }`.
- Effect:
  1. Resolve `githubUsername` via GitHub's public user-lookup API to a numeric
     `github_user_id` + profile fields. If no such GitHub user exists, `404`.
  2. If a `developers` row already exists for that `github_user_id`: create a
     `project_developers` row directly (`added_by` = caller) — skip the pending-invite
     state entirely, since the person already has a resolvable identity in this system.
     If a `project_developers` row for this pair already exists, return `409` (already a
     member).
  3. Otherwise: create a `project_developer_invites` row (`status = 'pending'`,
     `invited_by` = caller). If a pending invite for this (`project_id`, `github_user_id`)
     already exists, return `409`.
- Response: `201 { membership }` or `201 { invite }` depending on which branch fired.

### `GET /api/projects/:projectId/developers`
- Auth: any member of `:projectId`.
- Response: `200 { members: [...], pendingInvites: [...] }`.

### `POST /api/projects/:projectId/requirements`
- Auth: stakeholder member of `:projectId`.
- Body: `{ title: string, description: string }` — both required, non-empty.
- Effect (single transaction): create `requirements` row (`project_id`, `created_by` =
  caller); create `requirement_versions` row (`version_number = 1`, `status = 'new'`,
  `created_by` = caller); set `requirements.current_version_id`.
- Response: `201 { requirement }` — flatten current version's `title`/`description`/`status`
  into the response object for convenience alongside the requirement's own fields.

### `GET /api/projects/:projectId/requirements`
- Auth: any member of `:projectId`.
- Query: `?includeArchived=true` (default false — excludes rows where `archived_at` is set).
- Response: `200 { requirements: [...] }`, each joined to its current version's fields.

### `GET /api/requirements/:id`
- Auth: any member of the requirement's project.
- Response: `200 { requirement, currentVersion, versionHistory: [...] }`. `versionHistory`
  is every version ordered by `version_number`, each with `title`, `description`, `status`,
  `created_at` — full history is cheap to expose now since versions are already stored
  immutably, and it costs nothing to make visible ahead of the later transparency-log work.

### `PATCH /api/requirements/:id`
- Auth: stakeholder member of the requirement's project.
- Body: `{ title?: string, description?: string }` — at least one field required.
- Preconditions: `404` if `archived_at` is set. No status-based precondition —
  editable in any status.
- Effect (single transaction, row-locked on the parent `requirements` row to serialize
  concurrent edits): create new `requirement_versions` row
  (`version_number` = current max + 1, `status = 'new'` unconditionally, unspecified
  fields carried over from the previous version, `created_by` = caller); update
  `requirements.current_version_id`.
- Response: `200 { requirement }` with the new current version.

### `DELETE /api/requirements/:id`
- Auth: stakeholder member of the requirement's project.
- Preconditions: none — archivable in any status.
- Effect: set `requirements.archived_at = now()`. Does not touch `requirement_versions`.
- Response: `204`.

## Invariants worth re-stating for implementation correctness

1. Foreign keys to a stakeholder or developer are always single-typed (`→ stakeholders.id`
   or `→ developers.id`) — never a nullable pair, never a polymorphic `actor_type` +
   `actor_id`. If a new feature seems to need "either kind of user" in one column, that's
   a signal to re-examine whether the action really is performed by both roles; so far in
   this design, none are.
2. `developers.github_user_id` (and every FK/comparison involving it) is the GitHub
   numeric ID, never `github_username`. The username is cache-only and must not be used
   as a join key or uniqueness key anywhere.
3. `requirement_versions` rows are never updated after creation except their `status`
   field (which is mutated only by the future verification-result trigger, not by this
   phase's endpoints). Title/description are immutable once a version exists.
4. A new `requirement_versions` row always starts at `status = 'new'`, unconditionally —
   this is what makes "editing a verified requirement reopens it" fall out for free,
   without special-case logic.
5. `requirements.archived_at` and `requirement_versions.status` are independent axes; never
   let one imply or overwrite the other.
