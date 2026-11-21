"use client";

import { useEffect, useRef, useState } from "react";
import { usePiAuth } from "@/contexts/pi-auth-context";
import { InvoiceDraftConflictError } from "@/lib/api-client";
import type { LangId } from "../data";
import type { InvoiceContent, InvoiceDraft } from "./types";
import {
  createAndSaveInvoiceDraft,
  loadInvoiceDrafts,
  updateAndSaveInvoiceDraft,
  type InvoiceDraftSnapshot,
} from "./draft-repository";

type CreateError = "conflict" | "save" | null;

interface DraftIdentity {
  ownerUserId: string;
  sessionToken: string;
  requestId: number;
}

interface DraftLoadState extends DraftIdentity {
  status: "ready" | "error";
  snapshot: InvoiceDraftSnapshot | null;
  saving: boolean;
  createError: CreateError;
}

interface DraftScope extends DraftIdentity {
  snapshot: InvoiceDraftSnapshot | null;
  busy: boolean;
  blocked: boolean;
  signal: AbortSignal;
}

export function useInvoiceDrafts() {
  const { isAuthenticated, sessionToken, userId, privateDataOwner, isCurrentSession } = usePiAuth();
  const owner = privateDataOwner ?? userId;
  const [requestId, setRequestId] = useState(0);
  const [state, setState] = useState<DraftLoadState | null>(null);
  const scopeRef = useRef<DraftScope | null>(null);

  useEffect(() => {
    if (!isAuthenticated || !sessionToken || !owner) {
      scopeRef.current = null;
      setState(null);
      return;
    }

    const controller = new AbortController();
    const identity: DraftIdentity = {
      ownerUserId: owner,
      sessionToken,
      requestId,
    };

    const scope: DraftScope = {
      ...identity,
      snapshot: null,
      busy: false,
      blocked: false,
      signal: controller.signal,
    };

    scopeRef.current = scope;

    void loadInvoiceDrafts(
      sessionToken,
      owner,
      controller.signal,
      Boolean(privateDataOwner),
    ).then(
      (snapshot) => {
        if (scopeRef.current !== scope || !isCurrentSession(scope.sessionToken)) return;

        scope.snapshot = snapshot;
        setState({
          ...identity,
          status: "ready",
          snapshot,
          saving: false,
          createError: null,
        });
      },
      () => {
        if (scopeRef.current !== scope || !isCurrentSession(scope.sessionToken)) return;

        setState({
          ...identity,
          status: "error",
          snapshot: null,
          saving: false,
          createError: null,
        });
      },
    );

    return () => {
      if (scopeRef.current === scope) {
        scopeRef.current = null;
      }
      controller.abort();
    };
  }, [isAuthenticated, sessionToken, owner, privateDataOwner, isCurrentSession, requestId]);

  const authenticated = Boolean(
    isAuthenticated && sessionToken && owner && isCurrentSession(sessionToken),
  );

  const current =
    authenticated &&
    state?.ownerUserId === owner &&
    state?.sessionToken === sessionToken &&
    state?.requestId === requestId
      ? state
      : null;

  const createDraft = async (
    language: LangId,
  ): Promise<InvoiceDraft | null> => {
    const scope = scopeRef.current;

    if (
      !isAuthenticated ||
      !scope ||
      scope.ownerUserId !== owner ||
      !isCurrentSession(scope.sessionToken) ||
      scope.sessionToken !== sessionToken ||
      scope.requestId !== requestId ||
      !scope.snapshot ||
      scope.busy ||
      scope.blocked
    ) {
      return null;
    }

    scope.busy = true;

    setState((previous) =>
      previous && scopeRef.current === scope
        ? { ...previous, saving: true, createError: null }
        : previous,
    );

    try {
      const result = await createAndSaveInvoiceDraft(
        scope.snapshot,
        scope.sessionToken,
        scope.ownerUserId,
        language,
        scope.signal,
      );

      if (scopeRef.current !== scope || !isCurrentSession(scope.sessionToken)) return null;

      scope.snapshot = result.snapshot;

      setState({
        ownerUserId: scope.ownerUserId,
        sessionToken: scope.sessionToken,
        requestId: scope.requestId,
        status: "ready",
        snapshot: result.snapshot,
        saving: false,
        createError: null,
      });

      return result.draft;
    } catch (error) {
      if (scopeRef.current !== scope || !isCurrentSession(scope.sessionToken)) return null;

      scope.blocked = true;

      setState((previous) =>
        previous
          ? {
              ...previous,
              saving: false,
              createError:
                error instanceof InvoiceDraftConflictError
                  ? "conflict"
                  : "save",
            }
          : previous,
      );

      return null;
    } finally {
      scope.busy = false;
    }
  };

  const updateDraft = async (
    snapshotAtOpen: InvoiceDraftSnapshot,
    draftId: string,
    patch: Partial<InvoiceContent>,
  ): Promise<InvoiceDraft | null> => {
    const scope = scopeRef.current;

    if (
      !isAuthenticated ||
      !scope ||
      scope.ownerUserId !== owner ||
      !isCurrentSession(scope.sessionToken) ||
      scope.sessionToken !== sessionToken ||
      scope.requestId !== requestId ||
      !scope.snapshot ||
      scope.busy ||
      scope.blocked
    ) {
      return null;
    }

    scope.busy = true;

    setState((previous) =>
      previous && scopeRef.current === scope
        ? { ...previous, saving: true, createError: null }
        : previous,
    );

    try {
      if (snapshotAtOpen.revision !== scope.snapshot.revision) {
        throw new InvoiceDraftConflictError();
      }

      const result = await updateAndSaveInvoiceDraft(
        snapshotAtOpen,
        draftId,
        patch,
        scope.sessionToken,
        scope.ownerUserId,
        scope.signal,
      );

      if (scopeRef.current !== scope || !isCurrentSession(scope.sessionToken)) return null;

      scope.snapshot = result.snapshot;

      setState({
        ownerUserId: scope.ownerUserId,
        sessionToken: scope.sessionToken,
        requestId: scope.requestId,
        status: "ready",
        snapshot: result.snapshot,
        saving: false,
        createError: null,
      });

      return result.draft;
    } catch (error) {
      if (scopeRef.current !== scope || !isCurrentSession(scope.sessionToken)) return null;

      scope.blocked = true;

      setState((previous) =>
        previous && scopeRef.current === scope
          ? {
              ...previous,
              saving: false,
              createError:
                error instanceof InvoiceDraftConflictError
                  ? "conflict"
                  : "save",
            }
          : previous,
      );

      return null;
    } finally {
      scope.busy = false;
    }
  };

  return {
    drafts: current?.snapshot?.drafts ?? [],
    revision: current?.snapshot?.revision ?? null,
    ready: current?.status === "ready",
    loading: authenticated && current === null,
    loadError: current?.status === "error",
    saving: current?.saving ?? false,
    createError: current?.createError ?? null,
    canCreate:
      current?.status === "ready" &&
      !current.saving &&
      current.createError === null,
    createDraft,
    updateDraft,
    reload: () => {
      if (scopeRef.current?.busy) return;
      setRequestId((value) => value + 1);
    },
  };
}