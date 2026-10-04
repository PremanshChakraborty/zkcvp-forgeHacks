// apps/web/app/projects/[id]/repos/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "../../../../lib/db";
import { requireSession } from "../../../../lib/auth/session";
import { attachRepo, detachRepo } from "../../../../lib/repos/service";
import { ServiceError } from "../../../../lib/api/errors";
import { nextAttempt } from "../../../../lib/forms/attempt";

/**
 * Same shape as `projects/new/actions.ts`'s `FormState`: an idle/error union,
 * the error branch carrying back what was submitted plus an `attempt` counter
 * so the field re-seeds even on a second consecutive rejection (see
 * `lib/forms/attempt.ts`).
 *
 * There is a third, success branch here that the project-creation form does
 * not need, because that form redirects on success and this one does not —
 * attaching a repo keeps the developer on this page, so the newly attached
 * row's id and its server-computed `undoableUntil` have to come back as state
 * for the undo toast to render from. `undoableUntil` rides through as an ISO
 * string, not a `Date`: the service's `UNDO_WINDOW_MS` is the only place the
 * 60-second window is defined, and this is that definition arriving at the
 * client rather than being recomputed there.
 */
export type AttachState =
  | { status: "idle" }
  | {
      status: "attached";
      repo: { id: string; fullName: string; undoableUntil: string };
    }
  | {
      status: "error";
      message: string;
      values: { repo: string };
      attempt: number;
    };

export async function attachRepoAction(
  projectId: string,
  prev: AttachState,
  formData: FormData,
): Promise<AttachState> {
  /* The select's option value carries both fields the service needs, joined
   * by a delimiter neither a GitHub id nor an `owner/name` can contain — see
   * AttachRepoForm.tsx. */
  const raw = String(formData.get("repo") ?? "");
  const sep = raw.indexOf("|");
  if (sep === -1) {
    return {
      status: "error",
      message: "Select a repository.",
      values: { repo: raw },
      attempt: nextAttempt(prev),
    };
  }
  const githubRepoId = raw.slice(0, sep);
  const fullName = raw.slice(sep + 1);

  try {
    const session = await requireSession();
    const repo = await attachRepo(getDb(), session, projectId, {
      githubRepoId,
      fullName,
    });

    /* The attached list and the candidate picker are both rendered by the
     * server component above this form, so the moved row only appears —
     * and the picker only loses its option — once the route is
     * revalidated. This sits inside the try, unlike projects/new/actions.ts,
     * because there is no redirect() here to protect: this form keeps the
     * developer on the same page whether the attach succeeds or fails. */
    revalidatePath(`/projects/${projectId}/repos`);

    return {
      status: "attached",
      repo: {
        id: repo.id,
        fullName: repo.fullName,
        undoableUntil: repo.undoableUntil.toISOString(),
      },
    };
  } catch (e) {
    /* The realistic case here is a conflict: the candidate list was built
     * from a page load that has since gone stale, and someone (this
     * developer in another tab, or a teammate) attached the same repo in
     * the meantime. That is recoverable — reload the picker, try another
     * repo — so it renders under the field rather than reaching the error
     * boundary. */
    if (e instanceof ServiceError) {
      return {
        status: "error",
        message: e.message,
        values: { repo: raw },
        attempt: nextAttempt(prev),
      };
    }
    throw e;
  }
}

/**
 * Undo is not driven by a text field, so there is nothing here for a
 * `values`/`attempt` re-seed to do — the countdown widget that calls this
 * either succeeds or shows `message` and leaves its own row alone.
 */
export type DetachState =
  | { status: "idle" }
  | { status: "detached" }
  | { status: "error"; message: string };

export async function detachRepoAction(
  projectId: string,
  formData: FormData,
): Promise<DetachState> {
  const repoId = String(formData.get("repoId") ?? "");

  try {
    const session = await requireSession();
    await detachRepo(getDb(), session, projectId, repoId);

    /* Same reasoning as attachRepoAction above: no redirect() to protect,
     * so revalidatePath stays inside the try. */
    revalidatePath(`/projects/${projectId}/repos`);
    return { status: "detached" };
  } catch (e) {
    /* Past the 60-second window `detachRepo` throws a conflict rather than
     * silently doing nothing — that has to surface here, not vanish, or the
     * developer has no way to tell "undo expired" from "undo worked". */
    if (e instanceof ServiceError) {
      return { status: "error", message: e.message };
    }
    throw e;
  }
}
