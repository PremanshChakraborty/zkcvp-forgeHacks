// apps/web/app/api/projects/[projectId]/repos/route.ts
import { z } from "zod";
import { handle } from "../../../../../lib/api/respond";
import { parseBody } from "../../../../../lib/api/parse";
import { getDb } from "../../../../../lib/db";
import { requireSession } from "../../../../../lib/auth/session";
import { attachRepo, listAttachedRepos } from "../../../../../lib/repos/service";

const attachSchema = z.object({
  githubRepoId: z.string().trim().min(1, "Required"),
  fullName: z.string().trim().min(1, "Required"),
});

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  return handle(async () => {
    const { projectId } = await params;
    const session = await requireSession();
    const repos = await listAttachedRepos(getDb(), session, projectId);
    return Response.json({ repos });
  });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  return handle(async () => {
    const { projectId } = await params;
    const session = await requireSession();
    const body = await parseBody(req, attachSchema);
    const repo = await attachRepo(getDb(), session, projectId, body);
    return Response.json({ repo }, { status: 201 });
  });
}
