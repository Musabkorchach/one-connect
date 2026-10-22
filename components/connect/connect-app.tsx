"use client";

import { useState } from "react";
import { ConnectProvider, useConnect } from "@/contexts/connect-context";
import { useCallController } from "@/lib/connect/use-call-controller";
import { LiveCallScreen } from "@/lib/connect/live-call-screen";
import { LoadingScreen, ToastHost, StorageNotice } from "./feedback";
import { SetupView } from "./setup-view";
import { BottomNav } from "./bottom-nav";
import { ChatsView } from "./chats-view";
import { ConversationView } from "./conversation-view";
import { ContactsView } from "./contacts-view";
import { CallsView } from "./calls-view";
import { EmailsView } from "./emails-view";
import { ProfileView } from "./profile-view";
import type { TabId } from "@/lib/connect/data";

const CALL_CONFIGURATION: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
  ],
};

function AppInner() {
  const { ready, profile, ensureChat, contacts } = useConnect();
  const [tab, setTab] = useState<TabId>("chats");
  const [openChat, setOpenChat] = useState<string | null>(null);

  const {
    callState,
    startCall,
    acceptCall,
    setMuted,
    setVideoEnabled,
    endCall,
  } = useCallController(CALL_CONFIGURATION);

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
    const contact = contacts.find((item) => item.username === username);
    if (contact) ensureChat(contact);

    setOpenChat(username);
    setTab("chats");
  };

  return (
    <div className="relative mx-auto min-h-[100dvh] max-w-md bg-background">
      {tab === "chats" && <ChatsView onOpen={(u) => setOpenChat(u)} />}
      {tab === "contacts" && (
        <ContactsView onMessage={startChat} onCall={startCall} />
      )}
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

      {callState && (
        <LiveCallScreen
          key={callState.callId}
          call={callState}
          onAccept={acceptCall}
          onEnd={endCall}
          onMutedChange={setMuted}
          onVideoEnabledChange={setVideoEnabled}
        />
      )}

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