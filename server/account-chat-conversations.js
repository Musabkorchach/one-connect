import { accountWrites } from "./account-write-fence.js";
import { createHash } from "node:crypto";

export function privateConversationId(first, second) {
  return createHash("sha256").update(JSON.stringify([first, second].sort())).digest("hex");
}

export const isPrivateConversationId = (value) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);

export function privateConversationFilter(accountId, peerId) {
  return {
    accountScoped: true,
    $or: [
      { senderAccountId: accountId, recipientAccountId: peerId },
      { senderAccountId: peerId, recipientAccountId: accountId },
    ],
  };
}

export function privatePeerForClient(binding) {
  if (binding?.state === "active" && binding.username) {
    return { state: "active", label: binding.username, username: binding.username };
  }
  return binding?.state === "deleting" && !binding.privateDataErased
    ? { state: "deleting", label: "الحساب قيد الحذف", username: null }
    : { state: "deleted", label: "حساب محذوف", username: null };
}

export function createPrivateConversations(db, messages, bindings, writeAccount) {
  const conversations = db.collection("account_chat_conversations");

  function peerMessages(accountId, visibleOnly) {
    return messages.aggregate([
      { $match: {
        accountScoped: true,
        $or: [{ senderAccountId: accountId }, { recipientAccountId: accountId }],
        ...(visibleOnly ? { deletedForAccountIds: { $ne: accountId } } : {}),
      } },
      ...(visibleOnly ? [{ $sort: { at: -1, _id: -1 } }] : []),
      { $group: {
        _id: { $cond: [{ $eq: ["$senderAccountId", accountId] }, "$recipientAccountId", "$senderAccountId"] },
        latestAt: { $max: "$at" },
        ...(visibleOnly && {
          last: { $first: {
            id: { $toString: "$_id" }, kind: "$kind", text: "$text", fileName: "$fileName", at: "$at", status: "$status",
            fromMe: { $eq: ["$senderAccountId", accountId] },
          } },
          unread: { $sum: { $cond: [{ $and: [{ $eq: ["$recipientAccountId", accountId] }, { $ne: ["$status", "read"] }] }, 1, 0] } },
        }),
      } },
      { $match: { _id: { $type: "string", $ne: accountId } } },
      { $sort: { latestAt: -1, _id: 1 } },
    ]);
  }

  async function start(accountId, peerId) {
    const _id = privateConversationId(accountId, peerId);
    const accountIds = [accountId, peerId].sort();
    await accountWrites(conversations, writeAccount, [accountId, peerId]).updateOne({ _id }, { $setOnInsert: { accountIds } }, { upsert: true });
    return _id;
  }

  async function peerIdFor(accountId, conversationId) {
    if (!isPrivateConversationId(conversationId)) return null;
    const conversation = await conversations.findOne({ _id: conversationId });
    if (conversation) {
      return conversation.accountIds.includes(accountId)
        ? conversation.accountIds.find((id) => id !== accountId)
        : null;
    }
    // Earlier account-scoped messages already prove membership in the pair.
    // Resolve them at read time without rewriting any stored records.
    for await (const { _id: peerId } of peerMessages(accountId, false)) {
      if (privateConversationId(accountId, peerId) === conversationId) return peerId;
    }
    return null;
  }

  async function list(accountId) {
    const entries = await peerMessages(accountId, true).toArray();
    const peers = entries.length ? await bindings.find(
      { accountId: { $in: entries.map((entry) => entry._id) } },
      { projection: { accountId: 1, username: 1, state: 1, privateDataErased: 1 } },
    ).toArray() : [];
    const byId = new Map(peers.map((peer) => [peer.accountId, peer]));
    return entries.map(({ _id: peerId, latestAt, last, unread }) => {
      const peer = privatePeerForClient(byId.get(peerId));
      return { conversationId: privateConversationId(accountId, peerId), peer, canSend: peer.state === "active", latestAt, last, unread };
    });
  }

  return { start, list, peerIdFor };
}
