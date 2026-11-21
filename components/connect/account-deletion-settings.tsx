"use client";

import { useEffect, useRef, useState } from "react";
import { usePiAuth } from "@/contexts/pi-auth-context";
import { confirmAccountDeletion, createDeletionFlow, requestDeletionChallenge, type DeletionView } from "@/lib/account-deletion";
import { API_URL } from "@/lib/api-client";
import { RTL_LANGS, type LangId } from "@/lib/connect/data";
import { getDeletionCopy, getDict } from "@/lib/connect/i18n";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "./ui";

const idle: DeletionView = { phase: "idle", canRetry: false };

export function AccountDeletionSettings({ sessionToken, language }: { sessionToken: string; language: LangId }) {
  const auth = usePiAuth();
  const latest = useRef({ auth, language });
  latest.current = { auth, language };
  const flow = useRef<ReturnType<typeof createDeletionFlow> | null>(null);
  const [open, setOpen] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [state, setState] = useState<DeletionView>(idle);

  useEffect(() => {
    setOpen(false);
    setAcknowledged(false);
    setState(idle);
    if (!auth.accountDeletionSupported) return;
    const controller = createDeletionFlow({
      getPiToken: (signal) => latest.current.auth.getDeletionPiToken(sessionToken, signal),
      challenge: (signal) => requestDeletionChallenge(API_URL, sessionToken, signal),
      confirm: (body, signal) => confirmAccountDeletion(API_URL, sessionToken, body, signal),
      isCurrent: () => latest.current.auth.accountDeletionSupported && latest.current.auth.isCurrentSession(sessionToken),
      onChange: setState,
      onAccepted: () => latest.current.auth.finishAccountDeletion(sessionToken, latest.current.language),
    });
    flow.current = controller;
    return () => {
      controller.dispose();
      flow.current = null;
    };
  }, [sessionToken, auth.accountDeletionSupported]);

  if (!auth.accountDeletionSupported || !auth.isCurrentSession(sessionToken)) return null;
  const copy = getDeletionCopy(language);
  const dict = getDict(language);
  const direction = RTL_LANGS.includes(language) ? "rtl" : "ltr";
  const busy = state.phase === "preparing" || state.phase === "sending";
  const uncertain = state.issue === "uncertain";

  return (
    <section className="space-y-3 rounded-2xl pc-glass p-4" lang={language} dir={direction}>
      <h2 className="text-sm font-semibold">{dict.settings}</h2>
      <AlertDialog open={open} onOpenChange={(next) => {
        if (!next && flow.current?.cancel() === false) return;
        setAcknowledged(false);
        setOpen(next);
      }}>
        <AlertDialogTrigger className="pc-press w-full rounded-xl border border-destructive/50 px-4 py-3 text-start text-sm font-semibold text-destructive">
          {copy.action}
        </AlertDialogTrigger>
        <AlertDialogContent
          className="max-h-[85dvh] overflow-y-auto rounded-2xl"
          lang={language}
          dir={direction}
        >
          <AlertDialogTitle className="text-start">{copy.action}</AlertDialogTitle>
          <AlertDialogDescription className="text-start">{copy.description}</AlertDialogDescription>
          {!uncertain && (
            <label className="flex items-start gap-3 rounded-xl border p-3 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
                checked={acknowledged}
                disabled={busy}
                onChange={(event) => setAcknowledged(event.target.checked)}
              />
              <span>{copy.acknowledge}</span>
            </label>
          )}
          <div role="status" aria-live="polite" className="text-sm text-muted-foreground">
            {busy ? dict.connecting : state.issue ? copy[state.issue] : null}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={state.phase === "sending"}>{uncertain ? dict.close : dict.cancel}</AlertDialogCancel>
            {(!uncertain || state.canRetry) && (
              <Button
                type="button"
                variant="danger"
                disabled={busy || (!uncertain && !acknowledged)}
                onClick={() => {
                  if (uncertain) void flow.current?.retry();
                  else void flow.current?.submit(acknowledged);
                }}
              >
                {uncertain ? dict.invoicesRetry : copy.action}
              </Button>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
