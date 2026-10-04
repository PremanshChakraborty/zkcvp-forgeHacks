// apps/web/lib/auth/next-auth.d.ts

/**
 * One augmentation shared by both Auth.js instances. Each instance's own
 * `session` callback only ever populates the fields that belong to it
 * (developerId/githubAccessToken for the developer instance, stakeholderId
 * for the stakeholder instance) — see session.ts for the union type
 * (`Session`) that actually discriminates between the two at the app level.
 * This file exists only so `session.developerId` etc. type-check inside
 * developer.ts/stakeholder.ts without a cast at every call site.
 */
declare module "next-auth" {
  interface Session {
    developerId?: string;
    stakeholderId?: string;
    /* githubAccessToken is deliberately NOT declared here. The session object
     * is serialised to JSON at /api/auth/dev/session, so the token must never
     * reach it — keeping it off the type makes that a compile error rather
     * than a review comment. It lives in the JWT below. */
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    developerId?: string;
    /* Server-side only; read via getToken() in session.ts. */
    githubAccessToken?: string;
    stakeholderId?: string;
  }
}

export {};
