"use client";

import { joinConversation } from "@/lib/api-client";
import { useEffect, useRef, useState } from "react";
import { useConnect } from "@/contexts/connect-context";
import { Avatar, Button, IconButton, TextInput, cx } from "./ui";
import { Sheet } from "./feedback";
import {
  IconBack,
  IconPhone,
  IconVideo,
  IconSend,
  IconPlus,
  IconImage,
  IconFile,
  IconCheck,
  IconDoubleCheck,
  IconShield,
  IconDownload,
} from "./icons";
import {
  formatTime,
  dayLabel,
  type Message,
  type Conversation,
} from "@/lib/connect/data";

export function ConversationView({
  username,
  onBack,
  onCall,
}: {
  username: string;
  onBack: () => void;
  onCall: (username: string, name: string, color: number, kind: "voice" | "video") => void;
}) {
  const { t, getChat, contacts, sendMessage, markChatRead, lang } = useConnect();
  const conv = getChat(username);
  const contact = contacts.find((c) => c.username === username);
  const [text, setText] = useState("");
  const [attachOpen, setAttachOpen] = useState(false);
  const [typing, setTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    joinConversation(conv?.id ?? username);
    markChatRead(username);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username, conv?.messages.length]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [conv?.messages.length]);

  if (!conv) return null;

  const submit = () => {
    const v = text.trim();
    if (!v) return;
    sendMessage(username, "text", v);
    setText("");
  };

  const onImage = (file?: File) => {
    if (!file) return;
    sendMessage(username, "image", "", file.name);
    setAttachOpen(false);
  };
  const onFile = (file?: File) => {
    if (!file) return;
    sendMessage(username, "file", "", file.name);
    setAttachOpen(false);
  };

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-background pc-fade-in">
      {/* header */}
      <header className="pc-glass-strong sticky top-0 z-10 pc-safe-top">
        <div className="flex items-center gap-2 px-2 py-2.5">
          <IconButton className="h-9 w-9 text-foreground rtl:rotate-180" onClick={onBack} aria-label={t.back}>
            <IconBack className="h-5 w-5" />
          </IconButton>
          <Avatar name={conv.name} color={conv.color} online={contact?.online} size={40} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold leading-tight">{conv.name}</p>
            <p className={cx("truncate text-xs", typing ? "text-gold animate-pulse" : contact?.online ? "text-success" : "text-muted-foreground")}>
              {typing ? "typing..." : contact?.online ? t.online : `@${conv.username}`}
            </p>
          </div>
          <IconButton
            className="h-9 w-9 text-turquoise"
            onClick={() =>
  onCall(
    conv.username ?? username,
    conv.name ?? conv.username ?? username,
    conv.color,
    "voice"
  )
}
            aria-label={t.voiceCall}
          >
            <IconPhone className="h-5 w-5" />
          </IconButton>
          <IconButton
            className="h-9 w-9 text-turquoise"
          onClick={() => onCall(conv.username ?? username, conv.name ?? conv.username ?? username, conv.color, "video")}
            aria-label={t.videoCall}
          >
            <IconVideo className="h-5 w-5" />
          </IconButton>
        </div>
      </header>

      {/* messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto pc-no-scrollbar px-3 py-4">
        <div className="mx-auto mb-4 flex max-w-[80%] items-center justify-center gap-1.5 rounded-full bg-turquoise/10 px-3 py-1.5 text-center text-[11px] text-turquoise">
          <IconShield className="h-3.5 w-3.5 shrink-0" />
          <span>{t.encrypted}</span>
        </div>
        <MessageList messages={conv.messages} locale={lang} t={t} />
      </div>

      {/* composer */}
      <div className="pc-glass-strong pc-safe-bottom border-t border-border/60 px-2 py-2">
        <div className="flex items-end gap-2">
          <IconButton
            className="h-11 w-11 shrink-0 bg-primary/15 text-primary"
            onClick={() => setAttachOpen(true)}
            aria-label={t.attach}
          >
            <IconPlus className="h-5 w-5" />
          </IconButton>
          <div className="flex flex-1 items-center rounded-2xl bg-input/70 border border-border px-3">
            <input
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setTyping(true);
                if (typingTimeoutRef.current !== null) {
  clearTimeout(typingTimeoutRef.current);
}
                typingTimeoutRef.current = setTimeout(() => setTyping(false), 1200);
              }}
              placeholder={t.typeMessage}
              className="w-full bg-transparent py-3 text-sm text-foreground outline-none placeholder:text-muted-foreground"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229) {
                  e.preventDefault();
                  setTyping(false);
                  if (typingTimeoutRef.current !== null) {
  clearTimeout(typingTimeoutRef.current);
}
                  submit();
                }
              }}
            />
          </div>
          {text.trim() ? (
            <IconButton
              className="h-11 w-11 shrink-0 bg-primary text-primary-foreground"
              onClick={submit}
              aria-label={t.send}
            >
              <IconSend className="h-5 w-5 rtl:rotate-180" />
            </IconButton>
          ) : null}
        </div>
      </div>

      <input ref={imgRef} type="file" accept="image/*" className="hidden" onChange={(e) => onImage(e.target.files?.[0])} />
      <input ref={fileRef} type="file" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />

      {/* attach sheet */}
      <Sheet open={attachOpen} onClose={() => setAttachOpen(false)} title={t.attach}>
        <div className="grid grid-cols-2 gap-3 pb-2">
          <button
            onClick={() => imgRef.current?.click()}
            className="pc-press flex flex-col items-center gap-2 rounded-2xl bg-turquoise/10 py-6 text-turquoise"
          >
            <IconImage className="h-7 w-7" />
            <span className="text-sm font-semibold">{t.attachImage}</span>
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            className="pc-press flex flex-col items-center gap-2 rounded-2xl bg-primary/10 py-6 text-primary"
          >
            <IconFile className="h-7 w-7" />
            <span className="text-sm font-semibold">{t.attachFile}</span>
          </button>
        </div>
      </Sheet>

      {/* in-chat pay */}

    </div>
  );
}

