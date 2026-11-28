import { AccountChatError, createAccountChatSocket, requestAccountChat } from "@/lib/api-client";
import type { Message, MsgKind } from "@/lib/connect/data";

export type ChatConnectionStatus = "connecting" | "connected" | "offline" | "deleting" | "inactive" | "migration";
type Peer = { state: "active" | "deleting" | "deleted"; label: string; username: string | null };
export type PrivateConversation = {
  conversationId: string; peer: Peer; canSend: boolean; latestAt?: number; last?: Message; unread?: number;
};
export type PrivateHistory = PrivateConversation & { messages: Message[] };

const migration = "ACCOUNT_MIGRATION_REQUIRED";
const validConversationId = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
const validMessageId = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{24}$/.test(value);
const kinds = new Set(["text", "file", "image", "video", "voice"]);
const statuses = new Set(["sent", "delivered", "read"]);

function conversationFrom(data: unknown): PrivateConversation {
  const value = data as Partial<PrivateConversation> | null;
  const peer = value?.peer;
  if (!validConversationId(value?.conversationId) || !peer ||
      !["active", "deleting", "deleted"].includes(peer.state) || typeof peer.label !== "string" ||
      (peer.state === "active" ? typeof peer.username !== "string" || !peer.username : peer.username !== null)) {
    throw new Error("Invalid conversation response.");
  }
  const { latestAt, last, unread } = value;
  const validLast = last && validMessageId(last.id) && kinds.has(last.kind) && statuses.has(last.status) &&
    typeof last.text === "string" && typeof last.fromMe === "boolean" && Number.isSafeInteger(last.at);
  return { conversationId: value.conversationId, peer, canSend: peer.state === "active" && value.canSend === true,
    ...(typeof latestAt === "number" && Number.isSafeInteger(latestAt) && { latestAt }),
    ...(validLast && { last }),
    ...(typeof unread === "number" && Number.isSafeInteger(unread) && unread >= 0 && { unread }) };
}

function scopedData(data: unknown) {
  const value = data as { legacyHistory?: { code?: string }; conversations?: unknown; messages?: unknown } | null;
  if (value?.legacyHistory?.code !== migration) throw new AccountChatError(migration, "Account migration is required.");
  return value;
}

type ChatOptions = {
  sessionToken: string;
  isCurrent: () => boolean;
  onList: (conversations: PrivateConversation[]) => void;
  onSelection: (id: string | null) => void;
  onHistory: (history: PrivateHistory) => void;
  onStatus: (status: ChatConnectionStatus) => void;
  onError: (message: string) => void;
};

