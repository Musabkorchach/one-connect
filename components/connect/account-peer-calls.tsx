"use client";

import { useEffect, useMemo } from "react";
import { io } from "socket.io-client";
import { getCallConfiguration, VERIFIED_CALL_PROTOCOL, WS_URL, type CallEventMap } from "@/lib/api-client";
import type { PeerCallTransport } from "@/lib/connect/call-session";

export type StartPeerCall = (username: string, kind: "voice" | "video") => void;

export function useAccountCallTransport(sessionToken: string | null) {
  const socket = useMemo(() => sessionToken ? io(WS_URL + "/calls", {
    autoConnect: false, forceNew: true, auth: { sessionToken, verifiedCallProtocol: VERIFIED_CALL_PROTOCOL },
  }) : null, [sessionToken]);
  const transport = useMemo<PeerCallTransport | undefined>(() => socket && sessionToken ? ({
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
  }) : undefined, [socket, sessionToken]);

  useEffect(() => {
    if (!socket) return;
    socket.connect();
    return () => { socket.disconnect(); };
  }, [socket]);

  return transport;
}
