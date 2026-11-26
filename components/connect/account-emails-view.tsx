"use client";

import { useEffect, useRef, useState } from "react";
import { usePiAuth } from "@/contexts/pi-auth-context";
import { startAccountMailbox, type MailboxStatus } from "@/lib/account-mailbox";
import {
  deleteInternalEmail, markInternalEmailRead, sendExternalEmail, sendInternalEmail, uploadEmailAttachment,
} from "@/lib/api-client";
import { validateEmailRecipient, type Email } from "@/lib/connect/data";
import { getDict } from "@/lib/connect/i18n";
import { MailboxView } from "./emails-view";

const connectionMessages = {
  connecting: "Connecting to email…",
  connected: "",
  offline: "Live email updates are unavailable.",
  deleting: "Email is unavailable while account deletion is in progress.",
  inactive: "Email is unavailable because this account is no longer active.",
  migration: "Account migration is required before this mailbox can be opened.",
} satisfies Record<MailboxStatus, string>;

export function AccountEmailsView({ sessionToken, username }: { sessionToken: string; username: string }) {
  const { endLocalSession, isCurrentSession } = usePiAuth();
  const [status, setStatus] = useState<MailboxStatus>("connecting");
  const [emails, setEmails] = useState<Email[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [notice, setNotice] = useState("");
  const connection = useRef<ReturnType<typeof startAccountMailbox> | null>(null);
  const t = getDict("en");

  useEffect(() => {
    const mailbox = startAccountMailbox({
      sessionToken,
      username,
      isCurrent: () => isCurrentSession(sessionToken),
      onEmails: (next) => {
        setEmails(next);
        setLoadFailed(false);
      },
      onStatus: setStatus,
      onLoadError: () => setLoadFailed(true),
    });
    connection.current = mailbox;
    return () => {
      mailbox.close();
      connection.current = null;
    };
  }, [sessionToken, username, isCurrentSession]);

  async function changeMailbox(action: (canUseMailbox: () => boolean) => Promise<void>) {
    const mailbox = connection.current;
    if (!mailbox?.canUseMailbox()) return false;
    setNotice("");
    try {
      await action(mailbox.canUseMailbox);
      return mailbox.canUseMailbox();
    } catch (error) {
      if (mailbox.canUseMailbox()) {
        setNotice(error instanceof Error ? error.message : "Unable to update email.");
      }
      return false;
    } finally {
      mailbox.refresh();
    }
  }

  const terminal = status === "deleting" || status === "inactive" || status === "migration";
  return (
    <main className="mx-auto max-w-md">
      <div className="space-y-2 p-4">
        <button type="button" className="underline" onClick={() => endLocalSession("en")}>Sign out</button>
        {connectionMessages[status] && <p role="status">{connectionMessages[status]}</p>}
        {!terminal && process.env.NEXT_PUBLIC_ONECONNECT_DEPLOYMENT !== "production-review" && (
          <p>Older email history requires account migration.</p>
        )}
        {!terminal && notice && <p role="status">{notice}</p>}
        {!terminal && loadFailed && <p role="status">Unable to refresh email.</p>}
        {!terminal && emails === null && !loadFailed && <p>Loading email…</p>}
      </div>
      {!terminal && emails !== null && <MailboxView mailbox={{
        t, lang: "en", emails, contacts: [],
        internalOnly: process.env.NEXT_PUBLIC_ONECONNECT_DEPLOYMENT === "production-review",
        pushToast: setNotice,
        sendEmail: (recipient, subject, body, _attachmentName, _attachmentSize, requestId, file) =>
          changeMailbox(async (canUseMailbox) => {
            const type = validateEmailRecipient(recipient);
            if (!type) throw new Error("Invalid email recipient.");
            if (type === "external" && process.env.NEXT_PUBLIC_ONECONNECT_DEPLOYMENT === "production-review") {
              throw new Error("Only internal One Connect mail is enabled in this environment.");
            }
            const attachment = file ? await uploadEmailAttachment(sessionToken, recipient, file) : null;
            if (!canUseMailbox()) return;
            const send = type === "external" ? sendExternalEmail : sendInternalEmail;
            await send(sessionToken, {
              id: requestId ?? crypto.randomUUID(), recipient, subject, body,
              ...(attachment ? { attachmentId: attachment.attachmentId } : {}),
            });
          }),
        markEmailRead: (id) => { void changeMailbox(() => markInternalEmailRead(sessionToken, id)); },
        deleteEmail: (id) => changeMailbox(() => deleteInternalEmail(sessionToken, id)),
      }} />}
    </main>
  );
}
