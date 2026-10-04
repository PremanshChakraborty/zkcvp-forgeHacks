// apps/web/tests/claims/schema.test.ts
import { describe, expect, it } from "vitest";
import { withTestSchema } from "@zkcvp/db/testing";
import {
  claimRepos,
  claims,
  developers,
  projectRepos,
  projects,
  stakeholders,
  type Db,
} from "@zkcvp/db";
import { isUniqueViolation } from "../../lib/api/errors";

async function seed(db: Db) {
  const [s] = await db
    .insert(stakeholders)
    .values({ email: "s@example.com", displayName: "S" })
    .returning();
  const [p] = await db.insert(projects).values({ name: "P", createdBy: s.id }).returning();
  const [d] = await db
    .insert(developers)
    .values({ githubUserId: "1", githubUsername: "dev", displayName: "Dev" })
    .returning();
  const [repo] = await db
    .insert(projectRepos)
    .values({
      projectId: p.id,
      githubRepoId: "1296269",
      fullName: "octocat/Hello-World",
      defaultBranch: "main",
      addedBy: d.id,
    })
    .returning();
  const [claim] = await db
    .insert(claims)
    .values({ projectId: p.id, submittedBy: d.id })
    .returning();
  return { p, d, repo, claim };
}

describe("claim_repos", () => {
  it("accepts one commit for a repo", async () => {
    await withTestSchema(async (db) => {
      const { repo, claim } = await seed(db);
      const [row] = await db
        .insert(claimRepos)
        .values({ claimId: claim.id, projectRepoId: repo.id, commitSha: "a".repeat(40) })
        .returning();
      expect(row.commitSha).toHaveLength(40);
    });
  });

  it("rejects a second commit for the same repo in one claim", async () => {
    await withTestSchema(async (db) => {
      const { repo, claim } = await seed(db);
      await db
        .insert(claimRepos)
        .values({ claimId: claim.id, projectRepoId: repo.id, commitSha: "a".repeat(40) });

      const err = await db
        .insert(claimRepos)
        .values({ claimId: claim.id, projectRepoId: repo.id, commitSha: "b".repeat(40) })
        .catch((e: unknown) => e);

      expect(isUniqueViolation(err)).toBe(true);
    });
  });
});
