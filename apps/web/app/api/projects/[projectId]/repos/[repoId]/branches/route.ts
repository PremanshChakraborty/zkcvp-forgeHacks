// apps/web/app/api/projects/[projectId]/repos/[repoId]/branches/route.ts
import { handle } from "../../../../../../../lib/api/respond";
import { getDb } from "../../../../../../../lib/db";
import { requireSession } from "../../../../../../../lib/auth/session";
import { listRepoBranches } from "../../../../../../../lib/repos/service";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ projectId: string; repoId: string }> },
) {
  return handle(async () => {
    const { projectId, repoId } = await params;
    const session = await requireSession();
    const branches = await listRepoBranches(getDb(), session, projectId, repoId);
    return Response.json({ branches });
  });
}
