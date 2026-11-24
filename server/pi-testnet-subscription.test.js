import assert from "node:assert/strict";
import { test } from "node:test";
import { Account, Address, Contract, Keypair, TransactionBuilder, nativeToScVal } from "@stellar/stellar-sdk";
import { contractAddress, matchesService, verifySubscribeTransaction } from "./pi-testnet-subscription.js";
import { registerPiTestnetSubscriptions } from "./pi-testnet-subscription-routes.js";

const key = Keypair.random();
const wallet = key.publicKey();
const now = Date.now();
const intent = { wallet, sequence: "42", startedAt: now - 2000, expiresAt: now + 60000 };
const service = {
  service_id: 460n, merchant: "GBSPHKSOUOXUZSJ2IW7KCGJIJ47T22MLT7GHCTPCKMTLYFZTQFYTEISV",
  price: 1000000n, period_secs: 2629746n, trial_period_secs: 0n, approve_periods: 1n,
};

function transaction({ target = contractAddress, id = 460n, autoRenew = false, periods = 1n, name = "subscribe",
  network = "Pi Testnet" } = {}) {
  const operation = new Contract(target).call(name,
    Address.fromString(wallet).toScVal(), nativeToScVal(id, { type: "u64" }),
    nativeToScVal(autoRenew), nativeToScVal(periods, { type: "u64" }));
  const tx = new TransactionBuilder(new Account(wallet, "41"), { fee: "100", networkPassphrase: network })
    .addOperation(operation).setTimeout(60).build();
  tx.sign(key);
  return {
    hash: tx.hash().toString("hex"), envelope_xdr: tx.toXDR(),
    successful: true, source_account: wallet, created_at: new Date(now).toISOString(),
  };
}

test("One Connect plan must match all verified service terms", () => {
  assert.equal(matchesService(service), true);
  for (const key of Object.keys(service)) assert.equal(matchesService({ ...service, [key]: null }), false);
});

test("only a successful matching Testnet subscribe transaction can bind an account", () => {
  const valid = transaction();
  assert.equal(verifySubscribeTransaction(valid, intent), true);
  for (const wrong of [
    transaction({ id: 461n }), transaction({ autoRenew: true }), transaction({ periods: 2n }),
    transaction({ target: Address.contract(Buffer.alloc(32)).toString(), name: "cancel" }),
    transaction({ network: "Pi Network" }), { ...valid, successful: false }, { ...valid, hash: "a".repeat(64) },
  ]) {
    assert.equal(verifySubscribeTransaction(wrong, intent), false);
  }
  assert.equal(verifySubscribeTransaction(valid, { ...intent, sequence: "43" }), false);
  assert.equal(verifySubscribeTransaction(valid, { ...intent, startedAt: now + 1 }), false);
  assert.equal(verifySubscribeTransaction(valid, { ...intent, wallet: Keypair.random().publicKey() }), false);
});

test("prepare verifies Pi identity without requiring a wallet address from Pi", async (t) => {
  const handlers = new Map();
  const app = { get: (path, _auth, fn) => handlers.set(path, fn), post: (path, _auth, fn) => handlers.set(path, fn) };
  let writes = 0;
  const collection = { createIndex: async () => {}, findOne: async () => null,
    updateOne: async () => { writes++; } };
  let piReply;
  let sequenceReads = 0;
  const piMock = t.mock.method(globalThis, "fetch", async () => piReply());
  registerPiTestnetSubscriptions({
    app, db: { collection: () => collection }, authenticateSession() {}, sessionIsCurrent: () => true,
    provider: { service: async () => ({ active: true }), isWallet: () => true,
      nextSequence: async () => { sequenceReads++; return "42"; } },
  });
  const identity = { uid: "verified-uid" };
  const cases = [
    [403, "WALLET_PI_IDENTITY_MISMATCH", () => Response.json({ uid: "other-uid", wallet_address: wallet })],
    ...[401, 403].map(status => [403, "WALLET_PI_AUTH_REJECTED", () => new Response(null, { status })]),
    ...[429, 503].map(status => [503, "WALLET_PI_UNAVAILABLE", () => new Response(null, { status })]),
    [503, "WALLET_PI_UNAVAILABLE", () => new Response("invalid-json")],
    [503, "WALLET_PI_UNAVAILABLE", () => Response.json(null)],
    [503, "WALLET_PI_UNAVAILABLE", () => { throw new Error("fixture network failure"); }],
  ];
  const prepare = handlers.get("/api/pi-testnet/subscription/prepare");
  const request = { user: { verifiedPiUid: identity.uid, accessToken: "login-fixture" },
    body: { wallet, accessToken: "authorization-fixture" } };
  for (const [status, code, response] of cases) {
    piReply = response;
    const reply = { set() {}, status(code) { this.code = code; return this; }, json(value) { this.body = value; } };
    await prepare(request, reply);
    assert.equal(reply.code, status);
    assert.deepEqual(reply.body, { code });
    const [url, options] = piMock.mock.calls.at(-1).arguments;
    assert.equal(url, "https://api.minepi.com/v2/me");
    assert.ok(options.headers.Authorization === "Bearer authorization-fixture", "uses the wallet authorization token");
  }
  assert.equal(piMock.mock.callCount(), cases.length);
  assert.equal(sequenceReads, 0);
  assert.equal(writes, 0);

  piReply = () => Response.json(identity);
  const allowed = { set() {}, json(value) { this.body = value; } };
  await prepare(request, allowed);
  assert.equal(typeof allowed.body.id, "string");
  assert.equal(sequenceReads, 1);
  assert.equal(writes, 1);
});

