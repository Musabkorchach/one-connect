import { createHash, randomUUID } from "node:crypto";

export const privateDataOwnerKey = (accountId) => "account-" + createHash("sha256").update(accountId).digest("hex");

export const identityBindingsCollection = "pi_account_bindings";

// MongoDB's unique _id index already enforces one binding per verified Pi UID.
// Export definitions for a future deployment step. This module installs nothing.
export const accountIdentityIndexes = [
  { key: { accountId: 1 }, name: "unique_account_id", unique: true },
];

// The caller must obtain piUid from a trusted Pi verification response.
export async function resolveVerifiedPiAccount(db, piUid, username) {
  if (typeof piUid !== "string" || !piUid.trim() || piUid !== piUid.trim()) {
    throw new TypeError("A verified Pi UID is required");
  }

  const bindings = db.collection(identityBindingsCollection);
  let binding;
  try {
    binding = await bindings.findOneAndUpdate(
      { _id: piUid },
      { $setOnInsert: { accountId: randomUUID(), state: "active" } },
      { upsert: true, returnDocument: "after" },
    );
  } catch (error) {
    // A simultaneous first login may have already inserted this exact UID.
    if (error.code !== 11000 || error.keyPattern?._id !== 1) throw error;
    binding = await bindings.findOne({ _id: piUid });
  }

  if (binding?.state === "deleting") return { state: "deleting" };
  if (binding?.state !== "active" || typeof binding.accountId !== "string") {
    throw new Error("Account binding is unavailable");
  }
  if (username !== undefined) {
    const updated = await bindings.updateOne(
      { _id: piUid, accountId: binding.accountId, state: "active" },
      { $set: { username } },
    );
    if (!updated.matchedCount) return { state: "deleting" };
  }
  return { state: "active", accountId: binding.accountId };
}
