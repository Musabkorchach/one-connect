"use client";

import { useEffect, useRef } from "react";

export function CallStream({ stream, className }: {
  stream: MediaStream;
  className?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const element = videoRef.current;
    if (!element) return;

    element.srcObject = stream;
    void element.play().catch(() => {
      // Muted previews are also eligible for native autoplay when ready.
    });

    return () => {
      element.pause();
      element.srcObject = null;
    };
  }, [stream]);

  return <video ref={videoRef} autoPlay playsInline muted className={className} />;
}
