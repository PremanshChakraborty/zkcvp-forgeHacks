// packages/db/tests/schema.test.ts
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { withTestSchema } from "./harness";
import {
  developers,
  projectDeveloperInvites,
  projects,
  requirements,
  requirementVersions,
  stakeholders,
} from "../src/schema/index";

const HOUR = 60_000;

describe("schema constraints are enforced by Postgres", () => {
  it("rejects a duplicate developer github_user_id", async () => {
    await withTestSchema(async (db) => {
      await db.insert(developers).values({
        githubUserId: "12345",
        githubUsername: "octocat",
        displayName: "Octocat",
      });
      await expect(
        db.insert(developers).values({
          githubUserId: "12345",
          githubUsername: "renamed",
          displayName: "Renamed",
        }),
      ).rejects.toThrow();
    });
  }, HOUR);

  it("allows a second PENDING invite once the first is accepted", async () => {
    // The partial index is WHERE status = 'pending' precisely so this works.
    // A plain unique constraint would forbid a re-invite forever.
    await withTestSchema(async (db) => {
      const [s] = await db
        .insert(stakeholders)
        .values({ email: "s@example.com", displayName: "S" })
        .returning();
      const [p] = await db
        .insert(projects)
        .values({ name: "P", createdBy: s.id })
        .returning();

      const invite = {
        projectId: p.id,
        githubUserId: "999",
        githubUsername: "dev",
        invitedBy: s.id,
      };

      const [first] = await db
        .insert(projectDeveloperInvites)
        .values(invite)
        .returning();

      await expect(
        db.insert(projectDeveloperInvites).values(invite),
      ).rejects.toThrow();

      await db
        .update(projectDeveloperInvites)
        .set({ status: "accepted" })
        .where(eq(projectDeveloperInvites.id, first.id));

      await expect(
        db.insert(projectDeveloperInvites).values(invite),
      ).resolves.toBeDefined();
    });
  }, HOUR);

  it("permits the requirement create transaction: null pointer, then set", async () => {
    await withTestSchema(async (db) => {
      const [s] = await db
        .insert(stakeholders)
        .values({ email: "s@example.com", displayName: "S" })
        .returning();
      const [p] = await db
        .insert(projects)
        .values({ name: "P", createdBy: s.id })
        .returning();

      await db.transaction(async (tx) => {
        const [r] = await tx
          .insert(requirements)
          .values({ projectId: p.id, createdBy: s.id })
          .returning();
        expect(r.currentVersionId).toBeNull();

        const [v] = await tx
          .insert(requirementVersions)
          .values({
            requirementId: r.id,
            versionNumber: 1,
            title: "T",
            description: "D",
            createdBy: s.id,
          })
          .returning();

        const [updated] = await tx
          .update(requirements)
          .set({ currentVersionId: v.id })
          .where(eq(requirements.id, r.id))
          .returning();
        expect(updated.currentVersionId).toBe(v.id);
      });
    });
  }, HOUR);
});
