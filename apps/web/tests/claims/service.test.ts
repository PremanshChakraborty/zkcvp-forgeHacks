// apps/web/tests/claims/service.test.ts
import { describe, expect, it } from "vitest";
import { withTestSchema } from "@zkcvp/db/testing";
import { eq } from "drizzle-orm";
import {
  claims,
  developers,
  evaluations,
  projectDevelopers,
  projectRepos,
  projectStakeholders,
  projects,
  requirements,
  requirementVersions,
  stakeholders,
  verdicts,
  type Db,
} from "@zkcvp/db";
import type { EvidenceBundle, Report } from "@zkcvp/contracts";
import { ServiceError } from "../../lib/api/errors";
import { createRequirement } from "../../lib/requirements/service";
import {
  createClaim,
  evidenceHash,
  getClaim,
  listClaims,
  recordEvaluation,
} from "../../lib/claims/service";

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
   * row, so the stakeholder must also be inserted as a project_stakeholders
   * row to actually be a member (needed for createRequirement below). */
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
    devSession: {
      kind: "developer" as const,
      developerId: dev.id,
      githubAccessToken: "gho_token",
    },
    shSession,
    stakeholderId: s.id,
  };
}

const sha = "a".repeat(40);

describe("createClaim", () => {
  it("returns Evaluator input with the repo's full name and pinned sha", async () => {
    await withTestSchema(async (db) => {
      const { project, repo, requirement, devSession } = await fixture(db);

      const claim = await createClaim(db, devSession, project.id, {
        requirementVersionIds: [requirement.currentVersionId],
        repos: [{ projectRepoId: repo.id, commitSha: sha }],
      });

      expect(claim.repoCommits).toEqual([
        { repo: "octocat/Hello-World", commitSha: sha },
      ]);
      expect(claim.requirements[0].title).toBe("OAuth login works");
    });
  });

  it("409s when a requirement version is no longer current", async () => {
    await withTestSchema(async (db) => {
      const { project, repo, requirement, devSession, stakeholderId } = await fixture(db);
      const stale = requirement.currentVersionId;
      // Simulate a stakeholder editing mid-compose: a new current version.
      const [next] = await db
        .insert(requirementVersions)
        .values({
          requirementId: requirement.id,
          versionNumber: 2,
          title: "OAuth login works",
          description: "Changed while the developer was composing.",
          createdBy: stakeholderId,
        })
        .returning();
      await db
        .update(requirements)
        .set({ currentVersionId: next.id })
        .where(eq(requirements.id, requirement.id));

      const err = await createClaim(db, devSession, project.id, {
        requirementVersionIds: [stale],
        repos: [{ projectRepoId: repo.id, commitSha: sha }],
      }).catch((e) => e);

      expect((err as ServiceError).status).toBe(409);
    });
  });

  it("404s for a repo not attached to this project", async () => {
    await withTestSchema(async (db) => {
      const { project, requirement, devSession } = await fixture(db);

      const err = await createClaim(db, devSession, project.id, {
        requirementVersionIds: [requirement.currentVersionId],
        repos: [
          { projectRepoId: "00000000-0000-0000-0000-000000000000", commitSha: sha },
        ],
      }).catch((e) => e);

      expect((err as ServiceError).status).toBe(404);
    });
  });

  it("refuses a stakeholder", async () => {
    await withTestSchema(async (db) => {
      const { project, repo, requirement, shSession } = await fixture(db);

      const err = await createClaim(db, shSession, project.id, {
        requirementVersionIds: [requirement.currentVersionId],
        repos: [{ projectRepoId: repo.id, commitSha: sha }],
      }).catch((e) => e);

      expect((err as ServiceError).status).toBe(403);
    });
  });

  it("409s when a claim names the same repo twice", async () => {
    await withTestSchema(async (db) => {
      const { project, repo, requirement, devSession } = await fixture(db);

      const err = await createClaim(db, devSession, project.id, {
        requirementVersionIds: [requirement.currentVersionId],
        repos: [
          { projectRepoId: repo.id, commitSha: sha },
          { projectRepoId: repo.id, commitSha: "b".repeat(40) },
        ],
      }).catch((e) => e);

      expect((err as ServiceError).status).toBe(409);
    });
  });
});

