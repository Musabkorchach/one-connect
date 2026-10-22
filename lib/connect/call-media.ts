export async function openCallMedia(
  kind: "voice" | "video",
): Promise<MediaStream> {
  if (!window.isSecureContext) {
    throw new Error("Calls require a secure HTTPS connection.");
  }

  if (
    !navigator.mediaDevices?.getUserMedia ||
    typeof RTCPeerConnection === "undefined"
  ) {
    throw new Error("Calls are not supported in this browser.");
  }

  return navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
    video:
      kind === "video"
        ? {
            facingMode: "user",
            width: { ideal: 640 },
            height: { ideal: 480 },
          }
        : false,
  });
}

export function stopCallMedia(stream: MediaStream | null): void {
  stream?.getTracks().forEach((track) => track.stop());
}

export function createCallPeer(
  stream: MediaStream,
  configuration: RTCConfiguration,
  handlers: {
    onRemoteStream: (stream: MediaStream) => void;
    onCandidate: (candidate: RTCIceCandidateInit) => void;
    onConnectionState: (state: RTCPeerConnectionState) => void;
  },
): RTCPeerConnection {
  const peer = new RTCPeerConnection(configuration);
  const remoteStream = new MediaStream();

  peer.ontrack = (event) => {
    if (!remoteStream.getTracks().some((track) => track.id === event.track.id)) {
      remoteStream.addTrack(event.track);
    }

    handlers.onRemoteStream(remoteStream);
  };

  peer.onicecandidate = (event) => {
    if (event.candidate) {
      handlers.onCandidate(event.candidate.toJSON());
    }
  };

  peer.onconnectionstatechange = () => {
    handlers.onConnectionState(peer.connectionState);
  };

  try {
    for (const track of stream.getTracks()) {
      peer.addTrack(track, stream);
    }
  } catch (error) {
    peer.close();
    throw error;
  }

  return peer;
}

export function createRemoteSignalQueue(peer: RTCPeerConnection) {
  const pendingCandidates: RTCIceCandidateInit[] = [];
  let work: Promise<void> = Promise.resolve();

  const enqueue = (operation: () => Promise<void>): Promise<void> => {
    const task = work.then(operation);

    // Keep the queue usable; the caller handles the task's error.
    work = task.catch(() => {});
    return task;
  };

  return {
    addCandidate(candidate: RTCIceCandidateInit): Promise<void> {
      return enqueue(async () => {
        if (peer.signalingState === "closed") return;

        if (!peer.remoteDescription) {
          if (pendingCandidates.length >= 256) {
            throw new Error("Too many pending connection candidates.");
          }

          pendingCandidates.push(candidate);
          return;
        }

        await peer.addIceCandidate(candidate);
      });
    },

    setDescription(description: RTCSessionDescriptionInit): Promise<void> {
      return enqueue(async () => {
        if (peer.signalingState === "closed") return;

        await peer.setRemoteDescription(description);

        while (pendingCandidates.length > 0) {
          const candidate = pendingCandidates.shift()!;
          await peer.addIceCandidate(candidate);
        }
      });
    },
  };
}