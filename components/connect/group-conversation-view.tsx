"use client";

import { useEffect, useRef, useState } from "react";
import { usePiAuth } from "@/contexts/pi-auth-context";
import { useConnect } from "@/contexts/connect-context";
import {
  getGroupMessages,
  markGroupMessagesRead,
  onGroupEvent,
  sendGroupMessage,
  type GroupMessageRecord,
  type GroupRecord,
  uploadGroupMedia,
  sendGroupMediaMessage,
  type GroupMediaKind,
  type GroupMediaRecord,
} from "@/lib/api-client";
import { IconBack, IconSend } from "./icons";
import { GroupMedia } from "./group-media";
import { GroupAttachments } from "./group-attachments";

function messageKey(message: GroupMessageRecord) {
  return `${message.senderUsername}:${message.id}`;
}

function mergeMessages(
  current: GroupMessageRecord[],
  incoming: GroupMessageRecord[],
) {
  const merged = new Map(
    current.map((message) => [messageKey(message), message]),
  );

  for (const message of incoming) {
    const key = messageKey(message);
    const previous = merged.get(key);

    merged.set(key, {
      ...message,
      readBy: [...new Set([
        ...(previous?.readBy || []),
        ...message.readBy,
      ])],
    });
  }

  return [...merged.values()].sort(
    (a, b) => a.at - b.at || messageKey(a).localeCompare(messageKey(b)),
  );
}

export function GroupConversationView({
  group,
  onBack,
}: {
  group: GroupRecord;
  onBack: () => void;
}) {
  const { sessionToken, piUsername, isAuthenticated } = usePiAuth();

  if (!isAuthenticated || !sessionToken || !piUsername) return null;

  return (
    <GroupConversation
      key={`${sessionToken}:${group.id}`}
      group={group}
      token={sessionToken}
      me={piUsername.replace(/^@+/, "").toLowerCase()}
      onBack={onBack}
    />
  );
}

