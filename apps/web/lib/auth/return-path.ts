// apps/web/lib/auth/return-path.ts

/** Where a sign-in lands when there is nothing better to return to. */
export const DEFAULT_RETURN_PATH = "/projects";

/**
 * Turns a caller-supplied `?from=` into a path this app is willing to send a
 * freshly authenticated visitor to — or the default.
 *
 * This value reaches `redirectTo`, and for the stakeholder flow it is embedded
 * in an emailed magic link. Anyone who can choose it could otherwise mail a
 * link that authenticates on this origin and then lands the visitor somewhere
 * they control, with the sign-in having genuinely succeeded. So the rule is an
 * ALLOW test rather than a blocklist of bad strings:
 *
 *   "/projects/abc"   kept — a path on this origin
 *   "https://evil"    rejected — absolute
 *   "//evil.test"     rejected — protocol-relative; the browser reads the host
 *   "/\evil.test"     rejected — browsers fold a backslash to "/", so this is
 *                     protocol-relative too, which is why it is checked
 *                     separately rather than assumed to be a normal path
 *   "/login"          rejected — not an attack, just a loop back to sign-in
 *
 * Middleware only writes paths under /projects and /requirements today, but
 * this validates the SHAPE rather than trusting that: the value arrives in a
 * query string, and anyone can type one.
 */
export function safeReturnPath(raw: string | null | undefined): string {
  if (typeof raw !== "string" || raw.length === 0) return DEFAULT_RETURN_PATH;

  /* Same-origin and absolute-from-root. */
  if (!raw.startsWith("/")) return DEFAULT_RETURN_PATH;

  /* Both of these resolve to a different origin. */
  if (raw.startsWith("//") || raw.startsWith("/\\")) return DEFAULT_RETURN_PATH;

  /* A control character — a newline above all — can split a header or truncate
   * a later check, so the whole string is rejected rather than stripped. */
  for (let i = 0; i < raw.length; i += 1) {
    const code = raw.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return DEFAULT_RETURN_PATH;
  }

  /* Returning to sign-in after signing in is a loop, and returning to an API
   * route hands a person a JSON body instead of a page. */
  if (raw === "/login" || raw.startsWith("/login/")) return DEFAULT_RETURN_PATH;
  if (raw.startsWith("/api/")) return DEFAULT_RETURN_PATH;

  return raw;
}
