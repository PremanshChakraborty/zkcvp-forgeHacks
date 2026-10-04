// apps/web/tests/auth/authjs-patch.test.ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Guards patches/@auth+core+0.41.3.patch.
 *
 * Upstream keeps `hasCredentials`/`hasEmail`/`hasWebAuthn` as MODULE-level
 * `let`s that are set to true and never reset. Two Auth.js instances in one
 * process therefore share them: once the stakeholder instance (email provider)
 * asserts, the adapter-less developer instance is permanently told "Email
 * login requires an adapter" and every GitHub sign-in 500s.
 *
 * This is asserted against the installed file rather than by calling
 * assertConfig, because the failure mode we care about is "the patch silently
 * stopped being applied" — `npm ci --ignore-scripts`, a dependency bump, a
 * fresh clone whose postinstall didn't run. Those leave the source unpatched,
 * and the resulting breakage is both delayed and order-dependent (GitHub login
 * works until something touches the stakeholder flow), which is exactly the
 * kind of bug that reaches production.
 *
 * fileURLToPath, not `.pathname`: on Windows the latter yields "/C:/..." — see
 * the note in next.config.ts.
 */
const ASSERT_JS = fileURLToPath(
  new URL(
    "../../../../node_modules/@auth/core/lib/utils/assert.js",
    import.meta.url,
  ),
);

const FLAGS = ["hasCredentials", "hasEmail", "hasWebAuthn"] as const;

describe("@auth/core patch: assertConfig provider flags are function-local", () => {
  const source = readFileSync(ASSERT_JS, "utf8");
  const fnStart = source.indexOf("export function assertConfig");
  const preamble = source.slice(0, fnStart);
  const body = source.slice(fnStart);

  it("finds assertConfig in the installed file", () => {
    // If this fails the file moved or was rewritten upstream, and every other
    // assertion here is meaningless rather than merely failing.
    expect(fnStart).toBeGreaterThan(-1);
  });

  for (const flag of FLAGS) {
    it(`declares ${flag} inside assertConfig, not at module scope`, () => {
      expect(preamble).not.toMatch(new RegExp(`^let ${flag}\\b`, "m"));
      expect(body).toMatch(new RegExp(`^\\s+let ${flag} = false;`, "m"));
    });
  }

  it("leaves the warn-once flag at module scope", () => {
    // `warned` is deliberately process-wide; pulling it into the function
    // would re-emit every startup warning on each request.
    expect(preamble).toMatch(/^let warned = false;/m);
  });
});
