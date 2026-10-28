"use client";

import { useEffect, useRef, useState } from "react";
import { usePiAuth } from "@/contexts/pi-auth-context";
import { useConnect } from "@/contexts/connect-context";
import {
  fetchGroupMedia,
  saveChatBlob,
  type GroupMediaKind,
  type GroupMessageRecord,
} from "@/lib/api-client";

export function GroupMedia({ message }: { message: GroupMessageRecord }) {
  const { sessionToken, isAuthenticated } = usePiAuth();

  if (
    !isAuthenticated ||
    !sessionToken ||
    message.kind === "text" ||
    !message.mediaId
  ) return null;

  return (
    <MediaContent
      key={`${sessionToken}:${message.groupId}:${message.mediaId}:${message.kind}`}
      token={sessionToken}
      groupId={message.groupId}
      mediaId={message.mediaId}
      kind={message.kind}
      fileName={message.fileName || message.kind}
    />
  );
}

function MediaContent({
  token,
  groupId,
  mediaId,
  kind,
  fileName,
}: {
  token: string;
  groupId: string;
  mediaId: string;
  kind: GroupMediaKind;
  fileName: string;
}) {
  const { lang } = useConnect();
  const arabic = lang === "ar";

  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const aliveRef = useRef(false);
  const busyRef = useRef(false);
  const blobRef = useRef<Blob | null>(null);
  const urlRef = useRef<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    aliveRef.current = true;

    return () => {
      aliveRef.current = false;
      controllerRef.current?.abort();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, []);

  const load = async () => {
    if (busyRef.current) return;

    busyRef.current = true;
    setBusy(true);
    setError(null);

    try {
      let blob = blobRef.current;

      if (!blob) {
        const controller = new AbortController();
        controllerRef.current = controller;

        blob = await fetchGroupMedia(
          token,
          groupId,
          mediaId,
          kind,
          controller.signal,
        );

        if (!aliveRef.current) return;
        blobRef.current = blob;
      }

      if (kind === "file") {
        await saveChatBlob(blob, fileName);
      } else if (!urlRef.current) {
        const objectUrl = URL.createObjectURL(blob);
        urlRef.current = objectUrl;
        setUrl(objectUrl);
      }
    } catch (error) {
      if (aliveRef.current) {
        setError(
          error instanceof Error
            ? error.message
            : arabic ? "تعذر تحميل الملف" : "Could not load media",
        );
      }
    } finally {
      busyRef.current = false;
      if (aliveRef.current) setBusy(false);
    }
  };

  const label = kind === "image"
    ? arabic ? "عرض الصورة" : "View image"
    : kind === "video"
      ? arabic ? "تحميل الفيديو وتشغيله" : "Load video"
      : kind === "voice"
        ? arabic ? "تحميل الرسالة الصوتية" : "Load voice message"
        : arabic ? "تنزيل الملف" : "Download file";

  return (
    <div className="my-2 space-y-2">
      <p className="max-w-full break-words text-xs opacity-80">
        {fileName}
      </p>

      {(!url || kind === "file") && (
        <button
          type="button"
          onClick={() => void load()}
          disabled={busy}
          className="pc-press rounded-xl border border-current/30 px-3 py-2 text-sm disabled:opacity-50"
        >
          {busy ? arabic ? "جارٍ التحميل…" : "Loading…" : label}
        </button>
      )}

      {url && kind === "image" && (
        <img
          src={url}
          alt={fileName}
          className="max-h-80 max-w-full rounded-xl object-contain"
        />
      )}

      {url && kind === "video" && (
        <video
          src={url}
          controls
          playsInline
          preload="metadata"
          className="max-h-80 max-w-full rounded-xl"
        />
      )}

      {url && kind === "voice" && (
        <audio
          src={url}
          controls
          preload="metadata"
          className="max-w-full"
        />
      )}

      {error && (
        <p role="alert" className="break-words text-xs">
          {error}
        </p>
      )}
    </div>
  );
}