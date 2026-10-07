// apps/web/tests/projects/service.test.ts
import { describe, expect, it } from "vitest";
import { withTestSchema } from "@zkcvp/db/testing";
import { eq } from "drizzle-orm";
import {
  developers,
  projectDevelopers,
  projectStakeholders,
  stakeholders,
} from "@zkcvp/db/schema";
import type { Db } from "@zkcvp/db";
import {
  assertStakeholderMember,
  createProject,
  getProject,
  listProjects,
} from "../../lib/projects/service";
import { ServiceError } from "../../lib/api/errors";

const HOUR = 60_000;

async function aStakeholder(db: Db, email: string) {
  const [s] = await db
    .insert(stakeholders)
    .values({ email, displayName: email })
    .returning();
  return s;
}

async function aDeveloper(db: Db, githubUserId: string) {
  const [d] = await db
    .insert(developers)
    .values({
      githubUserId,
      githubUsername: `u${githubUserId}`,
      displayName: `U${githubUserId}`,
    })
    .returning();
  return d;
}

describe("createProject", () => {
  it("creates the project and the caller's membership row together", async () => {
    await withTestSchema(async (db) => {
      const s = await aStakeholder(db, "a@example.com");

      const project = await createProject(
        db,
        { kind: "stakeholder", stakeholderId: s.id },
        { name: "Ledger rewrite" },
      );

      expect(project.name).toBe("Ledger rewrite");
      expect(project.createdBy).toBe(s.id);

      const memberships = await db
        .select()
        .from(projectStakeholders)
        .where(eq(projectStakeholders.projectId, project.id));

      expect(memberships).toHaveLength(1);
      expect(memberships[0].stakeholderId).toBe(s.id);
      /* created_by is display/audit only; the membership row is the
       * access-control source of truth. Both must exist. */
      expect(memberships[0].addedBy).toBe(s.id);
    });
  }, HOUR);
});

describe("listProjects", () => {
  it("returns only projects the caller belongs to, per caller kind", async () => {
    await withTestSchema(async (db) => {
      const mine = await aStakeholder(db, "mine@example.com");
      const theirs = await aStakeholder(db, "theirs@example.com");

      const a = await createProject(
        db,
        { kind: "stakeholder", stakeholderId: mine.id },
        { name: "Mine" },
      );
      await createProject(
        db,
        { kind: "stakeholder", stakeholderId: theirs.id },
        { name: "Theirs" },
      );

      const listed = await listProjects(db, {
        kind: "stakeholder",
        stakeholderId: mine.id,
      });
      expect(listed.map((p) => p.name)).toEqual(["Mine"]);
      expect(listed[0].id).toBe(a.id);
    });
  }, HOUR);

  it("returns a developer's projects through project_developers", async () => {
    await withTestSchema(async (db) => {
      const s = await aStakeholder(db, "s@example.com");
      const d = await aDeveloper(db, "424242");
      const p = await createProject(
        db,
        { kind: "stakeholder", stakeholderId: s.id },
        { name: "Shared" },
      );
      await db
        .insert(projectDevelopers)
        .values({ projectId: p.id, developerId: d.id, addedBy: s.id });

      const listed = await listProjects(db, {
        kind: "developer",
        developerId: d.id,
        githubAccessToken: "tok",
      });
      expect(listed.map((p) => p.name)).toEqual(["Shared"]);
    });
  }, HOUR);
});

describe("getProject", () => {
  it("throws 403 for a non-member", async () => {
    await withTestSchema(async (db) => {
      const owner = await aStakeholder(db, "owner@example.com");
      const outsider = await aStakeholder(db, "outsider@example.com");
      const p = await createProject(
        db,
        { kind: "stakeholder", stakeholderId: owner.id },
        { name: "Private" },
      );

      const err = await getProject(
        db,
        { kind: "stakeholder", stakeholderId: outsider.id },
        p.id,
      ).catch((e) => e);

      expect(err).toBeInstanceOf(ServiceError);
      expect((err as ServiceError).status).toBe(403);
    });
  }, HOUR);
});

describe("assertStakeholderMember", () => {
  it("returns the session for a member, and throws 403 for a non-member or a developer", async () => {
    await withTestSchema(async (db) => {
      const member = await aStakeholder(db, "member@example.com");
      const outsider = await aStakeholder(db, "outsider2@example.com");
      const dev = await aDeveloper(db, "1010101");
      const p = await createProject(
        db,
        { kind: "stakeholder", stakeholderId: member.id },
        { name: "Restricted" },
      );
      await db
        .insert(projectDevelopers)
        .values({ projectId: p.id, developerId: dev.id, addedBy: member.id });

      const memberSession = { kind: "stakeholder" as const, stakeholderId: member.id };
      const result = await assertStakeholderMember(db, memberSession, p.id);
      expect(result).toBe(memberSession);

      const outsiderErr = await assertStakeholderMember(
        db,
        { kind: "stakeholder", stakeholderId: outsider.id },
        p.id,
      ).catch((e) => e);
      expect(outsiderErr).toBeInstanceOf(ServiceError);
      expect((outsiderErr as ServiceError).status).toBe(403);

      const devErr = await assertStakeholderMember(
        db,
        { kind: "developer", developerId: dev.id, githubAccessToken: "tok" },
        p.id,
      ).catch((e) => e);
      expect(devErr).toBeInstanceOf(ServiceError);
      expect((devErr as ServiceError).status).toBe(403);
    });
  }, HOUR);
});
