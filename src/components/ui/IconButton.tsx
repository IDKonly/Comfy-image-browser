import React from "react";

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Accessible label — applied to both aria-label and title (icon-only buttons need this). */
  label: string;
}

/**
 * Icon-only button with a mandatory accessible label. Provides sensible default styling
 * that can be extended/overridden via `className`.
 */
export const IconButton = ({ label, className = "", children, type = "button", ...rest }: IconButtonProps) => (
  <button
    type={type}
    aria-label={label}
    title={label}
    className={`flex items-center justify-center hover:bg-white/5 rounded-lg transition-colors text-neutral-400 hover:text-white ${className}`}
    {...rest}
  >
    {children}
  </button>
);
