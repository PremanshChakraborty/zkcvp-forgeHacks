// apps/web/lib/claims/service.ts
import { createHash } from "node:crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import {
  claimRepos,
  claimRequirementVersions,
  claims,
  developers,
  evaluations,
  projectRepos,
  requirementVersions,
  requirements,
  verdicts,
  type Db,
} from "@zkcvp/db";
import type { EvidenceBundle, Report, Verdict } from "@zkcvp/contracts";
import type { RequirementStatus } from "@zkcvp/contracts";
import { conflict, forbidden, notFound } from "../api/errors";
import { isProjectMember } from "../auth/authorization";
import type { Session } from "../auth/types";
import { assertDeveloperMember } from "../repos/service";

export type NewClaim = {
  claimId: string;
  repoCommits: { repo: string; commitSha: string }[];
  requirements: { requirementVersionId: string; title: string; description: string }[];
};

/**
 * A verdict's effect on the requirement version it judged.
 *
 * `eval_failed` means the Evaluator returned NOT SATISFIED. It is a legitimate
 * result, and the enum name is the only thing misleading about it — which is
 * why the string never reaches a screen.
 */
const STATUS_BY_VERDICT: Record<Verdict, RequirementStatus> = {
  satisfied: "verified",
  not_satisfied: "eval_failed",
};

