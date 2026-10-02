/**
 * FORMAT node — packages results into EvidenceBundle + Report.
 *
 * 🤖 LLM: NO
 * 📡 GitHub API: NO
 *
 * Produces the two structurally separate output artifacts and runs the
 * code-in-rationale guardrail (Layer 3). Nothing here can fail: by the time a
 * run reaches FORMAT the verdicts have already been checked against the
 * requirement set, so this node packages what it is given.
 */
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import type { EvidenceBundle, Report } from "@zkcvp/contracts";

import { runContext } from "../context";
import { containsCode } from "../guardrails/code-detector";
import type { EvaluatorState, EvaluatorUpdate } from "../state";

const PROMPT_TEMPLATE_VERSION = "v2";

export type FormatResult = {
  evidence: EvidenceBundle;
  report: Report;
};

export function buildArtifacts(
  state: EvaluatorState,
  modelId: string,
): FormatResult {
  const { evaluationId, claimId, toolCallLog, verdicts } = state;

  // Guardrail Layer 3: validate no code in rationale.
  const sanitizedVerdicts = verdicts.map((v) => {
    if (containsCode(v.rationale)) {
      return {
        ...v,
        rationale:
          "[Rationale redacted — contained source code. " +
          "The requirement was evaluated as: " +
          v.verdict +
          "]",
      };
    }
    return v;
  });

  // Build EvidenceBundle (private — never shown to stakeholder).
  const evidence: EvidenceBundle = {
    evaluationId,
    claimId,
    toolCallLog,
    planReasoning: state.planReasoning,
    droppedPaths: state.droppedPaths,
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
  const { modelId } = runContext(config);
  return buildArtifacts(state, modelId);
}
