// apps/web/app/api/projects/[projectId]/repos/[repoId]/route.ts
import { handle } from "../../../../../../lib/api/respond";
import { getDb } from "../../../../../../lib/db";
import { requireSession } from "../../../../../../lib/auth/session";
import { detachRepo } from "../../../../../../lib/repos/service";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ projectId: string; repoId: string }> },
) {
  return handle(async () => {
    const { projectId, repoId } = await params;
    const session = await requireSession();
    await detachRepo(getDb(), session, projectId, repoId);
    return new Response(null, { status: 204 });
  });
}
