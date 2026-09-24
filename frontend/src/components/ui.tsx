import type { ReactNode } from "react";
import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";

import { Icon } from "./icons";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="actions">{actions}</div>}
    </header>
  );
}

export function Field({
  label,
  htmlFor,
  hint,
  optional,
  className,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: ReactNode;
  optional?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`field${className ? ` ${className}` : ""}`}>
      <label htmlFor={htmlFor}>
        {label}
        {optional && <span className="opt">optional</span>}
      </label>
      {children}
      {hint && <p className="hint">{hint}</p>}
    </div>
  );
}

export function Alert({
  children,
  tone = "error",
}: {
  children: ReactNode;
  tone?: "error" | "ok" | "note";
}) {
  if (!children) return null;
  const className = tone === "error" ? "alert" : tone;
  return (
    <div className={className} role={tone === "error" ? "alert" : "status"}>
      {children}
    </div>
  );
}

export const NAV_REFRESH_EVENT = "lendline:nav-refresh";

/**
 * Tells the sidebar to reload its counters (open requests, active loans).
 */
export function refreshNav() {
  window.dispatchEvent(new Event(NAV_REFRESH_EVENT));
}

/**
 * Native modal `<dialog>`: the browser handles focus, the backdrop, making the page inert and
 * Escape (only the topmost dialog receives `cancel`), including nested dialogs.
 */
export function Modal({
  title,
  description,
  onClose,
  children,
  footer,
  variant = "modal",
  size,
}: {
  title: string;
  description?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  variant?: "modal" | "sheet";
  size?: "sm" | "lg";
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      dialog?.close();
      document.body.style.overflow = overflow;
    };
  }, []);

  const classes = ["modal-panel", variant === "sheet" ? "sheet" : "", size ?? ""].filter(Boolean);

  return createPortal(
    <dialog
      ref={dialogRef}
      className={classes.join(" ")}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="modal-head">
        <div>
          <h2 id={titleId}>{title}</h2>
          {description && <p>{description}</p>}
        </div>
        <button type="button" className="ghost icon" onClick={onClose} aria-label="Schließen">
          <Icon name="x" />
        </button>
      </div>
      <div className="modal-body">{children}</div>
      {footer && <div className="modal-foot">{footer}</div>}
    </dialog>,
    document.body
  );
}
