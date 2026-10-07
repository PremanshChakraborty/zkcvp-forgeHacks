// apps/web/tests/claims/route.test.ts
import { describe, expect, it, vi } from "vitest";
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
import { EvaluationError, type EvidenceBundle, type Report } from "@zkcvp/contracts";
import type { Session } from "../../lib/auth/types";
import { createRequirement } from "../../lib/requirements/service";
import { decodeFrames, isTerminal, type ClaimFrame } from "../../lib/claims/frames";

/*
 * `getDb()` and `requireSession()` are mocked at the module boundary — the
 * same seam magic-link-sender.test.ts uses for `nodemailer` — rather than
 * threaded through the route as parameters, because nothing about this route
 * needs a production DI point for either: `withTestSchema` already needs its
 * own pool per test file (see harness.ts), and a fixed developer session is
 * all any of these cases needs. Only the evaluator gets a real seam (see
 * `ClaimEvaluator` in route.ts), because the test controls its behaviour
 * directly rather than merely redirecting it.
 */
// Required by env.ts's schema; unrelated to the auth this route actually
// exercises (`requireSession` is mocked below), but `env()` validates the
// whole schema regardless of which fields a given request path reads.
process.env.AUTH_SECRET ??= "test-secret";

const state: { db?: Db; session?: Session } = {};

vi.mock("../../lib/db", () => ({
  getDb: () => state.db!,
}));

vi.mock("../../lib/auth/session", () => ({
  requireSession: () => state.session!,
}));

import { POST, type ClaimEvaluator } from "../../app/api/projects/[projectId]/claims/route";

async function fixture(db: Db) {
  const [s] = await db
    .insert(stakeholders)
    .values({ email: "s@example.com", displayName: "S" })
    .returning();
  const [project] = await db
    .insert(projects)
    .values({ name: "P", createdBy: s.id })
    .returning();
  // createdBy is display/audit only — an explicit membership row is what
  // authorization actually reads.
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

  const devSession: Session = {
    kind: "developer",
    developerId: dev.id,
    githubAccessToken: "gho_token",
  };

  return { project, repo, requirement, devSession };
}

function submitRequest(projectId: string, repoId: string, requirementVersionId: string): Request {
  return new Request(`http://localhost/api/projects/${projectId}/claims`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      requirementVersionIds: [requirementVersionId],
      repos: [{ projectRepoId: repoId, commitSha: "a".repeat(40) }],
    }),
  });
}

async function drainFrames(res: Response): Promise<ClaimFrame[]> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let rest = "";
  const frames: ClaimFrame[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    // The real wire decoder, not an ad-hoc split — this is the point of the test.
    const decoded = decodeFrames(rest + decoder.decode(value, { stream: true }));
    rest = decoded.rest;
    frames.push(...decoded.frames);
  }
  return frames;
}

describe("POST /api/projects/:projectId/claims", () => {
  it("a failing evaluation yields exactly one terminal frame, and it is `failed`", async () => {
    await withTestSchema(async (db) => {
      state.db = db;
      const { project, repo, requirement, devSession } = await fixture(db);
      state.session = devSession;

      const failingEvaluator: ClaimEvaluator = {
        // eslint-disable-next-line require-yield
        async *evaluateStream() {
          throw new EvaluationError(
            "rate_limited",
            "GitHub rate limit exceeded",
            "2026-09-15T00:00:00.000Z",
          );
        },
      };

      const res = await POST(
        submitRequest(project.id, repo.id, requirement.currentVersionId),
        { params: Promise.resolve({ projectId: project.id }) },
        failingEvaluator,
      );

      const frames = await drainFrames(res);
      const terminal = frames.filter(isTerminal);

      // Never both, never neither: exactly one terminal frame.
      expect(terminal).toHaveLength(1);
      expect(frames.filter((f) => f.t === "done")).toHaveLength(0);

      const [frame] = terminal;
      expect(frame.t).toBe("failed");
      if (frame.t !== "failed") throw new Error("unreachable");
      expect(frame.kind).toBe("rate_limited");
      expect(frame.status).toBe(429);
    });
  });

  it("a succeeding evaluation yields exactly one terminal frame, and it is `done`", async () => {
    await withTestSchema(async (db) => {
      state.db = db;
      const { project, repo, requirement, devSession } = await fixture(db);
      state.session = devSession;

      const evaluationId = crypto.randomUUID();
      const succeedingEvaluator: ClaimEvaluator = {
        // eslint-disable-next-line require-yield
        async *evaluateStream() {
          const evidence: EvidenceBundle = {
            evaluationId,
            claimId: "unknown-until-createClaim-runs",
            toolCallLog: [],
            planReasoning: "Read the auth module.",
            droppedPaths: [],
          };
          const report: Report = {
            evaluationId,
            claimId: "unknown-until-createClaim-runs",
            modelId: "gemini-3.5-flash",
            promptTemplateVersion: "v1",
            createdAt: new Date().toISOString(),
            perRequirement: [
              {
                requirementVersionId: requirement.currentVersionId,
                verdict: "satisfied",
                rationale: "See src/auth.ts, lines 15-30.",
              },
            ],
          };
          return { evidence, report };
        },
      };

      const res = await POST(
        submitRequest(project.id, repo.id, requirement.currentVersionId),
        { params: Promise.resolve({ projectId: project.id }) },
        succeedingEvaluator,
      );

      const frames = await drainFrames(res);
      const terminal = frames.filter(isTerminal);

      // Never both, never neither: exactly one terminal frame.
      expect(terminal).toHaveLength(1);
      expect(frames.filter((f) => f.t === "failed")).toHaveLength(0);

      const [frame] = terminal;
      expect(frame.t).toBe("done");
      if (frame.t !== "done") throw new Error("unreachable");
      expect(frame.evaluationId).toBe(evaluationId);
    });
  });
});
