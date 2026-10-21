"use client";

import {
  joinConversation,
  uploadChatImage,
  fetchChatImage,
  uploadChatAttachment,
  fetchChatAttachment,
  saveChatBlob,
} from "@/lib/api-client";
import { usePiAuth } from "@/contexts/pi-auth-context";
import { useEffect, useRef, useState } from "react";
import { useConnect } from "@/contexts/connect-context";
import { Avatar, Button, IconButton, TextInput, cx } from "./ui";
import { Sheet } from "./feedback";
import { VoiceRecorder } from "./voice-recorder";
import {
  IconBack,
  IconPhone,
  IconVideo,
  IconSend,
  IconMic,
  IconPlus,
  IconImage,
  IconFile,
  IconCheck,
  IconDoubleCheck,
  IconShield,
  IconDownload,
} from "./icons";
import {
  formatTime,
  dayLabel,
  type Message,
  type Conversation,
} from "@/lib/connect/data";

export function ConversationView({
  username,
  onBack,
  onCall,
}: {
  username: string;
  onBack: () => void;
  onCall: (username: string, name: string, color: number, kind: "voice" | "video") => void;
}) {
  const {
    t,
    getChat,
    contacts,
    sendMessage,
    markChatRead,
    lang,
    pushToast,
  } = useConnect();

  const { sessionToken } = usePiAuth();
  const [imageUploading, setImageUploading] = useState(false);
  const conv = getChat(username);
  const contact = contacts.find((c) => c.username === username);
  const [text, setText] = useState("");
  const [attachOpen, setAttachOpen] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [typing, setTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    joinConversation(username);
  }, [username]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    let followLatest = true;
    let frame: number | null = null;

    const scrollToLatest = () => {
      if (!followLatest) return;

      if (frame !== null) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
        frame = null;
      });
    };

    const onScroll = () => {
      const distanceFromBottom =
        el.scrollHeight - el.clientHeight - el.scrollTop;

      followLatest = distanceFromBottom <= 80;

      if (!followLatest && frame !== null) {
        cancelAnimationFrame(frame);
        frame = null;
      }
    };

    el.addEventListener("scroll", onScroll, { passive: true });

    const observer = new ResizeObserver(scrollToLatest);
    observer.observe(el);

    for (const child of Array.from(el.children)) {
      observer.observe(child);
    }

    scrollToLatest();

    return () => {
      el.removeEventListener("scroll", onScroll);
      observer.disconnect();
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [username, conv?.id]);

    useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const reported = new Set<string>();
    let frame: number | null = null;

    const checkVisibleMessages = () => {
      if (frame !== null) cancelAnimationFrame(frame);

      frame = requestAnimationFrame(() => {
        frame = null;
        if (document.visibilityState !== "visible") return;

        const viewport = el.getBoundingClientRect();
        const ids: string[] = [];

        el.querySelectorAll<HTMLElement>("[data-read-message-id]")
          .forEach((node) => {
            const id = node.dataset.readMessageId;
            if (!id || reported.has(id)) return;

            const bounds = node.getBoundingClientRect();
            const visibleHeight =
              Math.min(bounds.bottom, viewport.bottom, window.innerHeight) -
              Math.max(bounds.top, viewport.top, 0);
            const visibleWidth =
              Math.min(bounds.right, viewport.right, window.innerWidth) -
              Math.max(bounds.left, viewport.left, 0);

            if (
              bounds.height > 0 &&
              visibleWidth > 0 &&
              visibleHeight >= Math.min(40, bounds.height / 2)
            ) {
              ids.push(id);
              reported.add(id);
            }
          });

        if (ids.length > 0) markChatRead(username, ids);
      });
    };

    const onVisibilityChange = () => {
      reported.clear();
      checkVisibleMessages();
    };

    el.addEventListener("scroll", checkVisibleMessages, { passive: true });
    window.addEventListener("resize", checkVisibleMessages);
    window.addEventListener("focus", onVisibilityChange);
    document.addEventListener("visibilitychange", onVisibilityChange);

    const observer = new ResizeObserver(checkVisibleMessages);
    observer.observe(el);
    for (const child of Array.from(el.children)) observer.observe(child);

    checkVisibleMessages();

    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
      observer.disconnect();
      el.removeEventListener("scroll", checkVisibleMessages);
      window.removeEventListener("resize", checkVisibleMessages);
      window.removeEventListener("focus", onVisibilityChange);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username, conv?.messages]);

  if (!conv) return null;

  const submit = () => {
    const v = text.trim();
    if (!v) return;
    sendMessage(username, "text", v);
    setText("");
  };

  const onImage = async (file?: File) => {
    if (!file || imageUploading) return;

    if (!sessionToken) {
      pushToast("Please sign in again before sending an image.");
      return;
    }

    setImageUploading(true);
    setAttachOpen(false);

    try {
      const image = await uploadChatImage(
        username,
        file,
        sessionToken
      );

      sendMessage(
        username,
        "image",
        "",
        image.fileName,
        undefined,
        image.imageId
      );
    } catch (error) {
      pushToast(
        error instanceof Error
          ? error.message
          : "Image could not be uploaded."
      );
    } finally {
      setImageUploading(false);
      if (imgRef.current) imgRef.current.value = "";
    }
  };

  const onAttachment = async (
  kind: "file" | "video" | "voice",
  file?: File,
): Promise<boolean> => {
  if (!file || imageUploading) return false;

  if (!sessionToken) {
    pushToast("Please sign in again before sending an attachment.");
    return false;
  }

  setImageUploading(true);
  setAttachOpen(false);

  try {
    const attachment = await uploadChatAttachment(
      username,
      kind,
      file,
      sessionToken,
    );

    sendMessage(
      username,
      kind,
      "",
      attachment.fileName,
      undefined,
      undefined,
      attachment.attachmentId,
    );

    return true;
  } catch (error) {
    pushToast(
      error instanceof Error
        ? error.message
        : "Attachment could not be uploaded.",
    );
    return false;
  } finally {
    setImageUploading(false);
    if (fileRef.current) fileRef.current.value = "";
    if (videoRef.current) videoRef.current.value = "";
  }
};

