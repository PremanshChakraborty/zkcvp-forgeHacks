// apps/web/tests/projects/members.test.ts
import { describe, expect, it } from "vitest";
import { withTestSchema } from "@zkcvp/db/testing";
import { eq } from "drizzle-orm";
import {
  developers,
  projectDeveloperInvites,
  projectDevelopers,
  stakeholders,
} from "@zkcvp/db/schema";
import type { Db } from "@zkcvp/db";
import { GithubUserNotFound, type GithubUser } from "@zkcvp/github";
import { createProject } from "../../lib/projects/service";
import { inviteDeveloper, listMembers } from "../../lib/projects/members";
import { ServiceError } from "../../lib/api/errors";

const HOUR = 60_000;

const octocat: GithubUser = {
  githubUserId: "583231",
  githubUsername: "octocat",
  displayName: "The Octocat",
  avatarUrl: null,
};

const resolvesTo = (user: GithubUser) => ({ resolve: async () => user });
const resolvesMissing = {
  resolve: async () => {
    throw new GithubUserNotFound("ghost");
  },
};

async function aProject(db: Db, email: string) {
  const [s] = await db
    .insert(stakeholders)
    .values({ email, displayName: email })
    .returning();
  const project = await createProject(
    db,
    { kind: "stakeholder", stakeholderId: s.id },
    { name: "P" },
  );
  return { s, project, session: { kind: "stakeholder" as const, stakeholderId: s.id } };
}

describe("inviteDeveloper", () => {
  it("creates a pending invite when no developer row exists yet", async () => {
    await withTestSchema(async (db) => {
      const { project, session } = await aProject(db, "a@example.com");

      const result = await inviteDeveloper(
        db,
        session,
        project.id,
        { githubUsername: "octocat" },
        resolvesTo(octocat),
      );

      expect(result.kind).toBe("invite");
      const invites = await db
        .select()
        .from(projectDeveloperInvites)
        .where(eq(projectDeveloperInvites.projectId, project.id));
      expect(invites).toHaveLength(1);
      /* The NUMERIC id is what gets stored — the username is cache only. */
      expect(invites[0].githubUserId).toBe("583231");
      expect(invites[0].status).toBe("pending");
    });
  }, HOUR);

  it("adds a membership directly, skipping the invite, when the developer already exists", async () => {
    await withTestSchema(async (db) => {
      const { project, session, s } = await aProject(db, "b@example.com");
      await db.insert(developers).values({
        githubUserId: "583231",
        githubUsername: "octocat",
        displayName: "The Octocat",
      });

      const result = await inviteDeveloper(
        db,
        session,
        project.id,
        { githubUsername: "octocat" },
        resolvesTo(octocat),
      );

      expect(result.kind).toBe("membership");
      expect(
        await db
          .select()
          .from(projectDeveloperInvites)
          .where(eq(projectDeveloperInvites.projectId, project.id)),
      ).toHaveLength(0);

      const [membership] = await db
        .select()
        .from(projectDevelopers)
        .where(eq(projectDevelopers.projectId, project.id));
      expect(membership.addedBy).toBe(s.id);
    });
  }, HOUR);

  it("returns 409 on a duplicate pending invite, via the partial unique index", async () => {
    await withTestSchema(async (db) => {
      const { project, session } = await aProject(db, "c@example.com");
      await inviteDeveloper(db, session, project.id, { githubUsername: "octocat" }, resolvesTo(octocat));

      const err = await inviteDeveloper(
        db,
        session,
        project.id,
        { githubUsername: "octocat" },
        resolvesTo(octocat),
      ).catch((e) => e);

      expect(err).toBeInstanceOf(ServiceError);
      expect((err as ServiceError).status).toBe(409);
    });
  }, HOUR);

  it("allows a fresh invite once the earlier one is accepted — the index covers pending only", async () => {
    await withTestSchema(async (db) => {
      const { project, session } = await aProject(db, "d@example.com");
      await inviteDeveloper(db, session, project.id, { githubUsername: "octocat" }, resolvesTo(octocat));
      await db
        .update(projectDeveloperInvites)
        .set({ status: "accepted" })
        .where(eq(projectDeveloperInvites.projectId, project.id));

      await expect(
        inviteDeveloper(db, session, project.id, { githubUsername: "octocat" }, resolvesTo(octocat)),
      ).resolves.toMatchObject({ kind: "invite" });
    });
  }, HOUR);

  it("returns 409 when the developer is already a member", async () => {
    await withTestSchema(async (db) => {
      const { project, session, s } = await aProject(db, "e@example.com");
      const [d] = await db
        .insert(developers)
        .values({
          githubUserId: "583231",
          githubUsername: "octocat",
          displayName: "The Octocat",
        })
        .returning();
      await db
        .insert(projectDevelopers)
        .values({ projectId: project.id, developerId: d.id, addedBy: s.id });

      const err = await inviteDeveloper(
        db,
        session,
        project.id,
        { githubUsername: "octocat" },
        resolvesTo(octocat),
      ).catch((e) => e);
      expect((err as ServiceError).status).toBe(409);
    });
  }, HOUR);

  it("returns 404 when GitHub has no such user", async () => {
    await withTestSchema(async (db) => {
      const { project, session } = await aProject(db, "f@example.com");
      const err = await inviteDeveloper(
        db,
        session,
        project.id,
        { githubUsername: "ghost" },
        resolvesMissing,
      ).catch((e) => e);
      expect((err as ServiceError).status).toBe(404);
    });
  }, HOUR);
});

describe("listMembers", () => {
  it("returns members and pending invites for a member caller", async () => {
    await withTestSchema(async (db) => {
      const { project, session } = await aProject(db, "g@example.com");
      await inviteDeveloper(db, session, project.id, { githubUsername: "octocat" }, resolvesTo(octocat));

      const { members, pendingInvites } = await listMembers(db, session, project.id);
      expect(members).toHaveLength(0);
      expect(pendingInvites.map((i) => i.githubUsername)).toEqual(["octocat"]);
    });
  }, HOUR);
});
