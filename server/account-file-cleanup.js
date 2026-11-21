import { ObjectId } from "mongodb";
import { scopedBuckets } from "./account-write-fence.js";

export const deletionFileCandidates = "account_deletion_file_candidates";
export const awaitingFileCleanup = "awaiting-file-cleanup";
export const awaitingFinalReview = "awaiting-final-review";

const references = {
  email_attachments: [["emails", "attachmentId"]],
  chat_attachments: [["messages", "attachmentId"]],
  chat_images: [["messages", "imageId"]],
  group_media: [["account_group_messages", "mediaId"], ["group_messages", "mediaId"]],
};

const accountIdValid = (id) => typeof id === "string" && id.length > 0;
const idPattern = /^[a-f0-9]{24}$/i;

function eligibleParties(row, ids) {
  return ids.every(accountIdValid) && ids[0] !== ids[1] && row.accountScoped === true;
}

async function referenceState(db, name, row, session) {
  if (name === "emails" && row.accountScoped === true) {
    if (row.type === "external" && accountIdValid(row.ownerAccountId) &&
        ["incoming", "outgoing"].includes(row.direction) &&
        (row.senderDeleted === undefined || typeof row.senderDeleted === "boolean")) {
      return row.senderDeleted === true ? "unused" : "retained";
    }
    if (row.type === "internal" && eligibleParties(row, [row.senderAccountId, row.recipientAccountId]) &&
        [row.senderDeleted, row.recipientDeleted].every((flag) => flag === undefined || typeof flag === "boolean")) {
      return row.senderDeleted === true && row.recipientDeleted === true ? "unused" : "retained";
    }
  }
  if (name === "messages" && eligibleParties(row, [row.senderAccountId, row.recipientAccountId])) {
    const hidden = row.deletedForAccountIds ?? [];
    if (Array.isArray(hidden) && hidden.every(accountIdValid)) {
      return hidden.includes(row.senderAccountId) && hidden.includes(row.recipientAccountId) ? "unused" : "retained";
    }
  }
  if (name === "account_group_messages" && typeof row.groupId === "string" && idPattern.test(row.groupId)) {
    const group = await db.collection("account_chat_groups").findOne({ _id: new ObjectId(row.groupId) }, { session });
    if (group && ["active", "archived"].includes(group.state) &&
        Array.isArray(group.memberAccountIds) && group.memberAccountIds.every(accountIdValid)) {
      if (group.memberAccountIds.length) return "retained";
      if (group.state === "archived") return "unused";
    }
  }
  return "blocked";
}

async function inspectReferences(db, bucket, fileId, session) {
  let result = "unused";
  const id = fileId.toHexString();
  for (const [name, field] of references[bucket]) {
    const rows = db.collection(name).find({ [field]: { $in: [fileId, new RegExp("^" + id + "$", "i")] } }, { session });
    for await (const row of rows) {
      if (typeof row[field] !== "string") return "blocked";
      const state = await referenceState(db, name, row, session);
      if (state === "blocked") return state;
      if (state === "retained") result = state;
    }
  }
  return result;
}

