import { REQUIREMENT_STATUSES } from "@zkcvp/contracts";
import {
  type AnyPgColumn,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { projects } from "./projects";
import { stakeholders } from "./identity";

/**
 * `eval_failed` means the Evaluator returned NOT SATISFIED. It is a legitimate
 * result, not a malfunction. The enum name is misleading and must never reach a
 * screen — the design system maps it to "Not satisfied" and that mapping lives
 * in exactly one place.
 *
 * There is deliberately NO pending or in-flight state. Evaluation runs
 * synchronously inside the request that submits a claim, and status goes
 * directly to a terminal outcome.
 */
export const requirementStatus = pgEnum(
  "requirement_status",
  REQUIREMENT_STATUSES,
);

/**
 * A requirement is a stable, long-lived identity — "this is one piece of scope".
 * It never itself holds text or status.
 */
export const requirements = pgTable("requirements", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id),

  /**
   * NULLABLE, and null only transiently inside the create transaction:
   * insert requirement (null) → insert version → update this pointer. Never
   * null once that transaction commits.
   *
   * The `AnyPgColumn` return annotation is required: this and
   * requirement_versions.requirement_id form a circular reference, and without
   * it TypeScript cannot infer the type of either table.
   */
  currentVersionId: uuid("current_version_id").references(
    (): AnyPgColumn => requirementVersions.id,
  ),

  createdBy: uuid("created_by")
    .notNull()
    .references(() => stakeholders.id),

  /**
   * Soft-delete flag, ORTHOGONAL to version status. Archiving says nothing
   * about whether a requirement was ever verified, and status says nothing
   * about whether it is archived. Never let one imply or overwrite the other —
   * plan 01 invariant 5. There is no un-archive in this phase.
   */
  archivedAt: timestamp("archived_at", { withTimezone: true }),

  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * An IMMUTABLE snapshot of a requirement's text, plus the verification status
 * for that specific text.
 *
 * Editing never mutates a version — it creates a new one. Title and description
 * are immutable once written; `status` is the only field ever updated after
 * creation, and only by the future verification-result trigger.
 *
 * NOTE what is absent: there is no status column on `requirements`. A
 * requirement's effective status is its current version's status, resolved
 * through current_version_id AT READ TIME via a join. Storing it in two places
 * guarantees they desync.
 */
export const requirementVersions = pgTable(
  "requirement_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requirementId: uuid("requirement_id")
      .notNull()
      .references((): AnyPgColumn => requirements.id),
    /** Starts at 1, increments per requirement. */
    versionNumber: integer("version_number").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    /**
     * A new version ALWAYS starts at 'new', unconditionally — plan 01
     * invariant 4. This is what makes "editing a verified requirement reopens
     * it" fall out for free, so it must never become conditional.
     */
    status: requirementStatus("status").notNull().default("new"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => stakeholders.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [unique().on(t.requirementId, t.versionNumber)],
);
