"use client";

import { useRef, useState } from "react";
import { useConnect } from "@/contexts/connect-context";
import { useGroups } from "@/contexts/group-context";
import { Sheet } from "./feedback";

export function CreateGroupSheet({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (groupId: string) => void;
}) {
  const { contacts, lang, t } = useConnect();
  const { createGroup } = useGroups();
  const arabic = lang === "ar";

  const [name, setName] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busyRef = useRef(false);

  const people = [...new Map(
    contacts.map((contact) => [contact.username, contact]),
  ).values()].sort((a, b) => a.name.localeCompare(b.name));

  const toggle = (username: string) => {
    if (busyRef.current) return;

    setSelected((current) =>
      current.includes(username)
        ? current.filter((member) => member !== username)
        : current.length < 49
          ? [...current, username]
          : current,
    );
  };

  const submit = async () => {
    if (busyRef.current || !name.trim() || selected.length < 2) return;

    busyRef.current = true;
    setBusy(true);
    setError(null);

    try {
      const group = await createGroup(name.trim(), selected);
      onCreated(group.id);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : arabic
            ? "تعذر إنشاء المجموعة"
            : "Group could not be created",
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  return (
    <Sheet
      open
      onClose={() => {
        if (!busyRef.current) onClose();
      }}
      title={arabic ? "إنشاء مجموعة" : "Create group"}
    >
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <label className="block space-y-2">
          <span className="text-sm font-semibold">
            {arabic ? "اسم المجموعة" : "Group name"}
          </span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={80}
            disabled={busy}
            required
            className="w-full rounded-xl border border-border bg-input/70 px-4 py-3 text-sm outline-none focus:border-primary"
          />
        </label>

        <p className="text-sm text-muted-foreground">
          {arabic
            ? `اختر عضوين على الأقل. المحددون: ${selected.length} / 49. تُضاف أنت تلقائيًا.`
            : `Choose at least 2 members. Selected: ${selected.length} / 49. You are added automatically.`}
        </p>

        {people.length === 0 && (
          <p className="text-sm text-muted-foreground">{t.noContacts}</p>
        )}

        <div className="max-h-[40vh] space-y-1 overflow-y-auto">
          {people.map((contact) => {
            const checked = selected.includes(contact.username);

            return (
              <label
                key={contact.username}
                className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-3 hover:bg-card/50"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={busy || (!checked && selected.length >= 49)}
                  onChange={() => toggle(contact.username)}
                  className="h-5 w-5 accent-primary"
                />
                <span className="min-w-0">
                  <span className="block truncate font-medium">
                    {contact.name}
                  </span>
                  <span className="block text-xs text-turquoise" dir="ltr">
                    @{contact.username}
                  </span>
                </span>
              </label>
            );
          })}
        </div>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy || !name.trim() || selected.length < 2}
          className="pc-press w-full rounded-full bg-primary py-3 font-semibold text-primary-foreground disabled:opacity-50"
        >
          {busy
            ? arabic ? "جارٍ الإنشاء…" : "Creating…"
            : arabic ? "إنشاء المجموعة" : "Create group"}
        </button>
      </form>
    </Sheet>
  );
}