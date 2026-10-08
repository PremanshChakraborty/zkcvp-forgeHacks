import { describe, expect, it } from "vitest";
import type { Tree } from "@zkcvp/contracts";

import { groundingProblem, ungroundedCitations } from "../src/guardrails/grounding";

/**
 * A rationale may only cite files the run read. These pin both directions:
 * real ungrounded citations are caught, and ordinary prose that merely looks
 * path-like is not — a false alarm here is a repair round the model did not
 * need, or a redacted rationale the stakeholder did not deserve.
 */

function tree(paths: string[]): Tree {
  return { entries: paths.map((path) => ({ path, type: "file" as const })), truncated: false };
}

const trees = {
  "acme/api": tree(["src/routes.ts", "src/middleware/rate-limit.ts", "README.md", "docs/changelog.md"]),
  "acme/web": tree(["src/routes.ts", "src/App.tsx"]),
};

describe("ungroundedCitations", () => {
  it("accepts a citation of a file that was read", () => {
    expect(
      ungroundedCitations("See src/middleware/rate-limit.ts, lines 10-30.", trees, [
        "acme/api:src/middleware/rate-limit.ts",
      ]),
    ).toEqual([]);
  });

  it("accepts a bare file name that resolves to a read file", () => {
    expect(ungroundedCitations("rate-limit.ts returns early.", trees, ["acme/api:src/middleware/rate-limit.ts"])).toEqual([]);
  });

  it("flags a real file the run never read", () => {
    expect(ungroundedCitations("Per README.md the gateway limits.", trees, ["acme/api:src/routes.ts"])).toEqual([
      { citation: "README.md", reason: "not_read" },
    ]);
  });

  it("flags a path that does not exist — the trace of a forged file", () => {
    expect(
      ungroundedCitations("Implemented in src/middleware/token-bucket.ts.", trees, ["acme/api:docs/changelog.md"]),
    ).toEqual([{ citation: "src/middleware/token-bucket.ts", reason: "not_in_tree" }]);
  });

  it("respects a repo prefix", () => {
    // Read in acme/web, cited in acme/api: same path, different file.
    expect(ungroundedCitations("acme/api:src/routes.ts applies it.", trees, ["acme/web:src/routes.ts"])).toEqual([
      { citation: "acme/api:src/routes.ts", reason: "not_read" },
    ]);
  });

  it("counts a GATHER window as reading the file", () => {
    expect(ungroundedCitations("src/routes.ts applies it.", trees, ["acme/api:src/routes.ts#15000"])).toEqual([]);
  });

  it("ignores route paths, abbreviations, and version numbers", () => {
    expect(
      ungroundedCitations(
        "The /api/notes/export.csv route, e.g. HTTP 1.1, returns a file named notes.csv.",
        trees,
        [],
      ),
    ).toEqual([]);
  });
});

describe("groundingProblem", () => {
  it("names the requirement and the citation, as a repair instruction", () => {
    const problem = groundingProblem(
      [{ requirementVersionId: "req-1", rationale: "See README.md." }],
      trees,
      [],
    );
    expect(problem).toContain('"req-1"');
    expect(problem).toContain("README.md");
  });

  it("is null when every rationale is grounded", () => {
    expect(
      groundingProblem([{ requirementVersionId: "req-1", rationale: "See src/routes.ts." }], trees, [
        "acme/api:src/routes.ts",
      ]),
    ).toBeNull();
  });
});
