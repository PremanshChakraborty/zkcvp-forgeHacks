# Production Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy `apps/web` to Vercel with working magic-link email, so invited stakeholders can sign in unattended.

**Architecture:** `apps/web/lib/auth/magic-link-sender.ts` already exposes a `MagicLinkSender` seam that `StakeholderEmailProvider` calls through. This adds a second implementation of that seam backed by SMTP, selected at call time by the presence of `SMTP_HOST`. The Auth.js provider, the adapter, and the verification-token table are not touched. Vercel is then configured through project settings only — no `vercel.json`, preserving the host-agnostic commitments in `docs/architecture.md`.

**Tech Stack:** Next 15.5.22 (pinned exact), Auth.js v5 beta, nodemailer, Zod 4, Vitest 4, npm workspaces, Vercel, Supabase Postgres.

**Spec:** `docs/superpowers/specs/2026-08-18-production-deployment-design.md`

## Global Constraints

- **Never install with `--omit=dev`.** `postinstall` runs `patch-package`, itself a devDependency, and the `@auth/core` patch is load-bearing. `docs/architecture.md:228` records this exact failure.
- **No `vercel.json`, no `@vercel/*` dependency, no `export const runtime = "edge"`.** `apps/web/tests/host-agnostic.test.ts` enforces all three and must stay green.
- **Configuration is read at call time, never at module scope.** `lib/env.ts` documents why: one build artifact must not behave differently on two hosts. `getMagicLinkSender()` is already a function for this reason — keep it one.
- **Do not modify** `lib/auth/stakeholder-email-provider.ts`, `lib/auth/stakeholder-adapter.ts`, or the verification-token schema. The seam exists so they stay untouched.
- **Test commands capture exit codes without a pipe.** Per `CLAUDE.md`: `npx vitest … | tail` returns tail's exit code and reports a failing run as passing.
- **Never run two suites at once.** Full suite is ~90s.
- **Copy stays relationship-neutral** — never "client", "investor", or "manager" (`docs/architecture.md` § M5).

---

### Task 1: SMTP configuration in `lib/env.ts`

Adds the five SMTP variables and validates them as a group. `SMTP_HOST` alone selects the sender; a half-configured mailbox must fail loudly rather than silently fall back to logging sign-in links to the console, which is the one failure mode here that looks like success.

**Files:**
- Modify: `apps/web/lib/env.ts`
- Test: `apps/web/tests/env.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `env()` returns `SMTP_HOST?: string`, `SMTP_PORT: number` (defaults to 587), `SMTP_USER?: string`, `SMTP_PASSWORD?: string`, `EMAIL_FROM?: string`. Task 2 reads all five.

- [ ] **Step 1: Write the failing tests**

Add these cases inside the existing `describe("env", ...)` block in `apps/web/tests/env.test.ts`. Keep the existing tests as they are.

```ts
  it("leaves SMTP settings undefined when unset", () => {
    process.env.DATABASE_URL = VALID;
    process.env.AUTH_SECRET = "test-secret";
    expect(env().SMTP_HOST).toBeUndefined();
    expect(env().SMTP_USER).toBeUndefined();
    expect(env().SMTP_PASSWORD).toBeUndefined();
    expect(env().EMAIL_FROM).toBeUndefined();
  });

  it("defaults SMTP_PORT to 587 when unset", () => {
    process.env.DATABASE_URL = VALID;
    process.env.AUTH_SECRET = "test-secret";
    expect(env().SMTP_PORT).toBe(587);
  });

  it("parses a fully configured mailbox", () => {
    process.env.DATABASE_URL = VALID;
    process.env.AUTH_SECRET = "test-secret";
    process.env.SMTP_HOST = "smtp.example.com";
    process.env.SMTP_PORT = "465";
    process.env.SMTP_USER = "postmaster@example.com";
    process.env.SMTP_PASSWORD = "app-password";
    process.env.EMAIL_FROM = "postmaster@example.com";
    expect(env().SMTP_HOST).toBe("smtp.example.com");
    expect(env().SMTP_PORT).toBe(465);
    expect(env().EMAIL_FROM).toBe("postmaster@example.com");
  });

  it("rejects a half-configured mailbox rather than falling back silently", () => {
    // A missing credential must not degrade to the console sender in
    // production — sign-in links would go to the server log and stakeholders
    // would see nothing arrive, while the deployment looks healthy.
    process.env.DATABASE_URL = VALID;
    process.env.AUTH_SECRET = "test-secret";
    process.env.SMTP_HOST = "smtp.example.com";
    process.env.SMTP_USER = "postmaster@example.com";
    // SMTP_PASSWORD and EMAIL_FROM deliberately absent
    expect(() => env()).toThrow(/SMTP_PASSWORD/);
  });

  it("names every missing SMTP field, not just the first", () => {
    process.env.DATABASE_URL = VALID;
    process.env.AUTH_SECRET = "test-secret";
    process.env.SMTP_HOST = "smtp.example.com";
    expect(() => env()).toThrow(/EMAIL_FROM/);
  });

  it("requires EMAIL_FROM to be an address", () => {
    process.env.DATABASE_URL = VALID;
    process.env.AUTH_SECRET = "test-secret";
    process.env.SMTP_HOST = "smtp.example.com";
    process.env.SMTP_USER = "postmaster@example.com";
    process.env.SMTP_PASSWORD = "app-password";
    process.env.EMAIL_FROM = "not-an-address";
    expect(() => env()).toThrow(/EMAIL_FROM/);
  });
