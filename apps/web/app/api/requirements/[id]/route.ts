// apps/web/app/api/requirements/[id]/route.ts
import { z } from "zod";
import { handle } from "../../../../lib/api/respond";
import { parseBody } from "../../../../lib/api/parse";
import { getDb } from "../../../../lib/db";
import { requireSession } from "../../../../lib/auth/session";
import { getRequirement } from "../../../../lib/requirements/service";
import {
  archiveRequirement,
  editRequirement,
} from "../../../../lib/requirements/mutate";

const patchSchema = z
  .object({
    title: z.string().trim().min(1).optional(),
    description: z.string().trim().min(1).optional(),
  })
  .refine((v) => v.title !== undefined || v.description !== undefined, {
    message: "Provide at least one of title or description",
  });

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const { id } = await params;
    const session = await requireSession();
    const { requirement, versionHistory } = await getRequirement(
      getDb(),
      session,
      id,
    );
    return Response.json({
      requirement,
      currentVersion: {
        id: requirement.currentVersionId,
        versionNumber: requirement.versionNumber,
        title: requirement.title,
        description: requirement.description,
        status: requirement.status,
      },
      versionHistory,
    });
  });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const { id } = await params;
    const session = await requireSession();
    const body = await parseBody(req, patchSchema);
    const requirement = await editRequirement(getDb(), session, id, body);
    return Response.json({ requirement });
  });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const { id } = await params;
    const session = await requireSession();
    await archiveRequirement(getDb(), session, id);
    return new Response(null, { status: 204 });
  });
}