async function cleanFile(db, candidate, session) {
  const { bucket, fileId, accountId, groupIds } = candidate;
  if (!scopedBuckets.includes(bucket) || !(fileId instanceof ObjectId)) return "blocked";
  const files = db.collection(bucket + ".files");
  const chunks = db.collection(bucket + ".chunks");
  const ownership = [{ "metadata.ownerAccountId": accountId }, { "metadata.recipientAccountId": accountId }];
  if (bucket === "group_media" && Array.isArray(groupIds) && groupIds.every((id) => typeof id === "string" && idPattern.test(id))) {
    ownership.push({ "metadata.groupId": { $in: groupIds } });
  }
  // The same document is written by every scoped reference creator before inserting its message.
  const file = await files.findOneAndUpdate({
    _id: fileId, "metadata.accountScoped": true,
    $or: ownership,
  }, { $inc: { "metadata.referenceRevision": 1 } }, { session, returnDocument: "after" });

  const state = await inspectReferences(db, bucket, fileId, session);
  if (!file) {
    // A missing file with chunks or references has uncertain provenance.
    if (state !== "unused" || await files.findOne({ _id: fileId }, { session }) ||
        await chunks.findOne({ files_id: fileId }, { session })) return "blocked";
    return "removed";
  }
  if (state !== "unused") return state;
  if (file.metadata.ownerAccountId !== accountId && file.metadata.recipientAccountId !== accountId) {
    // Group ownership alone never authorizes removing another member's pending uploads.
    const group = await db.collection("account_chat_groups").findOne({
      _id: new ObjectId(file.metadata.groupId), state: "archived", memberAccountIds: { $size: 0 },
    }, { session });
    if (!group) return "blocked";
  }

  // GridFSBucket.delete does not accept a session. Delete the GridFS file and chunks
  // in this transaction so a failure rolls both back alongside the candidate outcome.
  await files.deleteOne({ _id: fileId }, { session });
  await chunks.deleteMany({ files_id: fileId }, { session });
  return "removed";
}

export async function reviewDeletionFiles(db, client, accountId, fence, transactionOptions) {
  const candidates = db.collection(deletionFileCandidates);
  const pending = candidates.find({ accountId, result: { $nin: ["removed", "retained"] } }).sort({ _id: 1 });
  for await (const candidate of pending) {
    await client.withSession((session) => session.withTransaction(async () => {
      await fence(session);
      const current = await candidates.findOne({ _id: candidate._id, result: { $nin: ["removed", "retained"] } }, { session });
      if (!current) return;
      const result = await cleanFile(db, current, session);
      await candidates.updateOne({ _id: candidate._id }, { $set: { result } }, { session });
    }, transactionOptions));
  }

  const result = { removed: 0, retained: 0, blocked: 0 };
  for await (const row of candidates.find({ accountId }, { projection: { result: 1 } })) {
    if (row.result === "removed" || row.result === "retained") result[row.result]++;
    else result.blocked++;
  }
  return result;
}

export async function verifyDeletionFiles(db, accountId, expected, session) {
  const candidates = db.collection(deletionFileCandidates);
  const counts = { retained: 0, removed: 0 };
  let valid = true;
  for await (const candidate of candidates.find({ accountId }, { session })) {
    const { bucket, fileId, result } = candidate;
    if (!scopedBuckets.includes(bucket) || !(fileId instanceof ObjectId) ||
        (result !== "removed" && result !== "retained")) {
      valid = false;
      continue;
    }
    const file = await db.collection(bucket + ".files").findOne({ _id: fileId }, { session });
    const reference = await inspectReferences(db, bucket, fileId, session);
    const verified = result === "retained"
      ? file?.metadata?.accountScoped === true && reference === "retained"
      : !file && reference === "unused" && !await db.collection(bucket + ".chunks").findOne({ files_id: fileId }, { session });
    if (verified) counts[result]++;
    else {
      await candidates.updateOne({ _id: candidate._id }, { $unset: { result: "" } }, { session });
      valid = false;
    }
  }
  // Include newly discovered and unproven files in the next review, without inferring ownership from a username.
  for (const bucket of scopedBuckets) {
    const files = db.collection(bucket + ".files").find({
      $or: [{ "metadata.ownerAccountId": accountId }, { "metadata.recipientAccountId": accountId }],
    }, { session, projection: { _id: 1 } });
    for await (const { _id: fileId } of files) {
      const key = { accountId, bucket, fileId };
      const tracked = await candidates.updateOne({ _id: key }, { $setOnInsert: key }, { upsert: true, session });
      if (tracked.upsertedCount) valid = false;
    }
  }
  return valid && expected?.blocked === 0 && expected.removed === counts.removed && expected.retained === counts.retained;
}
