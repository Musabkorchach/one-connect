"use client";

import { useEffect, useRef, useState } from "react";
import { useConnect } from "@/contexts/connect-context";
import { usePiAuth } from "@/contexts/pi-auth-context";
import type { GroupCallViewState } from "@/lib/connect/use-group-call-controller";
import { formatDuration, hueFromString } from "@/lib/connect/data";
import { Avatar } from "./ui";
import { IconMic, IconPhone, IconVideo } from "./icons";

function ParticipantMedia({
  stream,
  kind,
  local,
}: {
  stream: MediaStream;
  kind: "voice" | "video";
  local: boolean;
}) {
  const { lang } = useConnect();
  const [blocked, setBlocked] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const element = kind === "video"
      ? videoRef.current
      : audioRef.current;

    if (!element) return;

    let active = true;
    element.muted = local;
    element.srcObject = stream;
    setBlocked(false);

    void element.play().catch(() => {
      if (active && !local) setBlocked(true);
    });

    return () => {
      active = false;
      element.pause();
      element.srcObject = null;
    };
  }, [stream, kind, local]);

  const resume = async () => {
    const element = kind === "video"
      ? videoRef.current
      : audioRef.current;

    try {
      await element?.play();
      setBlocked(false);
    } catch {
      setBlocked(true);
    }
  };

  return (
    <>
      {kind === "video" ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={local}
          className="h-full w-full rounded-2xl bg-black object-cover"
        />
      ) : (
        <audio ref={audioRef} autoPlay muted={local} />
      )}

      {blocked && (
        <button
          type="button"
          onClick={() => void resume()}
          className="absolute inset-x-2 bottom-12 rounded-xl bg-primary px-3 py-2 text-sm text-primary-foreground"
        >
          {lang === "ar" ? "اضغط لتشغيل الصوت" : "Tap to enable audio"}
        </button>
      )}
    </>
  );
}

