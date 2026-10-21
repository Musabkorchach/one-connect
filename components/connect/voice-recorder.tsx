"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { IconMic, IconSend } from "./icons";

type Phase =
  | "idle"
  | "requesting"
  | "recording"
  | "processing"
  | "preview"
  | "sending";

export function VoiceRecorder({
  disabled = false,
  onSend,
}: {
  disabled?: boolean;
  onSend: (file: File) => Promise<boolean>;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [seconds, setSeconds] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState("");

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const urlRef = useRef<string | null>(null);
  const generationRef = useRef(0);

  const release = useCallback(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    const recorder = recorderRef.current;
    recorderRef.current = null;

    if (recorder) {
      recorder.ondataavailable = null;
      recorder.onstop = null;
      recorder.onerror = null;
      if (recorder.state !== "inactive") recorder.stop();
    }

    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") return;

    setPhase("processing");
    recorder.stop();

    streamRef.current?.getTracks().forEach((track) => track.stop());

    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible") stopRecording();
    };

    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      generationRef.current++;
      release();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [release, stopRecording]);

  const reset = () => {
    generationRef.current++;
    release();

    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }

    setFile(null);
    setPreviewUrl(null);
    setSeconds(0);
    setPhase("idle");
  };

  const startRecording = async () => {
    if (disabled || phase !== "idle") return;

    const generation = ++generationRef.current;
    setError("");
    setPhase("requesting");

    try {
      if (
        typeof MediaRecorder === "undefined" ||
        !navigator.mediaDevices?.getUserMedia
      ) {
        throw new Error("Microphone recording is unavailable in this browser.");
      }

      const mimeType = [
        "audio/mp4",
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/ogg;codecs=opus",
        "audio/ogg",
      ].find((type) => MediaRecorder.isTypeSupported(type));

      if (!mimeType) {
        throw new Error("No supported audio recording format was found.");
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });

      if (
        generation !== generationRef.current ||
        document.visibilityState !== "visible"
    ) {
      stream.getTracks().forEach((track) => track.stop());

      if (generation === generationRef.current) {
        setPhase("idle");
      }

      return;
  }

      streamRef.current = stream;

      const recorder = new MediaRecorder(stream, {
        mimeType,
        audioBitsPerSecond: 64_000,
      });
      recorderRef.current = recorder;

      const chunks: Blob[] = [];
      let bytes = 0;
      let oversized = false;

      recorder.ondataavailable = (event) => {
        if (generation !== generationRef.current || !event.data.size) return;

        bytes += event.data.size;
        if (bytes > 5 * 1024 * 1024) {
          oversized = true;
          stopRecording();
          return;
        }

        chunks.push(event.data);
      };

      recorder.onerror = () => {
        if (generation !== generationRef.current) return;
        release();
        setError("Recording failed. Please try again.");
        setPhase("idle");
      };

      recorder.onstop = () => {
        if (generation !== generationRef.current) return;

        const type = (recorder.mimeType || mimeType)
          .split(";")[0]
          .trim()
          .toLowerCase();

        release();

        if (oversized || bytes === 0) {
          setError(
            oversized
              ? "Recording exceeded 5 MB. Please record a shorter message."
              : "No audio was recorded. Please try again.",
          );
          setPhase("idle");
          return;
        }

        const extension =
          type === "audio/mp4" ? "m4a" : type === "audio/ogg" ? "ogg" : "webm";
        const recording = new File(
          chunks,
          `voice-${Date.now()}.${extension}`,
          { type },
        );

        const url = URL.createObjectURL(recording);
        urlRef.current = url;
        setFile(recording);
        setPreviewUrl(url);
        setPhase("preview");
      };

      recorder.start(1000);
      const startedAt = Date.now();
      setSeconds(0);
      setPhase("recording");

      timerRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startedAt) / 1000);
        setSeconds(Math.min(elapsed, 120));
        if (elapsed >= 120) stopRecording();
      }, 250);
    } catch (error) {
      if (generation !== generationRef.current) return;

      release();
      setPhase("idle");
      setError(
        error instanceof Error && error.name === "NotAllowedError"
          ? "Microphone access was denied or blocked. Check Pi Browser permissions."
          : error instanceof Error
            ? error.message
            : "Could not start recording.",
      );
    }
  };

  const sendRecording = async () => {
    if (!file || disabled || phase !== "preview") return;

    const generation = generationRef.current;
    setPhase("sending");
    setError("");

    try {
      const sent = await onSend(file);
      if (generation !== generationRef.current) return;

      if (sent) reset();
      else setPhase("preview");
    } catch {
      if (generation !== generationRef.current) return;
      setError("Could not send the recording. You can try again.");
      setPhase("preview");
    }
  };

  return (
    <div className="flex flex-col gap-3 pb-2">
      <p role="status" className="text-center text-sm text-muted-foreground">
        {phase === "idle"
          ? "Record a voice message · up to 2 minutes"
          : phase === "requesting"
            ? "Waiting for microphone permission…"
            : phase === "recording"
              ? `Recording ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
              : phase === "processing"
                ? "Preparing recording…"
                : phase === "sending"
                  ? "Uploading voice message…"
                  : "Listen before sending"}
      </p>

      {previewUrl && (
        <audio src={previewUrl} controls className="w-full" />
      )}

      {phase === "idle" && (
        <button
          type="button"
          disabled={disabled}
          onClick={() => void startRecording()}
          className="pc-press flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-primary-foreground disabled:opacity-50"
        >
          <IconMic className="h-5 w-5" />
          Start recording
        </button>
      )}

      {phase === "recording" && (
        <button
          type="button"
          onClick={stopRecording}
          className="pc-press rounded-xl bg-red-500/15 px-4 py-3 font-semibold text-red-400"
        >
          Stop recording
        </button>
      )}

      {phase === "preview" && (
        <button
          type="button"
          disabled={disabled}
          onClick={() => void sendRecording()}
          className="pc-press flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-primary-foreground disabled:opacity-50"
        >
          <IconSend className="h-5 w-5" />
          Send voice message
        </button>
      )}

      {phase !== "idle" && (
        <button
          type="button"
          disabled={disabled || phase === "sending"}
          onClick={reset}
          className="pc-press rounded-xl border border-border px-4 py-2 text-sm disabled:opacity-50"
        >
          Discard recording
        </button>
      )}

      {error && (
        <p role="alert" className="text-center text-sm text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}