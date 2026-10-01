import { VERDICTS } from "@zkcvp/contracts";
import {
  index,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { developers } from "./identity";
import { projects } from "./projects";
import { projectRepos } from "./repos";
import { requirementVersions } from "./requirements";

export const verdictEnum = pgEnum("verdict", VERDICTS);

/**
 * A developer's assertion that specific commits satisfy specific requirement
 * versions. Written BEFORE the evaluation runs, because the Transparency Log
 * treats "claim submitted" as an event distinct from "verification result".
 *
 * A claim with no evaluation row is an abandoned submission, not a status. No
 * requirement version is left mid-flight by one.
 */
export const claims = pgTable("claims", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id),
  submittedBy: uuid("submitted_by")
    .notNull()
    .references(() => developers.id),
  submittedAt: timestamp("submitted_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const claimRepos = pgTable(
  "claim_repos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    claimId: uuid("claim_id")
      .notNull()
      .references(() => claims.id),
    /**
     * References the ATTACHMENT row, not a repo name, so `github_repo_id` stays
     * the join key. It cannot dangle: attachment is permanent past a 60-second
     * undo window, so `restrict` only ever fires inside that window.
     */
    projectRepoId: uuid("project_repo_id")
      .notNull()
      .references(() => projectRepos.id, { onDelete: "restrict" }),
    commitSha: text("commit_sha").notNull(),
  },
  /**
   * The database's form of the Evaluator's at-most-one-commit-per-repo rule. A
   * commit is a full snapshot and `repo` is what maps a planned file path back
   * to a commit — two commits of one repo would read the same path at the wrong
   * commit and succeed silently.
   */
  (t) => [unique().on(t.claimId, t.projectRepoId)],
);

export const claimRequirementVersions = pgTable(
  "claim_requirement_versions",
  {
    claimId: uuid("claim_id")
      .notNull()
      .references(() => claims.id),
    requirementVersionId: uuid("requirement_version_id")
      .notNull()
      .references(() => requirementVersions.id),
  },
  (t) => [primaryKey({ columns: [t.claimId, t.requirementVersionId] })],
);

/**
 * One execution of the Evaluator. Written only when BOTH artifacts exist — a
 * failed run leaves no row here and no status change anywhere.
 */
export const evaluations = pgTable("evaluations", {
  /** The Evaluator's own `evaluationId`, not a fresh one. */
  id: uuid("id").primaryKey(),
  claimId: uuid("claim_id")
    .notNull()
    .references(() => claims.id),
  /** The model that actually produced these verdicts. */
  modelId: text("model_id").notNull(),
  promptTemplateVersion: text("prompt_template_version").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  /**
   * The full EvidenceBundle, containing verbatim private source. NEVER returned
   * by any endpoint or rendered on any page in this phase.
   */
  evidence: jsonb("evidence").notNull(),
  /**
   * SHA-256 over canonical JSON of `evidence`. No consumer yet — this is what
   * the Transparency Log anchors, and what makes integrity checkable WITHOUT
   * disclosing contents.
   */
  evidenceHash: text("evidence_hash").notNull(),
});

export const verdicts = pgTable(
  "verdicts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    evaluationId: uuid("evaluation_id")
      .notNull()
      .references(() => evaluations.id),
    requirementVersionId: uuid("requirement_version_id")
      .notNull()
      .references(() => requirementVersions.id),
    verdict: verdictEnum("verdict").notNull(),
    /** Prose. Cites file paths and line ranges; never contains source code. */
    rationale: text("rationale").notNull(),
  },
  (t) => [
    unique().on(t.evaluationId, t.requirementVersionId),
    /** `verdicts` is read by requirement version on every requirement page view. */
    index("verdicts_requirement_version_idx").on(t.requirementVersionId),
  ],
);
