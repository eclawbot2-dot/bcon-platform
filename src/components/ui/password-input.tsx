"use client";

import { forwardRef, useState } from "react";

type PasswordInputProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "type"
>;

/**
 * A password field with an accessible show/hide toggle. Renders a normal
 * `.form-input` wrapped in a relatively-positioned container with a small
 * text button pinned to the trailing edge. The button toggles the input
 * between `password` and `text` and exposes its state via `aria-pressed`
 * plus a context-appropriate `aria-label`. Works both controlled (pass
 * `value`/`onChange`) and uncontrolled (native form submission).
 */
export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  function PasswordInput({ className, disabled, ...rest }, ref) {
    const [visible, setVisible] = useState(false);

    return (
      <div className="password-field">
        <input
          {...rest}
          ref={ref}
          type={visible ? "text" : "password"}
          disabled={disabled}
          className={`form-input${className ? ` ${className}` : ""}`}
        />
        <button
          type="button"
          className="password-toggle"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          disabled={disabled}
        >
          {visible ? "Hide" : "Show"}
        </button>
      </div>
    );
  },
);
