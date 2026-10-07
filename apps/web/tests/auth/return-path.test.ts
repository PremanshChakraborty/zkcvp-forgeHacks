// apps/web/tests/auth/return-path.test.ts
import { describe, expect, it } from "vitest";
import {
  DEFAULT_RETURN_PATH,
  safeReturnPath,
} from "../../lib/auth/return-path";

/* Built rather than typed, so no test escaping can quietly weaken the case. */
const BACKSLASH = String.fromCharCode(92);
const NEWLINE = String.fromCharCode(10);
const NUL = String.fromCharCode(0);

describe("safeReturnPath", () => {
  it("keeps a path on this origin", () => {
    expect(safeReturnPath("/requirements/abc")).toBe("/requirements/abc");
    expect(safeReturnPath("/projects?tab=open")).toBe("/projects?tab=open");
  });

  /* The value reaches `redirectTo`, and for the stakeholder flow it is embedded
   * in an emailed magic link. Each of these would otherwise let someone mail a
   * link that authenticates on this origin and lands the reader elsewhere. */
  it.each([
    ["absolute", "https://evil.test/steal"],
    ["scheme-relative", "//evil.test"],
    ["backslash-folded", "/" + BACKSLASH + "evil.test"],
    ["bare backslashes", BACKSLASH + BACKSLASH + "evil.test"],
    ["javascript url", "javascript:alert(1)"],
    ["not rooted", "requirements/abc"],
  ])("rejects an off-origin target (%s)", (_name, hostile) => {
    expect(safeReturnPath(hostile)).toBe(DEFAULT_RETURN_PATH);
  });

  it("rejects a control character rather than stripping it", () => {
    expect(safeReturnPath("/projects" + NEWLINE + "X")).toBe(
      DEFAULT_RETURN_PATH,
    );
    expect(safeReturnPath("/projects" + NUL)).toBe(DEFAULT_RETURN_PATH);
  });

  /* Not attacks — just destinations that waste the round trip. */
  it("rejects a target that loops back to sign-in", () => {
    expect(safeReturnPath("/login")).toBe(DEFAULT_RETURN_PATH);
    expect(safeReturnPath("/login/email")).toBe(DEFAULT_RETURN_PATH);
  });

  it("rejects an API route, which would render JSON to a person", () => {
    expect(safeReturnPath("/api/projects")).toBe(DEFAULT_RETURN_PATH);
  });

  it("falls back when there is nothing to return to", () => {
    expect(safeReturnPath(undefined)).toBe(DEFAULT_RETURN_PATH);
    expect(safeReturnPath(null)).toBe(DEFAULT_RETURN_PATH);
    expect(safeReturnPath("")).toBe(DEFAULT_RETURN_PATH);
  });
});
