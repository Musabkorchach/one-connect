"use client";

import { useState } from "react";
import { ConnectProvider, useConnect } from "@/contexts/connect-context";
import { LoadingScreen, ToastHost, StorageNotice } from "./feedback";
import { SetupView } from "./setup-view";
import { BottomNav } from "./bottom-nav";
import { ChatsView } from "./chats-view";
import { ConversationView } from "./conversation-view";
import { ContactsView } from "./contacts-view";
import { CallsView } from "./calls-view";
import { CallScreen, type ActiveCall } from "./call-screen";
import { EmailsView } from "./emails-view";
import { ProfileView } from "./profile-view";
import type { TabId } from "@/lib/connect/data";

function AppInner() {
  const { ready, profile, ensureChat, contacts } = useConnect();
  const [tab, setTab] = useState<TabId>("chats");
  const [openChat, setOpenChat] = useState<string | null>(null);
  const [call, setCall] = useState<ActiveCall | null>(null);

  if (!ready) return <LoadingScreen />;
  if (!profile.setupDone) {
    return (
      <>
        <SetupView />
        <ToastHost />
      </>
    );
  }

  const startChat = (username: string) => {
    const c = contacts.find((x) => x.username === username);
    if (c) ensureChat(c);
    setOpenChat(username);
    setTab("chats");
  };

  const startCall = (username: string, name: string, color: number, kind: "voice" | "video") => {
    setCall({ username, name, color, kind });
  };

  return (
    <div className="relative mx-auto min-h-[100dvh] max-w-md bg-background">
      {tab === "chats" && <ChatsView onOpen={(u) => setOpenChat(u)} />}
      {tab === "contacts" && <ContactsView onMessage={startChat} onCall={startCall} />}
      {tab === "calls" && <CallsView onCall={startCall} />}
      {tab === "emails" && <EmailsView />}
      {tab === "profile" && <ProfileView />}

      <BottomNav tab={tab} onChange={setTab} />

      {openChat && (
        <ConversationView
          username={openChat}
          onBack={() => setOpenChat(null)}
          onCall={startCall}
        />
      )}

      {call && <CallScreen call={call} onEnd={() => setCall(null)} />}

      <StorageNotice />
      <ToastHost />
    </div>
  );
}

export function ConnectApp() {
  return (
    <ConnectProvider>
      <AppInner />
    </ConnectProvider>
  );
}
