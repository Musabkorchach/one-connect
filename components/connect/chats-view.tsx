"use client";

import { useMemo, useState } from "react";
import { useConnect } from "@/contexts/connect-context";
import { Avatar, Header, IconButton, EmptyState, cx } from "./ui";
import { IconChat, IconSearch, IconCheck, IconDoubleCheck, IconImage, IconFile, IconClose } from "./icons";
import { timeAgo, type Conversation } from "@/lib/connect/data";

export function ChatsView({ onOpen }: { onOpen: (username: string) => void }) {
  const { t, chats, lang } = useConnect();
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return chats;
    return chats.filter(
      (c) => c.name.toLowerCase().includes(q) || c.username.toLowerCase().includes(q),
    );
  }, [chats, query]);

  return (
    <div className="pb-24">
      <Header
        title={t.chatsTitle}
        right={
          <IconButton
            className="h-9 w-9 text-foreground"
            onClick={() => setSearching((s) => !s)}
            aria-label={t.search}
          >
            {searching ? <IconClose className="h-5 w-5" /> : <IconSearch className="h-5 w-5" />}
          </IconButton>
        }
      />
      {searching && (
        <div className="px-4 pt-3 pc-fade-in">
          <div className="pc-glass flex items-center gap-2 rounded-xl px-3 py-2.5">
            <IconSearch className="h-4 w-4 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t.search}
              className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <EmptyState
          icon={<IconChat className="h-7 w-7" />}
          title={t.noChats}
          subtitle={t.noChatsSub}
        />
      ) : (
        <ul className="px-2 pt-2">
          {filtered.map((c, i) => (
            <li key={c.id} style={{ animationDelay: `${Math.min(i, 8) * 30}ms` }} className="pc-fade-up">
              <ChatRow conv={c} locale={lang} onOpen={() => onOpen(c.username)} t={t} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ChatRow({
  conv,
  locale,
  onOpen,
  t,
}: {
  conv: Conversation;
  locale: string;
  onOpen: () => void;
  t: ReturnType<typeof useConnect>["t"];
}) {
  const last = conv.messages[conv.messages.length - 1];
  const preview = (() => {
    if (!last) return "";
    if (last.kind === "image") return t.photo;
    if (last.kind === "file") return last.fileName || t.file;
    return last.text;
  })();

  return (
    <button
      onClick={onOpen}
      className="pc-press flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-start hover:bg-card/50"
    >
      <Avatar name={conv.name} color={conv.color} size={52} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-semibold text-foreground">{conv.name}</span>
          <span className="ms-auto shrink-0 text-[11px] text-muted-foreground">
            {last ? timeAgo(last.at) : ""}
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-1.5">
          {last?.fromMe && (
            <span className={cx("shrink-0", last.status === "read" ? "text-turquoise" : "text-muted-foreground")}>
              {last.status === "sent" ? (
                <IconCheck className="h-3.5 w-3.5" />
              ) : (
                <IconDoubleCheck className="h-3.5 w-3.5" />
              )}
            </span>
          )}
          {last?.kind === "image" && <IconImage className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
          {last?.kind === "file" && <IconFile className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
          <span className="truncate text-sm text-muted-foreground pc-clamp-1">{preview}</span>
          {conv.unread > 0 && (
            <span className="ms-auto flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-primary-foreground">
              {conv.unread}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
