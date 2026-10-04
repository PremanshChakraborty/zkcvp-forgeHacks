// apps/web/app/login/email/page.tsx
import { Card, CardBody, CardHeader, PageHeader } from "@zkcvp/design-system-ledger/components";
import { safeReturnPath } from "../../../lib/auth/return-path";
import { EmailForm } from "./EmailForm";

export default async function LoginEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  /* Re-sanitised rather than trusted: this page is reachable directly, so the
   * value has not necessarily passed through /login. */
  const { from } = await searchParams;
  const returnTo = safeReturnPath(from);

  return (
    <main className="lg-container app-page app-page--narrow">
      <PageHeader
        title="Sign in with email"
        lead="We'll send a one-time link — no password to remember."
      />
      <Card>
        <CardHeader title="Stakeholder sign-in" />
        <CardBody>
          <EmailForm returnTo={returnTo} />
        </CardBody>
      </Card>
    </main>
  );
}
