"use client";

import { FileText } from "lucide-react";
import { useConnect } from "@/contexts/connect-context";

export function InvoicesView() {
  const { t, profile } = useConnect();

  return (
    <section
      dir={profile.language === "ar" ? "rtl" : "ltr"}
      aria-labelledby="invoices-title"
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

      <div className="mb-6 rounded-2xl border border-primary/20 bg-primary/5 p-4">
        <p className="text-sm font-medium text-foreground">
          {t.invoicesPaymentNote}
        </p>
      </div>

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
    </section>
  );
}