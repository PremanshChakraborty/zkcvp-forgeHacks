import { describe, expect, it } from "vitest";
import { EvaluationError } from "@zkcvp/contracts";

import { LangGraphEvaluator } from "../src/evaluator";
import { EvaluatorAnnotation } from "../src/state";

/**
 * The graph is constructed at module scope, so a topology mistake throws on
 * import rather than on the first evaluation. That is cheap to catch here and
 * expensive to catch anywhere else: `tsc` cannot see it, and every other test
 * in this package imports the leaf modules rather than the graph.
 *
 * These need no credentials — the run never starts.
 */
describe("graph construction", () => {
  it("compiles", () => {
    // Importing this module already built and compiled the StateGraph. Reaching
    // this line is the assertion; the instantiation guards against the export
    // being dropped.
    expect(new LangGraphEvaluator()).toBeInstanceOf(LangGraphEvaluator);
  });

  it("gives no channel the same name as a node", () => {
    // LangGraph rejects the collision at build time. Naming a channel after the
    // node that fills it is the natural mistake, so it is asserted rather than
    // left to the next person to rediscover.
    const nodeNames = ["plan", "gather", "analyze", "format"];
    const channels = Object.keys(EvaluatorAnnotation.spec);
    expect(channels.filter((c) => nodeNames.includes(c))).toEqual([]);
  });
});

describe("input validation", () => {
  const github = {} as never;
  const requirement = {
    requirementVersionId: "req-1",
    title: "A",
    description: "a",
  };

  it("rejects two commits of the same repo before any work starts", async () => {
    await expect(
      new LangGraphEvaluator().evaluate({
        claim: {
          claimId: "c1",
          repoCommits: [
            { repo: "acme/web", commitSha: "a".repeat(40) },
            { repo: "acme/web", commitSha: "b".repeat(40) },
          ],
        },
        requirements: [requirement],
        github,
      }),
    ).rejects.toThrowError(EvaluationError);
  });

  it("rejects a claim with no requirements", async () => {
    await expect(
      new LangGraphEvaluator().evaluate({
        claim: {
          claimId: "c1",
          repoCommits: [{ repo: "acme/web", commitSha: "a".repeat(40) }],
        },
        requirements: [],
        github,
      }),
    ).rejects.toThrowError(EvaluationError);
  });
});
