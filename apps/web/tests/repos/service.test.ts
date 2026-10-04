// apps/web/tests/repos/service.test.ts
import { describe, expect, it } from "vitest";
import { withTestSchema } from "@zkcvp/db/testing";
import { eq } from "drizzle-orm";
import {
  claimRepos,
  claims,
  developers,
  projectDevelopers,
  projectRepos,
  projectStakeholders,
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
  /* createdBy is display/audit only — authorization always reads a membership
   * row (see packages/db/src/schema/projects.ts), so the creator must also be
   * inserted as a project_stakeholders row to actually be a member. */
  await db.insert(projectStakeholders).values({
    projectId: project.id,
    stakeholderId: s.id,
    addedBy: s.id,
  });
  const [dev] = await db
    .insert(developers)
    .values({ githubUserId: "77", githubUsername: "mira", displayName: "Mira" })
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

      const repo = await attachRepo(
        db,
        devSession,
        project.id,
        { githubRepoId: hello.githubRepoId, fullName: hello.fullName },
        lists([hello, spoon]),
      );

      expect(repo.fullName).toBe("octocat/Hello-World");
      expect(repo.defaultBranch).toBe("main");
      expect(repo.undoableUntil.getTime()).toBe(repo.addedAt.getTime() + 60_000);
    });
  });

  it("returns 409 rather than a second row when already attached", async () => {
    await withTestSchema(async (db) => {
      const { project, devSession } = await fixture(db);
      const args = { githubRepoId: hello.githubRepoId, fullName: hello.fullName };
      await attachRepo(db, devSession, project.id, args, lists([hello, spoon]));

      const err = await attachRepo(db, devSession, project.id, args, lists([hello, spoon])).catch(
        (e) => e,
      );

      expect(err).toBeInstanceOf(ServiceError);
      expect((err as ServiceError).status).toBe(409);
    });
  });

  it("refuses a stakeholder, who has no GitHub identity", async () => {
    await withTestSchema(async (db) => {
      const { project, shSession } = await fixture(db);

      const err = await attachRepo(
        db,
        shSession,
        project.id,
        { githubRepoId: hello.githubRepoId, fullName: hello.fullName },
        lists([hello, spoon]),
      ).catch((e) => e);

      expect((err as ServiceError).status).toBe(403);
    });
  });

  it("rejects a githubRepoId that does not match anything the developer's token can see", async () => {
    await withTestSchema(async (db) => {
      const { project, devSession } = await fixture(db);

      const err = await attachRepo(
        db,
        devSession,
        project.id,
        { githubRepoId: "does-not-exist", fullName: "someone/else" },
        lists([hello, spoon]),
      ).catch((e) => e);

      expect(err).toBeInstanceOf(ServiceError);
      expect((err as ServiceError).status).toBe(404);
    });
  });

  it("stores GitHub's own fullName, not the client-supplied one", async () => {
    await withTestSchema(async (db) => {
      const { project, devSession } = await fixture(db);

      /* The id is genuine but the client's fullName is stale or forged — the
       * stored row must carry what GitHub's own list says for that id, never
       * what the client claimed. */
      const repo = await attachRepo(
        db,
        devSession,
        project.id,
        { githubRepoId: hello.githubRepoId, fullName: "spoofed/name" },
        lists([hello, spoon]),
      );

      expect(repo.fullName).toBe(hello.fullName);
    });
  });
});

describe("listAttachedRepos", () => {
  it("is readable by a stakeholder member — no GitHub call is involved", async () => {
    await withTestSchema(async (db) => {
      const { project, devSession, shSession } = await fixture(db);
      await attachRepo(
        db,
        devSession,
        project.id,
        { githubRepoId: hello.githubRepoId, fullName: hello.fullName },
        lists([hello, spoon]),
      );

      const rows = await listAttachedRepos(db, shSession, project.id);

      expect(rows.map((r) => r.fullName)).toEqual(["octocat/Hello-World"]);
    });
  });
});

describe("listCandidateRepos", () => {
  it("removes repos already attached to THIS project", async () => {
    await withTestSchema(async (db) => {
      const { project, devSession } = await fixture(db);
      await attachRepo(
        db,
        devSession,
        project.id,
        { githubRepoId: hello.githubRepoId, fullName: hello.fullName },
        lists([hello, spoon]),
      );

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
      const repo = await attachRepo(
        db,
        devSession,
        project.id,
        { githubRepoId: hello.githubRepoId, fullName: hello.fullName },
        lists([hello, spoon]),
      );

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
          defaultBranch: "main",
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

  it("returns 409, not a raw foreign-key error, once a claim references the attachment", async () => {
    await withTestSchema(async (db) => {
      const { project, dev, devSession } = await fixture(db);
      const repo = await attachRepo(
        db,
        devSession,
        project.id,
        { githubRepoId: hello.githubRepoId, fullName: hello.fullName },
        lists([hello, spoon]),
      );

      /* The claim tables from packages/db/src/schema/claims.ts — a claim
       * transaction commits before evaluation runs, so a claim can reference
       * this attachment well inside the 60-second undo window. */
      const [claim] = await db
        .insert(claims)
        .values({ projectId: project.id, submittedBy: dev.id })
        .returning();
      await db.insert(claimRepos).values({
        claimId: claim.id,
        projectRepoId: repo.id,
        commitSha: "a".repeat(40),
      });

      const err = await detachRepo(db, devSession, project.id, repo.id).catch((e) => e);

      expect(err).toBeInstanceOf(ServiceError);
      expect((err as ServiceError).status).toBe(409);
      expect((err as ServiceError).message).toMatch(/submitted claim/);

      const rows = await db
        .select()
        .from(projectRepos)
        .where(eq(projectRepos.id, repo.id));
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
          defaultBranch: "main",
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
