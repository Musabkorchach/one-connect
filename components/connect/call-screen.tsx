"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useConnect } from "@/contexts/connect-context";
import { Avatar, cx } from "./ui";
import {
  IconMic,
  IconMicOff,
  IconSpeaker,
  IconVideo,
  IconVideoOff,
  IconSwitchCam,
  IconHangup,
} from "./icons";
import { formatDuration } from "@/lib/connect/data";

export interface ActiveCall {
  username: string;
  name: string;
  color: number;
  kind: "voice" | "video";
}

type Phase = "ringing" | "connecting" | "active";

export function CallScreen({ call, onEnd }: { call: ActiveCall; onEnd: () => void }) {
  const { t, logCall } = useConnect();
  const [phase, setPhase] = useState<Phase>("ringing");
  const [seconds, setSeconds] = useState(0);
  const [muted, setMuted] = useState(false);
  const [speaker, setSpeaker] = useState(call.kind === "video");
  const [videoOn, setVideoOn] = useState(call.kind === "video");
  const [frontCam, setFrontCam] = useState(true);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const endedRef = useRef(false);

  // phase progression
  useEffect(() => {
    const r = setTimeout(() => setPhase("connecting"), 1400);
    const c = setTimeout(() => setPhase("active"), 2600);
    return () => {
      clearTimeout(r);
      clearTimeout(c);
    };
  }, []);

  // timer while active
  useEffect(() => {
    if (phase !== "active") return;
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [phase]);

  const end = () => {
    if (endedRef.current) return;
    endedRef.current = true;
    logCall(call.username, call.name, call.color, call.kind, "outgoing", seconds);
    onEnd();
  };

  const statusText =
    phase === "ringing" ? t.ringing : phase === "connecting" ? t.connecting : formatDuration(seconds);

  return (
    <div className="fixed inset-0 z-[90] flex flex-col overflow-hidden bg-[#0b0410]">
      {/* video background */}
      {videoOn ? (
        <div
          className={cx(
            "absolute inset-0",
            frontCam
              ? "bg-[radial-gradient(circle_at_30%_20%,oklch(0.35_0.12_300),transparent_60%),radial-gradient(circle_at_70%_80%,oklch(0.35_0.1_190),transparent_55%)]"
              : "bg-[radial-gradient(circle_at_60%_30%,oklch(0.34_0.09_85),transparent_60%),radial-gradient(circle_at_30%_75%,oklch(0.3_0.12_300),transparent_55%)]",
          )}
        />
      ) : (
        <div className="pc-aurora absolute inset-0" />
      )}
      <div className="absolute inset-0 bg-black/30" />

      {/* self preview */}
      {videoOn && (
        <div className="pc-fade-in absolute right-4 top-24 z-10 h-40 w-28 overflow-hidden rounded-2xl border border-white/20 bg-[radial-gradient(circle_at_50%_30%,oklch(0.4_0.1_300),oklch(0.2_0.05_300))] shadow-xl">
          <div className="flex h-full items-end justify-center pb-2">
            <span className="text-[10px] text-white/70">{frontCam ? t.camera : `${t.camera} ↺`}</span>
          </div>
        </div>
      )}

      {/* caller info */}
      <div className="relative z-[5] flex flex-1 flex-col items-center justify-center px-6 text-center">
        <div className={cx(phase !== "active" && "pc-call-pulse")}>
          <Avatar name={call.name} color={call.color} size={128} />
        </div>
        <h2 className="mt-6 text-2xl font-bold text-white">{call.name}</h2>
        <p className="mt-1 text-sm text-white/70">@{call.username}</p>
        <div className="mt-3 flex items-center gap-2">
          <span className="rounded-full bg-white/10 px-3 py-1 text-sm font-medium text-white pc-nums">
            {statusText}
          </span>
          <span className="rounded-full bg-turquoise/20 px-2.5 py-1 text-xs font-medium text-turquoise">
            {call.kind === "video" ? t.videoCall : t.voiceCall}
          </span>
        </div>
        {phase !== "active" && (
          <div className="mt-4 text-center">
            <p className="text-xs text-white/60">WebRTC Configuration</p>
            <p className="mt-1 text-[11px] text-white/40 font-mono">STUN: stun.l.google.com:19302</p>
            <p className="text-[11px] text-white/40 font-mono">TURN: user-configurable</p>
          </div>
        )}
      </div>

      {/* controls */}
      <div className="relative z-[5] pc-safe-bottom px-6 pb-8">
        <div className="mx-auto flex max-w-xs items-center justify-center gap-4">
          <CallCtl
            active={muted}
            onClick={() => setMuted((m) => !m)}
            label={muted ? t.unmute : t.mute}
            icon={muted ? <IconMicOff className="h-6 w-6" /> : <IconMic className="h-6 w-6" />}
          />
          <CallCtl
            active={speaker}
            onClick={() => setSpeaker((s) => !s)}
            label={t.speaker}
            icon={<IconSpeaker className="h-6 w-6" />}
          />
          {call.kind === "video" ? (
            <CallCtl
              active={!videoOn}
              onClick={() => setVideoOn((v) => !v)}
              label={t.camera}
              icon={videoOn ? <IconVideo className="h-6 w-6" /> : <IconVideoOff className="h-6 w-6" />}
            />
          ) : (
            <CallCtl active={false} onClick={() => {}} label={t.camera} icon={<IconVideoOff className="h-6 w-6" />} disabled />
          )}
          {call.kind === "video" && (
            <CallCtl
              active={false}
              onClick={() => setFrontCam((f) => !f)}
              label={t.switchCamera}
              icon={<IconSwitchCam className="h-6 w-6" />}
              disabled={!videoOn}
            />
          )}
        </div>
        {permissionError && (
          <div className="mt-4 rounded-xl bg-destructive/15 px-4 py-3 text-center">
            <p className="text-sm text-destructive">{permissionError}</p>
            <p className="mt-1 text-xs text-destructive/70">Check your device settings and permissions</p>
          </div>
        )}
        <div className="mt-6 flex justify-center">
          <button
            onClick={end}
            className="pc-press flex h-16 w-16 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow-lg"
            aria-label={t.endCall}
          >
            <IconHangup className="h-7 w-7" />
          </button>
        </div>
      </div>
    </div>
  );
}

function CallCtl({
  active,
  onClick,
  label,
  icon,
  disabled,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={cx(
        "pc-press flex h-14 w-14 items-center justify-center rounded-full backdrop-blur transition-colors disabled:opacity-30",
        active ? "bg-white text-[#0b0410]" : "bg-white/15 text-white",
      )}
    >
      {icon}
    </button>
  );
}
