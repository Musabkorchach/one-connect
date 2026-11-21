import { insertWithScopedFile, AccountWriteRejected, accountWrites, respondToBlockedWrite } from "./account-write-fence.js";
import { ObjectId } from "mongodb";
import { migrationRequired } from "./pi-login.js";
import { identityBindingsCollection } from "./account-identity.js";

import {
  createPrivateConversations, isPrivateConversationId, privateConversationFilter,
  privateConversationId, privatePeerForClient,
} from "./account-chat-conversations.js";

const notFound = { code: "CONVERSATION_NOT_FOUND", error: "Conversation not found" };
const peerUnavailable = { code: "CHAT_PEER_UNAVAILABLE", error: "Recipient is unavailable" };

export const legacyChat = { accountScoped: { $ne: true } };
const scopedChat = { accountScoped: true };
const isObjectId = (value) => typeof value === "string" && /^[a-f0-9]{24}$/i.test(value);
const roomName = (id) => `chat:account:${id}`;
const ownsMessage = (id) => ({
  $or: [{ senderAccountId: id }, { recipientAccountId: id }],
});
const visibleTo = (id) => ({ deletedForAccountIds: { $ne: id } });
const unavailable = (binding) => binding?.state === "deleting"
  ? { code: "ACCOUNT_DELETING", error: "Account deletion is in progress" }
  : { code: "ACCOUNT_INACTIVE", error: "Account is not active" };

function metadataScope(senderAccountId, recipientAccountId) {
  return { accountScoped: true, ownerAccountId: senderAccountId, recipientAccountId };
}

function messageForClient(message, viewerId, peer) {
  const fromMe = message.senderAccountId === viewerId;
  return {
    id: message._id.toHexString(),
    conversationId: privateConversationId(message.senderAccountId, message.recipientAccountId),
    fromMe,
    senderUsername: fromMe ? message.senderUsername : peer.username,
    recipientUsername: fromMe ? peer.username : message.recipientUsername,
    kind: message.kind,
    text: message.text,
    fileName: message.fileName,
    imageId: message.imageId,
    attachmentId: message.attachmentId,
    mimeType: message.mimeType,
    fileSize: message.fileSize,
    status: message.status,
    at: message.at,
  };
}

