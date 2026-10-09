/**
 * Model access, with the two retry shapes the Evaluator needs.
 *
 * They are not the same thing and must not share a budget:
 *
 * - **Transport retry** — the provider was unreachable, rate-limited, or timed
 *   out. Nothing about the request was wrong, so the same request is sent
 *   again after a backoff. Structured-output parse failures land here too:
 *   LangChain surfaces them as throws, and a blind retry at temperature 0 is a
 *   reasonable first response to one.
 * - **Repair** — the call succeeded and the output was well-formed but wrong:
 *   verdicts missing a requirement, an ID that does not exist. Sending the same
 *   prompt again would produce the same answer, so the rejection reason is fed
 *   back and the model is asked to correct it.
 */
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { ChatVertexAI } from "@langchain/google-vertexai";
import { EvaluationError, type ModelUsage } from "@zkcvp/contracts";
import type { z } from "zod";

import { assertBudget } from "./context";
import { MAX_MODEL_ATTEMPTS, MAX_MODEL_REPAIRS } from "./limits";

/**
 * The chat model for a run.
 *
 * Gemini only, deliberately. The model *id* is configuration (EVAL_MODEL_ID,
 * read at the route and passed in via EvaluatorInput) so a run stays
 * attributable and the model can be changed without a deploy; the *provider* is
 * not, because nothing here needs a second one and routing between providers
 * bought complexity no caller had asked for.
 *
 * Served by Vertex AI in express mode: GOOGLE_API_KEY, read by LangChain
 * directly, is a Vertex API key, which bills the Cloud project it belongs to.
 * ChatVertexAI pins the Vertex endpoint, so an AI Studio key fails loudly
 * instead of quietly routing to the free tier.
 *
 * `temperature: 0`: two runs over identical evidence should not disagree
 * because of sampling.
 */
export function chatModel(modelId: string): ChatVertexAI {
  return new ChatVertexAI({ model: modelId, temperature: 0 });
}

const BASE_BACKOFF_MS = 400;
const MAX_BACKOFF_MS = 4_000;

function backoffMs(attempt: number): number {
  const ceiling = Math.min(BASE_BACKOFF_MS * 2 ** attempt, MAX_BACKOFF_MS);
  return Math.round(ceiling * (0.5 + Math.random() * 0.5));
}

export type StructuredCall<T> = {
  modelId: string;
  schema: z.ZodType<T>;
  /**
   * Trusted instructions, sent as the system message. Kept apart from `prompt`
   * so nothing a repo contains can sit in the same message as the rules for
   * judging it.
   */
  system?: string;
  /** The data to work on: requirements, fenced repo content. */
  prompt: string;
  deadline?: Date;
  signal?: AbortSignal;
  /**
   * Semantic check the schema cannot express. Return null to accept, or a
   * sentence naming the problem — it is shown to the model verbatim, so write
   * it as an instruction ("you returned 2 verdicts for 3 requirements; the
   * missing one is X"), not as a log line.
   */
  validate?: (value: T) => string | null;
};

/** A structured result, plus what it cost to get — for the run trace. */
export type StructuredResult<T> = {
  value: T;
  /** Every model call made, accepted or not. */
  attempts: number;
  /** Each repair instruction sent, in order. */
  repairs: string[];
  usage: ModelUsage;
};

function emptyUsage(): ModelUsage {
  return { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
}

/** Usage off a raw AIMessage. Missing metadata counts as zero, not a failure. */
function usageOf(raw: unknown): ModelUsage {
  const meta = (raw as { usage_metadata?: Record<string, number> } | null)
    ?.usage_metadata;
  return {
    inputTokens: meta?.input_tokens ?? 0,
    outputTokens: meta?.output_tokens ?? 0,
    totalTokens: meta?.total_tokens ?? 0,
  };
}

export function addUsage(a: ModelUsage, b: ModelUsage): ModelUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    totalTokens: a.totalTokens + b.totalTokens,
  };
}

/**
 * Invoke a model for structured output, retrying transport and repairing
 * semantics, inside the run's remaining budget.
 */
export async function invokeStructured<T>({
  modelId,
  schema,
  system,
  prompt,
  deadline,
  signal,
  validate,
}: StructuredCall<T>): Promise<StructuredResult<T>> {
  let transportAttempts = 0;
  let calls = 0;
  const repairs: string[] = [];
  let usage = emptyUsage();
  let rejection: string | null = null;

  for (;;) {
    assertBudget(deadline);

    const text = rejection
      ? `${prompt}\n\n---\nYOUR PREVIOUS RESPONSE WAS REJECTED.\nReason: ${rejection}\nReturn a corrected response that fixes exactly this problem.`
      : prompt;

    let result: T;
    try {
      calls++;
      // `includeRaw` is what carries token usage back; without it the
      // AIMessage is parsed and dropped. It also turns a parse failure into
      // `parsed: null` instead of a throw, so that case is re-thrown here to
      // keep it on the transport-retry path it has always been on.
      const out = (await chatModel(modelId)
        .withStructuredOutput(schema, { includeRaw: true })
        .invoke(
          system ? [new SystemMessage(system), new HumanMessage(text)] : text,
          { signal },
        )) as { raw: unknown; parsed: T | null };
      usage = addUsage(usage, usageOf(out.raw));
      if (out.parsed === null || out.parsed === undefined) {
        throw new Error("Model response did not parse against the output schema");
      }
      result = out.parsed;
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") throw err;

      transportAttempts++;
      if (transportAttempts >= MAX_MODEL_ATTEMPTS) {
        throw new EvaluationError(
          "model_unavailable",
          `Model call failed after ${MAX_MODEL_ATTEMPTS} attempts: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }

      const delay = backoffMs(transportAttempts - 1);
      if (deadline && Date.now() + delay >= deadline.getTime()) {
        throw new EvaluationError(
          "deadline_exceeded",
          "Model retry would not finish inside the evaluation budget",
        );
      }
      await new Promise((resolve) => setTimeout(resolve, delay));
      continue;
    }

    const problem = validate?.(result) ?? null;
    if (!problem) return { value: result, attempts: calls, repairs, usage };

    repairs.push(problem);
    if (repairs.length > MAX_MODEL_REPAIRS) {
      // A model that cannot satisfy the contract after being told twice is not
      // going to on the third try, and a Report built on output we know to be
      // wrong is worse than no Report.
      throw new EvaluationError(
        "model_unavailable",
        `Model output failed validation after ${MAX_MODEL_REPAIRS} repair attempts: ${problem}`,
      );
    }
    rejection = problem;
  }
}
