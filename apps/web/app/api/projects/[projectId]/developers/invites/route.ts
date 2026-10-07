// apps/web/app/api/projects/[projectId]/developers/invites/route.ts
import { z } from "zod";
import { handle } from "../../../../../../lib/api/respond";
import { parseBody } from "../../../../../../lib/api/parse";
import { getDb } from "../../../../../../lib/db";
import { requireSession } from "../../../../../../lib/auth/session";
import { inviteDeveloper } from "../../../../../../lib/projects/members";

const inviteSchema = z.object({
  githubUsername: z.string().trim().min(1, "Required"),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  return handle(async () => {
    const { projectId } = await params;
    const session = await requireSession();
    const body = await parseBody(req, inviteSchema);
    const result = await inviteDeveloper(getDb(), session, projectId, body);

    /* Plan 01: 201 either way, but the body names which branch fired. */
    return Response.json(
      result.kind === "membership"
        ? { membership: result.membership }
        : { invite: result.invite },
      { status: 201 },
    );
  });
}
