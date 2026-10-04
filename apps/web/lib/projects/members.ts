// apps/web/lib/projects/members.ts
import { and, eq } from "drizzle-orm";
import {
  developers,
  projectDeveloperInvites,
  projectDevelopers,
  type Db,
} from "@zkcvp/db";
import {
  GithubUnavailable,
  GithubUserNotFound,
  resolveGithubUser,
  type GithubUser,
} from "@zkcvp/github";
import { isProjectMember } from "../auth/authorization";
import type { Session } from "../auth/types";
import {
  conflict,
  forbidden,
  githubUnavailable,
  isUniqueViolation,
  notFound,
} from "../api/errors";
import { assertStakeholderMember } from "./service";

export type MemberRow = {
  developerId: string;
  githubUserId: string;
  githubUsername: string;
  displayName: string;
  avatarUrl: string | null;
  addedAt: Date;
};

export type InviteRow = {
  id: string;
  githubUserId: string;
  githubUsername: string;
  invitedAt: Date;
};

export type InviteDeps = { resolve?: (username: string) => Promise<GithubUser> };

export async function listMembers(
  db: Db,
  session: Session,
  projectId: string,
): Promise<{ members: MemberRow[]; pendingInvites: InviteRow[] }> {
  if (!(await isProjectMember(db, session, projectId))) throw forbidden();

  const members = await db
    .select({
      developerId: developers.id,
      githubUserId: developers.githubUserId,
      githubUsername: developers.githubUsername,
      displayName: developers.displayName,
      avatarUrl: developers.avatarUrl,
      addedAt: projectDevelopers.addedAt,
    })
    .from(projectDevelopers)
    .innerJoin(developers, eq(developers.id, projectDevelopers.developerId))
    .where(eq(projectDevelopers.projectId, projectId))
    .orderBy(projectDevelopers.addedAt);

  const pendingInvites = await db
    .select({
      id: projectDeveloperInvites.id,
      githubUserId: projectDeveloperInvites.githubUserId,
      githubUsername: projectDeveloperInvites.githubUsername,
      invitedAt: projectDeveloperInvites.invitedAt,
    })
    .from(projectDeveloperInvites)
    .where(
      and(
        eq(projectDeveloperInvites.projectId, projectId),
        eq(projectDeveloperInvites.status, "pending"),
      ),
    )
    .orderBy(projectDeveloperInvites.invitedAt);

  return { members, pendingInvites };
}

/**
 * Two branches, decided by whether the person already has an identity here.
 *
 * Neither branch checks-then-inserts. The partial unique index
 * (`project_developer_invites_pending_unique`) and the
 * `(project_id, developer_id)` unique constraint are the arbiters, so two
 * simultaneous invites cannot both succeed.
 */
export async function inviteDeveloper(
  db: Db,
  session: Session,
  projectId: string,
  input: { githubUsername: string },
  deps: InviteDeps = {},
): Promise<
  | { kind: "membership"; membership: MemberRow }
  | { kind: "invite"; invite: InviteRow }
> {
  const caller = await assertStakeholderMember(db, session, projectId);
  const resolve = deps.resolve ?? resolveGithubUser;

  let user: GithubUser;
  try {
    user = await resolve(input.githubUsername);
  } catch (e) {
    if (e instanceof GithubUserNotFound) {
      throw notFound(`No GitHub user named ${input.githubUsername}`);
    }
    if (e instanceof GithubUnavailable) throw githubUnavailable(e.message);
    throw e;
  }

  const [existing] = await db
    .select()
    .from(developers)
    .where(eq(developers.githubUserId, user.githubUserId));

  if (existing) {
    try {
      const [row] = await db
        .insert(projectDevelopers)
        .values({
          projectId,
          developerId: existing.id,
          addedBy: caller.stakeholderId,
        })
        .returning();

      return {
        kind: "membership",
        membership: {
          developerId: existing.id,
          githubUserId: existing.githubUserId,
          /* The freshly-resolved `user.githubUsername`, not the cached
           * `existing.githubUsername` — the cache is only refreshed at that
           * developer's next login, so a rename since then would otherwise be
           * echoed back under their old handle. The cached column itself is
           * left untouched here; that refresh is out of scope. */
          githubUsername: user.githubUsername,
          displayName: existing.displayName,
          avatarUrl: existing.avatarUrl,
          addedAt: row.addedAt,
        },
      };
    } catch (e) {
      if (isUniqueViolation(e)) {
        throw conflict("Already a member of this project");
      }
      throw e;
    }
  }

  try {
    const [invite] = await db
      .insert(projectDeveloperInvites)
      .values({
        projectId,
        githubUserId: user.githubUserId,
        githubUsername: user.githubUsername,
        invitedBy: caller.stakeholderId,
        status: "pending",
      })
      .returning();

    return {
      kind: "invite",
      invite: {
        id: invite.id,
        githubUserId: invite.githubUserId,
        githubUsername: invite.githubUsername,
        invitedAt: invite.invitedAt,
      },
    };
  } catch (e) {
    if (isUniqueViolation(e)) {
      throw conflict("There is already a pending invite for this person");
    }
    throw e;
  }
}
