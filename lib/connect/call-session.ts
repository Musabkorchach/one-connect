import {
  getCallConfiguration,
  onCallEvent,
  sendCallEvent,
  VERIFIED_CALL_PROTOCOL,
} from "@/lib/api-client";
import {
  openCallMedia,
  openCallCamera,
  stopCallMedia,
  createCallPeer,
  createRemoteSignalQueue,
} from "./call-media";
import {
  getCallDevice,
  CallKeyError,
  getCallPin,
  newCallChallenge,
  signCallDescription,
  verifyCallDescription,
  type CallBinding,
  type SignedCallDescription,
} from "./call-identity";

export interface CallSessionOptions {
  callId: string;
  username: string;
  ownUsername: string;
  kind: "voice" | "video";
  direction: "incoming" | "outgoing";
  configuration: RTCConfiguration;
  relayOnly?: boolean;
  onLocalStream: (stream: MediaStream) => void;
  onRemoteStream: (stream: MediaStream) => void;
  onConnecting: () => void;
  onRinging: () => void;
  onConnected: () => void;
  onEnd: (reason: string) => void;
}

export class CallSession {
  private ended = false;
  private started = false;
  private cameraFacingMode: "user" | "environment" = "user";
  private cameraSwitching = false;
  private disconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private protocolTimer: ReturnType<typeof setTimeout> | null = null;
  private protocolConfirmed = false;
  private negotiated = false;
  private challenge = "";
  private device: CryptoKeyPair | null = null;
  private pin: string | null = null;
  private descriptionReceived = false;
  private openingMedia = false;
  private mediaReady = false;
  private pendingRemoteStream: MediaStream | null = null;
  private pendingSenders: { sender: RTCRtpSender; track: MediaStreamTrack }[] = [];
  private localStream: MediaStream | null = null;
  private peer: RTCPeerConnection | null = null;
  private signals: ReturnType<typeof createRemoteSignalQueue> | null = null;
  private listeners: Array<() => void> = [];

