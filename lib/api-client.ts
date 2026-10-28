import io from "socket.io-client";

const API_URL =
  process.env.REACT_APP_API_URL ||
  "https://one-connect.onrender.com";

const WS_URL =
  process.env.REACT_APP_WS_URL ||
  "https://one-connect.onrender.com";

let socket: ReturnType<typeof io> | null = null;
export interface CallEventMap {
  "call:incoming": {
    callId: string;
    from: string;
    kind: "voice" | "video";
  };
  "call:initiated": { callId: string };
  "call:accepted": { callId: string };
  "call:offer": {
    callId: string;
    offer: RTCSessionDescriptionInit;
  };
  "call:answered": {
    callId: string;
    answer: RTCSessionDescriptionInit;
  };
  "call:ice-candidate": {
    callId: string;
    candidate: RTCIceCandidateInit;
  };
  "call:connected": { callId: string };
  "call:ended": { callId: string; reason: string };
  "call:error": { callId?: string; reason: string };
  disconnect: string;
}

const callListeners = new Map<
  keyof CallEventMap,
  Set<(data: unknown) => void>
>();

export function onCallEvent<K extends keyof CallEventMap>(
  event: K,
  callback: (data: CallEventMap[K]) => void,
): () => void {
  const listener = (data: unknown) => {
    callback(data as CallEventMap[K]);
  };

    const listeners =
    callListeners.get(event) ?? new Set<(data: unknown) => void>();

  callListeners.set(event, listeners);

  listeners.add(listener);
  const attachedSocket = socket;
  const socketEvent = String(event);
  attachedSocket?.on(socketEvent, listener);

  return () => {
    listeners.delete(listener);
    attachedSocket?.off(socketEvent, listener);

    if (socket !== attachedSocket) {
    socket?.off(socketEvent, listener);
    }

    if (listeners.size === 0 && callListeners.get(event) === listeners) {
      callListeners.delete(event);
    }
  };
}

export interface EmailEventMap {
  "email:new": Record<string, unknown>;
  "email:read": { id: string };
  "email:deleted": { id: string };
  connect: undefined;
}

const emailListeners = new Map<
  keyof EmailEventMap,
  Set<(data: unknown) => void>
>();

export function onEmailEvent<K extends keyof EmailEventMap>(
  event: K,
  callback: (data: EmailEventMap[K]) => void,
): () => void {
  const listener = (data: unknown) => {
    callback(data as EmailEventMap[K]);
  };

  const listeners =
    emailListeners.get(event) ?? new Set<(data: unknown) => void>();

  emailListeners.set(event, listeners);
  listeners.add(listener);

  const attachedSocket = socket;
  const socketEvent = String(event);
  attachedSocket?.on(socketEvent, listener);

  return () => {
    listeners.delete(listener);
    attachedSocket?.off(socketEvent, listener);

    if (socket !== attachedSocket) {
      socket?.off(socketEvent, listener);
    }

    if (
      listeners.size === 0 &&
      emailListeners.get(event) === listeners
    ) {
      emailListeners.delete(event);
    }
  };
}

const messageListeners = {
  newMessage: new Set<(message: Record<string, unknown>) => void>(),
  deleted: new Set<
    (data: { id: string; senderUsername: string }) => void
  >(),
  saved: new Set<(data: { id: string; status: "sent" }) => void>(),
  status: new Set<
  (data: {
    id: string;
    recipientUsername: string;
    status: "delivered" | "read";
  }) => void
>(),
  error: new Set<(data: { id?: string; error: string }) => void>(),
  history: new Set<
    (data: {
      username: string;
      messages: Record<string, unknown>[];
    }) => void
  >(),
};

export async function getAppState(
  key: string,
  sessionToken: string
): Promise<{ blob: Record<string, unknown> } | null> {
  const response = await fetch(
    `${API_URL}/api/state/${encodeURIComponent(key)}`,
    {
      headers: {
        Authorization: `Bearer ${sessionToken}`,
      },
      cache: "no-store",
    }
  );

  if (!response.ok) {
    throw new Error(`State load failed (${response.status}): ${key}`);
  }

  const record: unknown = await response.json();
  if (record === null) return null;

  if (
    typeof record !== "object" ||
    !("blob" in record) ||
    !record.blob ||
    typeof record.blob !== "object" ||
    Array.isArray(record.blob)
  ) {
    throw new Error(`Invalid state response: ${key}`);
  }

  return { blob: record.blob as Record<string, unknown> };
}

