/**
 * TEST-ONLY evaluation endpoint.
 *
 * Accepts requirements directly in the request body (since M4 isn't built yet)
 * and runs the full evaluator pipeline using the developer's session token.
 *
 * This is the glue between:
 *   - Session auth (requireDeveloper → githubAccessToken)
 *   - GitHubReadTool (token sealed inside)
 *   - LangGraphEvaluator (reads code, produces verdicts)
 *
 * In production, this will become POST /api/claims with requirements read
 * from DB and results stored. For now it's a pass-through for testing.
 *
 * Auth: developer member only (needs GitHub token in session)
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { createGitHubReadTool } from "@zkcvp/github/read-tool";
import { LangGraphEvaluator } from "@zkcvp/orchestrator";
import { requireDeveloper, SessionError } from "../../../lib/auth/session";

const RequestSchema = z.object({
  repoCommits: z
    .array(
      z.object({
        repo: z.string().min(1),
        commitSha: z.string().min(7),
      }),
    )
    .min(1),
  requirements: z
    .array(
      z.object({
        title: z.string().min(1),
        description: z.string().min(1),
      }),
    )
    .min(1),
});

export async function POST(request: Request) {
  // 1. Auth — get the developer's GitHub token from the session
  let session;
  try {
    session = await requireDeveloper();
  } catch (err: unknown) {
    if (err instanceof SessionError) {
      return NextResponse.json(
        { error: err.message },
        { status: err.status },
      );
    }
    throw err;
  }

  // 2. Parse and validate request body
  let body;
  try {
    const raw = await request.json();
    body = RequestSchema.parse(raw);
  } catch (err: unknown) {
    return NextResponse.json(
      { error: "Invalid request body", details: String(err) },
      { status: 400 },
    );
  }

  // 3. Build the GitHubReadTool (token sealed inside — LLM never sees it)
  const github = createGitHubReadTool(session.githubAccessToken);

  // 4. Build evaluator input
  //    In production: requirements come from DB, claimId from a new claims row.
  //    Here: requirements come from body, claimId is generated.
  const claimId = `test-${Date.now()}`;
  const requirements = body.requirements.map((r, i) => ({
    requirementVersionId: `test-req-${i + 1}`,
    title: r.title,
    description: r.description,
  }));

  // 5. Run the evaluator
  const evaluator = new LangGraphEvaluator();
  let result;
  try {
    result = await evaluator.evaluate({
      claim: { claimId, repoCommits: body.repoCommits },
      requirements,
      github,
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Evaluation failed", details: String(err) },
      { status: 500 },
    );
  }

  // 6. Return both artifacts
  //    In production: evidence goes to DB (never exposed), report goes to response.
  //    Here: return both for debugging.
  return NextResponse.json({
    report: result.report,
    _debug: {
      evidenceToolCallCount: result.evidence.toolCallLog.length,
      evaluationId: result.evidence.evaluationId,
    },
  });
}
