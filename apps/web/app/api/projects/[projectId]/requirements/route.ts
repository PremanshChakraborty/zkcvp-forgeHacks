// apps/web/app/api/projects/[projectId]/requirements/route.ts
import { z } from "zod";
import { handle } from "../../../../../lib/api/respond";
import { parseBody } from "../../../../../lib/api/parse";
import { getDb } from "../../../../../lib/db";
import { requireSession } from "../../../../../lib/auth/session";
import {
  createRequirement,
  listRequirements,
} from "../../../../../lib/requirements/service";

const createSchema = z.object({
  title: z.string().trim().min(1, "Required"),
  description: z.string().trim().min(1, "Required"),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  return handle(async () => {
    const { projectId } = await params;
    const session = await requireSession();
    const body = await parseBody(req, createSchema);
    const requirement = await createRequirement(
      getDb(),
      session,
      projectId,
      body,
    );
    return Response.json({ requirement }, { status: 201 });
  });
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  return handle(async () => {
    const { projectId } = await params;
    const session = await requireSession();
    const includeArchived =
      new URL(req.url).searchParams.get("includeArchived") === "true";
    const requirements = await listRequirements(getDb(), session, projectId, {
      includeArchived,
    });
    return Response.json({ requirements });
  });
}