const onFile = (file?: File) => {
  void onAttachment("file", file);
};

const onVideo = (file?: File) => {
  void onAttachment("video", file);
};

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-background pc-fade-in">
      {/* header */}
      <header className="pc-glass-strong sticky top-0 z-10 pc-safe-top">
        <div className="flex items-center gap-2 px-2 py-2.5">
          <IconButton className="h-9 w-9 text-foreground rtl:rotate-180" onClick={onBack} aria-label={t.back}>
            <IconBack className="h-5 w-5" />
          </IconButton>
          <Avatar name={conv.name} color={conv.color} online={contact?.online} size={40} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold leading-tight">{conv.name}</p>
            <p className={cx("truncate text-xs", typing ? "text-gold animate-pulse" : contact?.online ? "text-success" : "text-muted-foreground")}>
              {typing ? "typing..." : contact?.online ? t.online : `@${conv.username}`}
            </p>
          </div>
          <IconButton
            className="h-9 w-9 text-turquoise"
            onClick={() =>
  onCall(
    conv.username ?? username,
    conv.name ?? conv.username ?? username,
    conv.color,
    "voice"
  )
}
            aria-label={t.voiceCall}
          >
            <IconPhone className="h-5 w-5" />
          </IconButton>
          <IconButton
            className="h-9 w-9 text-turquoise"
          onClick={() => onCall(conv.username ?? username, conv.name ?? conv.username ?? username, conv.color, "video")}
            aria-label={t.videoCall}
          >
            <IconVideo className="h-5 w-5" />
          </IconButton>
        </div>
      </header>

      {/* messages */}
        <div
          ref={scrollRef}
          className="min-h-0 flex-1 overflow-y-auto pc-no-scrollbar px-3 py-4"
     >
        <div className="mx-auto mb-4 flex max-w-[80%] items-center justify-center gap-1.5 rounded-full bg-turquoise/10 px-3 py-1.5 text-center text-[11px] text-turquoise">
          <IconShield className="h-3.5 w-3.5 shrink-0" />
          <span>{t.encrypted}</span>
        </div>
        <MessageList messages={conv.messages} locale={lang} t={t} />
      </div>

      {/* composer */}
      <div className="pc-glass-strong pc-safe-bottom border-t border-border/60 px-2 py-2">
        {imageUploading && (
          <p
            role="status"
            className="px-2 pb-2 text-xs text-muted-foreground"
          >
            Uploading attachment…
          </p>
        )}
        <div className="flex items-end gap-2">
          <IconButton
            className="h-11 w-11 shrink-0 bg-primary/15 text-primary"
            onClick={() => setAttachOpen(true)}
            aria-label={t.attach}
          >
            <IconPlus className="h-5 w-5" />
          </IconButton>
          <div className="flex flex-1 items-center rounded-2xl bg-input/70 border border-border px-3">
            <input
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setTyping(true);
                if (typingTimeoutRef.current !== null) {
  clearTimeout(typingTimeoutRef.current);
}
                typingTimeoutRef.current = setTimeout(() => setTyping(false), 1200);
              }}
              placeholder={t.typeMessage}
              className="w-full bg-transparent py-3 text-sm text-foreground outline-none placeholder:text-muted-foreground"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229) {
                  e.preventDefault();
                  setTyping(false);
                  if (typingTimeoutRef.current !== null) {
  clearTimeout(typingTimeoutRef.current);
}
                  submit();
                }
              }}
            />
          </div>
          {text.trim() ? (
            <IconButton
              className="h-11 w-11 shrink-0 bg-primary text-primary-foreground"
              onClick={submit}
              aria-label={t.send}
            >
              <IconSend className="h-5 w-5 rtl:rotate-180" />
            </IconButton>
          ) : (
            <IconButton
              className="h-11 w-11 shrink-0 bg-primary text-primary-foreground"
              disabled={imageUploading}
              onClick={() => setVoiceOpen(true)}
              aria-label="Record voice message"
           >
              <IconMic className="h-5 w-5" />
            </IconButton>
      )}
        </div>
      </div>

      <input ref={imgRef} type="file" accept="image/*" className="hidden" onChange={(e) => onImage(e.target.files?.[0])} />
      <input ref={fileRef} type="file" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
      <input
       ref={videoRef}
       type="file"
       accept="video/mp4,video/webm,.mp4,.webm"
       className="hidden"
       onChange={(event) => onVideo(event.target.files?.[0])}