export function startPrivateChat({ sessionToken, isCurrent, onList, onSelection, onHistory, onStatus, onError }: ChatOptions) {
  const socket = createAccountChatSocket(sessionToken);
  const lifetime = new AbortController();
  let selection: { id: string; abort: AbortController; refresh: () => void } | null = null;
  let starting: AbortController | null = null;
  const readIds = new Set<string>();
  const pending = new Map<string, { conversationId: string; settle: (error?: string) => void }>();
  const current = () => !lifetime.signal.aborted && isCurrent();
  const isSelected = (id: string) => current() && selection?.id === id;

  function close() {
    if (lifetime.signal.aborted) return;
    lifetime.abort();
    selection?.abort.abort();
    starting?.abort();
    socket.removeAllListeners();
    socket.disconnect();
    for (const action of pending.values()) action.settle("Chat session ended.");
  }

  function terminal(code: unknown) {
    const status = code === "ACCOUNT_DELETING" ? "deleting"
      : code === "ACCOUNT_INACTIVE" ? "inactive" : code === migration ? "migration" : null;
    if (status && current()) {
      close();
      onList([]);
      onSelection(null);
      onStatus(status);
    }
    return Boolean(status);
  }

  function handleError(error: unknown) {
    if (error instanceof AccountChatError && terminal(error.code)) return;
    onError(error instanceof Error ? error.message : "Chat request failed.");
  }

  function refreshTask<T>(signal: AbortSignal, load: () => Promise<T>, apply: (value: T) => void) {
    let busy = false;
    let pendingRefresh = false;
    const alive = () => current() && !signal.aborted;
    return function refresh() {
      if (!alive()) return;
      pendingRefresh = true;
      if (busy) return;
      busy = true;
      void (async () => {
        try {
          while (alive() && pendingRefresh) {
            pendingRefresh = false;
            try {
              const result = await load();
              if (alive() && !pendingRefresh) apply(result);
            } catch (error) {
              if (alive()) handleError(error);
            }
          }
        } finally {
          busy = false;
        }
      })();
    };
  }

  const refreshList = refreshTask(lifetime.signal, async () => {
    const data = scopedData(await requestAccountChat(sessionToken, lifetime.signal));
    if (!Array.isArray(data.conversations)) throw new Error("Invalid conversation list.");
    return [...new Map(data.conversations.map((entry) => {
      const conversation = conversationFrom(entry);
      return [conversation.conversationId, conversation] as const;
    })).values()];
  }, onList);

  function select(id: string | null) {
    if (!current()) return;
    starting?.abort();
    if (selection?.id === id) return;
    selection?.abort.abort();
    selection = null;
    readIds.clear();
    onSelection(id);
    if (!validConversationId(id)) return;
    const abort = new AbortController();
    const refresh = refreshTask(abort.signal, async () => {
      const data = scopedData(await requestAccountChat(sessionToken, abort.signal, { conversationId: id }));
      const conversation = conversationFrom(data);
      if (conversation.conversationId !== id || !Array.isArray(data.messages)) throw new Error("Invalid conversation history.");
      const messages = new Map<string, Message>();
      for (const message of data.messages) {
        if (!validMessageId(message?.id) || message.conversationId !== id || typeof message.fromMe !== "boolean" ||
            !kinds.has(message.kind) || !statuses.has(message.status) || typeof message.text !== "string" ||
            !Number.isSafeInteger(message.at)) throw new Error("Invalid chat message.");
        messages.set(message.id, message);
      }
      return { ...conversation, messages: [...messages.values()] };
    }, onHistory);
    selection = { id, abort, refresh };
    refresh();
  }

  async function start(username: string) {
    if (!current()) return;
    starting?.abort();
    const abort = new AbortController();
    starting = abort;
    try {
      const result = await requestAccountChat(sessionToken, abort.signal, { username });
      if (current() && !abort.signal.aborted) select(conversationFrom(result).conversationId);
    } catch (error) {
      if (current() && !abort.signal.aborted) handleError(error);
    } finally {
      if (starting === abort) starting = null;
    }
  }

  function refresh(conversationId?: string) {
    if (!current()) return;
    refreshList();
    if (!conversationId || selection?.id === conversationId) selection?.refresh();
  }

  function send(conversationId: string, message: {
    messageId: string; kind: MsgKind; text: string; imageId?: string; attachmentId?: string;
  }) {
    if (!isSelected(conversationId) || !socket.connected) return Promise.reject(new Error("Chat is offline."));
    if (pending.has(message.messageId)) return Promise.reject(new Error("Message is already sending."));
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => settle("Delivery could not be confirmed. You can retry."), 10000);
      function settle(error?: string) {
        clearTimeout(timer);
        pending.delete(message.messageId);
        if (error) reject(new Error(error));
        else resolve();
      }
      pending.set(message.messageId, { conversationId, settle });
      socket.emit("message:send", { ...message, conversationId });
    });
  }

  function markRead(conversationId: string, messages: Message[]) {
    if (!isSelected(conversationId) || !socket.connected) return;
    const ids = messages.filter((message) => !message.fromMe && message.status !== "read" && !readIds.has(message.id))
      .map((message) => message.id);
    for (const id of ids) readIds.add(id);
    for (let index = 0; index < ids.length; index += 120) {
      socket.emit("message:receipt", { ids: ids.slice(index, index + 120), status: "read" });
    }
  }

  socket.on("connect", () => {
    if (!current()) return;
    readIds.clear();
    onStatus("connected");
    refresh();
  });
  socket.on("connect_error", (error) => {
    const data = (error as Error & { data?: { code?: unknown } }).data;
    if (current() && !terminal(data?.code)) onStatus("offline");
  });
  socket.on("disconnect", () => {
    if (current()) onStatus("offline");
  });
  socket.on("chat:unavailable", (data) => terminal(data?.code));
  for (const event of ["message:new", "message:status", "message:deleted"]) {
    socket.on(event, (data) => {
      if (validConversationId(data?.conversationId)) refresh(data.conversationId);
    });
  }
  socket.on("message:saved", (data) => {
    if (!current() || !validConversationId(data?.conversationId)) return;
    const action = pending.get(data.id);
    if (action?.conversationId === data.conversationId) action?.settle();
    refresh(data.conversationId);
  });
  socket.on("message:error", (data) => {
    if (!current()) return;
    pending.get(data?.id)?.settle(typeof data?.error === "string" ? data.error : "Message could not be sent.");
    if (data?.code === "CHAT_PEER_UNAVAILABLE" || data?.code === "CONVERSATION_NOT_FOUND") refresh();
  });
  socket.connect();
  refreshList();

  return { close, select, start, send, markRead, isSelected, refresh, signal: lifetime.signal };
}
