import type { ReactNode, TdHTMLAttributes } from "react";
import { cx } from "./cx";

export interface TableProps {
  /** Names the table for assistive technology. Required — an unlabelled table
   *  is a wall of cells to a screen reader user. */
  label: string;
  children: ReactNode;
  className?: string;
}

/**
 * Ruled, not striped.
 *
 * Zebra rows fight with status chips for the reader's attention, and in a table
 * whose whole job is to carry status that is a bad trade.
 *
 * Always wrapped in `.lg-scroll-x`: wide content scrolls inside its own
 * container so the page body never scrolls sideways.
 */
export function Table({ label, children, className }: TableProps) {
  return (
    <div className="lg-scroll-x">
      <table className={cx("lg-table", className)} aria-label={label}>
        {children}
      </table>
    </div>
  );
}

export interface CellProps extends TdHTMLAttributes<HTMLTableCellElement> {
  /** For identifiers: SHAs, digests, paths. */
  mono?: boolean;
  /** Right-aligned and tabular, for quantities. */
  numeric?: boolean;
  /** Collapses to its content width, for a trailing actions or status column. */
  shrink?: boolean;
  children?: ReactNode;
}

export function Td({
  mono,
  numeric,
  shrink,
  className,
  children,
  ...rest
}: CellProps) {
  return (
    <td
      className={cx(
        mono && "lg-table__cell--mono",
        numeric && "lg-table__cell--num",
        shrink && "lg-table__cell--shrink",
        className
      )}
      {...rest}
    >
      {children}
    </td>
  );
}

export interface DescriptionListProps {
  items: Array<{ term: ReactNode; value: ReactNode }>;
  /** Stacks term above value. Use below 640px or in a narrow sidebar. */
  stacked?: boolean;
  className?: string;
}

/**
 * Term-and-value pairs — claim metadata, repo details, report headers.
 *
 * The spacing is carried by margins rather than a grid `gap`, because the space
 * between a term and its own value has to be tighter than the space between one
 * pair and the next, and a single `gap` value is by definition the same in both
 * directions.
 */
export function DescriptionList({
  items,
  stacked,
  className,
}: DescriptionListProps) {
  return (
    <dl className={cx("lg-dl", stacked && "lg-dl--stacked", className)}>
      {items.map((item, i) => (
        /* Index keys are correct here: this is a static, ordered, non-reordering
           list rendered from a prop, with no component state per row. */
        <div key={i} style={{ display: "contents" }}>
          <dt>{item.term}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
