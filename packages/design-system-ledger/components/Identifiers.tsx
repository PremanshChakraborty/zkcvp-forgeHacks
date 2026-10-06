"use client";

import { useCallback, useState, type ReactNode } from "react";
import { cx } from "./cx";
import {
  ICON_SM,
  IconBranch,
  IconCommit,
  IconCopy,
  IconFile,
  IconRepo,
} from "./icons";

/**
 * Every value in this product that a person might paste into a terminal, or
 * compare against something on another screen.
 *
 * Identifiers are always monospace and always tabular. That is not stylistic:
 * comparing two digests by eye only works when the glyphs line up in columns.
 */

export interface MonoProps {
  children: ReactNode;
  className?: string;
  /** Boxed in a well, for a value sitting on its own rather than inline. */
  boxed?: boolean;
}

export function Mono({ children, className, boxed }: MonoProps) {
  return (
    <span className={cx("lg-ident", boxed && "lg-ident--boxed", className)}>
      <span className="lg-ident__value">{children}</span>
    </span>
  );
}

export function CopyButton({
  value,
  label = "Copy",
}: {
  value: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      /*
       * Clipboard access can be denied by permissions policy or unavailable on
       * a non-secure origin. Silently doing nothing is correct here: the full
       * value is already in the element's `title` and selectable as text, so
       * the user has a manual path and does not need an error about a
       * convenience affordance.
       */
    }
  }, [value]);

  return (
    <button
      type="button"
      className="lg-copy"
      onClick={copy}
      data-copied={copied || undefined}
      aria-label={copied ? "Copied" : label}
      title={copied ? "Copied" : label}
    >
      <IconCopy size={ICON_SM} />
    </button>
  );
}

export interface CommitShaProps {
  sha: string;
  /** Characters shown. Seven is git's own abbreviation default. */
  length?: number;
  copyable?: boolean;
  className?: string;
}

/**
 * An abbreviated commit SHA.
 *
 * Truncated from the FRONT only, unlike a digest: git abbreviations are
 * conventionally leading characters, and a developer recognises their own commit
 * by its first seven. The full value stays in `title` and in the copy payload.
 */
export function CommitSha({
  sha,
  length = 7,
  copyable = true,
  className,
}: CommitShaProps) {
  return (
    <span className={cx("lg-ident", className)} title={sha}>
      <IconCommit size={ICON_SM} />
      <span className="lg-ident__value">{sha.slice(0, length)}</span>
      {copyable && <CopyButton value={sha} label="Copy commit SHA" />}
    </span>
  );
}

export interface HashRefProps {
  hash: string;
  algorithm?: string;
  /** Characters kept at each end. */
  edge?: number;
  copyable?: boolean;
  className?: string;
}

/**
 * A content digest — an evidence bundle hash, a log leaf, a Merkle root.
 *
 * Truncated in the MIDDLE, and this is the whole point of the component.
 * Comparing a digest by eye means comparing head *and* tail; a trailing ellipsis
 * would destroy the only affordance that matters. The full value stays in
 * `title` and in the copy payload.
 */
export function HashRef({
  hash,
  algorithm,
  edge = 6,
  copyable = true,
  className,
}: HashRefProps) {
  const truncated =
    hash.length > edge * 2 + 1
      ? `${hash.slice(0, edge)}…${hash.slice(-edge)}`
      : hash;

  return (
    <span
      className={cx("lg-ident", className)}
      title={algorithm ? `${algorithm}:${hash}` : hash}
    >
      {algorithm && <span className="lg-ident__prefix">{algorithm}:</span>}
      <span className="lg-ident__value">{truncated}</span>
      {copyable && <CopyButton value={hash} label="Copy digest" />}
    </span>
  );
}

/**
 * A repository.
 *
 * Displays `owner/name` because that is what a developer recognises, but the
 * join key is `github_repo_id` and never the display name — a repo can be
 * renamed or transferred, and a record that pinned the string would silently
 * start pointing at the wrong thing.
 */
export function RepoRef({
  owner,
  name,
  className,
}: {
  owner: string;
  name: string;
  className?: string;
}) {
  return (
    <span className={cx("lg-ident", className)}>
      <IconRepo size={ICON_SM} />
      <span className="lg-ident__prefix">{owner}/</span>
      <span className="lg-ident__value">{name}</span>
    </span>
  );
}

export function BranchRef({
  branch,
  className,
}: {
  branch: string;
  className?: string;
}) {
  return (
    <span className={cx("lg-ident", className)}>
      <IconBranch size={ICON_SM} />
      <span className="lg-ident__value">{branch}</span>
    </span>
  );
}

/**
 * A file path, optionally with a line range.
 *
 * This is what an Evaluator rationale is allowed to cite. The rationale itself
 * must never embed verbatim source — a path and a line range are fine, and this
 * component is the shape that constraint takes on screen.
 */
export function FileRef({
  path,
  lines,
  className,
}: {
  path: string;
  /** `[start, end]`, or a single line. */
  lines?: [number, number] | number;
  className?: string;
}) {
  const range =
    lines === undefined
      ? null
      : Array.isArray(lines)
        ? `:${lines[0]}-${lines[1]}`
        : `:${lines}`;

  return (
    <span className={cx("lg-ident", className)} title={`${path}${range ?? ""}`}>
      <IconFile size={ICON_SM} />
      <span className="lg-ident__value">
        {path}
        {range && <span className="lg-ident__prefix">{range}</span>}
      </span>
    </span>
  );
}
