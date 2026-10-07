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
import { GithubUnavailable, type GithubBranch, type GithubCommit, type GithubRepo } from "@zkcvp/github";
import { ServiceError } from "../../lib/api/errors";
import {
  getAttachedRepo,
  listCandidateRepos,
  listRepoBranches,
  listRepoCommits,
} from "../../lib/repos/service";

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
    .values({ githubUserId: "77", githubUsername: "mira", displayName: "Mira" })
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
      defaultBranch: "main",
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

      const { repo: found, developer } = await getAttachedRepo(
        db,
        devSession,
        project.id,
        repo.id,
      );

      expect(found.fullName).toBe("octocat/Hello-World");
      expect(developer.githubAccessToken).toBe("gho_token");
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

describe("listCandidateRepos", () => {
  it("translates a GithubUnavailable failure into a 503, not an empty list", async () => {
    await withTestSchema(async (db) => {
      const { project, devSession } = await fixture(db);

      const err = await listCandidateRepos(db, devSession, project.id, {
        list: async (): Promise<GithubRepo[]> => {
          throw new GithubUnavailable("rate limited");
        },
      }).catch((e) => e);

      expect((err as ServiceError).status).toBe(503);
      expect((err as ServiceError).code).toBe("github_unavailable");
    });
  });
});

describe("listRepoBranches", () => {
  it("returns whatever the injected lister returns", async () => {
    await withTestSchema(async (db) => {
      const { project, repo, devSession } = await fixture(db);
      const branches: GithubBranch[] = [{ name: "main", commitSha: "abc123" }];

      const result = await listRepoBranches(db, devSession, project.id, repo.id, {
        list: async () => branches,
      });

      expect(result).toEqual(branches);
    });
  });

  it("translates a GithubUnavailable failure into a 503, not a 404", async () => {
    await withTestSchema(async (db) => {
      const { project, repo, devSession } = await fixture(db);

      const err = await listRepoBranches(db, devSession, project.id, repo.id, {
        list: async () => {
          throw new GithubUnavailable("rate limited");
        },
      }).catch((e) => e);

      expect((err as ServiceError).status).toBe(503);
      expect((err as ServiceError).code).toBe("github_unavailable");
    });
  });
});

describe("listRepoCommits", () => {
  it("returns whatever the injected lister returns", async () => {
    await withTestSchema(async (db) => {
      const { project, repo, devSession } = await fixture(db);
      const commits: GithubCommit[] = [
        {
          sha: "abc123",
          message: "Initial commit",
          authorName: "Octocat",
          committedAt: "2020-01-01T00:00:00Z",
        },
      ];

      const result = await listRepoCommits(db, devSession, project.id, repo.id, "main", {
        list: async () => commits,
      });

      expect(result).toEqual(commits);
    });
  });

  it("translates a GithubUnavailable failure into a 503, not a 404", async () => {
    await withTestSchema(async (db) => {
      const { project, repo, devSession } = await fixture(db);

      const err = await listRepoCommits(db, devSession, project.id, repo.id, "main", {
        list: async () => {
          throw new GithubUnavailable("rate limited");
        },
      }).catch((e) => e);

      expect((err as ServiceError).status).toBe(503);
      expect((err as ServiceError).code).toBe("github_unavailable");
    });
  });
});
