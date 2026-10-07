"use client";

import { useEffect, useState } from "react";
import { Spec } from "../Spec";
import {
  Alert,
  Button,
  EmptyState,
  EvaluationProgress,
  ICON_MD,
  IconPlus,
  ProgressBar,
  Skeleton,
  Spinner,
  SystemErrorBadge,
  Toast,
  UndoToast,
} from "../../components";

export function FeedbackSection() {
  /* A live clock, so the ochre threshold at 70% of the ceiling is reachable in
     the gallery rather than described. */
  const [elapsed, setElapsed] = useState(18);
  useEffect(() => {
    const t = window.setInterval(
      () => setElapsed((s) => (s >= 58 ? 8 : s + 1)),
      1000
    );
    return () => window.clearInterval(t);
  }, []);

  return (
    <>
      <Spec
        name="Alert tones"
        api="Alert tone="
        note="No coloured band down the left edge. Tone is carried by the icon, the tinted background and the words, because an accent band on one side of a box is the most recognisable machine-generated tell in this class of interface. Only the danger tone uses role=alert; an info alert that is part of the page's initial content should not be announced out of order."
        layout="stack"
      >
        <Alert tone="info" title="Requirements are versioned">
          Editing a requirement's text creates a new version. Verification status
          attaches to the version it was evaluated against, never to whatever is
          current.
        </Alert>

        <Alert tone="success" title="Evaluation complete">
          Four requirement versions were read at the pinned commits. The report is
          visible to stakeholders on this project.
        </Alert>

        <Alert tone="warning" title="Approaching the execution limit">
          This run has used most of the platform's execution budget. If it is cut
          off, no verdict is recorded and the claim can be submitted again.
        </Alert>

        <Alert
          tone="danger"
          title="GitHub rate limit reached"
          actions={
            <>
              <Button size="sm" tone="secondary">
                Retry
              </Button>
              <Button size="sm" tone="quiet">
                Dismiss
              </Button>
            </>
          }
        >
          The Evaluator could not finish reading the pinned commits. No verdict
          was recorded, and this says nothing about whether the code satisfies the
          requirement.
        </Alert>
      </Spec>

      <Spec
        name="A verdict is not an error"
        api="Alert tone=danger · SystemErrorBadge"
        note="The distinction this whole palette is built around. On the left is a genuine infrastructure failure: red, and it means the run did not finish. A requirement coming back not satisfied is on the Domain page instead, in ink, because it is a completed evaluation that disagreed. Rendering the second like the first would tell a developer their tooling broke when it worked."
      >
        <SystemErrorBadge />
        <SystemErrorBadge>Execution limit exceeded</SystemErrorBadge>
        <SystemErrorBadge>Proof mismatch</SystemErrorBadge>
      </Spec>

      <Spec
        name="Indicators"
        api="Spinner · ProgressBar"
        note="Both slow under prefers-reduced-motion rather than stopping. Freezing a spinner makes a request that is genuinely still running look hung, which misinforms rather than accommodates. The progress bar has no value prop at all, deliberately, and omitting aria-valuenow is how ARIA expresses indeterminate."
        layout="block"
      >
        <div className="lg-row-flex" style={{ marginBottom: "var(--lg-space-4)" }}>
          <Spinner />
          <Spinner size={24} />
          <span className="lg-caption">Reading the pinned commits</span>
        </div>
        <ProgressBar label="Specimen indeterminate bar" />
      </Spec>

      <Spec
        name="Evaluation in flight"
        api="EvaluationProgress elapsedSeconds= ceilingSeconds= phase= completed= filesRead= round="
        note="Evaluation runs synchronously inside the request that submits the claim, so the developer's own tab is held open for its full duration. There is no percentage, and the copy says so, because there is no honest fraction for an LLM evaluation. This specimen pins the mid-run loop case: phase gather with round 2, because gather and analyze repeat, so the marker for a step already ticked can become active again. A tick means a step has run, not that it is finished forever, and the round indicator is what keeps a marker moving backward from reading as alarming. The clock turns ochre past 70% of the ceiling so the developer is warned before the request is cut off rather than after."
        layout="block"
      >
        <EvaluationProgress
          elapsedSeconds={elapsed}
          ceilingSeconds={60}
          phase="gather"
          completed={["claim", "plan", "analyze"]}
          round={2}
          filesRead={19}
        />
      </Spec>

      <Spec
        name="Skeleton"
        api="Skeleton"
        note="Purely decorative motion, so the shimmer stops outright under reduced motion rather than slowing. The shapes match the layout that will replace them, so nothing shifts when the content lands."
        layout="block"
      >
        <div className="lg-stack lg-stack--tight" style={{ maxWidth: "34rem" }}>
          <Skeleton width="45%" />
          <Skeleton width="100%" />
          <Skeleton width="88%" />
          <Skeleton width="26%" />
        </div>
      </Spec>

      <Spec
        name="Empty state"
        api="EmptyState"
        note="Dashed border, so an empty region reads as a slot waiting to be filled rather than as a card that failed to load. Every empty state names the action that populates it."
        layout="block"
      >
        <EmptyState
          title="No requirements yet"
          actions={
            <Button tone="primary" icon={<IconPlus size={ICON_MD} />}>
              Add requirement
            </Button>
          }
        >
          A stakeholder defines what has to be true, as a versioned checklist.
          Nothing can be claimed or evaluated until there is at least one entry.
        </EmptyState>
      </Spec>

      <Spec
        name="Toast, and the undo window"
        api="Toast · UndoToast seconds="
        note="Repo attachment is permanent once the window closes: there is no detach endpoint and no soft-delete state, so this countdown is the entire reversible period. That is why the remaining time is drawn as a ring and printed as a number inside it, rather than implied by a toast that fades over a duration the user has to guess."
        layout="stack"
      >
        <div style={{ maxWidth: "26rem" }}>
          <Toast onDismiss={() => undefined}>Report exported as PDF.</Toast>
        </div>
        <div style={{ maxWidth: "26rem" }}>
          <UndoToast seconds={60} onUndo={() => undefined}>
            <strong>kestrel-labs/attest-api</strong> attached. This cannot be
            reversed after the window closes.
          </UndoToast>
        </div>
      </Spec>
    </>
  );
}
