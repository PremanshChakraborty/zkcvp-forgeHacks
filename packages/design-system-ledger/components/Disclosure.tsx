import type { ReactNode } from "react";
import { cx } from "./cx";
import { ICON_SM, IconChevron } from "./icons";

export interface DisclosureProps {
  /**
   * The row that is always visible. Everything the reader needs in order to
   * decide whether to open this entry must be here — a summary that only says
   * "Version 2" forces the reader to open every entry to find the one they
   * want, which is worse than no disclosure at all.
   */
  summary: ReactNode;
  /** Trailing metadata on the summary row: a timestamp, a count, a chip. */
  meta?: ReactNode;
  /**
   * A control that belongs to the entry but is not the expand toggle: a
   * checkbox selecting it, a radio, a drag handle.
   *
   * It renders OUTSIDE the `<summary>`, in a column of its own, and that
   * placement is the whole point. A checkbox inside a summary is a control
   * inside a control: the browser fires both, so selecting an entry also
   * expands it, and a screen reader announces a checkbox nested in a button.
   * Beside it, both controls keep their own click target, their own focus stop
   * and their own name.
   */
  lead?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
}

/**
 * One collapsible entry.
 *
 * Native `<details>`/`<summary>`, with no state of its own and no `"use
 * client"` — which is the whole reason to build it this way. The open/closed
 * state, the keyboard handling, the `aria-expanded` announcement and the
 * in-page-find behaviour that expands a closed entry when the browser finds
 * text inside it all come from the element. A hand-rolled button-plus-div loses
 * every one of them and has to re-earn them badly.
 *
 * The caret is the only moving part, and it turns rather than fades: the
 * rotation IS the state, so under `prefers-reduced-motion` the token layer
 * drops the duration to 0ms and the caret still ends up pointing the right way.
 */
export function Disclosure({
  summary,
  meta,
  lead,
  children,
  defaultOpen,
  className,
}: DisclosureProps) {
  return (
    <div className={cx("lg-disclosure", className)}>
      {lead && <div className="lg-disclosure__lead">{lead}</div>}
      <details className="lg-disclosure__detail" open={defaultOpen}>
        <summary className="lg-disclosure__summary">
          <span className="lg-disclosure__main">{summary}</span>
          {meta && <span className="lg-disclosure__meta">{meta}</span>}
          {/* aria-hidden: `<summary>` already announces its own expanded state,
              so a second signal here would have the screen reader say it twice. */}
          <span className="lg-disclosure__caret" aria-hidden="true">
            <IconChevron size={ICON_SM} />
          </span>
        </summary>
        <div className="lg-disclosure__body">{children}</div>
      </details>
    </div>
  );
}

/**
 * A run of disclosures, ruled like the checklist rather than stacked as
 * separate cards.
 *
 * Cards would be the obvious container and the wrong one: a history is one
 * object read top to bottom, and giving each entry its own border turns a
 * single trail into a pile of unrelated things. One border around the run, a
 * hairline between entries — the same treatment `RequirementList` gives the
 * checklist, because it is the same kind of reading.
 */
export function DisclosureList({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("lg-disclosure-list", className)}>{children}</div>
  );
}