/** Sorted-key JSON, so the same bundle always hashes the same. */
function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`);
  return `{${entries.join(",")}}`;
}

export function evidenceHash(evidence: EvidenceBundle): string {
  return createHash("sha256").update(canonical(evidence)).digest("hex");
}

/**
 * Writes the claim and returns exactly what the Evaluator needs.
 *
 * Everything fallible happens here, BEFORE the response starts streaming, so
 * each failure still gets a true HTTP status code.
 */
export async function createClaim(
  db: Db,
  session: Session,
  projectId: string,
  input: {
    requirementVersionIds: string[];
    repos: { projectRepoId: string; commitSha: string }[];
  },
): Promise<NewClaim> {
  const dev = await assertDeveloperMember(db, session, projectId);

  if (input.requirementVersionIds.length === 0) {
    throw conflict("A claim must name at least one requirement");
  }
  if (input.repos.length === 0) {
    throw conflict("A claim must name at least one commit");
  }

  const versions = await db
    .select({
      id: requirementVersions.id,
      title: requirementVersions.title,
      description: requirementVersions.description,
      requirementId: requirementVersions.requirementId,
      currentVersionId: requirements.currentVersionId,
      projectId: requirements.projectId,
      archivedAt: requirements.archivedAt,
    })
    .from(requirementVersions)
    .innerJoin(requirements, eq(requirements.id, requirementVersions.requirementId))
    .where(inArray(requirementVersions.id, input.requirementVersionIds));

  if (versions.length !== input.requirementVersionIds.length) {
    throw notFound("No such requirement version");
  }
  for (const v of versions) {
    if (v.projectId !== projectId) throw notFound("No such requirement version");
    if (v.archivedAt !== null) throw conflict("That requirement is archived");
    /* Pinned optimistically. Evaluating a version the developer never read
     * would attribute to them a claim they did not make; evaluating the
     * superseded one would judge text that no longer exists. */
    if (v.currentVersionId !== v.id) {
      throw conflict(
        "A requirement changed while this claim was being composed. Reload and try again.",
      );
    }
  }

  const repoIds = input.repos.map((r) => r.projectRepoId);
  if (repoIds.length !== new Set(repoIds).size) {
    throw conflict("A claim may name at most one commit per repo");
  }

  const attached = await db
    .select()
    .from(projectRepos)
    .where(and(eq(projectRepos.projectId, projectId), inArray(projectRepos.id, repoIds)));

  if (attached.length !== new Set(repoIds).size) {
    throw notFound("No such attached repo");
  }

  const nameById = new Map(attached.map((r) => [r.id, r.fullName]));

  const claimId = await db.transaction(async (tx) => {
    const [claim] = await tx
      .insert(claims)
      .values({ projectId, submittedBy: dev.developerId })
      .returning();

    await tx.insert(claimRepos).values(
      input.repos.map((r) => ({
        claimId: claim.id,
        projectRepoId: r.projectRepoId,
        commitSha: r.commitSha,
      })),
    );

    await tx.insert(claimRequirementVersions).values(
      input.requirementVersionIds.map((requirementVersionId) => ({
        claimId: claim.id,
        requirementVersionId,
      })),
    );

    return claim.id;
  });

  return {
    claimId,
    repoCommits: input.repos.map((r) => ({
      repo: nameById.get(r.projectRepoId)!,
      commitSha: r.commitSha,
    })),
    requirements: versions.map((v) => ({
      requirementVersionId: v.id,
      title: v.title,
      description: v.description,
    })),
  };
}

/**
 * The second transaction. Called ONLY when both artifacts exist.
 *
 * A failed run never reaches this function, which is what leaves every
 * requirement version holding exactly the status it had. There is no draft
 * state to park a partial report in, so a partial report is strictly worse
 * than none.
 */
export async function recordEvaluation(
  db: Db,
  claimId: string,
  artifacts: { evidence: EvidenceBundle; report: Report },
): Promise<void> {
  const { evidence, report } = artifacts;

  await db.transaction(async (tx) => {
    await tx.insert(evaluations).values({
      id: report.evaluationId,
      claimId,
      modelId: report.modelId,
      promptTemplateVersion: report.promptTemplateVersion,
      createdAt: new Date(report.createdAt),
      evidence,
      evidenceHash: evidenceHash(evidence),
    });

    await tx.insert(verdicts).values(
      report.perRequirement.map((r) => ({
        evaluationId: report.evaluationId,
        requirementVersionId: r.requirementVersionId,
        verdict: r.verdict,
        rationale: r.rationale,
      })),
    );

    for (const r of report.perRequirement) {
      await tx
        .update(requirementVersions)
        .set({ status: STATUS_BY_VERDICT[r.verdict] })
        .where(eq(requirementVersions.id, r.requirementVersionId));
    }
  });
}

export type ClaimSummary = {
  id: string;
  submittedAt: Date;
  /** The display cache from `developers`, never a join key. */
  submittedBy: string;
  commits: { fullName: string; commitSha: string }[];
  /**
   * How many requirement versions this claim pinned.
   *
   * Read from `claim_requirement_versions`, NOT from the verdict count, so it
   * is a fact about the claim rather than about its evaluation: an interrupted
   * run still claimed a definite number of requirements, and saying so is the
   * difference between "nothing was evaluated" and "nothing was claimed".
   */
  requirementCount: number;
  /**
   * The tally of the claim's own verdicts, one per requirement version it
   * pinned, or null when the run was interrupted.
   *
   * A verdict is per requirement version and never per claim. A claim naming
   * three requirements comes back with three verdicts and they may disagree,
   * which is why this is a pair of counts and not a single value: there is no
   * such thing as "the claim's verdict" to collapse them into.
   *
   * Null is NOT "pending" and NOT zero-of-zero: there is no in-flight state in
   * this product, so a claim with no evaluation is an abandoned submission and
   * nothing about it will ever change.
   */
  outcome: { satisfied: number; notSatisfied: number } | null;
};

/**
 * Every claim submitted against one project, newest first.
 *
 * Five queries whatever the claim count, never one per claim: the commits, the
 * pinned requirement versions, the evaluations and the verdicts are each
 * fetched for the whole page and stitched in memory. `DATABASE_URL` is a hosted pooler and round trips are the entire
 * cost of a page here (docs/architecture.md, "The harness"), so an N+1 that
 * looks harmless on a demo project is what this shape exists to refuse.
 *
 * Readable by any project member, stakeholders included, on the same reasoning
 * as `getClaim`: a report is unconditionally visible the moment it exists, and
 * this carries strictly less than the report does.
 */
export async function listClaims(
  db: Db,
  session: Session,
  projectId: string,
): Promise<ClaimSummary[]> {
  if (!(await isProjectMember(db, session, projectId))) throw forbidden();

  const rows = await db
    .select({
      id: claims.id,
      submittedAt: claims.submittedAt,
      submittedBy: developers.githubUsername,
    })
    .from(claims)
    .innerJoin(developers, eq(developers.id, claims.submittedBy))
    .where(eq(claims.projectId, projectId))
    .orderBy(desc(claims.submittedAt));

  /* `inArray` with an empty list builds `in ()`, which Postgres rejects. A
   * project with no claims is the first thing a new project is, so this is the
   * common path rather than a defensive edge. */
  if (rows.length === 0) return [];
  const claimIds = rows.map((r) => r.id);

  const commitRows = await db
    .select({
      claimId: claimRepos.claimId,
      fullName: projectRepos.fullName,
      commitSha: claimRepos.commitSha,
    })
    .from(claimRepos)
    .innerJoin(projectRepos, eq(projectRepos.id, claimRepos.projectRepoId))
    .where(inArray(claimRepos.claimId, claimIds));

  const pinnedRows = await db
    .select({ claimId: claimRequirementVersions.claimId })
    .from(claimRequirementVersions)
    .where(inArray(claimRequirementVersions.claimId, claimIds));

  const evaluationRows = await db
    .select({ id: evaluations.id, claimId: evaluations.claimId })
    .from(evaluations)
    .where(inArray(evaluations.claimId, claimIds));

  const verdictRows = evaluationRows.length
    ? await db
        .select({
          evaluationId: verdicts.evaluationId,
          verdict: verdicts.verdict,
        })
        .from(verdicts)
        .where(
          inArray(
            verdicts.evaluationId,
            evaluationRows.map((e) => e.id),
          ),
        )
    : [];

  const pinnedByClaim = new Map<string, number>();
  for (const p of pinnedRows) {
    pinnedByClaim.set(p.claimId, (pinnedByClaim.get(p.claimId) ?? 0) + 1);
  }

  const commitsByClaim = new Map<string, { fullName: string; commitSha: string }[]>();
  for (const c of commitRows) {
    const bucket = commitsByClaim.get(c.claimId);
    const entry = { fullName: c.fullName, commitSha: c.commitSha };
    if (bucket) bucket.push(entry);
    else commitsByClaim.set(c.claimId, [entry]);
  }

  /* Seeded from the EVALUATIONS, not from the verdicts, so a claim that was
   * evaluated reads as evaluated even if the tally is somehow empty. Deriving
   * "was this evaluated" from whether verdicts exist would render a real
   * evaluation as an interrupted run, which is the one distinction on this
   * screen that must not blur. */
  const tallyByClaim = new Map<string, { satisfied: number; notSatisfied: number }>();
  const claimByEvaluation = new Map(evaluationRows.map((e) => [e.id, e.claimId]));
  for (const e of evaluationRows) {
    tallyByClaim.set(e.claimId, { satisfied: 0, notSatisfied: 0 });
  }
  for (const v of verdictRows) {
    const tally = tallyByClaim.get(claimByEvaluation.get(v.evaluationId)!);
    if (!tally) continue;
    if (v.verdict === "satisfied") tally.satisfied++;
    else tally.notSatisfied++;
  }

  return rows.map((r) => ({
    id: r.id,
    submittedAt: r.submittedAt,
    submittedBy: r.submittedBy,
    commits: commitsByClaim.get(r.id) ?? [],
    requirementCount: pinnedByClaim.get(r.id) ?? 0,
    outcome: tallyByClaim.get(r.id) ?? null,
  }));
}

export type ClaimDetail = {
  id: string;
  projectId: string;
  submittedAt: Date;
  commits: { fullName: string; commitSha: string }[];
  /** Absent when the run was interrupted — an abandoned submission, not a status. */
  evaluation: {
    id: string;
    modelId: string;
    createdAt: Date;
    evidenceHash: string;
    results: { requirementVersionId: string; title: string; verdict: Verdict; rationale: string }[];
  } | null;
};

/**
 * Readable by any project member, stakeholders included: the report is
 * unconditionally visible the moment it exists. The evidence bundle is not
 * selected here at all, so it cannot leak through this path by accident.
 */
export async function getClaim(
  db: Db,
  session: Session,
  claimId: string,
): Promise<ClaimDetail> {
  const [claim] = await db.select().from(claims).where(eq(claims.id, claimId));
  if (!claim) throw notFound("No such claim");
  if (!(await isProjectMember(db, session, claim.projectId))) throw forbidden();

  const commits = await db
    .select({ fullName: projectRepos.fullName, commitSha: claimRepos.commitSha })
    .from(claimRepos)
    .innerJoin(projectRepos, eq(projectRepos.id, claimRepos.projectRepoId))
    .where(eq(claimRepos.claimId, claimId));

  const [evaluation] = await db
    .select({
      id: evaluations.id,
      modelId: evaluations.modelId,
      createdAt: evaluations.createdAt,
      evidenceHash: evaluations.evidenceHash,
    })
    .from(evaluations)
    .where(eq(evaluations.claimId, claimId));

  if (!evaluation) {
    return {
      id: claim.id,
      projectId: claim.projectId,
      submittedAt: claim.submittedAt,
      commits,
      evaluation: null,
    };
  }

  const results = await db
    .select({
      requirementVersionId: verdicts.requirementVersionId,
      title: requirementVersions.title,
      verdict: verdicts.verdict,
      rationale: verdicts.rationale,
    })
    .from(verdicts)
    .innerJoin(
      requirementVersions,
      eq(requirementVersions.id, verdicts.requirementVersionId),
    )
    .where(eq(verdicts.evaluationId, evaluation.id));

  return {
    id: claim.id,
    projectId: claim.projectId,
    submittedAt: claim.submittedAt,
    commits,
    evaluation: { ...evaluation, results },
  };
}
