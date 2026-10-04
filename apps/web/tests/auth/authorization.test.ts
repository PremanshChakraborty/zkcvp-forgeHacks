// apps/web/tests/auth/authorization.test.ts
import { describe, expect, it } from "vitest";
import { withTestSchema } from "@zkcvp/db/testing";
import {
  developers,
  projectDevelopers,
  projectStakeholders,
  projects,
  stakeholders,
} from "@zkcvp/db/schema";
import { isProjectMember, isStakeholderMember } from "../../lib/auth/authorization";

const HOUR = 60_000;

describe("authorization", () => {
  it("isStakeholderMember is true for a project_stakeholders row and false otherwise", async () => {
    await withTestSchema(async (db) => {
      const [s] = await db
        .insert(stakeholders)
        .values({ email: "s@example.com", displayName: "S" })
        .returning();
      const [other] = await db
        .insert(stakeholders)
        .values({ email: "other@example.com", displayName: "Other" })
        .returning();
      const [p] = await db
        .insert(projects)
        .values({ name: "P", createdBy: s.id })
        .returning();
      await db
        .insert(projectStakeholders)
        .values({ projectId: p.id, stakeholderId: s.id, addedBy: s.id });

      expect(await isStakeholderMember(db, s.id, p.id)).toBe(true);
      expect(await isStakeholderMember(db, other.id, p.id)).toBe(false);
    });
  }, HOUR);

  it("isProjectMember is true for a stakeholder session with a project_stakeholders row", async () => {
    await withTestSchema(async (db) => {
      const [s] = await db
        .insert(stakeholders)
        .values({ email: "s2@example.com", displayName: "S2" })
        .returning();
      const [p] = await db
        .insert(projects)
        .values({ name: "P", createdBy: s.id })
        .returning();
      await db
        .insert(projectStakeholders)
        .values({ projectId: p.id, stakeholderId: s.id, addedBy: s.id });

      const result = await isProjectMember(
        db,
        { kind: "stakeholder", stakeholderId: s.id },
        p.id,
      );
      expect(result).toBe(true);
    });
  }, HOUR);

  it("isProjectMember is true for a developer session with a project_developers row", async () => {
    await withTestSchema(async (db) => {
      const [s] = await db
        .insert(stakeholders)
        .values({ email: "s3@example.com", displayName: "S3" })
        .returning();
      const [d] = await db
        .insert(developers)
        .values({
          githubUserId: "d1",
          githubUsername: "dev1",
          displayName: "Dev1",
        })
        .returning();
      const [p] = await db
        .insert(projects)
        .values({ name: "P", createdBy: s.id })
        .returning();
      await db
        .insert(projectDevelopers)
        .values({ projectId: p.id, developerId: d.id, addedBy: s.id });

      const result = await isProjectMember(
        db,
        {
          kind: "developer",
          developerId: d.id,
          githubAccessToken: "tok",
        },
        p.id,
      );
      expect(result).toBe(true);
    });
  }, HOUR);

  it("isProjectMember is false for a non-member of either kind", async () => {
    await withTestSchema(async (db) => {
      const [s] = await db
        .insert(stakeholders)
        .values({ email: "s4@example.com", displayName: "S4" })
        .returning();
      const [outsider] = await db
        .insert(stakeholders)
        .values({ email: "outsider@example.com", displayName: "Outsider" })
        .returning();
      const [p] = await db
        .insert(projects)
        .values({ name: "P", createdBy: s.id })
        .returning();

      const result = await isProjectMember(
        db,
        { kind: "stakeholder", stakeholderId: outsider.id },
        p.id,
      );
      expect(result).toBe(false);
    });
  }, HOUR);
});
