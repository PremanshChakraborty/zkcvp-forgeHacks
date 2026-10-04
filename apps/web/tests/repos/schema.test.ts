import { describe, expect, it } from "vitest";
import { withTestSchema } from "@zkcvp/db/testing";
import { developers, projectRepos, projects, stakeholders } from "@zkcvp/db/schema";
import type { Db } from "@zkcvp/db";
import { isUniqueViolation } from "../../lib/api/errors";

async function seed(db: Db) {
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
    .values({ githubUserId: "1", githubUsername: "dev", displayName: "Dev" })
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
          defaultBranch: "main",
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
        defaultBranch: "main",
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
        defaultBranch: "main",
        addedBy: d.id,
      });
      const [second] = await db
        .insert(projectRepos)
        .values({
          projectId: p2.id,
          githubRepoId: "1296269",
          fullName: "octocat/Hello-World",
          defaultBranch: "main",
          addedBy: d.id,
        })
        .returning();

      expect(second.projectId).toBe(p2.id);
    });
  });
});
