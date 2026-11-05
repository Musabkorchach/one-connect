import type {
  InvoiceAsset,
  InvoiceMoney,
  InvoiceTimestamp,
} from "./types";

export type PiPaymentAsset = Extract<
  InvoiceAsset,
  { kind: "native"; code: "PI" }
>;

export interface PiPaymentAmount {
  asset: PiPaymentAsset;
  atomicAmount: string;
}

export type InvoicePricingBasis =
  | {
      kind: "direct_pi";
    }
  | {
      kind: "conversion";
      sourceId: string;
      observedAt: InvoiceTimestamp;
      /**
       * Exact ratio: Pi atomic units per invoice atomic unit.
       * Both values must be positive integer strings.
       */
      rateNumerator: string;
      rateDenominator: string;
      rounding: "half_up";
    };

export interface InvoicePiQuote {
  schemaVersion: "1.0";
  id: string;
  invoiceId: string;
  invoiceAmount: InvoiceMoney;
  paymentAmount: PiPaymentAmount;
  pricing: InvoicePricingBasis;
  createdAt: InvoiceTimestamp;
  expiresAt: InvoiceTimestamp;
}

export type InvoicePiPayment =
  | {
      status: "pending";
      id: string;
      invoiceId: string;
      quoteId: string;
      amount: PiPaymentAmount;
      createdAt: InvoiceTimestamp;
    }
  | {
      status: "confirmed";
      id: string;
      invoiceId: string;
      quoteId: string;
      amount: PiPaymentAmount;
      transactionId: string;
      confirmedAt: InvoiceTimestamp;
      verifiedBy: "server";
    };