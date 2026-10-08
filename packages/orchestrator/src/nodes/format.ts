/**
 * FORMAT node — packages results into EvidenceBundle + Report.
 *
 * 🤖 LLM: NO
 * 📡 GitHub API: NO
 *
 * Produces the two structurally separate output artifacts and runs the two
 * deterministic rationale guardrails: no source code (Layer 3), and no
 * citation of a file the run never read. Nothing here can fail: by the time a
 * run reaches FORMAT the verdicts have already been checked against the
 * requirement set, so this node packages what it is given.
 */
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import type { EvidenceBundle, Report, RunTrace } from "@zkcvp/contracts";

import { runContext } from "../context";
import { containsCode } from "../guardrails/code-detector";
import { ungroundedCitations } from "../guardrails/grounding";
import { addUsage } from "../llm";
import type { EvaluatorState, EvaluatorUpdate } from "../state";

/**
 * v3: repo content fenced as untrusted with a per-prompt nonce, judging rules
 * in the system message, truncation stated in block headers with continuation
 * reads, and the grounding rule. Bump on any prompt change so a stored verdict
 * stays tied to the prompt that produced it.
 */
export const PROMPT_TEMPLATE_VERSION = "v3";

export type FormatResult = {
  evidence: EvidenceBundle;
  report: Report;
};

export function buildArtifacts(
  state: EvaluatorState,
  modelId: string,
  startedAt: number = Date.now(),
): FormatResult {
  const { evaluationId, claimId, toolCallLog, verdicts } = state;
  const redactions: RunTrace["redactions"] = [];

  // Guardrail Layer 3: validate no code in rationale.
  const sanitizedVerdicts = verdicts.map((v) => {
    if (containsCode(v.rationale)) {
      redactions.push({ requirementVersionId: v.requirementVersionId, reason: "code" });
      return {
        ...v,
        rationale:
          "[Rationale redacted — contained source code. " +
          "The requirement was evaluated as: " +
          v.verdict +
          "]",
      };
    }

    // Backstop for the grounding repair ANALYZE already asked for once. Same
    // policy as the code guardrail, for the same reason: the verdict stands,
    // and a rationale we know to be wrong is replaced whole rather than
    // edited. The offending citations go to the trace, not the report — the
    // report would otherwise repeat the very claim being withheld.
    const ungrounded = ungroundedCitations(v.rationale, state.trees, Object.keys(state.gatheredFiles));
    if (ungrounded.length > 0) {
      redactions.push({
        requirementVersionId: v.requirementVersionId,
        reason: "ungrounded_citation",
        detail: ungrounded.map((u) => `${u.citation} (${u.reason})`).join(", "),
      });
      return {
        ...v,
        rationale:
          "[Rationale withheld — it referred to files the evaluator did not read. " +
          "The requirement was evaluated as: " +
          v.verdict +
          "]",
      };
    }
    return v;
  });

  const trace: RunTrace = {
    nodes: [
      ...state.traceNodes,
      {
        node: "format",
        round: state.iterationCount,
        startedAt: new Date(startedAt).toISOString(),
        durationMs: Date.now() - startedAt,
      },
    ],
    modelCalls: state.traceModelCalls,
    filesReadPerRound: state.filesReadPerRound,
    rounds: state.iterationCount,
    // Only null if ANALYZE never ran, which the graph's edges rule out.
    stopReason: state.stopReason ?? "sufficient",
    redactions,
    totalUsage: state.traceModelCalls
      .map((c) => c.usage)
      .reduce(addUsage, { inputTokens: 0, outputTokens: 0, totalTokens: 0 }),
  };

  // Build EvidenceBundle (private — never shown to stakeholder).
  const evidence: EvidenceBundle = {
    evaluationId,
    claimId,
    toolCallLog,
    planReasoning: state.planReasoning,
    droppedPaths: state.droppedPaths,
    trace,
  };

  // Build Report (public — shown to stakeholder immediately).
  const report: Report = {
    evaluationId,
    claimId,
    modelId,
    promptTemplateVersion: PROMPT_TEMPLATE_VERSION,
    createdAt: new Date().toISOString(),
    perRequirement: sanitizedVerdicts.map((v) => ({
      requirementVersionId: v.requirementVersionId,
      verdict: v.verdict,
      rationale: v.rationale,
    })),
  };

  return { evidence, report };
}

/**
 * Graph node wrapper — writes both artifacts into terminal channels.
 *
 * They live in state rather than being assembled after the run so that a
 * streaming consumer sees FORMAT complete like any other node, and so the
 * finished artifacts are part of the snapshot a checkpointer would capture.
 */
export function formatNode(
  state: EvaluatorState,
  config: LangGraphRunnableConfig,
): EvaluatorUpdate {
  // Resolving the context here keeps `Report.modelId` honest: it names the
  // model the run actually used, not a constant re-defaulted at the last step.
  const startedAt = Date.now();
  const { modelId } = runContext(config);
  return buildArtifacts(state, modelId, startedAt);
}
