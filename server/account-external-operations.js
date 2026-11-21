import { createHash } from "node:crypto";

export const externalOperations = (db) => db.collection("account_external_operations");

export function mailQuotaKey(piUid, day) {
  const identity = createHash("sha256").update("one-connect-mail-quota\0").update(piUid).digest("hex");
  return `pi:${day}:${identity}`;
}

export async function carryMailQuota(db, accountId, piUid, day, session) {
  const usage = db.collection("external_email_usage");
  const prior = await usage.findOne({ _id: `account:${accountId}:${day}` }, { session });
  const key = mailQuotaKey(piUid, day);
  if (Number.isSafeInteger(prior?.count) && prior.count > 0) {
    await usage.updateOne({ _id: key }, { $max: { count: prior.count } }, { upsert: true, session });
  }
  return key;
}

export function trackMailSubmission(db, accountId, messageId, session) {
  return externalOperations(db).updateOne({ _id: messageId, accountId }, {
    $setOnInsert: { kind: "mail-submission", state: "pending" },
  }, { upsert: true, session });
}

export function settleMailSubmission(db, accountId, messageId) {
  return externalOperations(db).updateOne({ _id: messageId, accountId, state: "pending" },
    { $set: { state: "settled" } });
}
