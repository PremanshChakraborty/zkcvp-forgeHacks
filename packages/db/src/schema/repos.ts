import { pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { developers } from "./identity";
import { projects } from "./projects";

/**
 * A lightweight attachment record and nothing more. Branches, commits, and the
 * repo list itself are always fetched live with the acting developer's own
 * token — there is no cached repo state to go stale and no persisted access
 * grant that could be revoked behind our back.
 */
export const projectRepos = pgTable(
  "project_repos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    /** GitHub's NUMERIC repo id as text. Stable across renames. The join key. */
    githubRepoId: text("github_repo_id").notNull(),
    /**
     * Display cache only. Goes stale after a rename; GitHub's own redirect
     * still resolves API calls, and plan 02 accepts that rather than building
     * a refresh mechanism nothing yet needs.
     */
    fullName: text("full_name").notNull(),
    /**
     * GitHub's own default branch, captured at the moment of attach — `attachRepo`
     * resolves the submitted repo against a live GitHub list before inserting,
     * so it always has GitHub's current value to write here. The claim
     * composer needs it to pre-select a branch from an `AttachedRepo` alone —
     * re-listing the whole account, or a later migration, are the two
     * alternatives plan 02 forecloses.
     */
    defaultBranch: text("default_branch").notNull(),
    addedBy: uuid("added_by")
      .notNull()
      .references(() => developers.id),
    addedAt: timestamp("added_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  /* Same repo may be attached to several DIFFERENT projects, never twice to
   * one. There is deliberately no status or removed_at column: removal only
   * happens inside a 60-second undo window, so a hard delete leaves nothing
   * worth a tombstone. */
  (t) => [unique().on(t.projectId, t.githubRepoId)],
);
