// apps/web/lib/requirements/service.ts
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import {
  evaluations,
  requirementVersions,
  requirements,
  verdicts,
  type Db,
} from "@zkcvp/db";
import type { RequirementStatus, Verdict } from "@zkcvp/contracts";
import { isProjectMember } from "../auth/authorization";
import type { Session } from "../auth/types";
import { forbidden, notFound } from "../api/errors";
import { assertStakeholderMember } from "../projects/service";

export type RequirementView = {
  id: string;
  projectId: string;
  title: string;
  description: string;
  /** ALWAYS from the current version via a join. Never stored on requirements. */
  status: RequirementStatus;
  versionNumber: number;
  currentVersionId: string;
  archivedAt: Date | null;
  createdAt: Date;
};

export type VersionView = {
  id: string;
  versionNumber: number;
  title: string;
  description: string;
  status: RequirementStatus;
  createdAt: Date;
};

/** The single projection of "requirement joined to its current version". */
const requirementView = {
  id: requirements.id,
  projectId: requirements.projectId,
  title: requirementVersions.title,
  description: requirementVersions.description,
  status: requirementVersions.status,
  versionNumber: requirementVersions.versionNumber,
  currentVersionId: requirementVersions.id,
  archivedAt: requirements.archivedAt,
  createdAt: requirements.createdAt,
};

/**
 * One transaction, in three steps, because `current_version_id` and
 * `requirement_id` are a circular FK pair: insert the requirement with a null
 * pointer, insert version 1, then point the requirement at it. The column is
 * nullable ONLY for the width of this transaction.
 */
export async function createRequirement(
  db: Db,
  session: Session,
  projectId: string,
  input: { title: string; description: string },
): Promise<RequirementView> {
  const caller = await assertStakeholderMember(db, session, projectId);

  return db.transaction(async (tx) => {
    const [requirement] = await tx
      .insert(requirements)
      .values({ projectId, createdBy: caller.stakeholderId })
      .returning();

    const [version] = await tx
      .insert(requirementVersions)
      .values({
        requirementId: requirement.id,
        versionNumber: 1,
        title: input.title,
        description: input.description,
        /* Written explicitly rather than left to the column default, so plan 01
         * invariant 4 is visible at the line that could break it. */
        status: "new",
        createdBy: caller.stakeholderId,
      })
      .returning();

    await tx
      .update(requirements)
      .set({ currentVersionId: version.id })
      .where(eq(requirements.id, requirement.id));

    return {
      id: requirement.id,
      projectId: requirement.projectId,
      title: version.title,
      description: version.description,
      status: version.status,
      versionNumber: version.versionNumber,
      currentVersionId: version.id,
      archivedAt: requirement.archivedAt,
      createdAt: requirement.createdAt,
    };
  });
}

export async function listRequirements(
  db: Db,
  session: Session,
  projectId: string,
  opts: { includeArchived?: boolean } = {},
): Promise<RequirementView[]> {
  if (!(await isProjectMember(db, session, projectId))) throw forbidden();

  return db
    .select(requirementView)
    .from(requirements)
    .innerJoin(
      requirementVersions,
      eq(requirements.currentVersionId, requirementVersions.id),
    )
    .where(
      opts.includeArchived
        ? eq(requirements.projectId, projectId)
        : and(
            eq(requirements.projectId, projectId),
            isNull(requirements.archivedAt),
          ),
    )
    .orderBy(asc(requirements.createdAt));
}

/** Loads a requirement without an authorization check. Internal use only. */
export async function loadRequirement(
  db: Db,
  requirementId: string,
): Promise<RequirementView> {
  const [row] = await db
    .select(requirementView)
    .from(requirements)
    .innerJoin(
      requirementVersions,
      eq(requirements.currentVersionId, requirementVersions.id),
    )
    .where(eq(requirements.id, requirementId));

  if (!row) throw notFound("No such requirement");
  return row;
}

