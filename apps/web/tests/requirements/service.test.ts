// apps/web/tests/requirements/service.test.ts
import { describe, expect, it } from "vitest";
import { withTestSchema } from "@zkcvp/db/testing";
import { eq } from "drizzle-orm";
import { requirements, stakeholders } from "@zkcvp/db/schema";
import type { Db } from "@zkcvp/db";
import { createProject } from "../../lib/projects/service";
import {
  createRequirement,
  getRequirement,
  listRequirements,
} from "../../lib/requirements/service";
import { archiveRequirement } from "../../lib/requirements/mutate";

const HOUR = 60_000;

async function aProject(db: Db, email: string) {
  const [s] = await db
    .insert(stakeholders)
    .values({ email, displayName: email })
    .returning();
  const session = { kind: "stakeholder" as const, stakeholderId: s.id };
  const project = await createProject(db, session, { name: "P" });
  return { session, project };
}

describe("createRequirement", () => {
  it("creates version 1 at status new and points current_version_id at it", async () => {
    await withTestSchema(async (db) => {
      const { session, project } = await aProject(db, "a@example.com");

      const req = await createRequirement(db, session, project.id, {
        title: "Rate limiting",
        description: "All write endpoints are rate limited.",
      });

      expect(req.versionNumber).toBe(1);
      expect(req.status).toBe("new");
      expect(req.title).toBe("Rate limiting");

      const [row] = await db
        .select()
        .from(requirements)
        .where(eq(requirements.id, req.id));
      expect(row.currentVersionId).toBe(req.currentVersionId);
      expect(row.archivedAt).toBeNull();
    });
  }, HOUR);
});

describe("listRequirements", () => {
  it("excludes archived rows by default and includes them on request", async () => {
    await withTestSchema(async (db) => {
      const { session, project } = await aProject(db, "b@example.com");
      const kept = await createRequirement(db, session, project.id, {
        title: "Kept",
        description: "d",
      });
      const gone = await createRequirement(db, session, project.id, {
        title: "Gone",
        description: "d",
      });
      await archiveRequirement(db, session, gone.id);

      expect((await listRequirements(db, session, project.id)).map((r) => r.title)).toEqual([
        "Kept",
      ]);

      const all = await listRequirements(db, session, project.id, {
        includeArchived: true,
      });
      expect(all.map((r) => r.title).sort()).toEqual(["Gone", "Kept"]);
      expect(all.find((r) => r.id === gone.id)?.archivedAt).not.toBeNull();
      expect(all.find((r) => r.id === kept.id)?.archivedAt).toBeNull();
    });
  }, HOUR);
});

describe("getRequirement", () => {
  it("returns the full version history ordered by version number", async () => {
    await withTestSchema(async (db) => {
      const { session, project } = await aProject(db, "c@example.com");
      const req = await createRequirement(db, session, project.id, {
        title: "One",
        description: "d",
      });

      const { requirement, versionHistory } = await getRequirement(db, session, req.id);
      expect(requirement.title).toBe("One");
      expect(versionHistory.map((v) => v.versionNumber)).toEqual([1]);
    });
  }, HOUR);
});
