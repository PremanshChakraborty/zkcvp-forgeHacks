// apps/web/tests/requirements/verdicts.test.ts
import { describe, expect, it } from "vitest";
import { withTestSchema } from "@zkcvp/db/testing";
import {
  developers,
  projectDevelopers,
  projectRepos,
  projectStakeholders,
  projects,
  stakeholders,
  type Db,
} from "@zkcvp/db";
import type { EvidenceBundle, Report } from "@zkcvp/contracts";
import { createRequirement } from "../../lib/requirements/service";
import { editRequirement } from "../../lib/requirements/mutate";
import { createClaim, recordEvaluation } from "../../lib/claims/service";
import {
  latestVerdictFor,
  verdictHistoryFor,
} from "../../lib/requirements/service";

/**
 * Same shape as apps/web/tests/claims/service.test.ts's fixture(): a real
 * project, a stakeholder who is actually a member (a directly-inserted
 * `projects` row creates no membership on its own — only a
 * `project_stakeholders` row does), a developer, an attached repo, and one
 * requirement at v1.
 */
async function fixture(db: Db) {
  const [s] = await db
    .insert(stakeholders)
    .values({ email: "s@example.com", displayName: "S" })
    .returning();
  const [project] = await db
    .insert(projects)
    .values({ name: "P", createdBy: s.id })
    .returning();
  await db
    .insert(projectStakeholders)
    .values({ projectId: project.id, stakeholderId: s.id, addedBy: s.id });
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

  const shSession = { kind: "stakeholder" as const, stakeholderId: s.id };
  const requirement = await createRequirement(db, shSession, project.id, {
    title: "OAuth login works",
    description: "A developer can sign in with GitHub.",
  });

  return {
    project,
    repo,
    requirement,
    shSession,
    devSession: {
      kind: "developer" as const,
      developerId: dev.id,
      githubAccessToken: "gho_token",
    },
  };
}

const sha = "a".repeat(40);

function artifacts(
  claimId: string,
  versionId: string,
  verdict: "satisfied" | "not_satisfied",
  evaluationId: string,
  rationale: string,
  createdAt: Date,
) {
  const evidence: EvidenceBundle = {
    evaluationId,
    claimId,
    toolCallLog: [],
    planReasoning: "Read the auth module.",
    droppedPaths: [],
  };
  const report: Report = {
    evaluationId,
    claimId,
    modelId: "gemini-3.5-flash",
    promptTemplateVersion: "v1",
    createdAt: createdAt.toISOString(),
    perRequirement: [{ requirementVersionId: versionId, verdict, rationale }],
  };
  return { evidence, report };
}

describe("latestVerdictFor", () => {
  it("returns null for a version never evaluated", async () => {
    await withTestSchema(async (db) => {
      await expect(
        latestVerdictFor(db, "00000000-0000-0000-0000-000000000000"),
      ).resolves.toBeNull();
    });
  });

  /*
   * Two evaluations against the SAME requirement version, from two separate
   * claims (recordEvaluation's own comment: it is called only once per claim,
   * and a claim carries exactly one evaluation), seeded through the real
   * write path — createClaim then recordEvaluation, exactly twice. The two
   * `createdAt` values are set an hour apart explicitly, rather than left to
   * `defaultNow()` or to two calls made back-to-back, because ordering is the
   * one thing this query does and a test where both rows could land at an
   * identical timestamp would pass whether or not the ORDER BY was even
   * present.
   */
  it("returns the newer of two evaluations, ordered by evaluations.createdAt", async () => {
    await withTestSchema(async (db) => {
      const { project, repo, requirement, devSession } = await fixture(db);
      const versionId = requirement.currentVersionId;

      const older = new Date("2026-01-01T00:00:00.000Z");
      const newer = new Date("2026-01-02T00:00:00.000Z");

      const firstClaim = await createClaim(db, devSession, project.id, {
        requirementVersionIds: [versionId],
        repos: [{ projectRepoId: repo.id, commitSha: sha }],
      });
      await recordEvaluation(
        db,
        firstClaim.claimId,
        artifacts(
          firstClaim.claimId,
          versionId,
          "not_satisfied",
          crypto.randomUUID(),
          "See src/auth.ts, lines 1-10.",
          older,
        ),
      );

      const secondClaim = await createClaim(db, devSession, project.id, {
        requirementVersionIds: [versionId],
        repos: [{ projectRepoId: repo.id, commitSha: "b".repeat(40) }],
      });
      await recordEvaluation(
        db,
        secondClaim.claimId,
        artifacts(
          secondClaim.claimId,
          versionId,
          "satisfied",
          crypto.randomUUID(),
          "See src/auth.ts, lines 15-30.",
          newer,
        ),
      );

      const result = await latestVerdictFor(db, versionId);

      expect(result).not.toBeNull();
      expect(result!.verdict).toBe("satisfied");
      expect(result!.rationale).toBe("See src/auth.ts, lines 15-30.");
      expect(result!.claimId).toBe(secondClaim.claimId);
      expect(result!.createdAt.getTime()).toBe(newer.getTime());
    });
  });
});

