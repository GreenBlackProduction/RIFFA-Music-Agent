import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

import "./Button.css";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost";
  children: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", className = "", children, ...rest },
  ref,
) {
  const classes = ["btn", `btn--${variant}`, className].filter(Boolean).join(" ");
  return (
    <button ref={ref} className={classes} {...rest}>
      {children}
    </button>
  );
});
