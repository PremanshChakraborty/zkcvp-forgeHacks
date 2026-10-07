// apps/web/app/api/projects/[projectId]/route.ts
import { handle } from "../../../../lib/api/respond";
import { getDb } from "../../../../lib/db";
import { requireSession } from "../../../../lib/auth/session";
import { getProject } from "../../../../lib/projects/service";

/* Next 15 hands `params` over as a Promise. Destructuring it without awaiting
 * yields undefined at runtime and no type error until the await is added. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  return handle(async () => {
    const { projectId } = await params;
    const session = await requireSession();
    const project = await getProject(getDb(), session, projectId);
    return Response.json({ project });
  });
}
