// apps/web/app/requirements/[id]/edit/page.tsx
import { notFound } from "next/navigation";
import {
  Breadcrumb,
  Card,
  CardBody,
  CardHeader,
  PageHeader,
} from "@zkcvp/design-system-ledger/components";
import { getDb } from "../../../../lib/db";
import { requireStakeholder } from "../../../../lib/auth/session";
import { getProject } from "../../../../lib/projects/service";
import { getRequirement } from "../../../../lib/requirements/service";
import { EditRequirementForm } from "./EditRequirementForm";

export default async function EditRequirementPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  /* Role first, so a developer never reaches the form. `getRequirement` then
   * proves membership of the requirement's own project, which for a stakeholder
   * session is stakeholder membership — the same check `editRequirement` makes
   * again on submit. */
  const session = await requireStakeholder();
  const db = getDb();
  const { requirement } = await getRequirement(db, session, id);

  /* An archived requirement cannot be edited: `editRequirement` throws 404
   * under the row lock, so a form here could only ever fail. notFound() throws
   * a control-flow signal and is deliberately outside any try. */
  if (requirement.archivedAt !== null) notFound();

  /* For the trail only — see the same read on the requirement page. */
  const project = await getProject(db, session, requirement.projectId);

  return (
    <main className="lg-container app-page app-page--narrow">
      <PageHeader
        title="Edit requirement"
        above={
          <Breadcrumb
            items={[
              { label: "Projects", href: "/projects" },
              {
                label: project.name,
                href: `/projects/${requirement.projectId}`,
              },
              { label: requirement.title, href: `/requirements/${id}` },
              { label: "Edit" },
            ]}
          />
        }
        lead={requirement.title}
      />
      <Card>
        <CardHeader title="Requirement details" />
        <CardBody>
          <EditRequirementForm
            requirementId={id}
            title={requirement.title}
            description={requirement.description}
          />
        </CardBody>
      </Card>
    </main>
  );
}
