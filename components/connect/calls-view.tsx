"use client";

import { useMemo, useState } from "react";
import { useConnect } from "@/contexts/connect-context";
import { Avatar, Header, EmptyState, cx } from "./ui";
import { Sheet } from "./feedback";
import {
  IconPhone,
  IconPhoneIncoming,
  IconPhoneOutgoing,
  IconPhoneMissed,
  IconVideo,
  IconContacts,
} from "./icons";
import { formatDuration, timeAgo, type CallLog, type Contact } from "@/lib/connect/data";

export function CallsView({
  onCall,
}: {
  onCall: (username: string, name: string, color: number, kind: "voice" | "video") => void;
}) {
  const { t, calls, contacts } = useConnect();
  const [pickOpen, setPickOpen] = useState(false);

  return (
    <div className="pb-24">
      <Header title={t.callsTitle} />

      {calls.length === 0 ? (
        <EmptyState icon={<IconPhone className="h-7 w-7" />} title={t.noCalls} />
      ) : (
        <ul className="px-2 pt-2">
          {calls.map((c, i) => (
            <li key={c.id} style={{ animationDelay: `${Math.min(i, 8) * 30}ms` }} className="pc-fade-up">
              <CallRow log={c} t={t} onCall={onCall} />
            </li>
          ))}
        </ul>
      )}

      {/* new call FAB */}
      <button
        onClick={() => setPickOpen(true)}
        className="pc-press fixed bottom-24 z-20 flex h-14 w-14 items-center justify-center rounded-full bg-turquoise text-turquoise-foreground shadow-lg"
        style={{ insetInlineEnd: "1.25rem" }}
        aria-label={t.call}
      >
        <IconPhone className="h-6 w-6" />
      </button>

      <Sheet open={pickOpen} onClose={() => setPickOpen(false)} title={t.call}>
        <CallPicker
          contacts={contacts}
          onCall={(c, kind) => {
            onCall(c.username, c.name, c.color, kind);
            setPickOpen(false);
          }}
          t={t}
        />
      </Sheet>
    </div>
  );
}

function CallRow({
  log,
  t,
  onCall,
}: {
  log: CallLog;
  t: ReturnType<typeof useConnect>["t"];
  onCall: (username: string, name: string, color: number, kind: "voice" | "video") => void;
}) {
  const dirIcon =
    log.dir === "missed" ? (
      <IconPhoneMissed className="h-4 w-4 text-destructive" />
    ) : log.dir === "incoming" ? (
      <IconPhoneIncoming className="h-4 w-4 text-success" />
    ) : (
      <IconPhoneOutgoing className="h-4 w-4 text-turquoise" />
    );

  const dirLabel = log.dir === "missed" ? t.missed : log.dir === "incoming" ? t.incoming : t.outgoing;

  return (
    <div className="flex items-center gap-3 rounded-2xl px-3 py-3 hover:bg-card/50">
      <Avatar name={log.name} color={log.color} size={48} />
      <div className="min-w-0 flex-1">
        <p className={cx("truncate font-semibold", log.dir === "missed" ? "text-destructive" : "text-foreground")}>
          {log.name}
        </p>
        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
          {dirIcon}
          <span>{dirLabel}</span>
          {log.durationSec > 0 && <span>· {formatDuration(log.durationSec)}</span>}
          <span>· {timeAgo(log.at)}</span>
        </div>
      </div>
      <button
        onClick={() => onCall(log.username, log.name, log.color, log.kind)}
        className="pc-press flex h-9 w-9 items-center justify-center rounded-full bg-turquoise/15 text-turquoise"
        aria-label={log.kind === "video" ? t.videoCall : t.voiceCall}
      >
        {log.kind === "video" ? <IconVideo className="h-5 w-5" /> : <IconPhone className="h-5 w-5" />}
      </button>
    </div>
  );
}

function CallPicker({
  contacts,
  onCall,
  t,
}: {
  contacts: Contact[];
  onCall: (c: Contact, kind: "voice" | "video") => void;
  t: ReturnType<typeof useConnect>["t"];
}) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? contacts.filter((c) => c.name.toLowerCase().includes(q) || c.username.toLowerCase().includes(q))
      : contacts;
    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  }, [contacts, query]);

  if (contacts.length === 0) {
    return (
      <div className="py-6">
        <EmptyState icon={<IconContacts className="h-7 w-7" />} title={t.noContacts} subtitle={t.noContactsSub} />
      </div>
    );
  }

  return (
    <div className="pb-2">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t.search}
        className="mb-3 w-full rounded-xl bg-input/70 border border-border px-4 py-2.5 text-sm outline-none placeholder:text-muted-foreground focus:border-primary"
      />
      <ul className="flex max-h-[52vh] flex-col gap-1 overflow-y-auto pc-no-scrollbar">
        {filtered.map((c) => (
          <li key={c.id} className="flex items-center gap-3 rounded-2xl px-2 py-2">
            <Avatar name={c.name} color={c.color} online={c.online} size={42} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{c.name}</p>
              <p className="truncate text-xs text-turquoise">@{c.username}</p>
            </div>
            <button
              onClick={() => onCall(c, "voice")}
              className="pc-press flex h-9 w-9 items-center justify-center rounded-full bg-turquoise/15 text-turquoise"
              aria-label={t.voiceCall}
            >
              <IconPhone className="h-5 w-5" />
            </button>
            <button
              onClick={() => onCall(c, "video")}
              className="pc-press flex h-9 w-9 items-center justify-center rounded-full bg-primary/15 text-primary"
              aria-label={t.videoCall}
            >
              <IconVideo className="h-5 w-5" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
