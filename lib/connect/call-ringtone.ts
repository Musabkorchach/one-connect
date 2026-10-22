export function createCallRingtone(
  onReadyChange: (ready: boolean) => void,
) {
  let context: AudioContext | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let ringing = false;
  let disposed = false;

  const oscillators = new Set<OscillatorNode>();

  const silence = (): void => {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }

    for (const oscillator of oscillators) {
      try {
        oscillator.stop();
      } catch {
        // The oscillator may already have stopped.
      }
    }

    oscillators.clear();
  };

  const pulse = (): void => {
    if (!context || context.state !== "running" || !ringing) {
      return;
    }

    const audio = context;
    const now = audio.currentTime;

    for (const frequency of [440, 480]) {
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();

      oscillator.type = "sine";
      oscillator.frequency.value = frequency;

      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.06, now + 0.03);
      gain.gain.setValueAtTime(0.06, now + 0.9);
      gain.gain.linearRampToValueAtTime(0, now + 1);

      oscillator.connect(gain);
      gain.connect(audio.destination);

      oscillators.add(oscillator);

      oscillator.onended = () => {
        oscillators.delete(oscillator);
        oscillator.disconnect();
        gain.disconnect();
      };

      oscillator.start(now);
      oscillator.stop(now + 1.05);
    }
  };

  const begin = (): void => {
    if (
      disposed ||
      !ringing ||
      context?.state !== "running" ||
      timer !== null
    ) {
      return;
    }

    pulse();
    timer = setInterval(pulse, 3000);
  };

  return {
    async unlock(): Promise<void> {
      if (disposed) return;

      if (!context) {
        context = new AudioContext();

        context.onstatechange = () => {
          if (disposed) return;

          const ready = context?.state === "running";
          onReadyChange(ready);

          if (ready) {
            begin();
          } else {
            silence();
          }
        };
      }

      await context.resume();
      if (disposed) return;

      onReadyChange(context.state === "running");
      begin();
    },

    start(): void {
      if (disposed) return;

      ringing = true;
      onReadyChange(context?.state === "running");
      begin();
    },

    stop(): void {
      ringing = false;
      silence();
    },

    dispose(): void {
      disposed = true;
      ringing = false;
      silence();

      const audio = context;
      context = null;

      if (audio) {
        audio.onstatechange = null;
        void audio.close().catch(() => {});
      }
    },
  };
}