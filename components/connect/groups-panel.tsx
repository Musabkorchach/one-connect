"use client";

import { useState } from "react";
import { useConnect } from "@/contexts/connect-context";
import { useGroups } from "@/contexts/group-context";
import { Avatar } from "./ui";
import { CreateGroupSheet } from "./create-group-sheet";
import { GroupConversationView } from "./group-conversation-view";
import { hueFromString } from "@/lib/connect/data";

export function GroupsPanel({ query = "" }: { query?: string }) {
  const { lang } = useConnect();
  const { groups, loading, error } = useGroups();
  const arabic = lang === "ar";

  const [creating, setCreating] = useState(false);
  const [openGroupId, setOpenGroupId] = useState<string | null>(null);

  const search = query.trim().toLowerCase();
  const filtered = groups.filter(
    (group) =>
      !search ||
      group.name.toLowerCase().includes(search) ||
      group.members.some((member) => member.includes(search)),
  );

  const openGroup = groups.find((group) => group.id === openGroupId);

  return (
    <section className="px-2 pt-3">
      <div className="flex items-center justify-between gap-3 px-3 pb-2">
        <h2 className="text-sm font-bold text-muted-foreground">
          {arabic ? "المجموعات" : "Groups"}
        </h2>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="pc-press rounded-full bg-primary/15 px-4 py-2 text-sm font-semibold text-primary"
        >
          {arabic ? "+ إنشاء مجموعة" : "+ Create group"}
        </button>
      </div>

      {loading && (
        <p className="px-3 py-2 text-sm text-muted-foreground">
          {arabic ? "جارٍ تحميل المجموعات…" : "Loading groups…"}
        </p>
      )}

      {error && (
        <p role="alert" className="px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <ul>
        {filtered.map((group) => (
          <li key={group.id}>
            <button
              type="button"
              onClick={() => setOpenGroupId(group.id)}
              className="pc-press flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-start hover:bg-card/50"
            >
              <Avatar
                name={group.name}
                color={hueFromString(group.id)}
                size={52}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">
                  {group.name}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {group.members.length} {arabic ? "أعضاء" : "members"}
                </span>
              </span>
             {group.unreadCount > 0 && (
                <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-primary-foreground">
                  {group.unreadCount}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>

      {creating && (
        <CreateGroupSheet
          onClose={() => setCreating(false)}
          onCreated={(groupId) => {
            setCreating(false);
            setOpenGroupId(groupId);
          }}
        />
      )}

      {openGroup && (
        <GroupConversationView
          group={openGroup}
          onBack={() => setOpenGroupId(null)}
        />
      )}
    </section>
  );
}