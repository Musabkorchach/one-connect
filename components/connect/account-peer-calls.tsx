"use client";

import { useEffect, useMemo } from "react";
import { io } from "socket.io-client";
import { getCallConfiguration, ACCOUNT_CALL_PROTOCOL, WS_URL, type CallEventMap } from "@/lib/api-client";
import { CallKeyError, rawCallKey, signCallFields } from "@/lib/connect/call-identity";
import type { PeerCallTransport } from "@/lib/connect/call-session";

export const disconnectedAccountTransport: PeerCallTransport = {
  protocol: ACCOUNT_CALL_PROTOCOL,
  on: () => () => {},
  send: () => false,
  configuration: async () => { throw new CallKeyError("call-device-registration-failed"); },
  connected: () => false,
};

export type StartPeerCall = (username: string, kind: "voice" | "video") => void;

export function useAccountCallTransport(sessionToken: string | null) {
  const socket = useMemo(() => sessionToken ? io(WS_URL + "/calls", {
    autoConnect: false, forceNew: true, auth: { sessionToken, verifiedCallProtocol: ACCOUNT_CALL_PROTOCOL },
  }) : null, [sessionToken]);
  const transport = useMemo<PeerCallTransport | undefined>(() => socket && sessionToken ? ({
    protocol: ACCOUNT_CALL_PROTOCOL,
    async registerDevice(username, pair) {
      if (!socket.connected) throw new CallKeyError("call-device-registration-failed");
      const publicKey = await rawCallKey(pair);
      try {
        const challenge = await socket.timeout(5000).emitWithAck("call:device-challenge", {});
        const nonce = challenge?.nonce;
        if (typeof nonce !== "string" || !/^[a-f0-9]{32}$/.test(nonce)) throw new Error();
        const signature = await signCallFields(pair, ["oneconnect/call-device/v1", username, nonce, publicKey]);
        const result = await socket.timeout(5000).emitWithAck("call:register-device", { nonce, publicKey, signature });
        if (result?.registered === true) return nonce;
      } catch (error) {
        if (error instanceof CallKeyError) throw error;
      }
      throw new CallKeyError("call-device-registration-failed");
    },
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
