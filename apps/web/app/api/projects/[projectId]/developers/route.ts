// apps/web/app/api/projects/[projectId]/developers/route.ts
import { handle } from "../../../../../lib/api/respond";
import { getDb } from "../../../../../lib/db";
import { requireSession } from "../../../../../lib/auth/session";
import { listMembers } from "../../../../../lib/projects/members";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  return handle(async () => {
    const { projectId } = await params;
    const session = await requireSession();
    return Response.json(await listMembers(getDb(), session, projectId));
  });
}
