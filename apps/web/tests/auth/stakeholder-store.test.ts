// apps/web/tests/auth/stakeholder-store.test.ts
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { withTestSchema } from "@zkcvp/db/testing";
import {
  projectStakeholderInvites,
  projectStakeholders,
  projects,
  verificationTokens,
} from "@zkcvp/db/schema";
import {
  acceptPendingStakeholderInvites,
  createStakeholder,
  createVerificationToken,
  getStakeholderByEmail,
  getStakeholderById,
  useVerificationToken,
} from "../../lib/auth/stakeholder-store";

const HOUR = 60_000;

describe("stakeholder store", () => {
  it("creates a stakeholder and finds it by email", async () => {
    await withTestSchema(async (db) => {
      const created = await createStakeholder(db, {
        email: "s@example.com",
        displayName: "s",
      });
      expect(created.email).toBe("s@example.com");

      const found = await getStakeholderByEmail(db, "s@example.com");
      expect(found?.id).toBe(created.id);

      const missing = await getStakeholderByEmail(db, "nobody@example.com");
      expect(missing).toBeUndefined();
    });
  }, HOUR);

  it("finds a stakeholder by id", async () => {
    await withTestSchema(async (db) => {
      const created = await createStakeholder(db, {
        email: "byid@example.com",
        displayName: "byid",
      });
      const found = await getStakeholderById(db, created.id);
      expect(found?.email).toBe("byid@example.com");
    });
  }, HOUR);

  it("round-trips a verification token and consumes it exactly once", async () => {
    await withTestSchema(async (db) => {
      const expires = new Date(Date.now() + 3600_000);
      await createVerificationToken(db, {
        identifier: "vt@example.com",
        token: "hashed-token",
        expires,
      });

      const rows = await db
        .select()
        .from(verificationTokens)
        .where(eq(verificationTokens.identifier, "vt@example.com"));
      expect(rows).toHaveLength(1);

      const used = await useVerificationToken(db, {
        identifier: "vt@example.com",
        token: "hashed-token",
      });
      expect(used?.identifier).toBe("vt@example.com");

      // Consumed: a second use of the same token must fail.
      const usedAgain = await useVerificationToken(db, {
        identifier: "vt@example.com",
        token: "hashed-token",
      });
      expect(usedAgain).toBeNull();
    });
  }, HOUR);

  it("returns null from useVerificationToken for an unknown token", async () => {
    await withTestSchema(async (db) => {
      const result = await useVerificationToken(db, {
        identifier: "nope@example.com",
        token: "does-not-exist",
      });
      expect(result).toBeNull();
    });
  }, HOUR);

  it("accepts every pending stakeholder invite matching the email and marks it accepted", async () => {
    await withTestSchema(async (db) => {
      const inviter = await createStakeholder(db, {
        email: "inviter@example.com",
        displayName: "inviter",
      });
      const invitee = await createStakeholder(db, {
        email: "invitee@example.com",
        displayName: "invitee",
      });

      const [p1] = await db
        .insert(projects)
        .values({ name: "P1", createdBy: inviter.id })
        .returning();
      const [p2] = await db
        .insert(projects)
        .values({ name: "P2", createdBy: inviter.id })
        .returning();

      await db.insert(projectStakeholderInvites).values([
        { projectId: p1.id, email: invitee.email, invitedBy: inviter.id },
        { projectId: p2.id, email: invitee.email, invitedBy: inviter.id },
      ]);

      await acceptPendingStakeholderInvites(db, {
        stakeholderId: invitee.id,
        email: invitee.email,
      });

      const memberships = await db
        .select()
        .from(projectStakeholders)
        .where(eq(projectStakeholders.stakeholderId, invitee.id));
      expect(memberships).toHaveLength(2);
      expect(memberships.map((m) => m.addedBy)).toEqual([inviter.id, inviter.id]);

      const invites = await db
        .select()
        .from(projectStakeholderInvites)
        .where(eq(projectStakeholderInvites.email, invitee.email));
      expect(invites.every((i) => i.status === "accepted")).toBe(true);
    });
  }, HOUR);

  it("is a harmless no-op when there are no pending invites", async () => {
    await withTestSchema(async (db) => {
      const s = await createStakeholder(db, {
        email: "noinvites@example.com",
        displayName: "noinvites",
      });
      await expect(
        acceptPendingStakeholderInvites(db, {
          stakeholderId: s.id,
          email: s.email,
        }),
      ).resolves.toBeUndefined();
    });
  }, HOUR);
});
