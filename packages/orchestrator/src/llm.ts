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
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { EvaluationError } from "@zkcvp/contracts";
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
 * `temperature: 0`: two runs over identical evidence should not disagree
 * because of sampling.
 */
export function chatModel(modelId: string): ChatGoogleGenerativeAI {
  return new ChatGoogleGenerativeAI({ model: modelId, temperature: 0 });
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

/**
 * Invoke a model for structured output, retrying transport and repairing
 * semantics, inside the run's remaining budget.
 */
export async function invokeStructured<T>({
  modelId,
  schema,
  prompt,
  deadline,
  signal,
  validate,
}: StructuredCall<T>): Promise<T> {
  let transportAttempts = 0;
  let repairs = 0;
  let rejection: string | null = null;

  for (;;) {
    assertBudget(deadline);

    const text = rejection
      ? `${prompt}\n\n---\nYOUR PREVIOUS RESPONSE WAS REJECTED.\nReason: ${rejection}\nReturn a corrected response that fixes exactly this problem.`
      : prompt;

    let result: T;
    try {
      result = (await chatModel(modelId)
        .withStructuredOutput(schema)
        .invoke(text, { signal })) as T;
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
    if (!problem) return result;

    repairs++;
    if (repairs > MAX_MODEL_REPAIRS) {
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
