// apps/web/app/login/error/page.tsx
import Link from "next/link";
import {
  Alert,
  Button,
  PageHeader,
} from "@zkcvp/design-system-ledger/components";
import type { AlertTone } from "@zkcvp/design-system-ledger/components";
import { IdentityStoreUnavailable } from "../../../lib/auth/errors";

/**
 * Both Auth.js instances point `pages.error` here, so this is the only
 * auth-failure surface either one can reach.
 *
 * Tone follows the Ledger rule (see Feedback.tsx): `danger` is reserved for
 * things that actually broke. Being refused entry is a legitimate outcome,
 * not a malfunction, so it reads as a warning — the same reasoning that keeps
 * a negative verdict out of red.
 */
const MESSAGES: Record<
  string,
  { tone: AlertTone; title: string; body: string }
> = {
  [IdentityStoreUnavailable.type]: {
    tone: "danger",
    title: "We couldn't complete sign-in",
    body:
      "Your credentials were fine — we just couldn't reach the database to " +
      "look you up. Nothing was changed. Trying again usually works.",
  },
  Configuration: {
    tone: "danger",
    title: "Sign-in is misconfigured",
    body:
      "The server is missing or has an invalid authentication setting, so " +
      "sign-in can't proceed. This needs an administrator, not another attempt.",
  },
  AccessDenied: {
    tone: "warning",
    title: "Sign-in was declined",
    body: "That account isn't permitted to sign in here.",
  },
  Verification: {
    tone: "warning",
    title: "That link is no longer valid",
    body:
      "Sign-in links can only be used once, and they expire. Request a fresh " +
      "one and use the newest email.",
  },
};

const FALLBACK = {
  tone: "warning" as AlertTone,
  title: "Sign-in didn't complete",
  body: "Something interrupted the sign-in. Try again.",
};

export default async function LoginErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const { tone, title, body } = (error && MESSAGES[error]) || FALLBACK;

  return (
    <main className="lg-container app-page app-page--narrow">
      <PageHeader title="Sign in" />
      <Alert
        tone={tone}
        title={title}
        actions={
          <Link href="/login">
            <Button type="button">Back to sign in</Button>
          </Link>
        }
      >
        {body}
      </Alert>
    </main>
  );
}
