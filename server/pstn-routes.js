import { accountWrites, respondToBlockedWrite } from "./account-write-fence.js";
import { accountAttempts, accountBinding, pstnDailyQuota } from "./pstn-account.js";
import { migrationRequired } from "./pi-login.js";
import crypto from "node:crypto";
import { getPstnConfig, normalizePstnPhone } from "./pstn-config.js";
import { createPstnAccessToken } from "./pstn-token.js";

async function reserveQuota(collection, key, limit) {
  try {
    await collection.updateOne(
      { _id: key, count: { $lt: limit } },
      { $inc: { count: 1 } },
      { upsert: true },
    );
    return true;
  } catch (error) {
    if (error?.code === 11000) return false;
    throw error;
  }
}

export async function registerPstnRoutes({
  app,
  db,
  writeAccount,
  requireSession,
  bindAccounts,
  normalizeMessagingUsername,
}) {
  const attempts = bindAccounts ? accountAttempts(db) : db.collection("pstn_attempts");
  const usage = db.collection("pstn_usage");

  await attempts.createIndex(
    { [bindAccounts ? "ownerAccountId" : "ownerUsername"]: 1, requestId: 1 },
    { unique: true },
  );

  if (bindAccounts) {
    await attempts.createIndex({ parentCallSid: 1 }, { unique: true, partialFilterExpression: { parentCallSid: { $type: "string" } } });
    await attempts.createIndex({ ownerAccountId: 1, createdAt: -1 });
    app.get("/api/calls/pstn/history", requireSession, async (req, res, next) => {
      try {
        res.set("Cache-Control", "private, no-store");
        const records = await attempts.find({ ownerAccountId: req.user.accountId }, {
          projection: { _id: 0, phone: 1, state: 1, createdAt: 1, submittedAt: 1, endedAt: 1 },
        }).sort({ createdAt: -1 }).limit(200).toArray();
        if ((await accountBinding(db, req.user.accountId))?.state !== "active") return res.sendStatus(403);
        res.json({ calls: records, legacyHistory: migrationRequired });
      } catch (error) { next(error); }
    });
  }

  app.post("/api/calls/pstn/prepare", requireSession, async (req, res) => {
    res.set("Cache-Control", "no-store");

    let identity = null;
    const mutations = accountWrites(attempts, writeAccount, req.user.accountId);

    try {
      const config = getPstnConfig(bindAccounts);

      if (!config) {
        return res.status(503).json({ error: "Phone calls are not enabled." });
      }

      const username = normalizeMessagingUsername(req.user.piUsername);

      const accountId = req.user.accountId;
      const binding = bindAccounts ? await accountBinding(db, accountId) : null;
      if (!username || (bindAccounts
        ? binding?.state !== "active" || !config.allowedAccountIds.has(accountId)
        : !config.allowedUsers.has(username))) {
        return res.status(403).json({
          error: "Phone calls are not enabled for this account.",
        });
      }

      const data = req.body;
      const phone = normalizePstnPhone(data?.phone);

      if (
        !data ||
        typeof data !== "object" ||
        Array.isArray(data) ||
        typeof data.requestId !== "string" ||
        !/^[a-zA-Z0-9_-]{16,80}$/.test(data.requestId) ||
        !phone || (bindAccounts && ["accountId", "ownerAccountId", "ownerUsername", "piUid"].some((key) => Object.hasOwn(data, key)))
      ) {
        return res.status(400).json({
          error: "Invalid request or unsupported phone number.",
        });
      }

      const now = Date.now();
      const quota = bindAccounts ? pstnDailyQuota(config.abuseSecret, binding._id, now) : null;
      if (quota && await usage.findOne({
        _id: quota.key, $or: [{ count: { $gte: 1 } }, { verifiedRelease: { $ne: true } }],
      })) {
        return res.status(429).json({
          code: "PSTN_DAILY_QUOTA",
          error: "Daily phone call quota is unavailable.",
          quotaResetsAt: quota.quotaResetsAt,
        });
      }

      if (quota && await usage.findOne({ _id: quota.attemptKey, count: { $gte: config.attemptLimit } })) {
        return res.status(429).json({
          code: "PSTN_DAILY_ATTEMPT_LIMIT",
          error: "Daily phone call attempt limit reached.",
          quotaResetsAt: quota.quotaResetsAt,
        });
      }

      identity = `oc_${crypto.randomBytes(16).toString("hex")}`;
      await mutations.insertOne({
        _id: identity,
        ...(bindAccounts ? { ownerAccountId: accountId } : { ownerUsername: username }),
        requestId: data.requestId,
        phone,
        state: "preparing",
        createdAt: now,
        expiresAt: now + 300_000,
        maxDurationSeconds: config.maxDurationSeconds,
      });

      const day = new Date(now).toISOString().slice(0, 10);

      // Retain the separate preparation abuse limits in both modes.
      const userQuota = await reserveQuota(
        usage,
        `user:${day}:${username}`,
        config.dailyCallLimit,
      );

      const appQuota = userQuota && await reserveQuota(
        usage,
        `app:${day}`,
        50,
      );

      if (!appQuota) {
        await mutations.updateOne(
          { _id: identity, ...(bindAccounts ? { state: "preparing" } : {}) },
          { $set: { state: "quota-exceeded" } },
        );

        return res.status(429).json({
          error: "Daily phone call test limit reached.",
        });
      }

      if (bindAccounts && (await accountBinding(db, accountId))?.state !== "active") {
        await mutations.updateOne({ _id: identity, state: "preparing" }, { $set: { state: "terminated" } });
        return res.sendStatus(403);
      }
      const result = createPstnAccessToken(config, identity);

      const expiresAt = quota ? Math.min(result.expiresAt, quota.quotaResetsAt) : result.expiresAt;
      const ready = await mutations.updateOne(
        { _id: identity, ...(bindAccounts ? { state: "preparing", ownerAccountId: accountId } : {}) },
        {
          $set: {
            state: "ready",
            expiresAt,
          },
        },
      );

      if (bindAccounts && (!ready.matchedCount || (await accountBinding(db, accountId))?.state !== "active")) return res.sendStatus(403);

      return res.status(201).json({
        attemptId: identity,
        phone,
        token: result.token,
        expiresAt,
        maxDurationSeconds: config.maxDurationSeconds,
        ...(quota ? { quotaResetsAt: quota.quotaResetsAt } : {}),
      });
    } catch (error) {
      if (respondToBlockedWrite(error, res)) return;
      if (error?.code === 11000) {
        return res.status(409).json({
          error: "This call request already exists. Do not submit it again.",
        });
      }

      if (identity) {
        await mutations.updateOne(
          { _id: identity, state: "preparing" },
          { $set: { state: "failed" } },
        ).catch(() => {});
      }

      console.error("[PSTN PREPARE ERROR]", error?.name || "Error");

      return res.status(503).json({
        error: "Unable to prepare the phone call.",
      });
    }
  });
}