function GroupConversation({
  group,
  token,
  me,
  onBack,
}: {
  group: GroupRecord;
  token: string;
  me: string;
  onBack: () => void;
}) {
  const { lang } = useConnect();
  const arabic = lang === "ar";

  const [messages, setMessages] = useState<GroupMessageRecord[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const aliveRef = useRef(false);
  const loadingOlderRef = useRef(false);
  const sendingRef = useRef(false);
  const mediaRetryRef = useRef<{
    id: string;
    file: File;
    kind: GroupMediaKind;
    text: string;
    media: GroupMediaRecord | null;
  } | null>(null);
  const retryRef = useRef<{ id: string; text: string } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const followLatestRef = useRef(true);
  const historyLoadedRef = useRef(false);
  const membersKey = group.members.join(",");

  useEffect(() => {
    let disposed = false;
    const controller = new AbortController();
    aliveRef.current = true;
    const members = membersKey.split(",");

    const validMessage = (message: GroupMessageRecord) =>
      message &&
      message.groupId === group.id &&
      typeof message.id === "string" &&
      typeof message.senderUsername === "string" &&
      members.includes(message.senderUsername) &&
      ["text", "image", "file", "video", "voice"].includes(message.kind) &&
      (
        message.kind === "text" ||
        (
          typeof message.mediaId === "string" &&
          /^[a-f0-9]{24}$/.test(message.mediaId) &&
          typeof message.fileName === "string" &&
          typeof message.mimeType === "string" &&
          typeof message.fileSize === "number" &&
          Number.isSafeInteger(message.fileSize) &&
          message.fileSize > 0 &&
          message.fileSize <= (
            message.kind === "image" || message.kind === "voice" ? 5 : 25
          ) * 1024 * 1024
        )
      ) &&
      typeof message.text === "string" &&
      Number.isFinite(message.at) &&
      Array.isArray(message.readBy) &&
      message.readBy.every((username) => typeof username === "string");

    const refresh = async () => {
      try {
        const page = await getGroupMessages(
          token,
          group.id,
          undefined,
          controller.signal,
        );
        if (disposed) return;

        setMessages((current) =>
          mergeMessages(current, page.messages.filter(validMessage)),
        );
        if (!historyLoadedRef.current) {
          setCursor(page.nextCursor);
          historyLoadedRef.current = true;
        }
        setError(null);
      } catch (error) {
        if (disposed) return;
        setError(error instanceof Error ? error.message : "Could not load messages");
      } finally {
        if (!disposed) setLoading(false);
      }
    };

    const unsubscribeMessage = onGroupEvent("group:message", (event) => {
      if (disposed || !event?.message || !validMessage(event.message)) return;
      setMessages((current) => mergeMessages(current, [event.message]));
    });

    const unsubscribeRead = onGroupEvent("group:read", (receipt) => {
      if (
        disposed ||
        receipt?.groupId !== group.id ||
        !members.includes(receipt.username) ||
        !Array.isArray(receipt.messageIds)
      ) return;

      const ids = new Set(receipt.messageIds);
      setMessages((current) =>
        current.map((message) =>
          ids.has(message.id)
            ? {
                ...message,
                readBy: [...new Set([...message.readBy, receipt.username])],
              }
            : message,
        ),
      );
    });

    const unsubscribeConnect = onGroupEvent("connect", () => {
      void refresh();
    });

    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", refresh);
    void refresh();

    return () => {
      disposed = true;
      aliveRef.current = false;
      controller.abort();
      unsubscribeMessage();
      unsubscribeRead();
      unsubscribeConnect();
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", refresh);
    };
    }, [token, group.id, membersKey]);

  useEffect(() => {
    if (followLatestRef.current) {
      bottomRef.current?.scrollIntoView({ block: "end" });
    }
  }, [messages]);

  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;

    let disposed = false;
    let busy = false;

    const markVisible = async () => {
      if (disposed || busy || document.visibilityState !== "visible") return;

      const viewport = root.getBoundingClientRect();
      const ids: string[] = [];

      root.querySelectorAll<HTMLElement>("[data-group-unread]").forEach((node) => {
        const bounds = node.getBoundingClientRect();
        const visibleHeight =
          Math.min(bounds.bottom, viewport.bottom, window.innerHeight) -
          Math.max(bounds.top, viewport.top, 0);

        if (visibleHeight >= Math.min(40, bounds.height / 2)) {
          const id = node.dataset.groupUnread;
          if (id) ids.push(id);
        }
      });

      if (!ids.length) return;
      busy = true;

      try {
        const receipt = await markGroupMessagesRead(
          token,
          group.id,
          [...new Set(ids)].slice(0, 100),
        );
        if (disposed) return;

        const readIds = new Set(receipt.messageIds);
        setMessages((current) =>
          current.map((message) =>
            readIds.has(message.id)
              ? { ...message, readBy: [...new Set([...message.readBy, me])] }
              : message,
          ),
        );
      } catch {
        // The next visibility check retries the unread messages.
      } finally {
        busy = false;
      }
    };

    const check = () => void markVisible();
    root.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check);
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    const timer = window.setInterval(check, 3000);
    check();

    return () => {
      disposed = true;
      window.clearInterval(timer);
      root.removeEventListener("scroll", check);
      window.removeEventListener("resize", check);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, [messages, token, group.id, me]);

  const loadOlder = async () => {
    if (!cursor || loadingOlderRef.current) return;
    loadingOlderRef.current = true;

    const root = scrollRef.current;
    const height = root?.scrollHeight || 0;
    const top = root?.scrollTop || 0;
    followLatestRef.current = false;

    try {
      const page = await getGroupMessages(token, group.id, cursor);
      if (!aliveRef.current) return;

      setMessages((current) => mergeMessages(current, page.messages));
      setCursor(page.nextCursor);
      setError(null);

      requestAnimationFrame(() => {
        if (aliveRef.current && root) {
          root.scrollTop = top + root.scrollHeight - height;
        }
      });
    } catch (error) {
      if (aliveRef.current) {
        setError(error instanceof Error ? error.message : "Could not load messages");
      }
    } finally {
      loadingOlderRef.current = false;
    }
  };

    const sendMedia = async (
    kind: GroupMediaKind,
    file: File,
  ): Promise<boolean> => {
    if (!aliveRef.current || sendingRef.current) return false;

    sendingRef.current = true;
    setSending(true);
    setError(null);

    try {
      let pending = mediaRetryRef.current;

      if (!pending || pending.file !== file || pending.kind !== kind) {
        pending = {
          id: crypto.randomUUID(),
          file,
          kind,
          text: text.trim(),
          media: null,
        };
        mediaRetryRef.current = pending;
      }

      if (!pending.media) {
        pending.media = await uploadGroupMedia(
          token,
          group.id,
          kind,
          file,
        );
      }

      if (!aliveRef.current) return false;

      const result = await sendGroupMediaMessage(
        token,
        group.id,
        pending.id,
        pending.media,
        pending.text,
      );

      if (!aliveRef.current) return false;

      followLatestRef.current = true;
      setMessages((current) => mergeMessages(current, [result.message]));

      const caption = pending.text;
      setText((current) => current.trim() === caption ? "" : current);
      mediaRetryRef.current = null;

      return true;
    } catch (error) {
      if (aliveRef.current) {
        setError(
          error instanceof Error
            ? error.message
            : arabic
              ? "تعذر إرسال الوسائط"
              : "Media could not be sent",
        );
      }

      return false;
    } finally {
      sendingRef.current = false;
      if (aliveRef.current) setSending(false);
    }
  };

  const send = async () => {
    const body = text.trim();
    if (!body || sendingRef.current) return;

    const pending =
      retryRef.current?.text === body
        ? retryRef.current
        : { id: crypto.randomUUID(), text: body };

    retryRef.current = pending;
    sendingRef.current = true;
    setSending(true);
    setError(null);

    try {
      const result = await sendGroupMessage(
        token,
        group.id,
        pending.id,
        pending.text,
      );
      if (!aliveRef.current) return;

      followLatestRef.current = true;
      setMessages((current) => mergeMessages(current, [result.message]));
      setText("");
      retryRef.current = null;
    } catch (error) {
      if (aliveRef.current) {
        setError(error instanceof Error ? error.message : "Message could not be sent");
      }
    } finally {
      sendingRef.current = false;
      if (aliveRef.current) setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 mx-auto flex max-w-md flex-col bg-background">
      <header className="flex items-center gap-3 border-b border-border px-4 py-3">
        <button
          type="button"
          onClick={onBack}
          aria-label={arabic ? "رجوع" : "Back"}
          className="pc-press rounded-full p-2"
        >
          <IconBack className="h-6 w-6" />
        </button>
        <div className="min-w-0">
          <h2 className="truncate font-bold">{group.name}</h2>
          <p className="text-xs text-muted-foreground">
            {group.members.length} {arabic ? "أعضاء" : "members"}
          </p>
        </div>
      </header>

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto px-4 py-3"
        onScroll={() => {
          const root = scrollRef.current;
          if (root) {
            followLatestRef.current =
              root.scrollHeight - root.scrollTop - root.clientHeight < 80;
          }
        }}
      >
        {loading && (
          <p className="py-4 text-center text-sm text-muted-foreground">
            {arabic ? "جارٍ التحميل…" : "Loading…"}
          </p>
        )}

        {cursor && (
          <button
            type="button"
            onClick={() => void loadOlder()}
            className="mb-4 w-full rounded-xl border border-border py-2 text-sm"
          >
            {arabic ? "تحميل الرسائل الأقدم" : "Load older messages"}
          </button>
        )}

        {messages.map((message) => {
          const own = message.senderUsername === me;

          return (
            <div
              key={messageKey(message)}
              data-group-unread={
                !own && !message.readBy.includes(me) ? message.id : undefined
              }
              className={`mb-3 flex ${own ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-2 ${
                  own ? "bg-primary text-primary-foreground" : "bg-card"
                }`}
              >
                <p className="mb-1 text-xs font-semibold" dir="ltr">
                  @{message.senderUsername}
                </p>
                {message.kind !== "text" && (
                  <GroupMedia message={message} />
                )}

                {message.text && (
                  <p className="whitespace-pre-wrap break-words text-sm">
                    {message.text}
                  </p>
                )}
                <p className="mt-1 text-end text-[10px] opacity-70">
                  {new Date(message.at).toLocaleTimeString(lang, {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {error && (
        <p role="alert" className="px-4 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

            <div className="flex items-end gap-2 border-t border-border p-3 pc-safe-bottom">
        <GroupAttachments
          disabled={sending}
          onSend={sendMedia}
        />

        <form
          className="flex min-w-0 flex-1 items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
        >
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            maxLength={2000}
            disabled={sending}
            rows={2}
            aria-label={arabic ? "رسالة" : "Message"}
            placeholder={arabic ? "اكتب رسالة…" : "Write a message…"}
            className="min-w-0 flex-1 resize-none rounded-xl border border-border bg-input/70 px-3 py-2 text-sm outline-none focus:border-primary"
          />

          <button
            type="submit"
            disabled={sending || !text.trim()}
            aria-label={arabic ? "إرسال" : "Send"}
            className="pc-press rounded-full bg-primary p-3 text-primary-foreground disabled:opacity-50"
          >
            <IconSend className="h-5 w-5" />
          </button>
        </form>
      </div>
    </div>
  );
}