function artifacts(
  claimId: string,
  versionId: string,
  verdict: "satisfied" | "not_satisfied",
  evaluationId: string,
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
    createdAt: new Date().toISOString(),
    perRequirement: [
      { requirementVersionId: versionId, verdict, rationale: "See src/auth.ts, lines 15-30." },
    ],
  };
  return { evidence, report };
}

describe("recordEvaluation", () => {
  it("writes the evaluation, the verdicts, and the status in one go", async () => {
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
        artifacts(claim.claimId, versionId, "satisfied", crypto.randomUUID()),
      );

      const [version] = await db
        .select()
        .from(requirementVersions)
        .where(eq(requirementVersions.id, versionId));
      expect(version.status).toBe("verified");

      const rows = await db.select().from(verdicts);
      expect(rows[0].verdict).toBe("satisfied");
    });
  });

  it("maps not_satisfied to eval_failed, which is a verdict and not a malfunction", async () => {
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
        artifacts(claim.claimId, versionId, "not_satisfied", crypto.randomUUID()),
      );

      const [version] = await db
        .select()
        .from(requirementVersions)
        .where(eq(requirementVersions.id, versionId));
      expect(version.status).toBe("eval_failed");
    });
  });

  it("re-evaluation is symmetric — eval_failed can return to verified", async () => {
    await withTestSchema(async (db) => {
      const { project, repo, requirement, devSession } = await fixture(db);
      const versionId = requirement.currentVersionId;

      for (const verdict of ["not_satisfied", "satisfied"] as const) {
        const claim = await createClaim(db, devSession, project.id, {
          requirementVersionIds: [versionId],
          repos: [{ projectRepoId: repo.id, commitSha: sha }],
        });
        const evaluationId = crypto.randomUUID();
        await recordEvaluation(
          db,
          claim.claimId,
          artifacts(claim.claimId, versionId, verdict, evaluationId),
        );
      }

      const [version] = await db
        .select()
        .from(requirementVersions)
        .where(eq(requirementVersions.id, versionId));
      expect(version.status).toBe("verified");
    });
  });

  it("leaves no evaluation row and no status change when nothing is recorded", async () => {
    await withTestSchema(async (db) => {
      const { project, repo, requirement, devSession } = await fixture(db);
      const versionId = requirement.currentVersionId;
      await createClaim(db, devSession, project.id, {
        requirementVersionIds: [versionId],
        repos: [{ projectRepoId: repo.id, commitSha: sha }],
      });

      // recordEvaluation is simply never called — the shape of a failed run.
      expect(await db.select().from(evaluations)).toHaveLength(0);
      const [version] = await db
        .select()
        .from(requirementVersions)
        .where(eq(requirementVersions.id, versionId));
      expect(version.status).toBe("new");
    });
  });
});

