// apps/web/app/projects/[id]/requirements/new/actions.ts
"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getDb } from "../../../../../lib/db";
import { requireStakeholder } from "../../../../../lib/auth/session";
import { createRequirement } from "../../../../../lib/requirements/service";
import { nextAttempt } from "../../../../../lib/forms/attempt";

/**
 * Same shape as the new-project action, plus the field the message belongs to.
 * This form has two required controls, and a message rendered under the wrong
 * one tells the stakeholder to fix a field that is already correct.
 */
export type RequirementValues = { title: string; description: string };

export type FormState =
  | { status: "idle" }
  | {
      status: "error";
      field: "title" | "description";
      message: string;
      /* Both fields ride back, not just the offending one. A Server Action
       * re-renders the form from scratch, and losing a paragraph of description
       * because the title was blank is the worst version of this bug. */
      values: RequirementValues;
      /* See lib/forms/attempt.ts — this is what makes the re-seed survive two
       * rejections in a row. */
      attempt: number;
    };

export async function createRequirementAction(
  projectId: string,
  prev: FormState,
  formData: FormData,
): Promise<FormState> {
  /* Raw for the round trip, trimmed for the checks and the write. */
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
  await createRequirement(getDb(), session, projectId, { title, description });

  revalidatePath(`/projects/${projectId}`);
  /* redirect() throws a control-flow signal — it must be outside any try. */
  redirect(`/projects/${projectId}`);
}
