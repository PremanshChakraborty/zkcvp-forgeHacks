// apps/web/app/projects/[id]/claims/new/page.tsx
import {
  Breadcrumb,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  PageHeader,
} from "@zkcvp/design-system-ledger/components";
import { getDb } from "../../../../../lib/db";
import { requireSession } from "../../../../../lib/auth/session";
import { getProject } from "../../../../../lib/projects/service";
import { listRequirements } from "../../../../../lib/requirements/service";
import { assertDeveloperMember, listAttachedRepos } from "../../../../../lib/repos/service";
import { env } from "../../../../../lib/env";
import { ClaimComposer } from "./ClaimComposer";

export default async function NewClaimPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireSession();
  const db = getDb();

  /* Membership, not just role: createClaim rejects a stakeholder, and a
   * developer who is not a member of THIS project, so checking session.kind
   * alone would still render a composer that could never be submitted.
   * assertDeveloperMember is the exact check createClaim performs before it
   * writes anything — reusing it here (rather than duplicating the logic) is
   * what keeps the composer off the screen for anyone else, matching how
   * requirements/new/page.tsx gates on requireStakeholderMember. This app has
   * no error.tsx, so the ServiceError this throws for a non-developer or
   * non-member replaces the whole page rather than rendering a friendlier
   * message — the same outcome every other role-gated page in this app has. */
  await assertDeveloperMember(db, session, id);

  const project = await getProject(db, session, id);

  /* Non-archived, at their current versions — an archived requirement cannot
   * be claimed against (createClaim rejects it), and a superseded version
   * would judge text nobody submitted this claim over. Requirements already
   * `verified` or `eval_failed` are still listed: re-evaluation is symmetric
   * from every status and none is a dead end. */
  const requirements = await listRequirements(db, session, id);
  const repos = await listAttachedRepos(db, session, id);

  const nothingToClaim = requirements.length === 0 || repos.length === 0;

  return (
    <main className="lg-container app-page">
      <PageHeader
        title="Submit a claim"
        above={
          <Breadcrumb
            items={[
              { label: "Projects", href: "/projects" },
              { label: project.name, href: `/projects/${id}` },
              { label: "Submit a claim" },
            ]}
          />
        }
        lead="Pin one or more requirements to a commit in each repository you want the Evaluator to read."
      />

      <Card>
        <CardHeader title="Claim details" />
        <CardBody>
          {nothingToClaim ? (
            <EmptyState title="Nothing to claim yet">
              {requirements.length === 0 && repos.length === 0
                ? "This project has no requirements and no attached repository yet."
                : requirements.length === 0
                  ? "A stakeholder has not added a requirement to this project yet."
                  : "Attach a repository before submitting a claim."}
            </EmptyState>
          ) : (
            <ClaimComposer
              projectId={id}
              requirements={requirements.map((r) => ({
                requirementVersionId: r.currentVersionId,
                versionNumber: r.versionNumber,
                title: r.title,
                description: r.description,
                status: r.status,
              }))}
              repos={repos.map((r) => ({
                id: r.id,
                fullName: r.fullName,
                defaultBranch: r.defaultBranch,
              }))}
              /* Never hardcoded: a serverless host caps a run at this
               * ceiling, a long-lived Node host does not, and the choice is
               * deliberately still open (see PRODUCT.md, Operating Context).
               * Read here, on the server, and handed down as a prop so the
               * client never has to guess it. */
              ceilingSeconds={env().EVAL_CEILING_SECONDS}
            />
          )}
        </CardBody>
      </Card>
    </main>
  );
}
