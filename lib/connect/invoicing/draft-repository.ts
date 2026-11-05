import {
  getInvoiceDraftState,
  saveInvoiceDraftState,
} from "@/lib/api-client";
import {
  invoiceDraftsToBlob,
  parseInvoiceDraftCollection,
} from "./draft-collection";
import type { LangId } from "../data";
import { createInvoiceDraft } from "./drafts";
import type { InvoiceDraft } from "./types";

export interface InvoiceDraftSnapshot {
  drafts: InvoiceDraft[];
  revision: number;
}

export async function loadInvoiceDrafts(
  sessionToken: string,
  ownerUserId: string,
  signal?: AbortSignal,
): Promise<InvoiceDraftSnapshot> {
  const record = await getInvoiceDraftState(
    sessionToken,
    signal,
  );

  const blob = record.blob === null
    ? { schemaVersion: "1.0", items: [] }
    : record.blob;

  return {
    drafts: parseInvoiceDraftCollection(blob, ownerUserId),
    revision: record.revision,
  };
}

export async function saveInvoiceDrafts(
  drafts: InvoiceDraft[],
  expectedRevision: number,
  sessionToken: string,
  ownerUserId: string,
): Promise<InvoiceDraftSnapshot> {
  const blob = invoiceDraftsToBlob(drafts, ownerUserId);

  const revision = await saveInvoiceDraftState(
    blob,
    expectedRevision,
    sessionToken,
  );

  return {
    drafts: parseInvoiceDraftCollection(blob, ownerUserId),
    revision,
  };
}

export async function createAndSaveInvoiceDraft(
  snapshot: InvoiceDraftSnapshot,
  sessionToken: string,
  ownerUserId: string,
  language: LangId,
): Promise<{
  draft: InvoiceDraft;
  snapshot: InvoiceDraftSnapshot;
}> {
  const existingBlob = invoiceDraftsToBlob(
    snapshot.drafts,
    ownerUserId,
  );

  const existingDrafts = parseInvoiceDraftCollection(
    existingBlob,
    ownerUserId,
  );

  const draft = createInvoiceDraft({
    ownerUserId,
    language,
  });

  const saved = await saveInvoiceDrafts(
    [draft, ...existingDrafts],
    snapshot.revision,
    sessionToken,
    ownerUserId,
  );

  return {
    draft: saved.drafts[0],
    snapshot: saved,
  };
}