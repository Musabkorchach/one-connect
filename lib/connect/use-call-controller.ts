"use client";

import { useEffect, useRef, useState } from "react";
import { CallSession } from "@/lib/connect/call-session";
import { useConnect } from "@/contexts/connect-context";
import { getSocket, onCallEvent, sendCallEvent } from "@/lib/api-client";

export interface CallDetails {
  callId: string;
  username: string;
  name: string;
  color: number;
  kind: "voice" | "video";
  direction: "incoming" | "outgoing";
}

export interface CallViewState extends CallDetails {
  phase: "incoming" | "preparing" | "ringing" | "connecting" | "active";
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  connectedAt: number | null;
  muted: boolean;
  videoEnabled: boolean;
  cameraFacingMode: "user" | "environment";
  cameraSwitching: boolean;
}

export function useCallController(
  configuration: RTCConfiguration,
  isOtherCallActive: () => boolean = () => false,
) {
  const connect = useConnect();
  const otherCallRef = useRef(isOtherCallActive);
  otherCallRef.current = isOtherCallActive;
  const connectRef = useRef(connect);
  connectRef.current = connect;
  const [callState, setCallState] = useState<CallViewState | null>(null);

  const sessionRef = useRef<{
    details: CallDetails;
    session: CallSession;
    connectedAt: number | null;
  } | null>(null);

    const createSession = (details: CallDetails): CallSession | null => {
    if (sessionRef.current || otherCallRef.current()) return null;

    const updateState = (patch: Partial<CallViewState>) => {
      setCallState((current) =>
        current?.callId === details.callId
          ? { ...current, ...patch }
          : current,
      );
    };

    const session = new CallSession({
      ...details,
      configuration,
      onLocalStream: (stream) => {
        updateState({ localStream: stream });
      },
      onRemoteStream: (stream) => {
        updateState({ remoteStream: stream });
      },
      onConnecting: () => {
        updateState({ phase: "connecting" });
      },
      onConnected: () => {
        const current = sessionRef.current;

        if (
          current?.details.callId !== details.callId ||
          current.connectedAt !== null
        ) {
          return;
        }

        current.connectedAt = Date.now();

        updateState({
          phase: "active",
          connectedAt: current.connectedAt,
        });
      },
      onEnd: (reason) => {
        const current = sessionRef.current;
        if (current?.details.callId !== details.callId) return;

        sessionRef.current = null;
        setCallState(null);

        if (reason === "answered-elsewhere" || reason === "unmounted") {
          return;
        }

                const messages: Record<string, string> = {
          "configuration-error": "Unable to load call settings. Please try again.",
          busy: "This user is already in a call.",
          offline: "This user is offline.",
          unauthorized: "Please sign in again before calling.",
          invalid: "The call could not be started.",
          "no-answer": "No answer.",
          declined: "Call declined.",
          "connection-timeout": "The call connection timed out.",
          "connection-failed": "Unable to connect the call.",
          disconnected: "The call ended because the connection was lost.",
          "media-error": "Unable to access the microphone or camera. Check permissions.",
        };

        const message = messages[reason];

        if (message) {
          connectRef.current.pushToast(message, "error");
        }
        const duration =
          current.connectedAt === null
            ? 0
            : Math.max(0, Math.floor((Date.now() - current.connectedAt) / 1000));

        connectRef.current.logCall(
          details.username,
          details.name,
          details.color,
          details.kind,
          details.direction === "incoming" && current.connectedAt === null
            ? "missed"
            : details.direction,
          duration,
        );
      },
    });

    sessionRef.current = { details, session, connectedAt: null };

    setCallState({
      ...details,
      phase: details.direction === "incoming" ? "incoming" : "preparing",
      localStream: null,
      remoteStream: null,
      connectedAt: null,
      muted: false,
      videoEnabled: details.kind === "video",
      cameraFacingMode: "user",
      cameraSwitching: false,
    });

    return session;
  };

    const createSessionRef = useRef(createSession);
  createSessionRef.current = createSession;

  useEffect(() => {
    return onCallEvent("call:incoming", (data) => {
      if (
        !data ||
        typeof data.callId !== "string" ||
        !/^[a-zA-Z0-9_-]{16,80}$/.test(data.callId) ||
        typeof data.from !== "string" ||
        !/^[a-z0-9._-]{1,32}$/.test(data.from) ||
        (data.kind !== "voice" && data.kind !== "video")
      ) {
        return;
      }

      const existing = sessionRef.current;
      if (existing?.details.callId === data.callId) return;

      const current = connectRef.current;

      if (
        existing ||
        otherCallRef.current() ||
        !current.ready ||
        !current.profile.setupDone
      ) {
        sendCallEvent("call:end", { callId: data.callId });
        return;
      }

      const contact = current.contacts.find(
        (item) => item.username.toLowerCase() === data.from,
      );

      createSessionRef.current({
        callId: data.callId,
        username: data.from,
        name: contact?.name || data.from,
        color: contact?.color ?? 200,
        kind: data.kind,
        direction: "incoming",
      });
    });
  }, []);

    const acceptCall = (): void => {
    const current = sessionRef.current;

    if (
      !current ||
      current.details.direction !== "incoming" ||
      callState?.phase !== "incoming"
    ) {
      return;
    }

    const callId = current.details.callId;

    setCallState((state) =>
      state?.callId === callId && state.phase === "incoming"
        ? { ...state, phase: "preparing" }
        : state,
    );

    void current.session.start().catch(() => {
      // CallSession handles ending the call and releasing media.
    });
  };

  const startCall = (
    username: string,
    name: string,
    color: number,
    kind: "voice" | "video",
  ): void => {
    if (sessionRef.current) return;

    if (!getSocket()?.connected) {
      connectRef.current.pushToast("Please reconnect before calling.", "error");
      return;
    }

    const peerUsername = username.trim().replace(/^@/, "").toLowerCase();
    const ownUsername = connectRef.current.profile.username
      .trim()
      .replace(/^@/, "")
      .toLowerCase();

    if (
      !/^[a-z0-9._-]{1,32}$/.test(peerUsername) ||
      peerUsername === ownUsername
    ) {
      connectRef.current.pushToast("Invalid call recipient.", "error");
      return;
    }

    const bytes = crypto.getRandomValues(new Uint8Array(16));
    const callId = Array.from(bytes, (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");

    const session = createSession({
      callId,
      username: peerUsername,
      name,
      color,
      kind,
      direction: "outgoing",
    });

    if (!session) return;

    void session.start().then(
      () => {
        setCallState((current) =>
          current?.callId === callId && current.phase === "preparing"
            ? { ...current, phase: "ringing" }
            : current,
        );
      },
      () => {
        // CallSession has already ended and released its media.
      },
    );
  };

    const setMuted = (muted: boolean): void => {
    const current = sessionRef.current;
    if (!current || !callState?.localStream) return;

    current.session.setMuted(muted);

    setCallState((state) =>
      state?.callId === current.details.callId
        ? { ...state, muted }
        : state,
    );
  };

  const setVideoEnabled = (enabled: boolean): void => {
    const current = sessionRef.current;

    if (
      !current ||
      current.details.kind !== "video" ||
      !callState?.localStream
    ) {
      return;
    }

    current.session.setVideoEnabled(enabled);

    setCallState((state) =>
      state?.callId === current.details.callId
        ? { ...state, videoEnabled: enabled }
        : state,
    );
  };

  const switchCamera = async (): Promise<void> => {
    const current = sessionRef.current;

    if (
      !current ||
      current.details.kind !== "video" ||
      !callState?.localStream ||
      !callState.videoEnabled ||
      callState.cameraSwitching
    ) {
      return;
    }

    const callId = current.details.callId;

    setCallState((state) =>
      state?.callId === callId
        ? { ...state, cameraSwitching: true }
        : state,
    );

    try {
      const cameraFacingMode = await current.session.switchCamera();

      setCallState((state) =>
        state?.callId === callId
          ? { ...state, cameraFacingMode }
          : state,
      );
    } catch {
      if (sessionRef.current === current) {
        connectRef.current.pushToast(
          "Unable to switch cameras. Check camera permissions and availability.",
          "error",
        );
      }
    } finally {
      setCallState((state) =>
        state?.callId === callId
          ? { ...state, cameraSwitching: false }
          : state,
      );
    }
  };

    const endCall = () => {
    sessionRef.current?.session.end();
  };

  useEffect(() => {
    return () => {
      sessionRef.current?.session.end("unmounted");
    };
  }, []);

  return {
    callState,
    startCall,
    acceptCall,
    setMuted,
    setVideoEnabled,
    switchCamera,
    endCall,
  };
}