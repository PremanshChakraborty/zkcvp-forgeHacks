// apps/web/app/projects/[id]/members/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "../../../../lib/db";
import { requireStakeholder } from "../../../../lib/auth/session";
import { inviteDeveloper } from "../../../../lib/projects/members";
import { ServiceError } from "../../../../lib/api/errors";
import { nextAttempt } from "../../../../lib/forms/attempt";

/**
 * Four terminal states, not two, and the split is the point.
 *
 * `added` and `invited` are the two branches plan 01 gives
 * `POST /api/projects/:projectId/developers/invites`: an existing developer
 * identity becomes a membership row immediately, anyone else becomes a pending
 * invite that resolves on their first GitHub sign-in. What the stakeholder
 * should expect next differs completely, so the screen has to say which fired.
 *
 * `unavailable` is separated from `error` on purpose. An exhausted GitHub rate
 * limit is an infrastructure failure, not a rejection — errors.ts:
 * "reporting it as 404 would tell a stakeholder something false about a real
 * person" — so it renders as a danger Alert rather than as validation under the
 * username field, where it would read as "no such user".
 */
export type InviteState =
  | { status: "idle" }
  | { status: "added"; githubUsername: string }
  | { status: "invited"; githubUsername: string }
  /* The two failure branches carry `value` back so the form can re-seed the
   * field. Both are recoverable — a typo to correct, or a GitHub outage to
   * retry — and both used to clear what the stakeholder had typed, which turns
   * "try that again" into "type all of that again". The success branches
   * deliberately do not: there the field SHOULD empty, because the next thing
   * anyone does with it is invite someone else. */
  /* `attempt` — see lib/forms/attempt.ts — is what lets the field survive two
   * consecutive rejections. */
  | { status: "unavailable"; message: string; value: string; attempt: number }
  | { status: "error"; message: string; value: string; attempt: number };

export async function inviteDeveloperAction(
  projectId: string,
  prev: InviteState,
  formData: FormData,
): Promise<InviteState> {
  const raw = String(formData.get("githubUsername") ?? "");
  const githubUsername = raw.trim();
  if (!githubUsername) {
    return {
      status: "error",
      message: "Enter a GitHub username.",
      value: raw,
      attempt: nextAttempt(prev),
    };
  }

  /* No redirect() anywhere in this action: the outcome is a message on the same
   * screen, and a redirect inside this try would be swallowed as an error. */
  try {
    const session = await requireStakeholder();
    /* inviteDeveloper re-checks stakeholder membership of THIS project — the
     * page hiding the form is the affordance, this is the enforcement. */
    const result = await inviteDeveloper(getDb(), session, projectId, {
      githubUsername,
    });

    /* The roster and the pending-invite list are rendered by the server
     * component above this form, so the new row only appears if the route is
     * revalidated. */
    revalidatePath(`/projects/${projectId}/members`);

    /* The username echoed back is GitHub's canonical `login`, resolved through
     * the numeric id, not the string the stakeholder typed. */
    return result.kind === "membership"
      ? { status: "added", githubUsername: result.membership.githubUsername }
      : { status: "invited", githubUsername: result.invite.githubUsername };
  } catch (e) {
    if (e instanceof ServiceError) {
      const attempt = nextAttempt(prev);
      return e.code === "github_unavailable"
        ? { status: "unavailable", message: e.message, value: raw, attempt }
        : { status: "error", message: e.message, value: raw, attempt };
    }
    /* SessionError (401/403 from requireStakeholder) and anything unexpected
     * are not this form's to describe — let the error boundary have them. */
    throw e;
  }
}
