# Design: First Production Deployment

## Status
Design approved. Ready for implementation planning.

## Purpose

Put `apps/web` on a public URL where invited stakeholders can sign in unattended and
manage requirements. This is the first deployment of the project; no deployment
configuration exists in the repo today.

## Scope

**In scope:** a real email sender behind the existing `MagicLinkSender` seam, Vercel
project configuration, production environment variables, and end-to-end verification of
the stakeholder login flow against the live URL.

**Out of scope**, each by explicit decision rather than omission:

| Excluded | Why |
|---|---|
| Developer GitHub sign-in | Needs a second OAuth App registered against the production origin (an OAuth App permits one callback URL, and the existing one points at `localhost:3000`). `lib/env.ts` already marks `AUTH_GITHUB_ID`/`AUTH_GITHUB_SECRET` optional so the stakeholder flow works without it — a supported configuration, not a degraded one. Adding it later is two env vars and a redeploy, no code change. |
| Evaluator runs, LLM API keys | No evaluation path is being exercised. This is also what makes the host decision easy — see below. |
| Clearing seeded data | Project owner decided the seeded "Ledger Rollout" data stays. |
| `error.tsx` / `global-error.tsx` | The M4 known limitation (`docs/architecture.md` § Status) is unchanged by this work. |
| A migration step | One migration, `0000_awesome_black_tarantula.sql`, already applied to the database being reused. |

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Host | Vercel | The host was deferred (`docs/architecture.md` § Host-agnostic guarantees) pending a measured Evaluator run, because a serverless request ceiling could truncate one. With evaluations out of scope that constraint does not bind, leaving git-push deploys, TLS, and env management as the deciding factors. |
| Origin | Vercel-assigned `*.vercel.app` | No DNS work. Attaching a domain later is an `AUTH_URL` change and a redeploy. |
| Database | The existing Supabase project | Already migrated and working. Accepted consequence: dev and production share one dataset. |
| Email | SMTP via `nodemailer`, against an existing mailbox | Resend was the first choice and was rejected on a verified fact: its shared `onboarding@resend.dev` sender delivers only to the Resend account owner's own address, so reaching arbitrary stakeholder inboxes would require verifying a domain — and `*.vercel.app` DNS is not ours to edit. SMTP against a mailbox already owned sends to any recipient with no domain purchase and no DNS wait. |

The email decision does not constrain the app's origin: the sending identity and the
deployed hostname are independent. Moving to a domain-backed sender later is a change of
which function `getMagicLinkSender()` returns, which is what the seam exists to make cheap.

Vercel is chosen without surrendering host-agnosticism: no `vercel.json`, no Vercel
primitives, no edge runtime. The commitments in `docs/architecture.md` § Host-agnostic
guarantees all hold, so `output: "standalone"` stays meaningful for a future move even
though Vercel ignores it.

## Code change: selecting a sender

`docs/architecture.md` § "Why email delivery is a seam" specifies this change in advance —
"Adding Resend or SMTP later is one function and one env value — provider, adapter, token
table, and tests stay untouched." This implements that sentence and nothing beyond it —
with the one correction that SMTP takes five env values rather than one. The claim that
matters held exactly: the provider, adapter, and token table are untouched.

### `apps/web/lib/auth/magic-link-sender.ts`

Add `smtpMagicLinkSender`, built on `nodemailer`. `getMagicLinkSender()` returns it when
SMTP configuration is present and falls back to the existing `consoleMagicLinkSender`
otherwise.

Selection stays inside the existing function, which is already a function rather than a
constant so the choice is made at call time rather than at import time. That preserves the
property `lib/env.ts` documents at length: one build artifact must not behave differently
on two hosts because of a value baked in at build time.

The fallback is what keeps local development free of external configuration — the stated
goal that "the full stakeholder flow is demoable with zero external configuration".

### `apps/web/lib/env.ts`

Add `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` and `EMAIL_FROM`, all
optional, following the treatment `AUTH_GITHUB_ID`/`AUTH_GITHUB_SECRET` already receive:
absent credentials disable one delivery path rather than failing environment validation
for everyone.

`SMTP_HOST` is the single value that selects the sender. The remaining four are validated
as a group with it — a half-configured mailbox should fail loudly at startup rather than
silently fall back to logging sign-in links to the console in production, which is the one
failure mode here that looks like success.

### `apps/web/package.json`

Add `nodemailer` and `@types/nodemailer`.

### Tests

Written before the implementation, per the project's TDD workflow:

- `getMagicLinkSender()` returns the console sender when `SMTP_HOST` is absent.
- It returns the SMTP sender when SMTP configuration is present.
- A partial SMTP configuration is rejected rather than silently falling back.
- The SMTP sender sends to the requested address, from `EMAIL_FROM`, carrying the sign-in
  URL unaltered. The transport is mocked; no network call and no mail in the suite.

The Auth.js provider, the adapter, the verification-token table, and their existing tests
are untouched.

## Vercel configuration

No `vercel.json`. Everything below is project settings.

| Setting | Value | Rationale |
|---|---|---|
| Root Directory | `apps/web` | The deployable, per `docs/architecture.md` § Repository layout. |
| Install | Workspace-root `npm install` | `transpilePackages` and `outputFileTracingRoot` both resolve against the workspace root; the five workspace packages ship raw `.ts` and are compiled in-app. |
| Dev dependencies | **Installed** | `postinstall` runs `patch-package`, itself a devDependency, and the `@auth/core` patch is load-bearing. `docs/architecture.md:228` records that `npm ci --omit=dev` fails on exactly this. Vercel's default install keeps devDependencies, so this requires no override — only that no override be added. |
| Build | `npm run build` | Existing script. |

## Environment variables

| Variable | Value | Notes |
|---|---|---|
| `DATABASE_URL` | Existing Supabase transaction-pooler string | Same value as `packages/db/.env`. |
| `AUTH_SECRET` | **Newly generated** | Not the development value. A production secret that has lived in a local dotfile is not a production secret. |
| `SMTP_HOST` | Provider's SMTP host | Presence of this value selects the real sender. |
| `SMTP_PORT` | 587 (STARTTLS) typical | |
| `SMTP_USER` | Mailbox username | |
| `SMTP_PASSWORD` | **App password, not the account password** | Gmail and most providers require an app-specific password with 2FA enabled; the account password will be refused. |
| `EMAIL_FROM` | The mailbox's own address | Must match the authenticated mailbox, or the provider will reject the send. |
| `AUTH_URL` | `https://<assigned>.vercel.app` | See ordering below. |
| `EVAL_CEILING_SECONDS` | Unset | Defaults to 300 in `lib/env.ts`. No evaluation path runs. |

### Deploy ordering

`AUTH_URL` cannot be known before the first deploy assigns a hostname. The sequence is
therefore: deploy, read the assigned URL, set `AUTH_URL`, redeploy.

The redeploy is required, not cosmetic. Both Auth.js instances set `trustHost: true`
because the default would otherwise be `false` on a non-Vercel production host and 500
every login (`docs/architecture.md` § `trustHost`). With `trustHost` on and `AUTH_URL`
unset, callback URLs derive from the incoming `Host` header; setting `AUTH_URL` is what
removes host-header spoofing as a way to steer a callback, and is what makes trusting the
proxy safe.

## Verification

1. `npm run verify` locally — typecheck, tests, design-system check.
2. Against the deployed URL: request a magic link as a stakeholder, confirm the email
   arrives in a real inbox, follow it, confirm the callback sets the session cookie and
   lands on `/projects`.

Step 2 is the acceptance criterion. The console sender made this flow demoable without
configuration; the point of this work is that it now completes without anyone reading
server logs.

## Known conditions, accepted

- **Dev and production share one database.** Seeded data is visible to stakeholders, and
  local testing writes to live rows.
- **A stale or mistyped requirement ID renders Next's generic error page.** Pre-existing
  and recorded in `docs/architecture.md` § Status; more visible with real stakeholders.
- **`packages/db/src/client.ts` opens a pool of `max: 10` per instance.** Each serverless
  instance holds its own. Adequate for stakeholder traffic; revisit on connection errors.
- **`/ledger` is publicly reachable** — middleware matches only `/projects` and
  `/requirements`. It is the design-system demo page.
- **`/api/test-evaluate` is unreachable** in this configuration: gated by
  `requireDeveloper()`, and developer login is not configured. No action taken.
- **Magic links arrive from a personal mailbox.** Sign-in emails carry a personal address
  rather than a project one, and inherit that provider's sending limits (Gmail: roughly
  500/day). Adequate at invite volume. A domain-backed sender is the upgrade path, and the
  seam makes it a one-function change.

## Documentation to update

- `docs/architecture.md` § "Why email delivery is a seam" — currently states a console
  sender is the only implementation that ships.
- `docs/architecture.md` § Host-agnostic guarantees — record that a host is now chosen and
  that the guarantees are retained rather than spent.
- `.env.example` — the five new SMTP variables, and `AUTH_URL` guidance now that it is set.