export async function saveAppState(
  key: string,
  blob: Record<string, unknown>,
  sessionToken: string
): Promise<void> {
  const response = await fetch(
    `${API_URL}/api/state/${encodeURIComponent(key)}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${sessionToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ blob }),
    }
  );

  if (!response.ok) {
    throw new Error(`State save failed (${response.status}): ${key}`);
  }
}

/**
 * Initialize WebSocket connection
 */
export function initSocket(userId: string, piUsername: string, sessionToken: string) {
  if (socket?.connected && socket.auth && typeof socket.auth === "object" && "sessionToken" in socket.auth && socket.auth.sessionToken === sessionToken) return socket;
if (socket) disconnectSocket();

  socket = io(WS_URL, {
  auth: { sessionToken },
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  reconnectionAttempts: 5,
});

for (const [event, listeners] of groupListeners) {
  for (const listener of listeners) {
    socket.on(String(event), listener);
   }
  }

for (const [event, listeners] of callListeners) {
    const socketEvent = String(event);

    for (const listener of listeners) {
      socket.on(socketEvent, listener);
    }
  }

    for (const [event, listeners] of emailListeners) {
    const socketEvent = String(event);

    for (const listener of listeners) {
      socket.on(socketEvent, listener);
    }
  }

  for (const callback of messageListeners.newMessage) {
    socket.on("message:new", callback);
  }

  for (const callback of messageListeners.saved) {
    socket.on("message:saved", callback);
  }

  for (const callback of messageListeners.deleted) {
    socket.on("message:deleted", callback);
  }

  for (const callback of messageListeners.status) {
  socket.on("message:status", callback);
}

  for (const callback of messageListeners.error) {
    socket.on("message:error", callback);
  }

    for (const callback of messageListeners.history) {
    socket.on("conversation:messages", callback);
  }

  socket.on("connect", () => {
    console.log("WebSocket connected");
    socket?.emit("user:login", userId, piUsername);
  });

  socket.on("disconnect", () => {
    console.log("WebSocket disconnected");
  });

  socket.on("error", (error) => {
    console.error("WebSocket error:", error);
  });

    socket.on("connect_error", (error) => {
    console.error("[ONE CONNECT SOCKET CONNECTION ERROR]", {
      message: error.message,
      cause: error.cause,
    });
  });

  return socket;
}

/**
 * Get socket instance
 */
export function getSocket() {
  return socket;
}

export function onMessageDeleted(
  callback: (data: {
    id: string;
    senderUsername: string;
  }) => void,
) {
  messageListeners.deleted.add(callback);

  const attachedSocket = socket;
  attachedSocket?.on("message:deleted", callback);

  return () => {
    messageListeners.deleted.delete(callback);
    attachedSocket?.off("message:deleted", callback);

    if (socket !== attachedSocket) {
      socket?.off("message:deleted", callback);
    }
  };
}

export function onMessageStatus(
  callback: (data: {
    id: string;
    recipientUsername: string;
    status: "delivered" | "read";
  }) => void,
) {
  messageListeners.status.add(callback);
  const attachedSocket = socket;
  attachedSocket?.on("message:status", callback);

  return () => {
    messageListeners.status.delete(callback);
    attachedSocket?.off("message:status", callback);
    if (socket !== attachedSocket) {
      socket?.off("message:status", callback);
    }
  };
}

export function acknowledgeMessages(
  senderUsername: string,
  ids: string[],
  status: "delivered" | "read",
): boolean {
  if (!socket?.connected) return false;

  const validIds = [...new Set(ids)].filter(
    (id) => typeof id === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(id),
  );

  if (validIds.length === 0) return false;

  for (let i = 0; i < validIds.length; i += 120) {
    socket.emit("message:receipt", {
      senderUsername,
      ids: validIds.slice(i, i + 120),
      status,
    });
  }

  return true;
}

/**
 * Disconnect socket
 */
export function disconnectSocket() {
  const closingSocket = socket;
  if (!closingSocket) return;

  socket = null;
  closingSocket.removeAllListeners();
  closingSocket.disconnect();

  const listeners = callListeners.get("disconnect");

  for (const listener of [...(listeners ?? [])]) {
    listener("client-disconnect");
  }
}

export async function revokeSession(sessionToken: string): Promise<void> {
  const response = await fetch(`${API_URL}/api/auth/logout`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${sessionToken}`,
    },
  });

  if (!response.ok) {
    throw new Error("Failed to revoke session");
  }
}
/**
 * Verify Pi authentication with backend
 */
