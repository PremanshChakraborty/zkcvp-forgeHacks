import { describe, expect, it } from "vitest";
import { isGitHubReadError } from "@zkcvp/contracts";

import { CASES } from "../evals/cases";
import { FakeGitHubReadTool, fixtureSha } from "../evals/fake-github";
import { score, wilson, type ScoredRequirement } from "../evals/metrics";
import { MAX_FILE_CHARS } from "../src/limits";

/**
 * The eval harness's own deterministic parts. The eval run itself calls a real
 * model and lives outside this suite (`npm run eval`); these make sure that
 * when it reports a number, the number means what it says.
 */

describe("FakeGitHubReadTool", () => {
  const repo = { repo: "acme/api", files: { "src/a.ts": "a", "src/deep/b.ts": "bb" }, changed: ["src/a.ts"] };
  const sha = fixtureSha("acme/api");

  it("lists files and the directories they imply", async () => {
    const tree = await new FakeGitHubReadTool([repo]).listTree("acme/api", sha);
    expect(tree.entries.filter((e) => e.type === "dir").map((e) => e.path)).toEqual(["src", "src/deep"]);
    expect(tree.entries.find((e) => e.path === "src/deep/b.ts")?.size).toBe(2);
  });

  it("raises not_found for a missing path, exactly as the real client does", async () => {
    const err = await new FakeGitHubReadTool([repo]).readFile("acme/api", sha, "nope.ts").catch((e) => e);
    expect(isGitHubReadError(err) && err.kind).toBe("not_found");
  });

  it("refuses a commit it does not hold", async () => {
    const err = await new FakeGitHubReadTool([repo]).readFile("acme/api", "f".repeat(40), "src/a.ts").catch((e) => e);
    expect(isGitHubReadError(err) && err.kind).toBe("forbidden");
  });
});

describe("the eval set", () => {
  it("has unique case ids and fixtures that cover every requirement's repos", () => {
    expect(new Set(CASES.map((c) => c.id)).size).toBe(CASES.length);
    for (const c of CASES) {
      expect(c.requirements.length).toBeGreaterThan(0);
      expect(new Set(c.repos.map((r) => r.repo)).size).toBe(c.repos.length);
    }
  });

  it("labels every injection case not_satisfied — the attacker wants an approval", () => {
    for (const c of CASES.filter((c) => c.category === "injection")) {
      for (const r of c.requirements) expect(r.expected, c.id).toBe("not_satisfied");
    }
  });

  it("puts the decisive code of each truncation case past the GATHER cutoff", () => {
    for (const c of CASES.filter((c) => c.category === "truncation")) {
      const big = Object.values(c.repos[0]!.files).find((f) => f.length > MAX_FILE_CHARS);
      expect(big, c.id).toBeDefined();
      expect(big!.lastIndexOf("export function rateLimit")).toBeGreaterThan(MAX_FILE_CHARS);
    }
  });
});

describe("metrics", () => {
  const row = (expected: ScoredRequirement["expected"], got: ScoredRequirement["got"]): ScoredRequirement => ({
    caseId: "c",
    category: "genuine",
    requirementId: "r",
    expected,
    got,
    ungrounded: [],
  });

  it("computes false approvals over the truly-unsatisfied only", () => {
    const m = score([
      row("not_satisfied", "satisfied"),
      row("not_satisfied", "not_satisfied"),
      row("not_satisfied", "not_satisfied"),
      row("not_satisfied", "not_satisfied"),
      row("satisfied", "satisfied"),
      row("satisfied", "not_satisfied"),
    ]);
    expect(m.falseApprovalRate.value).toBe(0.25);
    expect(m.precision.value).toBe(0.5);
    expect(m.recall.value).toBe(0.5);
  });

  it("keeps a failed run out of every rate", () => {
    const m = score([row("not_satisfied", "error"), row("not_satisfied", "not_satisfied")]);
    expect(m.confusion.errors).toBe(1);
    expect(m.falseApprovalRate).toMatchObject({ value: 0, den: 1 });
  });

  it("reports no data as null, not as 0%", () => {
    expect(score([row("not_satisfied", "not_satisfied")]).precision.value).toBeNull();
  });

  it("gives a wide Wilson interval at small n", () => {
    const r = wilson(0, 10);
    expect(r.ci![0]).toBe(0);
    expect(r.ci![1]).toBeGreaterThan(0.25);
  });
});
