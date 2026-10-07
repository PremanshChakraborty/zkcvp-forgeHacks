# Repo Attachment & Commit Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a developer attach GitHub repos to a project and browse their branches and commits, so a claim has `(repo, commit SHA)` pairs to pin.

**Architecture:** One new table (`project_repos`) holding a lightweight attachment record; everything else is fetched live from GitHub using the acting developer's own session OAuth token. Three new methods on `packages/github`, one service module carrying every rule, six thin route handlers, one screen.

**Tech Stack:** Drizzle over `pg`, Next.js 15.5.22 route handlers and Server Components, Vitest against real Postgres, Ledger design system.

**Spec:** `docs/plans/02-repo-attachment.md` (business rules) and `docs/plans/03-claim-submission.md` (why this ships first).

## Global Constraints

- **No service-level GitHub credential, ever.** Every GitHub call in this plan is authenticated as the acting developer's session token. The only unauthenticated call in the codebase is `resolveGithubUser`, and this plan adds no more.
- **`github_repo_id` is the join key, never `full_name`.** `full_name` is a display cache that may go stale after a rename.
- **Removal is a 60-second undo window, not a detach feature.** Past 60 seconds `DELETE` always returns 409. No soft delete, no `removed_at`.
- **Services carry the rules, handlers carry nothing.** Every service function is `(db, session, args)` and calls its own authorization predicate, throwing `ServiceError`. Route handlers are thin adapters wrapped in `handle()`.
- **Tests live at the service layer**, exercised directly under `withTestSchema`, not over HTTP.
- **No `export const runtime = 'edge'`, no `@vercel/*` import** in `apps/web`. A structural test already asserts this.
- **Dates are absolute, never relative.** Language stays relationship-neutral — never "client", "investor", or "manager".
- **Commit messages end at the body.** No `Co-Authored-By`, no session trailer.
- Run `npm run test` without a pipe and read the exit code. `npx vitest … | tail` returns tail's exit code and reports a failing run as passing. Never run two suites at once.

---

### Task 1: Prove streaming works before anything depends on it

This is a **spike**. Its output is an answer, not code we keep. Plan 2's entire progress UI assumes a Next route handler can stream a response that reaches the browser incrementally. If any layer buffers, that design collapses and Plan 2 must be rewritten before it is started.

**Files:**
- Create (throwaway, deleted in step 5): `apps/web/app/api/_spike-stream/route.ts`

**Interfaces:**
- Consumes: nothing
- Produces: a recorded yes/no answer. No code survives this task.

- [ ] **Step 1: Write the throwaway streaming route**

```ts
// apps/web/app/api/_spike-stream/route.ts
// THROWAWAY. Delete at the end of Task 1. Exists only to answer:
// does a Next route handler reach the browser incrementally on this host?
export async function GET() {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      for (let i = 0; i < 5; i++) {
        controller.enqueue(
          encoder.encode(JSON.stringify({ i, at: Date.now() }) + "\n"),
        );
        await new Promise((r) => setTimeout(r, 1000));
      }
      controller.close();
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

- [ ] **Step 2: Start the dev server and watch the frames arrive**

Run in one terminal:

```bash
npm run dev
```

In another:

```bash
curl -N --no-buffer http://localhost:3000/api/_spike-stream
```

Expected: five lines appearing **one per second**. If all five appear at once after five seconds, the response is being buffered.

- [ ] **Step 3: Confirm in a real browser, not just curl**

curl and the browser take different paths. Open `http://localhost:3000` and run this in the DevTools console:

```js
const res = await fetch("/api/_spike-stream");
const reader = res.body.getReader();
const dec = new TextDecoder();
for (;;) {
  const { done, value } = await reader.read();
  if (done) break;
  console.log(performance.now().toFixed(0), dec.decode(value).trim());
}
```

Expected: five `console.log` lines roughly 1000ms apart.

- [ ] **Step 4: Record the answer**

Write one line into the plan file under this task: `Streaming verified locally on <date>: frames arrived ~1s apart in curl and in Chrome.`

**Decision gate.** If frames arrive batched in either check, **stop**. Do not start Task 2. Report the finding and say that Plan 2's progress design needs replacing with a buffered response before any of it is built. This is the whole point of running the spike first.

Note that this proves the *local* Node server only. It must be re-checked against the deployed host before Plan 2's screens are called done — deployment is not part of this plan.

- [ ] **Step 5: Delete the spike**

```bash
rm apps/web/app/api/_spike-stream/route.ts
```

No commit. A spike leaves no code behind.

---

### Task 2: The `project_repos` table

**Files:**
- Create: `packages/db/src/schema/repos.ts`
- Modify: `packages/db/src/schema/index.ts`
- Create (generated): `packages/db/migrations/0001_*.sql`
- Test: `apps/web/tests/repos/schema.test.ts`

**Interfaces:**
- Consumes: `projects` and `developers` from `@zkcvp/db/schema`
- Produces: `projectRepos` table with columns `id`, `projectId`, `githubRepoId`, `fullName`, `addedBy`, `addedAt`, unique on `(projectId, githubRepoId)`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/tests/repos/schema.test.ts
import { describe, expect, it } from "vitest";
import { withTestSchema } from "@zkcvp/db/testing";
import { developers, projectRepos, projects, stakeholders } from "@zkcvp/db/schema";
import { isUniqueViolation } from "../../lib/api/errors";

async function seed(db: Parameters<Parameters<typeof withTestSchema>[0]>[0]) {
  const [s] = await db
    .insert(stakeholders)
    .values({ email: "s@example.com", displayName: "S" })
    .returning();
  const [p] = await db
    .insert(projects)
    .values({ name: "P", createdBy: s.id })
    .returning();
  const [d] = await db
    .insert(developers)
    .values({ githubUserId: "1", githubUsername: "dev" })
    .returning();
  return { p, d };
}