function MessageList({
  messages,
  locale,
  t,
}: {
  messages: Message[];
  locale: string;
  t: ReturnType<typeof useConnect>["t"];
}) {
  const groups: { day: string; items: Message[] }[] = [];
  for (const m of messages) {
    const day = dayLabel(m.at, locale);
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.items.push(m);
    else groups.push({ day, items: [m] });
  }

  return (
    <div className="flex flex-col gap-1.5">
      {groups.map((g, gi) => (
        <div key={gi} className="flex flex-col gap-1.5">
          <div className="my-2 flex justify-center">
            <span className="rounded-full bg-card/70 px-3 py-1 text-[11px] text-muted-foreground">
              {g.day === "Today" ? t.today : g.day === "Yesterday" ? t.yesterday : g.day}
            </span>
          </div>
          {g.items.map((m) => (
            <Bubble key={m.id} m={m} locale={locale} t={t} />
          ))}
        </div>
      ))}
    </div>
  );
}

function Bubble({
  m,
  locale,
  t,
}: {
  m: Message;
  locale: string;
  t: ReturnType<typeof useConnect>["t"];
}) {
  const mine = m.fromMe;

  if (m.kind === "image") {
    return (
      <div className={cx("flex pc-fade-up", mine ? "justify-end" : "justify-start")}>
        <div className={cx("max-w-[70%] overflow-hidden rounded-2xl p-1", mine ? "bg-primary/20" : "bg-card")}>
          <div className="flex aspect-[4/3] w-52 items-center justify-center rounded-xl bg-muted/40 text-muted-foreground">
            <IconImage className="h-9 w-9" />
          </div>
          <div className="flex items-center justify-between px-2 py-1">
            <span className="text-[11px] text-muted-foreground pc-clamp-1">{m.fileName || t.photo}</span>
            <TimeInline m={m} locale={locale} mine={mine} />
          </div>
        </div>
      </div>
    );
  }

  if (m.kind === "file") {
    return (
      <div className={cx("flex pc-fade-up", mine ? "justify-end" : "justify-start")}>
        <div className={cx("flex max-w-[78%] items-center gap-3 rounded-2xl p-3", mine ? "bg-primary/20" : "bg-card")}>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-turquoise/20 text-turquoise">
            <IconFile className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">{m.fileName || t.file}</p>
            <TimeInline m={m} locale={locale} mine={mine} />
          </div>
          <button className="pc-press text-muted-foreground" aria-label="Download">
            <IconDownload className="h-5 w-5" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={cx("flex pc-fade-up", mine ? "justify-end" : "justify-start")}>
      <div
        className={cx(
          "max-w-[78%] rounded-2xl px-3.5 py-2",
          mine ? "bg-primary text-primary-foreground rounded-br-md" : "bg-card text-foreground rounded-bl-md",
        )}
      >
        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{m.text}</p>
        <TimeRow m={m} locale={locale} mine={mine} />
      </div>
    </div>
  );
}

function TimeRow({ m, locale, mine }: { m: Message; locale: string; mine: boolean }) {
  return (
    <div className={cx("mt-1 flex items-center gap-1", mine ? "justify-end" : "justify-start")}>
      <span className={cx("text-[10px]", mine ? "text-primary-foreground/70" : "text-muted-foreground")}>
        {formatTime(m.at, locale)}
      </span>
      {mine && <StatusTick status={m.status} />}
    </div>
  );
}
function TimeInline({ m, locale, mine }: { m: Message; locale: string; mine: boolean }) {
  return (
    <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
      {formatTime(m.at, locale)}
      {mine && <StatusTick status={m.status} />}
    </span>
  );
}

function StatusTick({ status }: { status: Message["status"] }) {
  if (status === "sent") return <IconCheck className="h-3.5 w-3.5 text-primary-foreground/70" />;
  return (
    <IconDoubleCheck className={cx("h-3.5 w-3.5", status === "read" ? "text-turquoise" : "text-primary-foreground/70")} />
  );
}
