// apps/web/lib/auth/errors.ts
import { AuthError } from "next-auth";

/**
 * The identity store could not be reached — the sign-in did not fail, we did.
 *
 * Auth.js funnels every throw from the `signIn` callback into `AccessDenied`
 * (`handleAuthorized` in @auth/core/lib/actions/callback/index.js):
 *
 *   catch (e) { if (e instanceof AuthError) throw e; throw new AccessDenied(e) }
 *
 * So a transient Postgres blip — which we hit twice while building this — was
 * telling people they were not allowed in, when the truth was that we could not
 * check. That is the wrong thing to tell a user and the wrong thing to page an
 * operator about.
 *
 * Subclassing AuthError takes the `if (e instanceof AuthError) throw e` branch
 * instead, so this reaches the error page as its own `type` rather than being
 * flattened into AccessDenied. `next-auth` re-exports @auth/core's AuthError
 * (index.js:73), so the instanceof check matches across the package boundary.
 */
export class IdentityStoreUnavailable extends AuthError {
  static type = "IdentityStoreUnavailable";
}

/** True for the errors we raise ourselves, as opposed to a real denial. */
export function isInfrastructureError(errorType: string | null): boolean {
  return errorType === IdentityStoreUnavailable.type;
}
