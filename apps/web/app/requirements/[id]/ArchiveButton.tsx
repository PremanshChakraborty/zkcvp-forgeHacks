// apps/web/app/requirements/[id]/ArchiveButton.tsx
"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@zkcvp/design-system-ledger/components";
import { archiveRequirementAction } from "./actions";

/**
 * `useFormStatus` only reads the status of the form it is rendered inside, so
 * the control is its own component. It also stops a second submit landing while
 * the first is still in flight, which matters for an action with no undo.
 */
function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" tone="neutral" loading={pending}>
      Archive
    </Button>
  );
}

/**
 * Archiving is a soft delete with no un-archive in this phase, so the copy says
 * what it does rather than "Delete". It is allowed in any status — a verified
 * requirement archives exactly like a new one.
 *
 * Two steps, because one click was enough to do something permanent. The
 * confirmation is inline rather than a dialog: `window.confirm` blocks the
 * whole tab, and a modal for a single irreversible verb is more chrome than the
 * decision needs. The arming step is a plain state toggle, so nothing is sent
 * until the second, real submit.
 *
 * `neutral` rather than `danger`: red now carries the negative VERDICT, and an
 * archive is not a failure — nothing has gone wrong when a stakeholder retires
 * a requirement. The weight of the action is carried by the two steps above
 * instead of by a hue that would read as an error beside a red chip.
 */
export function ArchiveButton({
  requirementId,
}: {
  requirementId: string;
}) {
  const [armed, setArmed] = useState(false);

  if (!armed) {
    return (
      <Button type="button" tone="neutral" onClick={() => setArmed(true)}>
        Archive
      </Button>
    );
  }

  return (
    /* Wrapping so the question and the two controls never split across lines
       inside PageHeader's actions slot. */
    <span className="lg-row-flex lg-row-flex--wrap">
      <span className="lg-caption">Archive this requirement?</span>
      {/* Cancel first in the DOM, and focused: arming unmounts the button that
          was just clicked, so without this a keyboard user is dropped back to
          the top of the document with no idea a question was asked. Cancel
          rather than Archive takes the focus — the confirm step exists to stop
          an accidental archive, and putting Enter on the destructive control
          would hand it straight back. */}
      <Button
        type="button"
        tone="quiet"
        autoFocus
        onClick={() => setArmed(false)}
      >
        Cancel
      </Button>
      <form action={archiveRequirementAction.bind(null, requirementId)}>
        <SubmitButton />
      </form>
    </span>
  );
}
