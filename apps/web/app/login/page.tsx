// apps/web/app/login/page.tsx
import Link from "next/link";
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  PageHeader,
} from "@zkcvp/design-system-ledger/components";
import { developerSignIn } from "../../lib/auth/developer";
import { safeReturnPath } from "../../lib/auth/return-path";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  /* Middleware writes `?from=` on every unauthenticated redirect. Until now
   * nothing read it, so signing in always dropped the visitor at the default
   * and a shared link to a requirement was effectively a link to the project
   * list. Sanitised on the way in — see safeReturnPath. */
  const { from } = await searchParams;
  const returnTo = safeReturnPath(from);

  return (
    <main className="lg-container app-page app-page--narrow">
      <PageHeader
        title="Sign in"
        lead="Stakeholders and developers authenticate differently — pick the one that's you."
      />

      {/* Without a stack the two cards butt together and read as one block
          split by a divider, rather than as two separate choices. */}
      <div className="lg-stack lg-stack--loose">
        <Card>
          <CardHeader title="Developer" />
          <CardBody>
            <div className="lg-stack">
              <p>
                Sign in with GitHub. This is also how a project attaches your
                repos and reads code at the commits you claim.
              </p>
              <form
                action={async () => {
                  "use server";
                  await developerSignIn("github", { redirectTo: returnTo });
                }}
              >
                <Button type="submit" tone="primary">
                  Continue with GitHub
                </Button>
              </form>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Stakeholder" />
          <CardBody>
            <div className="lg-stack">
              <p>
                Sign in with an email link — no password, no GitHub account
                required.
              </p>
              <div>
                {/* The return path rides along, or the stakeholder half of
                    this screen forgets where they were headed. */}
                <Link
                  href={`/login/email?from=${encodeURIComponent(returnTo)}`}
                >
                  <Button type="button">Continue with email</Button>
                </Link>
              </div>
            </div>
          </CardBody>
        </Card>
      </div>
    </main>
  );
}
