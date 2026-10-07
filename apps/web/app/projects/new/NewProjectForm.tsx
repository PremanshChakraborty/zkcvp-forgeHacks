// apps/web/app/projects/new/NewProjectForm.tsx
"use client";

import { useActionState } from "react";
import { Button, Field, Input } from "@zkcvp/design-system-ledger/components";
import { createProjectAction, type FormState } from "./actions";

const INITIAL_STATE: FormState = { status: "idle" };

export function NewProjectForm() {
  const [state, formAction, pending] = useActionState(
    createProjectAction,
    INITIAL_STATE,
  );

  return (
    <form action={formAction}>
      {/* The field and its submit button are separate blocks; without a stack
          the button sits flush against the input's bottom edge. */}
      <div className="lg-stack">
        <Field
          label="Project name"
          required
          error={state.status === "error" ? state.message : undefined}
        >
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              name="name"
              required
              autoFocus
              /* `key` forces the remount that re-seeds the control. React 19
                 resets the form once the action resolves, so `defaultValue`
                 alone would be read against an already-cleared input. */
              key={state.status === "error" ? state.attempt : 0}
              defaultValue={
                state.status === "error" ? state.values.name : undefined
              }
              aria-describedby={describedBy}
              invalid={invalid}
            />
          )}
        </Field>
        <div>
          <Button type="submit" tone="primary" loading={pending}>
            Create project
          </Button>
        </div>
      </div>
    </form>
  );
}
