import { ObjectId } from "mongodb";
import { identityBindingsCollection } from "./account-identity.js";

export class AccountWriteRejected extends Error {
  constructor() {
    super("Account is no longer active");
    this.code = "ACCOUNT_WRITE_BLOCKED";
  }
}

export async function fenceActiveAccounts(db, ids, session) {
  const bindings = db.collection(identityBindingsCollection);
  for (const accountId of [...new Set(ids.filter(Boolean))].sort()) {
    // An actual write creates a conflict with the transaction that starts deletion.
    const result = await bindings.updateOne({ accountId, state: "active" },
      { $inc: { accountWriteFence: 1 } }, { session });
    if (!result.matchedCount) throw new AccountWriteRejected();
  }
}

export function createAccountWriteFence(db, client) {
  return async (ids, execute) => {
    const accounts = (Array.isArray(ids) ? ids : [ids]).filter(Boolean);
    if (!accounts.length) return execute(undefined);
    return client.withSession((session) => session.withTransaction(async () => {
      await fenceActiveAccounts(db, accounts, session);
      return execute(session);
    }, { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" } }));
  };
}

export function respondToBlockedWrite(error, res) {
  if (!(error instanceof AccountWriteRejected)) return false;
  if (!res.headersSent) res.status(403).json({ code: error.code, error: error.message });
  return true;
}

export function accountWrites(collection, write, accounts) {
  const optionsIndex = { insertOne: 1, updateOne: 2, updateMany: 2, findOneAndUpdate: 2 };
  return Object.fromEntries(Object.entries(optionsIndex).map(([method, index]) => [method, (...args) =>
    write(accounts, (session) => {
      const options = args[index];
      if (session) args[index] = { ...options, session };
      return collection[method](...args);
    }),
  ]));
}

// A reference and the write to its GridFS file must commit together.
export function insertWithScopedFile(db, write, accounts, collection, record, bucket, fileId) {
  return write(accounts, async (session) => {
    if (session && fileId) {
      const file = await db.collection(bucket + ".files").updateOne({
        _id: new ObjectId(fileId), "metadata.accountScoped": true,
      }, { $inc: { "metadata.referenceRevision": 1 } }, { session });
      if (!file.matchedCount) {
        const error = new AccountWriteRejected();
        error.code = "FILE_REFERENCE_UNAVAILABLE";
        error.message = "The attachment is unavailable";
        throw error;
      }
    }
    return collection.insertOne(record, { session });
  });
}

export const scopedBuckets = ["group_media", "email_attachments", "chat_images", "chat_attachments"];
const chunkSize = 255 * 1024;

export async function prepareScopedBuckets(db) {
  await Promise.all(scopedBuckets.map((name) =>
    db.collection(name + ".chunks").createIndex({ files_id: 1, n: 1 }, { unique: true })));
}

// GridFSBucket uploads cannot participate in a transaction. Write the standard
// files/chunks documents together so a fenced upload is visible only on commit.
export async function saveScopedFile(db, write, accounts, bucket, filename, buffer, metadata) {
  if (!scopedBuckets.includes(bucket)) throw new Error("Invalid scoped bucket");
  const id = new ObjectId();
  const chunks = [];
  for (let offset = 0; offset < buffer.length; offset += chunkSize) {
    chunks.push({ _id: new ObjectId(), files_id: id, n: chunks.length, data: buffer.subarray(offset, offset + chunkSize) });
  }
  await write(accounts, async (session) => {
    if (chunks.length) await db.collection(bucket + ".chunks").insertMany(chunks, { session });
    await db.collection(bucket + ".files").insertOne({
      _id: id, filename, length: buffer.length, chunkSize, uploadDate: new Date(), metadata,
    }, { session });
  });
  return id;
}
