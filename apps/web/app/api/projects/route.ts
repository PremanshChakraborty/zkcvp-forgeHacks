// apps/web/app/api/projects/route.ts
import { z } from "zod";
import { handle } from "../../../lib/api/respond";
import { parseBody } from "../../../lib/api/parse";
import { getDb } from "../../../lib/db";
import { requireSession, requireStakeholder } from "../../../lib/auth/session";
import { createProject, listProjects } from "../../../lib/projects/service";

const createSchema = z.object({ name: z.string().trim().min(1, "Required") });

export async function POST(req: Request) {
  return handle(async () => {
    const session = await requireStakeholder();
    const body = await parseBody(req, createSchema);
    const project = await createProject(getDb(), session, body);
    return Response.json({ project }, { status: 201 });
  });
}

export async function GET() {
  return handle(async () => {
    const session = await requireSession();
    const projects = await listProjects(getDb(), session);
    return Response.json({ projects });
  });
}
