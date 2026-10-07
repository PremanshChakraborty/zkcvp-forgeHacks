// apps/web/app/projects/new/page.tsx
import {
  Breadcrumb,
  Card,
  CardBody,
  CardHeader,
  PageHeader,
} from "@zkcvp/design-system-ledger/components";
import { requireStakeholder } from "../../../lib/auth/session";
import { NewProjectForm } from "./NewProjectForm";

export default async function NewProjectPage() {
  /* Only a stakeholder may create a project. The service enforces it too; this
   * is what keeps a developer from seeing a form they cannot submit. */
  await requireStakeholder();

  return (
    <main className="lg-container app-page app-page--narrow">
      {/* The only way out of this form that is not the browser's back button.
          `above` takes a Breadcrumb and nothing else — see PageHeaderProps. */}
      <PageHeader
        title="New project"
        above={
          <Breadcrumb
            items={[{ label: "Projects", href: "/projects" }, { label: "New project" }]}
          />
        }
      />
      <Card>
        <CardHeader title="Project details" />
        <CardBody>
          <NewProjectForm />
        </CardBody>
      </Card>
    </main>
  );
}
