"use client";

import { useRef, useState } from "react";
import { useConnect } from "@/contexts/connect-context";
import type { GroupMediaKind } from "@/lib/api-client";
import { Sheet } from "./feedback";
import { VoiceRecorder } from "./voice-recorder";
import {
  IconPlus,
  IconImage,
  IconFile,
  IconVideo,
  IconMic,
} from "./icons";

export function GroupAttachments({
  disabled,
  onSend,
}: {
  disabled: boolean;
  onSend: (kind: GroupMediaKind, file: File) => Promise<boolean>;
}) {
  const { lang } = useConnect();
  const arabic = lang === "ar";

  const [mode, setMode] = useState<"menu" | "voice" | null>(null);
  const [pending, setPending] = useState<{
    kind: GroupMediaKind;
    file: File;
  } | null>(null);
  const [failed, setFailed] = useState(false);

  const busyRef = useRef(false);
  const imageRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);

  const submit = async (kind: GroupMediaKind, file: File) => {
    if (disabled || busyRef.current) return false;

    busyRef.current = true;
    setPending({ kind, file });
    setFailed(false);

    try {
      const sent = await onSend(kind, file);

      if (sent) {
        setPending(null);
        setMode(null);
      } else {
        setFailed(true);
      }

      return sent;
    } catch {
      setFailed(true);
      return false;
    } finally {
      busyRef.current = false;
    }
  };

  const close = () => {
    if (disabled || busyRef.current) return;
    setMode(null);
  };

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setMode("menu")}
        aria-label={arabic ? "إرفاق ملف أو تسجيل صوت" : "Attach media"}
        className="pc-press rounded-full p-3 text-primary disabled:opacity-50"
      >
        <IconPlus className="h-6 w-6" />
      </button>

      <input
        ref={imageRef}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        hidden
        disabled={disabled}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void submit("image", file);
        }}
      />

      <input
        ref={fileRef}
        type="file"
        hidden
        disabled={disabled}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void submit("file", file);
        }}
      />

      <input
        ref={videoRef}
        type="file"
        accept="video/mp4,video/webm"
        hidden
        disabled={disabled}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void submit("video", file);
        }}
      />

      <Sheet
        open={mode !== null}
        onClose={close}
        title={
          mode === "voice"
            ? arabic ? "رسالة صوتية" : "Voice message"
            : arabic ? "إرفاق" : "Attach"
        }
      >
        {mode === "menu" && (
          <div className="grid grid-cols-2 gap-3">
            {[
              {
                label: arabic ? "صورة" : "Image",
                icon: <IconImage className="h-6 w-6" />,
                action: () => imageRef.current?.click(),
              },
              {
                label: arabic ? "ملف" : "File",
                icon: <IconFile className="h-6 w-6" />,
                action: () => fileRef.current?.click(),
              },
              {
                label: arabic ? "فيديو" : "Video",
                icon: <IconVideo className="h-6 w-6" />,
                action: () => videoRef.current?.click(),
              },
              {
                label: arabic ? "تسجيل صوت" : "Record voice",
                icon: <IconMic className="h-6 w-6" />,
                action: () => {
                  setPending(null);
                  setFailed(false);
                  setMode("voice");
                },
              },
            ].map((item) => (
              <button
                key={item.label}
                type="button"
                disabled={disabled}
                onClick={item.action}
                className="pc-press flex flex-col items-center gap-2 rounded-2xl bg-primary/10 py-5 text-primary disabled:opacity-50"
              >
                {item.icon}
                <span className="text-sm font-semibold">{item.label}</span>
              </button>
            ))}
          </div>
        )}

        {mode === "voice" && (
          <VoiceRecorder
            disabled={disabled}
            onSend={(file) => submit("voice", file)}
          />
        )}

        {disabled && (
          <p role="status" className="mt-3 text-sm text-muted-foreground">
            {arabic ? "جارٍ رفع الملف وإرسال الرسالة…" : "Uploading and sending…"}
          </p>
        )}

        {failed && pending && (
          <div className="mt-4 space-y-2">
            <p role="alert" className="break-words text-sm text-destructive">
              {arabic ? "لم يكتمل الإرسال: " : "Sending did not complete: "}
              {pending.file.name}
            </p>
            <button
              type="button"
              disabled={disabled}
              onClick={() => void submit(pending.kind, pending.file)}
              className="pc-press rounded-full border border-border px-4 py-2 text-sm disabled:opacity-50"
            >
              {arabic ? "إعادة المحاولة" : "Retry"}
            </button>
          </div>
        )}
      </Sheet>
    </>
  );
}