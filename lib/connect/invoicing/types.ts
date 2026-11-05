/**
 * Shared invoicing types.
 * Country rules, storage and blockchain adapters are implemented separately.
 * These types do not perform runtime validation.
 */

export type InvoiceDate = string; // YYYY-MM-DD
export type InvoiceTimestamp = string; // ISO 8601 UTC

export type InvoiceAsset =
  | {
      kind: "fiat";
      code: string; // ISO 4217, e.g. EUR
      decimals: number;
    }
  | {
      kind: "native";
      code: "PI";
      network: "pi-mainnet" | "pi-testnet";
      decimals: 7;
    };

/**
 * Integer amount in the asset's smallest unit, encoded as a string.
 * Example: EUR 12.50 => "1250" with decimals: 2.
 * Parse and calculate using integer arithmetic, never floating point.
 */
export interface InvoiceMoney {
  asset: InvoiceAsset;
  atomicAmount: string;
}

export interface InvoiceAddress {
  line1: string;
  line2?: string;
  city: string;
  postalCode?: string;
  region?: string;
  countryCode: string; // ISO 3166-1 alpha-2
}

export interface InvoiceRegistration {
  scheme: string; // e.g. FR:SIREN, FR:SIRET, EU:VAT
  value: string;
}

export interface InvoicePartySnapshot {
  partyId: string; // Stable identifier, independent of display name
  kind: "individual" | "business";
  piIdentity?: {
    userId: string; // Verified Pi user identifier
    username: string; // Stored without @
  };
  legalName: string;
  tradingName?: string;
  address: InvoiceAddress;
  registrations: InvoiceRegistration[];
}

export interface InvoiceCountryProfileRef {
  countryCode: string;
  profileId: string;
  version: string;
}

export interface InvoiceTax {
  scheme: string; // e.g. VAT
  category: string; // Interpreted by the country profile
  ratePercent?: string; // Decimal string, e.g. "20"
  exemptionReason?: string;
}

export interface InvoiceLine {
  id: string;
  description: string;
  quantity: string; // Positive decimal string, e.g. "1.5"
  unitCode: string;
  unitPrice: InvoiceMoney; // Price excluding tax
  netAmount: InvoiceMoney;
  taxes: InvoiceTax[];
}

export interface InvoiceTaxSummary {
  tax: InvoiceTax;
  taxableAmount: InvoiceMoney;
  taxAmount: InvoiceMoney;
}

export interface InvoiceTotals {
  netAmount: InvoiceMoney;
  taxBreakdown: InvoiceTaxSummary[];
  taxAmount: InvoiceMoney;
  grossAmount: InvoiceMoney;
}

export interface InvoicePaymentTerms {
  dueDate: InvoiceDate;
  instructions?: string;
}

export interface InvoiceContent {
  documentType: "invoice" | "credit_note";
  countryProfile: InvoiceCountryProfileRef;
  language: string; // BCP 47, e.g. fr-FR
  asset: InvoiceAsset;
  seller: InvoicePartySnapshot;
  buyer: InvoicePartySnapshot;
  supplyDate?: InvoiceDate;
  lines: InvoiceLine[];
  paymentTerms: InvoicePaymentTerms;
  notes?: string;
  relatedDocumentIds: string[];
}

export interface InvoiceDraft {
  schemaVersion: "1.0";
  id: string;
  status: "draft";
  createdByUserId: string;
  createdAt: InvoiceTimestamp;
  updatedAt: InvoiceTimestamp;
  content: Partial<InvoiceContent>;
}

export interface IssuedInvoice {
  schemaVersion: "1.0";
  id: string;
  status: "issued";
  number: string;
  issueDate: InvoiceDate;
  issuedAt: InvoiceTimestamp;
  createdByUserId: string;
  content: InvoiceContent;
  totals: InvoiceTotals;
}

export type InvoiceDocument = InvoiceDraft | IssuedInvoice;