/>

      {/* attach sheet */}
      <Sheet
  open={attachOpen}
  onClose={() => setAttachOpen(false)}
  title={t.attach}
>
  <div className="grid grid-cols-3 gap-3 pb-2">
    <button
      type="button"
      disabled={imageUploading}
      onClick={() => imgRef.current?.click()}
      className="pc-press flex flex-col items-center gap-2 rounded-2xl bg-turquoise/10 py-6 text-turquoise disabled:opacity-50"
    >
      <IconImage className="h-7 w-7" />
      <span className="text-sm font-semibold">{t.attachImage}</span>
    </button>

    <button
      type="button"
      disabled={imageUploading}
      onClick={() => fileRef.current?.click()}
      className="pc-press flex flex-col items-center gap-2 rounded-2xl bg-primary/10 py-6 text-primary disabled:opacity-50"
    >
      <IconFile className="h-7 w-7" />
      <span className="text-sm font-semibold">{t.attachFile}</span>
    </button>

    <button
      type="button"
      disabled={imageUploading}
      onClick={() => videoRef.current?.click()}
      className="pc-press flex flex-col items-center gap-2 rounded-2xl bg-turquoise/10 py-6 text-turquoise disabled:opacity-50"
    >
      <IconVideo className="h-7 w-7" />
      <span className="text-sm font-semibold">Video</span>
    </button>
  </div>
