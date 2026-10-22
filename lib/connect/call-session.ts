import {
  getCallConfiguration,
  onCallEvent,
  sendCallEvent,
} from "@/lib/api-client";
import {
  openCallMedia,
  stopCallMedia,
  createCallPeer,
  createRemoteSignalQueue,
} from "./call-media";

export interface CallSessionOptions {
  callId: string;
  username: string;
  kind: "voice" | "video";
  direction: "incoming" | "outgoing";
  configuration: RTCConfiguration;
  onLocalStream: (stream: MediaStream) => void;
  onRemoteStream: (stream: MediaStream) => void;
  onConnecting: () => void;
  onConnected: () => void;
  onEnd: (reason: string) => void;
}

export class CallSession {
  private ended = false;
  private started = false;
  private disconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private negotiated = false;
  private localStream: MediaStream | null = null;
  private peer: RTCPeerConnection | null = null;
  private signals: ReturnType<typeof createRemoteSignalQueue> | null = null;
  private listeners: Array<() => void> = [];

    constructor(private readonly options: CallSessionOptions) {
    this.listeners.push(
      onCallEvent("call:accepted", (data) => {
        if (
          data?.callId !== this.options.callId ||
          this.ended ||
          !this.started
        ) {
          return;
        }

        this.options.onConnecting();

        if (this.options.direction === "outgoing") {
          void this.sendOffer().catch(() => {
            this.end("connection-failed");
          });
        }
      }),
            onCallEvent("call:offer", (data) => {
        if (
          data?.callId !== this.options.callId ||
          this.options.direction !== "incoming" ||
          this.ended
        ) {
          return;
        }

        void this.receiveOffer(data.offer).catch(() => {
          this.end("connection-failed");
        });
      }),

            onCallEvent("call:answered", (data) => {
        if (
          data?.callId !== this.options.callId ||
          this.options.direction !== "outgoing" ||
          this.ended
        ) {
          return;
        }

        void this.receiveAnswer(data.answer).catch(() => {
          this.end("connection-failed");
        });
      }),

      onCallEvent("call:ended", (data) => {
        if (data?.callId !== this.options.callId) return;

        this.end(data.reason, false);
      }),

            onCallEvent("call:ice-candidate", (data) => {
        if (
          data?.callId !== this.options.callId ||
          this.ended
        ) {
          return;
        }

        const signals = this.signals;
        if (!signals) return;

        void signals.addCandidate(data.candidate).catch(() => {
          this.end("connection-failed");
        });
      }),

      onCallEvent("call:error", (data) => {
        if (data?.callId !== this.options.callId) return;

        this.end(data.reason, false);
      }),

      onCallEvent("disconnect", () => {
        this.end("disconnected", false);
      }),

      onCallEvent("call:connected", (data) => {
        if (
          data?.callId !== this.options.callId ||
          this.ended ||
          !this.negotiated ||
          this.peer?.connectionState !== "connected"
        ) {
          return;
        }

        this.options.onConnected();
      }),
    );
  }

    private async sendOffer(): Promise<void> {
    const peer = this.peer;
    if (!peer || this.ended) return;

    const offer = await peer.createOffer();
    if (this.ended) return;

    await peer.setLocalDescription(offer);
    if (this.ended) return;

    const sent = sendCallEvent("call:offer", {
      callId: this.options.callId,
      offer: {
        type: "offer",
        sdp: peer.localDescription?.sdp ?? offer.sdp,
      },
    });

    if (!sent) this.end("disconnected", false);
  }

    private async receiveOffer(
    offer: RTCSessionDescriptionInit,
  ): Promise<void> {
    const peer = this.peer;
    const signals = this.signals;
    if (!peer || !signals || this.ended) return;

    await signals.setDescription(offer);
    if (this.ended) return;

    const answer = await peer.createAnswer();
    if (this.ended) return;

    await peer.setLocalDescription(answer);
    if (this.ended) return;

    const sent = sendCallEvent("call:answer", {
      callId: this.options.callId,
      answer: {
        type: "answer",
        sdp: peer.localDescription?.sdp ?? answer.sdp,
      },
    });

    if (!sent) {
      this.end("disconnected", false);
      return;
    }

    this.negotiated = true;
    this.reportConnected();
  }

    private async receiveAnswer(
    answer: RTCSessionDescriptionInit,
  ): Promise<void> {
    const signals = this.signals;
    if (!signals || this.ended) return;

    await signals.setDescription(answer);
    if (this.ended) return;

    this.negotiated = true;
    this.reportConnected();
  }

  private reportConnected(): void {
    if (
      !this.ended &&
      this.negotiated &&
      this.peer?.connectionState === "connected"
    ) {
      sendCallEvent("call:connected", {
        callId: this.options.callId,
      });
    }
  }

  async start(): Promise<void> {
    if (this.started || this.ended) return;
    this.started = true;

    let failureReason = "configuration-error";

    try {
      const configuration = await getCallConfiguration();
      if (this.ended) return;

      failureReason = "media-error";
      await this.prepare(configuration);
      if (this.ended) return;

      const sent =
        this.options.direction === "outgoing"
          ? sendCallEvent("call:initiate", {
              callId: this.options.callId,
              to: this.options.username,
              kind: this.options.kind,
            })
          : sendCallEvent("call:accept", {
              callId: this.options.callId,
            });

      if (!sent) {
        this.end("disconnected", false);
      }
    } catch (error) {
      this.end(failureReason);
      throw error;
    }
  }

    async prepare(
    configuration: RTCConfiguration = this.options.configuration,
  ): Promise<void> {
    if (this.ended) throw new Error("Call has ended.");
    if (this.peer) return;

    const stream = await openCallMedia(this.options.kind);

    if (this.ended) {
      stopCallMedia(stream);
      throw new Error("Call has ended.");
    }

    this.localStream = stream;

    try {
        this.peer = createCallPeer(stream, configuration, {
        onRemoteStream: (remoteStream) => {
          if (!this.ended) this.options.onRemoteStream(remoteStream);
        },
        onCandidate: (candidate) => {
          if (this.ended) return;

          if (!sendCallEvent("call:ice-candidate", {
            callId: this.options.callId,
            candidate,
          })) {
            this.end("disconnected", false);
          }
        },
        onConnectionState: (state) => {
          if (this.ended) return;

          if (state !== "disconnected" && this.disconnectTimer !== null) {
            clearTimeout(this.disconnectTimer);
            this.disconnectTimer = null;
          }

          if (state === "disconnected" && this.disconnectTimer === null) {
            this.disconnectTimer = setTimeout(() => {
              this.end("connection-failed");
            }, 10000);
          }

          if (state === "connected") this.reportConnected();
          if (state === "failed") this.end("connection-failed");
        },
      });

      this.signals = createRemoteSignalQueue(this.peer);
      this.options.onLocalStream(stream);
    } catch (error) {
      this.end("media-error");
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
    if (this.ended) return;

    for (const track of this.localStream?.getVideoTracks() ?? []) {
      track.enabled = enabled;
    }
  }

  end(reason = "ended", notifyPeer = true): void {
    if (this.ended) return;
    this.ended = true;

    if (this.disconnectTimer !== null) {
      clearTimeout(this.disconnectTimer);
      this.disconnectTimer = null;
    }

    for (const unsubscribe of this.listeners) unsubscribe();
    this.listeners = [];

    this.peer?.close();
    this.peer = null;
    this.signals = null;

    stopCallMedia(this.localStream);
    this.localStream = null;

    if (notifyPeer) {
      sendCallEvent("call:end", { callId: this.options.callId });
    }

    this.options.onEnd(reason);
  }
}