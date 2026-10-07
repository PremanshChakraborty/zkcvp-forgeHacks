// apps/web/tests/authorization-matrix.test.ts
import { describe, expect, it } from "vitest";
import { withTestSchema } from "@zkcvp/db/testing";
import {
  developers,
  projectDevelopers,
  stakeholders,
} from "@zkcvp/db/schema";
import type { Db } from "@zkcvp/db";
import type { Session } from "../lib/auth/types";
import { createProject, getProject } from "../lib/projects/service";
import { inviteDeveloper, listMembers } from "../lib/projects/members";
import { createRequirement, listRequirements } from "../lib/requirements/service";
import { archiveRequirement, editRequirement } from "../lib/requirements/mutate";
import { ServiceError } from "../lib/api/errors";

const HOUR = 60_000;

const octocat = {
  githubUserId: "583231",
  githubUsername: "octocat",
  displayName: "The Octocat",
  avatarUrl: null,
};

type Caller = "stakeholderMember" | "developerMember" | "nonMember";

/**
 * Plan 01's matrix, verbatim. `true` means allowed.
 *
 * "Non-member" here is an authenticated stakeholder with no membership row on
 * the project — not an unauthenticated visitor, which never reaches a service.
 */
const MATRIX: Record<string, Record<Caller, boolean>> = {
  viewProject:      { stakeholderMember: true,  developerMember: true,  nonMember: false },
  listRequirements: { stakeholderMember: true,  developerMember: true,  nonMember: false },
  listMembers:      { stakeholderMember: true,  developerMember: true,  nonMember: false },
  createRequirement:{ stakeholderMember: true,  developerMember: false, nonMember: false },
  editRequirement:  { stakeholderMember: true,  developerMember: false, nonMember: false },
  archiveRequirement:{stakeholderMember: true,  developerMember: false, nonMember: false },
  inviteDeveloper:  { stakeholderMember: true,  developerMember: false, nonMember: false },
};

async function world(db: Db) {
  const [owner] = await db
    .insert(stakeholders)
    .values({ email: "owner@example.com", displayName: "Owner" })
    .returning();
  const [outsider] = await db
    .insert(stakeholders)
    .values({ email: "outsider@example.com", displayName: "Outsider" })
    .returning();
  const [dev] = await db
    .insert(developers)
    .values({
      githubUserId: "999",
      githubUsername: "dev",
      displayName: "Dev",
    })
    .returning();

  const ownerSession: Session = { kind: "stakeholder", stakeholderId: owner.id };
  const project = await createProject(db, ownerSession, { name: "P" });
  await db
    .insert(projectDevelopers)
    .values({ projectId: project.id, developerId: dev.id, addedBy: owner.id });

  const requirement = await createRequirement(db, ownerSession, project.id, {
    title: "T",
    description: "D",
  });

  const sessions: Record<Caller, Session> = {
    stakeholderMember: ownerSession,
    developerMember: {
      kind: "developer",
      developerId: dev.id,
      githubAccessToken: "tok",
    },
    nonMember: { kind: "stakeholder", stakeholderId: outsider.id },
  };

  return { project, requirement, sessions };
}

describe("plan 01 authorization matrix", () => {
  for (const [action, expectations] of Object.entries(MATRIX)) {
    for (const [caller, allowed] of Object.entries(expectations) as [
      Caller,
      boolean,
    ][]) {
      it(`${action} — ${caller} is ${allowed ? "allowed" : "refused"}`, async () => {
        await withTestSchema(async (db) => {
          const { project, requirement, sessions } = await world(db);
          const session = sessions[caller];

          const actions: Record<string, () => Promise<unknown>> = {
            viewProject: () => getProject(db, session, project.id),
            listRequirements: () => listRequirements(db, session, project.id),
            listMembers: () => listMembers(db, session, project.id),
            createRequirement: () =>
              createRequirement(db, session, project.id, {
                title: "New",
                description: "D",
              }),
            editRequirement: () =>
              editRequirement(db, session, requirement.id, { title: "Edited" }),
            archiveRequirement: () =>
              archiveRequirement(db, session, requirement.id),
            inviteDeveloper: () =>
              inviteDeveloper(
                db,
                session,
                project.id,
                { githubUsername: "octocat" },
                { resolve: async () => octocat },
              ),
          };

          const outcome = await actions[action]().then(
            () => "allowed" as const,
            (e) => e,
          );

          if (allowed) {
            expect(outcome).toBe("allowed");
          } else {
            expect(outcome).toBeInstanceOf(ServiceError);
            expect((outcome as ServiceError).status).toBe(403);
          }
        });
      }, HOUR);
    }
  }
});
