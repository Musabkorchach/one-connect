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

test("prepare refuses wallet linking when Pi does not verify ownership", async () => {
  const handlers = new Map();
  const app = { get: (path, _auth, fn) => handlers.set(path, fn), post: (path, _auth, fn) => handlers.set(path, fn) };
  const collection = { createIndex: async () => {} };
  const calls = [];
  registerPiTestnetSubscriptions({
    app, db: { collection: () => collection }, authenticateSession() {}, sessionIsCurrent: () => true,
    provider: { service: async () => ({ active: true }), isWallet: () => true },
    verifyWallet: async (...args) => { calls.push(args); return false; },
  });
  const reply = { set() {}, status(code) { this.code = code; return this; }, json(value) { this.body = value; } };
  await handlers.get("/api/pi-testnet/subscription/prepare")({
    user: { verifiedPiUid: "verified-uid" }, body: { wallet, accessToken: "test-token" },
  }, reply);
  assert.equal(reply.code, 403);
  assert.deepEqual(reply.body, { code: "WALLET_UNVERIFIED" });
  assert.deepEqual(calls, [["test-token", "verified-uid", wallet]]);
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
