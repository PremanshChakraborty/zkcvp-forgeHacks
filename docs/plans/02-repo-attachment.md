# Feature Plan: Repo Attachment & Commit Visibility

## Status
Design finalized. Ready for implementation.

## Purpose
Lets a developer attach GitHub repos to a project and browse their commits, as the
foundation for the future claim-submission phase. Excludes tech stack, ORM, and UI specs.

## Scope

**In scope:** attaching/removing repos on a project, browsing branches, browsing commits.

**Out of scope** (future docs):
- Commit-to-requirement claim submission and verification invocation
- The LangGraph Evaluator (black-boxed — see README)
- Transparency log

## Core mechanism (recap — see README for full rationale)

No GitHub App, no installation, no service-level credential. Every GitHub call in this
feature is authenticated as the **acting developer's own session-held OAuth token**
(`repo` scope, granted at login per `01-requirement-management.md`). Nothing is cached
except the lightweight attachment record below — repo/branch/commit data is always
fetched live. There is no webhook-driven revocation: there's no installation to emit
webhooks, and no persisted access grant that could go stale.

## Data model

### `project_repos`
| field | type | notes |
|---|---|---|
| id | uuid, PK | |
| project_id | FK → projects.id, not null | |
| github_repo_id | string/int, not null | GitHub's numeric repo ID — stable across renames |
| full_name | string, not null | cached for display only; may go stale after a rename (GitHub's own redirect typically still resolves API calls) — no dedicated refresh mechanism in this phase |
| default_branch | string, not null | GitHub's own default branch, captured at attach time; for the claim composer to pre-select a branch from an `AttachedRepo` alone, without a fourth GitHub call this phase forecloses |
| added_by | FK → developers.id, not null | |
| added_at | timestamp, not null | |

Unique constraint on (`project_id`, `github_repo_id`) — same repo may be attached to
multiple *different* projects, never twice to the same one. No `status`/`removed_at`
field: removal only ever happens inside the undo window (below), so a hard delete is
sufficient — there's nothing worth keeping a tombstone for.

## Removal: undo window, not general detach

`DELETE` on a `project_repos` row succeeds only within **60 seconds** of `added_at`;
after that it always returns `409`. This is deliberately not a general "detach" feature —
once past the window, an attached repo is permanent for the life of the project. This
also means a future claim/verdict can never end up referencing a repo that's since been
removed from under it — that scenario simply can't occur.

## API contract

Auth model per `01-requirement-management.md` (`{ kind, stakeholderId | developerId }`).

| Endpoint | Auth | Notes |
|---|---|---|
| `GET /api/projects/:id/repos` | any project member | reads `project_repos` only — no live GitHub call, so stakeholders can view it too |
| `GET /api/projects/:id/repos/candidates` | developer member | live `GET /user/repos` (caller's token), minus repos already attached to *this* project |
| `POST /api/projects/:id/repos` | developer member | body `{ githubRepoId, fullName }`; `githubRepoId` is resolved against a fresh `GET /user/repos`, and `fullName`/`default_branch` are stored from GitHub's own answer, never the client's copy; `404` if the id is not visible to the caller's token, `409` if already attached to this project |
| `DELETE /api/projects/:id/repos/:repoId` | developer member | `409` if outside the 60s undo window |
| `GET /api/projects/:id/repos/:repoId/branches` | developer member | live `GET /repos/{owner}/{repo}/branches` (caller's token) |
| `GET /api/projects/:id/repos/:repoId/commits?ref=` | developer member | live `GET /repos/{owner}/{repo}/commits?sha={ref}` (caller's token), first 50 |

## GitHub API calls made in this feature — all using the acting developer's own token

- [ ] `GET /user/repos` — list the developer's own repos, for the attach picker
- [ ] `GET /repos/{owner}/{repo}/branches` — list branches, for the branch picker
- [ ] `GET /repos/{owner}/{repo}/commits?sha={ref}` — list commits on the selected branch/ref

No other GitHub call happens anywhere in this feature. None use a service-level or
app-level credential — every one of the three succeeds or fails purely on the current
developer's own live GitHub permission at the moment of the call.

## Authorization matrix

| Action | Stakeholder member | Developer member | Non-member |
|---|---|---|---|
| View attached repos | ✅ | ✅ | ❌ |
| Browse candidate repos / branches / commits | ❌ (no GitHub identity) | ✅ | ❌ |
| Attach a repo | ❌ | ✅ | ❌ |
| Remove a repo (within undo window) | ❌ | ✅ | ❌ |

## Invariants worth re-stating

1. `github_repo_id`, never `full_name`, is the join key — same rule as `developers.github_user_id` vs. `github_username`.
2. Nothing here persists a GitHub credential; the developer's token lives only in their session (per `01-requirement-management.md`).
3. Repo attachment is permanent past the 60s undo window — no detach, no soft-delete state, no cascading-removal case to design for later.

## Recorded deviations

- **Commit browsing is one page of 50, not paginated.** `GET /repos/{owner}/{repo}/commits` is
  called once with `per_page=50` and nothing links to a second page. Ledger ships no pagination
  component, and adding one before a real caller shapes its API is speculative work this codebase
  avoids. The claim screen picks from that first page; if 50 proves too few in practice,
  pagination is an additive change to the commits endpoint alone.
- **No default-branch pre-selection in the UI yet**, though `project_repos.default_branch` is now
  persisted at attach time specifically so the claim composer can read it straight off an
  `AttachedRepo` when that screen is built, rather than needing a fourth GitHub call this phase
  forecloses.
- **The candidate list is capped at the 100 most recently updated repositories** — `GET
  /user/repos` is called once with `per_page=100&sort=updated`, unpaginated, for the same reason
  commit browsing is: no pagination component exists yet. A developer whose repo falls outside
  that window has no way to attach it from the picker today. The zero-candidates copy in
  `AttachRepoForm` says so rather than claiming every repository is already attached, which would
  not always be true.
- **A permanently revoked grant reads the same as a transient outage.** GitHub returns 403 both
  for an exhausted rate limit and for a real, permanent loss of access (the developer removed the
  app's grant, or lost repo access entirely). `authedJson` in `packages/github` tells the two
  apart only by the `x-ratelimit-remaining` header; a non-rate-limited 403 still surfaces as
  `GithubUnavailable` / `github_unavailable` with "Try again shortly," which is the wrong message
  for a failure that retrying cannot fix. This is fine while the only consequence is a developer
  re-trying a picker. It must be fixed — a distinct error type or code for a genuine permission
  failure — before the evaluator path ships, where the same ambiguity would tell a stakeholder a
  verification is temporarily stalled when it is permanently blocked.
