"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useConnect } from "@/contexts/connect-context";
import type {
  InvoiceContent,
  InvoiceDraft,
} from "@/lib/connect/invoicing/types";

interface InvoiceDraftEditorProps {
  draft: InvoiceDraft;
  saving: boolean;
  blocked: boolean;
  saveError: "conflict" | "save" | null;
  onSave: (patch: Partial<InvoiceContent>) => Promise<boolean>;
  onBack: () => void;
  onReload: () => void;
}

export function InvoiceDraftEditor({
  draft,
  saving,
  blocked,
  saveError,
  onSave,
  onBack,
  onReload,
}: InvoiceDraftEditorProps) {
  const { t, profile } = useConnect();
  const notesId = useId();
  const initialNotes = draft.content.notes ?? "";
  const [notes, setNotes] = useState(initialNotes);
  const [invalid, setInvalid] = useState(false);
  const [unexpectedFailure, setUnexpectedFailure] = useState(false);
  const submitting = useRef(false);
  const dirty = notes !== initialNotes;

  useEffect(() => {
    if (!dirty) return;

    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
    };
  }, [dirty]);

  const confirmLeaving = () =>
    !dirty || window.confirm(t.invoicesDiscardChanges);

  const submit = async () => {
    if (saving || blocked || submitting.current || !dirty) return;

    if (notes.length > 4000) {
      setInvalid(true);
      return;
    }

    submitting.current = true;
    setInvalid(false);
    setUnexpectedFailure(false);

    try {
      const saved = await onSave({ notes });
      if (saved) onBack();
    } catch {
      setUnexpectedFailure(true);
    } finally {
      submitting.current = false;
    }
  };

  return (
    <section
      dir={profile.language === "ar" ? "rtl" : "ltr"}
      aria-labelledby="draft-editor-title"
      className="min-h-[100dvh] px-4 pb-28 pt-6"
    >
      <button
        type="button"
        disabled={saving}
        onClick={() => {
          if (!submitting.current && confirmLeaving()) onBack();
        }}
        className="mb-5 rounded-xl border border-border px-4 py-2 text-sm disabled:opacity-50"
      >
        {t.back}
      </button>

      <h1
        id="draft-editor-title"
        className="text-2xl font-bold text-foreground"
      >
        {t.invoicesEditDraft}
      </h1>

      <p className="mb-6 mt-2 text-sm text-muted-foreground">
        {t.invoicesDraftHint}
      </p>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
        aria-busy={saving}
        className="space-y-5"
      >
        <div>
          <label
            htmlFor={notesId}
            className="mb-2 block text-sm font-semibold"
          >
            {t.invoicesNotes}
          </label>
          <textarea
            id={notesId}
            value={notes}
            maxLength={4000}
            rows={7}
            disabled={saving}
            aria-invalid={invalid}
            onChange={(event) => {
              setNotes(event.target.value);
              setInvalid(false);
            }}
            className="w-full resize-y rounded-xl border border-border bg-card p-3 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
          />
        </div>

        {invalid && (
          <p role="alert" className="text-sm text-destructive">
            {t.invoicesInvalidDraft}
          </p>
        )}

        {(saveError || unexpectedFailure) && (
          <div
            role="alert"
            className="rounded-xl border border-destructive/40 p-4"
          >
            <p className="text-sm text-destructive">
              {saveError === "conflict"
                ? t.invoicesConflict
                : t.invoicesSaveError}
            </p>
            <button
              type="button"
              disabled={saving}
              onClick={() => {
                if (!submitting.current && confirmLeaving()) onReload();
              }}
              className="mt-3 rounded-lg border border-border px-3 py-2 text-sm"
            >
              {t.invoicesRetry}
            </button>
          </div>
        )}

        <button
          type="submit"
          disabled={saving || blocked || !dirty || unexpectedFailure}
          className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span aria-live="polite">
            {saving ? t.invoicesSaving : t.saveDraft}
          </span>
        </button>
      </form>
    </section>
  );
}