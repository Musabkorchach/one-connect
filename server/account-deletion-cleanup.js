import { ObjectId } from "mongodb";
import { trackMailSubmission } from "./account-external-operations.js";
import { identityBindingsCollection } from "./account-identity.js";
import { archiveOwnedGroupsForDeletion } from "./group-ownership.js";
import { removeVerifiedLegacyGroupAccess } from "./legacy-group-management.js";
import { accountAttempts, deletedPstnAttempts } from "./pstn-account.js";

import { deletionFileCandidates } from "./account-file-cleanup.js";
import { scopedBuckets } from "./account-write-fence.js";
export const cleanupPhases = [
  "awaiting-cleanup", "erase-private-data", "remove-message-copies", "remove-group-access", "verify-data-cleanup",
];

const emailOwner = (accountId) => ({ accountScoped: true, $or: [
  { senderAccountId: accountId }, { recipientAccountId: accountId }, { ownerAccountId: accountId },
] });
const chatParty = (accountId) => ({ accountScoped: true, $or: [
  { senderAccountId: accountId }, { recipientAccountId: accountId },
] });

async function collectFiles(db, accountId, username, session) {
  const candidates = db.collection(deletionFileCandidates);
  const add = async (bucket, fileId, groupId, storedId = false) => {
    if (fileId == null) return;
    if (!storedId && !(fileId instanceof ObjectId)) {
      if (typeof fileId !== "string" || !/^[a-f0-9]{24}$/i.test(fileId)) return;
      fileId = new ObjectId(fileId);
    }
    const key = { accountId, bucket, fileId };
    await candidates.updateOne({ _id: key }, {
      $setOnInsert: key, ...(groupId ? { $addToSet: { groupIds: groupId } } : {}),
    }, { upsert: true, session });
  };

  for (const bucket of scopedBuckets) {
    const possibleOwners = [{ "metadata.ownerAccountId": accountId }, { "metadata.recipientAccountId": accountId }];
    if (typeof username === "string" && username) {
      // A legacy name is only enough to flag a file for review, never enough to remove it.
      possibleOwners.push({ "metadata.accountScoped": { $ne: true }, $or: [
        { "metadata.ownerUsername": username }, { "metadata.senderUsername": username },
        { "metadata.recipientUsername": username },
      ] });
    }
    const files = db.collection(bucket + ".files").find({ $or: possibleOwners }, { session, projection: { _id: 1 } });
    for await (const file of files) await add(bucket, file._id, undefined, true);
  }
  for await (const email of db.collection("emails").find(emailOwner(accountId), { session, projection: { attachmentId: 1 } })) {
    await add("email_attachments", email.attachmentId);
  }
  for await (const message of db.collection("messages").find(chatParty(accountId), { session, projection: { attachmentId: 1, imageId: 1 } })) {
    await add("chat_attachments", message.attachmentId);
    await add("chat_images", message.imageId);
  }
  const groupMessages = db.collection("account_group_messages");
  for await (const message of groupMessages.find({ senderAccountId: accountId }, { session, projection: { mediaId: 1 } })) {
    await add("group_media", message.mediaId);
  }
  const groups = db.collection("account_chat_groups").find({ memberAccountIds: accountId }, { session, projection: { _id: 1 } });
  for await (const group of groups) {
    const groupId = group._id.toHexString();
    const media = groupMessages.find({ groupId, mediaId: { $type: "string" } }, { session, projection: { mediaId: 1 } });
    for await (const message of media) await add("group_media", message.mediaId, groupId);
  }
}

async function erasePrivateData(db, accountId, session) {
  const owner = { ownerAccountId: accountId };
  for (const name of ["account_private_state", "account_private_contacts"]) {
    await db.collection(name).deleteMany(owner, { session });
  }
  const logs = db.collection("account_call_logs");
  await logs.deleteMany({ participantAccountIds: [accountId] }, { session });
  await logs.updateMany({ participantAccountIds: accountId }, { $pull: { participantAccountIds: accountId } }, { session });
  const attempts = accountAttempts(db);
  const callbacks = deletedPstnAttempts(db);
  if (await attempts.findOne({ ...owner, state: { $nin: [
    "terminated", "quota-exceeded", "completed", "busy", "no-answer", "failed", "canceled",
  ] } }, { session })) throw new Error("PSTN termination has not been verified");
  for await (const attempt of attempts.find({ ...owner, parentCallSid: { $type: "string" }, quotaKey: { $type: "string" } }, {
    session, projection: { parentCallSid: 1, quotaKey: 1 },
  })) {
    // Preserve only the routing required to charge the original abuse bucket on late positive evidence.
    await callbacks.updateOne({ _id: attempt.parentCallSid },
      { $setOnInsert: { quotaKey: attempt.quotaKey } }, { upsert: true, session });
  }
  await attempts.deleteMany(owner, { session });
}

