"use client";

import { FileText } from "lucide-react";
import { useConnect } from "@/contexts/connect-context";
import { useInvoiceDrafts } from "@/lib/connect/invoicing/use-invoice-drafts";

export function InvoicesView() {
  const { t, profile } = useConnect();
  const {
    drafts,
    ready,
    loading,
    loadError,
    reload,
    saving,
    createError,
    canCreate,
    createDraft,
  } = useInvoiceDrafts();

  return (
    <section
      dir={profile.language === "ar" ? "rtl" : "ltr"}
      aria-labelledby="invoices-title"
      aria-busy={loading}
      className="min-h-[100dvh] px-4 pb-28 pt-6"
    >
      <header className="mb-6">
        <h1
          id="invoices-title"
          className="text-2xl font-bold text-foreground"
        >
          {t.tabInvoices}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t.invoicesEmptySub}
        </p>
      </header>
            <button
        type="button"
        disabled={!canCreate}
        aria-busy={saving}
        onClick={() => {
          void createDraft(profile.language);
        }}
        className="mb-6 w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span aria-live="polite">
          {saving ? t.invoicesSaving : t.invoicesCreateDraft}
        </span>
      </button>

      {createError && (
        <div
          role="alert"
          className="mb-6 rounded-2xl border border-destructive/40 p-5"
        >
          <p className="text-sm text-destructive">
            {createError === "conflict"
              ? t.invoicesConflict
              : t.invoicesSaveError}
          </p>
          <button
            type="button"
            onClick={reload}
            className="mt-4 rounded-xl border border-border px-4 py-2 text-sm font-semibold"
          >
            {t.invoicesRetry}
          </button>
        </div>
      )}

      <div className="mb-6 rounded-2xl border border-primary/20 bg-primary/5 p-4">
        <p className="text-sm font-medium text-foreground">
          {t.invoicesPaymentNote}
        </p>
      </div>

      {loading && (
        <p role="status" className="py-8 text-center text-muted-foreground">
          {t.invoicesLoading}
        </p>
      )}

      {loadError && (
        <div
          role="alert"
          className="rounded-2xl border border-destructive/40 p-5"
        >
          <p className="text-sm text-destructive">
            {t.invoicesLoadError}
          </p>
          <button
            type="button"
            onClick={reload}
            className="mt-4 rounded-xl border border-border px-4 py-2 text-sm font-semibold"
          >
            {t.invoicesRetry}
          </button>
        </div>
      )}

      {ready && drafts.length === 0 && (
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-border px-5 py-12 text-center">
          <div className="mb-4 rounded-full bg-muted p-4">
            <FileText
              aria-hidden="true"
              className="h-8 w-8 text-muted-foreground"
            />
          </div>
          <p className="text-sm font-semibold text-foreground">
            {t.invoicesEmpty}
          </p>
        </div>
      )}

      {ready && drafts.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-semibold">
            {t.drafts}
          </h2>
          <ul className="space-y-3">
            {drafts.map((draft) => (
              <li
                key={draft.id}
                className="rounded-2xl border border-border bg-card p-4"
              >
                <p className="break-words font-semibold text-foreground">
                  {draft.content.buyer?.legalName.trim() ||
                    draft.content.lines?.[0]?.description.trim() ||
                    t.drafts}
                </p>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span>{t.drafts}</span>
                  <time dateTime={draft.updatedAt}>
                    {new Date(draft.updatedAt).toLocaleDateString(
                      profile.language,
                      {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      },
                    )}
                  </time>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}