"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cx } from "./cx";
import { ICON_SM } from "./icons";

export type ButtonTone =
  | "primary"
  | "secondary"
  | "quiet"
  | "neutral"
  | "danger";
export type ControlSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /**
   * Defaults to `secondary`, not `primary`. A surface with two primary actions
   * has no primary action, so the emphatic variant has to be asked for.
   */
  tone?: ButtonTone;
  size?: ControlSize;
  /**
   * Replaces the leading icon with a spinner and blocks pointer events. The
   * label stays in place, so the button does not resize mid-request and the
   * cursor does not land on a control that moved.
   */
  loading?: boolean;
  icon?: ReactNode;
  iconEnd?: ReactNode;
  children?: ReactNode;
}

export function Button({
  tone = "secondary",
  size = "md",
  loading = false,
  icon,
  iconEnd,
  children,
  className,
  disabled,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(
        "lg-btn",
        `lg-btn--${tone}`,
        size !== "md" && `lg-btn--${size}`,
        className
      )}
      data-loading={loading || undefined}
      disabled={disabled || loading}
      /*
       * `aria-busy` rather than swapping the label for "Loading…": a screen
       * reader user who has already heard the label does not need it replaced,
       * and replacing it loses which action is in flight.
       */
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? (
        <span className="lg-btn__icon">
          <span
            className="lg-spinner"
            style={{ width: ICON_SM, height: ICON_SM }}
          />
        </span>
      ) : (
        icon && <span className="lg-btn__icon">{icon}</span>
      )}
      {children}
      {iconEnd && !loading && <span className="lg-btn__icon">{iconEnd}</span>}
    </button>
  );
}

export interface IconButtonProps extends Omit<ButtonProps, "children"> {
  /**
   * Required, and used as the accessible name. An icon-only control with no
   * label is invisible to a screen reader, so there is no way to omit it.
   */
  label: string;
  icon: ReactNode;
}

export function IconButton({
  label,
  icon,
  tone = "quiet",
  className,
  ...rest
}: IconButtonProps) {
  return (
    <Button
      tone={tone}
      className={cx("lg-icon-btn", className)}
      aria-label={label}
      title={label}
      icon={icon}
      {...rest}
    />
  );
}

/**
 * Buttons sharing edges. Square shape makes this a one-line negative margin,
 * which is part of why the shape is square.
 */
export function ButtonGroup({
  children,
  className,
  label,
}: {
  children: ReactNode;
  className?: string;
  /** Names the group for assistive technology, e.g. "Density". */
  label: string;
}) {
  return (
    <div className={cx("lg-btn-group", className)} role="group" aria-label={label}>
      {children}
    </div>
  );
}
