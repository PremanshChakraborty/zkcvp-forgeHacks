// apps/web/app/projects/new/actions.ts
"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getDb } from "../../../lib/db";
import { requireStakeholder } from "../../../lib/auth/session";
import { createProject } from "../../../lib/projects/service";
import { nextAttempt } from "../../../lib/forms/attempt";

/**
 * The error branch carries `values` back for the form to re-seed itself with.
 * A Server Action re-renders the form from scratch, so without it a rejected
 * submission hands the stakeholder an empty control and asks them to type it
 * again — the one thing they know they already did correctly.
 */
export type FormState =
  | { status: "idle" }
  | {
      status: "error";
      message: string;
      values: { name: string };
      /* Counts rejected submits. React 19 resets an uncontrolled form after
       * every action, so re-seeding a field means remounting it, and a `key`
       * that did not change between two consecutive failures would skip the
       * remount and leave the second one blank. */
      attempt: number;
    };

export async function createProjectAction(
  prev: FormState,
  formData: FormData,
): Promise<FormState> {
  /* The raw value, not the trimmed one: this is what goes back into the field,
   * and silently re-typing someone's input is its own small surprise. */
  const raw = String(formData.get("name") ?? "");
  const name = raw.trim();
  if (!name) {
    return {
      status: "error",
      message: "Enter a project name.",
      values: { name: raw },
      attempt: nextAttempt(prev),
    };
  }

  const session = await requireStakeholder();
  const project = await createProject(getDb(), session, { name });

  revalidatePath("/projects");
  /* redirect() throws a control-flow signal — it must be outside any try. */
  redirect(`/projects/${project.id}`);
}