```

Extend the existing `afterEach` cleanup at the top of the file so these variables do not leak between tests. Replace the current `afterEach` block with:

```ts
afterEach(() => {
  resetEnvCache();
  delete process.env.DATABASE_URL;
  delete process.env.EVAL_CEILING_SECONDS;
  delete process.env.AUTH_SECRET;
  delete process.env.AUTH_GITHUB_ID;
  delete process.env.AUTH_GITHUB_SECRET;
  delete process.env.SMTP_HOST;
  delete process.env.SMTP_PORT;
  delete process.env.SMTP_USER;
  delete process.env.SMTP_PASSWORD;
  delete process.env.EMAIL_FROM;
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run apps/web/tests/env.test.ts`

Expected: FAIL. The six new cases fail; `SMTP_PORT` is `undefined` rather than 587, and the half-configured case does not throw.

- [ ] **Step 3: Add the SMTP fields to the schema**

In `apps/web/lib/env.ts`, add these fields inside the existing `z.object({ … })`, after `AUTH_URL`:

```ts
  /* Magic-link delivery over SMTP. Optional as a group, following the
   * AUTH_GITHUB_* treatment: absent credentials disable one delivery path
   * rather than failing validation for everyone. SMTP_HOST alone selects the
   * real sender (see lib/auth/magic-link-sender.ts); the group check below is
   * what stops a half-configured mailbox from silently degrading to the
   * console sender in production. */
  SMTP_HOST: z.string().min(1).optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().min(1).optional(),
  SMTP_PASSWORD: z.string().min(1).optional(),
  EMAIL_FROM: z.string().email().optional(),
```

- [ ] **Step 4: Add the group check**

Still in `apps/web/lib/env.ts`, chain a `superRefine` onto the object schema. Change the closing line of the schema from `});` to:

```ts
}).superRefine((value, ctx) => {
  /* Only meaningful once a host is set — with SMTP_HOST absent the console
   * sender is the intended configuration, not an incomplete one. */
  if (!value.SMTP_HOST) return;
  for (const key of ["SMTP_USER", "SMTP_PASSWORD", "EMAIL_FROM"] as const) {
    if (!value[key]) {
      ctx.addIssue({
        code: "custom",
        path: [key],
        message: `${key} is required when SMTP_HOST is set`,
      });
    }
  }
});
```

`type Env = z.infer<typeof schema>` and the existing `schema.safeParse` call both continue to work through the refinement — no other change to `env()` is needed.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run apps/web/tests/env.test.ts`

