"use client";

import type { ReactNode } from "react";
import { cx } from "./cx";
import { StatusBadge, VersionPill } from "./Badge";
import type { RequirementDisplayStatus } from "./types";

export interface RequirementRowProps {
  title: string;
  /** One or two sentences. Set at the reading size, not the UI size. */
  description?: ReactNode;
  /**
   * The status of the requirement's CURRENT version, resolved through
   * `requirements.current_version_id` at read time.
   *
   * Plan 01 forbids storing effective status on the requirement, so this is
   * always assumed to have come from a join. Pass the value; never derive it
   * from whether a verdict exists somewhere in the row's history.
   */
  status: RequirementDisplayStatus;
  /** The version the status above belongs to. */
  version?: number;
  /**
   * From `requirements.archived_at`.
   *
   * Orthogonal to status. A requirement can be archived whatever its
   * verification history, and archiving says nothing about whether it was ever
   * verified — so when this is set the badge shows "Archived" but the title is
   * only dimmed, never struck through or emptied.
   */
  archived?: boolean;
  actions?: ReactNode;
  onClick?: () => void;
  className?: string;
}

export function RequirementRow({
  title,
  description,
  status,
  version,
  archived,
  actions,
  onClick,
  className,
}: RequirementRowProps) {
  /*
   * `archived` wins the badge because a row shows one badge at a time. The two
   * facts are still separate in the data and in the props — this fold is for
   * display only and must never be persisted (see RequirementDisplayStatus).
   */
  const shown: RequirementDisplayStatus = archived ? "archived" : status;

  return (
    <li
      className={cx("lg-req-row", className)}
      data-archived={archived || undefined}
      data-interactive={onClick ? "true" : undefined}
      onClick={onClick}
    >
      <div className="lg-req-row__main">
        <span className="lg-req-row__title">{title}</span>
        {description && (
          <span className="lg-req-row__description">{description}</span>
        )}
      </div>

      <div className="lg-req-row__meta">
        {version !== undefined && <VersionPill version={version} current />}
        <StatusBadge status={shown} />
      </div>

      {actions ?? <span />}
    </li>
  );
}

export function RequirementList({
  children,
  label = "Requirements",
  className,
}: {
  children: ReactNode;
  label?: string;
  className?: string;
}) {
  return (
    <ul className={cx("lg-req-list", className)} aria-label={label}>
      {children}
    </ul>
  );
}

/**
 * Checklist progress.
 *
 * Segments, one per requirement, rather than a filled bar. A bar implies a
 * single ordered quantity that grows toward completion; a checklist is a set of
 * independent outcomes, and three of them coming back negative is not "60%
 * done". The count is spelled out because that is the only unambiguous form.
 */
export function ChecklistProgress({
  statuses,
  className,
}: {
  statuses: RequirementDisplayStatus[];
  className?: string;
}) {
  const verified = statuses.filter((s) => s === "verified").length;
  const active = statuses.filter((s) => s !== "archived").length;

  return (
    <div className={cx("lg-checklist-progress", className)}>
      <span className="lg-checklist-progress__count">
        {verified} of {active} verified
      </span>
      <span className="lg-checklist-progress__track" aria-hidden="true">
        {statuses.map((s, i) => (
          <span key={i} className="lg-checklist-progress__seg" data-status={s} />
        ))}
      </span>
    </div>
  );
}












