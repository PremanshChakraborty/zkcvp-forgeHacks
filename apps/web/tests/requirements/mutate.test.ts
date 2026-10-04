// apps/web/tests/requirements/mutate.test.ts
import { describe, expect, it } from "vitest";
import { withTestSchema } from "@zkcvp/db/testing";
import { eq } from "drizzle-orm";
import { requirementVersions, requirements, stakeholders } from "@zkcvp/db/schema";
import type { Db } from "@zkcvp/db";
import type { RequirementStatus } from "@zkcvp/contracts";
import { createProject } from "../../lib/projects/service";
import { createRequirement, getRequirement } from "../../lib/requirements/service";
import { archiveRequirement, editRequirement } from "../../lib/requirements/mutate";
import { ServiceError } from "../../lib/api/errors";

const HOUR = 60_000;

async function aRequirement(db: Db, email: string) {
  const [s] = await db
    .insert(stakeholders)
    .values({ email, displayName: email })
    .returning();
  const session = { kind: "stakeholder" as const, stakeholderId: s.id };
  const project = await createProject(db, session, { name: "P" });
  const req = await createRequirement(db, session, project.id, {
    title: "Original title",
    description: "Original description",
  });
  return { session, project, req };
}

/** Drives a version to a terminal status the way the future Evaluator will. */
async function setStatus(db: Db, versionId: string, status: RequirementStatus) {
  await db
    .update(requirementVersions)
    .set({ status })
    .where(eq(requirementVersions.id, versionId));
}

describe("editRequirement", () => {
  /* Plan 01 invariant 4. This is what makes "editing a verified requirement
   * reopens it" fall out with no special-case logic. */
  it("always creates the new version at status new, even from verified", async () => {
    await withTestSchema(async (db) => {
      const { session, req } = await aRequirement(db, "a@example.com");
      await setStatus(db, req.currentVersionId, "verified");

      const edited = await editRequirement(db, session, req.id, {
        title: "Reworded title",
      });

      expect(edited.versionNumber).toBe(2);
      expect(edited.status).toBe("new");
      /* An unspecified field carries over from the previous version. */
      expect(edited.description).toBe("Original description");
    });
  }, HOUR);

  it("does the same from eval_failed", async () => {
    await withTestSchema(async (db) => {
      const { session, req } = await aRequirement(db, "b@example.com");
      await setStatus(db, req.currentVersionId, "eval_failed");
      expect((await editRequirement(db, session, req.id, { title: "x" })).status).toBe("new");
    });
  }, HOUR);

  it("leaves the previous version untouched — versions are immutable", async () => {
    await withTestSchema(async (db) => {
      const { session, req } = await aRequirement(db, "c@example.com");
      await editRequirement(db, session, req.id, { title: "Second" });

      const { versionHistory } = await getRequirement(db, session, req.id);
      expect(versionHistory.map((v) => [v.versionNumber, v.title])).toEqual([
        [1, "Original title"],
        [2, "Second"],
      ]);
    });
  }, HOUR);

  it("returns 404 for an archived requirement", async () => {
    await withTestSchema(async (db) => {
      const { session, req } = await aRequirement(db, "d@example.com");
      await archiveRequirement(db, session, req.id);

      const err = await editRequirement(db, session, req.id, { title: "x" }).catch((e) => e);
      expect(err).toBeInstanceOf(ServiceError);
      expect((err as ServiceError).status).toBe(404);
    });
  }, HOUR);
});

describe("archiveRequirement", () => {
  it("archives from any status and never touches the versions", async () => {
    await withTestSchema(async (db) => {
      for (const status of ["new", "verified", "eval_failed"] as const) {
        const { session, req } = await aRequirement(db, `${status}@example.com`);
        await setStatus(db, req.currentVersionId, status);

        await archiveRequirement(db, session, req.id);

        const [row] = await db
          .select()
          .from(requirements)
          .where(eq(requirements.id, req.id));
        expect(row.archivedAt).not.toBeNull();

        /* Orthogonal axes — plan 01 invariant 5. Archiving says nothing about
         * whether the requirement was ever verified. */
        const [version] = await db
          .select()
          .from(requirementVersions)
          .where(eq(requirementVersions.id, req.currentVersionId));
        expect(version.status).toBe(status);
      }
    });
  }, HOUR);
});
