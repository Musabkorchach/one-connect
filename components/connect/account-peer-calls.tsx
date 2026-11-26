"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { io } from "socket.io-client";
import { getCallConfiguration, WS_URL, type CallEventMap } from "@/lib/api-client";
import type { PeerCallTransport } from "@/lib/connect/call-session";
import { usePeerCallController } from "@/lib/connect/use-call-controller";
import { LivePeerCallScreen } from "@/lib/connect/live-call-screen";
import { getDict } from "@/lib/connect/i18n";

export type StartPeerCall = (username: string, kind: "voice" | "video") => void;

export function AccountPeerCalls({ sessionToken, username, children }: {
  sessionToken: string;
  username: string;
  children: (startCall: StartPeerCall) => ReactNode;
}) {
  const [notice, setNotice] = useState("");
  const socket = useMemo(() => io(WS_URL + "/calls", {
    autoConnect: false, forceNew: true, auth: { sessionToken },
  }), [sessionToken]);
  const transport = useMemo<PeerCallTransport>(() => ({
    on(event, listener) {
      const receive = (payload: unknown) => listener(payload as CallEventMap[typeof event]);
      const name: string = event;
      socket.on(name, receive);
      return () => { socket.off(name, receive); };
    },
    send(event, payload) {
      if (!socket.connected) return false;
      socket.emit(event, payload);
      return true;
    },
    connected: () => socket.connected,
    configuration: () => getCallConfiguration(sessionToken),
  }), [socket, sessionToken]);
  const call = usePeerCallController({
    ready: true, profile: { username, setupDone: true }, contacts: [],
    pushToast: setNotice,
    // The account call service records history after a verified connection.
    logCall: () => {},
  }, {}, transport);

  useEffect(() => {
    socket.connect();
    return () => { socket.disconnect(); };
  }, [socket]);

  return <>
    {children((peer, kind) => { setNotice(""); call.startCall(peer, peer, 200, kind); })}
    {notice && <p role="alert" className="mx-auto max-w-md px-4">{notice}</p>}
    {call.callState && <LivePeerCallScreen call={call.callState} t={getDict("en")}
      onAccept={call.acceptCall} onEnd={call.endCall} onMutedChange={call.setMuted}
      onVideoEnabledChange={call.setVideoEnabled} onSwitchCamera={call.switchCamera} />}
  </>;
}
