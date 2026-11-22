// A short, silent PCM WAV lets the eventual playback element receive the
// browser's user activation even before a remote track exists.
const silence = "data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQIAAACAgA==";

export function createRemoteCallAudio(onBlocked: (blocked: boolean) => void) {
  const element = new Audio();
  let stream: MediaStream | null = null;
  let pendingStream: MediaStream | null = null;
  let disposed = false;
  let blocked = false;
  const tracks = new Set<MediaStreamTrack>();

  const setBlocked = (value: boolean) => {
    if (disposed || blocked === value) return;
    blocked = value;
    onBlocked(value);
  };

  const play = async (retry = false) => {
    const source = stream;
    if (disposed || !source?.getAudioTracks().length || pendingStream === source) return;
    if (!retry && !element.paused) return;

    pendingStream = source;
    try {
      await element.play();
      if (stream === source) setBlocked(false);
    } catch (error) {
      if (stream === source && (error as Error)?.name !== "AbortError") setBlocked(true);
    } finally {
      if (pendingStream === source) pendingStream = null;
    }
  };

  const attempt = () => void play();
  const onPlaying = () => {
    if (stream) setBlocked(false);
  };
  const watchTracks = () => {
    for (const track of stream?.getAudioTracks() ?? []) {
      if (tracks.has(track)) continue;
      tracks.add(track);
      track.addEventListener("unmute", attempt);
    }
    attempt();
  };

  const detach = () => {
    stream?.removeEventListener("addtrack", watchTracks);
    for (const track of tracks) track.removeEventListener("unmute", attempt);
    tracks.clear();
  };

  element.preload = "auto";
  element.muted = false;
  element.src = silence;
  void element.play().catch(() => {
    // Report playback failures only when there is real remote audio.
  });
  element.addEventListener("canplay", attempt);
  element.addEventListener("playing", onPlaying);

  return {
    element,
    attach(next: MediaStream) {
      if (disposed || stream === next) return;
      detach();
      element.pause();
      stream = next;
      element.removeAttribute("src");
      element.srcObject = next;
      stream.addEventListener("addtrack", watchTracks);
      watchTracks();
    },
    resume: () => play(true),
    close() {
      if (disposed) return;
      disposed = true;
      detach();
      stream = null;
      element.removeEventListener("canplay", attempt);
      element.removeEventListener("playing", onPlaying);
      element.pause();
      element.srcObject = null;
      element.removeAttribute("src");
      element.load();
    },
  };
}

export type RemoteCallAudio = ReturnType<typeof createRemoteCallAudio>;
