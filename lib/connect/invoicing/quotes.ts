import { atomicToDecimal } from "./amounts";
import { convertInvoiceAtomicToPi } from "./conversion";
import type {
  InvoicePiQuote,
  InvoicePricingBasis,
  PiPaymentAsset,
} from "./payment-types";
import type { InvoiceMoney } from "./types";

export interface CreateInvoicePiQuoteInput {
  id: string;
  invoiceId: string;
  invoiceAmount: InvoiceMoney;
  network: PiPaymentAsset["network"];
  pricing: InvoicePricingBasis;
  createdAt: string;
  expiresAt: string;
}

function parseTimestamp(value: string): number {
  const timestamp = Date.parse(value);

  if (!value.endsWith("Z") || !Number.isFinite(timestamp)) {
    throw new Error("A valid UTC timestamp is required");
  }

  return timestamp;
}

export function createInvoicePiQuote(
  input: CreateInvoicePiQuoteInput,
): InvoicePiQuote {
  if (!input.id.trim() || !input.invoiceId.trim()) {
    throw new Error("Quote and invoice identifiers are required");
  }

  if (
    input.network !== "pi-mainnet" &&
    input.network !== "pi-testnet"
  ) {
    throw new Error("Unsupported Pi network");
  }

  const createdAt = parseTimestamp(input.createdAt);
  const expiresAt = parseTimestamp(input.expiresAt);

  if (expiresAt <= createdAt) {
    throw new Error("Quote expiry must follow its creation");
  }

  const { asset, atomicAmount } = input.invoiceAmount;

  atomicToDecimal(atomicAmount, asset.decimals);

  if (BigInt(atomicAmount) === BigInt(0)) {
    throw new Error("Payment amount must be positive");
  }

  let piAtomicAmount: string;

  if (asset.kind === "native") {
    if (
      asset.code !== "PI" ||
      asset.decimals !== 7 ||
      asset.network !== input.network ||
      input.pricing.kind !== "direct_pi"
    ) {
      throw new Error("Direct Pi payment asset or pricing mismatch");
    }

    piAtomicAmount = atomicAmount;
  } else if (asset.kind === "fiat") {
    if (
      !/^[A-Z]{3}$/.test(asset.code) ||
      input.pricing.kind !== "conversion"
    ) {
      throw new Error("Fiat invoices require conversion pricing");
    }

    const pricing = input.pricing;
    const observedAt = parseTimestamp(pricing.observedAt);

    if (
      !pricing.sourceId.trim() ||
      observedAt > createdAt ||
      pricing.rounding !== "half_up"
    ) {
      throw new Error("Invalid conversion source or observation");
    }

    piAtomicAmount = convertInvoiceAtomicToPi(
      atomicAmount,
      pricing.rateNumerator,
      pricing.rateDenominator,
    );
  } else {
    throw new Error("Unsupported invoice asset");
  }

  if (BigInt(piAtomicAmount) === BigInt(0)) {
    throw new Error("Converted amount is below the minimum Pi unit");
  }

  return {
    schemaVersion: "1.0",
    id: input.id,
    invoiceId: input.invoiceId,
    invoiceAmount: {
      asset: { ...asset },
      atomicAmount,
    },
    paymentAmount: {
      asset: {
        kind: "native",
        code: "PI",
        network: input.network,
        decimals: 7,
      },
      atomicAmount: piAtomicAmount,
    },
    pricing: { ...input.pricing },
    createdAt: input.createdAt,
    expiresAt: input.expiresAt,
  };
}