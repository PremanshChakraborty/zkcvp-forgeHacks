// apps/web/app/projects/[id]/repos/page.tsx
import {
  Breadcrumb,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  PageHeader,
  RepoRef,
  Section,
  Table,
  Td,
} from "@zkcvp/design-system-ledger/components";
import type { GithubRepo } from "@zkcvp/github";
import { getDb } from "../../../../lib/db";
import { requireSession } from "../../../../lib/auth/session";
import { getProject } from "../../../../lib/projects/service";
import { ServiceError } from "../../../../lib/api/errors";
import {
  listAttachedRepos,
  listCandidateRepos,
  UNDO_WINDOW_MS,
} from "../../../../lib/repos/service";
import { splitFullName } from "../../../../lib/repos/full-name";
import { AttachRepoForm } from "./AttachRepoForm";
import { ProjectNav } from "../ProjectNav";

/** Absolute dates throughout this product, never relative. */
const dateFormat = new Intl.DateTimeFormat("en-GB", {
  year: "numeric",
  month: "short",
  day: "numeric",
});

export default async function ReposPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  /* Both roles read this page — plan 02's matrix: a stakeholder member and a
   * developer member both see the attached list. getProject and
   * listAttachedRepos each enforce membership, so no separate guard is
   * needed here. */
  const session = await requireSession();
  const db = getDb();

  const project = await getProject(db, session, id);
  const repos = await listAttachedRepos(db, session, id);

  /* The picker and the undo affordance spend the acting developer's own
   * GitHub token. A stakeholder has no GitHub identity to spend, so this is
   * a statement about capability, not about trust — the same shape as
   * `canInvite` on the members page. listCandidateRepos asserts developer
   * membership again on its own; this only decides whether it is called at
   * all. */
  const isDeveloper = session.kind === "developer";
  let candidates: GithubRepo[] = [];
  let candidatesUnavailable = false;
  if (isDeveloper) {
    try {
      candidates = await listCandidateRepos(db, session, id);
    } catch (e) {
      /* A rate-limited or unreachable GitHub must not take the whole screen
       * down with it — this app has no error.tsx anywhere, so an uncaught
       * throw from a Server Component replaces the entire page, including
       * the attached-repos table above, which makes no GitHub call at all
       * and which a stakeholder member is entitled to read regardless of
       * GitHub's state. Only the picker degrades; it renders its own danger
       * alert instead. Mirrors how the members screen treats the same
       * failure from inviteDeveloper (see members/actions.ts). */
      if (e instanceof ServiceError && e.code === "github_unavailable") {
        candidatesUnavailable = true;
      } else {
        throw e;
      }
    }
  }

  return (
    <main className="lg-container app-page">
      <PageHeader
        title="Repositories"
        above={
          <Breadcrumb
            items={[
              { label: "Projects", href: "/projects" },
              { label: project.name, href: `/projects/${id}` },
              { label: "Repositories" },
            ]}
          />
        }
        lead="Repositories a developer has attached from their own GitHub account."
        nav={<ProjectNav projectId={id} active="repositories" />}
      />

      <div className="lg-stack lg-stack--loose">
        <Section>
          {repos.length === 0 ? (
            <EmptyState title="No repositories attached yet">
              {isDeveloper
                ? "Attach one below from your GitHub account."
                : "A developer on this project attaches repositories from their own GitHub account."}
            </EmptyState>
          ) : (
            <Card flush>
              <CardBody>
                <Table label="Repositories attached to this project">
                  <thead>
                    <tr>
                      <th>Repository</th>
                      <th className="lg-table__cell--shrink">Attached</th>
                    </tr>
                  </thead>
                  <tbody>
                    {repos.map((r) => {
                      const { owner, name } = splitFullName(r.fullName);
                      return (
                        /* Keyed by the attachment row id, never by the repo
                         * name — plan 02's join key is `github_repo_id`, and
                         * `full_name` may go stale after a rename. */
                        <tr key={r.id}>
                          <Td>
                            <RepoRef owner={owner} name={name} />
                          </Td>
                          <Td shrink>{dateFormat.format(r.addedAt)}</Td>
                        </tr>
                      );
                    })}
                  </tbody>
                </Table>
              </CardBody>
            </Card>
          )}
        </Section>

        {/* Only a developer member may attach or remove — both spend their
         * own GitHub token, which a stakeholder does not have. */}
        {isDeveloper && (
          <Card>
            <CardHeader title="Attach a repository" />
            <CardBody>
              <div className="lg-stack">
                <p className="lg-caption">
                  Attaching is reversible for{" "}
                  {Math.round(UNDO_WINDOW_MS / 1000)} seconds. After that a
                  repository stays attached for the life of this project —
                  there is no separate remove.
                </p>
                <AttachRepoForm
                  projectId={id}
                  candidates={candidates}
                  unavailable={candidatesUnavailable}
                />
              </div>
            </CardBody>
          </Card>
        )}
      </div>
    </main>
  );
}
