"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useConnect } from "@/contexts/connect-context";
import { Avatar, Header, IconButton, Button, EmptyState, TextInput, cx } from "./ui";
import { Sheet } from "./feedback";
import { IconContacts, IconSearch, IconPlus, IconCheck, IconClose, IconChat, IconPhone, IconVideo } from "./icons";
import { normalizeUsername, type Contact } from "@/lib/connect/data";

export function ContactsView({
  onMessage,
  onCall,
}: {
  onMessage: (username: string) => void;
  onCall: (username: string, name: string, color: number, kind: "voice" | "video") => void;
}) {
  const { t, contacts, requests, acceptRequest, declineRequest, pushToast } = useConnect();
  const [query, setQuery] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [selected, setSelected] = useState<Contact | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? contacts.filter((c) => c.name.toLowerCase().includes(q) || c.username.toLowerCase().includes(q))
      : contacts;
    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  }, [contacts, query]);

  const sections = useMemo(() => {
    const map = new Map<string, Contact[]>();
    for (const c of filtered) {
      const letter = (c.name[0] || "#").toUpperCase();
      const key = /[A-Z]/.test(letter) ? letter : "#";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(c);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  return (
    <div className="pb-24">
      <Header
        title={t.contactsTitle}
        right={
          <IconButton
            className="h-9 w-9 bg-primary text-primary-foreground"
            onClick={() => setAddOpen(true)}
            aria-label={t.addContact}
          >
            <IconPlus className="h-5 w-5" />
          </IconButton>
        }
      />

      <div className="px-4 pt-3">
        <div className="pc-glass flex items-center gap-2 rounded-xl px-3 py-2.5">
          <IconSearch className="h-4 w-4 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.search}
            className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
        </div>
      </div>

      {/* requests */}
      {requests.length > 0 && (
        <div className="mt-4 px-4">
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-gold">
            {t.requests} · {requests.length}
          </h2>
          <ul className="flex flex-col gap-2">
            {requests.map((r) => (
              <li key={r.id} className="pc-glass flex items-center gap-3 rounded-2xl p-3 pc-fade-up">
                <Avatar name={r.name} color={r.color} size={44} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{r.name}</p>
                  <p className="truncate text-xs text-turquoise">@{r.username}</p>
                </div>
                <IconButton
                  className="h-9 w-9 bg-success/15 text-success"
                  onClick={() => {
                    acceptRequest(r.id);
                    pushToast(t.contactAdded, "success");
                  }}
                  aria-label={t.accept}
                >
                  <IconCheck className="h-5 w-5" />
                </IconButton>
                <IconButton
                  className="h-9 w-9 bg-destructive/15 text-destructive"
                  onClick={() => declineRequest(r.id)}
                  aria-label={t.decline}
                >
                  <IconClose className="h-5 w-5" />
                </IconButton>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* list */}
      {filtered.length === 0 ? (
        <EmptyState icon={<IconContacts className="h-7 w-7" />} title={t.noContacts} subtitle={t.noContactsSub} />
      ) : (
        <div className="mt-3">
          {sections.map(([letter, items]) => (
            <div key={letter}>
              <div className="sticky top-[57px] z-[5] bg-background/80 px-5 py-1 text-xs font-bold text-primary backdrop-blur">
                {letter}
              </div>
              <ul className="px-2">
                {items.map((c) => (
                  <li key={c.id}>
                    <button
                      onClick={() => setSelected(c)}
                      className="pc-press flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-start hover:bg-card/50"
                    >
                      <Avatar name={c.name} color={c.color} online={c.online} size={46} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-foreground">{c.name}</p>
                        <p className={cx("truncate text-xs", c.online ? "text-success" : "text-muted-foreground")}>
                          {c.online ? t.online : `@${c.username}`}
                        </p>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {/* add contact sheet */}
      <AddContactSheet open={addOpen} onClose={() => setAddOpen(false)} />

      {/* contact actions sheet */}
      <Sheet open={!!selected} onClose={() => setSelected(null)} title={selected?.name}>
        {selected && (
          <div className="pb-2">
            <div className="mb-5 flex flex-col items-center text-center">
              <Avatar name={selected.name} color={selected.color} online={selected.online} size={88} />
              <p className="mt-3 text-lg font-bold">{selected.name}</p>
              <p className="text-sm text-turquoise">@{selected.username}</p>
              <span className={cx("mt-1 text-xs", selected.online ? "text-success" : "text-muted-foreground")}>
                {selected.online ? t.online : t.offline}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <ActionBtn
                label={t.message}
                onClick={() => {
                  onMessage(selected.username);
                  setSelected(null);
                }}
                icon={<IconChat className="h-6 w-6" />}
                tone="primary"
              />
              <ActionBtn
                label={t.voiceCall}
                onClick={() => {
                  onCall(selected.username, selected.name, selected.color, "voice");
                  setSelected(null);
                }}
                icon={<IconPhone className="h-6 w-6" />}
                tone="turquoise"
              />
              <ActionBtn
                label={t.videoCall}
                onClick={() => {
                  onCall(selected.username, selected.name, selected.color, "video");
                  setSelected(null);
                }}
                icon={<IconVideo className="h-6 w-6" />}
                tone="gold"
              />
            </div>
          </div>
        )}
      </Sheet>
    </div>
  );
}

function ActionBtn({
  label,
  onClick,
  icon,
  tone,
}: {
  label: string;
  onClick: () => void;
  icon: ReactNode;
  tone: "primary" | "turquoise" | "gold";
}) {
  const map = {
    primary: "bg-primary/15 text-primary",
    turquoise: "bg-turquoise/15 text-turquoise",
    gold: "bg-gold/15 text-gold",
  };
  return (
    <button onClick={onClick} className={cx("pc-press flex flex-col items-center gap-2 rounded-2xl py-4", map[tone])}>
      {icon}
      <span className="text-xs font-semibold">{label}</span>
    </button>
  );
}

function AddContactSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, addContact, pushToast } = useConnect();
  const [value, setValue] = useState("");

  const submit = () => {
    const res = addContact(value);
    if (res === "added") {
      pushToast(t.contactAdded, "success");
      setValue("");
      onClose();
    } else if (res === "exists") {
      pushToast(t.alreadyAdded, "error");
    } else if (res === "self") {
      pushToast(t.cantAddSelf, "error");
    } else {
      pushToast(t.usernamePh, "error");
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title={t.addByUsername}>
      <div className="pb-2">
        <div className="flex items-center gap-2 rounded-2xl bg-input/70 border border-border px-3">
          <span className="text-lg font-bold text-turquoise">@</span>
          <input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={t.usernamePh}
            className="w-full bg-transparent py-3.5 text-sm text-foreground outline-none placeholder:text-muted-foreground"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229) submit();
            }}
          />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{t.digitalIdHint}</p>
        <Button variant="primary" className="mt-5 w-full py-3.5" onClick={submit} disabled={!normalizeUsername(value)}>
          <IconPlus className="h-5 w-5" />
          {t.add}
        </Button>
      </div>
    </Sheet>
  );
}
