"use client";

import { useEffect, useRef, useState } from "react";
import { useConnect } from "@/contexts/connect-context";
import { usePiAuth } from "@/contexts/pi-auth-context";
import {
  getSocket,
  onGroupCallEvent,
  type GroupCallSnapshot,
  type GroupRecord,
} from "@/lib/api-client";
import { GroupCallSession } from "./group-call-session";

export interface GroupCallViewState extends GroupCallSnapshot {
  direction: "incoming" | "outgoing";
  phase: "incoming" | "preparing" | "ringing" | "connecting" | "active";
  localStream: MediaStream | null;
  remoteStreams: Record<string, MediaStream>;
  peerStates: Record<string, "connecting" | "connected" | "failed">;
  connectedAt: number | null;
  muted: boolean;
  videoEnabled: boolean;
}

export function useGroupCallController(
  isOtherCallActive: () => boolean,
) {
  const connect = useConnect();
  const { isAuthenticated, sessionToken, piUsername } = usePiAuth();

  const connectRef = useRef(connect);
  connectRef.current = connect;

  const otherCallRef = useRef(isOtherCallActive);
  otherCallRef.current = isOtherCallActive;

  const me = (piUsername || "").replace(/^@+/, "").toLowerCase();
  const token = isAuthenticated ? sessionToken : null;

  const [groupCallState, setGroupCallState] =
    useState<GroupCallViewState | null>(null);

  const currentRef = useRef<{
    callId: string;
    session: GroupCallSession;
    accepted: boolean;
    incomingTimer: ReturnType<typeof setTimeout> | null;
  } | null>(null);

  const createSession = (
    snapshot: GroupCallSnapshot,
    direction: "incoming" | "outgoing",
  ): GroupCallSession | null => {
    if (currentRef.current || otherCallRef.current()) return null;

    const update = (patch: Partial<GroupCallViewState>) => {
      setGroupCallState((current) =>
        current?.callId === snapshot.callId
          ? { ...current, ...patch }
          : current,
      );
    };

    const session = new GroupCallSession({
      callId: snapshot.callId,
      groupId: snapshot.groupId,
      username: me,
      kind: snapshot.kind,
      direction,

      onSnapshot: (next) => {
        setGroupCallState((current) => {
          if (current?.callId !== snapshot.callId) return current;

          const remoteStreams = Object.fromEntries(
            Object.entries(current.remoteStreams).filter(
              ([username]) => next.participants.includes(username),
            ),
          );

          const peerStates = Object.fromEntries(
            Object.entries(current.peerStates).filter(
              ([username]) => next.participants.includes(username),
            ),
          );

          return {
            ...current,
            ...next,
            remoteStreams,
            peerStates,
            phase: current.phase === "active"
              ? "active"
              : next.participants.length > 1
                ? "connecting"
                : direction === "outgoing"
                  ? "ringing"
                  : "connecting",
          };
        });
      },

      onLocalStream: (stream) => {
        update({ localStream: stream });
      },

      onRemoteStream: (username, stream) => {
        setGroupCallState((current) => {
          if (current?.callId !== snapshot.callId) return current;

          const remoteStreams = { ...current.remoteStreams };
          if (stream) remoteStreams[username] = stream;
          else delete remoteStreams[username];

          return { ...current, remoteStreams };
        });
      },

      onPeerState: (username, state) => {
        setGroupCallState((current) => {
          if (current?.callId !== snapshot.callId) return current;

          return {
            ...current,
            peerStates: { ...current.peerStates, [username]: state },
            phase: state === "connected" ? "active" : current.phase,
            connectedAt: state === "connected"
              ? current.connectedAt ?? Date.now()
              : current.connectedAt,
          };
        });
      },

      onEnd: (reason) => {
        const current = currentRef.current;
        if (current?.callId !== snapshot.callId) return;

        if (current.incomingTimer !== null) {
          clearTimeout(current.incomingTimer);
        }

        currentRef.current = null;
        setGroupCallState(null);

        const messages: Record<string, string> = {
          busy: "You are already in another call.",
          "group-busy": "This group already has an ongoing call.",
          full: "The call already has 5 participants.",
          unauthorized: "Please sign in again before calling.",
          "not-member": "You are not a member of this group.",
          unavailable: "This group call is no longer available.",
          invalid: "The group call could not be started.",
          "server-error": "The call server could not complete the request.",
          "configuration-error": "Unable to load call settings.",
          "media-error": "Unable to access the microphone or camera.",
          "connection-timeout": "The group call connection timed out.",
          disconnected: "The group call ended because the connection was lost.",
          "no-answer": "No group members answered.",
          alone: "The call ended because no other participants remained.",
        };

        if (messages[reason]) {
          connectRef.current.pushToast(messages[reason], "error");
        }
      },
    });

    const current = {
      callId: snapshot.callId,
      session,
      accepted: direction === "outgoing",
      incomingTimer: null as ReturnType<typeof setTimeout> | null,
    };

    currentRef.current = current;

    setGroupCallState({
      ...snapshot,
      direction,
      phase: direction === "incoming" ? "incoming" : "preparing",
      localStream: null,
      remoteStreams: {},
      peerStates: {},
      connectedAt: null,
      muted: false,
      videoEnabled: snapshot.kind === "video",
    });

    if (direction === "incoming") {
      current.incomingTimer = setTimeout(() => {
        if (currentRef.current === current && !current.accepted) {
          session.end("invitation-expired", false);
        }
      }, 45000);
    }

    return session;
  };

  const createSessionRef = useRef(createSession);
  createSessionRef.current = createSession;

  useEffect(() => {
    if (!token || !me) return;

    const unsubscribe = onGroupCallEvent("group-call:incoming", (snapshot) => {
      const current = connectRef.current;

      if (
        !snapshot ||
        typeof snapshot.callId !== "string" ||
        !/^[a-zA-Z0-9_-]{16,80}$/.test(snapshot.callId) ||
        typeof snapshot.groupId !== "string" ||
        !/^[a-f0-9]{24}$/.test(snapshot.groupId) ||
        typeof snapshot.groupName !== "string" ||
        (snapshot.kind !== "voice" && snapshot.kind !== "video") ||
        !Array.isArray(snapshot.participants) ||
        snapshot.participants.length < 1 ||
        snapshot.participants.length > 5 ||
        !snapshot.participants.every(
          (username) =>
            typeof username === "string" &&
            /^[a-z0-9._-]{1,32}$/.test(username),
        ) ||
        !snapshot.participants.includes(snapshot.hostUsername) ||
        snapshot.participants.includes(me) ||
        snapshot.maxParticipants !== 5 ||
        !current.ready ||
        !current.profile.setupDone ||
        currentRef.current ||
        otherCallRef.current()
      ) return;

      createSessionRef.current(snapshot, "incoming");
    });

    return () => {
      unsubscribe();
      currentRef.current?.session.end("unmounted");
    };
  }, [token, me]);

  const startGroupCall = (
    group: GroupRecord,
    kind: "voice" | "video",
  ): void => {
    if (currentRef.current || otherCallRef.current()) return;

    if (
      !token ||
      !me ||
      !connectRef.current.ready ||
      !connectRef.current.profile.setupDone ||
      !getSocket()?.connected
    ) {
      connectRef.current.pushToast("Please reconnect before calling.", "error");
      return;
    }

    if (!group.members.includes(me)) {
      connectRef.current.pushToast("You are not a group member.", "error");
      return;
    }

    const bytes = crypto.getRandomValues(new Uint8Array(16));
    const callId = Array.from(
      bytes,
      (byte) => byte.toString(16).padStart(2, "0"),
    ).join("");

    const session = createSession({
      callId,
      groupId: group.id,
      groupName: group.name,
      hostUsername: me,
      kind,
      participants: [me],
      maxParticipants: 5,
    }, "outgoing");

    if (session) void session.start().catch(() => {});
  };

  const acceptGroupCall = (): void => {
    const current = currentRef.current;
    if (!current || current.accepted) return;

    if (otherCallRef.current()) {
      current.session.end("busy", false);
      return;
    }

    current.accepted = true;

    if (current.incomingTimer !== null) {
      clearTimeout(current.incomingTimer);
      current.incomingTimer = null;
    }

    setGroupCallState((state) =>
      state?.callId === current.callId
        ? { ...state, phase: "preparing" }
        : state,
    );

    void current.session.start().catch(() => {});
  };

  const endGroupCall = (): void => {
    const current = currentRef.current;
    if (!current) return;

    current.session.end(
      current.accepted ? "left" : "declined",
      current.accepted,
    );
  };

  const setGroupMuted = (muted: boolean): void => {
    const current = currentRef.current;
    if (!current) return;

    current.session.setMuted(muted);

    setGroupCallState((state) =>
      state?.callId === current.callId ? { ...state, muted } : state,
    );
  };

  const setGroupVideoEnabled = (enabled: boolean): void => {
    const current = currentRef.current;
    if (!current) return;

    current.session.setVideoEnabled(enabled);

    setGroupCallState((state) =>
      state?.callId === current.callId
        ? { ...state, videoEnabled: enabled }
        : state,
    );
  };

  return {
    groupCallState,
    startGroupCall,
    acceptGroupCall,
    endGroupCall,
    setGroupMuted,
    setGroupVideoEnabled,
  };
}