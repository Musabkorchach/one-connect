"use client";

import type { ReactElement } from "react";
import { cx } from "./ui";
import { useConnect } from "@/contexts/connect-context";
import type { TabId } from "@/lib/connect/data";
import {
  IconChat,
  IconContacts,
  IconPhone,
  IconMail,
  IconUser,
} from "./icons";

export function BottomNav({
  tab,
  onChange,
}: {
  tab: TabId;
  onChange: (t: TabId) => void;
}) {
  const { t, totalUnread, unreadEmails } = useConnect();

  const tabs: { id: TabId; label: string; icon: ReactElement; badge?: number }[] = [
    { id: "chats", label: t.tabChats, icon: <IconChat className="h-[22px] w-[22px]" />, badge: totalUnread },
    { id: "contacts", label: t.tabContacts, icon: <IconContacts className="h-[22px] w-[22px]" /> },
    { id: "calls", label: t.tabCalls, icon: <IconPhone className="h-[22px] w-[22px]" /> },
    { id: "emails", label: t.tabEmails, icon: <IconMail className="h-[22px] w-[22px]" />, badge: unreadEmails },
    { id: "profile", label: t.tabProfile, icon: <IconUser className="h-[22px] w-[22px]" /> },
  ];

  return (
    <nav className="pc-glass-strong fixed inset-x-0 bottom-0 z-30 pc-safe-bottom border-t border-border/60">
      <div className="mx-auto flex max-w-md items-stretch justify-around px-1">
        {tabs.map((item) => {
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onChange(item.id)}
              className="pc-press relative flex flex-1 flex-col items-center gap-1 py-2"
              aria-label={item.label}
            >
              <span
                className={cx(
                  "relative transition-colors",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                {item.icon}
                {!!item.badge && item.badge > 0 && (
                  <span className="absolute -right-2 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-gold px-1 text-[10px] font-bold text-gold-foreground">
                    {item.badge > 9 ? "9+" : item.badge}
                  </span>
                )}
              </span>
              <span
                className={cx(
                  "text-[10px] font-semibold leading-none",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                {item.label}
              </span>
              {active && <span className="absolute -bottom-0 h-0.5 w-6 rounded-full bg-primary" />}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
