// apps/web/lib/auth/developer.ts
import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import { createDb } from "@zkcvp/db";
import { env } from "../env";
import { baseAuthConfig } from "./base-config";
import { developerSessionFromToken } from "./developer-session";
import { IdentityStoreUnavailable } from "./errors";
import { upsertDeveloperAndAcceptInvites } from "./identity";

interface RawGitHubProfile {
  id: number;
  login: string;
  name: string | null;
  avatar_url: string;
}

/**
 * GitHub provider, no adapter, JWT strategy — see docs/architecture.md, M3.
 * No adapter means Auth.js never tries to create a user row itself; the
 * `developers` upsert happens in the `signIn` callback below, and the
 * developer's own live GitHub access token is retained only in the
 * encrypted JWE session cookie (`jwt`/`session` callbacks), never persisted
 * to a table — see "Token custody" in README.md.
 */
export const {
  handlers: developerHandlers,
  auth: developerAuth,
  signIn: developerSignIn,
  signOut: developerSignOut,
} = NextAuth(() => {
  const e = env();
  return {
    ...baseAuthConfig({ prefix: "dev", secret: e.AUTH_SECRET }),
    basePath: "/api/auth/dev",
    providers: [
      GitHub({
        /* Left blank until Gate B (see docs/architecture.md) — an empty
         * client id/secret only breaks the actual GitHub OAuth redirect,
         * never module load, so the stakeholder instance keeps working. */
        clientId: e.AUTH_GITHUB_ID ?? "",
        clientSecret: e.AUTH_GITHUB_SECRET ?? "",
        /* Exactly the scope plan 01 asks for — no broader "user:email" or
         * similar, since developers carry no email in this design. */
        authorization: { params: { scope: "repo" } },
      }),
    ],
    callbacks: {
      async signIn({ profile }) {
        /* Refusal only. A missing profile IS a genuine refusal — GitHub told
         * us nothing to identify this person by, so there is no developer to
         * sign in. Everything else happens in `jwt` below. */
        return Boolean(profile);
      },
      async jwt({ token, account, profile }) {
        /* `account` and `profile` are passed by @auth/core only on the initial
         * sign-in (callback/index.js:78-85) and are absent on every later token
         * refresh — so this branch is exactly "the developer just logged in",
         * and the upsert cannot re-run per request.
         *
         * Deliberately NOT the previous approach of writing developerId onto
         * `user` in `signIn` and reading it back here. That worked only because
         * @auth/core happened to pass the same object reference to both
         * callbacks, which holds solely while no adapter is configured
         * (handle-login.js:24 returns the profile by reference). Had that ever
         * become a copy, developerId would have silently gone undefined — and
         * the session cookie would STILL have been written, so the developer
         * would appear signed in while requireSession() threw 401. Reading the
         * values @auth/core passes us explicitly has no such failure mode. */
        if (account && profile) {
          const github = profile as unknown as RawGitHubProfile;
          try {
            const db = createDb(e.DATABASE_URL);
            const { developerId } = await upsertDeveloperAndAcceptInvites(db, {
              githubUserId: String(github.id),
              githubUsername: github.login,
              displayName: github.name ?? github.login,
              avatarUrl: github.avatar_url,
            });
            token.developerId = developerId;
          } catch (cause) {
            /* Not a denial — we could not reach the identity store. Logged with
             * the GitHub id (never the token) so the failure is attributable
             * without leaking a credential.
             *
             * Thrown from `jwt` rather than `signIn`, but the custom type still
             * survives: callback()'s outer catch carries the same
             * `if (e instanceof AuthError) throw e` guard as handleAuthorized
             * (callback/index.js:386), so this is not flattened into
             * CallbackRouteError. And `jwt` runs before the cookie is encoded,
             * so a throw here still means no session — it fails closed exactly
             * as it did before. See errors.ts. */
            console.error(
              `[auth][dev] identity store unavailable for github_user_id=${github.id}`,
              cause,
            );
            throw new IdentityStoreUnavailable("developer upsert failed", {
              cause,
            });
          }
          token.githubAccessToken = account.access_token;
        }
        return token;
      },
      async session({ session, token }) {
        /* Deliberately does NOT carry githubAccessToken — this object is
         * serialised to JSON at /api/auth/dev/session. See
         * developer-session.ts and tests/auth/token-custody.test.ts. */
        return developerSessionFromToken(session, token);
      },
    },
  };
});
