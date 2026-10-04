// apps/web/lib/requirements/mutate.ts
import { desc, eq } from "drizzle-orm";
import { requirementVersions, requirements, type Db } from "@zkcvp/db";
import type { Session } from "../auth/types";
import { notFound } from "../api/errors";
import { assertStakeholderMember } from "../projects/service";
import { loadRequirement, type RequirementView } from "./service";

/**
 * Editing NEVER mutates a version — it writes a new one.
 *
 * The `SELECT ... FOR UPDATE` on the parent row is load-bearing: without it two
 * concurrent edits both read the same `max(version_number)` and one dies on the
 * `(requirement_id, version_number)` unique constraint. The lock serialises
 * them so they become versions n+1 and n+2.
 */
export async function editRequirement(
  db: Db,
  session: Session,
  requirementId: string,
  input: { title?: string; description?: string },
): Promise<RequirementView> {
  const current = await loadRequirement(db, requirementId);
  const caller = await assertStakeholderMember(db, session, current.projectId);

  return db.transaction(async (tx) => {
    const [locked] = await tx
      .select({ archivedAt: requirements.archivedAt })
      .from(requirements)
      .where(eq(requirements.id, requirementId))
      .for("update");

    /* Re-checked HERE, not before the transaction: the lock is what makes this
     * authoritative. A concurrent archive committing between an outside check
     * and this lock would otherwise let a new version land on an archived
     * requirement. There is no status-based precondition — a requirement is
     * editable in any status, only archival blocks it. */
    if (locked.archivedAt !== null) {
      throw notFound("This requirement is archived");
    }

    const [latest] = await tx
      .select({
        versionNumber: requirementVersions.versionNumber,
        title: requirementVersions.title,
        description: requirementVersions.description,
      })
      .from(requirementVersions)
      .where(eq(requirementVersions.requirementId, requirementId))
      .orderBy(desc(requirementVersions.versionNumber))
      .limit(1);

    const [version] = await tx
      .insert(requirementVersions)
      .values({
        requirementId,
        versionNumber: latest.versionNumber + 1,
        title: input.title ?? latest.title,
        description: input.description ?? latest.description,
        /* Unconditional. Never derived from the previous version's status. */
        status: "new",
        createdBy: caller.stakeholderId,
      })
      .returning();

    await tx
      .update(requirements)
      .set({ currentVersionId: version.id })
      .where(eq(requirements.id, requirementId));

    return {
      ...current,
      title: version.title,
      description: version.description,
      status: version.status,
      versionNumber: version.versionNumber,
      currentVersionId: version.id,
    };
  });
}

/**
 * Soft delete. No preconditions — archivable in any status — and it does not
 * touch `requirement_versions`. Archiving and status are orthogonal axes.
 * There is no un-archive in this phase.
 */
export async function archiveRequirement(
  db: Db,
  session: Session,
  requirementId: string,
): Promise<void> {
  const current = await loadRequirement(db, requirementId);
  await assertStakeholderMember(db, session, current.projectId);

  await db
    .update(requirements)
    .set({ archivedAt: new Date() })
    .where(eq(requirements.id, requirementId));
}
