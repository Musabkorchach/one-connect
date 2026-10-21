import io from "socket.io-client";

const API_URL =
  process.env.REACT_APP_API_URL ||
  "https://one-connect.onrender.com";

const WS_URL =
  process.env.REACT_APP_WS_URL ||
  "https://one-connect.onrender.com";

let socket: ReturnType<typeof io> | null = null;
const messageListeners = {
  newMessage: new Set<(message: Record<string, unknown>) => void>(),
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

  for (const callback of messageListeners.newMessage) {
    socket.on("message:new", callback);
  }

  for (const callback of messageListeners.saved) {
    socket.on("message:saved", callback);
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
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
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

/**
 * Initiate WebRTC call
 */
export function initiateCall(from: string, to: string, offer: Record<string, unknown>) {
  if (!socket?.connected) return;
  socket.emit("call:initiate", { from, to, offer });
}

/**
 * Listen for incoming calls
 */
export function onIncomingCall(callback: (data: Record<string, unknown>) => void) {
  if (!socket) return;
  socket.on("call:incoming", callback);
}

/**
 * Answer call
 */
export function answerCall(from: string, to: string, answer: Record<string, unknown>) {
  if (!socket?.connected) return;
  socket.emit("call:answer", { from, to, answer });
}

/**
 * Listen for call answers
 */
export function onCallAnswered(callback: (data: Record<string, unknown>) => void) {
  if (!socket) return;
  socket.on("call:answered", callback);
}

/**
 * Send ICE candidate
 */
export function sendIceCandidate(from: string, to: string, candidate: Record<string, unknown>) {
  if (!socket?.connected) return;
  socket.emit("call:ice-candidate", { from, to, candidate });
}

/**
 * Listen for ICE candidates
 */
export function onIceCandidate(callback: (data: Record<string, unknown>) => void) {
  if (!socket) return;
  socket.on("call:ice-candidate", callback);
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
