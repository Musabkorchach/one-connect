import crypto from "node:crypto";
import twilio from "twilio";
import { identityBindingsCollection } from "./account-identity.js";
import { getPstnConfig } from "./pstn-config.js";

export const accountAttempts = (db) => db.collection("account_pstn_attempts");
export const deletedPstnAttempts = (db) => db.collection("deleted_pstn_callback_routes");
export const accountBinding = (db, accountId) => db.collection(identityBindingsCollection).findOne({ accountId });
export const pstnAbuseKey = (secret, piUid) => crypto.createHmac("sha256", secret).update(String(piUid)).digest("hex");

export function pstnDailyQuota(secret, piUid, now) {
  const day = new Date(now).toISOString().slice(0, 10);
  const key = `pi:${day}:${pstnAbuseKey(secret, piUid)}`;
  return {
    key,
    attemptKey: `attempt:${key}`,
    quotaResetsAt: Date.parse(day) + 86_400_000,
  };
}

export async function terminateAccountPstn(db, accountId, completeCall = defaultCompleteCall, ownsLease = async () => true) {
  const binding = await accountBinding(db, accountId);
  if (binding?.state !== "deleting") return;
  const attempts = accountAttempts(db);
  await attempts.updateMany({ ownerAccountId: accountId, state: { $in: ["preparing", "ready"] } },
    { $set: { state: "terminated", endedAt: Date.now() } });
  await attempts.updateMany({ ownerAccountId: accountId, state: "dialing" }, { $set: { state: "termination-pending" } });
  const pending = await attempts.find({ ownerAccountId: accountId, state: "termination-pending" }).toArray();
  for (const attempt of pending) {
    if (!await ownsLease()) throw new Error("Deletion lease expired");
    await completeCall(attempt.parentCallSid);
    await attempts.updateOne({ _id: attempt._id, ownerAccountId: accountId, state: "termination-pending" },
      { $set: { state: "terminated", endedAt: Date.now() }, $unset: { voiceXml: "" } });
  }
}

async function defaultCompleteCall(callSid) {
  const config = getPstnConfig(true);
  if (!config || !/^CA[a-f0-9]{32}$/i.test(callSid)) throw new Error("PSTN termination is unavailable");
  const call = twilio(config.accountSid, config.authToken).calls(callSid);
  const info = await call.fetch();
  const terminal = ["completed", "busy", "failed", "no-answer", "canceled"];
  if (terminal.includes(info.status)) return;
  const updated = await call.update({ status: ["queued", "ringing", "initiated"].includes(info.status) ? "canceled" : "completed" });
  if (!terminal.includes(updated.status) && !terminal.includes((await call.fetch()).status)) {
    throw new Error("PSTN termination has not been confirmed");
  }
}
