"use client";

import { useEffect, useState } from "react";
import { Mic, MicOff, PhoneOff } from "lucide-react";
import type { PstnCallState } from "@/lib/connect/use-pstn-call-controller";

export function PstnCallScreen({
  call,
  onEnd,
  onMutedChange,
}: {
  call: PstnCallState;
  onEnd: () => void;
  onMutedChange: (muted: boolean) => void;
}) {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const connectedAt = call.connectedAt;

    if (connectedAt === null) {
      setSeconds(0);
      return;
    }

    const update = () => {
      setSeconds(Math.max(0, Math.floor((Date.now() - connectedAt) / 1000)));
    };

    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [call.connectedAt]);

  const status = {
    preparing: "Preparing call…",
    connecting: "Connecting…",
    ringing: "Ringing…",
    connected: "Connected",
  }[call.phase];

  const duration =
    `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="pstn-call-title"
      className="fixed inset-0 z-[70] flex flex-col items-center justify-center bg-background px-6 text-center"
    >
      <h2 id="pstn-call-title" className="text-xl font-semibold">
        Phone call
      </h2>

      <p dir="ltr" className="mt-6 text-3xl font-bold">
        {call.phone}
      </p>

      <p role="status" className="mt-4 text-muted-foreground">
        {status}
      </p>

      {call.connectedAt !== null && (
        <p dir="ltr" className="mt-2 text-xl tabular-nums">
          {duration}
        </p>
      )}

      <p className="mt-4 text-sm text-muted-foreground">
        Test call · Maximum 2 minutes
      </p>

      {call.phase === "connected" && (
        <div className="mt-6 w-full max-w-xs space-y-4 text-start" dir="rtl">
          <p className="text-sm font-semibold">فحص الصوت</p>

          <div>
            <p className="mb-1 text-xs text-muted-foreground">
              الميكروفون — صوتك
              {" · "}
              {call.inputVolume === undefined
                ? "بانتظار القياس"
                : `${Math.round(call.inputVolume * 100)}%`}
            </p>
            <progress
              aria-label="مستوى صوت الميكروفون"
              max={1}
              value={call.inputVolume ?? 0}
              className="h-3 w-full accent-teal-400"
            />
          </div>

          <div>
            <p className="mb-1 text-xs text-muted-foreground">
              الصوت المستقبَل — الطرف الآخر
              {" · "}
              {call.outputVolume === undefined
                ? "بانتظار القياس"
                : `${Math.round(call.outputVolume * 100)}%`}
            </p>
            <progress
              aria-label="مستوى الصوت المستقبَل"
              max={1}
              value={call.outputVolume ?? 0}
              className="h-3 w-full accent-teal-400"
            />
          </div>
         </div>
       )}
      <div className="mt-12 flex items-center justify-center gap-8">
        <button
          type="button"
          disabled={call.phase !== "connected"}
          onClick={() => onMutedChange(!call.muted)}
          aria-label={call.muted ? "Unmute microphone" : "Mute microphone"}
          aria-pressed={call.muted}
          className="pc-press flex h-16 w-16 items-center justify-center rounded-full border border-border bg-card disabled:opacity-40"
        >
          {call.muted
            ? <MicOff className="h-6 w-6" />
            : <Mic className="h-6 w-6" />}
        </button>

        <button
          type="button"
          onClick={onEnd}
          aria-label="End phone call"
          className="pc-press flex h-16 w-16 items-center justify-center rounded-full bg-destructive text-destructive-foreground"
        >
          <PhoneOff className="h-6 w-6" />
        </button>
      </div>
    </div>
  );
}