export async function getRequirement(
  db: Db,
  session: Session,
  requirementId: string,
): Promise<{
  requirement: RequirementView;
  versionHistory: VersionView[];
  verdictsByVersion: Map<string, VerdictEntry[]>;
}> {
  const requirement = await loadRequirement(db, requirementId);

  if (!(await isProjectMember(db, session, requirement.projectId))) {
    throw forbidden();
  }

  const versionHistory = await db
    .select({
      id: requirementVersions.id,
      versionNumber: requirementVersions.versionNumber,
      title: requirementVersions.title,
      description: requirementVersions.description,
      status: requirementVersions.status,
      createdAt: requirementVersions.createdAt,
    })
    .from(requirementVersions)
    .where(eq(requirementVersions.requirementId, requirementId))
    .orderBy(asc(requirementVersions.versionNumber));

  /* Every version's verdicts, not just the current one's. A superseded version
   * keeps whatever verdict it was evaluated against — that is the whole point
   * of pinning a claim to a version — and the requirement page reads as an
   * audit trail only if those stay visible under the version they judged.
   *
   * The current version's latest verdict is the first entry under
   * `requirement.currentVersionId`, which is why there is no second query for
   * it: `verdictHistoryFor` orders by the same `evaluations.createdAt` desc
   * that `latestVerdictFor` does, so the two cannot disagree. */
  const verdictsByVersion = await verdictHistoryFor(db, requirementId);

  return { requirement, versionHistory, verdictsByVersion };
}

export type LatestVerdict = {
  verdict: Verdict;
  rationale: string;
  modelId: string;
  createdAt: Date;
  claimId: string;
};

/**
 * One verdict in a requirement's history, WITHOUT its rationale.
 *
 * The omission is the point and it is enforced here rather than left to the
 * page: a rationale is a paragraph, and a history is a list. Selecting it so a
 * screen can choose not to render it invites the screen to render it, and the
 * requirement page then becomes a wall of prose that nobody reads. The claim
 * page is where a rationale belongs, and `claimId` is the route to it.
 */
export type VerdictEntry = {
  requirementVersionId: string;
  verdict: Verdict;
  modelId: string;
  createdAt: Date;
  claimId: string;
};

/**
 * Every verdict ever recorded against any version of one requirement, grouped
 * by the version it judged and newest first within each group.
 *
 * One query, not one per version: a requirement with twelve versions would
 * otherwise cost twelve round trips to render a page that shows all of them
 * collapsed. `verdicts_requirement_version_idx` does not serve this filter —
 * the join reaches versions through `requirement_id` — but the version set of
 * a single requirement is small enough that the FK index on
 * `requirement_versions.requirement_id` carries it.
 *
 * Selects nothing a project member may not see, and in particular never
 * `evaluations.evidence`, which holds verbatim private source.
 */
export async function verdictHistoryFor(
  db: Db,
  requirementId: string,
): Promise<Map<string, VerdictEntry[]>> {
  const rows = await db
    .select({
      requirementVersionId: verdicts.requirementVersionId,
      verdict: verdicts.verdict,
      modelId: evaluations.modelId,
      createdAt: evaluations.createdAt,
      claimId: evaluations.claimId,
    })
    .from(verdicts)
    .innerJoin(evaluations, eq(evaluations.id, verdicts.evaluationId))
    .innerJoin(
      requirementVersions,
      eq(requirementVersions.id, verdicts.requirementVersionId),
    )
    .where(eq(requirementVersions.requirementId, requirementId))
    /* The same key `latestVerdictFor` orders by, so "the first entry for the
     * current version" and "the latest verdict" are the same row by
     * construction rather than by coincidence. */
    .orderBy(desc(evaluations.createdAt));

  const byVersion = new Map<string, VerdictEntry[]>();
  for (const row of rows) {
    const bucket = byVersion.get(row.requirementVersionId);
    if (bucket) bucket.push(row);
    else byVersion.set(row.requirementVersionId, [row]);
  }
  return byVersion;
}

/**
 * The most recent verdict against one requirement version, or null if it has
 * never been evaluated.
 *
 * Ordered and limited to one by `evaluations.createdAt` — the Evaluator's own
 * timestamp for when the report was produced, not any row-insertion order —
 * because a version can be claimed and re-evaluated any number of times
 * (recordEvaluation's re-evaluation is symmetric) and only the newest verdict
 * belongs on the requirement page. The index added in Task 1
 * (`verdicts_requirement_version_idx`) serves the filter this join runs.
 *
 * Selects only what a stakeholder or developer may see: never
 * `evaluations.evidence`, which holds verbatim private source and must never
 * be selected by any query outside the claim's own evidence path.
 */
export async function latestVerdictFor(
  db: Db,
  requirementVersionId: string,
): Promise<LatestVerdict | null> {
  const [row] = await db
    .select({
      verdict: verdicts.verdict,
      rationale: verdicts.rationale,
      modelId: evaluations.modelId,
      createdAt: evaluations.createdAt,
      claimId: evaluations.claimId,
    })
    .from(verdicts)
    .innerJoin(evaluations, eq(evaluations.id, verdicts.evaluationId))
    .where(eq(verdicts.requirementVersionId, requirementVersionId))
    .orderBy(desc(evaluations.createdAt))
    .limit(1);

  return row ?? null;
}
