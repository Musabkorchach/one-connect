import {
  createCallPeer,
  createRemoteSignalQueue,
} from "./call-media";

interface GroupPeerSignal {
  description?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
}

interface GroupCallPeerOptions {
  stream: MediaStream;
  configuration: RTCConfiguration;
  initiator: boolean;
  sendSignal: (signal: GroupPeerSignal) => boolean;
  onRemoteStream: (stream: MediaStream) => void;
  onConnected: () => void;
  onFailed: (reason: string) => void;
}

export class GroupCallPeer {
  private closed = false;
  private started = false;
  private negotiated = false;
  private descriptionReceived = false;
  private reportedConnected = false;

  private disconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private work: Promise<void> = Promise.resolve();

  private readonly peer: RTCPeerConnection;
  private readonly signals: ReturnType<typeof createRemoteSignalQueue>;

  constructor(private readonly options: GroupCallPeerOptions) {
    this.peer = createCallPeer(options.stream, options.configuration, {
      onRemoteStream: (stream) => {
        if (!this.closed) options.onRemoteStream(stream);
      },

      onCandidate: (candidate) => {
        if (this.closed) return;

        if (!options.sendSignal({ candidate })) {
          this.fail("disconnected");
        }
      },

      onConnectionState: (state) => {
        if (this.closed) return;

        if (state !== "disconnected" && this.disconnectTimer !== null) {
          clearTimeout(this.disconnectTimer);
          this.disconnectTimer = null;
        }

        if (state === "disconnected" && this.disconnectTimer === null) {
          this.disconnectTimer = setTimeout(() => {
            this.fail("connection-failed");
          }, 10000);
        }

        if (state === "connected") this.reportConnected();
        if (state === "failed") this.fail("connection-failed");
      },
    });

    this.signals = createRemoteSignalQueue(this.peer);
  }

  private enqueue(operation: () => Promise<void>): void {
    const task = this.work.then(async () => {
      if (!this.closed) await operation();
    });

    this.work = task.catch(() => {
      this.fail("connection-failed");
    });
  }

  start(): void {
    if (this.closed || this.started) return;
    this.started = true;

    if (!this.options.initiator) return;

    this.enqueue(async () => {
      const offer = await this.peer.createOffer();
      if (this.closed) return;

      await this.peer.setLocalDescription(offer);
      if (this.closed) return;

      const sent = this.options.sendSignal({
        description: {
          type: "offer",
          sdp: this.peer.localDescription?.sdp ?? offer.sdp,
        },
      });

      if (!sent) this.fail("disconnected");
    });
  }

  receive(signal: GroupPeerSignal): void {
    if (this.closed) return;

    const hasDescription = signal.description !== undefined;
    const hasCandidate = signal.candidate !== undefined;

    if (hasDescription === hasCandidate) return;

    this.enqueue(async () => {
      if (signal.candidate) {
        await this.signals.addCandidate(signal.candidate);
        return;
      }

      const description = signal.description;
      if (!description || this.descriptionReceived) return;

      if (
        typeof description.sdp !== "string" ||
        !description.sdp.length ||
        description.sdp.length > 100000
      ) {
        throw new Error("Invalid description");
      }

      if (description.type === "offer") {
        if (this.options.initiator) {
          throw new Error("Unexpected offer");
        }

        this.descriptionReceived = true;
        await this.signals.setDescription(description);
        if (this.closed) return;

        const answer = await this.peer.createAnswer();
        if (this.closed) return;

        await this.peer.setLocalDescription(answer);
        if (this.closed) return;

        const sent = this.options.sendSignal({
          description: {
            type: "answer",
            sdp: this.peer.localDescription?.sdp ?? answer.sdp,
          },
        });

        if (!sent) {
          this.fail("disconnected");
          return;
        }
      } else if (description.type === "answer") {
        if (!this.options.initiator || !this.started) {
          throw new Error("Unexpected answer");
        }

        this.descriptionReceived = true;
        await this.signals.setDescription(description);
        if (this.closed) return;
      } else {
        throw new Error("Unsupported description");
      }

      this.negotiated = true;
      this.reportConnected();
    });
  }

  private reportConnected(): void {
    if (
      this.closed ||
      this.reportedConnected ||
      !this.negotiated ||
      this.peer.connectionState !== "connected"
    ) return;

    this.reportedConnected = true;
    this.options.onConnected();
  }

  async replaceVideoTrack(track: MediaStreamTrack): Promise<void> {
    if (this.closed || track.kind !== "video") {
      throw new Error("Video connection is unavailable");
    }

    const sender = this.peer.getSenders().find(
      (item) => item.track?.kind === "video",
    );

    if (!sender) throw new Error("Video sender is unavailable");

    await sender.replaceTrack(track);

    if (this.closed) {
      throw new Error("Connection has ended");
    }
  }

  private fail(reason: string): void {
    if (this.closed) return;
    this.close();
    this.options.onFailed(reason);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;

    if (this.disconnectTimer !== null) {
      clearTimeout(this.disconnectTimer);
      this.disconnectTimer = null;
    }

    this.peer.ontrack = null;
    this.peer.onicecandidate = null;
    this.peer.onconnectionstatechange = null;
    this.peer.close();
  }
}