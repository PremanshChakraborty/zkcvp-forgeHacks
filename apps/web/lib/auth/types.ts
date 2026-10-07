// apps/web/lib/auth/types.ts

/**
 * The only place plan 01's authorization matrix is expressed as a type — see
 * docs/architecture.md, M3. No authorization logic is duplicated into route
 * handlers, server components, or middleware.
 */
export type Session =
  | { kind: "stakeholder"; stakeholderId: string }
  | { kind: "developer"; developerId: string; githubAccessToken: string };

export type StakeholderSession = Extract<Session, { kind: "stakeholder" }>;
export type DeveloperSession = Extract<Session, { kind: "developer" }>;
