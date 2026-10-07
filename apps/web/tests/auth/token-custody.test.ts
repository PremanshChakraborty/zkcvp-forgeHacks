// apps/web/tests/auth/token-custody.test.ts
import { describe, expect, it } from "vitest";
import { developerSessionFromToken } from "../../lib/auth/developer-session";

/**
 * docs/architecture.md, M3: the GitHub access token is retained "in the
 * encrypted JWE cookie only — never written to a table, never logged, never
 * in an API response."
 *
 * Auth.js serialises whatever the `session` callback returns to JSON at
 * GET /api/auth/dev/session. Putting the token on the session object there —
 * which is what we did first, and what a live request confirmed — hands the
 * raw `gho_...` credential to any script running on the origin. Server code
 * reads it out of the JWT instead (see session.ts).
 */
describe("developer session shaping", () => {
  const token = {
    developerId: "dev-uuid",
    githubAccessToken: "gho_SECRETVALUE",
    sub: "dev-uuid",
  };

  it("exposes developerId to the client", () => {
    const session = developerSessionFromToken({ user: {} } as never, token);
    expect(session.developerId).toBe("dev-uuid");
  });

  it("never puts the GitHub access token on the session", () => {
    const session = developerSessionFromToken({ user: {} } as never, token);
    expect(session).not.toHaveProperty("githubAccessToken");
    expect(JSON.stringify(session)).not.toContain("gho_SECRETVALUE");
  });
});
