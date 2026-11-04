import crypto from "node:crypto";
import { getPstnConfig, normalizeFrancePhone } from "./pstn-config.js";
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
  requireSession,
  normalizeMessagingUsername,
}) {
  const attempts = db.collection("pstn_attempts");
  const usage = db.collection("pstn_usage");

  await attempts.createIndex(
    { ownerUsername: 1, requestId: 1 },
    { unique: true },
  );

  app.post("/api/calls/pstn/prepare", requireSession, async (req, res) => {
    res.set("Cache-Control", "no-store");

    let identity = null;

    try {
      const config = getPstnConfig();

      if (!config) {
        return res.status(503).json({ error: "Phone calls are not enabled." });
      }

      const username = normalizeMessagingUsername(req.user.piUsername);

      if (!username || !config.allowedUsers.has(username)) {
        return res.status(403).json({
          error: "Phone calls are not enabled for this account.",
        });
      }

      const data = req.body;
      const phone = normalizeFrancePhone(data?.phone);

      if (
        !data ||
        typeof data !== "object" ||
        Array.isArray(data) ||
        typeof data.requestId !== "string" ||
        !/^[a-zA-Z0-9_-]{16,80}$/.test(data.requestId) ||
        !phone
      ) {
        return res.status(400).json({
          error: "Invalid request or unsupported French phone number.",
        });
      }

      identity = `oc_${crypto.randomBytes(16).toString("hex")}`;
      const now = Date.now();

      await attempts.insertOne({
        _id: identity,
        ownerUsername: username,
        requestId: data.requestId,
        phone,
        state: "preparing",
        createdAt: now,
        expiresAt: now + 300_000,
        maxDurationSeconds: config.maxDurationSeconds,
      });

      const day = new Date(now).toISOString().slice(0, 10);

      const userQuota = await reserveQuota(
        usage,
        `user:${day}:${username}`,
        config.dailyCallLimit,
      );

      const appQuota = userQuota && await reserveQuota(
        usage,
        `app:${day}`,
        10,
      );

      if (!appQuota) {
        await attempts.updateOne(
          { _id: identity },
          { $set: { state: "quota-exceeded" } },
        );

        return res.status(429).json({
          error: "Daily phone call test limit reached.",
        });
      }

      const result = createPstnAccessToken(config, identity);

      await attempts.updateOne(
        { _id: identity },
        {
          $set: {
            state: "ready",
            expiresAt: result.expiresAt,
          },
        },
      );

      return res.status(201).json({
        attemptId: identity,
        phone,
        token: result.token,
        expiresAt: result.expiresAt,
        maxDurationSeconds: config.maxDurationSeconds,
      });
    } catch (error) {
      if (error?.code === 11000) {
        return res.status(409).json({
          error: "This call request already exists. Do not submit it again.",
        });
      }

      if (identity) {
        await attempts.updateOne(
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