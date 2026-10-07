// apps/web/tests/auth/identity.test.ts
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { withTestSchema } from "@zkcvp/db/testing";
import {
  developers,
  projectDeveloperInvites,
  projectDevelopers,
  projects,
  stakeholders,
} from "@zkcvp/db/schema";
import { upsertDeveloperAndAcceptInvites } from "../../lib/auth/identity";

const HOUR = 60_000;

describe("upsertDeveloperAndAcceptInvites", () => {
  it("creates a new developer on first login", async () => {
    await withTestSchema(async (db) => {
      const { developerId } = await upsertDeveloperAndAcceptInvites(db, {
        githubUserId: "111",
        githubUsername: "octocat",
        displayName: "Octocat",
        avatarUrl: "https://example.com/a.png",
      });

      const [row] = await db
        .select()
        .from(developers)
        .where(eq(developers.id, developerId));
      expect(row.githubUserId).toBe("111");
      expect(row.githubUsername).toBe("octocat");
    });
  }, HOUR);

  it("refreshes cached username/avatar on repeat login without changing displayName", async () => {
    await withTestSchema(async (db) => {
      const first = await upsertDeveloperAndAcceptInvites(db, {
        githubUserId: "222",
        githubUsername: "old-name",
        displayName: "Original Display",
        avatarUrl: "https://example.com/old.png",
      });

      const second = await upsertDeveloperAndAcceptInvites(db, {
        githubUserId: "222",
        githubUsername: "new-name",
        displayName: "Ignored On Refresh",
        avatarUrl: "https://example.com/new.png",
      });

      expect(second.developerId).toBe(first.developerId);

      const [row] = await db
        .select()
        .from(developers)
        .where(eq(developers.id, first.developerId));
      expect(row.githubUsername).toBe("new-name");
      expect(row.avatarUrl).toBe("https://example.com/new.png");
      expect(row.displayName).toBe("Original Display");
    });
  }, HOUR);

  it("accepts every pending invite matching the github_user_id and marks it accepted", async () => {
    await withTestSchema(async (db) => {
      const [s] = await db
        .insert(stakeholders)
        .values({ email: "s@example.com", displayName: "S" })
        .returning();
      const [p1] = await db
        .insert(projects)
        .values({ name: "P1", createdBy: s.id })
        .returning();
      const [p2] = await db
        .insert(projects)
        .values({ name: "P2", createdBy: s.id })
        .returning();

      await db.insert(projectDeveloperInvites).values([
        {
          projectId: p1.id,
          githubUserId: "333",
          githubUsername: "dev",
          invitedBy: s.id,
        },
        {
          projectId: p2.id,
          githubUserId: "333",
          githubUsername: "dev",
          invitedBy: s.id,
        },
      ]);

      const { developerId } = await upsertDeveloperAndAcceptInvites(db, {
        githubUserId: "333",
        githubUsername: "dev",
        displayName: "Dev",
      });

      const memberships = await db
        .select()
        .from(projectDevelopers)
        .where(eq(projectDevelopers.developerId, developerId));
      expect(memberships).toHaveLength(2);
      expect(memberships.map((m) => m.addedBy)).toEqual([s.id, s.id]);

      const invites = await db
        .select()
        .from(projectDeveloperInvites)
        .where(eq(projectDeveloperInvites.githubUserId, "333"));
      expect(invites.every((i) => i.status === "accepted")).toBe(true);
    });
  }, HOUR);

  it("does not touch invites belonging to a different github_user_id", async () => {
    await withTestSchema(async (db) => {
      const [s] = await db
        .insert(stakeholders)
        .values({ email: "s2@example.com", displayName: "S2" })
        .returning();
      const [p] = await db
        .insert(projects)
        .values({ name: "P", createdBy: s.id })
        .returning();

      await db.insert(projectDeveloperInvites).values({
        projectId: p.id,
        githubUserId: "999",
        githubUsername: "someone-else",
        invitedBy: s.id,
      });

      await upsertDeveloperAndAcceptInvites(db, {
        githubUserId: "444",
        githubUsername: "unrelated",
        displayName: "Unrelated",
      });

      const [invite] = await db
        .select()
        .from(projectDeveloperInvites)
        .where(eq(projectDeveloperInvites.githubUserId, "999"));
      expect(invite.status).toBe("pending");
    });
  }, HOUR);
});
