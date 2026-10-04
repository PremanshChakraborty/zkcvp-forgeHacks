// apps/web/lib/auth/base-config.ts
import { scopedCookieNames } from "./cookies";

/**
 * The settings both Auth.js instances share, expressed once.
 *
 * Everything that legitimately differs between them — basePath, providers,
 * adapter, callbacks, and the cookie name prefix — stays in developer.ts and
 * stakeholder.ts. Only the settings that must never drift apart live here.
 */
export function baseAuthConfig(args: {
  prefix: "dev" | "sh";
  secret: string;
}) {
  const isProduction = process.env.NODE_ENV === "production";

  return {
    secret: args.secret,
    session: { strategy: "jwt" as const },
    cookies: scopedCookieNames(args.prefix),
    useSecureCookies: isProduction,

    /**
     * Auth.js refuses every request when `trustHost` is false — it is the very
     * first check in assertConfig, before providers or adapters are even
     * looked at.
     *
     * Its default is `!!(AUTH_URL ?? AUTH_TRUST_HOST ?? VERCEL ?? CF_PAGES ??
     * NODE_ENV !== "production")`. On the self-hosted Node targets this project
     * commits to (Railway/Render/Fly/Docker — see "Host-agnostic guarantees"),
     * none of those are set in production, so the default is FALSE and both
     * logins would 500. It only works in development by accident of the last
     * clause.
     *
     * Setting it true says "an upstream proxy terminates TLS and sets
     * X-Forwarded-*", which is true of every host under consideration. The
     * residual risk is host-header spoofing influencing a callback URL, and
     * that is closed by setting AUTH_URL — which is why env.ts documents it as
     * strongly recommended in production.
     */
    trustHost: true,

    /**
     * Both instances render our own pages instead of Auth.js's built-ins.
     *
     * `error` also defuses a confusing cascade: a config failure redirects to
     * the signin page, but @auth/core's built-in signin page throws
     * UnknownAction when the path carries a provider id (pages/index.js:53).
     * The real error was being buried under a second, unrelated one.
     */
    pages: {
      signIn: "/login",
      error: "/login/error",
    },
  };
}
