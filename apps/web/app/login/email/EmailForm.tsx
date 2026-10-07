// apps/web/app/login/email/EmailForm.tsx
"use client";

import { useActionState } from "react";
import {
  Alert,
  Button,
  Field,
  Input,
} from "@zkcvp/design-system-ledger/components";
import { requestMagicLink, type RequestMagicLinkState } from "./actions";

const INITIAL_STATE: RequestMagicLinkState = { status: "idle" };

export function EmailForm({ returnTo }: { returnTo: string }) {
  const [state, formAction, pending] = useActionState(
    /* Bound rather than sent as a hidden field: the value ends up inside an
       emailed link, so it should not be something the submitted form can
       rewrite. The server sanitises it again regardless. */
    requestMagicLink.bind(null, returnTo),
    INITIAL_STATE,
  );

  if (state.status === "sent") {
    /* The copy follows the sender that actually ran. Claiming an inbox
       delivery in development, where the link only reaches the server log,
       would leave someone waiting for mail that is never sent. */
    return state.delivery === "email" ? (
      <Alert tone="success" title="Check your email">
        A sign-in link is on its way to {state.email}. It expires in 24 hours.
      </Alert>
    ) : (
      <Alert tone="success" title="Link sent">
        A sign-in link for {state.email} was printed to the server console —
        no email provider is configured. Copy the URL from there.
      </Alert>
    );
  }

  return (
    <form action={formAction}>
      {/* The field and its submit button are separate blocks; without a stack
          the button sits flush against the input's bottom edge. */}
      <div className="lg-stack">
        <Field
          label="Email address"
          error={state.status === "error" ? state.message : undefined}
        >
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              name="email"
              type="email"
              required
              autoComplete="email"
              aria-describedby={describedBy}
              invalid={invalid}
            />
          )}
        </Field>
        <div>
          <Button type="submit" tone="primary" loading={pending}>
            Send sign-in link
          </Button>
        </div>
      </div>
    </form>
  );
}
