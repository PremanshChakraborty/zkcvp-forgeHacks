// apps/web/app/projects/[id]/members/InviteForm.tsx
"use client";

import { useActionState, useEffect, useRef } from "react";
import {
  Alert,
  Button,
  Field,
  Input,
} from "@zkcvp/design-system-ledger/components";
import { inviteDeveloperAction, type InviteState } from "./actions";

const INITIAL_STATE: InviteState = { status: "idle" };

export function InviteForm({ projectId }: { projectId: string }) {
  const [state, formAction, pending] = useActionState(
    inviteDeveloperAction.bind(null, projectId),
    INITIAL_STATE,
  );

  const outcomeRef = useRef<HTMLDivElement>(null);

  /* A successful invite inserts a whole "Pending invites" section ABOVE this
   * card, so the outcome message lands further down the page than the button
   * that produced it — often off-screen entirely. The alert already carries
   * role="status" and is announced, but a sighted stakeholder saw the page jump
   * and no confirmation. Bring the message to them.
   *
   * Keyed on the whole state object rather than on `status`, so two invites in
   * a row both scroll. `block: "center"` rather than "start" because this card
   * is usually the last thing on the page and cannot scroll to the top. */
  useEffect(() => {
    if (state.status === "idle") return;
    outcomeRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [state]);

  /* React 19 resets the form once the action resolves. That is what should
   * happen after a successful invite — the next thing anyone does with this
   * field is invite somebody else — and not what should happen after a failure,
   * where the value is the thing being corrected. */
  const seedKey =
    state.status === "error" || state.status === "unavailable"
      ? state.attempt
      : 0;
  const seed =
    state.status === "error" || state.status === "unavailable"
      ? state.value
      : undefined;

  return (
    <form action={formAction}>
      {/* The outcome message, the field and the submit button are separate
          blocks; without a stack the button sits flush against the input. */}
      <div className="lg-stack">
        {/* One wrapper, rendered only when there is something to say — an empty
            div would still take a gap off `.lg-stack`. It is what the effect
            above scrolls to. */}
        {(state.status === "added" ||
          state.status === "invited" ||
          state.status === "unavailable") && (
          <div ref={outcomeRef}>
            {/* Two success wordings, never one. The person is either on the
                project now or is not on it yet, and what the stakeholder should
                expect next is different in each case. */}
            {state.status === "added" && (
              <Alert tone="success" title={`Added ${state.githubUsername}`}>
                They already had an account here, so they are a member of this
                project now and can see its requirements.
              </Alert>
            )}
            {state.status === "invited" && (
              <Alert tone="success" title={`Invited ${state.githubUsername}`}>
                They join this project the first time they sign in with GitHub.
                Until then they are listed under pending invites.
              </Alert>
            )}

            {/* An infrastructure failure, in red, well away from the field. The
                lookup did not happen, so this says nothing at all about whether
                that GitHub account exists — telling a stakeholder a real person
                is not there because we could not check would be a false
                statement about a third party. */}
            {state.status === "unavailable" && (
              <Alert tone="danger" title="Could not check GitHub">
                {state.message} Nobody was invited. This is a problem reaching
                GitHub, not a verdict on whether that account exists.
              </Alert>
            )}
          </div>
        )}

        <Field
          label="GitHub username"
          required
          help="Resolved to GitHub's permanent numeric id, so a later username change does not break the link."
          error={state.status === "error" ? state.message : undefined}
        >
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              name="githubUsername"
              required
              autoComplete="off"
              spellCheck={false}
              /* A GitHub username is at most 39 characters. Left to fill the
                 container it reads as a mistake — the same reason the auth
                 screens are capped in app.css. */
              className="app-field-short"
              key={seedKey}
              defaultValue={seed}
              aria-describedby={describedBy}
              invalid={invalid}
              mono
            />
          )}
        </Field>

        <div>
          <Button type="submit" tone="primary" loading={pending}>
            Invite developer
          </Button>
        </div>
      </div>
    </form>
  );
}