export function GroupCallScreen({
  call,
  onAccept,
  onEnd,
  onMutedChange,
  onVideoEnabledChange,
}: {
  call: GroupCallViewState;
  onAccept: () => void;
  onEnd: () => void;
  onMutedChange: (muted: boolean) => void;
  onVideoEnabledChange: (enabled: boolean) => void;
}) {
  const { lang } = useConnect();
  const { piUsername } = usePiAuth();
  const arabic = lang === "ar";
  const me = (piUsername || "").replace(/^@+/, "").toLowerCase();
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (call.connectedAt === null) {
      setElapsed(0);
      return;
    }

    const startedAt = call.connectedAt;
    const update = () => {
      setElapsed(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    };

    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [call.connectedAt]);

  const incoming = call.phase === "incoming";
  const others = call.participants.filter((username) => username !== me);

  const status = incoming
    ? arabic ? "مكالمة جماعية واردة" : "Incoming group call"
    : call.phase === "preparing"
      ? arabic ? "جارٍ تجهيز الكاميرا والميكروفون…" : "Preparing media…"
      : call.phase === "ringing"
        ? arabic ? "جارٍ دعوة الأعضاء…" : "Calling group members…"
        : call.phase === "connecting"
          ? arabic ? "جارٍ الاتصال بالمشاركين…" : "Connecting participants…"
          : formatDuration(elapsed);

  const participantStatus = (
    state: "connecting" | "connected" | "failed" | undefined,
  ) => state === "connected"
    ? arabic ? "متصل" : "Connected"
    : state === "failed"
      ? arabic ? "تعذر الاتصال — غادر وانضم مجددًا" : "Connection failed"
      : arabic ? "جارٍ الاتصال…" : "Connecting…";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={call.groupName}
      className="fixed inset-0 z-[90] mx-auto flex max-w-md flex-col bg-background"
    >
      <header className="px-5 py-5 text-center">
        <h2 className="truncate text-xl font-bold">{call.groupName}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {call.kind === "video"
            ? arabic ? "مكالمة فيديو جماعية" : "Group video call"
            : arabic ? "مكالمة صوتية جماعية" : "Group voice call"}
        </p>
        <p role="status" className="mt-2 text-sm text-turquoise">
          {status}
        </p>
        {!incoming && (
          <p className="mt-1 text-xs text-muted-foreground">
            {call.participants.length} / {call.maxParticipants}
          </p>
        )}
      </header>

      {incoming ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6">
          <Avatar
            name={call.groupName}
            color={hueFromString(call.groupId)}
            size={88}
          />
          <p className="text-center text-sm text-muted-foreground">
            {arabic ? "دعوة من" : "Invitation from"}
          </p>
          <p dir="ltr" className="font-semibold">
            @{call.hostUsername}
          </p>
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-2 content-start gap-3 overflow-y-auto px-4 pb-4">
          <div className="relative flex h-48 flex-col items-center justify-center overflow-hidden rounded-2xl bg-card">
            {call.localStream && call.kind === "video" ? (
              <ParticipantMedia
                stream={call.localStream}
                kind="video"
                local
              />
            ) : (
              <Avatar name={me} color={hueFromString(me)} size={56} />
            )}

            <div className="absolute inset-x-0 bottom-0 bg-black/60 px-2 py-2 text-center text-xs text-white">
              {arabic ? "أنت" : "You"}
              {call.muted && (arabic ? " · مكتوم" : " · Muted")}
              {call.kind === "video" && !call.videoEnabled && (
                arabic ? " · الفيديو متوقف" : " · Video off"
              )}
            </div>
          </div>

          {others.map((username) => {
            const stream = call.remoteStreams[username];

            return (
              <div
                key={username}
                className="relative flex h-48 flex-col items-center justify-center overflow-hidden rounded-2xl bg-card"
              >
                {(!stream || call.kind === "voice") && (
                  <Avatar
                    name={username}
                    color={hueFromString(username)}
                    size={56}
                  />
                )}

                {stream && (
                  <ParticipantMedia
                    stream={stream}
                    kind={call.kind}
                    local={false}
                  />
                )}

                <div className="absolute inset-x-0 bottom-0 bg-black/60 px-2 py-2 text-center text-white">
                  <p dir="ltr" className="truncate text-xs font-semibold">
                    @{username}
                  </p>
                  <p className="mt-0.5 text-[10px]">
                    {participantStatus(call.peerStates[username])}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <footer className="flex flex-wrap justify-center gap-3 border-t border-border px-4 py-4 pc-safe-bottom">
        {incoming ? (
          <button
            type="button"
            onClick={onAccept}
            className="pc-press rounded-full bg-turquoise px-6 py-3 font-semibold text-turquoise-foreground"
          >
            {arabic ? "قبول" : "Accept"}
          </button>
        ) : (
          <>
            <button
              type="button"
              disabled={!call.localStream}
              onClick={() => onMutedChange(!call.muted)}
              className="pc-press flex items-center gap-2 rounded-full border border-border px-4 py-3 text-sm disabled:opacity-50"
            >
              <IconMic className="h-5 w-5" />
              {call.muted
                ? arabic ? "تشغيل الميكروفون" : "Unmute"
                : arabic ? "كتم" : "Mute"}
            </button>

            {call.kind === "video" && (
              <button
                type="button"
                disabled={!call.localStream}
                onClick={() => onVideoEnabledChange(!call.videoEnabled)}
                className="pc-press flex items-center gap-2 rounded-full border border-border px-4 py-3 text-sm disabled:opacity-50"
              >
                <IconVideo className="h-5 w-5" />
                {call.videoEnabled
                  ? arabic ? "إيقاف الفيديو" : "Video off"
                  : arabic ? "تشغيل الفيديو" : "Video on"}
              </button>
            )}
          </>
        )}

        <button
          type="button"
          onClick={onEnd}
          className="pc-press flex items-center gap-2 rounded-full bg-destructive px-5 py-3 font-semibold text-destructive-foreground"
        >
          <IconPhone className="h-5 w-5" />
          {incoming
            ? arabic ? "رفض" : "Decline"
            : arabic ? "مغادرة" : "Leave"}
        </button>
      </footer>
    </div>
  );
}