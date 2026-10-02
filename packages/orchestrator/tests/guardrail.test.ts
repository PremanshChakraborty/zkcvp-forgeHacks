import { describe, expect, it } from "vitest";

import { containsCode } from "../src/guardrails/code-detector";

/**
 * The guardrail standing between a private repo and a stakeholder-visible
 * Report. It is pure and synchronous, so there was never a reason for it to be
 * the one piece of the privacy story with no test behind it.
 *
 * Both directions matter and they pull against each other. A miss leaks source
 * code. A false positive replaces a perfectly good rationale with a redaction
 * notice, which degrades the only artifact the stakeholder ever sees — so the
 * "prose that merely sounds technical" cases below are load-bearing, not filler.
 */
describe("containsCode", () => {
  describe("accepts rationale prose", () => {
    const allowed = [
      "The requirement is satisfied. Authentication is handled in src/auth.ts, lines 15-30, which validates the session before rendering.",
      "Not satisfied. Nothing in the repository reads from an external API; the media list is hardcoded.",
      "The function that handles login is defined in app/login/page.tsx and delegates to the session helper.",
      "Watchlist behaviour appears in three places: the route handler, the store, and the component that renders it.",
      "The class of problem here is that no migration exists for the table the requirement describes.",
      "Satisfied — see packages/db/src/schema/requirements.ts for the versioning approach.",
    ];

    for (const text of allowed) {
      it(`keeps: ${text.slice(0, 52)}…`, () => {
        expect(containsCode(text)).toBe(false);
      });
    }
  });

  describe("flags source code", () => {
    const rejected = [
      "The handler is:\n```ts\nexport const load = async () => { return null; }\n```",
      "It does this:\n    const user = await getUser(id);\n    if (!user) return null;",
      'The file starts with import { z } from "zod"; and then exports a schema const Foo = z.object({});',
      "Look at `const handler = async (req) => { await db.query(sql); }` in the route.",
      "if (!session) { throw new Error('unauthorized'); } is the check that satisfies this.",
      "export function verify(token) {\n  return jwt.verify(token, secret);\n}",
    ];

    for (const text of rejected) {
      it(`redacts: ${text.slice(0, 52)}…`, () => {
        expect(containsCode(text)).toBe(true);
      });
    }
  });

  it("needs two signals, so one technical word alone is not enough", () => {
    // The single-match threshold was rejected deliberately: "function",
    // "return" and "class" all appear in ordinary English about code.
    expect(containsCode("The function is correct.")).toBe(false);
    expect(containsCode("We return to this point below.")).toBe(false);
  });

  it("treats empty and whitespace input as clean", () => {
    expect(containsCode("")).toBe(false);
    expect(containsCode("   \n  ")).toBe(false);
  });
});
