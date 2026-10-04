// apps/web/app/projects/[id]/repos/AttachRepoForm.tsx
"use client";

import { useEffect, useState, useActionState } from "react";
import type { GithubRepo } from "@zkcvp/github";
import {
  Alert,
  Button,
  Field,
  Select,
  ToastRegion,
  UndoToast,
} from "@zkcvp/design-system-ledger/components";
import { attachRepoAction, detachRepoAction, type AttachState } from "./actions";

const INITIAL_STATE: AttachState = { status: "idle" };

/** What the undo toast needs, once. */
type JustAttached = { repoId: string; fullName: string; seconds: number };

export function AttachRepoForm({
  projectId,
  candidates,
  unavailable = false,
}: {
  projectId: string;
  candidates: GithubRepo[];
  /** GitHub could not be reached while the server component loaded
   * candidates — see page.tsx. The attached-repos table above this form
   * still rendered; only the picker, which needs a live GitHub call, could
   * not. */
  unavailable?: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    attachRepoAction.bind(null, projectId),
    INITIAL_STATE,
  );

  /* The toast is its own local state rather than something rendered straight
   * from `state`: it has to keep counting down and be dismissable (undone, or
   * left to expire) on its own clock, independent of the form's pending flag.
   * Attaching a second repo while one toast is still open replaces it with
   * the new one — this UI offers undo for the most recent attach, not a
   * queue of them; the earlier attachment is still undoable within its own
   * window through the API, just without an on-screen affordance here. */
  const [justAttached, setJustAttached] = useState<JustAttached | null>(null);
  const [undoBusy, setUndoBusy] = useState(false);
  const [undoError, setUndoError] = useState<string | null>(null);

  useEffect(() => {
    if (state.status !== "attached") return;
    /* Seconds remaining is computed from the server's own `undoableUntil`,
     * never hardcoded and never re-derived from `UNDO_WINDOW_MS` here —
     * that constant has exactly one definition, in the service, and this is
     * it arriving rather than being recomputed. */
    const seconds = Math.max(
      0,
      Math.round(
        (new Date(state.repo.undoableUntil).getTime() - Date.now()) / 1000,
      ),
    );
    setJustAttached({ repoId: state.repo.id, fullName: state.repo.fullName, seconds });
    setUndoError(null);
  }, [state]);

  async function handleUndo() {
    if (!justAttached) return;
    setUndoBusy(true);
    setUndoError(null);
    try {
      const fd = new FormData();
      fd.set("repoId", justAttached.repoId);
      const result = await detachRepoAction(projectId, fd);
      if (result.status === "error") {
        setUndoError(result.message);
        return;
      }
      setJustAttached(null);
    } finally {
      setUndoBusy(false);
    }
  }

  /* React 19 resets an uncontrolled form once its action resolves. Right
   * after a successful attach that is correct — the next thing anyone does
   * with this control is pick a different repo — and wrong after a
   * rejection, where re-seeding means remounting via a `key` that changes
   * even on a second consecutive failure. See lib/forms/attempt.ts. */
  const seedKey = state.status === "error" ? state.attempt : 0;
  const seedValue = state.status === "error" ? state.values.repo : "";

  return (
    <div className="lg-stack">
      {justAttached && (
        <ToastRegion>
          <UndoToast
            seconds={justAttached.seconds}
            onUndo={handleUndo}
            onExpire={() => setJustAttached(null)}
          >
            Attached {justAttached.fullName}
            {undoBusy && " — removing…"}
          </UndoToast>
        </ToastRegion>
      )}

      {undoError && (
        <Alert tone="danger" title="Could not remove">
          {undoError}
        </Alert>
      )}

      {unavailable ? (
        /* A rate-limited or unreachable GitHub during the page load, not a
         * verdict on what the developer's account can see — the attached
         * list above this form rendered fine, since it makes no GitHub call
         * at all. See page.tsx. */
        <Alert tone="danger" title="Could not load repositories">
          GitHub could not be reached. Try again shortly.
        </Alert>
      ) : candidates.length === 0 ? (
        /* Not an EmptyState: this sits inside a card that already has a
         * heading, and a second nested empty-state title here would just
         * repeat it. Deliberately not worded as "every repository is
         * attached" — this list is capped at the 100 most recently updated
         * repositories your GitHub account can see, so that claim would not
         * always be true. */
        <p className="lg-caption">
          Nothing left to attach among your 100 most recently updated GitHub
          repositories.
        </p>
      ) : (
        <form action={formAction}>
          <div className="lg-stack">
            <Field
              label="Repository"
              required
              help="Only repositories your GitHub account can see, and not already attached to this project."
              error={state.status === "error" ? state.message : undefined}
            >
              {({ id, describedBy, invalid }) => (
                <Select
                  id={id}
                  name="repo"
                  required
                  key={seedKey}
                  defaultValue={seedValue}
                  aria-describedby={describedBy}
                  invalid={invalid}
                >
                  <option value="" disabled>
                    Select a repository
                  </option>
                  {candidates.map((c) => (
                    /* value carries `githubRepoId` and `fullName` together —
                     * see actions.ts. The join key is the id; the name is
                     * what a developer recognises. */
                    <option
                      key={c.githubRepoId}
                      value={`${c.githubRepoId}|${c.fullName}`}
                    >
                      {c.fullName}
                      {c.private ? "" : " (public)"}
                    </option>
                  ))}
                </Select>
              )}
            </Field>

            <div>
              <Button type="submit" tone="primary" loading={pending}>
                Attach repository
              </Button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
