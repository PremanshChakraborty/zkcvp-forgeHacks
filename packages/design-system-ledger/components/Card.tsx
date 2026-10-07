import type { ReactNode } from "react";
import { cx } from "./cx";

export interface CardProps {
  children: ReactNode;
  className?: string;
  /** Removes body padding, for a card whose body is a full-bleed table or list. */
  flush?: boolean;
}

/**
 * A bounded region of chrome. Bordered, never lifted — nothing in this system
 * uses a shadow to say "this is a group", because a 1px rule says it more
 * precisely and survives dark mode without retuning.
 */
export function Card({ children, className, flush }: CardProps) {
  return (
    <section className={cx("lg-card", flush && "lg-card--flush", className)}>
      {children}
    </section>
  );
}

export function CardHeader({
  title,
  actions,
  children,
  className,
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cx("lg-card__header", className)}>
      {title && <h3 className="lg-card__title">{title}</h3>}
      {children}
      {actions && (
        <>
          <span className="lg-spacer" />
          {actions}
        </>
      )}
    </header>
  );
}

export function CardBody({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cx("lg-card__body", className)}>{children}</div>;
}

export function CardFooter({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <footer className={cx("lg-card__footer", className)}>{children}</footer>;
}

/**
 * A well. Cut INTO the page rather than raised above it.
 *
 * Cards hold chrome the app wrote; wells hold data the system read — digests,
 * pinned SHAs, commit lists, evidence. Keeping those two visually opposed is
 * what makes "this is what was actually read" legible, and it is the one surface
 * rule carried over from the first direction unchanged.
 */
export function Well({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cx("lg-well", className)}>{children}</div>;
}

export interface PageHeaderProps {
  title: ReactNode;
  /**
   * Wayfinding only — a Breadcrumb, and nothing else.
   *
   * There is deliberately no `eyebrow` prop. A small uppercase label above a
   * page title is decoration that reads as structure; if the title needs one to
   * be understood, the title is the thing to fix. Breadcrumbs earn the slot
   * because they are navigable.
   */
  above?: ReactNode;
  /** One or two sentences. Sits below the rule, at the prose measure. */
  lead?: ReactNode;
  actions?: ReactNode;
  /**
   * Navigation between the sections of whatever this header names: a
   * `NavStrip`, and nothing else.
   *
   * It renders last and takes over the header's closing rule rather than
   * drawing a second one under it. Two full-width rules a line and a half
   * apart is the commonest way a page header and the strip beneath it end up
   * looking accidental, and it is entirely avoidable: the strip already draws
   * a rule, so the header gives up its own.
   */
  nav?: ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  above,
  lead,
  actions,
  nav,
  className,
}: PageHeaderProps) {
  return (
    <header
      className={cx(
        "lg-page-header",
        nav ? "lg-page-header--nav" : undefined,
        className,
      )}
    >
      {above && <div className="lg-page-header__above">{above}</div>}
      <div className="lg-page-header__main">
        <h1 className="lg-page-header__title">{title}</h1>
        {actions && <div className="lg-page-header__actions">{actions}</div>}
      </div>
      {lead && <p className="lg-page-header__lead">{lead}</p>}
      {nav && <div className="lg-page-header__nav">{nav}</div>}
    </header>
  );
}

/**
 * A section heading with the ink rule under it.
 *
 * The rule is this direction's signature and it is typographic: it carries no
 * state, and no surface in the system gets a coloured edge to encode status.
 */
export function SectionHeading({
  children,
  actions,
  as: As = "h2",
  className,
}: {
  children: ReactNode;
  actions?: ReactNode;
  as?: "h2" | "h3";
  className?: string;
}) {
  return (
    <div className={cx("lg-section__heading", className)}>
      <As>{children}</As>
      {actions}
    </div>
  );
}

export function Section({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <section className={cx("lg-section", className)}>{children}</section>;
}
