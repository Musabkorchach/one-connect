import { z } from "zod";
import type { InvoiceDraft } from "./types";

const text = z.string().max(500);
const identifier = z.string().trim().min(1).max(200);
const countryCode = z.string().regex(/^[A-Z]{2}$/);
const atomicAmount = z.string().max(100).regex(/^(0|[1-9]\d*)$/);

export const invoiceAssetSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("fiat"),
    code: z.string().regex(/^[A-Z]{3}$/),
    decimals: z.number().int().min(0).max(18),
  }).strict(),

  z.object({
    kind: z.literal("native"),
    code: z.literal("PI"),
    network: z.enum(["pi-mainnet", "pi-testnet"]),
    decimals: z.literal(7),
  }).strict(),
]);

const moneySchema = z.object({
  asset: invoiceAssetSchema,
  atomicAmount,
}).strict();

const addressSchema = z.object({
  line1: text,
  line2: text.optional(),
  city: text,
  postalCode: z.string().max(32).optional(),
  region: text.optional(),
  countryCode,
}).strict();

export const invoicePartySchema = z.object({
  partyId: identifier,
  kind: z.enum([
    "individual",
    "business",
    "public_body",
    "nonprofit",
  ]),
  issuerCapacity: z.enum([
    "private_individual",
    "professional",
    "public_body",
    "nonprofit",
  ]).optional(),
  piIdentity: z.object({
    userId: identifier,
    username: z.string().min(1).max(64),
  }).strict().optional(),
  legalName: text,
  tradingName: text.optional(),
  address: addressSchema,
  registrations: z.array(
    z.object({
      scheme: identifier,
      value: identifier,
    }).strict(),
  ).max(20),
}).strict();

const taxSchema = z.object({
  scheme: identifier,
  category: identifier,
  ratePercent: z.string()
    .max(30)
    .regex(/^(0|[1-9]\d*)(\.\d+)?$/)
    .optional(),
  exemptionReason: text.optional(),
}).strict();

const lineSchema = z.object({
  id: identifier,
  description: z.string().max(2000),
  quantity: z.string()
    .max(50)
    .regex(/^(0|[1-9]\d*)(\.\d+)?$/),
  unitCode: identifier,
  unitPrice: moneySchema,
  netAmount: moneySchema,
  taxes: z.array(taxSchema).max(10),
}).strict();

const dateSchema = z.string().date();
const timestampSchema = z.string().datetime();

const contentSchema = z.object({
  documentType: z.enum(["invoice", "credit_note"]),
  billingStage: z.enum([
    "standard",
    "advance",
    "progress",
    "final",
  ]),
  operationCategory: z.enum(["goods", "services", "mixed"]),
  countryProfile: z.object({
    countryCode,
    profileId: identifier,
    version: identifier,
  }).strict(),
  language: z.string().min(1).max(35),
  asset: invoiceAssetSchema,
  seller: invoicePartySchema,
  buyer: invoicePartySchema,
  supplyDate: dateSchema,
  lines: z.array(lineSchema).max(100),
  paymentTerms: z.object({
    dueDate: dateSchema,
    instructions: z.string().max(2000).optional(),
  }).strict(),
  notes: z.string().max(4000),
  relatedDocumentIds: z.array(identifier).max(100),
}).strict().partial();

export const invoiceDraftSchema: z.ZodType<InvoiceDraft> =
  z.object({
    schemaVersion: z.literal("1.0"),
    id: z.string().uuid(),
    status: z.literal("draft"),
    createdByUserId: identifier,
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
    content: contentSchema,
  }).strict().superRefine((draft, context) => {
    if (Date.parse(draft.updatedAt) < Date.parse(draft.createdAt)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["updatedAt"],
        message: "Update time cannot precede creation time",
      });
    }

    const lineIds = (draft.content.lines ?? []).map(
      (line) => line.id,
    );

    if (new Set(lineIds).size !== lineIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["content", "lines"],
        message: "Line identifiers must be unique",
      });
    }
  });

export function parseInvoiceDraft(
  value: unknown,
  ownerUserId: string,
): InvoiceDraft {
  if (!ownerUserId || ownerUserId !== ownerUserId.trim()) {
    throw new Error("An authenticated owner identifier is required");
  }

  const draft = invoiceDraftSchema.parse(value);

  if (draft.createdByUserId !== ownerUserId) {
    throw new Error("Draft owner does not match the current account");
  }

  return draft;
}