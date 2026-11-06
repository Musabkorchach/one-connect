"use client";

import { useId } from "react";
import { useConnect } from "@/contexts/connect-context";
import type { InvoicePartyForm } from "@/lib/connect/invoicing/draft-party";

interface InvoicePartyFieldsProps {
  title: string;
  value: InvoicePartyForm;
  onChange: (value: InvoicePartyForm) => void;
  disabled: boolean;
  showIssuerCapacity?: boolean;
}

export function InvoicePartyFields({
  title,
  value,
  onChange,
  disabled,
  showIssuerCapacity = false,
}: InvoicePartyFieldsProps) {
  const { t } = useConnect();
  const prefix = useId();

  const controlClass =
    "w-full rounded-xl border border-border bg-card p-3 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50";

  const textFields: {
    key: Exclude<keyof InvoicePartyForm, "kind" | "issuerCapacity">;
    label: string;
    maxLength: number;
  }[] = [
    { key: "legalName", label: t.invoiceLegalName, maxLength: 500 },
    { key: "tradingName", label: t.invoiceTradingName, maxLength: 500 },
    { key: "line1", label: t.invoiceAddressLine1, maxLength: 500 },
    { key: "line2", label: t.invoiceAddressLine2, maxLength: 500 },
    { key: "city", label: t.invoiceCity, maxLength: 500 },
    { key: "postalCode", label: t.invoicePostalCode, maxLength: 32 },
    { key: "region", label: t.invoiceRegion, maxLength: 500 },
    { key: "countryCode", label: t.invoiceCountryCode, maxLength: 2 },
  ];

  return (
    <fieldset
      disabled={disabled}
      className="min-w-0 space-y-4 rounded-2xl border border-border p-4"
    >
      <legend className="px-2 text-lg font-semibold">
        {title}
      </legend>

      <div>
        <label
          htmlFor={`${prefix}-kind`}
          className="mb-2 block text-sm font-semibold"
        >
          {t.invoicePartyKind}
        </label>
        <select
          id={`${prefix}-kind`}
          value={value.kind}
          onChange={(event) =>
            onChange({
              ...value,
              kind: event.target.value as InvoicePartyForm["kind"],
            })
          }
          className={controlClass}
        >
          <option value="">{t.invoiceChoose}</option>
          <option value="individual">{t.invoiceIndividual}</option>
          <option value="business">{t.invoiceBusiness}</option>
          <option value="public_body">{t.invoicePublicBody}</option>
          <option value="nonprofit">{t.invoiceNonprofit}</option>
        </select>
      </div>

      {showIssuerCapacity && (
        <div>
          <label
            htmlFor={`${prefix}-capacity`}
            className="mb-2 block text-sm font-semibold"
          >
            {t.invoiceIssuerCapacity}
          </label>
          <select
            id={`${prefix}-capacity`}
            value={value.issuerCapacity}
            onChange={(event) =>
              onChange({
                ...value,
                issuerCapacity: event.target
                  .value as InvoicePartyForm["issuerCapacity"],
              })
            }
            className={controlClass}
          >
            <option value="">{t.invoiceChoose}</option>
            <option value="private_individual">
              {t.invoicePrivateIndividual}
            </option>
            <option value="professional">
              {t.invoiceProfessional}
            </option>
            <option value="public_body">
              {t.invoicePublicBody}
            </option>
            <option value="nonprofit">
              {t.invoiceNonprofit}
            </option>
          </select>
        </div>
      )}

      {textFields.map((field) => {
        const id = `${prefix}-${field.key}`;
        const isCountry = field.key === "countryCode";

        return (
          <div key={field.key}>
            <label
              htmlFor={id}
              className="mb-2 block text-sm font-semibold"
            >
              {field.label}
            </label>
            <input
              id={id}
              type="text"
              value={value[field.key]}
              maxLength={field.maxLength}
              aria-describedby={
                isCountry ? `${id}-hint` : undefined
              }
              onChange={(event) =>
                onChange({
                  ...value,
                  [field.key]: isCountry
                    ? event.target.value.toUpperCase()
                    : event.target.value,
                })
              }
              className={controlClass}
            />
            {isCountry && (
              <p
                id={`${id}-hint`}
                className="mt-2 text-xs text-muted-foreground"
              >
                {t.invoiceCountryCodeHint}
              </p>
            )}
          </div>
        );
      })}
    </fieldset>
  );
}