export async function verifyPiAuth(accessToken: string) {
  const response = await fetch(`${API_URL}/api/auth/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accessToken }),
  });

  if (!response.ok) throw new Error("Auth verification failed");
  return response.json();
}

/**
 * Get user profile from backend
 */
export async function getUserProfile(userId: string) {
  const response = await fetch(`${API_URL}/api/profile/${userId}`);
  if (!response.ok) throw new Error("Failed to fetch profile");
  return response.json();
}

/**
 * Update user profile
 */
export async function updateUserProfile(userId: string, updates: Record<string, unknown>) {
  const response = await fetch(`${API_URL}/api/profile/${userId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });

  if (!response.ok) throw new Error("Failed to update profile");
  return response.json();
}

/**
 * Get user contacts
 */
export async function getUserContacts(userId: string, sessionToken: string) {
  const response = await fetch(`${API_URL}/api/contacts/${userId}`, {
    headers: {
      Authorization: `Bearer ${sessionToken}`,
    },
  });

  if (!response.ok) throw new Error("Failed to fetch contacts");
  return response.json();
}
/**
 * Add contact
 */
export async function addContact(userId: string, username: string, name: string, sessionToken: string) {
  const response = await fetch(`${API_URL}/api/contacts/${userId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessionToken}` },
    body: JSON.stringify({ username, name }),
  });

  if (!response.ok) throw new Error("Failed to add contact");
  return response.json();
}

/**
 * Send message via REST (for persistence)
 */
