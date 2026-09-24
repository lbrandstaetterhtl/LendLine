import type { KeyboardEvent, ReactNode } from "react";
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
  const ref = useRef<HTMLDivElement>(null);
  const shown = useRef<ReactNode>(null);
  // A message above a long form would otherwise appear out of sight, as if nothing happened.
  useEffect(() => {
    if (!children || children === shown.current) return;
    shown.current = children;
    ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [children]);
  if (!children) return null;
  const className = tone === "error" ? "alert" : tone;
  return (
    <div ref={ref} className={className} role={tone === "error" ? "alert" : "status"}>
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

// Open dialogs share one scroll lock. Nested dialogs can close in any order (a list dialog
// closing while the calendar it opened stays up), so each one must not restore what it saw.
let openDialogs = 0;

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
  onKeyDown,
}: {
  title: string;
  description?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  variant?: "modal" | "sheet";
  size?: "sm" | "lg";
  /**
   * Extra keys for this dialog, e.g. arrows in the image viewer.
   */
  onKeyDown?: (event: KeyboardEvent<HTMLDialogElement>) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    // React removes the dialog before the browser could restore focus, so do it here.
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog?.showModal();
    // Start in the first field rather than on the close button.
    dialog
      ?.querySelector<HTMLElement>(
        ".modal-body :is(input, select, textarea):not([disabled], [type='hidden'])"
      )
      ?.focus();
    openDialogs += 1;
    document.body.style.overflow = "hidden";
    return () => {
      dialog?.close();
      openDialogs -= 1;
      if (openDialogs === 0) document.body.style.overflow = "";
      if (opener?.isConnected) opener.focus();
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
      onKeyDown={(event) => {
        onKeyDown?.(event);
        // Ctrl+Enter (Cmd+Enter on a Mac) saves from anywhere in the dialog, also from a textarea.
        if (event.key !== "Enter" || !(event.ctrlKey || event.metaKey)) return;
        const form = event.currentTarget.querySelector("form");
        if (!form) return;
        event.preventDefault();
        event.stopPropagation();
        form.requestSubmit();
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
