import { randomUUID } from "node:crypto";
import { identityBindingsCollection } from "./account-identity.js";

import { carryMailQuota, externalOperations } from "./account-external-operations.js";
import { cleanupPhases, cleanDeletionPhase, verifyDataCleanup } from "./account-deletion-cleanup.js";
import { awaitingFileCleanup, awaitingFinalReview, reviewDeletionFiles, verifyDeletionFiles } from "./account-file-cleanup.js";

export const deletionCollection = "account_deletion_jobs";

const phases = ["revoke-access", "stop-calls", ...cleanupPhases, awaitingFileCleanup, awaitingFinalReview];

export function createAccountDeletion({ db, client, revokeAccess, stopCalls, publishGroupCleanup, now = Date.now, leaseMs = 30000 }) {
  const jobs = db.collection(deletionCollection);
  const bindings = db.collection(identityBindingsCollection);
  const transactionOptions = { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" } };

  async function enqueue(accountId, authorize) {
    if (typeof accountId !== "string" || !accountId.trim()) throw new TypeError("Account ID is required");
    return client.withSession((session) => session.withTransaction(async () => {
      if (authorize) await authorize(session);
      const prior = await jobs.findOne({ _id: accountId }, { session });
      if (prior) return prior;
      const startedAt = now();
      const transitioned = await bindings.updateOne({ accountId, state: "active" },
        { $set: { state: "deleting", deletingAt: startedAt } }, { session });
      if (!transitioned.matchedCount) throw new Error("Account cannot enter deletion");
      const newJob = { _id: accountId, jobId: randomUUID(), phase: phases[0], startedAt, updatedAt: startedAt,
        externalOperationsTracked: true, attempts: { "revoke-access": 0, "stop-calls": 0 }, errors: [] };
      await jobs.insertOne(newJob, { session });
      return newJob;
    }, transactionOptions));
  }

  async function start(accountId) {
    const record = await enqueue(accountId);
    await run(record._id);
    return jobs.findOne({ _id: record._id });
  }

  async function step(accountId) {
    const takenAt = now();
    const leaseId = randomUUID();
    const job = await jobs.findOneAndUpdate({
      _id: accountId, phase: { $in: phases },
      $or: [{ lease: { $exists: false } }, { "lease.until": { $lte: takenAt } }],
    }, { $set: { lease: { id: leaseId, until: takenAt + leaseMs }, updatedAt: takenAt } }, { returnDocument: "after" });
    if (!job) return false;
    const fence = { _id: accountId, phase: job.phase, "lease.id": leaseId };
    async function ownsLease() {
      return Boolean(await jobs.findOne({ ...fence, "lease.until": { $gt: now() } }, { projection: { _id: 1 } }));
    }
    const databasePhase = cleanupPhases.includes(job.phase) || job.phase === awaitingFinalReview;
    const heartbeat = databasePhase ? null : setInterval(() => {
      const stamp = now();
      void jobs.updateOne({ ...fence, "lease.until": { $gt: stamp } },
        { $set: { "lease.until": stamp + leaseMs } }).catch(() => {});
    }, Math.max(10, Math.floor(leaseMs / 3)));
    heartbeat?.unref();
    try {
      if (!await ownsLease()) return false;
      await jobs.updateOne(fence, { $inc: { ["attempts." + job.phase]: 1 } });
      const next = phases[phases.indexOf(job.phase) + 1] ?? awaitingFinalReview;
      async function advance(session) {
        const saved = await jobs.updateOne({ ...fence, "lease.until": { $gt: now() } },
          { $set: { phase: next, updatedAt: now() }, $unset: { lease: "" } }, { session });
        return Boolean(saved.matchedCount);
      }
      if (databasePhase) {
        let groupNotices;
        const advanced = await client.withSession((session) => session.withTransaction(async () => {
          if (!await ownsLease()) return false;
          if (job.phase === awaitingFinalReview) return finalize(job, fence, session);
          const result = await cleanDeletionPhase(db, accountId, job.phase, session);
          if (job.phase === "remove-group-access") groupNotices = result;
          if (!await advance(session)) throw new Error("Deletion lease expired");
          return true;
        }, transactionOptions));
        if (advanced && groupNotices && publishGroupCleanup) {
          await publishGroupCleanup(groupNotices).catch(() => {});
        }
        return advanced;
      }
      if (job.phase === awaitingFileCleanup) {
        const binding = await bindings.findOne({ accountId, state: "deleting", privateDataErased: true });
        if (!binding) throw new Error("Account cleanup has not been verified");
        const fileCleanup = await reviewDeletionFiles(db, client, accountId, async (session) => {
          const leased = await jobs.updateOne({ ...fence, "lease.until": { $gt: now() } },
            { $set: { updatedAt: now() }, $inc: { fileCleanupRevision: 1 } }, { session });
          if (!leased.matchedCount) throw new Error("Deletion lease expired");
        }, transactionOptions);
        const saved = await jobs.updateOne({ ...fence, "lease.until": { $gt: now() } }, {
          $set: { phase: fileCleanup.blocked ? awaitingFileCleanup : next, fileCleanup, updatedAt: now() },
          $unset: { lease: "" },
        });
        return Boolean(saved.matchedCount && !fileCleanup.blocked);
      }
      if (job.phase === "revoke-access") await revokeAccess(accountId);
      else await stopCalls(accountId, ownsLease);
      return await advance();
    } catch {
      await jobs.updateOne(fence, {
        $set: { updatedAt: now() }, $unset: { lease: "" },
        $push: { errors: { $each: [{ phase: job.phase, code: "STEP_FAILED", at: now() }], $slice: -8 } },
      });
      return false;
    } finally {
      if (heartbeat) clearInterval(heartbeat);
    }
  }

  async function finalize(job, fence, session) {
    const accountId = job._id;
    const lease = { ...fence, "lease.until": { $gt: now() } };
    const binding = await bindings.findOne({ accountId, state: "deleting", privateDataErased: true }, { session });
    if (!binding) throw new Error("Account cleanup has not been verified");

    async function defer(phase, blocker) {
      const result = await jobs.updateOne(lease, {
        $set: { phase, blocker, updatedAt: now() }, $unset: { lease: "" },
      }, { session });
      if (!result.matchedCount) throw new Error("Deletion lease expired");
      return false;
    }

    await verifyDataCleanup(db, accountId, session);
    if (!await verifyDeletionFiles(db, accountId, job.fileCleanup, session)) {
      return defer(awaitingFileCleanup, "FILES_REQUIRE_REVIEW");
    }
    if (job.externalOperationsTracked !== true) {
      return defer(awaitingFinalReview, "EXTERNAL_OPERATION_HISTORY_UNVERIFIED");
    }
    const operations = externalOperations(db);
    if (await operations.findOne({ accountId, state: { $ne: "settled" } }, { session })) {
      return defer(awaitingFinalReview, "EXTERNAL_OPERATION_PENDING");
    }

    const completedAt = now();
    await carryMailQuota(db, accountId, binding._id, new Date(completedAt).toISOString().slice(0, 10), session);
    await operations.deleteMany({ accountId, state: "settled" }, { session });
    const released = await bindings.deleteOne({
      _id: binding._id, accountId, state: "deleting", privateDataErased: true,
    }, { session });
    if (!released.deletedCount) throw new Error("Account binding changed");
    const completed = await jobs.replaceOne({ ...lease, "lease.until": { $gt: now() } }, {
      _id: accountId, jobId: job.jobId, phase: "completed", completedAt, fileCleanup: job.fileCleanup,
    }, { session });
    if (!completed.matchedCount) throw new Error("Deletion lease expired");
    return true;
  }

  async function run(accountId) {
    for (let index = 0; index < phases.length; index++) {
      if (!await step(accountId)) break;
    }
  }

  async function resumePending() {
    const pending = await jobs.find({
      phase: { $in: phases },
      $or: [{ lease: { $exists: false } }, { "lease.until": { $lte: now() } }],
    }).sort({ updatedAt: 1 }).limit(20).toArray();
    for (const job of pending) await run(job._id);
  }

  return { enqueue, start, run, resumePending };
}

export function revokeAccountConnections(io, sessions, accountId, verifiedPiUid) {
  const revoked = new Set();
  for (const [token, session] of sessions) {
    if (session.accountId !== accountId && (!verifiedPiUid || session.verifiedPiUid !== verifiedPiUid)) continue;
    revoked.add(token);
    sessions.delete(token);
  }
  for (const path of ["/", "/email", "/chat", "/groups", "/calls"]) {
    for (const socket of io.of(path).sockets.values()) {
      if (revoked.has(socket.data.sessionToken ?? socket.sessionToken)) socket.disconnect();
    }
  }
}

// Every server process owns its own session map. A committed job notifies each
// process; the periodic sweep recovers if this change stream misses an event.
export function observeAccountDeletion(db, io, sessions) {
  const jobs = db.collection(deletionCollection);
  const stream = jobs.watch([{ $match: { operationType: "insert" } }]);
  stream.on("change", (change) => {
    if (typeof change.documentKey?._id === "string") revokeAccountConnections(io, sessions, change.documentKey._id);
  });
  stream.on("error", () => console.error("[ACCOUNT DELETION] Session observer unavailable"));
  return async function sweep() {
    const ids = [...new Set([...sessions.values()].map(({ accountId }) => accountId).filter(Boolean))];
    if (!ids.length) return;
    const cursor = jobs.find({ _id: { $in: ids } }, { projection: { _id: 1 } });
    for await (const { _id } of cursor) revokeAccountConnections(io, sessions, _id);
  };
}
