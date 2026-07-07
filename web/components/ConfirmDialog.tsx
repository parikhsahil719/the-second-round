"use client";

import { useEffect, useRef } from "react";

/** Confirmation modal on the native <dialog> element: focus trap, Esc, and
 * backdrop come free from the platform. Used before any destructive action. */
export default function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body?: string;
  confirmLabel: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog ref={ref} className="confirm" onClose={onCancel}>
      <p className="serif text-lg">{title}</p>
      {body && (
        <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
          {body}
        </p>
      )}
      <div className="mt-5 flex justify-end gap-3">
        <button className="btn-ghost text-sm" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button
          className={`${danger ? "btn-danger" : "btn"} text-sm`}
          onClick={onConfirm}
          disabled={busy}
        >
          {busy ? "One moment…" : confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
