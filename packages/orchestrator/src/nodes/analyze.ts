/**
 * ANALYZE node — evaluates each requirement against gathered evidence.
 *
 * 🤖 LLM: YES (reads evidence, produces verdict + rationale per requirement)
 * 📡 GitHub API: NO
 *
 * The node now sees the FILE TREE as well as the file contents. It used to see
 * only the contents, which made `additionalFilesNeeded` a guess assembled from
 * import statements — and every bad guess came back as error text in the next
 * prompt. Giving it the tree is what makes the loop-back worth having.
 */
import { z } from "zod";
import type { LangGraphRunnableConfig } from "@langchain/langgraph";

import { assertBudget, runContext } from "../context";
import { invokeStructured } from "../llm";
import { MAX_ITERATIONS, MAX_PLANNED_FILES } from "../limits";
import {
  fileKey,
  type EvaluatorState,
  type EvaluatorUpdate,
} from "../state";
import { resolveFiles, verdictProblem } from "../validation";

const RequirementVerdictSchema = z.object({
  requirementVersionId: z.string(),
  verdict: z.enum(["satisfied", "not_satisfied"]),
  rationale: z.string().describe(
    "Natural language explanation. Reference file paths and line ranges only. NEVER include verbatim source code, function signatures, variable names, or code snippets.",
  ),
});

const AnalysisOutputSchema = z.object({
  verdicts: z.array(RequirementVerdictSchema),
  needsMoreEvidence: z.boolean().describe(
    "True only if you genuinely cannot make a determination with the current evidence",
  ),
  additionalFilesNeeded: z
    .array(
      z.object({
        repo: z.string().describe("Repository the file belongs to"),
        path: z.string().describe("Repo-relative path, taken from the FILE TREE"),
      }),
    )
    .describe(
      "Files to read if needsMoreEvidence is true. Empty otherwise. Paths must appear in the FILE TREE.",
    ),
});

/** Files already read, so the model is not invited to ask for them again. */
function renderEvidence(state: EvaluatorState): string {
  return Object.values(state.gatheredFiles)
    .map((f) => `=== ${f.repo}:${f.path} ===\n${f.content}`)
    .join("\n\n");
}

/** The unread remainder of each tree — the actual menu for a follow-up read. */
function renderAvailable(state: EvaluatorState): string {
  const blocks: string[] = [];
  for (const [repo, tree] of Object.entries(state.trees)) {
    const unread = tree.entries
      .filter(
        (e) =>
          e.type === "file" && !state.gatheredFiles[fileKey({ repo, path: e.path })],
      )
      .map((e) => `  ${e.path}`);
    if (unread.length === 0) continue;
    blocks.push(
      `${repo} (not yet read):\n${unread.join("\n")}${
        tree.truncated ? "\n  [listing truncated by GitHub]" : ""
      }`,
    );
  }
  return blocks.join("\n\n");
}

export async function analyzeNode(
  state: EvaluatorState,
  config: LangGraphRunnableConfig,
): Promise<EvaluatorUpdate> {
  const { modelId, deadline } = runContext(config);
  assertBudget(deadline);

  const requirementsList = state.requirements
    .map(
      (r) =>
        `- ID: ${r.requirementVersionId}\n  Title: ${r.title}\n  Description: ${r.description}`,
    )
    .join("\n\n");

  const forceDecision = state.iterationCount >= MAX_ITERATIONS;
  const available = renderAvailable(state);

  const prompt = `You are a code evaluator. Your job is to determine whether gathered source code evidence satisfies each requirement.

REQUIREMENTS:
${requirementsList}

EVIDENCE (file contents already read from the repository):
${renderEvidence(state)}

FILE TREE (files that exist but have NOT been read yet — request from this list only):
${available || "  (every file has been read)"}

RULES:
1. Evaluate EACH requirement independently. Return a separate verdict for each, using the exact IDs above.
2. Verdict must be exactly "satisfied" or "not_satisfied".
3. Your rationale MUST be in natural language ONLY. You may reference file paths (e.g. "src/auth.ts, lines 15-30") but NEVER paste, quote, or reproduce any actual source code, variable names, function signatures, import statements, or code snippets of any kind.
4. ${forceDecision ? "You MUST make a final decision now. Set needsMoreEvidence to false." : `If you genuinely cannot determine a verdict with the current evidence, set needsMoreEvidence to true and list up to ${MAX_PLANNED_FILES} specific files from the FILE TREE above. Do not invent paths.`}
5. A file shown as [FILE NOT FOUND] is evidence that it does not exist at the claimed commit — treat its absence as a finding, not as a reason to ask again.
6. Be rigorous but fair. A requirement is "satisfied" if the code demonstrates a reasonable implementation of what's described, not necessarily a perfect one.`;

  const result = await invokeStructured({
    modelId,
    schema: AnalysisOutputSchema,
    prompt,
    deadline,
    signal: config.signal,
    validate: (value) => verdictProblem(value.verdicts, state.requirements),
  });

  const modelCall = {
    node: "analyze" as const,
    round: state.iterationCount,
    attempts: result.attempts,
    repairs: result.repairs,
    usage: result.usage,
  };

  if (forceDecision) {
    return {
      verdicts: result.value.verdicts,
      needsMoreEvidence: false,
      additionalFilesNeeded: [],
      stopReason: "iteration_cap",
      traceModelCalls: [modelCall],
    };
  }

  const alreadyRead = new Set(Object.keys(state.gatheredFiles));
  const { accepted } = resolveFiles(result.value.additionalFilesNeeded, state.trees, {
    exclude: alreadyRead,
  });

  // Asking for more but naming nothing readable is not a reason to loop — the
  // next GATHER would be a no-op and the next ANALYZE would see the same
  // evidence, so the loop would spin until the cap with no new information.
  const shouldLoop = result.value.needsMoreEvidence && accepted.length > 0;

  return {
    verdicts: result.value.verdicts,
    needsMoreEvidence: shouldLoop,
    additionalFilesNeeded: shouldLoop ? accepted : [],
    stopReason: shouldLoop
      ? null
      : result.value.needsMoreEvidence
        ? "no_readable_files"
        : "sufficient",
    traceModelCalls: [modelCall],
  };
}
