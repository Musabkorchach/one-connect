import { randomUUID } from "node:crypto";
import { piTestnet, verifySubscribeTransaction } from "./pi-testnet-subscription.js";

async function verifyWalletToken(accessToken, uid, wallet) {
  if (typeof accessToken !== "string" || !accessToken || accessToken.length > 4096) return false;
  const response = await fetch("https://api.minepi.com/v2/me", {
    headers: { Authorization: "Bearer " + accessToken }, signal: AbortSignal.timeout(8000), redirect: "error",
  });
  if (!response.ok) return false;
  const identity = await response.json();
  return identity.uid === uid && identity.wallet_address === wallet;
}

export function registerPiTestnetSubscriptions({ app, db, authenticateSession, sessionIsCurrent, provider = piTestnet, verifyWallet = verifyWalletToken }) {
  const collection = db.collection("pi_testnet_subscription_wallets_v1");
  let indexes;
  const path = "/api/pi-testnet/subscription";

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
    res.json({ plan, subscription, wallet: row?.verified ? row._id : null, pending: row?.pending ?? null,
      reserved: Boolean(row?.intent && row.intent.expiresAt > Date.now()) });
  }));

  app.post(path + "/prepare", authenticateSession, route(async (req, res, uid) => {
    const wallet = req.body?.wallet;
    if (!provider.isWallet(wallet)) return res.sendStatus(400);
    if (!(await provider.service()).active) return res.sendStatus(409);
    if (!await verifyWallet(req.body.accessToken, uid, wallet)) return res.status(403).json({ code: "WALLET_UNVERIFIED" });
    const sequence = await provider.nextSequence(wallet);
    if (!sessionIsCurrent(req)) return res.sendStatus(401);
    const now = Date.now();
    const existing = await collection.findOne({ uid });
    if (existing?.pending || (existing?.verified && existing._id !== wallet)) return res.sendStatus(409);
    if (existing && !existing.verified && existing._id !== wallet) {
      await collection.deleteOne({ _id: existing._id, uid, verified: false, pending: null,
        $or: [{ intent: { $exists: false } }, { "intent.expiresAt": { $lte: now } }] });
    }
    if (existing?.verified && (await provider.subscription(wallet)).status !== "expired") return res.sendStatus(409);
    const id = randomUUID();
    const intent = { id, wallet, sequence, startedAt: Math.floor(now / 1000) * 1000, expiresAt: now + 10 * 60_000 };
    await collection.updateOne({ _id: wallet, uid, pending: null,
      $or: [{ intent: { $exists: false } }, { "intent.expiresAt": { $lte: now } }] },
      { $set: { intent }, $setOnInsert: { verified: false } }, { upsert: true });
    res.json({ id });
  }));

  app.post(path + "/confirm", authenticateSession, route(async (req, res, uid) => {
    const { id, hash } = req.body ?? {};
    if (typeof id !== "string" || typeof hash !== "string" || !/^[a-f0-9]{64}$/.test(hash)) return res.sendStatus(400);
    const row = await collection.findOne({ uid });
    if (row?.confirmedHash === hash) return res.json({ state: "confirmed" });
    if (!row?.intent || row.intent.id !== id || (row.pending && row.pending.hash !== hash)) return res.sendStatus(409);
    const filter = { _id: row._id, uid, "intent.id": id, $or: [{ pending: null }, { "pending.hash": hash }] };
    if (Date.now() > row.intent.expiresAt + 24 * 60 * 60_000) {
      await collection.updateOne(filter, { $unset: { pending: "", intent: "" } });
      return res.sendStatus(409);
    }
    const save = await collection.updateOne(filter, { $set: { pending: { id, hash } } });
    if (!save.matchedCount) return res.sendStatus(409);
    const transaction = await provider.transaction(hash);
    if (!sessionIsCurrent(req)) return res.sendStatus(401);
    if (!transaction) return res.status(202).json({ state: "pending" });
    if (transaction.hash !== hash || !verifySubscribeTransaction(transaction, row.intent)) {
      await collection.updateOne(filter, { $unset: { pending: "", intent: "" } });
      return res.sendStatus(422);
    }
    const write = await collection.updateOne(filter, {
      $set: { verified: true, confirmedHash: hash }, $unset: { intent: "", pending: "" },
    });
    return write.matchedCount ? res.json({ state: "confirmed" }) : res.sendStatus(409);
  }));
}
