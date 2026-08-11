"use client";

import { useEffect, type ReactNode } from "react";
import { cx } from "./ui";
import { IconClose, IconSpinner, IconBack } from "./icons";
import { useConnect } from "@/contexts/connect-context";

export function LoadingScreen({ label }: { label?: string }) {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-background">
      <div className="pc-orb flex h-20 w-20 items-center justify-center rounded-3xl pc-glass">
        <span className="text-3xl font-black pc-brand-text">Pi</span>
      </div>
      <div className="flex items-center gap-2 text-muted-foreground">
        <IconSpinner className="h-4 w-4 pc-spin" />
        <span className="text-sm">{label || "Loading…"}</span>
      </div>
    </div>
  );
}

export function ToastHost() {
  const { toasts, dismissToast } = useConnect();
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[80] flex flex-col items-center gap-2 px-4 pc-safe-top pt-3">
      {toasts.map((t) => (
        <button
          key={t.id}
          onClick={() => dismissToast(t.id)}
          className={cx(
            "pointer-events-auto pc-toast-in max-w-sm rounded-full px-4 py-2.5 text-sm font-medium shadow-lg pc-glass-strong",
            t.tone === "success" && "text-success",
            t.tone === "error" && "text-destructive",
            t.tone === "default" && "text-foreground",
          )}
        >
          {t.message}
        </button>
      ))}
    </div>
  );
}

export function StorageNotice() {
  const { storageNotice, t } = useConnect();
  if (!storageNotice) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[70] flex justify-center px-4">
      <div className="pc-fade-in rounded-full bg-gold/15 px-4 py-2 text-xs font-medium text-gold pc-glass">
        {t.storageNotice}
      </div>
    </div>
  );
}

export function Overlay({
  open,
  onClose,
  children,
  title,
  right,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: ReactNode;
  right?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-background pc-fade-in">
      <header className="pc-glass-strong sticky top-0 z-10 pc-safe-top">
        <div className="flex items-center gap-3 px-3 py-3">
          <button onClick={onClose} className="pc-press flex h-9 w-9 items-center justify-center rounded-full text-foreground rtl:rotate-180">
            <IconBack className="h-5 w-5" />
          </button>
          <h2 className="flex-1 truncate text-lg font-bold">{title}</h2>
          {right}
        </div>
      </header>
      <div className="flex-1 overflow-y-auto pc-no-scrollbar">{children}</div>
    </div>
  );
}

export function Sheet({
  open,
  onClose,
  children,
  title,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[65] flex flex-col justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 pc-fade-in" />
      <div
        className="relative pc-slide-up pc-glass-strong rounded-t-3xl pc-safe-bottom"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <h3 className="text-base font-bold">{title}</h3>
          <button onClick={onClose} className="pc-press flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground">
            <IconClose className="h-5 w-5" />
          </button>
        </div>
        <div className="max-h-[75vh] overflow-y-auto pc-no-scrollbar px-5 pb-6">{children}</div>
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  tone = "danger",
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  tone?: "danger" | "primary";
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[75] flex items-center justify-center p-6" role="alertdialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/60 pc-fade-in" onClick={onCancel} />
      <div className="relative pc-pop w-full max-w-sm rounded-3xl pc-glass-strong p-6">
        <h3 className="text-lg font-bold text-foreground">{title}</h3>
        <p className="mt-2 text-sm text-muted-foreground text-pretty">{message}</p>
        <div className="mt-5 flex gap-3">
          <button
            onClick={onCancel}
            className="pc-press flex-1 rounded-full border border-border py-3 text-sm font-semibold"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={cx(
              "pc-press flex-1 rounded-full py-3 text-sm font-semibold",
              tone === "danger" ? "bg-destructive text-destructive-foreground" : "bg-primary text-primary-foreground",
            )}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
