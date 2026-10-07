"use client";

import type { ReactNode } from "react";
import { cx } from "./cx";
import { ICON_SM, IconChevron } from "./icons";

export interface TabItem {
  id: string;
  label: ReactNode;
}

/**
 * Tabs.
 *
 * The strip scrolls horizontally rather than wrapping. A two-line tab bar
 * reorders itself as the label set changes, which destroys the muscle memory
 * that is most of what tabs are for.
 */
export function Tabs({
  items,
  active,
  onSelect,
  label,
  className,
}: {
  items: TabItem[];
  active: string;
  onSelect: (id: string) => void;
  /** Names the tab set, e.g. "Report sections". */
  label: string;
  className?: string;
}) {
  return (
    <div className={cx("lg-tabs", className)} role="tablist" aria-label={label}>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          id={`tab-${item.id}`}
          aria-selected={item.id === active}
          aria-controls={`panel-${item.id}`}
          /* Only the selected tab is in the tab order; arrow keys move between
             them. This is the ARIA tabs pattern, and it is why a tab strip does
             not cost a keyboard user one Tab press per tab. */
          tabIndex={item.id === active ? 0 : -1}
          className="lg-tab"
          onClick={() => onSelect(item.id)}
          onKeyDown={(e) => {
            const i = items.findIndex((t) => t.id === active);
            if (e.key === "ArrowRight") {
              onSelect(items[(i + 1) % items.length].id);
            } else if (e.key === "ArrowLeft") {
              onSelect(items[(i - 1 + items.length) % items.length].id);
            }
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

/**
 * The same strip as `Tabs`, for sections that are separate PAGES.
 *
 * Deliberately not `Tabs`. The ARIA tabs pattern says "these panels are all
 * here and one of them is showing": it owns a roving tabindex, answers arrow
 * keys, and marks its choice with `aria-selected`. Links to other URLs are none
 * of that. They are links, they belong in the tab order one by one, and the
 * current one is `aria-current="page"`. Reusing the tablist markup for them
 * tells a screen reader user that Left and Right will move between panels,
 * which is a promise this strip cannot keep.
 *
 * The two share their look, and only their look: `.lg-tab`'s active rule keys
 * off `aria-selected` and `aria-current` alike.
 *
 * Takes children rather than an item list, because the anchor is the caller's
 * to choose. A Next.js or router-aware app passes its own `Link` with
 * `className="lg-tab"`; this package cannot import one and must not force a
 * full page load on every app that uses it.
 */
export function NavStrip({
  children,
  label,
  end,
  className,
}: {
  children: ReactNode;
  /** Names the section set, e.g. "Project sections". */
  label: string;
  /** Pinned to the far end of the strip: a count, a progress track, a filter. */
  end?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("lg-tabs-bar", className)}>
      {/* The strip scrolls; `end` must not be inside it. Pinned with an auto
          margin in an overflow container, it does not pin to the visible edge
          at all: it sits after the last item, off the right of a narrow screen,
          reachable only by scrolling past every tab. Outside the scroller it
          holds the edge at every width. */}
      <nav className="lg-tabs" aria-label={label}>
        {children}
      </nav>
      {end && <span className="lg-tabs__end">{end}</span>}
    </div>
  );
}

export interface Crumb {
  label: ReactNode;
  href?: string;
}

/**
 * Breadcrumbs. The only thing that belongs in `PageHeader`'s `above` slot,
 * because it is the only thing there that is navigable.
 */
export function Breadcrumb({
  items,
  className,
}: {
  items: Crumb[];
  className?: string;
}) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className={cx("lg-breadcrumb", className)}>
        {items.map((item, i) => {
          const last = i === items.length - 1;
          return (
            <li key={i}>
              {item.href && !last ? (
                <a href={item.href}>{item.label}</a>
              ) : (
                <span aria-current={last ? "page" : undefined}>{item.label}</span>
              )}
              {!last && (
                <IconChevron
                  size={ICON_SM}
                  className="lg-breadcrumb__sep"
                  aria-hidden="true"
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function SideNav({
  children,
  label = "Sections",
  className,
}: {
  children: ReactNode;
  label?: string;
  className?: string;
}) {
  return (
    <nav className={cx("lg-sidenav", className)} aria-label={label}>
      {children}
    </nav>
  );
}

export function SideNavSection({
  label,
  children,
  className,
}: {
  label?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("lg-sidenav__section", className)}>
      {label && <span className="lg-sidenav__section-label">{label}</span>}
      {children}
    </div>
  );
}

export function NavItem({
  children,
  href,
  active,
  icon,
  count,
  onClick,
  className,
}: {
  children: ReactNode;
  href?: string;
  active?: boolean;
  icon?: ReactNode;
  /** A count of rows behind this item. Monospace, so columns of them align. */
  count?: number;
  onClick?: () => void;
  className?: string;
}) {
  const inner = (
    <>
      {icon}
      <span className="lg-truncate">{children}</span>
      {count !== undefined && <span className="lg-nav-item__count">{count}</span>}
    </>
  );

  /*
   * An anchor when it navigates, a button when it does not. A div with an
   * onClick is neither focusable nor announced as actionable, and a link with
   * no href is announced as a link that goes nowhere.
   */
  return href ? (
    <a
      href={href}
      className={cx("lg-nav-item", className)}
      aria-current={active ? "page" : undefined}
    >
      {inner}
    </a>
  ) : (
    <button
      type="button"
      className={cx("lg-nav-item", className)}
      aria-current={active ? "true" : undefined}
      onClick={onClick}
    >
      {inner}
    </button>
  );
}
