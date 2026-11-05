"use client";

import { useRef, useState } from "react";
import { ConnectProvider, useConnect } from "@/contexts/connect-context";
import { useCallController } from "@/lib/connect/use-call-controller";
import { useCallRingtone } from "@/lib/connect/use-call-ringtone";
import { LiveCallScreen } from "@/lib/connect/live-call-screen";
import { LoadingScreen, ToastHost, StorageNotice } from "./feedback";
import { SetupView } from "./setup-view";
import { BottomNav } from "./bottom-nav";
import { ChatsView } from "./chats-view";
import { ConversationView } from "./conversation-view";
import { ContactsView } from "./contacts-view";
import { CallsView } from "./calls-view";
import { EmailsView } from "./emails-view";
import { InvoicesView } from "./invoices-view";
import { ProfileView } from "./profile-view";
import type { TabId } from "@/lib/connect/data";
import { GroupProvider } from "@/contexts/group-context";
import { useGroupCallController } from "@/lib/connect/use-group-call-controller";
import { GroupCallScreen } from "./group-call-screen";
import { GroupCallActionsProvider } from "@/contexts/group-call-actions-context";
import { usePstnCallController } from "@/lib/connect/use-pstn-call-controller";
import { PstnCallScreen } from "./pstn-call-screen";


const CALL_CONFIGURATION: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
  ],
};

function AppInner() {
  const { ready, profile, ensureChat, contacts, t } = useConnect();
  const [tab, setTab] = useState<TabId>("chats");
  const [openChat, setOpenChat] = useState<string | null>(null);
  const groupCallBusyRef = useRef(false);
  const pstnBusyRef = useRef<() => boolean>(() => false);

  const {
    callState,
    startCall,
    acceptCall,
    setMuted,
    setVideoEnabled,
    switchCamera,
    endCall,
    } = useCallController(
    CALL_CONFIGURATION,
    () => groupCallBusyRef.current || pstnBusyRef.current(),
  );

  const {
    groupCallState,
    startGroupCall,
    acceptGroupCall,
    endGroupCall,
    setGroupMuted,
    setGroupVideoEnabled,
  } = useGroupCallController(
  () => Boolean(callState) || pstnBusyRef.current(),
);

  groupCallBusyRef.current = Boolean(groupCallState);
const {
  pstnCallState,
  pstnError,
  startPstnCall,
  endPstnCall,
  setPstnMuted,
  clearPstnError,
  isPstnBusy,
} = usePstnCallController(
  () => Boolean(callState) || Boolean(groupCallState),
);

pstnBusyRef.current = isPstnBusy;
  const { ringtoneBlocked, enableRingtone } = useCallRingtone(
    callState?.phase === "incoming" ||
      groupCallState?.phase === "incoming",
  );

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
    <GroupCallActionsProvider value={startGroupCall}>
      <div className="relative mx-auto min-h-[100dvh] max-w-md bg-background">
      {tab === "chats" && <ChatsView onOpen={(u) => setOpenChat(u)} />}
      {tab === "contacts" && (
        <ContactsView onMessage={startChat} onCall={startCall} />
      )}
      {tab === "calls" && (
        <CallsView
          onCall={startCall}
          onPhoneCall={(phone) => void startPstnCall(phone)}
          phoneCallDisabled={
            Boolean(callState) ||
            Boolean(groupCallState) ||
            Boolean(pstnCallState)
          }
        />
      )}
      {tab === "emails" && <EmailsView />}
      {tab === "invoices" && <InvoicesView />}
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
          onSwitchCamera={switchCamera}
        />
      )}

      {groupCallState && (
        <GroupCallScreen
          key={groupCallState.callId}
          call={groupCallState}
          onAccept={acceptGroupCall}
          onEnd={endGroupCall}
          onMutedChange={setGroupMuted}
          onVideoEnabledChange={setGroupVideoEnabled}
        />
      )}
      {ringtoneBlocked && (
        <button
          type="button"
          onClick={() => void enableRingtone()}
          className="fixed left-1/2 top-6 z-[100] -translate-x-1/2 rounded-full bg-white px-5 py-3 text-sm font-semibold text-black shadow-lg"
        >
          {t.unmute}
        </button>
      )}

      {pstnCallState && (
       <PstnCallScreen
         call={pstnCallState}
         onEnd={endPstnCall}
         onMutedChange={setPstnMuted}
       />
      )}

      {pstnError && (
        <div
           role="alert"
           className="fixed bottom-24 left-1/2 z-[80] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-2xl border border-destructive bg-card p-4 shadow-lg"
        >
          <p className="text-sm text-destructive">{pstnError}</p>
          <button
            type="button"
            onClick={clearPstnError}
            className="mt-3 rounded-lg border border-border px-3 py-2 text-sm"
          >
            {t.cancel}
          </button>
        </div>
      )}
            <StorageNotice />
      <ToastHost />
      </div>
    </GroupCallActionsProvider>
  );
}

export function ConnectApp() {
  return (
    <ConnectProvider>
      <GroupProvider>
        <AppInner />
      </GroupProvider>
    </ConnectProvider>
  );
}