describe("project_repos", () => {
  it("stores an attachment keyed by the numeric repo id", async () => {
    await withTestSchema(async (db) => {
      const { p, d } = await seed(db);
      const [row] = await db
        .insert(projectRepos)
        .values({
          projectId: p.id,
          githubRepoId: "1296269",
          fullName: "octocat/Hello-World",
          addedBy: d.id,
        })
        .returning();

      expect(row.githubRepoId).toBe("1296269");
      expect(row.addedAt).toBeInstanceOf(Date);
    });
  });

  it("rejects the same repo attached twice to one project", async () => {
    await withTestSchema(async (db) => {
      const { p, d } = await seed(db);
      const values = {
        projectId: p.id,
        githubRepoId: "1296269",
        fullName: "octocat/Hello-World",
        addedBy: d.id,
      };
      await db.insert(projectRepos).values(values);

      const err = await db
        .insert(projectRepos)
        .values(values)
        .catch((e: unknown) => e);

      expect(isUniqueViolation(err)).toBe(true);
    });
  });

  it("allows the same repo on two different projects", async () => {
    await withTestSchema(async (db) => {
      const { p, d } = await seed(db);
      const [s2] = await db
        .insert(stakeholders)
        .values({ email: "s2@example.com", displayName: "S2" })
        .returning();
      const [p2] = await db
        .insert(projects)
        .values({ name: "P2", createdBy: s2.id })
        .returning();

      await db.insert(projectRepos).values({
        projectId: p.id,
        githubRepoId: "1296269",
        fullName: "octocat/Hello-World",
        addedBy: d.id,
      });
      const [second] = await db
        .insert(projectRepos)
        .values({
          projectId: p2.id,
          githubRepoId: "1296269",
          fullName: "octocat/Hello-World",
          addedBy: d.id,
        })
        .returning();

      expect(second.projectId).toBe(p2.id);
    });
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

```bash
npx vitest run apps/web/tests/repos/schema.test.ts
```

Expected: FAIL — `projectRepos` is not exported from `@zkcvp/db/schema`.

- [ ] **Step 3: Write the schema module**

```ts
// packages/db/src/schema/repos.ts
import { pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { developers } from "./identity";
import { projects } from "./projects";

/**
 * A lightweight attachment record and nothing more. Branches, commits, and the
 * repo list itself are always fetched live with the acting developer's own
 * token — there is no cached repo state to go stale and no persisted access
 * grant that could be revoked behind our back.
 */
export const projectRepos = pgTable(
  "project_repos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    /** GitHub's NUMERIC repo id as text. Stable across renames. The join key. */
    githubRepoId: text("github_repo_id").notNull(),
    /**
     * Display cache only. Goes stale after a rename; GitHub's own redirect
     * still resolves API calls, and plan 02 accepts that rather than building
     * a refresh mechanism nothing yet needs.
     */
    fullName: text("full_name").notNull(),
    addedBy: uuid("added_by")
      .notNull()
      .references(() => developers.id),
    addedAt: timestamp("added_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  /* Same repo may be attached to several DIFFERENT projects, never twice to
   * one. There is deliberately no status or removed_at column: removal only
   * happens inside a 60-second undo window, so a hard delete leaves nothing
   * worth a tombstone. */
  (t) => [unique().on(t.projectId, t.githubRepoId)],
);
```

- [ ] **Step 4: Export it**

Add to `packages/db/src/schema/index.ts`, after the `projects` line:

```ts
export * from "./repos";
```

- [ ] **Step 5: Generate the migration**

```bash
npm run generate -w @zkcvp/db
```

Open the generated `packages/db/migrations/0001_*.sql` and read it. It must contain exactly one `CREATE TABLE "project_repos"`, two foreign keys, and one unique constraint. It must **not** contain `CREATE INDEX CONCURRENTLY` — the test harness runs the whole migration as one multi-statement query inside an implicit transaction, which `CONCURRENTLY` cannot join.

- [ ] **Step 6: Run the tests to verify they pass**

```bash
npx vitest run apps/web/tests/repos/schema.test.ts
```

Expected: PASS, 3 tests.

- [ ] **Step 7: Commit**

```bash
git add packages/db/src/schema/repos.ts packages/db/src/schema/index.ts packages/db/migrations apps/web/tests/repos/schema.test.ts
git commit -m "feat(db): add project_repos, keyed by GitHub's numeric repo id"
```

---

### Task 3: Three GitHub methods, authenticated as the developer

**Files:**
- Modify: `packages/github/src/index.ts`
- Test: `packages/github/tests/repos.test.ts`

**Interfaces:**
- Consumes: `GitHubClient` (`{ accessToken }`), `GithubUnavailable` — both already in `packages/github/src/index.ts`
- Produces:
  - `type GithubRepo = { githubRepoId: string; fullName: string; private: boolean; defaultBranch: string }`
  - `type GithubBranch = { name: string; commitSha: string }`
  - `type GithubCommit = { sha: string; message: string; authorName: string; committedAt: string }`
  - `listUserRepos(client: GitHubClient): Promise<GithubRepo[]>`
  - `listBranches(client: GitHubClient, fullName: string): Promise<GithubBranch[]>`
  - `listCommits(client: GitHubClient, fullName: string, ref: string): Promise<GithubCommit[]>`

- [ ] **Step 1: Write the failing test**

```ts
// packages/github/tests/repos.test.ts
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createGitHubClient,
  GithubUnavailable,
  listBranches,
  listCommits,
  listUserRepos,
} from "../src/index";

const client = createGitHubClient("gho_token");

function mockFetch(status: number, body: unknown, headers: Record<string, string> = {}) {
  const res = new Response(JSON.stringify(body), { status, headers });
  return vi.spyOn(globalThis, "fetch").mockResolvedValue(res);
}

afterEach(() => vi.restoreAllMocks());

describe("listUserRepos", () => {
  it("maps the numeric id and default branch, and sends the token", async () => {
    const spy = mockFetch(200, [
      { id: 1296269, full_name: "octocat/Hello-World", private: true, default_branch: "main" },
    ]);

    const repos = await listUserRepos(client);

    expect(repos).toEqual([
      { githubRepoId: "1296269", fullName: "octocat/Hello-World", private: true, defaultBranch: "main" },
    ]);
    const init = spy.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer gho_token");
  });

  it("reports a rate-limited 403 as unavailability, not as an empty list", async () => {
    mockFetch(403, {}, { "x-ratelimit-remaining": "0" });
    await expect(listUserRepos(client)).rejects.toBeInstanceOf(GithubUnavailable);
  });
});

describe("listBranches", () => {
  it("maps name and head sha", async () => {
    mockFetch(200, [{ name: "main", commit: { sha: "a".repeat(40) } }]);
    await expect(listBranches(client, "octocat/Hello-World")).resolves.toEqual([
      { name: "main", commitSha: "a".repeat(40) },
    ]);
  });
});

describe("listCommits", () => {
  it("maps sha, first message line, author and date", async () => {
    mockFetch(200, [
      {
        sha: "b".repeat(40),
        commit: {
          message: "Add login\n\nLonger body that must not appear",
          author: { name: "Mira", date: "2026-09-01T10:00:00Z" },
        },
      },
    ]);

    await expect(listCommits(client, "octocat/Hello-World", "main")).resolves.toEqual([
      {
        sha: "b".repeat(40),
        message: "Add login",
        authorName: "Mira",
        committedAt: "2026-09-01T10:00:00Z",
      },
    ]);
  });

  it("passes the ref as the sha query parameter", async () => {
    const spy = mockFetch(200, []);
    await listCommits(client, "octocat/Hello-World", "feature/x");
    expect(String(spy.mock.calls[0][0])).toContain("sha=feature%2Fx");
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

```bash
npx vitest run packages/github/tests/repos.test.ts
```

Expected: FAIL — `listUserRepos` is not exported.

- [ ] **Step 3: Implement the three methods**

Append to `packages/github/src/index.ts`:

```ts
export type GithubRepo = {
  /** Numeric id as text. The join key. */
  githubRepoId: string;
  fullName: string;
  private: boolean;
  defaultBranch: string;
};

export type GithubBranch = { name: string; commitSha: string };

export type GithubCommit = {
  sha: string;
  /** First line only. A commit body can be long and is not worth a list row. */
  message: string;
  authorName: string;
  /** ISO 8601. Dates are absolute throughout this product. */
  committedAt: string;
};

/**
 * Every call here is authenticated as the acting developer.
 *
 * That is the whole access model: a developer sees exactly what their own
 * GitHub account can already see, at the moment of the call. There is no
 * installation, no service credential, and therefore nothing that can grant
 * access the developer does not personally hold.
 */
async function authedJson<T>(
  client: GitHubClient,
  url: string,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${client.accessToken}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
      signal: AbortSignal.timeout(10_000),
    });
  } catch (e) {
    throw new GithubUnavailable(
      `Could not reach GitHub: ${e instanceof Error ? e.message : "unknown error"}`,
    );
  }

  /* GitHub uses 403 for both a spent rate limit and a real permission failure,
   * and only the headers tell them apart. Reporting exhaustion as "nothing
   * here" would show a developer an empty repo list and let them conclude
   * their repos are gone. */
  if (
    (res.status === 403 || res.status === 429) &&
    res.headers.get("x-ratelimit-remaining") === "0"
  ) {
    throw new GithubUnavailable(
      "GitHub's rate limit is exhausted. Try again shortly.",
    );
  }

  if (!res.ok) throw new GithubUnavailable(`GitHub returned ${res.status}`);
  return (await res.json()) as T;
}

export async function listUserRepos(
  client: GitHubClient,
): Promise<GithubRepo[]> {
  const body = await authedJson<
    { id: number; full_name: string; private: boolean; default_branch: string }[]
  >(client, "https://api.github.com/user/repos?per_page=100&sort=updated");

  return body.map((r) => ({
    githubRepoId: String(r.id),
    fullName: r.full_name,
    private: r.private,
    defaultBranch: r.default_branch,
  }));
}

export async function listBranches(
  client: GitHubClient,
  fullName: string,
): Promise<GithubBranch[]> {
  const body = await authedJson<{ name: string; commit: { sha: string } }[]>(
    client,
    `https://api.github.com/repos/${fullName}/branches?per_page=100`,
  );
  return body.map((b) => ({ name: b.name, commitSha: b.commit.sha }));
}

export async function listCommits(
  client: GitHubClient,
  fullName: string,
  ref: string,
): Promise<GithubCommit[]> {
  const body = await authedJson<
    {
      sha: string;
      commit: { message: string; author: { name: string; date: string } | null };
    }[]
  >(
    client,
    `https://api.github.com/repos/${fullName}/commits?sha=${encodeURIComponent(ref)}&per_page=50`,
  );

  return body.map((c) => ({
    sha: c.sha,
    message: c.commit.message.split("\n")[0],
    authorName: c.commit.author?.name ?? "Unknown",
    committedAt: c.commit.author?.date ?? new Date(0).toISOString(),
  }));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run packages/github/tests/repos.test.ts
```

Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/github/src/index.ts packages/github/tests/repos.test.ts
git commit -m "feat(github): list a developer's repos, branches, and commits"
```

---

### Task 4: The repos service — every rule lives here

**Files:**
- Modify: `apps/web/lib/auth/authorization.ts` (export `isDeveloperMember`)
- Create: `apps/web/lib/repos/service.ts`
- Test: `apps/web/tests/repos/service.test.ts`

**Interfaces:**
- Consumes: `isProjectMember`, `isDeveloperMember` from `../auth/authorization`; `forbidden`, `notFound`, `conflict`, `isUniqueViolation` from `../api/errors`; `GithubRepo`, `listUserRepos` from `@zkcvp/github`
- Produces:
  - `type AttachedRepo = { id: string; githubRepoId: string; fullName: string; addedAt: Date; undoableUntil: Date }`
  - `UNDO_WINDOW_MS = 60_000`
  - `assertDeveloperMember(db, session, projectId): Promise<DeveloperSession>`
  - `listAttachedRepos(db, session, projectId): Promise<AttachedRepo[]>`
  - `listCandidateRepos(db, session, projectId, gh): Promise<GithubRepo[]>` where `gh = { list: (client) => Promise<GithubRepo[]> }`
  - `attachRepo(db, session, projectId, { githubRepoId, fullName }): Promise<AttachedRepo>`
  - `detachRepo(db, session, projectId, repoId): Promise<void>`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/tests/repos/service.test.ts
import { describe, expect, it } from "vitest";
import { withTestSchema } from "@zkcvp/db/testing";
import { eq } from "drizzle-orm";
import {
  developers,
  projectDevelopers,
  projectRepos,
  projects,
  stakeholders,
  type Db,
} from "@zkcvp/db";
import type { GithubRepo } from "@zkcvp/github";
import { ServiceError } from "../../lib/api/errors";
import {
  attachRepo,
  detachRepo,
  listAttachedRepos,
  listCandidateRepos,
} from "../../lib/repos/service";

const hello: GithubRepo = {
  githubRepoId: "1296269",
  fullName: "octocat/Hello-World",
  private: true,
  defaultBranch: "main",
};
const spoon: GithubRepo = {
  githubRepoId: "9999",
  fullName: "octocat/Spoon-Knife",
  private: false,
  defaultBranch: "main",
};

const lists = (repos: GithubRepo[]) => ({ list: async () => repos });

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
  await db.insert(projectDevelopers).values({
    projectId: project.id,
    developerId: dev.id,
    addedBy: s.id,
  });

  return {
    project,
    dev,
    devSession: {
      kind: "developer" as const,
      developerId: dev.id,
      githubAccessToken: "gho_token",
    },
    shSession: { kind: "stakeholder" as const, stakeholderId: s.id },
  };
}

describe("attachRepo", () => {
  it("attaches a repo for a developer member", async () => {
    await withTestSchema(async (db) => {
      const { project, devSession } = await fixture(db);

      const repo = await attachRepo(db, devSession, project.id, {
        githubRepoId: hello.githubRepoId,
        fullName: hello.fullName,
      });

      expect(repo.fullName).toBe("octocat/Hello-World");
      expect(repo.undoableUntil.getTime()).toBe(repo.addedAt.getTime() + 60_000);
    });
  });

  it("returns 409 rather than a second row when already attached", async () => {
    await withTestSchema(async (db) => {
      const { project, devSession } = await fixture(db);
      const args = { githubRepoId: hello.githubRepoId, fullName: hello.fullName };
      await attachRepo(db, devSession, project.id, args);

      const err = await attachRepo(db, devSession, project.id, args).catch((e) => e);

      expect(err).toBeInstanceOf(ServiceError);
      expect((err as ServiceError).status).toBe(409);
    });
  });

  it("refuses a stakeholder, who has no GitHub identity", async () => {
    await withTestSchema(async (db) => {
      const { project, shSession } = await fixture(db);

      const err = await attachRepo(db, shSession, project.id, {
        githubRepoId: hello.githubRepoId,
        fullName: hello.fullName,
      }).catch((e) => e);

      expect((err as ServiceError).status).toBe(403);
    });
  });
});

describe("listAttachedRepos", () => {
  it("is readable by a stakeholder member — no GitHub call is involved", async () => {
    await withTestSchema(async (db) => {
      const { project, devSession, shSession } = await fixture(db);
      await attachRepo(db, devSession, project.id, {
        githubRepoId: hello.githubRepoId,
        fullName: hello.fullName,
      });

      const rows = await listAttachedRepos(db, shSession, project.id);

      expect(rows.map((r) => r.fullName)).toEqual(["octocat/Hello-World"]);
    });
  });
});

describe("listCandidateRepos", () => {
  it("removes repos already attached to THIS project", async () => {
    await withTestSchema(async (db) => {
      const { project, devSession } = await fixture(db);
      await attachRepo(db, devSession, project.id, {
        githubRepoId: hello.githubRepoId,
        fullName: hello.fullName,
      });

      const candidates = await listCandidateRepos(
        db,
        devSession,
        project.id,
        lists([hello, spoon]),
      );

      expect(candidates.map((r) => r.fullName)).toEqual(["octocat/Spoon-Knife"]);
    });
  });
});

describe("detachRepo", () => {
  it("removes a repo inside the undo window", async () => {
    await withTestSchema(async (db) => {
      const { project, devSession } = await fixture(db);
      const repo = await attachRepo(db, devSession, project.id, {
        githubRepoId: hello.githubRepoId,
        fullName: hello.fullName,
      });

      await detachRepo(db, devSession, project.id, repo.id);

      const rows = await db
        .select()
        .from(projectRepos)
        .where(eq(projectRepos.id, repo.id));
      expect(rows).toHaveLength(0);
    });
  });

  it("returns 409 once the window has passed", async () => {
    await withTestSchema(async (db) => {
      const { project, dev, devSession } = await fixture(db);
      const [old] = await db
        .insert(projectRepos)
        .values({
          projectId: project.id,
          githubRepoId: hello.githubRepoId,
          fullName: hello.fullName,
          addedBy: dev.id,
          addedAt: new Date(Date.now() - 61_000),
        })
        .returning();

      const err = await detachRepo(db, devSession, project.id, old.id).catch((e) => e);

      expect((err as ServiceError).status).toBe(409);
      const rows = await db
        .select()
        .from(projectRepos)
        .where(eq(projectRepos.id, old.id));
      expect(rows).toHaveLength(1);
    });
  });

  it("returns 404 for a repo attached to a different project", async () => {
    await withTestSchema(async (db) => {
      const { project, dev, devSession } = await fixture(db);
      const [s2] = await db
        .insert(stakeholders)
        .values({ email: "s2@example.com", displayName: "S2" })
        .returning();
      const [other] = await db
        .insert(projects)
        .values({ name: "Other", createdBy: s2.id })
        .returning();
      const [strayRepo] = await db
        .insert(projectRepos)
        .values({
          projectId: other.id,
          githubRepoId: hello.githubRepoId,
          fullName: hello.fullName,
          addedBy: dev.id,
        })
        .returning();

      const err = await detachRepo(db, devSession, project.id, strayRepo.id).catch(
        (e) => e,
      );

      expect((err as ServiceError).status).toBe(404);
    });
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

```bash
npx vitest run apps/web/tests/repos/service.test.ts
```

Expected: FAIL — cannot resolve `../../lib/repos/service`.

- [ ] **Step 3: Export `isDeveloperMember`**

In `apps/web/lib/auth/authorization.ts`, change the declaration from private to exported:

```ts
export async function isDeveloperMember(
```

(It is currently `async function isDeveloperMember(`. Nothing else in that file changes.)

- [ ] **Step 4: Write the service**

```ts
// apps/web/lib/repos/service.ts
import { and, eq } from "drizzle-orm";
import { projectRepos, type Db } from "@zkcvp/db";
import {
  createGitHubClient,
  listUserRepos,
  type GithubRepo,
} from "@zkcvp/github";
import { isDeveloperMember, isProjectMember } from "../auth/authorization";
import type { DeveloperSession, Session } from "../auth/types";
import { conflict, forbidden, isUniqueViolation, notFound } from "../api/errors";

/**
 * Removal is an undo, not a detach.
 *
 * Past this window an attachment is permanent for the life of the project.
 * That is what makes a claim unable to reference a repo removed from under it,
 * which is why claims may hold a plain foreign key to an attachment row.
 */
export const UNDO_WINDOW_MS = 60_000;

export type AttachedRepo = {
  id: string;
  githubRepoId: string;
  fullName: string;
  addedAt: Date;
  /** Absolute instant the undo expires. The UI never computes this itself. */
  undoableUntil: Date;
};

/** Injected so tests never reach the network. Production passes the real call. */
export type RepoLister = { list: (client: ReturnType<typeof createGitHubClient>) => Promise<GithubRepo[]> };

export const liveRepoLister: RepoLister = { list: listUserRepos };

const present = (row: typeof projectRepos.$inferSelect): AttachedRepo => ({
  id: row.id,
  githubRepoId: row.githubRepoId,
  fullName: row.fullName,
  addedAt: row.addedAt,
  undoableUntil: new Date(row.addedAt.getTime() + UNDO_WINDOW_MS),
});

/**
 * Every repo action but reading requires a developer, because every one of them
 * spends the acting developer's own GitHub token. A stakeholder has no GitHub
 * identity at all, so this is a statement about capability, not about trust.
 */
export async function assertDeveloperMember(
  db: Db,
  session: Session,
  projectId: string,
): Promise<DeveloperSession> {
  if (session.kind !== "developer") {
    throw forbidden("Only a developer may perform this action");
  }
  if (!(await isDeveloperMember(db, session.developerId, projectId))) {
    throw forbidden();
  }
  return session;
}

/** Readable by any project member: it touches the attachment table only. */
export async function listAttachedRepos(
  db: Db,
  session: Session,
  projectId: string,
): Promise<AttachedRepo[]> {
  if (!(await isProjectMember(db, session, projectId))) throw forbidden();

  const rows = await db
    .select()
    .from(projectRepos)
    .where(eq(projectRepos.projectId, projectId))
    .orderBy(projectRepos.addedAt);

  return rows.map(present);
}

export async function listCandidateRepos(
  db: Db,
  session: Session,
  projectId: string,
  gh: RepoLister = liveRepoLister,
): Promise<GithubRepo[]> {
  const dev = await assertDeveloperMember(db, session, projectId);

  const attached = await db
    .select({ githubRepoId: projectRepos.githubRepoId })
    .from(projectRepos)
    .where(eq(projectRepos.projectId, projectId));

  const taken = new Set(attached.map((r) => r.githubRepoId));
  const all = await gh.list(createGitHubClient(dev.githubAccessToken));
  return all.filter((r) => !taken.has(r.githubRepoId));
}

export async function attachRepo(
  db: Db,
  session: Session,
  projectId: string,
  input: { githubRepoId: string; fullName: string },
): Promise<AttachedRepo> {
  const dev = await assertDeveloperMember(db, session, projectId);

  /* Insert and let the unique constraint arbitrate, rather than checking then
   * inserting — the same approach the developer-invite endpoint takes, and for
   * the same reason: a check-then-insert has a race the constraint does not. */
  try {
    const [row] = await db
      .insert(projectRepos)
      .values({
        projectId,
        githubRepoId: input.githubRepoId,
        fullName: input.fullName,
        addedBy: dev.developerId,
      })
      .returning();
    return present(row);
  } catch (e) {
    if (isUniqueViolation(e)) {
      throw conflict("That repo is already attached to this project");
    }
    throw e;
  }
}

export async function detachRepo(
  db: Db,
  session: Session,
  projectId: string,
  repoId: string,
): Promise<void> {
  await assertDeveloperMember(db, session, projectId);

  const [row] = await db
    .select()
    .from(projectRepos)
    .where(and(eq(projectRepos.id, repoId), eq(projectRepos.projectId, projectId)));

  /* Scoped to the project in the query, so a repo attached to a project the
   * caller cannot see is a 404 and not a 403 — the response must not confirm
   * that the id exists somewhere else. */
  if (!row) throw notFound("No such attached repo");

  if (Date.now() - row.addedAt.getTime() > UNDO_WINDOW_MS) {
    throw conflict(
      "The undo window has passed. An attached repo is permanent for the life of the project.",
    );
  }

  await db.delete(projectRepos).where(eq(projectRepos.id, repoId));
}
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
npx vitest run apps/web/tests/repos/service.test.ts
```

Expected: PASS, 8 tests.

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/repos/service.ts apps/web/lib/auth/authorization.ts apps/web/tests/repos/service.test.ts
git commit -m "feat(web): repo attachment rules, with removal as a 60-second undo"
```

---

### Task 5: The six route handlers

**Files:**
- Create: `apps/web/app/api/projects/[projectId]/repos/route.ts`
- Create: `apps/web/app/api/projects/[projectId]/repos/candidates/route.ts`
- Create: `apps/web/app/api/projects/[projectId]/repos/[repoId]/route.ts`
- Create: `apps/web/app/api/projects/[projectId]/repos/[repoId]/branches/route.ts`
- Create: `apps/web/app/api/projects/[projectId]/repos/[repoId]/commits/route.ts`
- Modify: `apps/web/lib/repos/service.ts` (add `getAttachedRepo`)
- Test: `apps/web/tests/repos/live.test.ts`

**Interfaces:**
- Consumes: everything Task 4 produced; `handle` from `../lib/api/respond`; `parseBody` from `../lib/api/parse`
- Produces: `getAttachedRepo(db, session, projectId, repoId): Promise<AttachedRepo>` — used by the branches and commits handlers to resolve `repoId` to a `fullName` without trusting the client

- [ ] **Step 1: Write the failing test for the new service function**

```ts
// apps/web/tests/repos/live.test.ts
import { describe, expect, it } from "vitest";
import { withTestSchema } from "@zkcvp/db/testing";
import {
  developers,
  projectDevelopers,
  projectRepos,
  projects,
  stakeholders,
  type Db,
} from "@zkcvp/db";
import { ServiceError } from "../../lib/api/errors";
import { getAttachedRepo } from "../../lib/repos/service";

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

  return {
    project,
    repo,
    devSession: {
      kind: "developer" as const,
      developerId: dev.id,
      githubAccessToken: "gho_token",
    },
  };
}

describe("getAttachedRepo", () => {
  it("resolves a repo id to the stored full name", async () => {
    await withTestSchema(async (db) => {
      const { project, repo, devSession } = await fixture(db);

      const found = await getAttachedRepo(db, devSession, project.id, repo.id);

      expect(found.fullName).toBe("octocat/Hello-World");
    });
  });

  it("404s for a repo id that is not attached to this project", async () => {
    await withTestSchema(async (db) => {
      const { project, devSession } = await fixture(db);

      const err = await getAttachedRepo(
        db,
        devSession,
        project.id,
        "00000000-0000-0000-0000-000000000000",
      ).catch((e) => e);

      expect((err as ServiceError).status).toBe(404);
    });
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

```bash
npx vitest run apps/web/tests/repos/live.test.ts
```

Expected: FAIL — `getAttachedRepo` is not exported.

- [ ] **Step 3: Add `getAttachedRepo` to the service**

Append to `apps/web/lib/repos/service.ts`:

```ts
/**
 * Resolves an attachment id to its stored `fullName`.
 *
 * The branches and commits endpoints take a repo id, never a repo name: a
 * caller-supplied name would let any developer member read any repo their token
 * can reach, whether or not it is attached to this project.
 */
export async function getAttachedRepo(
  db: Db,
  session: Session,
  projectId: string,
  repoId: string,
): Promise<AttachedRepo> {
  await assertDeveloperMember(db, session, projectId);

  const [row] = await db
    .select()
    .from(projectRepos)
    .where(and(eq(projectRepos.id, repoId), eq(projectRepos.projectId, projectId)));

  if (!row) throw notFound("No such attached repo");
  return present(row);
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run apps/web/tests/repos/live.test.ts
```

Expected: PASS, 2 tests.

- [ ] **Step 5: Write the list and attach handlers**

```ts
// apps/web/app/api/projects/[projectId]/repos/route.ts
import { z } from "zod";
import { handle } from "../../../../../lib/api/respond";
import { parseBody } from "../../../../../lib/api/parse";
import { getDb } from "../../../../../lib/db";
import { requireSession } from "../../../../../lib/auth/session";
import { attachRepo, listAttachedRepos } from "../../../../../lib/repos/service";

const attachSchema = z.object({
  githubRepoId: z.string().trim().min(1, "Required"),
  fullName: z.string().trim().min(1, "Required"),
});

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  return handle(async () => {
    const { projectId } = await params;
    const session = await requireSession();
    const repos = await listAttachedRepos(getDb(), session, projectId);
    return Response.json({ repos });
  });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  return handle(async () => {
    const { projectId } = await params;
    const session = await requireSession();
    const body = await parseBody(req, attachSchema);
    const repo = await attachRepo(getDb(), session, projectId, body);
    return Response.json({ repo }, { status: 201 });
  });
}
```

- [ ] **Step 6: Write the candidates handler**

```ts
// apps/web/app/api/projects/[projectId]/repos/candidates/route.ts
import { handle } from "../../../../../../lib/api/respond";
import { getDb } from "../../../../../../lib/db";
import { requireSession } from "../../../../../../lib/auth/session";
import { listCandidateRepos } from "../../../../../../lib/repos/service";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  return handle(async () => {
    const { projectId } = await params;
    const session = await requireSession();
    const repos = await listCandidateRepos(getDb(), session, projectId);
    return Response.json({ repos });
  });
}
```

- [ ] **Step 7: Write the detach handler**

```ts
// apps/web/app/api/projects/[projectId]/repos/[repoId]/route.ts
import { handle } from "../../../../../../lib/api/respond";
import { getDb } from "../../../../../../lib/db";
import { requireSession } from "../../../../../../lib/auth/session";
import { detachRepo } from "../../../../../../lib/repos/service";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ projectId: string; repoId: string }> },
) {
  return handle(async () => {
    const { projectId, repoId } = await params;
    const session = await requireSession();
    await detachRepo(getDb(), session, projectId, repoId);
    return new Response(null, { status: 204 });
  });
}
```

- [ ] **Step 8: Write the branches and commits handlers**

```ts
// apps/web/app/api/projects/[projectId]/repos/[repoId]/branches/route.ts
import { createGitHubClient, listBranches } from "@zkcvp/github";
import { handle } from "../../../../../../../lib/api/respond";
import { getDb } from "../../../../../../../lib/db";
import { requireSession } from "../../../../../../../lib/auth/session";
import { getAttachedRepo } from "../../../../../../../lib/repos/service";
import { githubUnavailable } from "../../../../../../../lib/api/errors";
import { GithubUnavailable } from "@zkcvp/github";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ projectId: string; repoId: string }> },
) {
  return handle(async () => {
    const { projectId, repoId } = await params;
    const session = await requireSession();
    const repo = await getAttachedRepo(getDb(), session, projectId, repoId);

    /* The session must be a developer's by now — getAttachedRepo asserts it —
     * but narrow explicitly rather than casting, so a future change to that
     * assertion cannot silently reach for a token that is not there. */
    if (session.kind !== "developer") throw githubUnavailable();

    try {
      const branches = await listBranches(
        createGitHubClient(session.githubAccessToken),
        repo.fullName,
      );
      return Response.json({ branches, defaultBranchFirst: true });
    } catch (e) {
      if (e instanceof GithubUnavailable) throw githubUnavailable(e.message);
      throw e;
    }
  });
}
```

```ts
// apps/web/app/api/projects/[projectId]/repos/[repoId]/commits/route.ts
import { createGitHubClient, GithubUnavailable, listCommits } from "@zkcvp/github";
import { handle } from "../../../../../../../lib/api/respond";
import { getDb } from "../../../../../../../lib/db";
import { requireSession } from "../../../../../../../lib/auth/session";
import { getAttachedRepo } from "../../../../../../../lib/repos/service";
import { githubUnavailable, invalidBody } from "../../../../../../../lib/api/errors";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ projectId: string; repoId: string }> },
) {
  return handle(async () => {
    const { projectId, repoId } = await params;
    const session = await requireSession();
    const repo = await getAttachedRepo(getDb(), session, projectId, repoId);
    if (session.kind !== "developer") throw githubUnavailable();

    const ref = new URL(req.url).searchParams.get("ref");
    if (!ref) throw invalidBody({ ref: "Required" });

    try {
      const commits = await listCommits(
        createGitHubClient(session.githubAccessToken),
        repo.fullName,
        ref,
      );
      return Response.json({ commits });
    } catch (e) {
      if (e instanceof GithubUnavailable) throw githubUnavailable(e.message);
      throw e;
    }
  });
}
```

- [ ] **Step 9: Typecheck and run the full suite**

```bash
npm run typecheck
npm run test
```

Expected: both exit 0. Read the exit code; do not pipe.

- [ ] **Step 10: Commit**

```bash
git add apps/web/app/api/projects apps/web/lib/repos/service.ts apps/web/tests/repos/live.test.ts
git commit -m "feat(web): six repo endpoints, all spending the developer's own token"
```

---

### Task 6: The `/projects/[id]/repos` screen

**Files:**
- Create: `apps/web/app/projects/[id]/repos/page.tsx`
- Create: `apps/web/app/projects/[id]/repos/AttachRepoForm.tsx`
- Create: `apps/web/app/projects/[id]/repos/actions.ts`
- Modify: `apps/web/app/projects/[id]/page.tsx` (add the link)

**Interfaces:**
- Consumes: `listAttachedRepos`, `listCandidateRepos`, `attachRepo`, `detachRepo`, `UNDO_WINDOW_MS` from `lib/repos/service`
- Produces: nothing other tasks consume

- [ ] **Step 1: Invoke the impeccable skill before writing any markup**

This is the first UI in this sprint and it sets the pattern the claim screens follow. Read the existing `apps/web/app/projects/[id]/members/page.tsx` first — it is the closest analog (a list, plus a role-gated form) and this screen should look like a sibling of it, not a new invention.

- [ ] **Step 2: Write the Server Component**

The page is role-aware in one pass, the way `/projects/[id]` and `/projects/[id]/members` already are: one query, one conditional on `session.kind`. A stakeholder member sees the attached list and nothing else — no picker, no undo, because they have no GitHub identity to spend.

```tsx
// apps/web/app/projects/[id]/repos/page.tsx
import { getDb } from "../../../../lib/db";
import { requireSession } from "../../../../lib/auth/session";
import { getProject } from "../../../../lib/projects/service";
import { listAttachedRepos, listCandidateRepos } from "../../../../lib/repos/service";
import { AttachRepoForm } from "./AttachRepoForm";

export default async function ReposPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireSession();
  const db = getDb();

  const project = await getProject(db, session, id);
  const repos = await listAttachedRepos(db, session, id);

  const isDeveloper = session.kind === "developer";
  const candidates = isDeveloper ? await listCandidateRepos(db, session, id) : [];

  return (
    <main>
      <h1>{project.name} — repositories</h1>

      {repos.length === 0 ? (
        <p>No repositories attached yet.</p>
      ) : (
        <ul>
          {repos.map((r) => (
            <li key={r.id}>
              {r.fullName}
              {/* Absolute date, never relative — a product rule, not a style
                  preference. */}
              <span> attached {r.addedAt.toISOString().slice(0, 10)}</span>
            </li>
          ))}
        </ul>
      )}

      {isDeveloper && <AttachRepoForm projectId={id} candidates={candidates} />}
    </main>
  );
}
```

The markup above is deliberately structural. Step 3 replaces it with Ledger components under the impeccable skill's direction — do not ship it as written.

- [ ] **Step 3: Style it with Ledger components**

Use the components that already exist rather than adding new ones: `Card` for the page shell, `Table` or `RequirementList`'s list idiom for the attached repos, `EmptyState` for the no-repos case, `Button` for the actions, `UndoToast` (already in `Feedback.tsx`, already carrying a countdown) for the 60-second window. Ledger ships no modal, so the picker is an inline `Field` + `Select`, matching how create and edit are routed pages with inline forms elsewhere.

Do not hand-roll a component. If something genuinely does not exist, add it to Ledger properly with a render-check assertion — that is the standing rule in this codebase, and hand-rolling in the app is what it exists to prevent.

- [ ] **Step 4: Write the Server Actions**

```ts
// apps/web/app/projects/[id]/repos/actions.ts
"use server";
import { revalidatePath } from "next/cache";
import { getDb } from "../../../../lib/db";
import { requireSession } from "../../../../lib/auth/session";
import { attachRepo, detachRepo } from "../../../../lib/repos/service";
import { attempt } from "../../../../lib/forms/attempt";

export async function attachRepoAction(
  _prev: unknown,
  formData: FormData,
): Promise<{ error?: string }> {
  return attempt(async () => {
    const projectId = String(formData.get("projectId"));
    const session = await requireSession();
    await attachRepo(getDb(), session, projectId, {
      githubRepoId: String(formData.get("githubRepoId")),
      fullName: String(formData.get("fullName")),
    });
    revalidatePath(`/projects/${projectId}/repos`);
    return {};
  });
}

export async function detachRepoAction(
  _prev: unknown,
  formData: FormData,
): Promise<{ error?: string }> {
  return attempt(async () => {
    const projectId = String(formData.get("projectId"));
    const session = await requireSession();
    await detachRepo(getDb(), session, projectId, String(formData.get("repoId")));
    revalidatePath(`/projects/${projectId}/repos`);
    return {};
  });
}
```

Read `apps/web/lib/forms/attempt.ts` before writing this — it is the existing helper that turns a thrown `ServiceError` into a value `useActionState` can render, which is how every other form in this app avoids a thrown error page. Match its signature exactly rather than the sketch above if they differ.

- [ ] **Step 5: Link the screen from the project page**

In `apps/web/app/projects/[id]/page.tsx`, beside the existing members link, add a repositories link. Both are visible to every project member; the page behind it is what differs by role.

- [ ] **Step 6: Verify in a browser**

```bash
npm run dev
```

Sign in as a developer, open `/projects/<id>/repos`, and confirm: the candidate list shows real repos from your GitHub account, attaching one moves it out of candidates and into attached, the undo toast counts down and removes the row when used, and after 60 seconds the remove action reports the conflict rather than silently failing.

Then sign in as a stakeholder on the same project and confirm the picker and undo are absent while the attached list still renders.

- [ ] **Step 7: Run typecheck, tests, and the render check**

```bash
npm run verify
```

Expected: exit 0. This runs typecheck, the suite, and the design system's render check.

- [ ] **Step 8: Commit**

```bash
git add apps/web/app/projects
git commit -m "feat(web): attach repos and browse commits from the project screen"
```

---

## Self-Review

**Spec coverage.** Plan 02's data model is Task 2; its three GitHub calls are Task 3; its six-endpoint API contract is Task 5; its authorization matrix is enforced in Task 4 and tested there; the 60-second undo window is Task 4 and exercised in the browser in Task 6; its three invariants map to Task 2's unique constraint, Task 3's token-per-call design, and Task 4's `detachRepo` window check. The streaming spike from plan 03 is Task 1. Nothing in plan 02 is unimplemented.

**Known gap, deliberate.** Plan 02 describes commit browsing as paginated. Tasks 3 and 5 fetch a single page of 50 commits and 100 branches with no pagination, because Ledger ships no pagination component and adding one before a real caller shapes its API is the kind of speculative work this codebase avoids. The claim screen in Plan 2 picks from that first page. If 50 commits proves too few in use, pagination is an additive change to `listCommits` and its handler.

**Type consistency.** `AttachedRepo` is produced in Task 4 and consumed unchanged in Tasks 5 and 6. `GithubRepo`, `GithubBranch`, and `GithubCommit` are produced in Task 3 and consumed in Tasks 4, 5, and 6. `assertDeveloperMember` is defined once in Task 4 and reused by `getAttachedRepo` in Task 5. `UNDO_WINDOW_MS` has one definition and is the only source of the undo deadline, which `AttachedRepo.undoableUntil` carries to the UI so no screen recomputes it.