    constructor(private readonly options: CallSessionOptions) {
    this.listeners.push(
      onCallEvent("call:initiated", (data) => {
        if (this.ended || !this.protocolTimer || data?.callId !== this.options.callId) return;
        clearTimeout(this.protocolTimer);
        this.protocolTimer = null;
        if (data.protocol !== VERIFIED_CALL_PROTOCOL) {
          this.end("call-update-required");
          return;
        }
        this.protocolConfirmed = true;
        this.options.onRinging();
      }),
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
          if (!this.protocolConfirmed) {
            this.end("call-update-required");
            return;
          }
          if (this.challenge || typeof data.challenge !== "string" || !/^[a-f0-9]{32}$/.test(data.challenge)) {
            this.end("verification-failed");
            return;
          }
          this.challenge = data.challenge;
          void this.prepareOutgoing().catch(() => {
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
          this.end("verification-failed");
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
          this.end("verification-failed");
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
          !this.mediaReady ||
          this.peer?.connectionState !== "connected"
        ) {
          return;
        }

        this.options.onConnected();
      }),
    );
  }

  private async prepareOutgoing() {
    const configuration = await getCallConfiguration();
    if (this.ended) return;
    await this.prepare(this.withRelayPolicy(configuration));
    if (!this.ended) await this.sendOffer();
  }

  private withRelayPolicy(configuration: RTCConfiguration): RTCConfiguration {
    return this.options.relayOnly ? { ...configuration, iceTransportPolicy: "relay" } : configuration;
  }

  async selectedIcePair() {
    const stats = await this.peer?.getStats();
    if (!stats) return null;
    for (const entry of stats.values()) {
      if (entry.type !== "transport" || !entry.selectedCandidatePairId) continue;
      const pair = stats.get(entry.selectedCandidatePairId);
      const local = stats.get(pair?.localCandidateId);
      const remote = stats.get(pair?.remoteCandidateId);
      return local && remote ? {
        local: local.candidateType, remote: remote.candidateType,
        protocol: local.relayProtocol ?? local.protocol,
      } : null;
    }
    return null;
  }

  private binding(): CallBinding {
    const { callId, ownUsername, username, direction, kind } = this.options;
    return {
      callId, challenge: this.challenge, kind,
      caller: direction === "outgoing" ? ownUsername : username,
      recipient: direction === "outgoing" ? username : ownUsername,
    };
  }

  private async verify(description: SignedCallDescription, type: "offer" | "answer") {
    if (this.descriptionReceived || !this.pin) throw new Error("Unexpected call description.");
    this.descriptionReceived = true;
    return verifyCallDescription(description, this.binding(), type, this.pin);
  }

    private async sendOffer(): Promise<void> {
    const peer = this.peer;
    if (!peer || !this.device || this.ended) return;

    const offer = await peer.createOffer();
    if (this.ended) return;

    await peer.setLocalDescription(offer);
    if (this.ended) return;

    const signed = await signCallDescription(this.device, this.binding(), "offer", peer.localDescription?.sdp ?? "");
    if (this.ended) return;
    const sent = sendCallEvent("call:offer", { callId: this.options.callId, offer: signed });

    if (!sent) this.end("disconnected", false);
  }

    private async receiveOffer(
    offer: SignedCallDescription,
  ): Promise<void> {
    const peer = this.peer;
    const signals = this.signals;
    if (!peer || !signals || !this.device || this.ended) return;

    const verifiedOffer = await this.verify(offer, "offer");
    if (this.ended) return;
    await signals.setDescription(verifiedOffer);
    if (this.ended) return;

    this.pendingSenders = (this.localStream?.getTracks() ?? []).map((track) => {
      const transceiver = peer.getTransceivers().find(({ receiver }) => receiver.track.kind === track.kind);
      if (!transceiver) throw new Error("Required media was not offered.");
      transceiver.direction = "sendrecv";
      return { track, sender: transceiver.sender };
    });
    const answer = await peer.createAnswer();
    if (this.ended) return;

    await peer.setLocalDescription(answer);
    if (this.ended) return;

    const signed = await signCallDescription(this.device, this.binding(), "answer", peer.localDescription?.sdp ?? "");
    if (this.ended) return;
    const sent = sendCallEvent("call:answer", { callId: this.options.callId, answer: signed });

    if (!sent) {
      this.end("disconnected", false);
      return;
    }

    this.negotiated = true;
    this.reportConnected();
  }

    private async receiveAnswer(
    answer: SignedCallDescription,
  ): Promise<void> {
    const signals = this.signals;
    if (!signals || this.ended) return;

    const verifiedAnswer = await this.verify(answer, "answer");
    if (this.ended) return;
    await signals.setDescription(verifiedAnswer);
    if (this.ended) return;

    this.negotiated = true;
    this.reportConnected();
  }

  private reportConnected(): void {
    if (
      this.ended || this.openingMedia || !this.negotiated ||
      this.peer?.connectionState !== "connected"
    ) {
      return;
    }
    this.openingMedia = true;
    void this.publishMedia().catch(() => this.end("verification-failed"));
  }

  private async publishMedia() {
    if (getCallPin(this.options.ownUsername, this.options.username) !== this.pin) {
      throw new Error("Call trust changed during negotiation.");
    }
    await Promise.all(this.pendingSenders.map(({ sender, track }) => sender.replaceTrack(track)));
    if (this.ended) return;
    this.mediaReady = true;
    if (this.pendingRemoteStream) this.options.onRemoteStream(this.pendingRemoteStream);
    if (!sendCallEvent("call:connected", { callId: this.options.callId })) this.end("disconnected", false);
  }

  async start(): Promise<void> {
    if (this.started || this.ended) return;
    this.started = true;

    let failureReason = "verification-failed";

    try {
      try {
        this.pin = getCallPin(this.options.ownUsername, this.options.username);
      } catch {
        throw new CallKeyError("call-storage-unavailable");
      }
      if (!this.pin) throw new Error("Verify the peer safety code before calling.");
      this.device = await getCallDevice(this.options.ownUsername);
      if (this.ended) return;
      if (this.options.direction === "outgoing") {
        this.protocolTimer = setTimeout(() => this.end("call-update-required"), 5000);
        if (!sendCallEvent("call:verified-initiate", {
          callId: this.options.callId, to: this.options.username, kind: this.options.kind,
          protocol: VERIFIED_CALL_PROTOCOL,
        })) this.end("disconnected", false);
        return;
      }
      this.challenge = newCallChallenge();
      failureReason = "configuration-error";
      const configuration = await getCallConfiguration();
      if (this.ended) return;

      failureReason = "media-error";
      await this.prepare(this.withRelayPolicy(configuration));
      if (this.ended) return;

      const sent = sendCallEvent("call:accept", {
        callId: this.options.callId,
        challenge: this.challenge,
      });

      if (!sent) {
        this.end("disconnected", false);
      }
    } catch (error) {
      this.end(error instanceof CallKeyError ? error.reason : failureReason);
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
          if (this.ended) return;
          this.pendingRemoteStream = remoteStream;
          if (this.mediaReady) this.options.onRemoteStream(remoteStream);
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
      }, (peer, stream) => {
        // Reserve send/receive sections without attaching microphone or camera tracks.
        if (this.options.direction === "outgoing") {
          this.pendingSenders = stream.getTracks().map((track) => ({
            track,
            sender: peer.addTransceiver(track.kind, { direction: "sendrecv" }).sender,
          }));
        }
      });

      this.signals = createRemoteSignalQueue(this.peer);
      this.options.onLocalStream(stream);
    } catch (error) {
      this.end("media-error");
      throw error;
    }
  }

    async switchCamera(): Promise<"user" | "environment"> {
    const peer = this.peer;
    const stream = this.localStream;
    const oldTrack = stream?.getVideoTracks()[0];
    const sender = peer?.getSenders().find(
      (item) => item.track?.kind === "video",
    );

    if (
      this.ended ||
      this.options.kind !== "video" ||
      !peer ||
      !stream ||
      !oldTrack ||
      !sender ||
      this.cameraSwitching
    ) {
      throw new Error("Camera switching is unavailable.");
    }

    this.cameraSwitching = true;

    const previousMode = this.cameraFacingMode;
    const nextMode =
      previousMode === "user" ? "environment" : "user";

    const installCamera = async (
      mode: "user" | "environment",
    ): Promise<void> => {
      const cameraStream = await openCallCamera(mode);
      let installed = false;

      try {
        const track = cameraStream.getVideoTracks()[0];

        if (!track || this.ended || this.peer !== peer) {
          throw new Error("Camera switching was interrupted.");
        }

        track.enabled = oldTrack.enabled;
        await sender.replaceTrack(track);

        if (this.ended || this.peer !== peer) {
          throw new Error("Call has ended.");
        }

        track.enabled = oldTrack.enabled;

        const updatedStream = new MediaStream([
          ...stream.getAudioTracks(),
          track,
        ]);

        this.localStream = updatedStream;
        this.cameraFacingMode = mode;
        installed = true;
        this.options.onLocalStream(updatedStream);
      } finally {
        if (!installed) stopCallMedia(cameraStream);
      }
    };

    try {
      oldTrack.stop();

      try {
        await installCamera(nextMode);
      } catch (error) {
        if (!this.ended && this.peer === peer) {
          try {
            await installCamera(previousMode);
          } catch {
            // Keep the audio call running if camera recovery fails.
          }
        }

        throw error;
      }

      return this.cameraFacingMode;
    } finally {
      this.cameraSwitching = false;
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
    if (this.protocolTimer !== null) clearTimeout(this.protocolTimer);
    this.protocolTimer = null;

    if (this.disconnectTimer !== null) {
      clearTimeout(this.disconnectTimer);
      this.disconnectTimer = null;
    }

    for (const unsubscribe of this.listeners) unsubscribe();
    this.listeners = [];

    this.peer?.close();
    this.peer = null;
    this.signals = null;
    this.pendingSenders = [];
    this.pendingRemoteStream = null;
    this.device = null;

    stopCallMedia(this.localStream);
    this.localStream = null;

    if (notifyPeer) {
      sendCallEvent("call:end", { callId: this.options.callId });
    }

    this.options.onEnd(reason);
  }
}
