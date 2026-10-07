"use client";

import { useState } from "react";
import { Spec } from "../Spec";
import {
  Breadcrumb,
  Button,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  ChecklistProgress,
  Checkbox,
  CommitSha,
  DescriptionList,
  Disclosure,
  DisclosureList,
  HashRef,
  ICON_MD,
  IconCommit,
  IconSatisfied,
  IconSealed,
  NavItem,
  NavStrip,
  PageHeader,
  RepoRef,
  Section,
  SectionHeading,
  SideNav,
  SideNavSection,
  StatusBadge,
  Table,
  Tabs,
  Td,
  Timeline,
  TimelineItem,
  VersionPill,
  Well,
} from "../../components";

export function Containers() {
  const [tab, setTab] = useState("report");

  return (
    <>
      <Spec
        name="Card"
        api="Card · CardHeader · CardBody · CardFooter"
        note="Bounded by rules, never lifted. Nothing in this system uses a shadow to say 'this is a group', because a 1px rule says it more precisely and survives dark mode without retuning. The only two things allowed to cast a shadow are toasts and popovers, which genuinely float above the document."
        layout="block"
      >
        <div className="lg-grid lg-grid--2">
          <Card>
            <CardHeader title="Claim 118" actions={<VersionPill version={4} current />} />
            <CardBody>
              <DescriptionList
                items={[
                  { term: "Repository", value: <RepoRef owner="kestrel-labs" name="attest-api" /> },
                  { term: "Commit", value: <CommitSha sha="4f2c9ab8e1d740c5b3aa92f0177de6c4419ab8e1" /> },
                  { term: "Submitted by", value: "arjun-mehrotra" },
                ]}
              />
            </CardBody>
            <CardFooter>
              <Button size="sm" tone="primary">
                Open report
              </Button>
              <Button size="sm" tone="quiet">
                History
              </Button>
            </CardFooter>
          </Card>

          <Card flush>
            <CardHeader title="Flush body" />
            <Table label="Requirement statuses">
              <thead>
                <tr>
                  <th>Requirement</th>
                  <th className="lg-table__cell--shrink">Status</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <Td>Rate limiting on the public API</Td>
                  <Td shrink>
                    <StatusBadge status="verified" />
                  </Td>
                </tr>
                <tr>
                  <Td>Audit log retains 90 days</Td>
                  <Td shrink>
                    <StatusBadge status="eval_failed" />
                  </Td>
                </tr>
                <tr>
                  <Td>Session tokens rotate on privilege change</Td>
                  <Td shrink>
                    <StatusBadge status="new" />
                  </Td>
                </tr>
              </tbody>
            </Table>
          </Card>
        </div>
      </Spec>

      <Spec
        name="Well"
        api="Well · --lg-well"
        note="Cut into the page rather than raised above it. Cards hold chrome the app wrote; wells hold data the system read, meaning digests, pinned SHAs, commit lists and evidence. Keeping those two visually opposed is what makes 'this is what was actually read' legible, and it is the one surface rule carried over from the first direction unchanged."
        layout="block"
      >
        <Well>
          <span className="lg-micro-label">Pinned inputs</span>
          <div
            className="lg-stack lg-stack--tight"
            style={{ marginTop: "var(--lg-space-2)" }}
          >
            <span className="lg-row-flex">
              <IconCommit size={ICON_MD} />
              <RepoRef owner="kestrel-labs" name="attest-api" />
              <CommitSha sha="4f2c9ab8e1d740c5b3aa92f0177de6c4419ab8e1" />
            </span>
            <span className="lg-row-flex">
              <IconSealed size={ICON_MD} />
              <HashRef
                algorithm="sha256"
                hash="9f3ac1d2b47e8850cc61a0f5e2d93b74be2049aa17c6f8e3d05b91427ac6de18"
              />
            </span>
          </div>
        </Well>
      </Spec>

      <Spec
        name="Page header"
        api="PageHeader title= above= lead= actions="
        note="The above slot is wayfinding only: a Breadcrumb, and nothing else. There is deliberately no eyebrow prop. A small uppercase label above a page title is decoration that reads as structure, and if the title needs one to be understood, the title is the thing to fix. Breadcrumbs earn the slot because they are navigable."
        layout="block"
      >
        <PageHeader
          above={
            <Breadcrumb
              items={[
                { label: "Projects", href: "#" },
                { label: "Attestation API", href: "#" },
                { label: "Claim 118" },
              ]}
            />
          }
          title="Claim 118"
          lead="Four requirement versions, read at two commits. Submitted 12 July 2026."
          actions={
            <>
              <Button size="sm">Export</Button>
              <Button size="sm" tone="primary">
                Re-evaluate
              </Button>
            </>
          }
        />
      </Spec>

      <Spec
        name="Section heading"
        api="Section · SectionHeading"
        note="The ink rule under a heading is this direction's signature, and it is typographic: it carries no state. Every other division on the page is a grey hairline, so the ink weight is what marks a heading as a heading without needing a size jump."
        layout="block"
      >
        <Section>
          <SectionHeading actions={<Button size="sm" tone="quiet">View all</Button>}>
            Evaluation history
          </SectionHeading>
          <p className="lg-prose">
            Re-evaluation is symmetric from any status. A requirement that came
            back not satisfied is not a dead end, and neither is one that has
            never been evaluated.
          </p>
        </Section>
      </Spec>

      <Spec
        name="Table"
        api="Table · Td"
        note="Ruled, not striped. Zebra rows fight with status chips for the reader's attention, and in a table whose whole job is to carry status that is a bad trade. Always wrapped in .lg-scroll-x, so wide content scrolls inside its own container and the page body never scrolls sideways."
        layout="block"
      >
        <Table label="Claims">
          <thead>
            <tr>
              <th>Claim</th>
              <th>Repository</th>
              <th>Commit</th>
              <th className="lg-table__cell--num">Requirements</th>
              <th className="lg-table__cell--shrink">Status</th>
            </tr>
          </thead>
          <tbody>
            <tr data-interactive="true">
              <Td>118</Td>
              <Td>
                <RepoRef owner="kestrel-labs" name="attest-api" />
              </Td>
              <Td mono>
                <CommitSha sha="4f2c9ab8e1d740c5b3aa92f0177de6c4419ab8e1" />
              </Td>
              <Td numeric>4</Td>
              <Td shrink>
                <StatusBadge status="verified" />
              </Td>
            </tr>
            <tr data-interactive="true">
              <Td>117</Td>
              <Td>
                <RepoRef owner="kestrel-labs" name="attest-api" />
              </Td>
              <Td mono>
                <CommitSha sha="b81e034c7a2f9915de44c0817bb3e9a20fc4d552" />
              </Td>
              <Td numeric>4</Td>
              <Td shrink>
                <StatusBadge status="eval_failed" />
              </Td>
            </tr>
            <tr data-interactive="true">
              <Td>116</Td>
              <Td>
                <RepoRef owner="kestrel-labs" name="attest-web" />
              </Td>
              <Td mono>
                <CommitSha sha="7cd5119a0b3e64f2ac8890d1e5b7743fa1029cc6" />
              </Td>
              <Td numeric>2</Td>
              <Td shrink>
                <StatusBadge status="new" />
              </Td>
            </tr>
          </tbody>
        </Table>
      </Spec>

      <Spec
        name="Description list"
        api="DescriptionList · .lg-dl"
        note="The spacing is carried by margins rather than a grid gap, because the space between a term and its own value has to be tighter than the space between one pair and the next, and a single gap value is by definition the same in both directions. Below 640px it stacks."
        layout="block"
      >
        <div className="gx-pair">
          <DescriptionList
            items={[
              { term: "Algorithm", value: "sha256" },
              {
                term: "Evidence digest",
                value: (
                  <HashRef hash="9f3ac1d2b47e8850cc61a0f5e2d93b74be2049aa17c6f8e3d05b91427ac6de18" />
                ),
              },
              { term: "Recorded", value: "12 July 2026, 14:08" },
            ]}
          />
          <DescriptionList
            stacked
            items={[
              { term: "Algorithm", value: "sha256" },
              {
                term: "Evidence digest",
                value: (
                  <HashRef hash="9f3ac1d2b47e8850cc61a0f5e2d93b74be2049aa17c6f8e3d05b91427ac6de18" />
                ),
              },
              { term: "Recorded", value: "12 July 2026, 14:08" },
            ]}
          />
        </div>
      </Spec>

      <Spec
        name="Tabs"
        api="Tabs · items= active= onSelect="
        note="The strip scrolls horizontally rather than wrapping. A two-line tab bar reorders itself as the label set changes, which destroys the muscle memory that is most of what tabs are for. Only the selected tab is in the tab order and arrow keys move between them, which is the ARIA tabs pattern."
        layout="block"
      >
        <Tabs
          label="Claim sections"
          active={tab}
          onSelect={setTab}
          items={[
            { id: "report", label: "Report" },
            { id: "requirements", label: "Requirements" },
            { id: "commits", label: "Commits" },
            { id: "evidence", label: "Evidence" },
            { id: "history", label: "History" },
          ]}
        />
      </Spec>

      <Spec
        name="Section strip"
        api="NavStrip · children= label= end="
        note="The same strip as Tabs, for sections that are separate pages. Not the tabs pattern: links to other URLs do not answer arrow keys and are not panels, so they are ordinary links marked aria-current='page' rather than aria-selected. The two share their look and only their look. The end slot pins a count or a progress track to the far edge, which is where a section heading would otherwise have carried it. Dropped into PageHeader's nav slot, its rule becomes the header's closing rule rather than a second one under it."
        layout="block"
      >
        <NavStrip
          label="Project sections"
          end={<ChecklistProgress statuses={["verified", "verified", "eval_failed", "new"]} />}
        >
          <a className="lg-tab" href="#" aria-current="page">
            Requirements
          </a>
          <a className="lg-tab" href="#">
            Claims
          </a>
          <a className="lg-tab" href="#">
            Repositories
          </a>
          <a className="lg-tab" href="#">
            Members
          </a>
        </NavStrip>
      </Spec>

      <Spec
        name="Side navigation"
        api="SideNav · SideNavSection · NavItem"
        note="The active state carries a left rule and a weight change as well as the accent tint, so it stays legible without relying on hue. Below 960px the whole thing becomes a horizontal scrolling strip above the content, and its section labels are dropped rather than costing a row of height for wayfinding the strip already provides."
        layout="block"
      >
        <div
          style={{
            border: "1px solid var(--lg-rule)",
            display: "flex",
            maxWidth: "20rem",
          }}
        >
          <SideNav label="Specimen navigation">
            <SideNavSection label="Project">
              <NavItem active icon={<IconSatisfied size={ICON_MD} />} count={14}>
                Requirements
              </NavItem>
              <NavItem count={7}>Claims</NavItem>
              <NavItem count={2}>Repositories</NavItem>
            </SideNavSection>
            <SideNavSection label="Account">
              <NavItem>Members</NavItem>
              <NavItem>Settings</NavItem>
            </SideNavSection>
          </SideNav>
        </div>
      </Spec>

      <Spec
        name="Timeline"
        api="Timeline · TimelineItem"
        note="A requirement's or a claim's history. There is no terminal item and no special styling on the last entry, because re-evaluation is symmetric from new, verified and eval_failed. What looks like the end is only the most recent event. Dates are absolute rather than relative: a claim pins specific commits, so every date here is a fact about the record and not about when the page was loaded."
        layout="block"
      >
        <Timeline>
          <TimelineItem
            marker={<IconCommit size={ICON_MD} />}
            title="Claim 118 submitted"
            at="2026-07-12T14:06:00Z"
            meta="· arjun-mehrotra"
          />
          <TimelineItem
            marker={<IconSatisfied size={ICON_MD} />}
            title="Rate limiting on the public API: satisfied"
            at="2026-07-12T14:08:00Z"
            meta="· version 4"
          />
          <TimelineItem
            marker={<IconSealed size={ICON_MD} />}
            title="Evidence bundle sealed"
            at="2026-07-12T14:08:00Z"
          >
            <HashRef hash="9f3ac1d2b47e8850cc61a0f5e2d93b74be2049aa17c6f8e3d05b91427ac6de18" />
          </TimelineItem>
        </Timeline>
      </Spec>

      <Spec
        name="Disclosure"
        api="Disclosure · DisclosureList"
        note="Native details/summary, so the open state, the keyboard handling, the aria-expanded announcement and in-page find-and-expand all come from the element rather than from a hand-rolled button. Ruled like the checklist rather than stacked as separate cards: a history is one object read top to bottom, and a border per entry turns one trail into a pile. The summary must carry whatever the reader needs in order to decide whether to open it: a row that only says 'Version 2' forces them to open all of them."
        layout="block"
      >
        <DisclosureList>
          <Disclosure
            defaultOpen
            summary={
              <>
                <VersionPill version={2} current /> Rate limiting on the public API
                <StatusBadge status="verified" />
              </>
            }
            meta="12 Jul 2026, 14:08"
          >
            <p className="lg-prose">
              Every public endpoint rejects a caller over 100 requests per minute
              with a 429 and a Retry-After header.
            </p>
            <Timeline label="Verdicts against version 2">
              <TimelineItem
                marker={<IconSatisfied size={ICON_MD} />}
                title="Satisfied"
                at="2026-07-12T14:08:00Z"
              />
            </Timeline>
          </Disclosure>
          <Disclosure
            summary={
              <>
                <VersionPill version={1} /> Rate limiting
                <StatusBadge status="eval_failed" />
              </>
            }
            meta="04 Jul 2026, 09:20"
          >
            <p className="lg-prose">Public endpoints should be rate limited.</p>
          </Disclosure>
          {/* With a `lead`: the checkbox sits beside the summary rather than
              inside it, so selecting an entry does not also expand it. */}
          <Disclosure
            lead={
              <Checkbox
                defaultChecked
                label={<span className="lg-sr-only">Select Audit log retains 90 days</span>}
              />
            }
            summary={
              <>
                Audit log retains 90 days
                <StatusBadge status="new" />
              </>
            }
          >
            <p className="lg-prose">
              Every privileged action is written to an append-only log kept for
              at least 90 days.
            </p>
          </Disclosure>
        </DisclosureList>
      </Spec>
    </>
  );
}
