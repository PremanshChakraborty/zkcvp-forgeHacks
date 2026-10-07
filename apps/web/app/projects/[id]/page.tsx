// apps/web/app/projects/[id]/page.tsx
import Link from "next/link";
import {
  Breadcrumb,
  Button,
  ChecklistProgress,
  Disclosure,
  DisclosureList,
  EmptyState,
  ICON_SM,
  IconChevron,
  PageHeader,
  Section,
  StatusBadge,
  VersionPill,
  type RequirementDisplayStatus,
} from "@zkcvp/design-system-ledger/components";
import { getDb } from "../../../lib/db";
import { requireSession } from "../../../lib/auth/session";
import { getProject } from "../../../lib/projects/service";
import { listRequirements } from "../../../lib/requirements/service";
import { ProjectNav } from "./ProjectNav";

/** Absolute dates throughout this product, never relative. */
const dateFormat = new Intl.DateTimeFormat("en-GB", {
  year: "numeric",
  month: "short",
  day: "numeric",
});

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireSession();
  const db = getDb();

  const project = await getProject(db, session, id);

  /* This IS the active checklist view, so it takes the service's default and
   * excludes archived rows — plan 01, "Archiving vs. status": "Archiving
   * removes a requirement from the active checklist view; it says nothing
   * about whether it was ever verified."
   *
   * The archived rendering path below is therefore unreachable today, and that
   * is deliberate: it stays wired so an explicit "show archived" toggle is a
   * change to this one call rather than to the rows. */
  const requirements = await listRequirements(db, session, id);

  const isStakeholder = session.kind === "stakeholder";

  /* `archived` is folded into a display status ONLY for the segmented track,
   * which shows one mark per requirement. The two facts stay separate in the
   * data and in the props handed to each RequirementRow below. */
  const displayStatuses: RequirementDisplayStatus[] = requirements.map((r) =>
    r.archivedAt !== null ? "archived" : r.status,
  );

  return (
    <main className="lg-container app-page">
      <PageHeader
        title={project.name}
        above={
          <Breadcrumb
            items={[
              { label: "Projects", href: "/projects" },
              { label: project.name },
            ]}
          />
        }
        lead={`Created ${dateFormat.format(project.createdAt)}`}
        /* Actions only. Members, Repositories and Claims used to sit here as
         * secondary buttons, which put four navigations and one mutation in one
         * row wearing two weights of the same chrome; they are in the section
         * strip below now, where going somewhere is what the control means. */
        actions={
          isStakeholder ? (
            <Link href={`/projects/${id}/requirements/new`}>
              <Button type="button" tone="primary">
                New requirement
              </Button>
            </Link>
          ) : (
            /* Only a developer member submits a claim — it spends their own
             * GitHub token, same reasoning as the repos page's attach form.
             * Requirement selection stays off this shared screen; the composer
             * at claims/new is where that happens. */
            <Link href={`/projects/${id}/claims/new`}>
              <Button type="button" tone="primary">
                Submit a claim
              </Button>
            </Link>
          )
        }
        nav={
          <ProjectNav
            projectId={id}
            active="requirements"
            /* The checklist count rides at the end of the strip, which is where
             * the "Requirements" section heading used to carry it. The heading
             * itself is gone: the strip already names this section, and keeping
             * it drew a second full-width rule a line under the first. */
            end={
              requirements.length > 0 ? (
                <ChecklistProgress statuses={displayStatuses} />
              ) : undefined
            }
          />
        }
      />

      <Section>
        {requirements.length === 0 ? (
          <EmptyState title="No requirements yet">
            {isStakeholder
              ? "Add the first requirement to this checklist."
              : "You will see requirements here once a stakeholder adds them."}
          </EmptyState>
        ) : (
          /* Expandable entries rather than fixed rows, the same reading the
             requirement page gives version history. A checklist is scanned for
             outcomes far more often than it is read for wording: at a dozen
             requirements the descriptions were three quarters of the page and
             the statuses they qualify were scattered down it. Collapsed, the
             whole checklist fits one screen and every status lines up. */
          <DisclosureList>
            {requirements.map((r) => (
              <Disclosure
                key={r.id}
                summary={
                  <>
                    <VersionPill version={r.versionNumber} current />
                    {r.title}
                    {/* status and archived stay separate facts. `archived_at`
                        is orthogonal to the version's status, so an archived
                        requirement shows both chips rather than one standing
                        in for the other. The raw `eval_failed` enum reaches
                        the screen only through StatusBadge, which labels it
                        "Not satisfied". */}
                    <StatusBadge status={r.status} />
                    {r.archivedAt !== null ? (
                      <StatusBadge status="archived" />
                    ) : null}
                  </>
                }
              >
                <p className="lg-prose">{r.description}</p>
                <span className="lg-row-flex">
                  <Link href={`/requirements/${r.id}`}>
                    <Button
                      type="button"
                      tone="secondary"
                      size="sm"
                      iconEnd={<IconChevron size={ICON_SM} />}
                    >
                      Open requirement
                    </Button>
                  </Link>
                </span>
              </Disclosure>
            ))}
          </DisclosureList>
        )}
      </Section>
    </main>
  );
}