export async function deleteChatMessage(
  sessionToken: string,
  senderUsername: string,
  messageId: string,
): Promise<void> {
  if (!sessionToken) {
    throw new Error("Please sign in before deleting messages.");
  }

  const sender = senderUsername.trim().replace(/^@/, "").toLowerCase();

  if (
    !/^[a-z0-9._-]{1,32}$/.test(sender) ||
    !messageId.trim() ||
    messageId.length > 120
  ) {
    throw new Error("Invalid message details.");
  }

  const response = await fetch(
    `${API_URL}/api/chat/messages/${encodeURIComponent(sender)}/${encodeURIComponent(messageId)}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${sessionToken}`,
      },
    },
  );

  const result = await response.json().catch(() => null);

  if (!response.ok || result?.success !== true) {
    throw new Error(
      typeof result?.error === "string"
        ? result.error
        : "Message could not be deleted.",
    );
  }
}
export async function sendMessage(userId: string, conversationId: string, message: Record<string, unknown>) {
  const response = await fetch(`${API_URL}/api/messages/${userId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ conversationId, ...message }),
  });

  if (!response.ok) throw new Error("Failed to send message");
  return response.json();
}

/**
 * Emit message via WebSocket (for real-time)
 */
export function emitMessage(
  conversationId: string,
  kind: string,
  text: string,
  fileName?: string,
  messageId?: string,
 imageId?: string,
 attachmentId?: string,
): boolean {
  if (!socket?.connected) {
    console.error("WebSocket not connected");
    return false;
  }

  socket.emit("message:send", {
    conversationId,
    kind,
    text,
    fileName,
    messageId,
    imageId,
    attachmentId,
  });

  return true;
}
export function joinConversation(conversationId: string) {
  if (!socket?.connected) {
    console.error("WebSocket not connected");
    return;
  }

  socket.emit("conversation:join", conversationId);
}

export function onConversationMessages(
  callback: (data: {
    username: string;
    messages: Record<string, unknown>[];
  }) => void
) {
  messageListeners.history.add(callback);

  const currentSocket = socket;
  currentSocket?.on("conversation:messages", callback);

  return () => {
    messageListeners.history.delete(callback);
    currentSocket?.off("conversation:messages", callback);

    if (socket && socket !== currentSocket) {
      socket.off("conversation:messages", callback);
    }
  };
}

/**
 * Listen for new messages
 */
export function onNewMessage(
  callback: (message: Record<string, unknown>) => void
) {
  messageListeners.newMessage.add(callback);

  const currentSocket = socket;
  currentSocket?.on("message:new", callback);

  return () => {
    messageListeners.newMessage.delete(callback);
    currentSocket?.off("message:new", callback);

    if (socket && socket !== currentSocket) {
      socket.off("message:new", callback);
    }
  };
}

/**
 * Listen for successful message persistence
 */
export function onMessageSaved(
  callback: (data: { id: string; status: "sent" }) => void
) {
  messageListeners.saved.add(callback);

  const currentSocket = socket;
  currentSocket?.on("message:saved", callback);

  return () => {
    messageListeners.saved.delete(callback);
    currentSocket?.off("message:saved", callback);

    if (socket && socket !== currentSocket) {
      socket.off("message:saved", callback);
    }
  };
}

/**
 * Listen for message sending or persistence errors
 */
export function onMessageError(
  callback: (data: { id?: string; error: string }) => void
) {
  messageListeners.error.add(callback);

  const currentSocket = socket;
  currentSocket?.on("message:error", callback);

  return () => {
    messageListeners.error.delete(callback);
    currentSocket?.off("message:error", callback);

    if (socket && socket !== currentSocket) {
      socket.off("message:error", callback);
    }
  };
}

/**
 * Emit status update
 */
export function emitStatusUpdate(userId: string, status: string, statusText?: string) {
  if (!socket?.connected) return;
  socket.emit("status:update", userId, status, statusText);
}

/**
 * Listen for user status changes
 */
export function onUserStatus(callback: (data: Record<string, unknown>) => void) {
  if (!socket) return;
  socket.on("user:status", callback);
}

export async function getCallConfiguration(): Promise<RTCConfiguration> {
  const activeSocket = socket;
  const auth = activeSocket?.auth;

  if (
    !activeSocket?.connected ||
    !auth ||
    typeof auth !== "object" ||
    typeof auth.sessionToken !== "string"
  ) {
    throw new Error("An active session is required for calls.");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(`${API_URL}/api/calls/ice-servers`, {
      headers: {
        Authorization: `Bearer ${auth.sessionToken}`,
      },
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error("Unable to load call configuration.");
    }

    const data: unknown = await response.json();

    if (
      !data ||
      typeof data !== "object" ||
      !("iceServers" in data) ||
      !Array.isArray(data.iceServers) ||
      data.iceServers.length === 0 ||
      data.iceServers.length > 10
    ) {
      throw new Error("Invalid call configuration.");
    }

    const iceServers: RTCIceServer[] = [];

    for (const item of data.iceServers) {
      if (!item || typeof item !== "object") {
        throw new Error("Invalid ICE server.");
      }

      const urls = typeof item.urls === "string" ? [item.urls] : item.urls;

      if (
        !Array.isArray(urls) ||
        urls.length === 0 ||
        urls.length > 8 ||
        !urls.every(
          (url: unknown) =>
            typeof url === "string" && /^(stun|stuns|turn|turns):[^\s]+$/i.test(url),
        )
      ) {
        throw new Error("Invalid ICE server URLs.");
      }

      const server: RTCIceServer = { urls };

      if (urls.some((url: string) => /^turns?:/i.test(url))) {
        if (
          typeof item.username !== "string" ||
          !item.username ||
          typeof item.credential !== "string" ||
          !item.credential
        ) {
          throw new Error("Missing TURN credentials.");
        }

        server.username = item.username;
        server.credential = item.credential;
      }

      iceServers.push(server);
    }

    if (socket !== activeSocket || !activeSocket.connected) {
      throw new Error("The call session changed.");
    }

    return { iceServers };
  } finally {
    clearTimeout(timer);
  }
}

export interface CallCommandMap {
  "call:initiate": {
    callId: string;
    to: string;
    kind: "voice" | "video";
  };
  "call:accept": {
    callId: string;
  };
  "call:offer": {
    callId: string;
    offer: RTCSessionDescriptionInit;
  };
  "call:answer": {
    callId: string;
    answer: RTCSessionDescriptionInit;
  };
  "call:ice-candidate": {
    callId: string;
    candidate: RTCIceCandidateInit;
  };
  "call:connected": {
    callId: string;
  };
  "call:end": {
    callId: string;
  };
}

export function sendCallEvent<K extends keyof CallCommandMap>(
  event: K,
  data: CallCommandMap[K],
): boolean {
  if (!socket?.connected) return false;

  socket.emit(String(event), data);
  return true;
}

/**
 * Upload file to backend
 */
export async function fetchChatImage(
  imageId: string,
  sessionToken: string,
  signal?: AbortSignal
): Promise<Blob> {
  if (!/^[a-fA-F0-9]{24}$/.test(imageId)) {
    throw new Error("Invalid image ID");
  }

  const response = await fetch(
    `${API_URL}/api/chat/images/${encodeURIComponent(imageId)}`,
    {
      headers: {
        Authorization: `Bearer ${sessionToken}`,
      },
      cache: "no-store",
      signal,
    }
  );

  if (!response.ok) {
    throw new Error(`Image load failed (${response.status})`);
  }

  const blob = await response.blob();

if (
  !["image/png", "image/jpeg", "image/gif", "image/webp"]
    .includes(blob.type) ||
  !blob.size ||
  blob.size > 5 * 1024 * 1024
) {
  throw new Error("Invalid image response");
}

return blob;
}

export async function saveChatBlob(
  blob: Blob,
  fileName: string,
): Promise<void> {
  const safeName = fileName
    .replace(/[/\\\u0000-\u001f\u007f]/g, "_")
    .slice(0, 120) || "attachment";

  const file = new File([blob], safeName, {
    type: blob.type || "application/octet-stream",
  });

  if (
    typeof navigator.canShare === "function" &&
    typeof navigator.share === "function" &&
    navigator.canShare({ files: [file] })
  ) {
    try {
      await navigator.share({ files: [file] });
      return;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
    }
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = safeName;
  link.target = "_blank";
  link.rel = "noopener";
  document.body.appendChild(link);

  try {
    link.click();
  } finally {
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}

export async function fetchChatAttachment(
  attachmentId: string,
  kind: "file" | "video" | "voice",
  sessionToken: string,
  signal?: AbortSignal,
): Promise<Blob> {
  if (!/^[a-fA-F0-9]{24}$/.test(attachmentId)) {
    throw new Error("Invalid attachment ID");
  }

  const response = await fetch(
    `${API_URL}/api/chat/attachments/${encodeURIComponent(attachmentId)}`,
    {
      headers: {
        Authorization: `Bearer ${sessionToken}`,
      },
      cache: "no-store",
      signal,
    },
  );

  if (!response.ok) {
    throw new Error(`Attachment load failed (${response.status})`);
  }

  const blob = await response.blob();

const allowedTypes = kind === "video"
  ? ["video/mp4", "video/webm"]
  : kind === "voice"
    ? ["audio/webm", "audio/mp4", "audio/ogg", "audio/wav"]
    : ["application/octet-stream"];

const maxSize = (kind === "voice" ? 5 : 25) * 1024 * 1024;

if (
  !blob.size ||
  blob.size > maxSize ||
  !allowedTypes.includes(blob.type)
) {
  throw new Error("Invalid attachment response");
}

return blob;
}

export async function uploadChatAttachment(
  recipient: string,
  kind: "file" | "video" | "voice",
  file: File,
  sessionToken: string,
): Promise<{
  attachmentId: string;
  kind: "file" | "video" | "voice";
  fileName: string;
  mimeType: string;
  fileSize: number;
}> {
  const maxSize = (kind === "voice" ? 5 : 25) * 1024 * 1024;

if (!file.size || file.size > maxSize) {
  throw new Error(
    kind === "voice"
      ? "Voice message must be between 1 byte and 5 MB"
      : "Attachment must be between 1 byte and 25 MB",
  );
}

  const formData = new FormData();
  formData.append("recipient", recipient);
  formData.append("kind", kind);
  formData.append("file", file);

  const response = await fetch(`${API_URL}/api/chat/attachments`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${sessionToken}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const details = await response.json().catch(() => null);
    throw new Error(
      typeof details?.error === "string"
        ? details.error
        : `Attachment upload failed (${response.status})`,
    );
  }

  const result = await response.json();

  if (
    !result ||
    typeof result !== "object" ||
    typeof result.attachmentId !== "string" ||
    !/^[a-fA-F0-9]{24}$/.test(result.attachmentId) ||
    result.kind !== kind ||
    typeof result.fileName !== "string" ||
    typeof result.mimeType !== "string" ||
    !Number.isFinite(result.fileSize) ||
    result.fileSize <= 0 ||
    result.fileSize > maxSize
  ) {
    throw new Error("Invalid attachment upload response");
  }

  return {
    attachmentId: result.attachmentId,
    kind,
    fileName: result.fileName,
    mimeType: result.mimeType,
    fileSize: result.fileSize,
  };
}

export async function uploadChatImage(
  recipient: string,
  file: File,
  sessionToken: string
): Promise<{
  imageId: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
}> {
  if (!file.size || file.size > 5 * 1024 * 1024) {
    throw new Error("Image must be between 1 byte and 5 MB");
  }

  const formData = new FormData();
  formData.append("recipient", recipient);
  formData.append("file", file);

  const response = await fetch(`${API_URL}/api/chat/images`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${sessionToken}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const details = await response.json().catch(() => null);
    throw new Error(
      details?.error || `Image upload failed (${response.status})`
    );
  }

  const result = await response.json();

  if (
    typeof result.imageId !== "string" ||
    !/^[a-fA-F0-9]{24}$/.test(result.imageId) ||
    typeof result.fileName !== "string" ||
    typeof result.mimeType !== "string" ||
    typeof result.fileSize !== "number"
  ) {
    throw new Error("Invalid image upload response");
  }

  return result;
}
export async function uploadFile(userId: string, file: File) {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${API_URL}/api/upload/${userId}`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) throw new Error("File upload failed");
  return response.json();
}

