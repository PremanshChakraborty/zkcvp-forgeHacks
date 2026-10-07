// apps/web/app/requirements/[id]/page.tsx
import Link from "next/link";
import {
  Alert,
  Breadcrumb,
  Button,
  DescriptionList,
  Disclosure,
  DisclosureList,
  ICON_MD,
  ICON_SM,
  IconChevron,
  IconNew,
  Mono,
  PageHeader,
  Section,
  SectionHeading,
  StatusBadge,
  Timeline,
  TimelineItem,
  VerdictBadge,
  VerdictStatement,
  VersionPill,
} from "@zkcvp/design-system-ledger/components";
import { getDb } from "../../../lib/db";
import { requireSession } from "../../../lib/auth/session";
import { getProject } from "../../../lib/projects/service";
import {
  getRequirement,
  type VerdictEntry,
} from "../../../lib/requirements/service";
import { ArchiveButton } from "./ArchiveButton";

/** Absolute dates throughout this product, never relative. */
const dateTimeFormat = new Intl.DateTimeFormat("en-GB", {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * One verdict, without its rationale.
 *
 * The rationale is a paragraph and this page carries up to one of these per
 * evaluation per version; rendering them all here would bury the checklist
 * under prose that the claim page presents properly, next to the pinned commits
 * and the sealed evidence digest the rationale is actually about. So the link
 * is not a convenience, it is where the rest of this verdict lives.
 *
 * The marker is the neutral `IconNew` on every row, deliberately: `VerdictBadge`
 * already says what happened, and a second status-coded glyph beside it would
 * encode the same fact twice. Version history below follows the same rule.
 */
function VerdictEntryItem({ entry }: { entry: VerdictEntry }) {
  return (
    <TimelineItem
      marker={<IconNew size={ICON_MD} />}
      title={<VerdictBadge verdict={entry.verdict} />}
      /* Not TimelineItem's `at` prop, which formats in the reader's locale:
       * this page pins en-GB, and two date formats on one screen is worse than
       * a hand-built stamp. `<time>` keeps the value machine-readable anyway. */
      meta={
        <time dateTime={entry.createdAt.toISOString()}>
          {dateTimeFormat.format(entry.createdAt)}
        </time>
      }
    >
      <span className="lg-row-flex lg-row-flex--wrap">
        <span className="lg-caption">
          Evaluated by <Mono>{entry.modelId}</Mono>
        </span>
        {/* A control, not a sentence with a line under it. The chevron carries
            the direction and the label carries the destination; a bare
            underlined phrase in a list of them reads as unstyled hypertext. */}
        <Link href={`/claims/${entry.claimId}`}>
          <Button
            type="button"
            tone="quiet"
            size="sm"
            iconEnd={<IconChevron size={ICON_SM} />}
          >
            View the claim
          </Button>
        </Link>
      </span>
    </TimelineItem>
  );
}

export default async function RequirementPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  /* Any member reads this page; getRequirement enforces membership of the
   * requirement's project. Only the two mutating affordances below are
   * stakeholder-only. */
  const session = await requireSession();
  const db = getDb();
  const { requirement, versionHistory, verdictsByVersion } =
    await getRequirement(db, session, id);

  /* Only for the trail. `getRequirement` already proved membership of this
   * project, so this cannot widen what the visitor can reach — it re-reads a
   * row they have just been authorised against, to put a name on it. A
   * requirement reached from a link used to be a dead end that never said which
   * checklist it belonged to. */
  const project = await getProject(db, session, requirement.projectId);

  const archived = requirement.archivedAt !== null;
  const isStakeholder = session.kind === "stakeholder";

  /* The service orders each version's verdicts newest first, so the current
   * version's newest verdict is [0]. No second query and no second ordering
   * rule: "the latest verdict" and "the first entry for the current version"
   * are the same row by construction. */
  const latestVerdict =
    verdictsByVersion.get(requirement.currentVersionId)?.[0] ?? null;

  /* The history section earns its place only when it holds something the head
   * of the page does not already show. At v1 with at most one verdict it holds
   * nothing else: same title, same description, same status, same date, same
   * verdict, one row restating the two cards above it. Every requirement on a
   * new checklist is in exactly that state, so this is the common case rather
   * than the edge one. */
  const verdictCount = [...verdictsByVersion.values()].reduce(
    (n, list) => n + list.length,
    0,
  );
  const showHistory = versionHistory.length > 1 || verdictCount > 1;

  return (
    <main className="lg-container app-page">
      <PageHeader
        /* Archived dims the title and nothing more — never struck through,
         * never emptied (docs/architecture.md, "Display rules"). `title` is a
         * ReactNode, and `lg-text-muted` is a general Ledger tone utility, so
         * this composes the design system rather than restyling it. */
        title={
          archived ? (
            <span className="lg-text-muted">{requirement.title}</span>
          ) : (
            requirement.title
          )
        }
        above={
          <Breadcrumb
            items={[
              { label: "Projects", href: "/projects" },
              {
                label: project.name,
                href: `/projects/${requirement.projectId}`,
              },
              { label: requirement.title },
            ]}
          />
        }
        lead={`Created ${dateTimeFormat.format(requirement.createdAt)}`}
        actions={
          /* An archived requirement cannot be edited — editRequirement returns
           * 404 for one — so the affordance is not offered rather than offered
           * and then rejected. Archiving is likewise withheld: there is no
           * un-archive in this phase and nothing left to archive. */
          isStakeholder && !archived ? (
            <>
              <Link href={`/requirements/${id}/edit`}>
                <Button type="button" tone="secondary">
                  Edit
                </Button>
              </Link>
              <ArchiveButton requirementId={id} />
            </>
          ) : undefined
        }
      />

      {/* PageHeader carries its own bottom margin; the blocks after it do not,
          so they are stacked rather than left flush against each other. */}
      <div className="lg-stack lg-stack--loose">
        {archived ? (
          <Alert tone="info" title="This requirement is archived">
            It no longer appears on the project&rsquo;s checklist and can no
            longer be edited. Archiving is separate from verification — it says
            nothing about whether this requirement was ever verified — and there
            is no un-archive in this phase.
          </Alert>
        ) : null}

        {/* The two questions a reader arrives with, answered side by side:
            what does this requirement currently say, and what did the Evaluator
            last make of it.

            The sides are built out of opposite materials on purpose. The
            requirement is text a person wrote, so it sits flat on the page as a
            document, with nothing but a label and a version stamp over it: a
            card around a paragraph adds a border and takes away the reading.
            The verdict is the Evaluator's conclusion, so it is a bordered panel
            whose hairline is tinted by the verdict itself, the same tint
            `VerdictCard` uses on the claim page. A reader scanning a checklist
            of these finds the outcome by edge colour before reading a word. */}
        <div className="app-req-head">
          <div className="lg-stack lg-stack--tight">
            {/* Label and version stamp on one line, mirroring the panel's own
             * "Evaluator verdict" label opposite. No status chip: it reported
             * the current version's status, which is derived from the very
             * verdict in the panel beside it, so the two said the same thing
             * twice in two vocabularies. Archived stays, because `archived_at`
             * is orthogonal to status (plan 01, invariant 5) and nothing else
             * on this page carries it. */}
            <span className="lg-row-flex lg-row-flex--wrap">
              <span className="lg-micro-label">Current version</span>
              <VersionPill version={requirement.versionNumber} current />
              {requirement.archivedAt ? (
                <span className="lg-row-flex">
                  <StatusBadge status="archived" />
                  <span className="lg-caption">
                    {dateTimeFormat.format(requirement.archivedAt)}
                  </span>
                </span>
              ) : null}
            </span>
            <p className="lg-prose">{requirement.description}</p>
          </div>

          {latestVerdict ? (
            /* "Latest verdict", not the component's default "Evaluator
               verdict". On a report view the label names who produced the
               verdict; here the page shows a whole trail of them below, so
               what the reader needs is which one this is. */
            <VerdictStatement
              verdict={latestVerdict.verdict}
              size="panel"
              label="Latest verdict"
            >
              {/* Below the rule: the facts that qualify the verdict, in the
                  same two terms and the same order the claim page uses under
                  "Evaluation record", so following the button lands on a
                  fuller version of what was just read rather than on a
                  differently shaped restatement of it. */}
              <DescriptionList
                items={[
                  {
                    term: "Evaluated",
                    value: (
                      <time dateTime={latestVerdict.createdAt.toISOString()}>
                        {dateTimeFormat.format(latestVerdict.createdAt)}
                      </time>
                    ),
                  },
                  { term: "Model", value: <Mono>{latestVerdict.modelId}</Mono> },
                ]}
              />
              {/* The rationale is deliberately not on this page: it belongs
                  beside the pinned commits and the sealed evidence digest it
                  argues from. The button names where it goes rather than what
                  the reader will do when they arrive. */}
              <span className="lg-row-flex">
                <Link href={`/claims/${latestVerdict.claimId}`}>
                  <Button
                    type="button"
                    tone="secondary"
                    size="sm"
                    iconEnd={<IconChevron size={ICON_SM} />}
                  >
                    View claim
                  </Button>
                </Link>
              </span>
            </VerdictStatement>
          ) : (
            /* No verdict has a panel of its own rather than an empty one: an
               outcome-tinted border around "there is no outcome" would be the
               one thing this surface must never imply. Not an error and not a
               wait either, since there is no in-flight state in this product. */
            <div className="app-req-noverdict lg-stack lg-stack--tight">
              <span className="lg-micro-label">Latest verdict</span>
              <p className="lg-body lg-text-muted">
                None yet. This version has not been claimed, so nothing has read
                the code against it.
              </p>
            </div>
          )}
        </div>

        {showHistory ? (
          <Section>
            <SectionHeading>Version history</SectionHeading>
            {/* Versions are immutable: an edit writes a new one and never
                alters an old one, so this is an audit trail and is shown in
                full, oldest first, exactly as the service returns it. The
                current version is included: seeing the trail end where the card
                above begins is what confirms the card is the latest.

                Collapsed by default, all of them. The description of the
                current version is already on this page in full, and the older
                descriptions are what a reader opens the trail to compare
                rather than what they need to scan. Each summary row still
                carries the version, the title, the outcome and the evaluation
                count, so nothing here has to be opened to be found. */}
            <DisclosureList>
              {versionHistory.map((v) => {
                /* Reversed to oldest-first. The service orders each version's
                 * verdicts newest-first so that [0] is the latest, which the
                 * card above needs; inside the trail every other list on this
                 * page runs forward in time, and one list running backward
                 * among them reads as a bug rather than as a choice. */
                const entries = [...(verdictsByVersion.get(v.id) ?? [])].reverse();

                return (
                  <Disclosure
                    key={v.id}
                    summary={
                      <>
                        <VersionPill
                          version={v.versionNumber}
                          current={v.id === requirement.currentVersionId}
                        />
                        {v.title}
                        {/* The raw enum never reaches the screen — StatusBadge
                            owns the label, and `eval_failed` reads "Not
                            satisfied". */}
                        <StatusBadge status={v.status} />
                      </>
                    }
                    meta={
                      <>
                        <time dateTime={v.createdAt.toISOString()}>
                          {dateTimeFormat.format(v.createdAt)}
                        </time>
                        {/* How many times this version was evaluated, which the
                            status chip cannot say: a version evaluated four
                            times and one evaluated once both read "Verified".
                            It is also what tells the reader whether opening
                            this row is worth a click. */}
                        {entries.length > 0
                          ? ` · ${entries.length} ${
                              entries.length === 1 ? "verdict" : "verdicts"
                            }`
                          : null}
                      </>
                    }
                  >
                    {/* `lg-prose`, matching the card above. base.css scopes that
                        class to "evaluator rationales and requirement
                        descriptions", which is exactly this, and `lg-body` had
                        it set brighter and to the full container width, so a
                        superseded version read as more prominent than the
                        current one. */}
                    <p className="lg-prose">{v.description}</p>

                    {entries.length > 0 ? (
                      <Timeline
                        label={`Verdicts against version ${v.versionNumber}`}
                      >
                        {entries.map((entry) => (
                          <VerdictEntryItem key={entry.claimId} entry={entry} />
                        ))}
                      </Timeline>
                    ) : (
                      <p className="lg-caption">
                        No claim has ever named this version.
                      </p>
                    )}
                  </Disclosure>
                );
              })}
            </DisclosureList>
          </Section>
        ) : null}
      </div>
    </main>
  );
}
