// apps/web/app/projects/page.tsx
import Link from "next/link";
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  PageHeader,
  Table,
  Td,
} from "@zkcvp/design-system-ledger/components";
import { getDb } from "../../lib/db";
import { requireSession } from "../../lib/auth/session";
import { listProjects } from "../../lib/projects/service";
import { SetupGuide } from "./SetupGuide";

/** Absolute dates throughout this product, never relative. */
const dateFormat = new Intl.DateTimeFormat("en-GB", {
  year: "numeric",
  month: "short",
  day: "numeric",
});

export default async function ProjectsPage() {
  const session = await requireSession();
  const projects = await listProjects(getDb(), session);

  return (
    <main className="lg-container app-page">
      <PageHeader
        title="Projects"
        actions={
          session.kind === "stakeholder" ? (
            <Link href="/projects/new">
              <Button type="button">New project</Button>
            </Link>
          ) : undefined
        }
      />

      {projects.length === 0 ? (
        <SetupGuide role={session.kind} />
      ) : (
        <Card flush>
          <CardHeader
            title={`${projects.length} project${projects.length === 1 ? "" : "s"}`}
          />
          <CardBody>
            <Table label="Projects">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {projects.map((p) => (
                  <tr key={p.id}>
                    <Td>
                      <Link href={`/projects/${p.id}`}>{p.name}</Link>
                    </Td>
                    <Td>{dateFormat.format(p.createdAt)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </CardBody>
        </Card>
      )}
    </main>
  );
}