</Sheet>
<Sheet
  open={voiceOpen}
  onClose={() => {
    if (!imageUploading) setVoiceOpen(false);
  }}
  title="Voice message"
>
  {voiceOpen && (
    <VoiceRecorder
      key={`${username}:${sessionToken || ""}`}
      disabled={imageUploading}
      onSend={async (file) => {
        const sent = await onAttachment("voice", file);
        if (sent) setVoiceOpen(false);
        return sent;
      }}
    />
  )}
</Sheet>

      {/* in-chat pay */}

    </div>
  );
}

function MessageList({
  messages,
  locale,
  t,
}: {
  messages: Message[];
  locale: string;
  t: ReturnType<typeof useConnect>["t"];
}) {
  const groups: { day: string; items: Message[] }[] = [];
  for (const m of messages) {
    const day = dayLabel(m.at, locale);
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.items.push(m);
    else groups.push({ day, items: [m] });
  }

  return (
    <div className="flex flex-col gap-1.5">
      {groups.map((g, gi) => (
        <div key={gi} className="flex flex-col gap-1.5">
          <div className="my-2 flex justify-center">
            <span className="rounded-full bg-card/70 px-3 py-1 text-[11px] text-muted-foreground">
              {g.day === "Today" ? t.today : g.day === "Yesterday" ? t.yesterday : g.day}
            </span>
          </div>
          {g.items.map((m) => (
            <div
              key={m.id}
              data-read-message-id={!m.fromMe ? m.id : undefined}
            >
              <Bubble m={m} locale={locale} t={t} />
            </div>
   ))}
        </div>
      ))}
    </div>
  );
}

