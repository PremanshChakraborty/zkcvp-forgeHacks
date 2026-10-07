// apps/web/lib/auth/stakeholder-store.ts
import { and, eq } from "drizzle-orm";
import {
  projectStakeholderInvites,
  projectStakeholders,
  stakeholders,
  verificationTokens,
  type Db,
} from "@zkcvp/db";

export type StakeholderRow = typeof stakeholders.$inferSelect;

export async function getStakeholderByEmail(
  db: Db,
  email: string,
): Promise<StakeholderRow | undefined> {
  const [row] = await db
    .select()
    .from(stakeholders)
    .where(eq(stakeholders.email, email));
  return row;
}

export async function getStakeholderById(
  db: Db,
  id: string,
): Promise<StakeholderRow | undefined> {
  const [row] = await db
    .select()
    .from(stakeholders)
    .where(eq(stakeholders.id, id));
  return row;
}

export async function createStakeholder(
  db: Db,
  args: { email: string; displayName: string },
): Promise<StakeholderRow> {
  const [row] = await db
    .insert(stakeholders)
    .values({ email: args.email, displayName: args.displayName })
    .returning();
  return row;
}

export async function createVerificationToken(
  db: Db,
  args: { identifier: string; token: string; expires: Date },
): Promise<void> {
  await db.insert(verificationTokens).values(args);
}

/** Deletes the token so it can only be used once. Returns null if not found. */
export async function useVerificationToken(
  db: Db,
  args: { identifier: string; token: string },
): Promise<{ identifier: string; token: string; expires: Date } | null> {
  const [row] = await db
    .delete(verificationTokens)
    .where(
      and(
        eq(verificationTokens.identifier, args.identifier),
        eq(verificationTokens.token, args.token),
      ),
    )
    .returning();
  return row ?? null;
}

/**
 * Runs on every successful stakeholder sign-in (plan 01, Identity &
 * authentication behavior, point 2) — forward-compatible with the future
 * stakeholder-invite feature; a harmless no-op today since nothing writes a
 * pending project_stakeholder_invites row yet.
 */
export async function acceptPendingStakeholderInvites(
  db: Db,
  args: { stakeholderId: string; email: string },
): Promise<void> {
  await db.transaction(async (tx) => {
    const pendingInvites = await tx
      .select()
      .from(projectStakeholderInvites)
      .where(
        and(
          eq(projectStakeholderInvites.email, args.email),
          eq(projectStakeholderInvites.status, "pending"),
        ),
      );

    for (const invite of pendingInvites) {
      await tx
        .insert(projectStakeholders)
        .values({
          projectId: invite.projectId,
          stakeholderId: args.stakeholderId,
          addedBy: invite.invitedBy,
        })
        .onConflictDoNothing();

      await tx
        .update(projectStakeholderInvites)
        .set({ status: "accepted" })
        .where(eq(projectStakeholderInvites.id, invite.id));
    }
  });
}
