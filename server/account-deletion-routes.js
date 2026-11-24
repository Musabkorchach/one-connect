import { createHash, randomBytes } from "node:crypto";
import { identityBindingsCollection } from "./account-identity.js";

export const deletionConfirmations = "account_deletion_confirmations";
const purpose = "delete-account";
const challengeDurationMs = 2 * 60_000;
const receiptDurationMs = 10 * 60_000;
const rateWindowMs = 10 * 60_000;
const opaqueToken = /^[a-f0-9]{64}$/;
const digest = (value) => createHash("sha256").update(value).digest("hex");

class RequestRejected extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

const reject = (status, code) => { throw new RequestRejected(status, code); };
const wrongConfirmation = () => reject(409, "DELETION_CONFIRMATION_INVALID");

function sessionTokenFrom(req) {
  const header = req.get("Authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7) : "";
  if (!opaqueToken.test(token)) reject(401, "SESSION_REQUIRED");
  return token;
}

function bodyWithKeys(req, keys) {
  if (!req.is("application/json") || !req.body || typeof req.body !== "object" ||
      Array.isArray(req.body) || Object.keys(req.query).length ||
      Object.keys(req.body).length !== keys.length || !keys.every((key) => Object.hasOwn(req.body, key))) {
    reject(400, "INVALID_DELETION_REQUEST");
  }
  return req.body;
}

export async function registerAccountDeletionRoutes({
  app, db, deletion, userSessions, revokeAccess, now = Date.now, verifyFetch = fetch,
}) {
  const confirmations = db.collection(deletionConfirmations);
  const rates = db.collection("account_deletion_request_limits");
  const bindings = db.collection(identityBindingsCollection);
  await Promise.all([
    confirmations.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    rates.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
  ]);

  function activeSession(token) {
    const session = userSessions.get(token);
    return session?.accountId && session.expiresAt > now() ? session : null;
  }

  const route = (handler) => async (req, res) => {
    res.set("Cache-Control", "no-store");
    try {
      await handler(req, res);
    } catch (error) {
      if (error instanceof RequestRejected) return res.status(error.status).json({ code: error.code });
      console.error("[ACCOUNT DELETION] Request failed");
      return res.status(503).json({ code: "DELETION_REQUEST_UNAVAILABLE" });
    }
  };

  async function rateLimit(accountId, action, limit, res) {
    const stamp = now();
    const window = Math.floor(stamp / rateWindowMs);
    const reset = (window + 1) * rateWindowMs;
    const slot = { _id: { accountId, action, window }, count: { $lt: limit } };
    try {
      await rates.updateOne(slot, { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date(reset) } }, { upsert: true });
    } catch (error) {
      if (error?.code !== 11000) throw error;
      if ((await rates.updateOne(slot, { $inc: { count: 1 } })).matchedCount) return;
      res.set("Retry-After", String(Math.max(1, Math.ceil((reset - stamp) / 1000))));
      reject(429, "DELETION_RATE_LIMITED");
    }
  }

  function accept(res, accountId) {
    revokeAccess(accountId);
    res.status(202).json({ status: "accepted" });
    void deletion.run(accountId).catch(() => console.error("[ACCOUNT DELETION] Worker wake failed"));
  }

  async function verifyPiUid(accessToken) {
    let response;
    try {
      response = await verifyFetch("https://api.minepi.com/v2/me", {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(5000),
        redirect: "error",
      });
    } catch {
      reject(503, "PI_VERIFICATION_UNAVAILABLE");
    }
    if (response.status === 401 || response.status === 403) reject(401, "PI_VERIFICATION_FAILED");
    if (!response.ok) reject(503, "PI_VERIFICATION_UNAVAILABLE");
    const identity = await response.json().catch(() => null);
    if (typeof identity?.uid !== "string" || !identity.uid || identity.uid.trim() !== identity.uid) {
      reject(401, "PI_VERIFICATION_FAILED");
    }
    return identity.uid;
  }

  app.post("/api/account/deletion/challenge", route(async (req, res) => {
    bodyWithKeys(req, []);
    const token = sessionTokenFrom(req);
    const login = activeSession(token);
    if (!login) reject(401, "SESSION_REQUIRED");
    await rateLimit(login.accountId, "challenge", 5, res);
    if (activeSession(token) !== login ||
        !await bindings.findOne({ accountId: login.accountId, state: "active" }, { projection: { _id: 1 } })) {
      reject(401, "SESSION_REQUIRED");
    }

    const confirmationToken = randomBytes(32).toString("hex");
    const expiresAt = new Date(Math.min(now() + challengeDurationMs, login.expiresAt));
    await confirmations.insertOne({
      _id: digest(confirmationToken), sessionHash: digest(token),
      accountId: login.accountId, purpose, expiresAt,
    });
    res.status(201).json({ confirmationToken, expiresAt: expiresAt.toISOString() });
  }));

  app.post("/api/account/deletion/confirm", route(async (req, res) => {
    const { confirmationToken, accessToken, confirm } = bodyWithKeys(req, ["confirmationToken", "accessToken", "confirm"]);
    if (confirm !== true || typeof confirmationToken !== "string" || !opaqueToken.test(confirmationToken) ||
        typeof accessToken !== "string" || !/^[!-~]{1,4096}$/.test(accessToken)) {
      reject(400, "INVALID_DELETION_REQUEST");
    }
    const token = sessionTokenFrom(req);
    const key = { _id: digest(confirmationToken), sessionHash: digest(token), purpose };
    const readConfirmation = (session) => confirmations.findOne({
      ...key, expiresAt: { $gt: new Date(now()) },
    }, { session });
    const proof = await readConfirmation();
    // The old bearer and consumed proof can only replay this acknowledgment.
    if (proof?.acceptedAt) return res.status(202).json({ status: "accepted" });

    const login = activeSession(token);
    if (!login) {
      if ((await readConfirmation())?.acceptedAt) return res.status(202).json({ status: "accepted" });
      reject(401, "SESSION_REQUIRED");
    }
    await rateLimit(login.accountId, "confirm", 8, res);
    if (proof?.accountId !== login.accountId) wrongConfirmation();

    const piUid = await verifyPiUid(accessToken);
    try {
      await deletion.enqueue(login.accountId, async (session) => {
        const current = await readConfirmation(session);
        if (current?.accountId !== login.accountId) wrongConfirmation();
        if (current.acceptedAt) return;
        if (activeSession(token) !== login) reject(401, "SESSION_REQUIRED");
        const binding = await bindings.findOne({ accountId: login.accountId, state: "active" }, { session });
        if (!binding) wrongConfirmation();
        if (binding._id !== piUid) reject(403, "PI_IDENTITY_MISMATCH");

        const acceptedAt = new Date(now());
        const consumed = await confirmations.updateOne({
          ...key, accountId: login.accountId, expiresAt: { $gt: acceptedAt }, acceptedAt: { $exists: false },
        }, { $set: { acceptedAt, expiresAt: new Date(acceptedAt.getTime() + receiptDurationMs) } }, { session });
        if (!consumed.matchedCount) wrongConfirmation();
        if (activeSession(token) !== login) reject(401, "SESSION_REQUIRED");
      });
    } catch (error) {
      // Revocation can race this request after a concurrent confirmation commits.
      if (error.code === "SESSION_REQUIRED" && (await readConfirmation())?.acceptedAt) {
        return res.status(202).json({ status: "accepted" });
      }
      throw error;
    }
    accept(res, login.accountId);
  }));
}
