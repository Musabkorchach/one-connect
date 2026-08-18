import io from "socket.io-client";

const API_URL =
  process.env.REACT_APP_API_URL ||
  "https://concepts-after-locked-bytes.trycloudflare.com";

const WS_URL =
  process.env.REACT_APP_WS_URL ||
  "wss://concepts-after-locked-bytes.trycloudflare.com";

let socket: ReturnType<typeof io> | null = null;

/**
 * Initialize WebSocket connection
 */
export function initSocket(userId: string, piUsername: string) {
  if (socket?.connected) return socket;

  socket = io(WS_URL, {
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  reconnectionAttempts: 5,
});

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

  return socket;
}

/**
 * Get socket instance
 */
export function getSocket() {
  return socket;
}

/**
 * Disconnect socket
 */
export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
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
export async function getUserContacts(userId: string) {
  const response = await fetch(`${API_URL}/api/contacts/${userId}`);
  if (!response.ok) throw new Error("Failed to fetch contacts");
  return response.json();
}

/**
 * Add contact
 */
export async function addContact(userId: string, username: string, name: string) {
  const response = await fetch(`${API_URL}/api/contacts/${userId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
export function emitMessage(conversationId: string, kind: string, text: string, fileName?: string) {
  if (!socket?.connected) {
    console.error("WebSocket not connected");
    return;
  }

  socket.emit("message:send", { conversationId, kind, text, fileName });
}
export function joinConversation(conversationId: string) {
  if (!socket?.connected) {
    console.error("WebSocket not connected");
    return;
  }

  socket.emit("conversation:join", conversationId);
}

/**
 * Listen for new messages
 */
export function onNewMessage(callback: (message: Record<string, unknown>) => void) {
  if (!socket) return;
  socket.on("message:new", callback);
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
