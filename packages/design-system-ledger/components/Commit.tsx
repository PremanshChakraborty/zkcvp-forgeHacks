"use client";

import type { ReactNode } from "react";
import { cx } from "./cx";
import { CommitSha } from "./Identifiers";

export interface CommitRowProps {
  sha: string;
  subject: string;
  /** GitHub login. Display only — `github_user_id` is the join key. */
  author: string;
  /** ISO 8601. Formatted at render so the caller does not pre-format. */
  authoredAt: string;
  selected?: boolean;
  actions?: ReactNode;
  className?: string;
}

/**
 * One commit in the developer's picker.
 *
 * A commit list is the densest surface in the product, so it is the canonical
 * place to apply `data-density="compact"` on the wrapper — the row itself has no
 * idea which mode it is in and needs no prop for it.
 */
export function CommitRow({
  sha,
  subject,
  author,
  authoredAt,
  selected,
  actions,
  className,
}: CommitRowProps) {
  return (
    <li
      className={cx("lg-commit-row", className)}
      data-selected={selected || undefined}
    >
      <CommitSha sha={sha} />
      <span className="lg-commit-row__subject" title={subject}>
        {subject}
      </span>
      <span className="lg-commit-row__meta">
        <span>{author}</span>
        <time dateTime={authoredAt}>{formatDay(authoredAt)}</time>
        {actions}
      </span>
    </li>
  );
}

export function CommitList({
  children,
  label = "Commits",
  /** Compact by default — this is the surface the density context exists for. */
  density = "compact",
  className,
}: {
  children: ReactNode;
  label?: string;
  density?: "compact" | "comfortable";
  className?: string;
}) {
  return (
    <ul
      className={cx("lg-commit-list", className)}
      aria-label={label}
      data-density={density}
    >
      {children}
    </ul>
  );
}

/**
 * Absolute dates, never "3 days ago".
 *
 * A claim pins specific commits and a verdict attaches to that exact state, so
 * every date in this product is a fact about the record rather than a fact about
 * when the page was loaded. A relative date silently changes meaning between the
 * render and the screenshot someone pastes into a thread.
 */
function formatDay(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