async function removeMessageCopies(db, accountId, session) {
  const emails = db.collection("emails");
  const chat = db.collection("messages");
  const external = { accountScoped: true, type: "external", ownerAccountId: accountId };
  for await (const { _id } of emails.find({
    ...external, direction: "outgoing", submissionState: { $in: ["submitting", "unknown"] },
  }, { session, projection: { _id: 1 } })) {
    await trackMailSubmission(db, accountId, _id, session);
  }
  await emails.deleteMany(external, { session });
  for (const role of ["sender", "recipient"]) {
    await emails.updateMany({ accountScoped: true, type: "internal", [role + "AccountId"]: accountId },
      { $set: { [role + "Deleted"]: true, [role + "AccountDeleted"]: true },
        $unset: { [role + "Username"]: "", replyToken: "" } }, { session });
    await chat.updateMany({ accountScoped: true, [role + "AccountId"]: accountId },
      { $addToSet: { deletedForAccountIds: accountId }, $unset: { [role + "Username"]: "" } }, { session });
  }
  await emails.deleteMany({ accountScoped: true, type: "internal", ...emailOwner(accountId),
    senderDeleted: true, recipientDeleted: true }, { session });
  await chat.deleteMany({ ...chatParty(accountId), $expr: { $setIsSubset: [
    ["$senderAccountId", "$recipientAccountId"], { $ifNull: ["$deletedForAccountIds", []] },
  ] } }, { session });
}

export async function verifyDataCleanup(db, accountId, session) {
  const checks = [
    ["account_private_state", { ownerAccountId: accountId }],
    ["account_private_contacts", { ownerAccountId: accountId }],
    ["account_pstn_attempts", { ownerAccountId: accountId }],
    ["account_call_logs", { participantAccountIds: accountId }],
    ["emails", { accountScoped: true, $or: [
      { type: "external", ownerAccountId: accountId },
      { type: "internal", senderAccountId: accountId, senderAccountDeleted: { $ne: true } },
      { type: "internal", recipientAccountId: accountId, recipientAccountDeleted: { $ne: true } },
    ] }],
    ["messages", { ...chatParty(accountId), deletedForAccountIds: { $ne: accountId } }],
    ["account_chat_groups", { $or: [
      { memberAccountIds: accountId }, { invitedAccountIds: accountId }, { ownerAccountId: accountId, state: { $ne: "archived" } },
      { "ownershipOffer.fromAccountId": accountId }, { "ownershipOffer.toAccountId": accountId },
    ] }],
  ];
  for (const [name, filter] of checks) {
    if (await db.collection(name).findOne(filter, { session, projection: { _id: 1 } })) {
      throw new Error("Account cleanup verification failed");
    }
  }
  const binding = await db.collection(identityBindingsCollection).findOne({ accountId, state: "deleting" }, { session });
  if (!binding) throw new Error("Account deletion binding is unavailable");
  if (binding.username && await db.collection("email_users").findOne({
    _id: binding.username, groupPiUid: binding._id,
  }, { session }) && await db.collection("chat_groups").findOne({
    $or: [{ members: binding.username }, { admins: binding.username }, { invitations: binding.username }, { "joinRequests.username": binding.username },
      { "ownershipOffer.toAccountId": binding.username }, { ownerUsername: binding.username, state: { $ne: "archived" } }],
  }, { session, projection: { _id: 1 } })) throw new Error("Legacy group access cleanup verification failed");
  await db.collection(identityBindingsCollection).updateOne({ accountId, state: "deleting" },
    { $set: { privateDataErased: true }, $unset: { username: "" } }, { session });
}

export async function cleanDeletionPhase(db, accountId, phase, session) {
  const binding = await db.collection(identityBindingsCollection).findOne({ accountId, state: "deleting" }, { session });
  if (!binding) throw new Error("Account deletion binding is unavailable");
  switch (phase) {
    case "awaiting-cleanup": return collectFiles(db, accountId, binding.username, session);
    case "erase-private-data": return erasePrivateData(db, accountId, session);
    case "remove-message-copies": return removeMessageCopies(db, accountId, session);
    case "remove-group-access": {
      const affected = await db.collection("account_chat_groups").find({
        $or: [{ memberAccountIds: accountId }, { invitedAccountIds: accountId }, { ownerAccountId: accountId }],
      }, { session, projection: { _id: 1, invitedAccountIds: 1 } }).toArray();
      await archiveOwnedGroupsForDeletion(db, accountId, session);
      await db.collection("account_group_messages").updateMany({ readByAccountIds: accountId },
        { $pull: { readByAccountIds: accountId } }, { session });
      return [...affected.map(row => ({ id: row._id, invitees: row.invitedAccountIds ?? [] })),
        ...await removeVerifiedLegacyGroupAccess(db, binding, session)];
    }
    case "verify-data-cleanup": return verifyDataCleanup(db, accountId, session);
  }
}
