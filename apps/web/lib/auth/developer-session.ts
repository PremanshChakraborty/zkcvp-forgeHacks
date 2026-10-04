// apps/web/lib/auth/developer-session.ts
import type { Session } from "next-auth";
import type { JWT } from "next-auth/jwt";

/**
 * Shapes what the CLIENT is allowed to see of a developer session.
 *
 * Extracted from the `session` callback so it can be tested directly, because
 * what it must NOT contain is a security property rather than a behaviour:
 * Auth.js serialises this object to JSON at GET /api/auth/dev/session, so
 * anything added here is handed to any script on the origin.
 *
 * The GitHub access token stays in the JWT and is read server-side only —
 * see `readDeveloperGithubToken` in session.ts.
 */
export function developerSessionFromToken(
  session: Session,
  token: Pick<JWT, "developerId"> & Record<string, unknown>,
): Session {
  session.developerId = token.developerId as string;
  return session;
}