describe("verdictHistoryFor", () => {
  it("returns an empty map for a requirement never evaluated", async () => {
    await withTestSchema(async (db) => {
      const { requirement } = await fixture(db);
      const history = await verdictHistoryFor(db, requirement.id);
      expect(history.size).toBe(0);
    });
  });

  /*
   * The invariant the requirement page's whole history section rests on: a
   * verdict stays filed under the version it actually judged, and an edit that
   * supersedes that version does not move it, re-file it under the new one, or
   * drop it. Verification attaches to a specific version and never to
   * "whatever is current" (plan 01), so a history that re-homed an old verdict
   * would be reporting that the Evaluator judged text it never read.
   *
   * Three evaluations, deliberately unbalanced: two against v1, one against v2,
   * with explicit `createdAt` values an hour apart. Ordering is the other thing
   * this query promises and two rows sharing a timestamp would pass whether or
   * not the ORDER BY were present at all.
   */
  it("files each verdict under the version it judged, newest first", async () => {
    await withTestSchema(async (db) => {
      const { project, repo, requirement, shSession, devSession } =
        await fixture(db);
      const v1 = requirement.currentVersionId;

      const evaluate = async (
        versionId: string,
        verdict: "satisfied" | "not_satisfied",
        commitSha: string,
        createdAt: Date,
      ) => {
        const claim = await createClaim(db, devSession, project.id, {
          requirementVersionIds: [versionId],
          repos: [{ projectRepoId: repo.id, commitSha }],
        });
        await recordEvaluation(
          db,
          claim.claimId,
          artifacts(
            claim.claimId,
            versionId,
            verdict,
            crypto.randomUUID(),
            "See src/auth.ts, lines 1-10.",
            createdAt,
          ),
        );
        return claim.claimId;
      };

      const firstOnV1 = await evaluate(
        v1,
        "not_satisfied",
        "a".repeat(40),
        new Date("2026-01-01T00:00:00.000Z"),
      );
      const secondOnV1 = await evaluate(
        v1,
        "satisfied",
        "b".repeat(40),
        new Date("2026-01-02T00:00:00.000Z"),
      );

      /* The edit writes v2 and leaves v1's two verdicts exactly where they
       * are. Only a stakeholder may edit, which is why the fixture hands back
       * `shSession`. */
      const edited = await editRequirement(db, shSession, requirement.id, {
        description: "A developer can sign in with GitHub, and stays signed in.",
      });
      const v2 = edited.currentVersionId;
      expect(v2).not.toBe(v1);

      const onV2 = await evaluate(
        v2,
        "satisfied",
        "c".repeat(40),
        new Date("2026-01-03T00:00:00.000Z"),
      );

      const history = await verdictHistoryFor(db, requirement.id);

      expect([...history.keys()].sort()).toEqual([v1, v2].sort());
      expect(history.get(v1)!.map((e) => e.claimId)).toEqual([
        secondOnV1,
        firstOnV1,
      ]);
      expect(history.get(v2)!.map((e) => e.claimId)).toEqual([onV2]);

      /* What the page reads as "the latest verdict" is [0] of the current
       * version's bucket, so it has to be the same row latestVerdictFor
       * returns. Two orderings that agree today and drift later is exactly the
       * failure this pins. */
      const latest = await latestVerdictFor(db, v2);
      expect(history.get(v2)![0].claimId).toBe(latest!.claimId);
    });
  });

  /*
   * The rationale is withheld at the QUERY, not at the page. A future select
   * that widened to include it would leave every requirement page one JSX line
   * away from becoming a wall of prose, and nothing else in the suite would
   * notice, because rendering it would still typecheck.
   */
  it("never carries a rationale", async () => {
    await withTestSchema(async (db) => {
      const { project, repo, requirement, devSession } = await fixture(db);
      const versionId = requirement.currentVersionId;

      const claim = await createClaim(db, devSession, project.id, {
        requirementVersionIds: [versionId],
        repos: [{ projectRepoId: repo.id, commitSha: sha }],
      });
      await recordEvaluation(
        db,
        claim.claimId,
        artifacts(
          claim.claimId,
          versionId,
          "satisfied",
          crypto.randomUUID(),
          "See src/auth.ts, lines 15-30.",
          new Date("2026-01-01T00:00:00.000Z"),
        ),
      );

      const [entry] = (await verdictHistoryFor(db, requirement.id)).get(
        versionId,
      )!;
      expect(entry).not.toHaveProperty("rationale");
      expect(entry.modelId).toBe("gemini-3.5-flash");
    });
  });
});
