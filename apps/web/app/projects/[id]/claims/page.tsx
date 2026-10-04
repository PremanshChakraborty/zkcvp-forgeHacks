// apps/web/app/projects/[id]/claims/page.tsx
import Link from "next/link";
import {
  Breadcrumb,
  Button,
  CommitSha,
  EmptyState,
  Mono,
  PageHeader,
  RepoRef,
  Section,
  ICON_MD,
  IconWarning,
  Table,
  Td,
} from "@zkcvp/design-system-ledger/components";
import { getDb } from "../../../../lib/db";
import { requireSession } from "../../../../lib/auth/session";
import { getProject } from "../../../../lib/projects/service";
import { listClaims, type ClaimSummary } from "../../../../lib/claims/service";
import { splitFullName } from "../../../../lib/repos/full-name";
import { ClaimRow } from "./ClaimRow";
import { ProjectNav } from "../ProjectNav";

/** Absolute dates throughout this product, never relative. */
const dateTimeFormat = new Intl.DateTimeFormat("en-GB", {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * A count that does not exist, as opposed to a count of zero.
 *
 * A plain hyphen, in the row's muted ink. Writing 0 here would be false twice
 * over: nothing was evaluated, and zero satisfied is a real outcome that a
 * reader scanning this column has to be able to find.
 */
function Absent() {
  return (
    <>
      <span className="lg-text-muted" aria-hidden="true">
        -
      </span>
      <span className="lg-sr-only">No count</span>
    </>
  );
}

/**
 * The one-glyph column: the run that never produced a report.
 *
 * One state, and only one. A negative verdict used to be marked here too and
 * that mark is gone: the NOT SATISFIED column already counts them, in a band
 * tinted for exactly that, so the glyph repeated a number the eye had just
 * read. Worse, it repeated it in a shape that reads as an alert, and a
 * not-satisfied verdict is the correct output of a run that worked.
 *
 * What is left is the row where something genuinely did not happen: the request
 * was cut off and no report was ever written. Ochre, which is the only place on
 * this screen that tone appears, so it cannot be confused with either verdict.
 */
function ClaimFlag({ outcome }: { outcome: ClaimSummary["outcome"] }) {
  if (outcome !== null) return null;

  const note = "Run interrupted. No report was recorded for this claim.";

  return (
    <span className="app-claim-flag" title={note}>
      <IconWarning size={ICON_MD} />
      <span className="lg-sr-only">{note}</span>
    </span>
  );
}

export default async function ProjectClaimsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  /* Any project member reads this, stakeholders included, on the same reasoning
   * as the claim page itself: a report is unconditionally visible the moment it
   * exists, and this screen carries strictly less than the report does.
   * listClaims enforces membership on its own. */
  const session = await requireSession();
  const db = getDb();

  const project = await getProject(db, session, id);
  const claims = await listClaims(db, session, id);

  const isStakeholder = session.kind === "stakeholder";

  return (
    <main className="lg-container app-page">
      <PageHeader
        title="Claims"
        above={
          <Breadcrumb
            items={[
              { label: "Projects", href: "/projects" },
              { label: project.name, href: `/projects/${id}` },
              { label: "Claims" },
            ]}
          />
        }
        lead="Every claim submitted against this project, newest first. Each one pins the exact commits the Evaluator read."
        actions={
          /* Only a developer member submits a claim: it spends their own GitHub
           * token, the same reasoning the project page and the repos page use.
           * A stakeholder reads this list and composes nothing. */
          !isStakeholder ? (
            <Link href={`/projects/${id}/claims/new`}>
              <Button type="button" tone="primary">
                Submit a claim
              </Button>
            </Link>
          ) : undefined
        }
        nav={<ProjectNav projectId={id} active="claims" />}
      />

      <Section>
        {claims.length === 0 ? (
          <EmptyState
            title="No claims yet"
            actions={
              !isStakeholder ? (
                <Link href={`/projects/${id}/claims/new`}>
                  <Button type="button" tone="primary">
                    Submit the first claim
                  </Button>
                </Link>
              ) : undefined
            }
          >
            {isStakeholder
              ? "Claims appear here once a developer submits one. Each names the commits it wants evaluated, and the verdict lands the moment the Evaluator finishes."
              : "A claim names the commits you want read and the requirements you are claiming they satisfy."}
          </EmptyState>
        ) : (
          <Table label="Claims">
            <thead>
              <tr>
                {/* Pinned commits is the one column that takes the slack, and
                    everything else collapses to its content. Identity on the
                    left, measurements on the right, the action last: that way
                    the empty space lands inside a single left-aligned cell,
                    where it reads as margin, instead of opening a gap between
                    two columns that describe the same claim. */}
                <th className="lg-table__cell--shrink">Submitted</th>
                <th className="lg-table__cell--shrink">By</th>
                <th>Pinned commits</th>
                {/* Counts, right-aligned and tabular, so a column of them can
                    be compared down the page rather than read one row at a
                    time. Each carries a tinted band from the header to the last
                    row: a verdict is per requirement version and never per
                    claim, so the colour belongs to the COLUMN, which is a
                    standing fact about what is counted there, rather than to a
                    chip in a cell, which would read as this claim's own
                    verdict. Hairline tints at low alpha, square to the grid —
                    the tint is a band down the table, not a pill in a cell.

                    Total is the requirements the claim pinned, which is known
                    even when the run produced no verdicts at all, so it takes
                    the neutral band rather than a verdict hue. */}
                <th className="lg-table__cell--shrink lg-table__cell--num app-count app-count--satisfied">
                  Satisfied
                </th>
                <th className="lg-table__cell--shrink lg-table__cell--num app-count app-count--unsatisfied">
                  Not satisfied
                </th>
                <th className="lg-table__cell--shrink lg-table__cell--num app-count app-count--total">
                  Total
                </th>
                <th className="lg-table__cell--shrink">
                  {/* One glyph wide and headed by nothing visible: a word over
                      a column that is empty on all but the interrupted rows
                      would weigh more than the marks it labels. */}
                  <span className="lg-sr-only">Run status</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {claims.map((claim) => {
                const submitted = dateTimeFormat.format(claim.submittedAt);
                return (
                  <ClaimRow key={claim.id} href={`/claims/${claim.id}`}>
                    <Td shrink>
                      {/* The row's real link, and the reason the row can be
                          clickable at all. Set in the row's own ink rather
                          than the accent: it is the whole row that is the
                          target, and one blue date in a table of black ones
                          would advertise the wrong hit area. */}
                      <Link
                        href={`/claims/${claim.id}`}
                        className="app-claim-row__link"
                        aria-label={`Open the claim submitted ${submitted}`}
                      >
                        <time dateTime={claim.submittedAt.toISOString()}>
                          {submitted}
                        </time>
                      </Link>
                    </Td>
                    {/* The GitHub username is a display cache, never the join
                        key, and it is set in mono because it is an identifier
                        the developer will recognise character for character. */}
                    <Td shrink>
                      <Mono>{claim.submittedBy}</Mono>
                    </Td>
                    <Td>
                      {/* A claim may pin at most one commit per repo but any
                          number of repos, so this stacks rather than assuming
                          one. The SHA truncates to seven characters and keeps
                          the full value in its title and copy payload.

                          A repo and its SHA hold one line and never wrap,
                          unlike the same pair on the claim page: this one is
                          inside a table, and a table narrows by scrolling in
                          its own box, not by folding every row to twice the
                          height. */}
                      <span className="lg-stack lg-stack--tight">
                        {claim.commits.map((c) => {
                          const { owner, name } = splitFullName(c.fullName);
                          return (
                            <span
                              key={`${c.fullName}@${c.commitSha}`}
                              className="lg-row-flex"
                            >
                              <RepoRef owner={owner} name={name} />
                              <CommitSha sha={c.commitSha} />
                            </span>
                          );
                        })}
                      </span>
                    </Td>
                    {/* The bands run every row, evaluated or not. They belong
                        to the column, which is a standing fact about what is
                        counted there, so dropping them on one row broke the
                        table into two tables. An interrupted run has no verdict
                        counts to show, so those two cells hold a dash: the
                        count is absent, not zero, and zero satisfied is a real
                        result that must keep its own reading. Total survives,
                        because the requirements a claim pinned are known
                        whether or not anything ever read them. */}
                    <Td shrink numeric className="app-count app-count--satisfied">
                      {claim.outcome ? claim.outcome.satisfied : <Absent />}
                    </Td>
                    <Td
                      shrink
                      numeric
                      className="app-count app-count--unsatisfied"
                    >
                      {claim.outcome ? claim.outcome.notSatisfied : <Absent />}
                    </Td>
                    <Td shrink numeric className="app-count app-count--total">
                      {claim.requirementCount}
                    </Td>
                    <Td shrink className="app-claim-flag-cell">
                      <ClaimFlag outcome={claim.outcome} />
                    </Td>
                  </ClaimRow>
                );
              })}
            </tbody>
          </Table>
        )}
      </Section>
    </main>
  );
}
