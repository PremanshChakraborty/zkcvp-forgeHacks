/**
 * Domain vocabulary shared between the database, the API and the Evaluator.
 *
 * These mirror the database enums in docs/plans/01-requirement-management.md,
 * and they must stay identical to design-system-ledger/components/types.ts.
 * That parity is asserted by tests/enum-parity.test.ts — the typechecker cannot
 * see across the two packages, and drift means one surface would tell a user
 * something another does not.
 */

/** `requirement_versions.status` — the persisted enum. */
export type RequirementStatus = "new" | "verified" | "eval_failed";

/** Per-requirement Evaluator output. */
export type Verdict = "satisfied" | "not_satisfied";

export type Role = "stakeholder" | "developer";

/** `project_developer_invites.status` / `project_stakeholder_invites.status`. */
export type InviteStatus = "pending" | "accepted";

/* Runtime tuples, so schema definitions and validators can enumerate the values
 * without restating them. Order matches the type unions above. */
export const REQUIREMENT_STATUSES = ["new", "verified", "eval_failed"] as const;
export const VERDICTS = ["satisfied", "not_satisfied"] as const;
export const ROLES = ["stakeholder", "developer"] as const;
export const INVITE_STATUSES = ["pending", "accepted"] as const;
