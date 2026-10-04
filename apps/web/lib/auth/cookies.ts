// apps/web/lib/auth/cookies.ts

/**
 * Auth.js's own cookie names ("authjs.session-token" etc.) are identical
 * across separate `NextAuth()` instances unless overridden — the two
 * disjoint instances this app runs (see docs/architecture.md, "Why two
 * Auth.js instances") would otherwise silently share/clobber each other's
 * session cookie on the same origin. Auth.js deep-merges a partial `cookies`
 * config over its defaults (see @auth/core/lib/utils/merge.js), so supplying
 * only `name` here is enough — `httpOnly`/`sameSite`/`path`/`secure` are kept.
 *
 * Not reproduced here: the `__Secure-`/`__Host-` name-prefix convention
 * Auth.js applies automatically to its own default names when
 * `useSecureCookies` is true. The `secure` attribute itself is still set
 * (passed explicitly as `useSecureCookies` in each instance's config), only
 * the prefix-in-the-name convention is skipped for these custom names.
 */
export function scopedCookieNames(prefix: "dev" | "sh") {
  return {
    sessionToken: { name: `authjs.${prefix}.session-token` },
    callbackUrl: { name: `authjs.${prefix}.callback-url` },
    csrfToken: { name: `authjs.${prefix}.csrf-token` },
    pkceCodeVerifier: { name: `authjs.${prefix}.pkce.code_verifier` },
    state: { name: `authjs.${prefix}.state` },
    nonce: { name: `authjs.${prefix}.nonce` },
  };
}
