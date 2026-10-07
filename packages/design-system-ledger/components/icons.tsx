"use client";

/**
 * The icon family, pinned in one place.
 *
 * The first direction hand-drew its own twelve-glyph set. This one does not:
 * hand-rolled icon paths drift in weight and optical size the moment a
 * thirteenth glyph is needed, and there is no reason to redraw work that
 * Phosphor has already done consistently across two thousand glyphs.
 *
 *   npm install @phosphor-icons/react
 *
 * Everything the system draws is re-exported from HERE rather than imported
 * from the package at each call site, for two reasons:
 *
 *   1. One family per project. A second icon library cannot creep in without
 *      showing up as a new import in this file.
 *   2. The glyph chosen for a domain meaning is a decision, not a detail.
 *      `IconUnsatisfied` being a prohibition sign rather than a cross is the
 *      same decision as the ink chip in tokens.css, and it belongs next to it.
 *
 * The CSS layer has no icon dependency at all. Every component takes its glyph
 * as markup, so hand-written HTML using the same classes works without React
 * and without Phosphor — which is what lets the static preview pages render the
 * real stylesheet.
 */

import type { ReactNode } from "react";
import {
  Archive,
  ArrowClockwise,
  ArrowUUpLeft,
  BookBookmark,
  CaretRight,
  CheckCircle,
  Circle,
  Clock,
  Code,
  Copy,
  FileCode,
  GitBranch,
  GitCommit,
  IconContext,
  Info,
  LockKey,
  Plus,
  Prohibit,
  SealCheck,
  User,
  Warning,
  WarningCircle,
  X,
} from "@phosphor-icons/react";

/**
 * Icon sizes. Three rungs, matching the three control heights — an icon that is
 * not one of these three is off-system.
 */
export const ICON_SM = 14;
export const ICON_MD = 16;
export const ICON_LG = 18;

/**
 * Global icon defaults.
 *
 * Wrap the app (or the gallery) once. Weight is `bold` because Phosphor's
 * regular weight is drawn for larger sizes than this system uses — at 14px the
 * regular stroke disappears against 14px text set at weight 500.
 *
 * Icons inherit `currentColor`, so they always take the tone of whatever
 * component contains them and never need a colour prop.
 */
export function LedgerIcons({ children }: { children: ReactNode }) {
  return (
    <IconContext.Provider
      value={{ size: ICON_MD, weight: "bold", color: "currentColor" }}
    >
      {children}
    </IconContext.Provider>
  );
}

/* -----------------------------------------------------------------------------
   Domain glyphs. The mapping from meaning to shape.
   ----------------------------------------------------------------------------- */

/** Verdict `satisfied` / status `verified`. */
export const IconSatisfied = CheckCircle;

/**
 * Verdict `not_satisfied` / status `eval_failed`.
 *
 * A prohibition sign, not a cross. A cross is the universal glyph for "error",
 * "close" and "wrong input", and this is none of those — it is a recorded
 * negative result. The glyph carries the same distinction the ink chip does.
 */
export const IconUnsatisfied = Prohibit;

/** Status `new`. Hollow, because nothing has happened yet. */
export const IconNew = Circle;

/** A true infrastructure error. Rate limit, crash, blown execution ceiling. */
export const IconError = WarningCircle;

/** Approaching a limit. Never a result. */
export const IconWarning = Warning;

export const IconInfo = Info;

/** The sealed evidence bundle. A key lock, because it can be opened later. */
export const IconSealed = LockKey;

/** A transparency-log inclusion proof. */
export const IconLogProof = SealCheck;

export const IconArchived = Archive;

/* Repository objects. */
export const IconCommit = GitCommit;
export const IconBranch = GitBranch;
export const IconRepo = BookBookmark;
export const IconFile = FileCode;

/* Roles. Not coloured, so the glyph does more work here than usual. */
export const IconStakeholder = User;
export const IconDeveloper = Code;

/* Generic UI. */
export const IconCopy = Copy;
export const IconChevron = CaretRight;
export const IconPlus = Plus;
export const IconClose = X;
export const IconClock = Clock;
export const IconRetry = ArrowClockwise;
export const IconUndo = ArrowUUpLeft;

/**
 * Re-exported so a consumer can add a glyph the system does not yet name
 * without reaching for a second library. Prefer adding it above.
 */
export { IconContext };