export async function getInternalEmails(
  sessionToken: string,
): Promise<Record<string, unknown>[]> {
  if (!sessionToken) {
    throw new Error("Please sign in before loading email.");
  }

  const response = await fetch(`${API_URL}/api/emails`, {
    headers: {
      Authorization: `Bearer ${sessionToken}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Unable to load email.");
  }

  const data = await response.json();

  if (
    !data ||
    !Array.isArray(data.emails) ||
    !data.emails.every(
      (email: unknown) =>
        email !== null &&
        typeof email === "object" &&
        !Array.isArray(email),
    )
  ) {
    throw new Error("Invalid email response.");
  }

  return data.emails;
}

export async function sendInternalEmail(
  sessionToken: string,
  email: {
    id: string;
    recipient: string;
    subject: string;
    body: string;
    attachmentId?: string;
    attachmentName?: string;
    attachmentSize?: number;
  },
): Promise<Record<string, unknown>> {
  if (!sessionToken) {
    throw new Error("Please sign in before sending email.");
  }

  const response = await fetch(`${API_URL}/api/emails/internal`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${sessionToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(email),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      typeof data?.error === "string"
        ? data.error
        : "Unable to send email.",
    );
  }

  if (
    !data?.email ||
    typeof data.email !== "object" ||
    Array.isArray(data.email)
  ) {
    throw new Error("Invalid email response.");
  }

  return data.email;
}

async function updateInternalEmail(
  sessionToken: string,
  id: string,
  action: "read" | "delete",
): Promise<void> {
  if (!sessionToken) {
    throw new Error("Please sign in before updating email.");
  }

  if (!/^[a-f0-9]{24}$/i.test(id)) {
    throw new Error("Invalid email ID.");
  }

  const path =
    action === "read"
      ? `/api/emails/${id}/read`
      : `/api/emails/${id}`;

  const response = await fetch(`${API_URL}${path}`, {
    method: action === "read" ? "PATCH" : "DELETE",
    headers: {
      Authorization: `Bearer ${sessionToken}`,
    },
  });

  const data = await response.json().catch(() => null);

  if (!response.ok || data?.success !== true) {
    throw new Error(
      typeof data?.error === "string"
        ? data.error
        : "Unable to update email.",
    );
  }
}

export function markInternalEmailRead(
  sessionToken: string,
  id: string,
): Promise<void> {
  return updateInternalEmail(sessionToken, id, "read");
}

export function deleteInternalEmail(
  sessionToken: string,
  id: string,
): Promise<void> {
  return updateInternalEmail(sessionToken, id, "delete");
}

export async function uploadEmailAttachment(
  sessionToken: string,
  recipient: string,
  file: File,
): Promise<{
  attachmentId: string;
  attachmentName: string;
  attachmentSize: number;
}> {
  if (!sessionToken) {
    throw new Error("Please sign in before uploading an attachment.");
  }

  if (file.size === 0 || file.size > 10 * 1024 * 1024) {
    throw new Error("Email attachment must be between 1 byte and 10 MB.");
  }

  const formData = new FormData();
  formData.append("recipient", recipient);
  formData.append("file", file);

  const response = await fetch(`${API_URL}/api/emails/attachments`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${sessionToken}`,
    },
    body: formData,
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      typeof data?.error === "string"
        ? data.error
        : "Unable to upload email attachment.",
    );
  }

  if (
    typeof data?.attachmentId !== "string" ||
    !/^[a-f0-9]{24}$/i.test(data.attachmentId) ||
    typeof data.attachmentName !== "string" ||
    !data.attachmentName.trim() ||
    data.attachmentName.length > 120 ||
    typeof data.attachmentSize !== "number" ||
    !Number.isSafeInteger(data.attachmentSize) ||
    data.attachmentSize !== file.size
  ) {
    throw new Error("Invalid email attachment response.");
  }

  return {
    attachmentId: data.attachmentId,
    attachmentName: data.attachmentName,
    attachmentSize: data.attachmentSize,
  };
}

