import { describe, expect, it } from "vitest";
import type { Tree } from "@zkcvp/contracts";
import { EvaluationError } from "@zkcvp/contracts";

import { mergeVerdicts, type VerdictEntry } from "../src/state";
import {
  assertOneCommitPerRepo,
  resolveFiles,
  verdictProblem,
} from "../src/validation";

/**
 * `withStructuredOutput` guarantees the shape of a model's response and nothing
 * about its contents — a Zod schema cannot know which requirement IDs exist or
 * which paths are real. These are the checks that stand between a hallucinated
 * ID and a persisted requirement status.
 */

function tree(paths: string[], truncated = false): Tree {
  return {
    entries: paths.map((path) => ({ path, type: "file" as const })),
    truncated,
  };
}

const trees: Record<string, Tree> = {
  "acme/web": tree(["src/auth.ts", "src/list.tsx", "README.md"]),
  "acme/api": tree(["src/auth.ts", "src/db.ts"]),
};

describe("assertOneCommitPerRepo", () => {
  it("accepts one commit per repo", () => {
    expect(() =>
      assertOneCommitPerRepo([
        { repo: "acme/web", commitSha: "a".repeat(40) },
        { repo: "acme/api", commitSha: "b".repeat(40) },
      ]),
    ).not.toThrow();
  });

  it("rejects a second commit of the same repo", () => {
    // Two snapshots of one repo give the planner overlapping trees while `repo`
    // can no longer say which commit a path came from — and the resulting
    // wrong-commit read succeeds silently rather than failing.
    expect(() =>
      assertOneCommitPerRepo([
        { repo: "acme/web", commitSha: "a".repeat(40) },
        { repo: "acme/web", commitSha: "b".repeat(40) },
      ]),
    ).toThrowError(EvaluationError);
  });

  it("rejects an empty claim", () => {
    expect(() => assertOneCommitPerRepo([])).toThrowError(EvaluationError);
  });
});

describe("resolveFiles", () => {
  it("keeps paths that exist in the named repo's tree", () => {
    const { accepted, dropped } = resolveFiles(
      [
        { repo: "acme/web", path: "src/auth.ts" },
        { repo: "acme/api", path: "src/db.ts" },
      ],
      trees,
    );
    expect(accepted).toEqual([
      { repo: "acme/web", path: "src/auth.ts" },
      { repo: "acme/api", path: "src/db.ts" },
    ]);
    expect(dropped).toEqual([]);
  });

  it("keeps the same path in two repos apart", () => {
    // The bug this guards: a bare path string could not say which repo it came
    // from, so both of these used to be read from whichever repo was first.
    const { accepted } = resolveFiles(
      [
        { repo: "acme/web", path: "src/auth.ts" },
        { repo: "acme/api", path: "src/auth.ts" },
      ],
      trees,
    );
    expect(accepted).toHaveLength(2);
    expect(accepted.map((f) => f.repo)).toEqual(["acme/web", "acme/api"]);
  });

  it("drops a path that is not in the tree, with a reason", () => {
    const { accepted, dropped } = resolveFiles(
      [
        { repo: "acme/web", path: "src/auth.ts" },
        { repo: "acme/web", path: "src/invented.ts" },
      ],
      trees,
    );
    expect(accepted).toEqual([{ repo: "acme/web", path: "src/auth.ts" }]);
    expect(dropped).toHaveLength(1);
    expect(dropped[0]).toContain("not present at the claimed commit");
  });

  it("drops a repo that is not part of the claim", () => {
    const { accepted, dropped } = resolveFiles(
      [{ repo: "someone/else", path: "src/auth.ts" }],
      trees,
    );
    expect(accepted).toEqual([]);
    expect(dropped[0]).toContain("no such repo");
  });

  it("accepts unknown paths when GitHub truncated the tree", () => {
    // The file may exist in a part of the listing that was never returned, so
    // dropping it would discard a real candidate. A 404 at read time is
    // evidence either way.
    const truncatedTrees = { "acme/web": tree(["src/auth.ts"], true) };
    const { accepted, dropped } = resolveFiles(
      [{ repo: "acme/web", path: "src/deep/nested.ts" }],
      truncatedTrees,
    );
    expect(accepted).toEqual([{ repo: "acme/web", path: "src/deep/nested.ts" }]);
    expect(dropped).toEqual([]);
  });

  it("normalises leading slashes and dedupes", () => {
    const { accepted } = resolveFiles(
      [
        { repo: "acme/web", path: "/src/auth.ts" },
        { repo: "acme/web", path: "./src/auth.ts" },
        { repo: "acme/web", path: "src/auth.ts" },
      ],
      trees,
    );
    expect(accepted).toEqual([{ repo: "acme/web", path: "src/auth.ts" }]);
  });

  it("skips files already gathered", () => {
    const { accepted } = resolveFiles(
      [
        { repo: "acme/web", path: "src/auth.ts" },
        { repo: "acme/web", path: "src/list.tsx" },
      ],
      trees,
      { exclude: new Set(["acme/web:src/auth.ts"]) },
    );
    expect(accepted).toEqual([{ repo: "acme/web", path: "src/list.tsx" }]);
  });

  it("enforces the file limit in code, not in prose", () => {
    const { accepted, dropped } = resolveFiles(
      [
        { repo: "acme/web", path: "src/auth.ts" },
        { repo: "acme/web", path: "src/list.tsx" },
        { repo: "acme/web", path: "README.md" },
      ],
      trees,
      { limit: 2 },
    );
    expect(accepted).toHaveLength(2);
    expect(dropped[0]).toContain("over the 2-file limit");
  });
});

