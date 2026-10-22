"use client";

import { useEffect, useState } from "react";
import { useConnect } from "@/contexts/connect-context";
import type { CallViewState } from "@/lib/connect/use-call-controller";
import { formatDuration } from "@/lib/connect/data";
import { Avatar } from "@/components/connect/ui";
import { CallStream } from "./call-stream";
import {
  IconMic,
  IconMicOff,
  IconVideo,
  IconVideoOff,
  IconHangup,
} from "@/components/connect/icons";

export function LiveCallScreen({
  call,
  onAccept,
  onEnd,
  onMutedChange,
  onVideoEnabledChange,
}: {
  call: CallViewState;
  onAccept: () => void;
  onEnd: () => void;
  onMutedChange: (muted: boolean) => void;
  onVideoEnabledChange: (enabled: boolean) => void;
}) {
  const { t } = useConnect();
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const startedAt = call.connectedAt;

    if (startedAt === null) {
      setSeconds(0);
      return;
    }

    const update = () => {
      setSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    };

    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [call.connectedAt]);

  const incoming = call.phase === "incoming";
  const hasVideo = call.kind === "video" && call.remoteStream !== null;
  const controlsReady =
    call.localStream !== null && call.phase !== "preparing";

  const status =
    call.phase === "active"
      ? formatDuration(seconds)
      : incoming
        ? t.incoming
        : call.phase === "ringing"
          ? t.ringing
          : t.connecting;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={call.kind === "video" ? t.videoCall : t.voiceCall}
      className="fixed inset-0 z-[90] flex flex-col overflow-hidden bg-[#0b0410]"
    >
      <div className="pc-aurora absolute inset-0" />

      <CallStream
        stream={call.remoteStream}
        playbackLabel={t.unmute}
        className={
          hasVideo
            ? "absolute inset-0 h-full w-full object-cover"
            : "sr-only"
        }
      />

      <div className="pointer-events-none absolute inset-0 bg-black/30" />

      {call.kind === "video" && call.videoEnabled && call.localStream && (
        <div className="absolute right-4 top-24 z-10 h-40 w-28 overflow-hidden rounded-2xl border border-white/20 bg-black shadow-xl">
          <CallStream
            stream={call.localStream}
            muted
            playbackLabel={t.camera}
            className="h-full w-full -scale-x-100 object-cover"
          />
        </div>
      )}

      <div className="relative z-[5] flex flex-1 flex-col items-center justify-center px-6 text-center">
        {!hasVideo && (
          <Avatar name={call.name} color={call.color} size={128} />
        )}

        <h2 className="mt-6 text-2xl font-bold text-white">{call.name}</h2>
        <p className="mt-1 text-sm text-white/70">@{call.username}</p>

        <p className="pc-nums mt-3 rounded-full bg-black/40 px-4 py-2 text-sm text-white">
          {status}
        </p>

        <p className="mt-2 text-xs text-white/70">
          {call.kind === "video" ? t.videoCall : t.voiceCall}
        </p>
      </div>

      <div className="pc-safe-bottom relative z-[5] px-6 pb-8">
        {!incoming && (
          <div className="mb-6 flex justify-center gap-4">
            <button
              type="button"
              disabled={!controlsReady}
              onClick={() => onMutedChange(!call.muted)}
              aria-label={call.muted ? t.unmute : t.mute}
              aria-pressed={call.muted}
              className="flex h-14 w-14 items-center justify-center rounded-full bg-white/20 text-white disabled:opacity-30"
            >
              {call.muted ? (
                <IconMicOff className="h-6 w-6" />
              ) : (
                <IconMic className="h-6 w-6" />
              )}
            </button>

            {call.kind === "video" && (
              <button
                type="button"
                disabled={!controlsReady}
                onClick={() => onVideoEnabledChange(!call.videoEnabled)}
                aria-label={t.camera}
                aria-pressed={call.videoEnabled}
                className="flex h-14 w-14 items-center justify-center rounded-full bg-white/20 text-white disabled:opacity-30"
              >
                {call.videoEnabled ? (
                  <IconVideo className="h-6 w-6" />
                ) : (
                  <IconVideoOff className="h-6 w-6" />
                )}
              </button>
            )}
          </div>
        )}

        <div className="flex justify-center gap-6">
          {incoming && (
            <button
              type="button"
              onClick={onAccept}
              className="rounded-full bg-green-600 px-6 py-4 font-semibold text-white"
            >
              {t.accept}
            </button>
          )}

          <button
            type="button"
            onClick={onEnd}
            className="flex items-center gap-2 rounded-full bg-destructive px-6 py-4 font-semibold text-destructive-foreground"
          >
            <IconHangup className="h-6 w-6" />
            {incoming ? t.decline : t.endCall}
          </button>
        </div>
      </div>
    </div>
  );
}