export async function downloadEmailAttachment(
  sessionToken: string,
  emailId: string,
): Promise<Blob> {
  if (!sessionToken) {
    throw new Error("Please sign in before downloading an attachment.");
  }

  if (!/^[a-f0-9]{24}$/i.test(emailId)) {
    throw new Error("Invalid email ID.");
  }

  const response = await fetch(
    `${API_URL}/api/emails/${emailId}/attachment`,
    {
      headers: {
        Authorization: `Bearer ${sessionToken}`,
      },
      cache: "no-store",
    },
  );

  if (!response.ok) {
    const data = await response.json().catch(() => null);

    throw new Error(
      typeof data?.error === "string"
        ? data.error
        : "Unable to download email attachment.",
    );
  }

  const blob = await response.blob();

  if (blob.size === 0 || blob.size > 10 * 1024 * 1024) {
    throw new Error("Invalid email attachment size.");
  }

  return blob;
}

export interface GroupRecord {
  id: string;
  name: string;
  ownerUsername: string;
  members: string[];
  createdAt: number;
  updatedAt: number;
  unreadCount: number;
}

export type GroupMediaKind = "image" | "file" | "video" | "voice";

export interface GroupMessageRecord {
  id: string;
  groupId: string;
  senderUsername: string;
  kind: "text" | GroupMediaKind;
  text: string;
  at: number;
  readBy: string[];
  mediaId?: string;
  fileName?: string;
  mimeType?: string;
  fileSize?: number;
}

