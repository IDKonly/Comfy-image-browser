import React, { useEffect } from "react";
import { X } from "lucide-react";
import { IconButton } from "./IconButton";

interface ModalLayoutProps {
  onClose: () => void;
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  /** Extra controls rendered in the header, left of the close button. */
  headerRight?: React.ReactNode;
  /** Fully-styled footer content (rendered below the scrollable body). */
  footer?: React.ReactNode;
  children: React.ReactNode;
  maxWidthClass?: string;
  heightClass?: string;
  zClass?: string;
  backdropClass?: string;
  closeOnBackdrop?: boolean;
}

/**
 * Shared centered-modal shell: backdrop + panel + structured header (icon/title/subtitle/
 * close) + body slot + optional footer. Handles Esc-to-close and backdrop-click-to-close.
 */
export const ModalLayout = ({
  onClose,
  title,
  subtitle,
  icon,
  headerRight,
  footer,
  children,
  maxWidthClass = "max-w-lg",
  heightClass = "",
  zClass = "z-50",
  backdropClass = "bg-black/80 backdrop-blur-xl",
  closeOnBackdrop = true,
}: ModalLayoutProps) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className={`fixed inset-0 ${zClass} ${backdropClass} flex items-center justify-center p-4 animate-in fade-in duration-300`}
      onMouseDown={closeOnBackdrop ? (e) => { if (e.target === e.currentTarget) onClose(); } : undefined}
    >
      <div className={`bg-neutral-900 border border-white/10 rounded-3xl w-full ${maxWidthClass} ${heightClass} shadow-2xl overflow-hidden flex flex-col`}>
        <div className="p-6 border-b border-white/5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            {icon && (
              <div className="w-10 h-10 bg-blue-600/20 rounded-xl flex items-center justify-center">{icon}</div>
            )}
            <div>
              <h2 className="text-sm font-black uppercase tracking-widest text-left">{title}</h2>
              {subtitle && <p className="text-[10px] text-neutral-500 font-bold uppercase text-left">{subtitle}</p>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {headerRight}
            <IconButton label="Close" onClick={onClose} className="p-2 rounded-full">
              <X className="w-5 h-5" />
            </IconButton>
          </div>
        </div>

        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">{children}</div>

        {footer}
      </div>
    </div>
  );
};
