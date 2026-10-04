// apps/web/app/requirements/[id]/edit/actions.ts
"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getDb } from "../../../../lib/db";
import { requireStakeholder } from "../../../../lib/auth/session";
import { editRequirement } from "../../../../lib/requirements/mutate";
import { nextAttempt } from "../../../../lib/forms/attempt";

/**
 * The same shape as the new-requirement action, including the field the message
 * belongs to: this form has two required controls, and a message rendered under
 * the wrong one tells the stakeholder to fix a field that is already correct.
 */
export type RequirementValues = { title: string; description: string };

export type FormState =
  | { status: "idle" }
  | {
      status: "error";
      field: "title" | "description";
      message: string;
      /* Carried back for the same reason as the new-requirement action, and it
       * matters more here: the control started pre-filled from the stored
       * version, so an empty field after a rejected save reads as though the
       * requirement itself had been emptied. */
      values: RequirementValues;
      /* See lib/forms/attempt.ts. */
      attempt: number;
    };

export async function editRequirementAction(
  requirementId: string,
  prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const values: RequirementValues = {
    title: String(formData.get("title") ?? ""),
    description: String(formData.get("description") ?? ""),
  };
  const title = values.title.trim();
  const description = values.description.trim();

  if (!title) {
    return {
      status: "error",
      field: "title",
      message: "Enter a title.",
      values,
      attempt: nextAttempt(prev),
    };
  }
  if (!description) {
    return {
      status: "error",
      field: "description",
      message: "Enter a description.",
      values,
      attempt: nextAttempt(prev),
    };
  }

  const session = await requireStakeholder();
  /* Both fields are always sent, so both are passed. `editRequirement` treats
   * an omitted key as "carry the previous version's text forward", which is not
   * what an emptied control means. */
  const updated = await editRequirement(getDb(), session, requirementId, {
    title,
    description,
  });

  /* The project checklist renders the title, description, and version number
   * that just changed, so it is stale too — same pattern as
   * archiveRequirementAction, which revalidates both affected routes. */
  revalidatePath(`/projects/${updated.projectId}`);
  revalidatePath(`/requirements/${requirementId}`);
  /* redirect() throws a control-flow signal — it must be outside any try. */
  redirect(`/requirements/${requirementId}`);
}
