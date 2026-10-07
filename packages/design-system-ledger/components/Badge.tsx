"use client";

import type { ReactNode } from "react";
import { cx } from "./cx";
import {
  ICON_SM,
  IconArchived,
  IconDeveloper,
  IconError,
  IconNew,
  IconSatisfied,
  IconStakeholder,
  IconUnsatisfied,
} from "./icons";
import {
  REQUIREMENT_STATUS_LABEL,
  ROLE_LABEL,
  VERDICT_LABEL,
  type RequirementDisplayStatus,
  type Role,
  type Verdict,
} from "./types";

export type ChipTone =
  | "neutral"
  | "satisfied"
  | "unsatisfied"
  | "danger"
  | "warning"
  | "accent"
  | "archived";

export interface BadgeProps {
  tone?: ChipTone;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
  title?: string;
}

/** The generic chip. Prefer the status-aware wrappers below wherever one fits. */
export function Badge({
  tone = "neutral",
  icon,
  children,
  className,
  title,
}: BadgeProps) {
  return (
    <span
      className={cx("lg-chip", `lg-chip--${tone}`, className)}
      title={title}
    >
      {icon}
      {children}
    </span>
  );
}

const STATUS_TONE: Record<RequirementDisplayStatus, ChipTone> = {
  new: "neutral",
  verified: "satisfied",
  eval_failed: "unsatisfied",
  archived: "archived",
};

const STATUS_ICON: Record<RequirementDisplayStatus, typeof IconNew> = {
  new: IconNew,
  verified: IconSatisfied,
  eval_failed: IconUnsatisfied,
  archived: IconArchived,
};

export interface StatusBadgeProps {
  status: RequirementDisplayStatus;
  className?: string;
}

/**
 * A requirement version's status.
 *
 * Takes the raw enum, not a tone, so `eval_failed` can only ever render as
 * "Not satisfied" — the label mapping lives in types.ts and nowhere else. The
 * raw enum name must never reach a screen: per plan 01's transition table, a
 * NEGATIVE VERDICT writes `eval_failed`, so a user reading "failed" would
 * conclude their evaluation broke when it in fact completed and disagreed.
 */
export function StatusBadge({ status, className }: StatusBadgeProps) {
  const Glyph = STATUS_ICON[status];
  return (
    <Badge tone={STATUS_TONE[status]} className={className} icon={<Glyph size={ICON_SM} />}>
      {REQUIREMENT_STATUS_LABEL[status]}
    </Badge>
  );
}

export interface VerdictBadgeProps {
  verdict: Verdict;
  className?: string;
}

/** One `report.perRequirement[].verdict`. */
export function VerdictBadge({ verdict, className }: VerdictBadgeProps) {
  const Glyph = verdict === "satisfied" ? IconSatisfied : IconUnsatisfied;
  return (
    <Badge
      tone={verdict === "satisfied" ? "satisfied" : "unsatisfied"}
      className={className}
      icon={<Glyph size={ICON_SM} />}
    >
      {VERDICT_LABEL[verdict]}
    </Badge>
  );
}

/**
 * A genuine infrastructure failure: GitHub rate limit, evaluator crash, blown
 * execution ceiling, proof mismatch.
 *
 * Red, and never the ink of a negative verdict. These events say nothing about
 * whether the code satisfies the requirement, and rendering them like a verdict
 * would tell the developer something untrue about their own work.
 */
export function SystemErrorBadge({
  children = "Evaluation error",
  className,
}: {
  children?: ReactNode;
  className?: string;
}) {
  return (
    <Badge tone="danger" className={className} icon={<IconError size={ICON_SM} />}>
      {children}
    </Badge>
  );
}

export interface VersionPillProps {
  version: number;
  /** The version resolved through `requirements.current_version_id`. */
  current?: boolean;
  className?: string;
}

/**
 * A requirement version stamp.
 *
 * Square and monospace, unlike every other chip in the system, because it is an
 * identifier rather than a status. Verification attaches to the specific version
 * it was evaluated against, never to "whatever is current", so the version a
 * badge belongs to has to be visible next to it.
 */
export function VersionPill({ version, current, className }: VersionPillProps) {
  return (
    <span
      className={cx("lg-version-pill", className)}
      data-current={current || undefined}
      title={current ? `Version ${version}, current` : `Version ${version}`}
    >
      v{version}
    </span>
  );
}

/**
 * Who someone is.
 *
 * The only chip family in the system with no hue at all. Identity must never be
 * confused with what an evaluation concluded, and the cleanest way to guarantee
 * that is to leave it uncoloured: the two roles are separated by fill weight and
 * by glyph instead.
 *
 * The label stays relationship-neutral. A stakeholder may be an agency's client,
 * an internal manager, an investor, or someone funding a bounty; any word that
 * presumes which one breaks the other three.
 */
export function RoleTag({ role, className }: { role: Role; className?: string }) {
  const Glyph = role === "stakeholder" ? IconStakeholder : IconDeveloper;
  return (
    <span
      className={cx("lg-chip", "lg-chip--role", className)}
      data-role={role}
    >
      <Glyph size={ICON_SM} />
      {ROLE_LABEL[role]}
    </span>
  );
}

/**
 * Dot-only status, for a table cell too narrow for a full chip.
 *
 * Carries `aria-label` and `title`, so the colour is never the only carrier of
 * meaning even here.
 */
export function StatusDot({
  status,
  className,
}: {
  status: RequirementDisplayStatus;
  className?: string;
}) {
  const label = REQUIREMENT_STATUS_LABEL[status];
  const variant = status === "eval_failed" ? "eval-failed" : status;
  return (
    <span
      className={cx("lg-dot", `lg-dot--${variant}`, className)}
      role="img"
      aria-label={label}
      title={label}
    />
  );
}
