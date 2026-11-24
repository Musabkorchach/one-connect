import { randomUUID } from "node:crypto";
import { piTestnet, verifySubscribeTransaction } from "./pi-testnet-subscription.js";

const confirmationGraceMs = 24 * 60 * 60_000;

async function verifyPiIdentity(accessToken, uid) {
  if (typeof accessToken !== "string" || !accessToken || accessToken.length > 4096) return "WALLET_PI_AUTH_REJECTED";
  try {
    const response = await fetch("https://api.minepi.com/v2/me", {
      headers: { Authorization: "Bearer " + accessToken }, signal: AbortSignal.timeout(8000), redirect: "error",
    });
    if (response.status === 401 || response.status === 403) return "WALLET_PI_AUTH_REJECTED";
    if (!response.ok) return "WALLET_PI_UNAVAILABLE";
    const identity = await response.json();
    if (typeof identity?.uid !== "string" || !identity.uid) return "WALLET_PI_UNAVAILABLE";
    return identity.uid === uid ? null : "WALLET_PI_IDENTITY_MISMATCH";
  } catch {
    return "WALLET_PI_UNAVAILABLE";
  }
}

export function registerPiTestnetSubscriptions({ app, db, authenticateSession, sessionIsCurrent, provider = piTestnet }) {
  const collection = db.collection("pi_testnet_subscription_wallets_v1");
  let indexes;
  const path = "/api/pi-testnet/subscription";

  function attemptDeadline(row) {
    if (!row.intent) return null;
    return row.intent.expiresAt + (row.pending || row.intent.submitting ? confirmationGraceMs : 0);
  }

  async function releaseAttempt(row) {
    const filter = {
      _id: row._id, uid: row.uid, verified: row.verified,
      "intent.id": row.intent.id, "intent.submitting": row.intent.submitting ?? null,
      ...(row.pending ? { "pending.hash": row.pending.hash } : { pending: null }),
    };
    if (row.verified) {
      const result = await collection.updateOne(filter, { $unset: { intent: "", pending: "" } });
      return result.matchedCount === 1;
    }
    const result = await collection.deleteOne(filter);
    return result.deletedCount === 1;
  }

  function route(handler) {
    return async (req, res) => {
      res.set("Cache-Control", "no-store");
      const uid = req.user.verifiedPiUid;
      if (!uid || req.user.accountId) {
        return res.status(403).json({
          code: "PI_TESTNET_SESSION_NOT_ELIGIBLE",
          error: "One Connect Testnet subscriptions require a verified Pi session without experimental account binding.",
        });
      }
      try {
        indexes ??= collection.createIndex({ uid: 1 }, { unique: true }).catch((error) => { indexes = undefined; throw error; });
        await indexes;
        await handler(req, res, uid);
      } catch (error) {
        res.sendStatus(error?.code === 11000 ? 409 : 503);
      }
    };
  }

  app.get(path, authenticateSession, route(async (_req, res, uid) => {
    const [plan, row] = await Promise.all([provider.service(), collection.findOne({ uid })]);
    const subscription = row?.verified ? await provider.subscription(row._id) : { status: "unknown" };
    const reserved = Boolean(row?.intent && attemptDeadline(row) > Date.now());
    res.json({ plan, subscription, wallet: row?.verified ? row._id : null,
      pending: reserved ? row.pending ?? null : null, reserved,
      cancelableAttemptId: reserved && !row.pending && !row.intent.submitting ? row.intent.id : null });
  }));

  app.post(path + "/prepare", authenticateSession, route(async (req, res, uid) => {
    if (req.body?.protocol !== 2) {
      return res.status(426).json({ code: "PI_TESTNET_SUBSCRIPTION_CLIENT_UPDATE_REQUIRED" });
    }
    const wallet = req.body?.wallet;
    if (!provider.isWallet(wallet)) return res.sendStatus(400);
    if (!(await provider.service()).active) return res.sendStatus(409);
    const identityError = await verifyPiIdentity(req.body.accessToken, uid);
    if (identityError !== null) {
      return res.status(identityError === "WALLET_PI_UNAVAILABLE" ? 503 : 403).json({ code: identityError });
    }
    const sequence = await provider.nextSequence(wallet);
    if (!sessionIsCurrent(req)) return res.sendStatus(401);
    const now = Date.now();
    const [own, target] = await Promise.all([collection.findOne({ uid }), collection.findOne({ _id: wallet })]);
    const existing = own?._id === target?._id ? [own] : [own, target];
    for (const row of existing) {
      if (!row) continue;
      if (row.verified && (row.uid !== uid || row._id !== wallet)) return res.sendStatus(409);
      if (row.intent) {
        if (attemptDeadline(row) > now || !await releaseAttempt(row)) return res.sendStatus(409);
      } else if (!row.verified && row.pending == null) {
        // Older failed confirmations could leave an unverified row without an attempt.
        const result = await collection.deleteOne({
          _id: row._id, uid: row.uid, verified: false, intent: null, pending: null,
        });
        if (result.deletedCount !== 1) return res.sendStatus(409);
      } else if (row.pending) return res.sendStatus(409);
    }
    if (own?.verified && (await provider.subscription(wallet)).status !== "expired") return res.sendStatus(409);
    if (!sessionIsCurrent(req)) return res.sendStatus(401);
    const id = randomUUID();
    const intent = {
      id, wallet, sequence, startedAt: Math.floor(now / 1000) * 1000,
      expiresAt: now + 10 * 60_000, requiresStart: true,
    };
    // Reserving a candidate address does not establish ownership.
    await collection.updateOne({ _id: wallet, uid, pending: null, intent: null,
      confirmedHash: own?.confirmedHash ?? null },
      { $set: { intent }, $setOnInsert: { verified: false } }, { upsert: true });
    res.json({ id });
  }));

  app.post(path + "/start", authenticateSession, route(async (req, res, uid) => {
    const { id } = req.body ?? {};
    if (typeof id !== "string" || !id) return res.sendStatus(400);
    if (!sessionIsCurrent(req)) return res.sendStatus(401);
    const result = await collection.updateOne({
      uid, "intent.id": id, "intent.expiresAt": { $gt: Date.now() }, "intent.submitting": null, pending: null,
    }, { $set: { "intent.submitting": true } });
    return result.matchedCount ? res.json({ state: "submitting" }) : res.sendStatus(409);
  }));

  app.post(path + "/release", authenticateSession, route(async (req, res, uid) => {
    const { id, walletRejected } = req.body ?? {};
    if (typeof id !== "string" || !id) return res.sendStatus(400);
    const row = await collection.findOne({ uid });
    if (!row?.intent || row.intent.id !== id || row.pending) return res.sendStatus(409);
    if (row.intent.submitting && (walletRejected !== true ||
        await provider.nextSequence(row._id) !== row.intent.sequence)) return res.sendStatus(409);
    if (!sessionIsCurrent(req)) return res.sendStatus(401);
    return await releaseAttempt(row) ? res.json({ state: "released" }) : res.sendStatus(409);
  }));

  app.post(path + "/confirm", authenticateSession, route(async (req, res, uid) => {
    const { id, hash } = req.body ?? {};
    if (typeof id !== "string" || typeof hash !== "string" || !/^[a-f0-9]{64}$/.test(hash)) return res.sendStatus(400);
    const row = await collection.findOne({ uid });
    if (row?.confirmedHash === hash) {
      return row.confirmedIntentId === id ? res.json({ state: "confirmed" }) : res.sendStatus(409);
    }
    if (!row?.intent || row.intent.id !== id || (row.pending && row.pending.hash !== hash)) return res.sendStatus(409);
    if (row.intent.requiresStart && !row.intent.submitting) return res.sendStatus(409);
    if (Date.now() >= attemptDeadline(row)) {
      await releaseAttempt(row);
      return res.sendStatus(409);
    }
    const filter = { _id: row._id, uid, "intent.id": id, $or: [{ pending: null }, { "pending.hash": hash }] };
    const save = await collection.updateOne(filter, { $set: { pending: { id, hash } } });
    if (!save.matchedCount) return res.sendStatus(409);
    const transaction = await provider.transaction(hash);
    if (!sessionIsCurrent(req)) return res.sendStatus(401);
    if (!transaction) return res.status(202).json({ state: "pending" });
    if (transaction.hash !== hash || !verifySubscribeTransaction(transaction, row.intent)) {
      await releaseAttempt({ ...row, pending: { id, hash } });
      return res.sendStatus(422);
    }
    const write = await collection.updateOne(filter, {
      $set: { verified: true, confirmedHash: hash, confirmedIntentId: id }, $unset: { intent: "", pending: "" },
    });
    return write.matchedCount ? res.json({ state: "confirmed" }) : res.sendStatus(409);
  }));
}