describe("getClaim", () => {
  it("never returns the evidence bundle", async () => {
    await withTestSchema(async (db) => {
      const { project, repo, requirement, devSession, shSession } = await fixture(db);
      const versionId = requirement.currentVersionId;
      const claim = await createClaim(db, devSession, project.id, {
        requirementVersionIds: [versionId],
        repos: [{ projectRepoId: repo.id, commitSha: sha }],
      });
      await recordEvaluation(
        db,
        claim.claimId,
        artifacts(claim.claimId, versionId, "satisfied", crypto.randomUUID()),
      );

      const detail = await getClaim(db, shSession, claim.claimId);

      expect(detail.evaluation).not.toBeNull();
      expect(detail.evaluation).not.toHaveProperty("evidence");
      expect(detail.evaluation).not.toHaveProperty("toolCallLog");
      expect(detail.evaluation).not.toHaveProperty("planReasoning");
      expect(detail.evaluation).not.toHaveProperty("droppedPaths");
    });
  });

  it("refuses a non-member", async () => {
    await withTestSchema(async (db) => {
      const { project, repo, requirement, devSession } = await fixture(db);
      const claim = await createClaim(db, devSession, project.id, {
        requirementVersionIds: [requirement.currentVersionId],
        repos: [{ projectRepoId: repo.id, commitSha: sha }],
      });

      const [outsider] = await db
        .insert(stakeholders)
        .values({ email: "outsider@example.com", displayName: "Outsider" })
        .returning();
      const outsiderSession = { kind: "stakeholder" as const, stakeholderId: outsider.id };

      const err = await getClaim(db, outsiderSession, claim.claimId).catch((e) => e);

      expect((err as ServiceError).status).toBe(403);
    });
  });

  it("is readable by a stakeholder member", async () => {
    await withTestSchema(async (db) => {
      const { project, repo, requirement, devSession, shSession } = await fixture(db);
      const claim = await createClaim(db, devSession, project.id, {
        requirementVersionIds: [requirement.currentVersionId],
        repos: [{ projectRepoId: repo.id, commitSha: sha }],
      });

      const detail = await getClaim(db, shSession, claim.claimId);

      expect(detail.id).toBe(claim.claimId);
      expect(detail.commits).toEqual([{ fullName: "octocat/Hello-World", commitSha: sha }]);
    });
  });

  it("reads as evaluation: null for an interrupted run", async () => {
    await withTestSchema(async (db) => {
      const { project, repo, requirement, devSession, shSession } = await fixture(db);
      const claim = await createClaim(db, devSession, project.id, {
        requirementVersionIds: [requirement.currentVersionId],
        repos: [{ projectRepoId: repo.id, commitSha: sha }],
      });

      // recordEvaluation is simply never called — the abandoned-submission shape.
      const detail = await getClaim(db, shSession, claim.claimId);

      expect(detail.evaluation).toBeNull();
    });
  });
});

describe("evidenceHash", () => {
  it("is stable regardless of key order", () => {
    const a = { evaluationId: "e", claimId: "c", toolCallLog: [], planReasoning: "p", droppedPaths: [] };
    const b = { droppedPaths: [], planReasoning: "p", toolCallLog: [], claimId: "c", evaluationId: "e" };
    expect(evidenceHash(a as EvidenceBundle)).toBe(evidenceHash(b as EvidenceBundle));
  });
});

