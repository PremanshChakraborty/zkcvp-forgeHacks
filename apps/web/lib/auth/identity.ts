// apps/web/lib/auth/identity.ts
import { and, eq } from "drizzle-orm";
import {
  developers,
  projectDeveloperInvites,
  projectDevelopers,
  type Db,
} from "@zkcvp/db";

/**
 * Runs on every successful developer GitHub sign-in (plan 01, Identity &
 * authentication behavior): upsert the developers row by github_user_id
 * (refreshing only the cached username/avatar, never displayName), then in
 * the same transaction accept every pending invite matching that
 * github_user_id.
 */
export async function upsertDeveloperAndAcceptInvites(
  db: Db,
  args: {
    githubUserId: string;
    githubUsername: string;
    displayName: string;
    avatarUrl?: string;
  },
): Promise<{ developerId: string }> {
  return db.transaction(async (tx) => {
    const [dev] = await tx
      .insert(developers)
      .values({
        githubUserId: args.githubUserId,
        githubUsername: args.githubUsername,
        displayName: args.displayName,
        avatarUrl: args.avatarUrl,
      })
      .onConflictDoUpdate({
        target: developers.githubUserId,
        set: {
          githubUsername: args.githubUsername,
          avatarUrl: args.avatarUrl,
        },
      })
      .returning();

    const pendingInvites = await tx
      .select()
      .from(projectDeveloperInvites)
      .where(
        and(
          eq(projectDeveloperInvites.githubUserId, args.githubUserId),
          eq(projectDeveloperInvites.status, "pending"),
        ),
      );

    for (const invite of pendingInvites) {
      await tx
        .insert(projectDevelopers)
        .values({
          projectId: invite.projectId,
          developerId: dev.id,
          addedBy: invite.invitedBy,
        })
        .onConflictDoNothing();

      await tx
        .update(projectDeveloperInvites)
        .set({ status: "accepted" })
        .where(eq(projectDeveloperInvites.id, invite.id));
    }

    return { developerId: dev.id };
  });
}
