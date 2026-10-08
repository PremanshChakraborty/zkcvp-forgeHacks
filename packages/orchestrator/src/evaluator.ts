/**
 * LangGraph Evaluator — the real implementation.
 *
 * Graph: PLAN → GATHER → ANALYZE →(loop?)→ GATHER → ... → FORMAT → END
 *
 * Two nodes use the LLM (PLAN, ANALYZE). Two don't (GATHER, FORMAT).
 * The GitHubReadTool arrives via EvaluatorInput and is handed to the run as
 * context rather than as state, so the token never enters a channel.
 */
import crypto from "node:crypto";
import {
  END,
  START,
  StateGraph,
  type LangGraphRunnableConfig,
} from "@langchain/langgraph";
import type {
  Evaluator,
  EvaluatorInput,
  EvidenceBundle,
  Report,
} from "@zkcvp/contracts";
import { EvaluationError } from "@zkcvp/contracts";

import { DEFAULT_MODEL_ID, type RunContext } from "./context";
import { RECURSION_LIMIT } from "./limits";
import { analyzeNode } from "./nodes/analyze";
import { formatNode } from "./nodes/format";
import { gatherNode } from "./nodes/gather";
import { planNode } from "./nodes/plan";
import {
  EvaluatorAnnotation,
  type EvaluatorState,
  type EvaluatorUpdate,
} from "./state";
import { assertOneCommitPerRepo } from "./validation";

type Node = (
  state: EvaluatorState,
  config: LangGraphRunnableConfig,
) => Promise<EvaluatorUpdate>;

/**
 * Records the node's wall time into the trace.
 *
 * Only completed nodes are recorded: a node that throws ends the run, and a
 * failed run produces no evidence for a trace to live in. FORMAT times itself,
 * since the trace is assembled inside it.
 */
function timed(node: "plan" | "gather" | "analyze", fn: Node): Node {
  return async (state, config) => {
    const started = Date.now();
    const update = await fn(state, config);
    // GATHER opens a round (it increments the counter), so it runs in the
    // round after the one the state names; ANALYZE runs in the round GATHER
    // just opened.
    const round = node === "plan" ? 0 : node === "gather" ? state.iterationCount + 1 : state.iterationCount;
    return {
      ...update,
      traceNodes: [
        {
          node,
          round,
          startedAt: new Date(started).toISOString(),
          durationMs: Date.now() - started,
        },
      ],
    };
  };
}

/**
 * The compiled graph.
 *
 * Built once at module scope: compilation is pure, and rebuilding it per
 * request would allocate the whole topology on every claim submission.
 */
const graph = new StateGraph(EvaluatorAnnotation)
  .addNode("plan", timed("plan", planNode))
  .addNode("gather", timed("gather", gatherNode))
  .addNode("analyze", timed("analyze", analyzeNode))
  .addNode("format", formatNode)
  .addEdge(START, "plan")
  .addEdge("plan", "gather")
  .addEdge("gather", "analyze")
  .addConditionalEdges(
    "analyze",
    // The iteration cap is enforced inside ANALYZE, which clears the flag it
    // would otherwise route on — so the cap cannot be talked past here either.
    (state: EvaluatorState) => (state.needsMoreEvidence ? "gather" : "format"),
    { gather: "gather", format: "format" },
  )
  .addEdge("format", END)
  .compile();

/** The graph's nodes, in one place so the router and the stream agree. */
const NODE_NAMES = ["plan", "gather", "analyze", "format"] as const;
type NodeName = (typeof NODE_NAMES)[number];

function isNodeName(value: string): value is NodeName {
  return (NODE_NAMES as readonly string[]).includes(value);
}

/** Progress event for a caller that wants to show the run happening. */
export type EvaluationProgress = {
  node: NodeName;
  /** Files read so far, across every round. */
  filesGathered: number;
  /** Completed GATHER↔ANALYZE rounds. */
  iteration: number;
};

