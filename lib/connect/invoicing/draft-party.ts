import { invoicePartySchema } from "./draft-schema";
import type {
  InvoiceIssuerCapacity,
  InvoicePartyKind,
  InvoicePartySnapshot,
} from "./types";

export interface InvoicePartyForm {
  kind: InvoicePartyKind | "";
  issuerCapacity: InvoiceIssuerCapacity | "";
  legalName: string;
  tradingName: string;
  line1: string;
  line2: string;
  city: string;
  postalCode: string;
  region: string;
  countryCode: string;
}

export function invoicePartyToForm(
  party?: InvoicePartySnapshot,
): InvoicePartyForm {
  return {
    kind: party?.kind ?? "",
    issuerCapacity: party?.issuerCapacity ?? "",
    legalName: party?.legalName ?? "",
    tradingName: party?.tradingName ?? "",
    line1: party?.address.line1 ?? "",
    line2: party?.address.line2 ?? "",
    city: party?.address.city ?? "",
    postalCode: party?.address.postalCode ?? "",
    region: party?.address.region ?? "",
    countryCode: party?.address.countryCode ?? "",
  };
}

export function invoicePartyFromForm(
  form: InvoicePartyForm,
  previous?: InvoicePartySnapshot,
): InvoicePartySnapshot {
  const optionalText = (value: string): string | undefined =>
    value.trim() || undefined;

  const party = invoicePartySchema.parse({
    partyId: previous?.partyId ?? crypto.randomUUID(),
    kind: form.kind,
    issuerCapacity: form.issuerCapacity || undefined,
    legalName: form.legalName.trim(),
    tradingName: optionalText(form.tradingName),
    address: {
      line1: form.line1.trim(),
      line2: optionalText(form.line2),
      city: form.city.trim(),
      postalCode: optionalText(form.postalCode),
      region: optionalText(form.region),
      countryCode: form.countryCode.trim().toUpperCase(),
    },
    registrations: previous?.registrations ?? [],
    ...(previous?.piIdentity
      ? { piIdentity: previous.piIdentity }
      : {}),
  });

  return party;
}