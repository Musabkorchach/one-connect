"use client";

import { useEffect, useState } from "react";
import { useConnect } from "@/contexts/connect-context";
import { getFilteredGroupHistory, type GroupHistoryFilter, type GroupMessageRecord } from "@/lib/api-client";
import { getGroupCopy } from "@/lib/connect/i18n";
import { Sheet } from "./feedback";
import { GroupMediaContent } from "./group-media";

const sections: GroupHistoryFilter[] = ["search", "media", "files", "links"];

export function GroupHistoryBrowser({ groupId, token, onClose }: {
  groupId: string; token: string; onClose: () => void;
}) {
  const { lang } = useConnect();
  const copy = getGroupCopy(lang);
  const [section, setSection] = useState<GroupHistoryFilter>("search");
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const [before, setBefore] = useState<string | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [messages, setMessages] = useState<GroupMessageRecord[]>([]);
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");

  useEffect(() => {
    if (section === "search" && !query) return;
    const scope = new AbortController();
    setState("loading");
    void getFilteredGroupHistory(token, groupId, section, query, before, scope.signal).then(page => {
      if (scope.signal.aborted) return;
      const results = page.messages.slice().reverse();
      setMessages(previous => before ? [...previous, ...results] : results);
      setNext(page.nextCursor);
      setState("done");
    }, () => {
      if (scope.signal.aborted) return;
      setState("error");
    });
    return () => scope.abort();
  }, [token, groupId, section, query, before]);

  function reset() {
    setBefore(null);
    setNext(null);
    setMessages([]);
    setState("idle");
  }

  return (
    <Sheet open title={copy.history} onClose={onClose}>
      <div dir={lang === "ar" ? "rtl" : "ltr"} className="space-y-3">
        <nav aria-label={copy.history} className="flex flex-wrap gap-2">
          {sections.map(item => <button key={item} type="button" aria-pressed={item === section}
            className="min-h-11 rounded-xl border px-3 aria-pressed:bg-primary aria-pressed:text-primary-foreground"
            onClick={() => {
              if (item !== section) { reset(); setSection(item); }
            }}>{copy[item]}</button>)}
        </nav>
        {section === "search" && <form className="flex gap-2" onSubmit={event => {
          event.preventDefault();
          const value = draft.trim();
          if (value && value !== query) { reset(); setQuery(value); }
        }}>
          <input dir="auto" aria-label={copy.search} className="min-w-0 flex-1 rounded-xl border bg-background p-2"
            value={draft} onChange={event => setDraft(event.target.value)} maxLength={120} required />
          <button className="min-h-11 rounded-xl border px-3">{copy.search}</button>
        </form>}
        {state === "loading" && <p role="status">{copy.loading}</p>}
        {state === "error" && <p role="alert">{copy.failure}</p>}
        {state === "done" && messages.length === 0 && <p role="status">{copy.empty}</p>}
        <ul className="space-y-2">
          {messages.map(message => (
            <li key={message.senderUsername + ":" + message.id} className="min-w-0 rounded-xl border p-3">
              <bdi className="text-sm">@{message.senderUsername}</bdi>
              {section === "links" ? [...new Set(message.text.match(/https?:\/\/[^\s<>]+/gi) ?? [])].map(link => (
                <a key={link} href={link} target="_blank" rel="noopener noreferrer" className="block break-all underline" dir="ltr">{link}</a>
              )) : <>
                {message.text && <p dir="auto" className="whitespace-pre-wrap break-words">{message.text}</p>}
                {message.mediaId && <GroupMediaContent message={message} arabic={lang === "ar"} />}
              </>}
            </li>
          ))}
        </ul>
        {next && <button type="button" className="min-h-11 rounded-xl border px-3" disabled={state === "loading"}
          onClick={() => setBefore(next)}>{copy.loadMore}</button>}
      </div>
    </Sheet>
  );
}