Expected: PASS, all cases including the six pre-existing ones.

If `superRefine` or `code: "custom"` is rejected by Zod 4's types, do not reshape the schema: move the same loop into `env()` immediately after `safeParse` succeeds, throwing an `Error` with the identical `Invalid environment: ` prefix the function already uses. The tests assert on the message, not the mechanism.

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck -w @zkcvp/web`

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/web/lib/env.ts apps/web/tests/env.test.ts
git commit -m "feat(web): validate SMTP settings as a group in env"
```

---

### Task 2: The SMTP sender behind the existing seam

Adds the second `MagicLinkSender` implementation and the selection rule, plus the documentation the change invalidates.

**Files:**
- Modify: `apps/web/lib/auth/magic-link-sender.ts`
- Modify: `apps/web/package.json`
- Modify: `apps/web/next.config.ts`
- Modify: `.env.example`
- Modify: `docs/architecture.md`
- Test: `apps/web/tests/auth/magic-link-sender.test.ts`

**Interfaces:**
- Consumes: `env()` from Task 1, specifically `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `EMAIL_FROM`.
- Produces: `smtpMagicLinkSender: MagicLinkSender`, and `getMagicLinkSender(): MagicLinkSender` now returning it when `SMTP_HOST` is set. `consoleMagicLinkSender` keeps its current name, signature, and behaviour — `StakeholderEmailProvider` calls `getMagicLinkSender()` and needs no change.

- [ ] **Step 1: Install nodemailer**

```bash
npm install nodemailer -w @zkcvp/web
npm install --save-dev @types/nodemailer -w @zkcvp/web
```

Run from the repo root. Never add `--omit=dev`.

- [ ] **Step 2: Write the failing tests**

Replace the whole contents of `apps/web/tests/auth/magic-link-sender.test.ts` with the following. The existing `consoleMagicLinkSender` case is preserved verbatim inside it.

```ts
// apps/web/tests/auth/magic-link-sender.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sendMail = vi.fn();

vi.mock("nodemailer", () => ({
  default: { createTransport: vi.fn(() => ({ sendMail })) },
}));

import nodemailer from "nodemailer";
import {
  consoleMagicLinkSender,
  getMagicLinkSender,
  smtpMagicLinkSender,
} from "../../lib/auth/magic-link-sender";
import { resetEnvCache } from "../../lib/env";

const VALID_DB = "postgresql://u:p@host:5432/db";

function configureMailbox(): void {
  process.env.SMTP_HOST = "smtp.example.com";
  process.env.SMTP_PORT = "587";
  process.env.SMTP_USER = "postmaster@example.com";
  process.env.SMTP_PASSWORD = "app-password";
  process.env.EMAIL_FROM = "postmaster@example.com";
}

beforeEach(() => {
  process.env.DATABASE_URL = VALID_DB;
  process.env.AUTH_SECRET = "test-secret";
});

afterEach(() => {
  vi.restoreAllMocks();
  sendMail.mockReset();
  resetEnvCache();
  delete process.env.DATABASE_URL;
  delete process.env.AUTH_SECRET;
  delete process.env.SMTP_HOST;
  delete process.env.SMTP_PORT;
  delete process.env.SMTP_USER;
  delete process.env.SMTP_PASSWORD;
  delete process.env.EMAIL_FROM;
});

describe("consoleMagicLinkSender", () => {
  it("logs the email and the sign-in url", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});

    await consoleMagicLinkSender({
      email: "s@example.com",
      url: "http://localhost:3000/api/auth/sh/callback/email?token=abc",
    });

    expect(spy).toHaveBeenCalledTimes(1);
    const [logged] = spy.mock.calls[0] as [string];
    expect(logged).toContain("s@example.com");
    expect(logged).toContain(
      "http://localhost:3000/api/auth/sh/callback/email?token=abc",
    );
  });
});

