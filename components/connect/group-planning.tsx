"use client";

import { useConnect } from "@/contexts/connect-context";
import { getGroupCopy } from "@/lib/connect/i18n";
import type { GroupManagement } from "@/lib/api-client";

const field = "min-h-11 w-full rounded-lg border bg-background px-2";
const button = "min-h-11 rounded-lg border px-3 disabled:opacity-60";
const sections = ["topics", "polls", "events"] as const;
const singular = { topics: "topic", polls: "poll", events: "event" };

export function GroupPlanning({ planning, canManage, active, busy, act, closeItem }: {
  planning: NonNullable<GroupManagement["planning"]>;
  canManage: boolean;
  active: boolean;
  busy: boolean;
  act: (action: string, fields: Record<string, unknown>) => Promise<void>;
  closeItem: (action: string, id: string) => void;
}) {
  const { lang } = useConnect();
  const copy = getGroupCopy(lang);
  return <div className="space-y-3">
    {sections.map(section => <details key={section} className="rounded-xl border p-3">
      <summary className="min-h-9 cursor-pointer font-medium">{copy[section]}</summary>
      {canManage && <form className="space-y-2" onSubmit={event => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const title = data.get("title");
        const fields = section === "polls" ? { options: String(data.get("options")).split(/\r?\n/).map(s => s.trim()).filter(Boolean) }
          : section === "events" ? { startsAt: new Date(String(data.get("time"))).getTime() } : {};
        void act(singular[section] + ":create", { title, ...fields });
      }}>
        <label>
          {copy.name}
          <input name="title" dir="auto" required maxLength={100} className={field} />
        </label>
        {section === "polls" && <label>
          {copy.pollOptions}
          <textarea name="options" dir="auto" required maxLength={480} rows={3} className={field} />
        </label>}
        {section === "events" && <label>
          {copy.eventTime}
          <input name="time" type="datetime-local" required className={field} />
        </label>}
        <button className={button} disabled={busy}>{copy.add}</button>
      </form>}
      <ul className="space-y-2">
        {planning[section].map(item => <li key={item.id} className="space-y-2 rounded-lg border p-2">
          <p dir="auto" className="font-medium break-words">{item.title}</p>
          {"options" in item && <div className="flex flex-wrap gap-2">
            {item.options.map((option, choice) => <button key={option} type="button" className={button}
              aria-pressed={item.choice === choice} disabled={!active || item.closed || busy}
              onClick={() => void act("poll:vote", { id: item.id, choice: item.choice === choice ? null : choice })}>
              <bdi>{option}</bdi> · {item.totals[choice]}
            </button>)}
          </div>}
          {"startsAt" in item && <>
            <time dateTime={new Date(item.startsAt).toISOString()}>{new Date(item.startsAt).toLocaleString(lang)}</time>
            <p>{copy.attending} · {item.attendees}</p>
            {active && !item.closed && item.startsAt > Date.now() && <button type="button" className={button} disabled={busy}
              onClick={() => void act("event:rsvp", { id: item.id, attending: !item.attending })}>
              {item.attending ? copy.cancelRsvp : copy.attend}
            </button>}
          </>}
          {canManage && !item.closed && <button type="button" className={button} disabled={busy}
            onClick={() => closeItem(singular[section] + ":close", item.id)}>{copy.closeItem}</button>}
        </li>)}
      </ul>
    </details>)}
  </div>;
}