export interface GroupHistoryPage {
  group: GroupRecord;
  messages: GroupMessageRecord[];
  hasMore: boolean;
  nextCursor: string | null;
}

export interface GroupReadReceipt {
  groupId: string;
  username: string;
  messageIds: string[];
}

async function groupRequest<T>(
  path: string,
  sessionToken: string,
  method: "GET" | "POST" = "GET",
  body?: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<T> {
  if (!sessionToken) throw new Error("Authentication required");

  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${sessionToken}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
    signal,
  });

  const result: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const error =
      result &&
      typeof result === "object" &&
      "error" in result &&
      typeof result.error === "string"
        ? result.error
        : `Group request failed (${response.status})`;

    throw new Error(error);
  }

  if (!result || typeof result !== "object") {
    throw new Error("Invalid group response");
  }

  return result as T;
}

export function getGroups(
  sessionToken: string,
  signal?: AbortSignal,
): Promise<{ groups: GroupRecord[] }> {
  return groupRequest("/api/groups", sessionToken, "GET", undefined, signal);
}

export function createGroup(
  sessionToken: string,
  name: string,
  members: string[],
): Promise<{ group: GroupRecord }> {
  return groupRequest("/api/groups", sessionToken, "POST", {
    name,
    members,
  });
}

export function getGroupMessages(
  sessionToken: string,
  groupId: string,
  before?: string,
  signal?: AbortSignal,
): Promise<GroupHistoryPage> {
  const query = before ? `?before=${encodeURIComponent(before)}` : "";

  return groupRequest(
    `/api/groups/${encodeURIComponent(groupId)}/messages${query}`,
    sessionToken,
    "GET",
    undefined,
    signal,
  );
}

export function sendGroupMessage(
  sessionToken: string,
  groupId: string,
  id: string,
  text: string,
): Promise<{ message: GroupMessageRecord }> {
  return groupRequest(
    `/api/groups/${encodeURIComponent(groupId)}/messages`,
    sessionToken,
    "POST",
    { id, kind: "text", text },
  );
}

export function markGroupMessagesRead(
  sessionToken: string,
  groupId: string,
  messageIds: string[],
): Promise<GroupReadReceipt & { success: boolean }> {
  return groupRequest(
    `/api/groups/${encodeURIComponent(groupId)}/read`,
    sessionToken,
    "POST",
    { messageIds },
  );
}

export interface GroupEventMap {
  "group:updated": GroupRecord;
  "group:message": { message: GroupMessageRecord };
  "group:read": GroupReadReceipt;
  connect: undefined;
}

const groupListeners = new Map<
  keyof GroupEventMap,
  Set<(data: unknown) => void>
>();

