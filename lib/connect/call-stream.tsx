"use client";

import { useEffect, useRef, useState } from "react";

export function CallStream({
  stream,
  muted = false,
  className,
  playbackLabel,
}: {
  stream: MediaStream | null;
  muted?: boolean;
  className?: string;
  playbackLabel: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playbackBlocked, setPlaybackBlocked] = useState(false);

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
    </>
  );
}