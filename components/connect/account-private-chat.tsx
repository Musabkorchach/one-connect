"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { usePiAuth } from "@/contexts/pi-auth-context";
import {
  startPrivateChat, type ChatConnectionStatus, type PrivateConversation, type PrivateHistory,
} from "@/lib/account-private-chat";
import { deleteChatMessage, uploadChatAttachment, uploadChatImage } from "@/lib/api-client";
import type { MsgKind } from "@/lib/connect/data";
import { getDict } from "@/lib/connect/i18n";
import { ConversationBubble } from "./conversation-view";
import { ConfirmDialog, Sheet } from "./feedback";
import { VoiceRecorder } from "./voice-recorder";
import type { StartPeerCall } from "./account-peer-calls";

type Chat = ReturnType<typeof startPrivateChat>;
const migrationNotice = "ACCOUNT_MIGRATION_REQUIRED — Older chat history requires account migration.";
const connectionMessages: Record<ChatConnectionStatus, string> = {
  connecting: "Connecting to private chat…",
  connected: "",
  offline: "Live chat is offline.",
  deleting: "Chat is unavailable while account deletion is in progress.",
  inactive: "Chat is unavailable because this account is no longer active.",
  migration: migrationNotice,
};

export function AccountPrivateChat({ sessionToken, username, startCall }: {
  sessionToken: string; username: string; startCall?: StartPeerCall;
}) {
  const { endLocalSession, isCurrentSession } = usePiAuth();
  const [status, setStatus] = useState<ChatConnectionStatus>("connecting");
  const [entries, setEntries] = useState<PrivateConversation[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [history, setHistory] = useState<PrivateHistory | null>(null);
  const [peerName, setPeerName] = useState("");
  const [notice, setNotice] = useState("");
  const chat = useRef<Chat | null>(null);

  useEffect(() => {
    const connection = startPrivateChat({
      sessionToken,
      isCurrent: () => isCurrentSession(sessionToken),
      onList: setEntries,
      onSelection: (id) => {
        setSelected(id);
        setHistory(null);
        setNotice("");
      },
      onHistory: setHistory,
      onError: setNotice,
      onStatus: setStatus,
    });
    chat.current = connection;
    const onVisible = () => {
      if (document.visibilityState === "visible") connection.refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      connection.close();
      chat.current = null;
    };
  }, [sessionToken, isCurrentSession]);

  const terminal = status === "deleting" || status === "inactive" || status === "migration";
  const opened = history?.conversationId === selected ? history : null;
  const listed = entries?.find((entry) => entry.conversationId === selected);
  const visibleHistory = opened && listed && !listed.canSend ? { ...opened, ...listed } : opened;
  const callPeer = visibleHistory?.canSend && visibleHistory.peer.state === "active" ? visibleHistory.peer.username : null;

  return (
    <main className="mx-auto max-w-md space-y-3 p-4">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Private chats</h1>
        <button type="button" className="underline" onClick={() => endLocalSession("en")}>Sign out</button>
      </header>
      {connectionMessages[status] && <p role="status">{connectionMessages[status]}</p>}
      {!terminal && process.env.NEXT_PUBLIC_ONECONNECT_DEPLOYMENT !== "production-review" && (
        <p className="text-sm text-muted-foreground">{migrationNotice}</p>
      )}
      {!terminal && notice && <p role="alert">{notice}</p>}
      {!terminal && selected === null && (
        <>
          <form className="flex items-end gap-2" onSubmit={(event) => {
            event.preventDefault();
            const target = peerName.trim();
            if (target) {
              setNotice("");
              void chat.current?.start(target);
            }
          }}>
            <label className="min-w-0 flex-1">
              <span className="block text-sm">Pi username</span>
              <input className="w-full rounded border bg-background p-2" value={peerName}
                onChange={(event) => setPeerName(event.target.value)} maxLength={33} />
            </label>
            <button className="rounded bg-primary px-3 py-2 text-primary-foreground" type="submit" disabled={!peerName.trim()}>
              Open chat
            </button>
          </form>
          {entries === null ? <p>Loading conversations…</p> : (
            <ul className="space-y-2">
              {entries.map((entry) => (
                <li key={entry.conversationId}>
                  <button className="w-full rounded bg-card p-3 text-start" type="button"
                    onClick={() => chat.current?.select(entry.conversationId)}>
                    <span>{entry.peer.label}</span>
                    {!entry.canSend && <span className="ms-2 text-sm text-muted-foreground">Read only</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {!terminal && selected !== null && (
        <>
          <button type="button" className="underline" onClick={() => chat.current?.select(null)}>Back to chats</button>
          {startCall && callPeer && (
            <div className="flex gap-4">
              <button type="button" className="underline" onClick={() => startCall(callPeer, "voice")}>Voice call</button>
              <button type="button" className="underline" onClick={() => startCall(callPeer, "video")}>Video call</button>
            </div>
          )}
          {visibleHistory && chat.current ? (
            <PrivateConversationView key={selected} history={visibleHistory} chat={chat.current}
              online={status === "connected"} sessionToken={sessionToken} username={username} onError={setNotice} />
          ) : !notice && <p>Loading history…</p>}
        </>
      )}
    </main>
  );
}

export function PrivateConversationView({ history, chat, online, sessionToken, username, onError }: {
  history: PrivateHistory; chat: Chat; online: boolean; sessionToken: string; username: string; onError: (message: string) => void;
}) {
  const conversationId = history.conversationId;
  const canSend = history.canSend && history.peer.state === "active";
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const deleting = useRef(false);
  const t = getDict("en");

  useEffect(() => {
    if (canSend && online && document.visibilityState !== "hidden") chat.markRead(conversationId, history.messages);
  }, [canSend, chat, conversationId, history.messages, online]);

  async function remove() {
    if (!deleteId || deleting.current || !chat.isSelected(conversationId)) return;
    deleting.current = true;
    try {
      await deleteChatMessage(sessionToken, username, deleteId, chat.signal);
      if (chat.isSelected(conversationId)) {
        setDeleteId(null);
        chat.refresh(conversationId);
      }
    } catch (error) {
      if (chat.isSelected(conversationId)) onError(error instanceof Error ? error.message : "Unable to delete the message.");
    } finally {
      deleting.current = false;
    }
  }

  return (
    <section className="space-y-3" aria-label={history.peer.label}>
      <h2 className="text-lg font-semibold">{history.peer.label}</h2>
      {!canSend && <p role="status">Read-only conversation</p>}
      <ul className="space-y-2">
        {history.messages.map((message) => (
          <li key={message.id}>
            <ConversationBubble m={message} locale="en" t={t} pushToast={onError} />
            {canSend && <button className="text-sm underline" type="button"
              onClick={() => setDeleteId(message.id)}>Delete for me</button>}
          </li>
        ))}
      </ul>
      {canSend && (
        <>
          <PrivateComposer conversationId={conversationId} chat={chat} online={online} sessionToken={sessionToken} onError={onError} />
          <ConfirmDialog open={deleteId !== null} title="Delete message?"
            message="This removes your copy of the message." confirmLabel="Delete for me" cancelLabel={t.cancel}
            onConfirm={() => void remove()} onCancel={() => setDeleteId(null)} />
        </>
      )}
    </section>
  );
}

function PrivateComposer({ conversationId, chat, online, sessionToken, onError }: {
  conversationId: string; chat: Chat; online: boolean; sessionToken: string; onError: (message: string) => void;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const requests = useRef<AbortController | null>(null);
  const sending = useRef(false);
  const retry = useRef<{
    id: string; kind: MsgKind; text: string; file?: File; imageId?: string; attachmentId?: string;
  } | null>(null);

  useEffect(() => {
    const abort = new AbortController();
    requests.current = abort;
    return () => abort.abort();
  }, []);

  async function send(kind: MsgKind, messageText: string, file?: File) {
    const signal = requests.current?.signal;
    const current = () => signal && !signal.aborted && chat.isSelected(conversationId);
    if (sending.current || !online || !current()) return false;
    const previous = retry.current;
    const action = previous && previous.kind === kind && previous.text === messageText && previous.file === file
      ? previous : { id: crypto.randomUUID(), kind, text: messageText, file };
    retry.current = action;
    sending.current = true;
    setBusy(true);
    onError("");
    try {
      const options = { accountConversation: true, signal };
      if (file && !action.imageId && !action.attachmentId) {
        if (kind === "image") {
          action.imageId = (await uploadChatImage(conversationId, file, sessionToken, options)).imageId;
        } else if (kind === "file" || kind === "video" || kind === "voice") {
          action.attachmentId = (await uploadChatAttachment(conversationId, kind, file, sessionToken, options)).attachmentId;
        }
      }
      if (!current()) return false;
      await chat.send(conversationId, {
        messageId: action.id, kind, text: messageText,
        ...(action.imageId ? { imageId: action.imageId } : {}),
        ...(action.attachmentId ? { attachmentId: action.attachmentId } : {}),
      });
      if (!current()) return false;
      retry.current = null;
      return true;
    } catch (error) {
      if (current()) onError(error instanceof Error ? error.message : "Message could not be sent.");
      return false;
    } finally {
      sending.current = false;
      if (current()) setBusy(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const draft = text.trim();
    if (draft && await send("text", draft)) setText("");
  }

  return (
    <div className="space-y-2">
      <form onSubmit={(event) => void submit(event)} className="flex gap-2">
        <textarea className="min-w-0 flex-1 rounded border bg-background p-2" aria-label="Message"
          value={text} maxLength={10000} disabled={!online || busy} onChange={(event) => setText(event.target.value)} />
        <button className="rounded bg-primary px-3 text-primary-foreground disabled:opacity-50"
          type="submit" disabled={!online || busy || !text.trim()}>Send</button>
      </form>
      <div className="flex flex-wrap gap-3 text-sm">
        {([["image", "Image", "image/*"], ["file", "File", undefined], ["video", "Video", "video/*"]] as const)
          .map(([kind, label, accept]) => (
            <label key={kind} className="underline">
              {label}
              <input type="file" className="sr-only" aria-label={label} accept={accept} disabled={!online || busy}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (file) void send(kind, "", file);
                }} />
            </label>
          ))}
        <button type="button" className="underline" disabled={!online || busy} onClick={() => setVoiceOpen(true)}>Voice message</button>
      </div>
      <Sheet open={voiceOpen} title="Voice message" onClose={() => { if (!busy) setVoiceOpen(false); }}>
        <VoiceRecorder disabled={!online || busy} onSend={async (file) => {
          const sent = await send("voice", "", file);
          if (sent) setVoiceOpen(false);
          return sent;
        }} />
      </Sheet>
    </div>
  );
}