describe("getMagicLinkSender", () => {
  it("returns the console sender when SMTP_HOST is absent", () => {
    expect(getMagicLinkSender()).toBe(consoleMagicLinkSender);
  });

  it("returns the SMTP sender when a mailbox is configured", () => {
    configureMailbox();
    expect(getMagicLinkSender()).toBe(smtpMagicLinkSender);
  });

  it("reads configuration at call time, not at import time", () => {
    // The seam must not bake a delivery choice into the build — same
    // rationale as lib/env.ts's own call-time contract.
    expect(getMagicLinkSender()).toBe(consoleMagicLinkSender);
    resetEnvCache();
    configureMailbox();
    expect(getMagicLinkSender()).toBe(smtpMagicLinkSender);
  });
});

describe("smtpMagicLinkSender", () => {
  it("sends to the requested address from EMAIL_FROM", async () => {
    configureMailbox();

    await smtpMagicLinkSender({
      email: "s@example.com",
      url: "https://zkcvp.vercel.app/api/auth/sh/callback/email?token=abc",
    });

    expect(sendMail).toHaveBeenCalledTimes(1);
    const [mail] = sendMail.mock.calls[0] as [
      { to: string; from: string; subject: string; text: string; html: string },
    ];
    expect(mail.to).toBe("s@example.com");
    expect(mail.from).toBe("postmaster@example.com");
    expect(mail.subject).toBeTruthy();
  });

  it("carries the sign-in url unaltered in both bodies", async () => {
    configureMailbox();
    const url =
      "https://zkcvp.vercel.app/api/auth/sh/callback/email?token=abc&x=1";

    await smtpMagicLinkSender({ email: "s@example.com", url });

    const [mail] = sendMail.mock.calls[0] as [{ text: string; html: string }];
    expect(mail.text).toContain(url);
    expect(mail.html).toContain(url);
  });

  it("builds the transport from the configured mailbox", async () => {
    configureMailbox();

    await smtpMagicLinkSender({ email: "s@example.com", url: "https://x/y" });

    expect(nodemailer.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        host: "smtp.example.com",
        port: 587,
        auth: { user: "postmaster@example.com", pass: "app-password" },
      }),
    );
  });

  it("uses an implicit-TLS transport on port 465", async () => {
    configureMailbox();
    process.env.SMTP_PORT = "465";
    resetEnvCache();

    await smtpMagicLinkSender({ email: "s@example.com", url: "https://x/y" });

    expect(nodemailer.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ port: 465, secure: true }),
    );
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run apps/web/tests/auth/magic-link-sender.test.ts`

Expected: FAIL with `smtpMagicLinkSender` and `getMagicLinkSender` import errors — neither export exists yet in the shape the tests require.

- [ ] **Step 4: Implement the sender**

Replace the whole contents of `apps/web/lib/auth/magic-link-sender.ts` with:

```ts
// apps/web/lib/auth/magic-link-sender.ts
import nodemailer from "nodemailer";
import { env } from "../env";

/** docs/architecture.md, "Why email delivery is a seam". */
export type MagicLinkSender = (args: {
  email: string;
  url: string;
}) => Promise<void>;

/**
 * The development implementation. Keeps the full stakeholder flow demoable
 * with zero external configuration — no mailbox, no credentials, no network.
 */
export const consoleMagicLinkSender: MagicLinkSender = async ({
  email,
  url,
}) => {
  console.log(`[magic-link] sign-in requested for ${email}: ${url}`);
};

const SUBJECT = "Your sign-in link";

/**
 * SMTP delivery against an ordinary mailbox. Deliberately not next-auth's
 * Nodemailer() provider factory: delivery here is a plain seam, and
 * StakeholderEmailProvider stays a hand-built `type: "email"` config with no
 * SMTP-shaped surface of its own.
 *
 * Reads env() per call rather than building a module-scoped transport, for the
 * reason env() itself documents — configuration must not be captured at
 * import time, or one build artifact behaves differently on two hosts.
 */
