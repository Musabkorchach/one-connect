import { z } from "zod";
import {
  invoiceDraftSchema,
  parseInvoiceDraft,
} from "./draft-schema";
import type { InvoiceDraft } from "./types";

const MAX_STORAGE_BYTES = 256 * 1024;

const collectionSchema = z.object({
  schemaVersion: z.literal("1.0"),
  items: z.array(invoiceDraftSchema).max(50),
}).strict();

function validateOwner(ownerUserId: string): void {
  if (!ownerUserId || ownerUserId !== ownerUserId.trim()) {
    throw new Error("An authenticated owner identifier is required");
  }
}

export function parseInvoiceDraftCollection(
  value: unknown,
  ownerUserId: string,
): InvoiceDraft[] {
  validateOwner(ownerUserId);

  const collection = collectionSchema.parse(value);
  const ids = new Set<string>();

  return collection.items.map((item) => {
    if (ids.has(item.id)) {
      throw new Error("Duplicate draft identifier");
    }

    ids.add(item.id);
    return parseInvoiceDraft(item, ownerUserId);
  });
}

export function invoiceDraftsToBlob(
  drafts: InvoiceDraft[],
  ownerUserId: string,
): Record<string, unknown> {
  const items = parseInvoiceDraftCollection(
    {
      schemaVersion: "1.0",
      items: drafts,
    },
    ownerUserId,
  );

  const blob = {
    schemaVersion: "1.0",
    items,
  };

  const bytes = new TextEncoder().encode(
    JSON.stringify(blob),
  ).byteLength;

  if (bytes > MAX_STORAGE_BYTES) {
    throw new Error("Draft collection exceeds the storage limit");
  }

  return blob;
}