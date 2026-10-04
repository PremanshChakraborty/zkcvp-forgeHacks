// apps/web/lib/projects/service.ts
import { eq } from "drizzle-orm";
import {
  projectDevelopers,
  projectStakeholders,
  projects,
  type Db,
} from "@zkcvp/db";
import { isProjectMember, isStakeholderMember } from "../auth/authorization";
import type { Session, StakeholderSession } from "../auth/types";
import { forbidden, notFound } from "../api/errors";

export type ProjectSummary = {
  id: string;
  name: string;
  createdBy: string;
  createdAt: Date;
};

/**
 * One transaction: the project row and the creator's membership row. A project
 * whose creator is not a member of it would be invisible to its own creator,
 * because `projects.created_by` is display/audit only and authorization always
 * reads a membership row.
 */
export async function createProject(
  db: Db,
  session: StakeholderSession,
  input: { name: string },
): Promise<ProjectSummary> {
  return db.transaction(async (tx) => {
    const [project] = await tx
      .insert(projects)
      .values({ name: input.name, createdBy: session.stakeholderId })
      .returning();

    await tx.insert(projectStakeholders).values({
      projectId: project.id,
      stakeholderId: session.stakeholderId,
      addedBy: session.stakeholderId,
    });

    return project;
  });
}

export async function listProjects(
  db: Db,
  session: Session,
): Promise<ProjectSummary[]> {
  if (session.kind === "stakeholder") {
    const rows = await db
      .select({
        id: projects.id,
        name: projects.name,
        createdBy: projects.createdBy,
        createdAt: projects.createdAt,
      })
      .from(projects)
      .innerJoin(
        projectStakeholders,
        eq(projectStakeholders.projectId, projects.id),
      )
      .where(eq(projectStakeholders.stakeholderId, session.stakeholderId))
      .orderBy(projects.createdAt);
    return rows;
  }

  return db
    .select({
      id: projects.id,
      name: projects.name,
      createdBy: projects.createdBy,
      createdAt: projects.createdAt,
    })
    .from(projects)
    .innerJoin(projectDevelopers, eq(projectDevelopers.projectId, projects.id))
    .where(eq(projectDevelopers.developerId, session.developerId))
    .orderBy(projects.createdAt);
}

export async function getProject(
  db: Db,
  session: Session,
  projectId: string,
): Promise<ProjectSummary> {
  if (!(await isProjectMember(db, session, projectId))) throw forbidden();

  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId));

  if (!project) throw notFound("No such project");
  return project;
}

/** Shared by every stakeholder-only action on a project. */
export async function assertStakeholderMember(
  db: Db,
  session: Session,
  projectId: string,
): Promise<StakeholderSession> {
  if (session.kind !== "stakeholder") {
    throw forbidden("Only a stakeholder may perform this action");
  }
  if (!(await isStakeholderMember(db, session.stakeholderId, projectId))) {
    throw forbidden();
  }
  return session;
}