describe("listClaims", () => {
  it("returns an empty list for a project with no claims", async () => {
    await withTestSchema(async (db) => {
      const { project, shSession } = await fixture(db);
      /* Not a formality: the query pages `inArray` over the claim ids it just
       * read, and `in ()` is a syntax error in Postgres. A project with no
       * claims is the first thing every project is. */
      await expect(listClaims(db, shSession, project.id)).resolves.toEqual([]);
    });
  });

  it("refuses a caller who is not a member of the project", async () => {
    await withTestSchema(async (db) => {
      const { project } = await fixture(db);
      const [outsider] = await db
        .insert(stakeholders)
        .values({ email: "outsider@example.com", displayName: "O" })
        .returning();

      await expect(
        listClaims(
          db,
          { kind: "stakeholder", stakeholderId: outsider.id },
          project.id,
        ),
      ).rejects.toBeInstanceOf(ServiceError);
    });
  });

  /*
   * The stitching test. Three claims are fetched with three list queries and
   * joined in memory, which is the whole reason this function does not cost one
   * round trip per claim, and also the only way it can go wrong: a tally landing
   * on the wrong claim, or one claim's commits appearing under another.
   *
   * The three claims are deliberately different shapes. The mixed one proves
   * the tally is per claim rather than per project; the interrupted one proves
   * `outcome: null` survives being stitched beside claims that do have one.
   *
   * `submitted_at` is set explicitly. It defaults to `now()`, and three claims
   * written inside one test can land on an identical timestamp, which would
   * make an ordering assertion pass with no ORDER BY at all.
   */
  it("orders newest first and tallies each claim's own verdicts", async () => {
    await withTestSchema(async (db) => {
      const { project, repo, requirement, shSession, devSession } =
        await fixture(db);
      const versionA = requirement.currentVersionId;

      const second = await createRequirement(db, shSession, project.id, {
        title: "Sessions expire",
        description: "An idle session is signed out after 30 minutes.",
      });
      const versionB = second.currentVersionId;

      const submit = async (versionIds: string[], commitSha: string, at: Date) => {
        const claim = await createClaim(db, devSession, project.id, {
          requirementVersionIds: versionIds,
          repos: [{ projectRepoId: repo.id, commitSha }],
        });
        await db
          .update(claims)
          .set({ submittedAt: at })
          .where(eq(claims.id, claim.claimId));
        return claim.claimId;
      };

      /* Oldest: both requirements, one satisfied and one not. */
      const mixed = await submit(
        [versionA, versionB],
        "a".repeat(40),
        new Date("2026-01-01T00:00:00.000Z"),
      );
      const mixedEvaluation = crypto.randomUUID();
      await recordEvaluation(db, mixed, {
        evidence: {
          evaluationId: mixedEvaluation,
          claimId: mixed,
          toolCallLog: [],
          planReasoning: "Read the auth module.",
          droppedPaths: [],
        },
        report: {
          evaluationId: mixedEvaluation,
          claimId: mixed,
          modelId: "gemini-3.5-flash",
          promptTemplateVersion: "v1",
          createdAt: new Date("2026-01-01T00:05:00.000Z").toISOString(),
          perRequirement: [
            {
              requirementVersionId: versionA,
              verdict: "satisfied",
              rationale: "See src/auth.ts, lines 15-30.",
            },
            {
              requirementVersionId: versionB,
              verdict: "not_satisfied",
              rationale: "No expiry is enforced; see src/session.ts.",
            },
          ],
        },
      });

      /* Middle: one requirement, satisfied. */
      const single = await submit(
        [versionB],
        "b".repeat(40),
        new Date("2026-01-02T00:00:00.000Z"),
      );
      await recordEvaluation(
        db,
        single,
        artifacts(single, versionB, "satisfied", crypto.randomUUID()),
      );

      /* Newest: submitted and never evaluated. */
      const abandoned = await submit(
        [versionA],
        "c".repeat(40),
        new Date("2026-01-03T00:00:00.000Z"),
      );

      const list = await listClaims(db, shSession, project.id);

      expect(list.map((c) => c.id)).toEqual([abandoned, single, mixed]);

      /* Null is "no report exists", not a zero tally. Every other rendering of
       * an abandoned submission in this product depends on the two staying
       * distinguishable. */
      expect(list[0].outcome).toBeNull();
      expect(list[1].outcome).toEqual({ satisfied: 1, notSatisfied: 0 });
      expect(list[2].outcome).toEqual({ satisfied: 1, notSatisfied: 1 });

      /* The pinned count comes from the claim, never from the verdicts. The
       * abandoned claim is the case that proves it: it pinned one requirement
       * and produced no verdicts, so a count derived from the tally would read
       * zero and report that the developer claimed nothing. */
      expect(list.map((c) => c.requirementCount)).toEqual([1, 1, 2]);
      for (const c of list) {
        if (c.outcome === null) continue;
        expect(c.outcome.satisfied + c.outcome.notSatisfied).toBe(
          c.requirementCount,
        );
      }

      expect(list[2].commits).toEqual([
        { fullName: "octocat/Hello-World", commitSha: "a".repeat(40) },
      ]);
      expect(list.every((c) => c.submittedBy === "mira")).toBe(true);
    });
  });
});
