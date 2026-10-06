import type { ReactNode } from "react";

/**
 * A labelled specimen frame. Harness chrome — `gx-` prefixed, not part of the
 * system.
 *
 * `note` is where a specimen explains WHY it looks the way it does. A gallery
 * that only shows what a component looks like teaches a reader to copy it; one
 * that says what rule it encodes lets them extend it.
 */
export function Spec({
  name,
  api,
  note,
  layout = "row",
  children,
}: {
  name: string;
  /** The class or component this specimen is of. */
  api?: string;
  note?: ReactNode;
  layout?: "row" | "block" | "stack";
  children: ReactNode;
}) {
  return (
    <section className="gx-spec">
      <div className="gx-spec__label">
        <b>{name}</b>
        {api && <span>{api}</span>}
      </div>
      {note && <p className="gx-spec__note">{note}</p>}
      <div
        className={
          layout === "row"
            ? "gx-spec__stage"
            : `gx-spec__stage gx-spec__stage--${layout}`
        }
      >
        {children}
      </div>
    </section>
  );
}