export async function createAccountChat({
  app, io, db, writeAccount, bindAccounts, userSessions, authenticateSession, requireSession,
  normalizeMessagingUsername, chatAttachmentsBucket, chatImagesBucket,
}) {
  if (!bindAccounts) return {
    requireChatSession: requireSession,
    disconnectChatSession: () => {},
  };

  const messages = db.collection("messages");
  const bindings = db.collection(identityBindingsCollection);
  await messages.createIndex({ senderAccountId: 1, clientMessageId: 1 }, {
    name: "unique_account_chat_message",
    unique: true,
    partialFilterExpression: { accountScoped: true, clientMessageId: { $type: "string" } },
  });
  await messages.createIndex({ senderAccountId: 1, recipientAccountId: 1, at: -1 }, {
    name: "account_chat_history",
    partialFilterExpression: scopedChat,
  });
  await messages.createIndex({ recipientAccountId: 1, senderAccountId: 1, at: -1 }, {
    name: "account_chat_recipient_history",
    partialFilterExpression: scopedChat,
  });
  for (const field of ["attachmentId", "imageId"]) {
    await messages.createIndex({ [field]: 1 }, {
      partialFilterExpression: { accountScoped: true, [field]: { $type: "string" } },
    });
  }

  const conversations = createPrivateConversations(db, messages, bindings, writeAccount);
  const chat = io.of("/chat");
  const findBinding = (accountId) => bindings.findOne({ accountId });
  async function findPeer(username, accountId) {
    if (!username) return null;
    const candidates = await bindings.find({ username, state: "active" }).limit(2).toArray();
    return candidates.length === 1 && candidates[0].accountId !== accountId ? candidates[0] : null;
  }

  function requireChatSession(req, res, next) {
    return authenticateSession(req, res, async () => {
      try {
        if (!req.user.accountId) return res.status(409).json(migrationRequired);
        const binding = await findBinding(req.user.accountId);
        if (binding?.state !== "active") return res.status(403).json(unavailable(binding));
        next();
      } catch (error) {
        next(error);
      }
    });
  }

  async function uploadMetadata(accountId, conversationId) {
    const peerId = await conversations.peerIdFor(accountId, conversationId);
    if (!peerId) return null;
    const peer = await findBinding(peerId);
    if (peer?.state !== "active" || !peer.username) return null;
    return { ownership: metadataScope(accountId, peerId), recipientUsername: peer.username };
  }

  async function attachmentAccess(file, field, accountId) {
    const metadata = file?.metadata;
    if (!file) return null;
    if (metadata?.accountScoped !== true) return "migration";
    if (typeof metadata.ownerAccountId !== "string" || typeof metadata.recipientAccountId !== "string" ||
        (metadata.ownerAccountId !== accountId && metadata.recipientAccountId !== accountId)) return null;
    const message = await messages.findOne({
      ...scopedChat,
      ...visibleTo(accountId),
      senderAccountId: metadata.ownerAccountId,
      recipientAccountId: metadata.recipientAccountId,
      kind: field === "imageId" ? "image" : metadata.kind,
      [field]: file._id.toHexString(),
    }, { projection: { _id: 1 } });
    return message ? "allowed" : null;
  }

  async function startConversation(accountId, target) {
    const binding = await findPeer(normalizeMessagingUsername(target), accountId);
    if (!binding) return null;
    const conversationId = await conversations.start(accountId, binding.accountId);
    return { conversationId, peer: privatePeerForClient(binding), canSend: true };
  }

  async function history(accountId, conversationId) {
    const peerId = await conversations.peerIdFor(accountId, conversationId);
    if (!peerId) return null;
    const matching = privateConversationFilter(accountId, peerId);
    const [records, hidden, binding] = await Promise.all([
      messages.find({ ...matching, ...visibleTo(accountId) }).sort({ at: -1, _id: -1 }).limit(200).toArray(),
      messages.find({ ...matching, deletedForAccountIds: accountId })
        .project({ senderUsername: 1, senderAccountId: 1 }).toArray(),
      findBinding(peerId),
    ]);
    const peer = privatePeerForClient(binding);
    const hiddenIds = new Set(hidden.map((message) => message._id.toHexString()));
    return {
      conversationId,
      peer,
      canSend: peer.state === "active",
      messages: records.reverse().filter((message) => !hiddenIds.has(message._id.toHexString()))
        .map((message) => messageForClient(message, accountId, peer)),
      deletedMessages: hidden.map(({ _id, senderAccountId, senderUsername }) => ({
        id: _id.toHexString(), senderUsername: senderAccountId === accountId ? senderUsername : peer.username,
      })),
      legacyHistory: migrationRequired,
    };
  }

  app.get("/api/chat/conversations", requireChatSession, async (req, res, next) => {
    try {
      res.set("Cache-Control", "private, no-store");
      const items = await conversations.list(req.user.accountId);
      const binding = await findBinding(req.user.accountId);
      if (binding?.state !== "active") return res.status(403).json(unavailable(binding));
      return res.json({
        conversations: items,
        legacyHistory: migrationRequired,
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/chat/conversations", requireChatSession, async (req, res, next) => {
    try {
      const result = await startConversation(req.user.accountId, req.body?.username);
      const binding = await findBinding(req.user.accountId);
      if (binding?.state !== "active") return res.status(403).json(unavailable(binding));
      return result ? res.json(result) : res.status(404).json(peerUnavailable);
    } catch (error) {
      if (!respondToBlockedWrite(error, res)) next(error);
    }
  });

  app.get("/api/chat/conversations/:conversationId", requireChatSession, async (req, res, next) => {
    try {
      const { conversationId } = req.params;
      if (!isPrivateConversationId(conversationId)) return res.status(400).json({ error: "Invalid conversation ID" });
      res.set("Cache-Control", "private, no-store");
      const result = await history(req.user.accountId, conversationId);
      const binding = await findBinding(req.user.accountId);
      if (binding?.state !== "active") return res.status(403).json(unavailable(binding));
      return result ? res.json(result) : res.status(404).json(notFound);
    } catch (error) {
      next(error);
    }
  });

  async function deleteMessage(req, res, next) {
    try {
      const { accountId } = req.user;
      const { messageId } = req.params;
      if (!isObjectId(messageId)) return res.status(400).json({ error: "Invalid message ID" });
      const key = { _id: new ObjectId(messageId), ...scopedChat, ...ownsMessage(accountId) };
      const result = await accountWrites(messages, writeAccount, accountId).findOneAndUpdate(key, { $addToSet: { deletedForAccountIds: accountId } });
      if (!result) {
        const legacy = await messages.findOne({ _id: key._id, ...legacyChat }, { projection: { _id: 1 } });
        return legacy ? res.status(409).json(migrationRequired)
          : res.status(404).json({ error: "Message not found" });
      }
      const peer = result.senderAccountId === accountId ? null : privatePeerForClient(await findBinding(result.senderAccountId));
      await publish(accountId, "message:deleted", {
        id: messageId, conversationId: privateConversationId(result.senderAccountId, result.recipientAccountId),
        senderUsername: peer ? peer.username : result.senderUsername,
      });
      return res.json({ success: true });
    } catch (error) {
      if (!respondToBlockedWrite(error, res)) next(error);
    }
  }

  async function checkActive(accountId) {
    const target = chat.to(roomName(accountId));
    const state = await findBinding(accountId);
    if (state?.state === "active") return true;
    target.emit("chat:unavailable", unavailable(state));
    target.disconnectSockets();
    return false;
  }

  async function publish(accountId, event, payload) {
    try {
      if (await checkActive(accountId)) chat.to(roomName(accountId)).emit(event, payload);
    } catch (error) {
      console.error("[CHAT EVENT ERROR]", error);
    }
  }

  chat.use(async (socket, next) => {
    const token = socket.handshake.auth?.sessionToken;
    const session = typeof token === "string" && userSessions.get(token);
    if (!session?.accountId || session.expiresAt <= Date.now()) return next(new Error("Invalid session"));
    try {
      const binding = await findBinding(session.accountId);
      if (binding?.state !== "active") {
        const info = unavailable(binding);
        const error = new Error(info.error);
        error.data = { code: info.code };
        return next(error);
      }
      socket.data.sessionToken = token;
      next();
    } catch (error) {
      console.error("[CHAT AUTH ERROR]", error);
      next(new Error("Chat authentication failed"));
    }
  });

  chat.on("connection", (socket) => {
    const { sessionToken } = socket.data;
    const session = userSessions.get(sessionToken);
    if (!session?.accountId) return socket.disconnect();
    const { accountId } = session;
    const current = () => socket.connected && session === userSessions.get(sessionToken) && session.expiresAt > Date.now();
    if (!current()) return socket.disconnect();
    socket.join(roomName(accountId));
    const expiry = setTimeout(() => socket.disconnect(), session.expiresAt - Date.now());
    expiry.unref();
    socket.once("disconnect", () => clearTimeout(expiry));

    const on = (event, errorEvent, handler) => {
      socket.on(event, async (payload) => {
        try {
          if (current() && await checkActive(accountId) && current()) await handler(payload);
        } catch (error) {
          if (!(error instanceof AccountWriteRejected)) console.error("[CHAT REQUEST ERROR]", error);
          if (current() && error instanceof AccountWriteRejected) return socket.emit(errorEvent, { code: error.code, error: error.message });
          if (current()) socket.emit(errorEvent, { error: "Chat operation failed" });
        }
      });
    };
    const actorActive = async () => current() && await checkActive(accountId) && current();

    on("conversation:start", "conversation:error", async (username) => {
      const result = await startConversation(accountId, username);
      if (!(await actorActive())) return;
      if (result) socket.emit("conversation:started", result);
      else socket.emit("conversation:error", peerUnavailable);
    });

    on("conversation:join", "conversation:error", async (conversationId) => {
      const result = await history(accountId, conversationId);
      if (!(await actorActive())) return;
      if (result) socket.emit("conversation:messages", result);
      else socket.emit("conversation:error", notFound);
    });

    on("message:send", "message:error", async (data) => {
      const { conversationId, kind, text, messageId, imageId, attachmentId } = data ?? {};
      const id = typeof messageId === "string" && /^[a-z0-9_-]{1,100}$/i.test(messageId) ? messageId : undefined;
      const fail = (error, code) => socket.emit("message:error", { id, error, code });
      if (!id || !["text", "image", "file", "video", "voice"].includes(kind) ||
          typeof text !== "string" || text.length > 10000) return fail("Invalid message");
      const peerId = await conversations.peerIdFor(accountId, conversationId);
      if (!peerId) return fail(notFound.error, notFound.code);
      const peer = await findBinding(peerId);
      if (peer?.state !== "active" || !peer.username) return fail(peerUnavailable.error, peerUnavailable.code);
      const recipientUsername = peer.username;

      const image = kind === "image";
      const file = ["file", "video", "voice"].includes(kind);
      const assetId = image ? imageId : attachmentId;
      if (((image || file) && !isObjectId(assetId)) || (!image && imageId !== undefined) ||
          (!file && attachmentId !== undefined)) return fail("Invalid attachment");
      const asset = image || file ? await (image ? chatImagesBucket : chatAttachmentsBucket).find({
        _id: new ObjectId(assetId),
        "metadata.accountScoped": true,
        "metadata.ownerAccountId": accountId,
        "metadata.recipientAccountId": peer.accountId,
        ...(file ? { "metadata.kind": kind } : {}),
      }).next() : null;
      if ((image || file) && !asset) return fail("Attachment is unavailable for this conversation");
      if (!(await checkActive(peer.accountId))) return fail("Recipient is unavailable");
      if (!(await actorActive())) return;

      const record = {
        _id: new ObjectId(),
        ...scopedChat,
        clientMessageId: id,
        conversationId,
        senderAccountId: accountId,
        recipientAccountId: peer.accountId,
        senderUsername: normalizeMessagingUsername(session.piUsername),
        recipientUsername,
        kind, text, status: "sent", at: Date.now(),
        ...(asset ? {
          [image ? "imageId" : "attachmentId"]: asset._id.toHexString(),
          fileName: asset.filename, mimeType: asset.metadata.mimeType, fileSize: asset.length,
        } : {}),
      };
      let saved = record;
      let inserted = true;
      try {
        await insertWithScopedFile(db, writeAccount, [accountId, peer.accountId], messages, record,
          image ? "chat_images" : "chat_attachments", asset?._id);
      } catch (error) {
        if (error.code !== 11000) throw error;
        inserted = false;
        saved = await messages.findOne({ ...scopedChat, senderAccountId: accountId, clientMessageId: id });
        if (!saved || saved.recipientAccountId !== peer.accountId || saved.kind !== kind || saved.text !== text ||
            saved.imageId !== record.imageId || saved.attachmentId !== record.attachmentId) {
          return fail("Message ID is already used");
        }
      }
      if (await actorActive()) {
        socket.emit("message:saved", { id, conversationId, messageId: saved._id.toHexString(), status: saved.status,
          hidden: saved.deletedForAccountIds?.includes(accountId) ?? false });
      }
      if (inserted) await publish(peer.accountId, "message:new", messageForClient(saved, peer.accountId, privatePeerForClient({
        state: "active", username: record.senderUsername,
      })));
    });

    on("message:receipt", "message:error", async (payload) => {
      const { ids, status } = payload ?? {};
      if (!["delivered", "read"].includes(status) || !Array.isArray(ids) ||
          !ids.length || ids.length > 120 || !ids.every(isObjectId)) return;
      const filter = {
        ...scopedChat,
        _id: { $in: [...new Set(ids)].map((id) => new ObjectId(id)) },
        recipientAccountId: accountId,
        ...visibleTo(accountId),
      };
      await accountWrites(messages, writeAccount, accountId).updateMany({
        ...filter,
        status: { $in: status === "read" ? ["sent", "delivered"] : ["sent"] },
      }, { $set: { status } });
      const confirmed = await messages.find({ ...filter, status: { $in: ["delivered", "read"] } }).toArray();
      if (!(await actorActive())) return;
      await Promise.all(confirmed
        .filter((message) => !message.deletedForAccountIds?.includes(message.senderAccountId))
        .map((message) => publish(message.senderAccountId, "message:status", {
          id: message._id.toHexString(),
          conversationId: privateConversationId(message.senderAccountId, message.recipientAccountId),
          recipientUsername: message.recipientUsername,
          status: message.status,
        })));
    });
  });

  function disconnectChatSession(token) {
    for (const socket of chat.sockets.values()) {
      if (socket.data.sessionToken === token) socket.disconnect();
    }
  }

  return { requireChatSession, disconnectChatSession, uploadMetadata, attachmentAccess, deleteMessage };
}