export function onGroupEvent<K extends keyof GroupEventMap>(
  event: K,
  callback: (data: GroupEventMap[K]) => void,
): () => void {
  const listener = (data: unknown) => {
    callback(data as GroupEventMap[K]);
  };

  const listeners =
    groupListeners.get(event) ?? new Set<(data: unknown) => void>();

  groupListeners.set(event, listeners);
  listeners.add(listener);

  const attachedSocket = socket;
  attachedSocket?.on(String(event), listener);

  return () => {
    listeners.delete(listener);
    attachedSocket?.off(String(event), listener);

    if (socket !== attachedSocket) {
      socket?.off(String(event), listener);
    }

    if (listeners.size === 0 && groupListeners.get(event) === listeners) {
      groupListeners.delete(event);
    }
  };
}

export interface GroupMediaRecord {
  mediaId: string;
  groupId: string;
  kind: GroupMediaKind;
  fileName: string;
  mimeType: string;
  fileSize: number;
}

function groupMediaTypes(kind: GroupMediaKind): string[] {
  switch (kind) {
    case "image":
      return ["image/png", "image/jpeg", "image/gif", "image/webp"];
    case "video":
      return ["video/mp4", "video/webm"];
    case "voice":
      return ["audio/webm", "audio/mp4", "audio/ogg", "audio/wav"];
    case "file":
      return ["application/octet-stream"];
  }
}

export async function uploadGroupMedia(
  sessionToken: string,
  groupId: string,
  kind: GroupMediaKind,
  file: File,
  signal?: AbortSignal,
): Promise<GroupMediaRecord> {
  if (!sessionToken) throw new Error("Authentication required");
  if (!/^[a-f0-9]{24}$/.test(groupId)) {
    throw new Error("Invalid group ID");
  }

  const maxSize =
    (kind === "image" || kind === "voice" ? 5 : 25) * 1024 * 1024;

  if (!file.size || file.size > maxSize) {
    throw new Error(
      `Media must be between 1 byte and ${maxSize / 1024 / 1024} MB`,
    );
  }

  const formData = new FormData();
  formData.append("kind", kind);
  formData.append("file", file);

  const response = await fetch(
    `${API_URL}/api/groups/${encodeURIComponent(groupId)}/media`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${sessionToken}` },
      body: formData,
      signal,
    },
  );

  const result = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      typeof result?.error === "string"
        ? result.error
        : `Media upload failed (${response.status})`,
    );
  }

  if (
    !result ||
    typeof result.mediaId !== "string" ||
    !/^[a-f0-9]{24}$/.test(result.mediaId) ||
    result.groupId !== groupId ||
    result.kind !== kind ||
    typeof result.fileName !== "string" ||
    !groupMediaTypes(kind).includes(result.mimeType) ||
    !Number.isSafeInteger(result.fileSize) ||
    result.fileSize <= 0 ||
    result.fileSize > maxSize
  ) {
    throw new Error("Invalid media upload response");
  }

  return result;
}

export async function fetchGroupMedia(
  sessionToken: string,
  groupId: string,
  mediaId: string,
  kind: GroupMediaKind,
  signal?: AbortSignal,
): Promise<Blob> {
  if (!sessionToken) throw new Error("Authentication required");
  if (
    !/^[a-f0-9]{24}$/.test(groupId) ||
    !/^[a-f0-9]{24}$/.test(mediaId)
  ) {
    throw new Error("Invalid media details");
  }

  const response = await fetch(
    `${API_URL}/api/groups/${encodeURIComponent(groupId)}/media/${encodeURIComponent(mediaId)}`,
    {
      headers: { Authorization: `Bearer ${sessionToken}` },
      cache: "no-store",
      signal,
    },
  );

  if (!response.ok) {
    throw new Error(`Media load failed (${response.status})`);
  }

  const blob = await response.blob();
  const maxSize =
    (kind === "image" || kind === "voice" ? 5 : 25) * 1024 * 1024;

  if (
    !blob.size ||
    blob.size > maxSize ||
    !groupMediaTypes(kind).includes(blob.type)
  ) {
    throw new Error("Invalid media response");
  }

  return blob;
}

export function sendGroupMediaMessage(
  sessionToken: string,
  groupId: string,
  id: string,
  media: GroupMediaRecord,
  text = "",
): Promise<{ message: GroupMessageRecord }> {
  if (media.groupId !== groupId) {
    throw new Error("Media belongs to a different group");
  }

  return groupRequest(
    `/api/groups/${encodeURIComponent(groupId)}/messages`,
    sessionToken,
    "POST",
    {
      id,
      kind: media.kind,
      text,
      mediaId: media.mediaId,
    },
  );
}