export const smtpMagicLinkSender: MagicLinkSender = async ({ email, url }) => {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, EMAIL_FROM } = env();

  const transport = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    /* 465 is implicit TLS; 587 upgrades via STARTTLS. */
    secure: SMTP_PORT === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASSWORD },
  });

  await transport.sendMail({
    to: email,
    from: EMAIL_FROM,
    subject: SUBJECT,
    text: `Sign in to Ledger:\n\n${url}\n\nThis link expires in 24 hours. If you did not request it, ignore this message.`,
    html: `<p>Sign in to Ledger:</p><p><a href="${url}">${url}</a></p><p>This link expires in 24 hours. If you did not request it, ignore this message.</p>`,
  });
};

/**
 * A function rather than a constant, matching env()'s own rationale — the
 * choice must be made when it is used, never at import or build time.
 *
 * SMTP_HOST alone selects. env() has already rejected a half-configured
 * mailbox by this point, so a set host means a complete one.
 */
export function getMagicLinkSender(): MagicLinkSender {
  return env().SMTP_HOST ? smtpMagicLinkSender : consoleMagicLinkSender;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run apps/web/tests/auth/magic-link-sender.test.ts`

Expected: PASS, all nine cases.

- [ ] **Step 6: Keep nodemailer out of the bundle**

nodemailer resolves transports through dynamic requires, which Next's bundler cannot trace. Add it to `serverExternalPackages` in `apps/web/next.config.ts`, immediately after the `transpilePackages` array:

```ts
  /* nodemailer resolves its transports through dynamic requires, which the
   * bundler cannot follow. Left bundled it builds but fails at send time.
   * Server-only by construction — the magic-link sender never reaches a
   * client component. */
  serverExternalPackages: ["nodemailer"],
```

- [ ] **Step 7: Verify the production build**

Run: `npm run build -w @zkcvp/web`

Expected: build completes and `.next/standalone/` is emitted. A missing `.next/standalone` means output-file tracing broke — check `outputFileTracingRoot`, which `next.config.ts` documents as Windows-sensitive.

- [ ] **Step 8: Run the full verification**

```bash
npm run verify
```

This is typecheck, then the full test suite, then the design system's render check, in one chain. Expected: all three pass, ~90s for the suite alone. Do not pipe it — per `CLAUDE.md`, a pipe returns the pipe's exit code and reports a failing run as passing. Do not run a second suite alongside it.

Confirm `apps/web/tests/host-agnostic.test.ts` is among the passing files: nodemailer is not a `@vercel/*` package, so all three of its assertions should still hold.

- [ ] **Step 9: Document the five new variables**

In `.env.example`, append below the `AUTH_URL` block:

```
# Magic-link delivery. Leave SMTP_HOST unset and sign-in links print to the
# console instead — the zero-configuration development path.
#
# Set as a group: with SMTP_HOST present, SMTP_USER, SMTP_PASSWORD and
# EMAIL_FROM are all required, and startup fails loudly if any is missing.
# A half-configured mailbox must never degrade to console logging in
# production, because sign-in links would go to the server log while the
# deployment still looks healthy.
#
# SMTP_PASSWORD is an app-specific password, not the account password —
# Gmail and most providers require 2FA enabled before issuing one.
# EMAIL_FROM must match the authenticated mailbox or the provider rejects
# the send. SMTP_PORT defaults to 587 (STARTTLS); 465 is implicit TLS.
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
EMAIL_FROM=
```

- [ ] **Step 10: Correct the architecture doc**

In `docs/architecture.md` § "Why email delivery is a seam", replace the sentence "A console sender is the only implementation that ships. Adding Resend or SMTP later is one function and one env value — provider, adapter, token table, and tests stay untouched." with:

```
Two senders ship: a console sender for development, and an SMTP sender selected by the
presence of `SMTP_HOST`. Adding the second cost one function and five env values —
provider, adapter, and token table were untouched, exactly as predicted. A domain-backed
API sender (Resend and similar) is the same shape again, should deliverability from an
ordinary mailbox stop being enough.
```

In `docs/architecture.md` § "Host-agnostic guarantees", replace the opening sentence "The deployment host is undecided. These keep the decision cheap:" with:

```
The deployment host is Vercel as of 2026-08-18. The guarantees below were kept rather than
spent: no `vercel.json`, no Vercel primitives, no edge runtime, and `output: 'standalone'`
still emits a runnable Node server. Moving to a long-lived Node host stays a redeploy, not
a rewrite — which matters most when the Evaluator lands, since a serverless request ceiling
can truncate a run that a long-lived host would finish.
```

- [ ] **Step 11: Commit**

```bash
git add apps/web/lib/auth/magic-link-sender.ts apps/web/next.config.ts apps/web/package.json apps/web/tests/auth/magic-link-sender.test.ts package-lock.json .env.example docs/architecture.md
git commit -m "feat(web): add an SMTP magic-link sender behind the delivery seam"
```

---

### Task 3: Deploy to Vercel

Operator steps, not code. Every command runs from the repo root. Nothing here is committed except the final documentation note.

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: the SMTP sender from Task 2, and `env()`'s group validation from Task 1.
- Produces: a live URL, and `AUTH_URL` set to it.

- [ ] **Step 1: Generate a production `AUTH_SECRET`**

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Use this value for production. Do **not** reuse the development secret from `apps/web/.env.local` — a secret that has lived in a local dotfile is not a production secret.

- [ ] **Step 2: Obtain an SMTP app password**

In the mailbox provider's account settings, enable 2FA if it is not already on, then issue an app-specific password. Gmail: Account → Security → 2-Step Verification → App passwords. The regular account password will be refused by the SMTP server.

Record: host, port, username, app password, and the from-address (which must equal the authenticated mailbox).

- [ ] **Step 3: Verify delivery locally before deploying**

Add the five SMTP values to `apps/web/.env.local`, then:

```bash
npm run dev
```

Open `http://localhost:3000/login`, request a magic link for an address you control that is **not** the sending mailbox, and confirm the email arrives. Then follow the link and confirm it signs you in.

This step exists to separate two failure modes that look identical in production: bad SMTP credentials, and a bad `AUTH_URL`. Proving delivery locally means any later failure is the deployment, not the mailbox.

Remove the SMTP values from `apps/web/.env.local` afterwards if you want local development back on the console sender.

- [ ] **Step 4: Import the project into Vercel**

In the Vercel dashboard, import the git repository, then set:

| Setting | Value |
|---|---|
| Root Directory | `apps/web` |
| Framework Preset | Next.js |
| Build Command | leave as the default |
| Install Command | **override** — `cd ../.. && npm install` |

The install command must be overridden. Vercel's default for a monorepo root
directory is `npm install --prefix=../..`, which installs into the workspace root
but never runs the root package's lifecycle scripts — so `postinstall` never fires,
`patch-package` never runs, and the deployment silently ships an unpatched
`@auth/core`. It exits 0 with no warning; the only way to see it is to grep the
installed file.

Verified 2026-08-30 by wiping `node_modules` and grepping
`node_modules/@auth/core/lib/utils/assert.js` for the patch's `PATCHED (zkcvp)` marker:

| Install command | `postinstall` ran | Patch applied |
|---|---|---|
| `npm ci` (repo root) | yes | yes |
| `npm install --prefix=../..` (Vercel default) | no | **no** |
| `cd ../.. && npm install` | yes | yes |

Whatever you set, it must run at the repo root and keep devDependencies —
`patch-package` is a root devDependency, so an override adding `--omit=dev` or
`--ignore-scripts` fails the install or ships unpatched just the same.

Unpatched, the module-level `let`s in `@auth/core`'s `assertConfig` leak between the
two Auth.js instances sharing a process: the adapter-less GitHub instance is told
"email login requires an adapter" purely because the stakeholder instance asserted
first. It is order-dependent, so it can look healthy and then fail.

Do not create a `vercel.json`.

- [ ] **Step 5: Set environment variables**

In Project Settings → Environment Variables, for the Production environment:

| Variable | Value |
|---|---|
| `DATABASE_URL` | the pooled Supabase string, same value as `packages/db/.env` |
| `AUTH_SECRET` | the value generated in Step 1 |
| `SMTP_HOST` | from Step 2 |
| `SMTP_PORT` | `587`, or `465` for implicit TLS |
| `SMTP_USER` | from Step 2 |
| `SMTP_PASSWORD` | the app password from Step 2 |
| `EMAIL_FROM` | the sending mailbox address |

Leave `AUTH_URL` unset for now — Step 6 explains why. Leave `EVAL_CEILING_SECONDS` unset; it defaults to 300 and no evaluation path runs. Leave `AUTH_GITHUB_ID` and `AUTH_GITHUB_SECRET` unset; `lib/env.ts` marks them optional precisely so the stakeholder flow works without them.

- [ ] **Step 6: Deploy, then set `AUTH_URL` and redeploy**

Trigger the first deploy and note the assigned hostname. Then add:

| Variable | Value |
|---|---|
| `AUTH_URL` | `https://<assigned-hostname>` — the origin only, no trailing path |

and redeploy.

The hostname cannot be known before the first deploy, which is why this is two passes. The redeploy is required, not cosmetic: both Auth.js instances set `trustHost: true` because the default would otherwise be `false` in production and 500 every login (`docs/architecture.md` § `trustHost`). With `trustHost` on and `AUTH_URL` unset, callback URLs derive from the incoming `Host` header. Setting `AUTH_URL` is what removes host-header spoofing as a way to steer a callback.

- [ ] **Step 7: Verify the deployment end to end**

Against the live URL:

1. Open `/login` and request a magic link for an address you control.
2. Confirm the email arrives in that inbox — not in Vercel's runtime logs. A link appearing in the logs means `SMTP_HOST` did not reach the runtime and the console sender was selected.
3. Follow the link. Confirm it lands you on `/projects` with a session.
4. Confirm the link's origin matches `AUTH_URL`. A `localhost` or preview origin means `AUTH_URL` is unset or wrong.
5. Open `/projects` in a private window and confirm you are redirected to `/login`.

Step 2 is the acceptance criterion for the whole plan.

- [ ] **Step 8: Record the deployment in the README**

In `README.md`, replace the "Deployment host — serverless vs. long-lived Node. Deferred until a real Evaluator run" open-question entry with:

```
- Deployment host — **Vercel**, chosen 2026-08-18. Stakeholder magic-link sign-in is live;
  developer GitHub sign-in is not configured in production and needs an OAuth App
  registered against the deployed origin (an OAuth App permits one callback URL, and the
  existing one points at localhost). The host-agnostic guarantees were kept, not spent, so
  a move to a long-lived Node host remains a redeploy — which is the decision to revisit
  when the Evaluator lands and a request ceiling starts to matter.
```

- [ ] **Step 9: Commit**

```bash
git add README.md
git commit -m "docs: record Vercel as the deployment host"
```

---

## Known conditions carried into production

None of these are defects introduced by this plan; all are recorded in the spec as accepted.

- Dev and production share one Supabase database. The seeded "Ledger Rollout" data is visible to stakeholders, and local testing writes to live rows.
- A stale or mistyped requirement ID renders Next's generic error page — no `error.tsx` anywhere in `apps/web` (`docs/architecture.md` § Status).
- `packages/db/src/client.ts` opens a pool of `max: 10` per instance; each serverless instance holds its own. Revisit on connection errors.
- `/ledger` is publicly reachable — middleware matches only `/projects` and `/requirements`.
- `/api/test-evaluate` is unreachable: gated by `requireDeveloper()`, and developer login is not configured.
- Magic links arrive from a personal mailbox and inherit its sending limits (Gmail: roughly 500/day).
