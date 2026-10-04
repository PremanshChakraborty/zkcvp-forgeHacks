// apps/web/app/api/projects/[projectId]/repos/[repoId]/commits/route.ts
import { handle } from "../../../../../../../lib/api/respond";
import { getDb } from "../../../../../../../lib/db";
import { requireSession } from "../../../../../../../lib/auth/session";
import { listRepoCommits } from "../../../../../../../lib/repos/service";
import { invalidBody } from "../../../../../../../lib/api/errors";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ projectId: string; repoId: string }> },
) {
  return handle(async () => {
    const { projectId, repoId } = await params;
    const session = await requireSession();

    const ref = new URL(req.url).searchParams.get("ref");
    if (!ref) throw invalidBody({ ref: "Required" });

    const commits = await listRepoCommits(getDb(), session, projectId, repoId, ref);
    return Response.json({ commits });
  });
}
