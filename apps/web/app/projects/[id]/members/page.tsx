// apps/web/app/projects/[id]/members/page.tsx
import {
  Badge,
  Breadcrumb,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  PageHeader,
  RoleTag,
  Section,
  SectionHeading,
  Table,
  Td,
} from "@zkcvp/design-system-ledger/components";
import { getDb } from "../../../../lib/db";
import { requireSession } from "../../../../lib/auth/session";
import { getProject } from "../../../../lib/projects/service";
import { listMembers } from "../../../../lib/projects/members";
import { InviteForm } from "./InviteForm";
import { ProjectNav } from "../ProjectNav";

/** Absolute dates throughout this product, never relative. */
const dateFormat = new Intl.DateTimeFormat("en-GB", {
  year: "numeric",
  month: "short",
  day: "numeric",
});

export default async function MembersPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  /* Both roles read this page — plan 01's matrix, "List project members": a
   * stakeholder member and a developer member both pass. getProject and
   * listMembers each enforce membership, so no separate guard is needed. */
  const session = await requireSession();
  const db = getDb();

  const project = await getProject(db, session, id);
  const { members, pendingInvites } = await listMembers(db, session, id);

  /* getProject already threw for a non-member, and isProjectMember resolves a
   * stakeholder session through isStakeholderMember — so a stakeholder session
   * that reached this line IS a stakeholder member of this project, and the
   * role check is the membership check. inviteDeveloper asserts it again on
   * submit; this only decides whether the form is offered at all. */
  const canInvite = session.kind === "stakeholder";

  return (
    <main className="lg-container app-page">
      {/* The title used to be `${project.name} — members`: a breadcrumb jammed
          into an <h1> because there was no breadcrumb. The trail carries the
          project now, so the heading can name only this page. */}
      <PageHeader
        title="Members"
        above={
          <Breadcrumb
            items={[
              { label: "Projects", href: "/projects" },
              { label: project.name, href: `/projects/${id}` },
              { label: "Members" },
            ]}
          />
        }
        lead="Developers on this project, and anyone invited who has not signed in yet."
        nav={<ProjectNav projectId={id} active="members" />}
      />

      {/* PageHeader carries its own bottom margin; the blocks after it do not. */}
      <div className="lg-stack lg-stack--loose">
        <Section>
          {members.length === 0 ? (
            <EmptyState title="No developers yet">
              {pendingInvites.length > 0
                ? "Everyone invited so far joins this project the first time they sign in with GitHub."
                : canInvite
                  ? "Invite one below by GitHub username."
                  : "A stakeholder invites developers to this project by GitHub username."}
            </EmptyState>
          ) : (
            /* `flush` zeroes the card body's padding so the table's own rules
               run to the card's edges rather than floating inside a gutter. */
            <Card flush>
              <CardBody>
                <Table label="Developers on this project">
                  <thead>
                    <tr>
                      <th>Developer</th>
                      <th>GitHub</th>
                      <th className="lg-table__cell--shrink">Added</th>
                    </tr>
                  </thead>
                  <tbody>
                    {members.map((m) => (
                      /* Keyed by the developer row id. Never by the username —
                         plan 01: `github_user_id` is "GitHub's **numeric** user
                         ID — never the username. Usernames are mutable; this
                         must not be." A key that changed when someone renamed
                         their GitHub account would remount the wrong row. */
                      <tr key={m.developerId}>
                        <Td>
                          <span className="lg-row-flex lg-row-flex--wrap">
                            {m.displayName}
                            <RoleTag role="developer" />
                          </span>
                        </Td>
                        {/* The username is a cached display value. The numeric
                            id is what this project actually joined on, so it
                            rides along rather than being implied away. */}
                        <Td mono title={`GitHub user id ${m.githubUserId}`}>
                          {m.githubUsername}
                        </Td>
                        <Td shrink>{dateFormat.format(m.addedAt)}</Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </CardBody>
            </Card>
          )}
        </Section>

        {/* Absent rather than empty: a "no pending invites" panel is a row of
            chrome reporting the ordinary case. */}
        {pendingInvites.length > 0 && (
          <Section>
            <SectionHeading>Pending invites</SectionHeading>
            <p className="lg-caption">
              These people do not have an account here yet. Each one joins this
              project the first time they sign in with GitHub.
            </p>
            <Card flush>
              <CardBody>
                <Table label="Pending invites">
                  <thead>
                    <tr>
                      <th>GitHub</th>
                      <th className="lg-table__cell--shrink">Invited</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* Keyed by the invite row id, for the same reason the
                        roster is keyed by the developer id. */}
                    {pendingInvites.map((i) => (
                      <tr key={i.id}>
                        <Td mono title={`GitHub user id ${i.githubUserId}`}>
                          <span className="lg-row-flex lg-row-flex--wrap">
                            {i.githubUsername}
                            <Badge>Pending</Badge>
                          </span>
                        </Td>
                        <Td shrink>{dateFormat.format(i.invitedAt)}</Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </CardBody>
            </Card>
          </Section>
        )}

        {/* Only a stakeholder member may invite — plan 01's matrix, "Invite a
            developer". A developer member reads the roster above and is offered
            nothing here rather than a form that would be refused. */}
        {canInvite && (
          <Card>
            <CardHeader title="Invite a developer" />
            <CardBody>
              <InviteForm projectId={id} />
            </CardBody>
          </Card>
        )}
      </div>
    </main>
  );
}
