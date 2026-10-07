import type { ReactNode } from "react";
import { cx } from "./cx";

export interface TimelineItemProps {
  title: ReactNode;
  /** ISO 8601. Rendered absolute — see the note in Commit.tsx. */
  at?: string;
  meta?: ReactNode;
  /** A glyph from `icons.tsx`. Inherits the marker's tone. */
  marker?: ReactNode;
  children?: ReactNode;
  className?: string;
}

/**
 * A requirement's or a claim's history.
 *
 * Re-evaluation is symmetric from `new`, `verified` and `eval_failed` — none of
 * those is a dead end — so this list has no terminal item and no "final" styling
 * on its last entry. What looks like the end is just the most recent event.
 */
export function TimelineItem({
  title,
  at,
  meta,
  marker,
  children,
  className,
}: TimelineItemProps) {
  return (
    <li className={cx("lg-timeline__item", className)}>
      <span className="lg-timeline__marker" aria-hidden="true">
        {marker}
      </span>
      <div className="lg-timeline__body">
        <span className="lg-timeline__title">{title}</span>
        {(at || meta) && (
          <span className="lg-timeline__meta">
            {at && <time dateTime={at}>{formatStamp(at)}</time>}
            {at && meta ? " " : null}
            {meta}
          </span>
        )}
        {children}
      </div>
    </li>
  );
}

export function Timeline({
  children,
  label = "History",
  className,
}: {
  children: ReactNode;
  label?: string;
  className?: string;
}) {
  return (
    <ol className={cx("lg-timeline", className)} aria-label={label}>
      {children}
    </ol>
  );
}

function formatStamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
