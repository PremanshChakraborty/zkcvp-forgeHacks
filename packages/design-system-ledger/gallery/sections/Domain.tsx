"use client";

import { Spec } from "../Spec";
import {
  ChecklistProgress,
  CommitList,
  CommitRow,
  CommitSha,
  EvidenceLock,
  FileRef,
  LogRef,
  RepoRef,
  RequirementList,
  RequirementRow,
  RoleTag,
  VerdictCard,
  VerdictStatement,
  Well,
  type RequirementDisplayStatus,
} from "../../components";

/*
 * Specimen data. A fictional project, plausible commit subjects, real-shaped
 * digests.
 *
 * Nothing here invents a customer, a metric, a benchmark or an endorsement, and
 * no rationale below is presented as output from the Evaluator, because the
 * Evaluator does not exist yet. These are shapes for real content to land in.
 */

const STATUSES: RequirementDisplayStatus[] = [
  "verified",
  "verified",
  "eval_failed",
  "verified",
  "new",
  "verified",
  "archived",
  "verified",
];

export function Domain() {
  return (
    <>
      <Spec
        name="Requirement checklist"
        api="RequirementList · RequirementRow · ChecklistProgress"
        note="The status a row shows is its current version's status, resolved through requirements.current_version_id at read time. The component takes it as a prop and assumes a join produced it, because storing effective status on the requirement is forbidden. Note the archived row: its title dims but its badge stays at full strength, since archiving says nothing about whether the requirement was ever verified and hiding that history would be a lie of omission."
        layout="block"
      >
        <div style={{ marginBottom: "var(--lg-space-4)" }}>
          <ChecklistProgress statuses={STATUSES} />
        </div>

        <RequirementList>
          <RequirementRow
            title="Rate limiting on the public API"
            description="Requests are limited per token, and exceeding the limit returns 429 with a Retry-After header."
            status="verified"
            version={4}
          />
          <RequirementRow
            title="Audit log retains 90 days"
            description="Every privileged action is written to an append-only log that is retained for at least 90 days."
            status="eval_failed"
            version={2}
          />
          <RequirementRow
            title="Session tokens rotate on privilege change"
            status="new"
            version={1}
          />
          <RequirementRow
            title="Webhook payloads are signed"
            description="Retired in favour of the polling endpoint."
            status="verified"
            version={3}
            archived
          />
        </RequirementList>
      </Spec>

      <Spec
        name="A negative verdict is not an error"
        api="StatusBadge status=eval_failed"
        note="The single most important rendering decision in this system. requirement_versions.status stores a negative verdict as eval_failed, a column name that reads like a malfunction and is not one: per the transition table, the Evaluator returning 'not satisfied' is what writes it. So it renders as 'Not satisfied' in solid ink, never in red, and the raw enum name never reaches a screen. Red is reserved for the run not finishing at all, which says nothing about the code."
        layout="block"
      >
        <div className="gx-pair">
          <VerdictCard
            requirementTitle="Rate limiting on the public API"
            verdict="satisfied"
            rationale={
              <>
                <p>
                  A token bucket limiter is applied to every route under the
                  public router, configured per API token rather than per IP. The
                  handler returns 429 and sets Retry-After from the bucket's
                  refill interval.
                </p>
                <p>
                  Tests cover the exhausted-bucket path and assert the header is
                  present on the rejection.
                </p>
              </>
            }
            footer={
              <>
                <FileRef path="src/http/limiter.ts" lines={[34, 91]} />
                <FileRef path="src/http/router.ts" lines={12} />
                <CommitSha sha="4f2c9ab8e1d740c5b3aa92f0177de6c4419ab8e1" />
              </>
            }
          />

          <VerdictCard
            requirementTitle="Audit log retains 90 days"
            verdict="not_satisfied"
            rationale={
              <>
                <p>
                  Privileged actions are written to an append-only table, so the
                  write path satisfies the first half of the requirement.
                </p>
                <p>
                  No retention policy was found. The migration that creates the
                  table sets no TTL, and there is no scheduled job that prunes or
                  archives older rows, so a 90 day floor is not established
                  anywhere in the code that was read.
                </p>
              </>
            }
            footer={
              <>
                <FileRef path="migrations/0014_audit_log.sql" />
                <FileRef path="src/audit/write.ts" lines={[8, 40]} />
                <CommitSha sha="4f2c9ab8e1d740c5b3aa92f0177de6c4419ab8e1" />
              </>
            }
          />
        </div>
      </Spec>

      <Spec
        name="Verdict statement"
        api="VerdictStatement"
        note="The headline verdict on a stakeholder's report view, and the reason this direction carries a display type size at all. A negative verdict is set in plain ink rather than tinted: it does not need a hue to be emphatic, and giving it one would put it next to the red this system reserves for things that actually broke."
        layout="block"
      >
        <div className="gx-pair">
          <VerdictStatement verdict="satisfied" requirementCount={4} />
          <VerdictStatement verdict="not_satisfied" requirementCount={1} />
          {/* The panel size, for a page that already has a headline of its own.
              Same statement, smaller value, and a hairline tinted by the
              verdict the way VerdictCard tints its own. */}
          <VerdictStatement verdict="satisfied" size="panel">
            <span className="lg-caption">12 Jul 2026, 14:08</span>
          </VerdictStatement>
          <VerdictStatement verdict="not_satisfied" size="panel">
            <span className="lg-caption">04 Jul 2026, 09:20</span>
          </VerdictStatement>
        </div>
      </Spec>

      <Spec
        name="Rationales are prose, never code"
        api=".lg-verdict-card__rationale"
        note="The Evaluator is constrained at generation time never to emit verbatim source; it may cite a path or a line range, which is what FileRef is for. The rationale is therefore styled as prose at a 66-character measure, so a leak would render as visibly wrong. That is a weak but free signal and not a filter, because filtering code out of already-generated text is unreliable, which is why the constraint lives in the agent's output step instead."
        layout="block"
      >
        <div className="lg-row-flex lg-row-flex--wrap">
          <FileRef path="src/evaluator/graph.ts" lines={[118, 146]} />
          <FileRef path="src/audit/write.ts" lines={8} />
          <FileRef path="migrations/0014_audit_log.sql" />
        </div>
      </Spec>

      <Spec
        name="Sealed is not unverifiable"
        api="EvidenceLock"
        note="Two things land at once here. The bundle's contents are not viewable, because it holds real source from a private repo and no disclosure mechanism exists in this phase. Its digest is still independently checkable, because verifying that evidence was never altered and disclosing what it says are separate operations and the first never requires the second. So the verify action stays live, as a real secondary button rather than a greyed-out hint. Removing it because the bundle is private would collapse the distinction the whole trust model rests on."
        layout="block"
      >
        <EvidenceLock
          evidenceHash="9f3ac1d2b47e8850cc61a0f5e2d93b74be2049aa17c6f8e3d05b91427ac6de18"
          onVerify={() => undefined}
        />
      </Spec>

      <Spec
        name="An intact record is not a correct judgment"
        api="LogRef · LOG_REF_CAVEAT"
        note="The most dangerous surface in the product to get wrong. An inclusion proof shows the record was not quietly altered after it was written, and says nothing about whether the Evaluator reached the right conclusion. Two things enforce that: the caveat is not an optional prop, it comes from LOG_REF_CAVEAT keyed by state so no call site can drop it, and a valid proof renders in plain ink rather than the satisfied green, because reusing the verdict colour would fuse the two claims."
        layout="stack"
      >
        <LogRef
          state="verified"
          leafHash="c17b40e9a5d3f28016e7ba94c2d508371fe6ab0925cd7413e8f0a6b529d14c73"
          onCheck={() => undefined}
        />
        <LogRef state="unavailable" />
        <LogRef
          state="mismatch"
          leafHash="c17b40e9a5d3f28016e7ba94c2d508371fe6ab0925cd7413e8f0a6b529d14c73"
          onCheck={() => undefined}
        />
      </Spec>

      <Spec
        name="Commit picker"
        api="CommitList · CommitRow"
        note="The densest surface in the product, and the canonical place the compact density context is applied. The row itself has no idea which mode it is in. Dates are absolute, because a claim pins these exact commits and a relative date silently changes meaning between the render and the screenshot someone pastes into a thread."
        layout="block"
      >
        <div style={{ marginBottom: "var(--lg-space-3)" }} className="lg-row-flex">
          <RepoRef owner="kestrel-labs" name="attest-api" />
        </div>
        <CommitList>
          <CommitRow
            sha="4f2c9ab8e1d740c5b3aa92f0177de6c4419ab8e1"
            subject="Set Retry-After from the bucket refill interval"
            author="arjun-mehrotra"
            authoredAt="2026-07-11T09:41:00Z"
            selected
          />
          <CommitRow
            sha="b81e034c7a2f9915de44c0817bb3e9a20fc4d552"
            subject="Apply the limiter to every public route, not just /v1"
            author="arjun-mehrotra"
            authoredAt="2026-07-10T17:12:00Z"
          />
          <CommitRow
            sha="7cd5119a0b3e64f2ac8890d1e5b7743fa1029cc6"
            subject="Add append-only audit log table"
            author="noor-haddad"
            authoredAt="2026-07-08T11:03:00Z"
          />
          <CommitRow
            sha="e2a70f6b91c845dd0736aa1e4f8b2059cd731a48"
            subject="Move token parsing ahead of rate limiting"
            author="noor-haddad"
            authoredAt="2026-07-07T15:56:00Z"
          />
        </CommitList>
      </Spec>

      <Spec
        name="Role identity"
        api="RoleTag"
        note="The only chip family in the system with no hue at all. Who someone is must never be confused with what an evaluation concluded, and leaving identity uncoloured guarantees it: the two roles are separated by fill weight and by glyph instead. The labels stay relationship-neutral, because a stakeholder may be an agency's client, an internal manager, an investor or someone funding a bounty, and any word that presumes which one breaks the other three."
      >
        <RoleTag role="stakeholder" />
        <RoleTag role="developer" />
      </Spec>

      <Spec
        name="Pinned claim inputs"
        api="Well + RepoRef + CommitSha"
        note="A claim pins one requirement version set plus one or more repo and commit pairs. The Evaluator reads those exact SHAs and never live HEAD, so the pins are set in a well and in monospace, as the immutable inputs they are. There is deliberately no dedicated class for this composition: it is a well holding a micro-label and a stack of identifiers, and a third class that only re-declared their padding would be a component whose entire job is to exist."
        layout="block"
      >
        <Well>
          <span className="lg-micro-label">Read at</span>
          <div className="lg-stack lg-stack--tight" style={{ marginTop: "var(--lg-space-2)" }}>
            <span className="lg-row-flex lg-row-flex--wrap">
              <RepoRef owner="kestrel-labs" name="attest-api" />
              <CommitSha sha="4f2c9ab8e1d740c5b3aa92f0177de6c4419ab8e1" />
            </span>
            <span className="lg-row-flex lg-row-flex--wrap">
              <RepoRef owner="kestrel-labs" name="attest-web" />
              <CommitSha sha="7cd5119a0b3e64f2ac8890d1e5b7743fa1029cc6" />
            </span>
          </div>
        </Well>
      </Spec>
    </>
  );
}
