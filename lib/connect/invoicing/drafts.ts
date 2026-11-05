import type { LangId } from "../data";
import type { InvoiceDraft } from "./types";

export interface CreateInvoiceDraftInput {
  ownerUserId: string;
  language: LangId;
}

/**
 * ownerUserId must come from the authenticated session.
 * It must not be taken from an editable form field.
 */
export function createInvoiceDraft(
  input: CreateInvoiceDraftInput,
): InvoiceDraft {
  if (
    !input.ownerUserId ||
    input.ownerUserId !== input.ownerUserId.trim()
  ) {
    throw new Error("An authenticated owner identifier is required");
  }

  const timestamp = new Date().toISOString();

  return {
    schemaVersion: "1.0",
    id: crypto.randomUUID(),
    status: "draft",
    createdByUserId: input.ownerUserId,
    createdAt: timestamp,
    updatedAt: timestamp,
    content: {
      documentType: "invoice",
      billingStage: "standard",
      language: input.language,
      asset: {
        kind: "fiat",
        code: "EUR",
        decimals: 2,
      },
      lines: [],
      relatedDocumentIds: [],
    },
  };
}