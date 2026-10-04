// apps/web/lib/auth/authorization.ts
import { and, eq } from "drizzle-orm";
import { projectDevelopers, projectStakeholders, type Db } from "@zkcvp/db";
import type { Session } from "./types";

export async function isStakeholderMember(
  db: Db,
  stakeholderId: string,
  projectId: string,
): Promise<boolean> {
  const [row] = await db
    .select()
    .from(projectStakeholders)
    .where(
      and(
        eq(projectStakeholders.stakeholderId, stakeholderId),
        eq(projectStakeholders.projectId, projectId),
      ),
    );
  return row !== undefined;
}

export async function isDeveloperMember(
  db: Db,
  developerId: string,
  projectId: string,
): Promise<boolean> {
  const [row] = await db
    .select()
    .from(projectDevelopers)
    .where(
      and(
        eq(projectDevelopers.developerId, developerId),
        eq(projectDevelopers.projectId, projectId),
      ),
    );
  return row !== undefined;
}

/**
 * Plan 01's authorization matrix, "View a specific project's requirements"
 * row: both stakeholder and developer members pass, everyone else fails.
 */
export async function isProjectMember(
  db: Db,
  session: Session,
  projectId: string,
): Promise<boolean> {
  return session.kind === "stakeholder"
    ? isStakeholderMember(db, session.stakeholderId, projectId)
    : isDeveloperMember(db, session.developerId, projectId);
}
