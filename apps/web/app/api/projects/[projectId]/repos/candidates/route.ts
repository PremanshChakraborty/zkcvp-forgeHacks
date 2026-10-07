// apps/web/app/api/projects/[projectId]/repos/candidates/route.ts
import { handle } from "../../../../../../lib/api/respond";
import { getDb } from "../../../../../../lib/db";
import { requireSession } from "../../../../../../lib/auth/session";
import { listCandidateRepos } from "../../../../../../lib/repos/service";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  return handle(async () => {
    const { projectId } = await params;
    const session = await requireSession();
    const repos = await listCandidateRepos(getDb(), session, projectId);
    return Response.json({ repos });
  });
}