function initialState(
  input: EvaluatorInput,
  evaluationId: string,
): Partial<EvaluatorState> {
  return {
    claimId: input.claim.claimId,
    evaluationId,
    repoCommits: input.claim.repoCommits,
    requirements: input.requirements,
  };
}

function buildContext(input: EvaluatorInput): RunContext {
  return {
    github: input.github,
    modelId: input.modelId ?? DEFAULT_MODEL_ID,
    deadline: input.deadline,
  };
}

function runConfig(context: RunContext, signal?: AbortSignal) {
  return {
    configurable: context,
    recursionLimit: RECURSION_LIMIT,
    signal,
  };
}

/**
 * Both artifacts, or an error. Never a partial Report — see EvaluationError.
 */
function harvest(state: EvaluatorState): {
  evidence: EvidenceBundle;
  report: Report;
} {
  if (!state.evidence || !state.report) {
    throw new EvaluationError(
      "model_unavailable",
      "The evaluation graph finished without producing a report",
    );
  }
  return { evidence: state.evidence, report: state.report };
}

/**
 * The production Evaluator.
 *
 * The route handler that calls it stays a thin adapter (docs/architecture.md):
 * moving between a serverless host and a long-lived Node host changes where
 * this is invoked from, not what it is.
 */
export class LangGraphEvaluator implements Evaluator {
  async evaluate(
    input: EvaluatorInput,
  ): Promise<{ evidence: EvidenceBundle; report: Report }> {
    assertOneCommitPerRepo(input.claim.repoCommits);
    if (input.requirements.length === 0) {
      throw new EvaluationError(
        "invalid_input",
        "A claim must name at least one requirement",
      );
    }

    const evaluationId = crypto.randomUUID();
    const context = buildContext(input);

    const final = (await graph.invoke(
      initialState(input, evaluationId),
      runConfig(context, input.signal),
    )) as EvaluatorState;

    return harvest(final);
  }

  /**
   * The same run, reporting each node as it completes.
   *
   * Exists because the wait is minutes long and otherwise invisible. It streams
   * PROGRESS, not results: the artifacts arrive once, at the end, from the same
   * all-or-nothing rule that governs `evaluate()`.
   */
  async *evaluateStream(
    input: EvaluatorInput,
  ): AsyncGenerator<
    EvaluationProgress,
    { evidence: EvidenceBundle; report: Report }
  > {
    assertOneCommitPerRepo(input.claim.repoCommits);
    if (input.requirements.length === 0) {
      throw new EvaluationError(
        "invalid_input",
        "A claim must name at least one requirement",
      );
    }

    const evaluationId = crypto.randomUUID();
    const context = buildContext(input);

    let latest: EvaluatorState | null = null;
    let filesGathered = 0;
    let iteration = 0;

    // Two modes on purpose. `updates` names the node that just finished —
    // LangGraph keys the chunk by node, so there is no need to infer it from
    // the state, which cannot tell "before PLAN ran" from "after PLAN ran".
    // `values` carries the full state, which is what the artifacts come from.
    const stream = await graph.stream(initialState(input, evaluationId), {
      ...runConfig(context, input.signal),
      streamMode: ["updates", "values"],
    });

    for await (const [mode, chunk] of stream) {
      if (mode === "values") {
        latest = chunk as EvaluatorState;
        continue;
      }

      for (const [name, update] of Object.entries(
        chunk as Record<string, EvaluatorUpdate>,
      )) {
        if (!isNodeName(name)) continue; // skip LangGraph's own markers

        // Counted from the updates themselves rather than read off `values`,
        // so progress does not depend on how the two modes interleave.
        if (update.gatheredFiles) {
          filesGathered += Object.keys(update.gatheredFiles).length;
        }
        if (typeof update.iterationCount === "number") {
          iteration = update.iterationCount;
        }

        yield { node: name, filesGathered, iteration };
      }
    }

    if (!latest) {
      throw new EvaluationError(
        "model_unavailable",
        "The evaluation graph produced no state",
      );
    }
    return harvest(latest);
  }
}
