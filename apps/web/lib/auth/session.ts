// apps/web/lib/auth/session.ts
import { headers } from "next/headers";
import { getToken } from "next-auth/jwt";
import { createDb } from "@zkcvp/db";
import { env } from "../env";
import { isProjectMember, isStakeholderMember } from "./authorization";
import { scopedCookieNames } from "./cookies";
import { developerAuth } from "./developer";
import { stakeholderAuth } from "./stakeholder";
import type { DeveloperSession, Session, StakeholderSession } from "./types";
import { SessionError } from "./session-error";

/**
 * Reads the developer's GitHub access token straight out of the encrypted JWT.
 *
 * It is deliberately absent from the object the `session` callback returns,
 * because that object is serialised to JSON at /api/auth/dev/session and would
 * hand the credential to any script on the origin. Server code is the only
 * thing that may see it, so it is decrypted here on demand.
 *
 * `salt` must be the cookie name: that is what @auth/core used when encoding
 * (`const salt = options.cookies.sessionToken.name` in the callback action),
 * and decoding with a different salt silently yields null rather than erroring.
 */
async function readDeveloperGithubToken(): Promise<string | undefined> {
  const cookieName = scopedCookieNames("dev").sessionToken.name;
  const token = await getToken({
    req: { headers: await headers() },
    secret: env().AUTH_SECRET,
    salt: cookieName,
    cookieName,
  });
  const value = token?.githubAccessToken;
  return typeof value === "string" && value ? value : undefined;
}

export { SessionError };

/**
 * The only place plan 01's authorization matrix is expressed — see
 * docs/architecture.md, M3. Reads both Auth.js instances' cookies (they are
 * scoped to different cookie names, see cookies.ts, so at most one is ever
 * populated for a given visitor) and throws a 401 `SessionError` if neither
 * resolves.
 */
export async function requireSession(): Promise<Session> {
  const dev = await developerAuth();
  if (dev?.developerId) {
    /* A developer session without a token is not a usable developer session.
     * Token custody is the entire reason this session exists — the whole
     * design turns on the GitHub token living in this cookie and nowhere
     * else, so evaluation can only run inside a live session.
     *
     * Coercing a missing token to "" here would push the failure all the way
     * out to createGitHubClient(), far from the cause and long after the
     * request looked authorised. Treat it as no session at all and make the
     * developer sign in again, which is what actually repairs it. */
    const githubAccessToken = await readDeveloperGithubToken();
    if (!githubAccessToken) {
      throw new SessionError(
        401,
        "Developer session is missing its GitHub access token; sign in again",
      );
    }
    return { kind: "developer", developerId: dev.developerId, githubAccessToken };
  }

  const sh = await stakeholderAuth();
  if (sh?.stakeholderId) {
    return { kind: "stakeholder", stakeholderId: sh.stakeholderId };
  }

  throw new SessionError(401, "Authentication required");
}

export async function requireStakeholder(): Promise<StakeholderSession> {
  const session = await requireSession();
  if (session.kind !== "stakeholder") {
    throw new SessionError(401, "A stakeholder session is required");
  }
  return session;
}

export async function requireDeveloper(): Promise<DeveloperSession> {
  const session = await requireSession();
  if (session.kind !== "developer") {
    throw new SessionError(401, "A developer session is required");
  }
  return session;
}

export async function requireProjectMember(
  projectId: string,
): Promise<Session> {
  const session = await requireSession();
  const db = createDb(env().DATABASE_URL);
  if (!(await isProjectMember(db, session, projectId))) {
    throw new SessionError(403, "Not a member of this project");
  }
  return session;
}

export async function requireStakeholderMember(
  projectId: string,
): Promise<StakeholderSession> {
  const session = await requireStakeholder();
  const db = createDb(env().DATABASE_URL);
  if (!(await isStakeholderMember(db, session.stakeholderId, projectId))) {
    throw new SessionError(403, "Not a stakeholder member of this project");
  }
  return session;
}

export type { Session, StakeholderSession, DeveloperSession } from "./types";