test("a second verified Pi account cannot reserve a wallet held by another account", async (t) => {
  const handlers = new Map();
  const app = { get() {}, post: (path, _auth, fn) => handlers.set(path, fn) };
  let saved;
  const storage = {
    createIndex: async () => {},
    findOne: async ({ uid }) => saved?.uid === uid ? saved : null,
    async updateOne(filter, update, { upsert }) {
      assert.equal(upsert, true);
      assert.equal(filter._id, wallet);
      if (saved) {
        assert.notEqual(filter.uid, saved.uid);
        throw Object.assign(new Error("duplicate wallet key"), { code: 11000 });
      }
      saved = { _id: filter._id, uid: filter.uid, ...update.$setOnInsert, ...update.$set };
    },
  };
  t.mock.method(globalThis, "fetch", async (_url, { headers }) =>
    Response.json({ uid: headers.Authorization.endsWith("account-a") ? "account-a" : "account-b" }));
  registerPiTestnetSubscriptions({ app, db: { collection: () => storage }, authenticateSession() {},
    sessionIsCurrent: () => true,
    provider: { service: async () => ({ active: true }), isWallet: value => value === wallet, nextSequence: async () => "42" },
  });
  const prepare = handlers.get("/api/pi-testnet/subscription/prepare");
  const reply = () => ({ set() {}, statusCode: 200, sendStatus(status) { this.statusCode = status; },
    json(body) { this.body = body; } });
  const request = uid => ({ user: { verifiedPiUid: uid }, body: { wallet, accessToken: uid } });
  const first = reply();
  await prepare(request("account-a"), first);
  assert.equal(first.statusCode, 200);
  assert.equal(saved.verified, false);
  const second = reply();
  await prepare(request("account-b"), second);
  assert.equal(second.statusCode, 409);
  assert.equal(saved.uid, "account-a");
  assert.equal(saved.intent.id, first.body.id);
});

test("confirmation survives RPC lag and only persists a verified wallet once", async () => {
  const handlers = new Map();
  const app = { get: (path, _auth, fn) => handlers.set(path, fn), post: (path, _auth, fn) => handlers.set(path, fn) };
  const proof = transaction();
  const row = { _id: wallet, uid: "verified-uid", intent: { ...intent, id: "intent-1" }, verified: false };
  const collection = {
    createIndex: async () => {},
    findOne: async (query) => query.uid === row.uid ? row : null,
    async updateOne(filter, update) {
      assert.equal(filter.uid, row.uid);
      assert.equal(filter["intent.id"], "intent-1");
      Object.assign(row, update.$set);
      for (const field of Object.keys(update.$unset ?? {})) delete row[field];
      return { matchedCount: 1 };
    },
  };
  let available = false;
  registerPiTestnetSubscriptions({
    app, db: { collection: () => collection }, authenticateSession() {}, sessionIsCurrent: () => true,
    provider: { transaction: async (hash) => {
      assert.equal(hash, proof.hash);
      return available ? proof : null;
    } },
  });
  const confirm = handlers.get("/api/pi-testnet/subscription/confirm");
  const req = { user: { verifiedPiUid: row.uid }, body: { id: "intent-1", hash: proof.hash } };
  const reply = () => ({ statusCode: 200, set() {}, status(code) { this.statusCode = code; return this; },
    sendStatus(code) { this.statusCode = code; }, json(value) { this.body = value; } });
  let res = reply();
  await confirm(req, res);
  assert.equal(res.statusCode, 202);
  assert.deepEqual(row.pending, req.body);
  assert.equal(row.verified, false);
  res = reply();
  await confirm({ ...req, user: { verifiedPiUid: "other-uid" } }, res);
  assert.equal(res.statusCode, 409);
  available = true;
  res = reply();
  await confirm(req, res);
  assert.deepEqual(res.body, { state: "confirmed" });
  assert.equal(row.verified, true);
  assert.equal(row.pending, undefined);
  res = reply();
  await confirm(req, res);
  assert.deepEqual(res.body, { state: "confirmed" });
});