function ChatImage({
  imageId,
  fileName,
}: {
  imageId: string;
  fileName?: string;
}) {
  const { sessionToken } = usePiAuth();
  const { pushToast } = useConnect();
  const [imageBlob, setImageBlob] = useState<Blob | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setImageUrl(null);
    setImageBlob(null);
    setError(false);
    if (!sessionToken) return;

    const controller = new AbortController();
    let active = true;
    let objectUrl: string | null = null;

    void fetchChatImage(imageId, sessionToken, controller.signal)
      .then((blob) => {
        if (!active) return;
        setImageBlob(blob);

        objectUrl = URL.createObjectURL(blob);
        setImageUrl(objectUrl);
      })
      .catch(() => {
        if (active && !controller.signal.aborted) {
          setError(true);
        }
      });

    return () => {
      active = false;
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [imageId, sessionToken]);

  if (!imageUrl) {
    return (
      <div
        className="flex aspect-[4/3] w-52 items-center justify-center rounded-xl bg-muted/40 px-3 text-center text-xs text-muted-foreground"
        role="status"
      >
        {error
          ? "Image could not be loaded."
          : !sessionToken
            ? "Sign in to view this image."
            : "Loading image…"}
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="block overflow-hidden rounded-xl"
        aria-label="Open image"
      >
        <img
          src={imageUrl}
          alt={fileName || "Chat image"}
          className="h-auto max-h-72 w-52 object-contain"
          onError={() => {
            setError(true);
            setImageUrl(null);
          }}
        />
      </button>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={fileName || "Image"}
      >
        <img
          src={imageUrl}
          alt={fileName || "Chat image"}
          className="mx-auto max-h-[70vh] max-w-full object-contain"
        />
        <button
  type="button"
  disabled={!imageBlob}
  onClick={() => {
    if (!imageBlob) return;

    const extension =
      imageBlob.type === "image/jpeg"
        ? "jpg"
        : imageBlob.type === "image/gif"
          ? "gif"
          : imageBlob.type === "image/webp"
            ? "webp"
            : "png";

    void saveChatBlob(
      imageBlob,
      fileName || `image.${extension}`,
    ).catch(() => {
      pushToast("Could not open the save options. Please try again.");
    });
  }}
  className="pc-press mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-turquoise/15 px-3 py-3 text-sm font-semibold text-turquoise disabled:opacity-50"
>
  <IconDownload className="h-5 w-5" />
  Save / Share
</button>
      </Sheet>
    </>
  );
}

function ChatAttachment({
  attachmentId,
  kind,
  fileName,
}: {
  attachmentId: string;
  kind: "file" | "video" | "voice";
  fileName?: string;
}) {
  const { sessionToken } = usePiAuth();
  const [blob, setBlob] = useState<Blob | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const controllerRef = useRef<AbortController | null>(null);
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    controllerRef.current = controller;
    setBlob(null);
    setVideoUrl(null);
    setLoading(false);
    setError("");

    return () => {
      controller.abort();
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
        urlRef.current = null;
      }
    };
  }, [attachmentId, kind, sessionToken]);

  const loadAttachment = async () => {
    const controller = controllerRef.current;
    if (!sessionToken || loading || !controller) return;

    setLoading(true);
    setError("");

    try {
      const content = await fetchChatAttachment(
        attachmentId,
        kind,
        sessionToken,
        controller.signal,
      );

      if (controller.signal.aborted) return;

      setBlob(content);

      if (kind === "video" || kind === "voice") {
        const url = URL.createObjectURL(content);
        urlRef.current = url;
        setVideoUrl(url);
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        setError(
          error instanceof Error ? error.message : "Attachment load failed.",
        );
      }
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  };

  const saveAttachment = async () => {
    if (!blob) return;

    try {
      await saveChatBlob(
        blob,
        fileName || (kind === "video" ? "video.mp4" : "attachment"),
      );
    } catch {
      setError("Could not open the save options. Please try again.");
    }
  };

  return (
  <div className="flex min-w-0 flex-col gap-2">
    {kind === "voice" && videoUrl && (
      <audio
        src={videoUrl}
        controls
        preload="metadata"
        className="w-64 max-w-full"
        onError={() =>
          setError("This recording cannot play on this device. You can save it.")
        }
      />
    )}

    {kind === "video" && videoUrl && (
      <video
        src={videoUrl}
        controls
        playsInline
        preload="metadata"
        className="max-h-72 w-64 max-w-full rounded-xl bg-black"
        onError={() =>
          setError("This video cannot play on this device. You can save it.")
        }
      />
    )}

      <button
        type="button"
        disabled={loading || !sessionToken}
        onClick={() => {
          if (blob) void saveAttachment();
          else void loadAttachment();
        }}
        className="pc-press flex items-center justify-center gap-2 rounded-xl bg-turquoise/15 px-3 py-2 text-xs font-semibold text-turquoise disabled:opacity-50"
      >
        <IconDownload className="h-4 w-4 shrink-0" />
        {loading
          ? "Loading…"
          : blob
            ? "Save / Share"
            : kind === "video"
             ? "Load video"
            : kind === "voice"
              ? "Load voice message"
              : "Download file"}
      </button>

      {!sessionToken && (
        <p className="text-xs text-muted-foreground">
          Sign in to load this attachment.
        </p>
      )}

      {error && (
        <p role="alert" className="max-w-64 text-xs text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}

function Bubble({
  m,
  locale,
  t,
}: {
  m: Message;
  locale: string;
  t: ReturnType<typeof useConnect>["t"];
}) {
  const mine = m.fromMe;

  if (m.kind === "image") {
    return (
      <div className={cx("flex pc-fade-up", mine ? "justify-end" : "justify-start")}>
        <div className={cx("max-w-[70%] overflow-hidden rounded-2xl p-1", mine ? "bg-primary/20" : "bg-card")}>
          {m.imageId ? (
            <ChatImage imageId={m.imageId} fileName={m.fileName} />
          ) : (
            <div className="flex aspect-[4/3] w-52 items-center justify-center rounded-xl bg-muted/40 px-3 text-center text-xs text-muted-foreground">
              Image content was not uploaded.
            </div>
          )}
          <div className="flex items-center justify-between px-2 py-1">
            <span className="text-[11px] text-muted-foreground pc-clamp-1">{m.fileName || t.photo}</span>
            <TimeInline m={m} locale={locale} mine={mine} />
          </div>
        </div>
      </div>
    );
  }

  if (m.kind === "file" || m.kind === "video" || m.kind === "voice") {
  return (
    <div
      className={cx(
        "flex pc-fade-up",
        mine ? "justify-end" : "justify-start",
      )}
    >
      <div
        className={cx(
          "flex max-w-[78%] flex-col gap-3 rounded-2xl p-3",
          mine ? "bg-primary/20" : "bg-card",
        )}
      >
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-turquoise/20 text-turquoise">
            {m.kind === "video" ? (
              <IconVideo className="h-5 w-5" />
            ) : m.kind === "voice" ? (
              <IconMic className="h-5 w-5" />
            ) : (
              <IconFile className="h-5 w-5" />
          )}
          </span>

          <div className="min-w-0 flex-1">
            <p className="break-all text-sm font-medium text-foreground">
              {m.kind === "voice"
                ? "Voice message"
                : m.fileName || (m.kind === "video" ? "Video" : t.file)}
            </p>
            <TimeInline m={m} locale={locale} mine={mine} />
          </div>
        </div>

        {m.attachmentId ? (
          <ChatAttachment
            attachmentId={m.attachmentId}
            kind={m.kind}
            fileName={m.fileName}
          />
        ) : (
          <p className="text-xs text-muted-foreground">
            Attachment content was not uploaded.
          </p>
        )}
      </div>
    </div>
  );
}
  return (
    <div className={cx("flex pc-fade-up", mine ? "justify-end" : "justify-start")}>
      <div
        className={cx(
          "max-w-[78%] rounded-2xl px-3.5 py-2",
          mine ? "bg-primary text-primary-foreground rounded-br-md" : "bg-card text-foreground rounded-bl-md",
        )}
      >
        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{m.text}</p>
        <TimeRow m={m} locale={locale} mine={mine} />
      </div>
    </div>
  );
}

function TimeRow({ m, locale, mine }: { m: Message; locale: string; mine: boolean }) {
  return (
    <div className={cx("mt-1 flex items-center gap-1", mine ? "justify-end" : "justify-start")}>
      <span className={cx("text-[10px]", mine ? "text-primary-foreground/70" : "text-muted-foreground")}>
        {formatTime(m.at, locale)}
      </span>
      {mine && <StatusTick status={m.status} />}
    </div>
  );
}
function TimeInline({ m, locale, mine }: { m: Message; locale: string; mine: boolean }) {
  return (
    <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
      {formatTime(m.at, locale)}
      {mine && <StatusTick status={m.status} />}
    </span>
  );
}

function StatusTick({ status }: { status: Message["status"] }) {
  if (status === "pending") {
    return (
      <span role="img" aria-label="Sending" title="Sending">
        …
      </span>
    );
  }

  if (status === "failed") {
    return (
      <span
        role="img"
        aria-label="Send failed"
        title="Send failed"
        className="font-bold text-red-400"
      >
        !
      </span>
    );
  }

  if (status === "sent") {
    return (
      <span title="Saved on server" aria-label="Saved on server">
        <IconCheck className="h-3.5 w-3.5" />
      </span>
    );
  }

  return (
    <span
      title={status === "read" ? "Read" : "Delivered"}
      aria-label={status === "read" ? "Read" : "Delivered"}
    >
      <IconDoubleCheck
        className={cx(
          "h-3.5 w-3.5",
          status === "read" ? "text-turquoise" : "opacity-70"
        )}
      />
    </span>
  );
}
