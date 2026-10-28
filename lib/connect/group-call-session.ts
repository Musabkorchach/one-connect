import {
  getCallConfiguration,
  onGroupCallEvent,
  sendGroupCallEvent,
  type GroupCallSnapshot,
} from "@/lib/api-client";
import { openCallMedia, stopCallMedia } from "./call-media";
import { GroupCallPeer } from "./group-call-peer";

export interface GroupCallSessionOptions {
  callId: string;
  groupId: string;
  username: string;
  kind: "voice" | "video";
  direction: "incoming" | "outgoing";
  onSnapshot: (snapshot: GroupCallSnapshot) => void;
  onLocalStream: (stream: MediaStream) => void;
  onRemoteStream: (username: string, stream: MediaStream | null) => void;
  onPeerState: (
    username: string,
    state: "connecting" | "connected" | "failed",
  ) => void;
  onEnd: (reason: string) => void;
}

export class GroupCallSession {
  private ended = false;
  private started = false;
  private registered = false;
  private localStream: MediaStream | null = null;
  private configuration: RTCConfiguration | null = null;

  private peers = new Map<string, GroupCallPeer>();
  private peerTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private listeners: Array<() => void> = [];
  private registrationTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly options: GroupCallSessionOptions) {
    this.listeners.push(
      onGroupCallEvent("group-call:started", (snapshot) => {
        if (options.direction === "outgoing") this.updateRoster(snapshot);
      }),

      onGroupCallEvent("group-call:joined", (snapshot) => {
        if (options.direction === "incoming") this.updateRoster(snapshot);
      }),

      onGroupCallEvent("group-call:participant-joined", (snapshot) => {
        this.updateRoster(snapshot);
      }),

      onGroupCallEvent("group-call:participant-left", (snapshot) => {
        this.updateRoster(snapshot);
      }),

      onGroupCallEvent("group-call:signal", (signal) => {
        if (
          this.ended ||
          !this.registered ||
          signal?.callId !== options.callId ||
          typeof signal.from !== "string"
        ) return;

        this.peers.get(signal.from)?.receive({
          description: signal.description,
          candidate: signal.candidate,
        });
      }),

      onGroupCallEvent("group-call:ended", (event) => {
        if (event?.callId === options.callId) {
          this.end(event.reason, false);
        }
      }),

      onGroupCallEvent("group-call:left", (event) => {
        if (event?.callId === options.callId) {
          this.end(event.reason, false);
        }
      }),

      onGroupCallEvent("group-call:answered-elsewhere", (event) => {
        if (event?.callId === options.callId) {
          this.end("answered-elsewhere", false);
        }
      }),

      onGroupCallEvent("group-call:error", (event) => {
        if (event?.callId === options.callId) {
          this.end(event.reason, false);
        }
      }),

      onGroupCallEvent("disconnect", () => {
        this.end("disconnected", false);
      }),
    );
  }

  private validSnapshot(snapshot: GroupCallSnapshot): boolean {
    return Boolean(
      snapshot &&
      snapshot.callId === this.options.callId &&
      snapshot.groupId === this.options.groupId &&
      snapshot.kind === this.options.kind &&
      typeof snapshot.groupName === "string" &&
      Array.isArray(snapshot.participants) &&
      snapshot.participants.length >= 1 &&
      snapshot.participants.length <= 5 &&
      new Set(snapshot.participants).size === snapshot.participants.length &&
      snapshot.participants.every(
        (username) =>
          typeof username === "string" &&
          /^[a-z0-9._-]{1,32}$/.test(username),
      ) &&
      snapshot.participants.includes(this.options.username) &&
      snapshot.participants.includes(snapshot.hostUsername) &&
      snapshot.maxParticipants === 5,
    );
  }

  private clearPeerTimer(username: string): void {
    const timer = this.peerTimers.get(username);
    if (timer !== undefined) clearTimeout(timer);
    this.peerTimers.delete(username);
  }

  private updateRoster(snapshot: GroupCallSnapshot): void {
    if (
      this.ended ||
      !this.started ||
      !this.localStream ||
      !this.configuration ||
      !this.validSnapshot(snapshot)
    ) return;

    this.registered = true;

    if (this.registrationTimer !== null) {
      clearTimeout(this.registrationTimer);
      this.registrationTimer = null;
    }

    const others = snapshot.participants.filter(
      (username) => username !== this.options.username,
    );

    for (const [username, peer] of this.peers) {
      if (others.includes(username)) continue;

      this.clearPeerTimer(username);
      peer.close();
      this.peers.delete(username);
      this.options.onRemoteStream(username, null);
    }

    this.options.onSnapshot(snapshot);

    const ownPosition = snapshot.participants.indexOf(this.options.username);

    for (const username of others) {
      if (this.peers.has(username)) continue;

      try {
        const peer = new GroupCallPeer({
          stream: this.localStream,
          configuration: this.configuration,
          initiator:
            ownPosition > snapshot.participants.indexOf(username),

          sendSignal: (signal) => {
            if (this.ended) return false;

            return sendGroupCallEvent("group-call:signal", {
              callId: this.options.callId,
              to: username,
              ...signal,
            });
          },

          onRemoteStream: (stream) => {
            if (!this.ended) {
              this.options.onRemoteStream(username, stream);
            }
          },

          onConnected: () => {
            if (this.ended) return;
            this.clearPeerTimer(username);
            this.options.onPeerState(username, "connected");
          },

          onFailed: () => {
            if (this.ended) return;
            this.clearPeerTimer(username);
            this.options.onPeerState(username, "failed");
          },
        });

        this.peers.set(username, peer);
        this.options.onPeerState(username, "connecting");

        this.peerTimers.set(
          username,
          setTimeout(() => {
            if (this.ended || this.peers.get(username) !== peer) return;

            this.peerTimers.delete(username);
            peer.close();
            this.options.onPeerState(username, "failed");
          }, 30000),
        );

        peer.start();
      } catch {
        this.options.onPeerState(username, "failed");
      }
    }
  }

  async start(): Promise<void> {
    if (this.started || this.ended) return;
    this.started = true;

    let failureReason = "configuration-error";

    try {
      const configuration = await getCallConfiguration();
      if (this.ended) return;

      this.configuration = configuration;
      failureReason = "media-error";

      const stream = await openCallMedia(this.options.kind);

      if (this.ended) {
        stopCallMedia(stream);
        return;
      }

      this.localStream = stream;
      this.options.onLocalStream(stream);

      this.registrationTimer = setTimeout(() => {
        this.end("connection-timeout");
      }, 20000);

      const sent = this.options.direction === "outgoing"
        ? sendGroupCallEvent("group-call:start", {
            callId: this.options.callId,
            groupId: this.options.groupId,
            kind: this.options.kind,
          })
        : sendGroupCallEvent("group-call:join", {
            callId: this.options.callId,
          });

      if (!sent) this.end("disconnected", false);
    } catch (error) {
      this.end(failureReason);
      throw error;
    }
  }

  setMuted(muted: boolean): void {
    if (this.ended) return;

    for (const track of this.localStream?.getAudioTracks() ?? []) {
      track.enabled = !muted;
    }
  }

  setVideoEnabled(enabled: boolean): void {
    if (this.ended || this.options.kind !== "video") return;

    for (const track of this.localStream?.getVideoTracks() ?? []) {
      track.enabled = enabled;
    }
  }

  end(reason = "left", notifyServer = true): void {
    if (this.ended) return;
    this.ended = true;

    if (this.registrationTimer !== null) {
      clearTimeout(this.registrationTimer);
      this.registrationTimer = null;
    }

    for (const unsubscribe of this.listeners) unsubscribe();
    this.listeners = [];

    for (const timer of this.peerTimers.values()) clearTimeout(timer);
    this.peerTimers.clear();

    for (const peer of this.peers.values()) peer.close();
    this.peers.clear();

    stopCallMedia(this.localStream);
    this.localStream = null;

    if (notifyServer && this.started) {
      sendGroupCallEvent("group-call:leave", {
        callId: this.options.callId,
      });
    }

    this.options.onEnd(reason);
  }
}