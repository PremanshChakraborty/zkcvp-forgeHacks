// apps/web/app/projects/[id]/requirements/new/page.tsx
import {
  Breadcrumb,
  Card,
  CardBody,
  CardHeader,
  PageHeader,
} from "@zkcvp/design-system-ledger/components";
import { getDb } from "../../../../../lib/db";
import { requireStakeholderMember } from "../../../../../lib/auth/session";
import { getProject } from "../../../../../lib/projects/service";
import { NewRequirementForm } from "./NewRequirementForm";

export default async function NewRequirementPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  /* Membership, not just role: createRequirement rejects a stakeholder who is
   * not a stakeholder member of THIS project, so checking the role alone would
   * still render a form that cannot be submitted. The service enforces it
   * again on submit; this is what keeps the form off the screen. */
  const session = await requireStakeholderMember(id);

  /* Read purely so the page can NAME the checklist it is about to write to. A
   * stakeholder with several projects had nothing on this screen telling them
   * which one they were adding to — the heading is the same on all of them. */
  const project = await getProject(getDb(), session, id);

  return (
    <main className="lg-container app-page app-page--narrow">
      <PageHeader
        title="New requirement"
        above={
          <Breadcrumb
            items={[
              { label: "Projects", href: "/projects" },
              { label: project.name, href: `/projects/${id}` },
              { label: "New requirement" },
            ]}
          />
        }
        lead={`Added to ${project.name}.`}
      />
      <Card>
        <CardHeader title="Requirement details" />
        <CardBody>
          <NewRequirementForm projectId={id} />
        </CardBody>
      </Card>
    </main>
  );
}
