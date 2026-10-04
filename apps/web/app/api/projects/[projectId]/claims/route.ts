// apps/web/app/api/projects/[projectId]/claims/route.ts
import { z } from "zod";
import {
  EvaluationError,
  type EvaluationErrorKind,
  type EvaluatorInput,
  type EvidenceBundle,
  type Report,
} from "@zkcvp/contracts";
import { createGitHubReadTool } from "@zkcvp/github/read-tool";
import { LangGraphEvaluator, type EvaluationProgress } from "@zkcvp/orchestrator";
import { encodeFrame, type ClaimFrame } from "../../../../../lib/claims/frames";
import { createClaim, recordEvaluation } from "../../../../../lib/claims/service";
import { errorResponse } from "../../../../../lib/api/respond";
import { parseBody } from "../../../../../lib/api/parse";
import { getDb } from "../../../../../lib/db";
import { requireSession } from "../../../../../lib/auth/session";
import { env } from "../../../../../lib/env";

const submitSchema = z.object({
  requirementVersionIds: z.array(z.uuid()).min(1),
  repos: z
    .array(
      z.object({
        projectRepoId: z.uuid(),
        commitSha: z.string().regex(/^[0-9a-f]{40}$/, "Full 40-character SHA required"),
      }),
    )
    .min(1),
});

/**
 * A failure's status code, carried inside the terminal frame.
 *
 * The response line is already spent by the time a run can fail, so this table
 * populates `failed.status` instead. The rule it serves is unchanged: a rate
 * limit must never be mistakable for a completed evaluation that returned
 * "not satisfied".
 */
const STATUS_BY_KIND: Record<EvaluationErrorKind, number> = {
  unauthorized: 401,
  rate_limited: 429,
  repo_unreachable: 404,
  model_unavailable: 503,
  evidence_incomplete: 422,
  deadline_exceeded: 504,
  invalid_input: 400,
};

/**
 * The one method this route needs off `LangGraphEvaluator`.
 *
 * Injected so tests never run a real LangGraph evaluation — the same shape as
 * `RepoLister` in `lib/repos/service.ts`. Production passes the real
 * evaluator.
 */
export type ClaimEvaluator = {
  evaluateStream(
    input: EvaluatorInput,
  ): AsyncGenerator<EvaluationProgress, { evidence: EvidenceBundle; report: Report }>;
};

/* Not exported: Next.js's generated route typing (`.next/types`) asserts that
 * a route module's only VALUE exports are the recognised handler/config
 * names, and rejects anything else — `ClaimEvaluator` above survives that
 * check only because a type-only export is erased before Next ever sees it. */
const liveEvaluator: ClaimEvaluator = new LangGraphEvaluator();

export async function POST(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> },
  evaluator: ClaimEvaluator = liveEvaluator,
) {
  const db = getDb();

  /* Everything fallible happens here, before a byte of body is written, so
   * each of these keeps a true HTTP status code. `handle()` is not used: it
   * wraps a whole response, and from the next line on there is no response
   * left to replace. */
  let claim: Awaited<ReturnType<typeof createClaim>>;
  let token: string;
  let deadline: Date;
  try {
    const { projectId } = await params;
    const session = await requireSession();
    const body = await parseBody(req, submitSchema);
    claim = await createClaim(db, session, projectId, body);
    if (session.kind !== "developer") throw new Error("unreachable: createClaim asserts developer");
    token = session.githubAccessToken;
    const ceilingSeconds = env().EVAL_CEILING_SECONDS;
    deadline = new Date(Date.now() + ceilingSeconds * 1000);
  } catch (e) {
    return errorResponse(e);
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (frame: ClaimFrame) =>
        controller.enqueue(encoder.encode(encodeFrame(frame)));

      /* Set only once `recordEvaluation` has committed — see the comment below
       * this try block for why that boundary matters. */
      let evaluationId: string;
      try {
        const github = createGitHubReadTool(token, { deadline, signal: req.signal });

        const run = evaluator.evaluateStream({
          claim: { claimId: claim.claimId, repoCommits: claim.repoCommits },
          requirements: claim.requirements,
          github,
          modelId: env().EVAL_MODEL_ID,
          deadline,
          signal: req.signal,
        });

        /* The generator YIELDS progress and RETURNS the artifacts, so the
         * loop is written manually — `for await` discards the return value. */
        let next = await run.next();
        while (!next.done) {
          send({
            t: "progress",
            phase: next.value.node,
            filesRead: next.value.filesGathered,
            round: next.value.iteration,
          });
          next = await run.next();
        }

        const { evidence, report } = next.value;
        await recordEvaluation(db, claim.claimId, { evidence, report });
        evaluationId = report.evaluationId;
      } catch (e) {
        const frame: ClaimFrame =
          e instanceof EvaluationError
            ? {
                t: "failed",
                kind: e.kind,
                status: STATUS_BY_KIND[e.kind],
                message: e.message,
                ...(e.retryAt ? { retryAt: e.retryAt } : {}),
              }
            : {
                t: "failed",
                kind: "model_unavailable",
                status: 500,
                message: "The evaluation could not be completed.",
              };
        /* Closed, not errored: `controller.error()` right after `enqueue()`
         * runs the stream spec's ClearQueue step in the same tick, which
         * discards this very frame before the reader ever sees it — so
         * erroring here would silently throw away the one thing the client
         * needs to tell "rate limited" from "not satisfied".
         *
         * The typed terminal frame IS the protection, not a redundant layer
         * on top of a torn-down connection: a `failed` frame can never be
         * mistaken for a verdict because reading one requires a `done`
         * object, which this branch never sends. Closing cleanly hands the
         * client exactly that frame instead of replacing it with a weaker
         * signal — a destroyed stream that carries no kind, no status, and no
         * retryAt. Two backstops still stand regardless: `decodeFrames`
         * throws on any line that parses but names no known frame type, and a
         * stream that ends without a terminal frame at all is read as a
         * failure, never a verdict. */
        send(frame);
        controller.close();
        return;
      }

      /* The evaluation is committed at this point — the evaluation row, the
       * verdicts, and the requirement-version status writes all landed inside
       * `recordEvaluation`'s transaction, above. Nothing from here on may be
       * reported through the `failed` branch: a `send`/`close` failure here
       * means the transport broke AFTER a real verdict was persisted, not
       * that the evaluation failed. Conflating the two would let a client
       * disconnect at exactly the wrong instant turn a genuine, saved verdict
       * into a false "failed" frame — the same class of bug this file exists
       * to prevent, just on the other side of the write. There is also
       * nothing useful to send the client and nothing to undo: the verdict is
       * safely on disk and reachable at /claims/<claimId> regardless of
       * whether this last frame ever arrives. So it is swallowed, logged for
       * operators, and NOT surfaced as a failure. */
      try {
        send({ t: "done", claimId: claim.claimId, evaluationId });
        controller.close();
      } catch (e) {
        console.error("claim submission: post-commit stream write failed", e);
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson",
      "cache-control": "no-store",
      "x-accel-buffering": "no",
    },
  });
}
