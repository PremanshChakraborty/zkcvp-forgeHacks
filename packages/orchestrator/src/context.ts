/**
 * Runtime dependencies, carried beside the graph state rather than inside it.
 *
 * This is the reason the migration to a real graph was worth doing. The
 * GitHubReadTool holds the developer's live OAuth token in a private field, and
 * a token-bearing object sitting in channel state means the state can never be
 * serialised — no checkpointer, and one careless log line away from writing a
 * credential to disk. LangGraph's own answer is `config.configurable`, so the
 * token now travels next to the run instead of in it, and the state is plain
 * data end to end.
 */
import type { GitHubReadTool } from "@zkcvp/contracts";
import { EvaluationError } from "@zkcvp/contracts";
import type { LangGraphRunnableConfig } from "@langchain/langgraph";

/** The default when the caller names no model. */
export const DEFAULT_MODEL_ID = "gemini-3.5-flash";

export type RunContext = {
  github: GitHubReadTool;
  /** Always concrete — resolved once at entry, never re-defaulted per node. */
  modelId: string;
  deadline?: Date;
};

export function runContext(config: LangGraphRunnableConfig): RunContext {
  const ctx = config.configurable as Partial<RunContext> | undefined;
  if (!ctx?.github || !ctx.modelId) {
    // Only reachable by invoking the graph directly without a context, which
    // is a programming error rather than anything a user can cause.
    throw new EvaluationError(
      "invalid_input",
      "Evaluator graph invoked without a run context",
    );
  }
  return { github: ctx.github, modelId: ctx.modelId, deadline: ctx.deadline };
}

/**
 * Refuse to start work that cannot finish.
 *
 * Called between nodes and before each model call. Being killed mid-write by
 * the host is the one failure mode with no error message attached, so the run
 * ends itself first, with a reason.
 */
export function assertBudget(deadline: Date | undefined): void {
  if (deadline && Date.now() >= deadline.getTime()) {
    throw new EvaluationError(
      "deadline_exceeded",
      "Evaluation budget exhausted",
    );
  }
}