describe("verdictProblem", () => {
  const requirements = [
    { requirementVersionId: "req-1", title: "A", description: "a" },
    { requirementVersionId: "req-2", title: "B", description: "b" },
  ];

  const ok: VerdictEntry[] = [
    { requirementVersionId: "req-1", verdict: "satisfied", rationale: "yes" },
    { requirementVersionId: "req-2", verdict: "not_satisfied", rationale: "no" },
  ];

  it("accepts one verdict per requirement", () => {
    expect(verdictProblem(ok, requirements)).toBeNull();
  });

  it("catches a missing requirement and names it", () => {
    const problem = verdictProblem([ok[0]], requirements);
    expect(problem).toContain("req-2");
    // The message is fed straight back to the model as a repair instruction.
    expect(problem).toContain("1 of 2");
  });

  it("catches a hallucinated requirement ID", () => {
    const problem = verdictProblem(
      [
        ...ok,
        {
          requirementVersionId: "req-99",
          verdict: "satisfied",
          rationale: "invented",
        },
      ],
      requirements,
    );
    expect(problem).toContain("req-99");
  });

  it("catches a duplicate verdict", () => {
    expect(verdictProblem([ok[0], ok[0], ok[1]], requirements)).toContain(
      "more than one verdict",
    );
  });

  it("catches an empty rationale", () => {
    const problem = verdictProblem(
      [{ requirementVersionId: "req-1", verdict: "satisfied", rationale: "  " }],
      requirements,
    );
    expect(problem).toContain("empty");
  });
});

describe("mergeVerdicts", () => {
  it("keeps requirements an later pass did not revisit", () => {
    // Verdicts used to be overwritten wholesale, so a requirement decided on
    // pass 1 vanished if pass 3 returned without it.
    const first: VerdictEntry[] = [
      { requirementVersionId: "req-1", verdict: "satisfied", rationale: "one" },
      { requirementVersionId: "req-2", verdict: "satisfied", rationale: "two" },
    ];
    const second: VerdictEntry[] = [
      { requirementVersionId: "req-2", verdict: "not_satisfied", rationale: "revised" },
    ];

    const merged = mergeVerdicts(first, second);
    expect(merged).toHaveLength(2);
    expect(merged.find((v) => v.requirementVersionId === "req-1")?.rationale).toBe("one");
    expect(merged.find((v) => v.requirementVersionId === "req-2")?.verdict).toBe(
      "not_satisfied",
    );
  });
});
