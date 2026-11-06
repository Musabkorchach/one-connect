import {
  getInvoiceDraftState,
  saveInvoiceDraftState,
} from "@/lib/api-client";
import {
  invoiceDraftsToBlob,
  parseInvoiceDraftCollection,
} from "./draft-collection";
import type { LangId } from "../data";
import {
  createInvoiceDraft,
  updateInvoiceDraftContent,
} from "./drafts";
import type { InvoiceContent, InvoiceDraft } from "./types";

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

export async function updateAndSaveInvoiceDraft(
  snapshot: InvoiceDraftSnapshot,
  draftId: string,
  patch: Partial<InvoiceContent>,
  sessionToken: string,
  ownerUserId: string,
): Promise<{
  draft: InvoiceDraft;
  snapshot: InvoiceDraftSnapshot;
}> {
  const blob = invoiceDraftsToBlob(
    snapshot.drafts,
    ownerUserId,
  );

  const drafts = parseInvoiceDraftCollection(
    blob,
    ownerUserId,
  );

  const index = drafts.findIndex(
    (draft) => draft.id === draftId,
  );

  if (index === -1) {
    throw new Error("Draft not found in the loaded snapshot");
  }

  drafts[index] = updateInvoiceDraftContent(
    drafts[index],
    ownerUserId,
    patch,
  );

  const saved = await saveInvoiceDrafts(
    drafts,
    snapshot.revision,
    sessionToken,
    ownerUserId,
  );

  return {
    draft: saved.drafts[index],
    snapshot: saved,
  };
}