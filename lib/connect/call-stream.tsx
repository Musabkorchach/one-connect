"use client";

import { useEffect, useRef, useState } from "react";
import {
  getCallAudioOutputs,
  setCallAudioOutput,
} from "./call-audio-output";

export function CallStream({
  stream,
  muted = false,
  className,
  playbackLabel,
  outputLabel,
}: {
  stream: MediaStream | null;
  muted?: boolean;
  className?: string;
  playbackLabel: string;
  outputLabel?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playbackBlocked, setPlaybackBlocked] = useState(false);
  const [outputs, setOutputs] = useState<MediaDeviceInfo[]>([]);
  const [outputBusy, setOutputBusy] = useState(false);
  const [outputMessage, setOutputMessage] = useState<string | null>(null);

  const applyOutput = async (device: MediaDeviceInfo): Promise<void> => {
    const element = videoRef.current;
    if (!element) return;

    setOutputBusy(true);

    try {
      await setCallAudioOutput(element, device.deviceId);
      if (videoRef.current !== element) return;

      setOutputs([]);
      setOutputMessage(device.label || "Selected audio output");
    } catch {
      if (videoRef.current === element) {
        setOutputMessage("Unable to change the audio output.");
      }
    } finally {
      if (videoRef.current === element) setOutputBusy(false);
    }
  };

  const chooseOutput = async (): Promise<void> => {
    const element = videoRef.current;
    if (!element || outputBusy) return;

    if (outputs.length > 0) {
      setOutputs([]);
      return;
    }

    setOutputBusy(true);
    setOutputMessage(null);

    try {
      const available = await getCallAudioOutputs(element);
      if (videoRef.current !== element) return;

      if (available.length === 1) {
        await applyOutput(available[0]);
      } else {
        setOutputs(available);
      }
    } catch (error) {
      if (videoRef.current !== element) return;
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }

      setOutputMessage(
        error instanceof Error
          ? error.message
          : "Unable to select an audio output.",
      );
    } finally {
      if (videoRef.current === element) setOutputBusy(false);
    }
  };

  useEffect(() => {
    const element = videoRef.current;
    if (!element) return;

    let cancelled = false;
    element.srcObject = stream;
    setPlaybackBlocked(false);

    if (stream) {
      void element.play().catch(() => {
        if (!cancelled && !muted) {
          setPlaybackBlocked(true);
        }
      });
    }

    return () => {
      cancelled = true;
      element.pause();
      element.srcObject = null;
    };
  }, [stream, muted]);

  const resumePlayback = async () => {
    try {
      await videoRef.current?.play();
      setPlaybackBlocked(false);
    } catch {
      setPlaybackBlocked(true);
    }
  };

  return (
    <>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={muted}
        className={className}
        onPlaying={() => setPlaybackBlocked(false)}
      />

      {!muted && playbackBlocked && (
        <button
          type="button"
          onClick={() => void resumePlayback()}
          className="absolute left-4 top-6 z-20 rounded-full bg-white px-4 py-3 text-sm font-semibold text-black shadow-lg"
        >
          {playbackLabel}
        </button>
      )}
            {!muted && outputLabel && stream && (
        <div className="absolute right-4 top-16 z-20 max-w-64">
          <button
            type="button"
            disabled={outputBusy}
            onClick={() => void chooseOutput()}
            aria-expanded={outputs.length > 0}
            className="rounded-full bg-black/70 px-4 py-3 text-sm text-white disabled:opacity-50"
          >
            {outputLabel}
          </button>

          {outputs.length > 0 && (
            <div className="mt-2 overflow-hidden rounded-xl bg-black/90 p-2">
              {outputs.map((device, index) => (
                <button
                  key={device.deviceId}
                  type="button"
                  disabled={outputBusy}
                  onClick={() => void applyOutput(device)}
                  className="block w-full rounded-lg px-3 py-3 text-start text-sm text-white hover:bg-white/15 disabled:opacity-50"
                >
                  {device.label || `Audio output ${index + 1}`}
                </button>
              ))}
            </div>
          )}

          {outputMessage && (
            <p
              role="status"
              className="mt-2 rounded-xl bg-black/80 p-3 text-xs text-white"
            >
              {outputMessage}
            </p>
          )}
        </div>
      )}
    </>
  );
}