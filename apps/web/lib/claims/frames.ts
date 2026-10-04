import type { EvaluationErrorKind } from "@zkcvp/contracts";

/** The Evaluator's graph nodes, in the order a run first reaches them. */
export type ClaimPhase = "plan" | "gather" | "analyze" | "format";

/**
 * The wire protocol for a claim submission.
 *
 * Streaming spends the HTTP status code before the outcome is known, so the
 * terminal FRAME carries the outcome instead of the status line:
 *
 *     A verdict is a `done` frame. A failure is a `failed` frame.
 *     Never both, never neither.
 *
 * `done` and `failed` are structurally different objects, which is what makes
 * an infrastructure failure impossible to read as a completed evaluation that
 * returned "not satisfied". `failed.status` carries the code the response
 * would have had, so a client can still treat a rate limit as a rate limit.
 */
export type ClaimFrame =
  | { t: "progress"; phase: ClaimPhase; filesRead: number; round: number }
  | { t: "done"; claimId: string; evaluationId: string }
  | {
      t: "failed";
      kind: EvaluationErrorKind;
      status: number;
      message: string;
      retryAt?: string;
    };

export function encodeFrame(frame: ClaimFrame): string {
  return JSON.stringify(frame) + "\n";
}

/**
 * Reads whole frames out of a buffer, returning the unterminated tail.
 *
 * A network chunk can split a line anywhere, so the caller keeps `rest` and
 * prepends it to the next chunk. Parsing eagerly on chunk boundaries would
 * throw on a half-written frame roughly whenever a run got interesting.
 *
 * Throws on malformed JSON or structurally invalid frames (lines that parse
 * but do not match a known frame type). Loud failure is deliberate: a partial
 * or corrupt stream must never be mistakable for a completed one. The invariant
 * that "a verdict is `done`, a failure is `failed`, never both, never neither"
 * depends on it.
 */
export function decodeFrames(buffer: string): {
  frames: ClaimFrame[];
  rest: string;
} {
  const lines = buffer.split("\n");
  const rest = lines.pop() ?? "";
  const frames = lines
    .filter((line) => line.trim() !== "")
    .map((line) => {
      const parsed = JSON.parse(line);
      if (
        !parsed ||
        typeof parsed !== "object" ||
        !("t" in parsed) ||
        !["progress", "done", "failed"].includes(parsed.t)
      ) {
        throw new Error(
          `Invalid frame structure: ${JSON.stringify(parsed)}. Expected t to be one of "progress", "done", "failed".`,
        );
      }
      return parsed as ClaimFrame;
    });
  return { frames, rest };
}

export function isTerminal(
  frame: ClaimFrame,
): frame is Extract<ClaimFrame, { t: "done" | "failed" }> {
  return frame.t === "done" || frame.t === "failed";
}
