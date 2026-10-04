// apps/web/app/api/claims/[id]/route.ts
import { handle } from "../../../../lib/api/respond";
import { getDb } from "../../../../lib/db";
import { requireSession } from "../../../../lib/auth/session";
import { getClaim } from "../../../../lib/claims/service";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const { id } = await params;
    const session = await requireSession();
    const claim = await getClaim(getDb(), session, id);
    return Response.json({ claim });
  });
}
