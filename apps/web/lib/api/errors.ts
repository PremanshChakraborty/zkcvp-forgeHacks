// apps/web/lib/api/errors.ts

/**
 * The complete error vocabulary of the M4 API. Plan 01 fixes the status codes
 * for every endpoint but says nothing about the body, so the shape is decided
 * here once rather than per handler.
 */
export type ErrorCode =
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "invalid_body"
  | "github_unavailable";

export class ServiceError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ServiceError";
  }
}

export const forbidden = (message = "Not a member of this project") =>
  new ServiceError(403, "forbidden", message);

export const notFound = (message = "Not found") =>
  new ServiceError(404, "not_found", message);

export const conflict = (message: string) =>
  new ServiceError(409, "conflict", message);

export const invalidBody = (details: unknown) =>
  new ServiceError(400, "invalid_body", "Invalid request body", details);

/**
 * The GitHub lookup is unauthenticated by plan-01 rule and therefore shares one
 * 60/hour budget across every stakeholder on the deployment. Exhaustion is an
 * infrastructure failure, NOT "no such user" — reporting it as 404 would tell a
 * stakeholder something false about a real person.
 */
export const githubUnavailable = (
  message = "GitHub could not be reached. Try again shortly.",
) => new ServiceError(503, "github_unavailable", message);

/**
 * Postgres unique-violation SQLSTATE.
 *
 * drizzle-orm/node-postgres wraps every driver error in a `DrizzleQueryError`
 * that carries the raw `pg` error on `.cause` rather than copying `.code`
 * onto itself, so the SQLSTATE has to be found by walking the cause chain.
 */
export function isUniqueViolation(e: unknown): boolean {
  let current: unknown = e;
  for (let i = 0; i < 5 && current; i++) {
    if (
      typeof current === "object" &&
      "code" in current &&
      (current as { code?: unknown }).code === "23505"
    ) {
      return true;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

/**
 * Postgres foreign-key-violation SQLSTATE.
 *
 * Same `.cause`-walking shape as `isUniqueViolation` and for the same reason:
 * drizzle-orm/node-postgres wraps every driver error in a `DrizzleQueryError`
 * that carries the raw `pg` error on `.cause` rather than copying `.code`
 * onto itself.
 */
export function isForeignKeyViolation(e: unknown): boolean {
  let current: unknown = e;
  for (let i = 0; i < 5 && current; i++) {
    if (
      typeof current === "object" &&
      "code" in current &&
      (current as { code?: unknown }).code === "23503"
    ) {
      return true;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}
