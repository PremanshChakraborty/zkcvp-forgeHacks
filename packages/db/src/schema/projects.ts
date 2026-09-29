import { INVITE_STATUSES } from "@zkcvp/contracts";
import { sql } from "drizzle-orm";
import {
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { developers, stakeholders } from "./identity";

export const inviteStatus = pgEnum("invite_status", INVITE_STATUSES);

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  /**
   * Display and audit only — NOT the access-control source of truth.
   * Authorization always reads a membership row. All project_stakeholders rows
   * carry equal permissions; there is no owner tier in this phase.
   */
  createdBy: uuid("created_by")
    .notNull()
    .references(() => stakeholders.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const projectStakeholders = pgTable(
  "project_stakeholders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    stakeholderId: uuid("stakeholder_id")
      .notNull()
      .references(() => stakeholders.id),
    addedBy: uuid("added_by")
      .notNull()
      .references(() => stakeholders.id),
    addedAt: timestamp("added_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [unique().on(t.projectId, t.stakeholderId)],
);

export const projectDevelopers = pgTable(
  "project_developers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    developerId: uuid("developer_id")
      .notNull()
      .references(() => developers.id),
    /* Only a stakeholder can add a developer — a single-typed FK, never a
     * polymorphic actor_type + actor_id. Plan 01 invariant 1. */
    addedBy: uuid("added_by")
      .notNull()
      .references(() => stakeholders.id),
    addedAt: timestamp("added_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [unique().on(t.projectId, t.developerId)],
);

export const projectDeveloperInvites = pgTable(
  "project_developer_invites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    /* Resolved at invite time via GitHub's public user-lookup API. Never the
     * raw username — see plan 01 invariant 2. */
    githubUserId: text("github_user_id").notNull(),
    githubUsername: text("github_username").notNull(),
    invitedBy: uuid("invited_by")
      .notNull()
      .references(() => stakeholders.id),
    status: inviteStatus("status").notNull().default("pending"),
    invitedAt: timestamp("invited_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    /**
     * PARTIAL unique index — pending only.
     *
     * Prevents duplicate pending invites to the same person for the same
     * project, while still allowing a re-invite after an earlier one was
     * accepted. A plain unique constraint would forbid that second invite
     * forever, which is why this is a `WHERE`-qualified index.
     */
    uniqueIndex("project_developer_invites_pending_unique")
      .on(t.projectId, t.githubUserId)
      .where(sql`${t.status} = 'pending'`),
  ],
);

/**
 * Schema only — NO endpoint and NO UI in this phase.
 *
 * It exists so multi-stakeholder support requires no migration later. Plan 01 is
 * explicit: do not build anything that writes to this table yet.
 */
export const projectStakeholderInvites = pgTable(
  "project_stakeholder_invites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    email: text("email").notNull(),
    invitedBy: uuid("invited_by")
      .notNull()
      .references(() => stakeholders.id),
    status: inviteStatus("status").notNull().default("pending"),
    invitedAt: timestamp("invited_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("project_stakeholder_invites_pending_unique")
      .on(t.projectId, t.email)
      .where(sql`${t.status} = 'pending'`),
  ],
);
