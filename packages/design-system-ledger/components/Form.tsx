"use client";

import {
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { cx } from "./cx";
import { ICON_SM, IconError } from "./icons";

export interface FieldProps {
  label: ReactNode;
  /** Rendered below the control. Never in a placeholder. */
  help?: ReactNode;
  /** Rendered below the help text. Its presence is what marks the field invalid. */
  error?: ReactNode;
  required?: boolean;
  className?: string;
  /**
   * Receives the ids to wire onto the control. `describedBy` is a single string
   * because `aria-describedby` takes a space-separated list and building it at
   * the call site is where the help text quietly stops being announced.
   */
  children: (ids: {
    id: string;
    describedBy: string | undefined;
    invalid: boolean;
  }) => ReactNode;
}

/**
 * Label above, help below, error below that.
 *
 * The label is never a placeholder. A placeholder disappears the moment the user
 * types, which means the one piece of text explaining what a field wants is gone
 * exactly when they are trying to fill it in.
 */
export function Field({
  label,
  help,
  error,
  required,
  className,
  children,
}: FieldProps) {
  const base = useId();
  const id = `${base}-control`;
  const helpId = `${base}-help`;
  const errorId = `${base}-error`;

  const describedBy =
    [help ? helpId : null, error ? errorId : null].filter(Boolean).join(" ") ||
    undefined;

  return (
    <div className={cx("lg-field", className)}>
      <label className="lg-field__label" htmlFor={id}>
        {label}
        {required && (
          <span className="lg-field__required" aria-hidden="true">
            *
          </span>
        )}
      </label>

      {children({ id, describedBy, invalid: Boolean(error) })}

      {help && (
        <span className="lg-field__help" id={helpId}>
          {help}
        </span>
      )}

      {error && (
        /*
         * `role="alert"` so a validation message that appears after submit is
         * announced. Deliberately not `aria-live="assertive"` on a wrapper that
         * is always present, which would announce on every keystroke.
         */
        <span className="lg-field__error" id={errorId} role="alert">
          <IconError size={ICON_SM} />
          {error}
        </span>
      )}
    </div>
  );
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** For values a person pastes into a terminal: SHAs, digests, repo paths. */
  mono?: boolean;
  invalid?: boolean;
}

export function Input({ mono, invalid, className, ...rest }: InputProps) {
  return (
    <input
      className={cx("lg-input", mono && "lg-input--mono", className)}
      aria-invalid={invalid || undefined}
      {...rest}
    />
  );
}

export interface TextareaProps
  extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

/** Set at the reading size, because what goes in here is sentences. */
export function Textarea({ invalid, className, ...rest }: TextareaProps) {
  return (
    <textarea
      className={cx("lg-textarea", className)}
      aria-invalid={invalid || undefined}
      {...rest}
    />
  );
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
  children: ReactNode;
}

export function Select({ invalid, className, children, ...rest }: SelectProps) {
  return (
    <select
      className={cx("lg-select", className)}
      aria-invalid={invalid || undefined}
      {...rest}
    >
      {children}
    </select>
  );
}

export interface CheckboxProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label: ReactNode;
  /** Mixed state, for a parent checkbox over a partially selected group. */
  indeterminate?: boolean;
}

/**
 * A native input, restyled — so keyboard behaviour, form participation, the
 * indeterminate state and label association all come for free rather than being
 * reimplemented on a div.
 */
export function Checkbox({
  label,
  indeterminate,
  className,
  ...rest
}: CheckboxProps) {
  return (
    <label className={cx("lg-check", className)}>
      <input
        type="checkbox"
        className="lg-check__box"
        /* The DOM property, not the attribute — there is no HTML attribute for
           it, so React needs the ref callback to set it. */
        ref={(el) => {
          if (el) el.indeterminate = Boolean(indeterminate);
        }}
        {...rest}
      />
      <span className="lg-check__label">{label}</span>
    </label>
  );
}

export function Radio({
  label,
  className,
  ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { label: ReactNode }) {
  return (
    <label className={cx("lg-check", className)}>
      <input type="radio" className="lg-check__box" {...rest} />
      <span className="lg-check__label">{label}</span>
    </label>
  );
}

export function Fieldset({
  legend,
  children,
  className,
}: {
  legend: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <fieldset className={cx("lg-fieldset", className)}>
      <legend>{legend}</legend>
      {children}
    </fieldset>
  );
}
