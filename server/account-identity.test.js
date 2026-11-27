import assert from "node:assert/strict";
import { once } from "node:events";
import { createHmac, randomBytes } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
import ts from "typescript";
import { createConnection, createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { setTimeout as wait } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import express from "express";
import { io as connectSocket } from "socket.io-client";
import { Collection, MongoClient, ObjectId } from "mongodb";
import { createVerifyPiLogin, isAccountBindingEnabled } from "./pi-login.js";
import { registerPiTestnetSubscriptions } from "./pi-testnet-subscription-routes.js";
import {
  accountIdentityIndexes,
  identityBindingsCollection,
  resolveVerifiedPiAccount,
} from "./account-identity.js";
import { cleanDeletionPhase } from "./account-deletion-cleanup.js";
import { archiveOwnedGroupsForDeletion } from "./group-ownership.js";
import { pstnAbuseKey, terminateAccountPstn } from "./pstn-account.js";
import { createAccountDeletion, deletionCollection } from "./account-deletion.js";
import { createSubscriptionFixture, EntitlementProofConflict } from "./subscription-fixture.test-helper.js";
import { createAccountEntitlements, recordVerifiedPeriod, subscriptionFixtureCollection, subscriptionSettings } from "./account-entitlements.js";
import { deletionConfirmations } from "./account-deletion-routes.js";
import { mailQuotaKey } from "./account-external-operations.js";
import { deletionFileCandidates } from "./account-file-cleanup.js";
import { createAccountWriteFence, insertWithScopedFile, saveScopedFile } from "./account-write-fence.js";
import { privateConversationId } from "./account-chat-conversations.js";
import { auditLegacyOwnership } from "./audit-legacy-ownership.js";

let client;
let mongo;

before(async () => {
  const binary = process.env.ONE_CONNECT_TEST_MONGOD;
  assert.ok(binary, "Set ONE_CONNECT_TEST_MONGOD to a local mongod executable");
  const dataPath = await mkdtemp(join(tmpdir(), "one-connect-mongo-test-"));
  const listener = createServer();
  await new Promise((resolve, reject) => {
    listener.once("error", reject);
    listener.listen(0, "127.0.0.1", resolve);
  });
  const { port } = listener.address();
  await new Promise((resolve, reject) => listener.close((error) => error ? reject(error) : resolve()));

  mongo = spawn(binary, [
    "--bind_ip", "127.0.0.1", "--port", String(port), "--dbpath", dataPath,
    "--logpath", join(dataPath, "mongod.log"), "--replSet", "one-connect-fixture",
    "--setParameter", "indexBuildMinAvailableDiskSpaceMB=32",
  ], { stdio: "ignore", windowsHide: true });
  await new Promise((resolve, reject) => {
    mongo.once("spawn", resolve);
    mongo.once("error", reject);
  });
  let ready = false;
  for (let attempt = 0; attempt < 100 && !ready; attempt++) {
    assert.equal(mongo.exitCode, null, "Isolated mongod exited");
    ready = await new Promise((resolve) => {
      const probe = createConnection(port, "127.0.0.1");
      probe.once("error", () => resolve(false));
      probe.once("connect", () => {
        probe.destroy();
        resolve(true);
      });
    });
    if (!ready) await wait(150);
  }
  assert.ok(ready, "Isolated mongod did not start");
  client = new MongoClient(`mongodb://127.0.0.1:${port}/?directConnection=true`, {
    serverSelectionTimeoutMS: 2000,
  });
  const status = await client.db("admin").command({ serverStatus: 1 });
  assert.equal(Number(status.pid), mongo.pid, "Refusing to use a different MongoDB process");
  await client.db("admin").command({
    replSetInitiate: { _id: "one-connect-fixture", members: [{ _id: 0, host: `127.0.0.1:${port}` }] },
  });
  for (let attempt = 0; attempt < 100; attempt++) {
    if ((await client.db("admin").command({ hello: 1 })).isWritablePrimary) return;
    await wait(150);
  }
  assert.fail("Isolated replica set never became primary");
});

after(async () => {
  try {
    await client?.close();
  } finally {
    if (mongo?.pid && mongo.exitCode === null) mongo.kill();
  }
});

async function accountFixture(name) {
  const db = client.db(name);
  const bindings = db.collection(identityBindingsCollection);
  await bindings.createIndexes(accountIdentityIndexes);
  return { db, bindings };
}

test("concurrent resolutions of a verified Pi UID return one active account", async () => {
  const { db, bindings } = await accountFixture("one_connect_test_concurrent");
  const results = await Promise.all(
    Array.from({ length: 32 }, () => resolveVerifiedPiAccount(db, "verified-uid")),
  );
  assert.equal(results[0].state, "active");
  assert.ok(results[0].accountId);
  for (const result of results) assert.deepEqual(result, results[0]);
  assert.equal(await bindings.countDocuments(), 1);
  await assert.rejects(bindings.insertOne({
    _id: "another-uid", accountId: results[0].accountId, state: "active",
  }), { code: 11000 });
});

test("deleting reserves the Pi UID and returns no active account", async () => {
  const { db, bindings } = await accountFixture("one_connect_test_deleting");
  const original = await resolveVerifiedPiAccount(db, "verified-uid");
  await bindings.updateOne({ _id: "verified-uid" }, { $set: { state: "deleting" } });
  const results = await Promise.all(
    Array.from({ length: 16 }, () => resolveVerifiedPiAccount(db, "verified-uid")),
  );
  for (const result of results) assert.deepEqual(result, { state: "deleting" });
  assert.equal(await bindings.countDocuments(), 1);
  assert.equal((await bindings.findOne({ _id: "verified-uid" })).accountId, original.accountId);
});

test("after finalization the same Pi UID cannot match old account-scoped data", async () => {
  const { db, bindings } = await accountFixture("one_connect_test_return");
  const original = await resolveVerifiedPiAccount(db, "verified-uid");
  const recipient = await resolveVerifiedPiAccount(db, "recipient-uid");
  const sharedRecords = db.collection("shared_records_fixture");
  await sharedRecords.insertOne({
    ownerAccountId: original.accountId, recipientAccountId: recipient.accountId,
  });
  await bindings.updateOne({ _id: "verified-uid" }, { $set: { state: "deleting" } });
  // Fixture for the future deletion worker's completed cleanup and release.
  await bindings.deleteOne({ _id: "verified-uid", accountId: original.accountId, state: "deleting" });
  const returned = await resolveVerifiedPiAccount(db, "verified-uid");
  assert.equal(returned.state, "active");
  assert.notEqual(returned.accountId, original.accountId);
  assert.equal(await sharedRecords.countDocuments({
    $or: [{ ownerAccountId: returned.accountId }, { recipientAccountId: returned.accountId }],
  }), 0);
  assert.equal(await sharedRecords.countDocuments({ recipientAccountId: recipient.accountId }), 1);

  // A delayed finalization for the old generation must also miss if the new
  // generation has independently entered deletion.
  await bindings.updateOne(
    { _id: "verified-uid", accountId: returned.accountId },
    { $set: { state: "deleting" } },
  );
  const staleRelease = await bindings.deleteOne({
    _id: "verified-uid", accountId: original.accountId, state: "deleting",
  });
  assert.equal(staleRelease.deletedCount, 0);
  assert.equal((await bindings.findOne({ _id: "verified-uid" })).accountId, returned.accountId);
});

test("experimental startup rejects a remote or discoverable MongoDB topology before connecting", () => {
  const script = fileURLToPath(new URL("./server.js", import.meta.url));
  for (const uri of [
    "mongodb://remote.invalid:27017/?directConnection=true",
    "mongodb://127.0.0.1:27017/?replicaSet=unverified",
  ]) {
    const result = spawnSync(process.execPath, [script], {
      cwd: tmpdir(), encoding: "utf8", timeout: 8000, windowsHide: true,
      env: { SystemRoot: process.env.SystemRoot, NODE_ENV: "test", ONE_CONNECT_TEST_ACCOUNT_BINDING: "1", MONGODB_URI: uri },
    });
    assert.ifError(result.error);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /requires a direct loopback MongoDB connection/);
    assert.doesNotMatch(result.stdout, /MongoDB connected/);
  }
});

test("dry-run CLI rejects apply, remote hosts and connection strings", () => {
  const script = fileURLToPath(new URL("./audit-legacy-ownership.js", import.meta.url));
  const database = "one_connect_audit_fixture";
  for (const args of [
    ["--apply", "27017", database],
    ["--dry-run", "remote.invalid", database],
    ["--dry-run", "mongodb://remote.invalid:27017", database],
    ["--dry-run", "27017", database, "--apply"],
  ]) {
    const result = spawnSync(process.execPath, [script, ...args], {
      encoding: "utf8",
      timeout: 5000,
    });
    assert.ifError(result.error);
    assert.equal(result.status, 2);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /^Usage:/);
  }
});

test("dry-run reports legacy conflicts and unproven ownership without writes or record values", async () => {
  const db = client.db("one_connect_audit_fixture");
  const registrations = db.collection("email_users");
  const messages = db.collection("messages");
  await registrations.insertMany([
    { _id: "alice", piUsername: "alice", userId: "pi_alice" },
    { _id: "Alice", piUsername: "someone-else", userId: "pi_unknown" },
  ]);
  await messages.insertOne({
    senderUsername: "alice", recipientUsername: "bob", body: "private-fixture-value",
  });
  const before = await messages.findOne();
  const report = await auditLegacyOwnership(db);
  assert.deepEqual(report.collections.messages, {
    scanned: 1,
    usernameDependent: 1,
    issues: {
      unproven_pi_uid_ownership: 1,
      ambiguous_legacy_registration: 1,
      missing_legacy_registration: 1,
    },
  });
  assert.equal(report.collections.email_users.issues.conflicting_registration, 1);
  assert.equal(report.collections.email_users.issues.conflicting_legacy_owner, 1);
  assert.doesNotMatch(JSON.stringify(report), /alice|bob|private-fixture-value/i);
  assert.deepEqual(await messages.findOne(), before);
  assert.equal(await registrations.countDocuments(), 2);
});


test("account binding requires the explicit flag and test environment", () => {
  assert.equal(isAccountBindingEnabled({ NODE_ENV: "test" }), false);
  assert.equal(isAccountBindingEnabled({ NODE_ENV: "production", ONE_CONNECT_TEST_ACCOUNT_BINDING: "1" }), false);
  assert.equal(isAccountBindingEnabled({ NODE_ENV: "test", ONE_CONNECT_TEST_ACCOUNT_BINDING: "1" }), true);
});

async function loginFixture(t, name, bindAccounts) {
  const { db, bindings } = await accountFixture(name);
  const userSessions = new Map();
  const users = new Map();
  const emailUsersCollection = db.collection("email_users");
  const piResponses = new Map([
    ["verified", { uid: "verified-uid", username: "VerifiedName" }],
    ["renamed", { uid: "verified-uid", username: "Renamed" }],
    ["no-uid", { username: "VerifiedName" }],
  ]);
  const app = express();
  app.post("/api/auth/verify", express.json(), createVerifyPiLogin({
    db, emailUsersCollection, users, userSessions, bindAccounts,
    normalizeMessagingUsername: (username) => username.toLowerCase(),
    verifyFetch: async (url, { headers }) => {
      assert.equal(url, "https://api.minepi.com/v2/me");
      assert.match(headers.Authorization, /^Bearer /);
      const identity = piResponses.get(headers.Authorization.slice(7));
      return { ok: Boolean(identity), json: async () => identity };
    },
  }));
  const server = await new Promise((resolve, reject) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
    listener.once("error", reject);
  });
  t.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  async function login(body) {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/auth/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  }
  return { login, bindings, userSessions, users, emailUsersCollection };
}

test("Pi login binds the verified UID and ignores forged client identity", async (t) => {
  const { login, bindings, userSessions, users, emailUsersCollection } =
    await loginFixture(t, "one_connect_login_verified", true);
  const legacy = { _id: "verifiedname", userId: "old-owner" };
  await emailUsersCollection.insertOne(legacy);
  const forged = { uid: "forged-uid", username: "Imposter", accountId: "forged-account" };
  assert.equal((await login({ accessToken: "invalid", ...forged })).status, 401);
  assert.equal((await login({ accessToken: "no-uid", ...forged })).status, 401);
  assert.equal(userSessions.size, 0);
  assert.equal(await bindings.countDocuments(), 0);

  const result = await login({ accessToken: "verified", ...forged });
  assert.equal(result.status, 200);
  assert.equal(result.body.piUsername, "VerifiedName");
  assert.equal(result.body.accountDataStatus, "ACCOUNT_MIGRATION_REQUIRED");
  assert.equal(result.body.accountDeletionSupported, true);
  assert.equal(result.body.emailSocketMode, "account");
  assert.equal(result.body.chatSocketMode, "account");
  assert.equal(result.body.accountId, undefined);
  const binding = await bindings.findOne({ _id: "verified-uid" });
  const session = userSessions.get(result.body.sessionToken);
  assert.equal(session.accountId, binding.accountId);
  assert.notEqual(session.accountId, forged.accountId);
  assert.equal(session.piUsername, "VerifiedName");
  const renamed = await login({ accessToken: "renamed" });
  assert.equal(renamed.status, 200);
  assert.equal(renamed.body.piUsername, "Renamed");
  assert.equal(userSessions.get(renamed.body.sessionToken).accountId, binding.accountId);
  assert.equal(await bindings.countDocuments(), 1);
  assert.deepEqual(await emailUsersCollection.find().toArray(), [legacy]);
  assert.equal(users.size, 0);
});

test("concurrent first logins issue sessions for one account", async (t) => {
  const { login, bindings, userSessions } = await loginFixture(t, "one_connect_login_concurrent", true);
  const results = await Promise.all(Array.from({ length: 24 }, () => login({ accessToken: "verified" })));
  const binding = await bindings.findOne({ _id: "verified-uid" });
  assert.equal(await bindings.countDocuments(), 1);
  assert.equal(userSessions.size, results.length);
  for (const result of results) {
    assert.equal(result.status, 200);
    assert.equal(userSessions.get(result.body.sessionToken).accountId, binding.accountId);
  }
});

test("a deleting account never receives a new session", async (t) => {
  const { login, bindings, userSessions, users, emailUsersCollection } =
    await loginFixture(t, "one_connect_login_deleting", true);
  await bindings.insertOne({ _id: "verified-uid", accountId: "reserved-id", state: "deleting" });
  const result = await login({ accessToken: "verified" });
  assert.equal(result.status, 409);
  assert.equal(result.body.code, "ACCOUNT_DELETING");
  assert.equal(result.body.sessionToken, undefined);
  assert.equal(userSessions.size, 0);
  assert.equal(users.size, 0);
  assert.equal(await emailUsersCollection.countDocuments(), 0);
});

test("disabled login preserves the username session and registration without requiring a UID", async (t) => {
  const { login, bindings, userSessions, users, emailUsersCollection } =
    await loginFixture(t, "one_connect_login_disabled", false);
  await bindings.insertOne({ _id: "verified-uid", accountId: "reserved-id", state: "deleting" });
  for (const accessToken of ["no-uid", "verified"]) {
    const result = await login({ accessToken, accountId: "forged-account" });
    const { sessionToken, ...response } = result.body;
    assert.equal(result.status, 200);
    assert.deepEqual(response, { userId: "pi_VerifiedName", piUsername: "VerifiedName", message: "Authenticated" });
    assert.equal(Object.hasOwn(userSessions.get(sessionToken), "accountId"), false);
  }
  assert.equal(users.get("pi_VerifiedName").piUsername, "VerifiedName");
  assert.equal((await emailUsersCollection.findOne({ _id: "verifiedname" })).userId, "pi_VerifiedName");
  assert.deepEqual(await bindings.find().toArray(), [
    { _id: "verified-uid", accountId: "reserved-id", state: "deleting" },
  ]);
});

const emailTestDomain = "mail.fixture.test";
const emailTestSigningKey = "local-signing-key";

async function startEmailTestServer(t, bindAccounts, fixtureEnv = {}) {
  const bootstrap = `
    import { Server, ServerResponse } from "node:http";
    import { registerHooks } from "node:module";
    registerHooks({ resolve(specifier, context, next) {
      if (specifier === "twilio") return { url: "data:text/javascript;base64,aW1wb3J0IHsgY3JlYXRlSG1hYywgdGltaW5nU2FmZUVxdWFsIH0gZnJvbSAibm9kZTpjcnlwdG8iOwpmdW5jdGlvbiB2YWxpZGF0ZVJlcXVlc3Qoc2VjcmV0LCBzaWduYXR1cmUsIHVybCwgYm9keSkgewogIGNvbnN0IGV4cGVjdGVkID0gY3JlYXRlSG1hYygic2hhMjU2Iiwgc2VjcmV0KS51cGRhdGUoSlNPTi5zdHJpbmdpZnkoW3VybCwgT2JqZWN0LmVudHJpZXMoYm9keSkuc29ydCgpXSkpLmRpZ2VzdCgiaGV4Iik7CiAgcmV0dXJuIHNpZ25hdHVyZS5sZW5ndGggPT09IGV4cGVjdGVkLmxlbmd0aCAmJiB0aW1pbmdTYWZlRXF1YWwoQnVmZmVyLmZyb20oc2lnbmF0dXJlKSwgQnVmZmVyLmZyb20oZXhwZWN0ZWQpKTsKfQpjbGFzcyBBY2Nlc3NUb2tlbiB7CiAgc3RhdGljIFZvaWNlR3JhbnQgPSBjbGFzcyB7fTsKICBjb25zdHJ1Y3RvcihfYWNjb3VudCwgX2tleSwgX3NlY3JldCwgb3B0aW9ucykgeyB0aGlzLmlkZW50aXR5ID0gb3B0aW9ucy5pZGVudGl0eTsgfQogIGFkZEdyYW50KCkge30KICB0b0p3dCgpIHsgcmV0dXJuICJtb2NrLXRva2VuOiIgKyB0aGlzLmlkZW50aXR5OyB9Cn0KY2xhc3MgVm9pY2VSZXNwb25zZSB7CiAgZGlhbChvcHRpb25zKSB7IHJldHVybiB7IG51bWJlcjogKF9hdHRyaWJ1dGVzLCBwaG9uZSkgPT4geyB0aGlzLnhtbCA9ICc8RGlhbCBhY3Rpb249IicgKyAob3B0aW9ucy5hY3Rpb24gPz8gIiIpICsgJyIgdGltZUxpbWl0PSInICsgb3B0aW9ucy50aW1lTGltaXQgKyAnIj4nICsgcGhvbmUgKyAnPC9EaWFsPic7IH0gfTsgfQogIGhhbmd1cCgpIHt9CiAgdG9TdHJpbmcoKSB7IHJldHVybiAiPFJlc3BvbnNlPiIgKyAodGhpcy54bWwgPz8gIiIpICsgIjwvUmVzcG9uc2U+IjsgfQp9CmV4cG9ydCBkZWZhdWx0IE9iamVjdC5hc3NpZ24oKCkgPT4gKHsKICBjYWxsczogKHNpZCkgPT4gKHsKICAgIGZldGNoOiBhc3luYyAoKSA9PiB7CiAgICAgIGNvbnN0IGNhbGwgPSBnbG9iYWxUaGlzLmZpeHR1cmVUd2lsaW9DYWxscz8uZ2V0KHNpZCk7CiAgICAgIGlmICghY2FsbCkgdGhyb3cgbmV3IEVycm9yKCJVbmNvbmZpZ3VyZWQgbW9jayBDYWxsIHJlc291cmNlIik7CiAgICAgIHJldHVybiBjYWxsOwogICAgfSwKICB9KSwKfSksCiAgeyB2YWxpZGF0ZVJlcXVlc3QsIGp3dDogeyBBY2Nlc3NUb2tlbiB9LCB0d2ltbDogeyBWb2ljZVJlc3BvbnNlIH0gfSk7Cg==", shortCircuit: true };
      return next(specifier, context);
    } });
    import { Collection, ClientSession, FindCursor } from "${import.meta.resolve("mongodb")}";
    const afterCommit = new WeakMap();
    const pause = (id) => new Promise((resolve) => {
      function release(message) {
        if (message.resume !== id) return;
        process.off("message", release);
        resolve();
      }
      process.on("message", release);
      process.send({ held: id });
    });
    const commit = ClientSession.prototype.commitTransaction;
    ClientSession.prototype.commitTransaction = async function (...args) {
      const result = await commit.apply(this, args);
      const id = afterCommit.get(this);
      if (id) {
        afterCommit.delete(this);
        await pause(id);
      }
      return result;
    };
    const insertOne = Collection.prototype.insertOne;
    Collection.prototype.insertOne = async function (record, options) {
      const result = await insertOne.call(this, record, options);
      const id = record.accountMessageId ?? record.clientMessageId;
      if ((this.collectionName === "emails" && id?.startsWith("socket-held-")) ||
          (this.collectionName === "messages" && id?.startsWith("chat-held-")) ||
          (this.collectionName === "account_group_messages" && id?.startsWith("group-held-"))) {
        if (options?.session) afterCommit.set(options.session, id);
        else await pause(id);
      }
      return result;
    };
    const heldReads = new Set();
    for (const method of ["next", "toArray"]) {
      const operate = FindCursor.prototype[method];
      FindCursor.prototype[method] = async function (...args) {
        const result = await operate.apply(this, args);
        const key = method + ":" + this.namespace.collection;
        if (heldReads.delete(key)) await pause(key);
        return result;
      };
    }
    let heldJob;
    const claimJob = Collection.prototype.findOneAndUpdate;
    Collection.prototype.findOneAndUpdate = async function (...args) {
      const job = await claimJob.apply(this, args);
      if (heldJob && job?._id === heldJob && this.collectionName === "account_deletion_jobs") {
        heldJob = null;
        await pause("deletion-lease");
      }
      return job;
    };
    let heldAccount;
    const updateOne = Collection.prototype.updateOne;
    Collection.prototype.updateOne = async function (filter, update, options) {
      if (heldAccount && filter.accountId === heldAccount && update.$inc?.accountWriteFence) {
        heldAccount = null;
        await pause("deletion-write");
      }
      return updateOne.call(this, filter, update, options);
    };
    let fixtureTime = Number(process.env.PSTN_FIXTURE_TIME) || null;
    const realNow = Date.now;
    Date.now = () => fixtureTime ?? realNow();
    process.on("message", async (message) => {
      if (message.pstnCall && fixtureTime !== null) {
        globalThis.fixtureTwilioCalls ??= new Map();
        globalThis.fixtureTwilioCalls.set(message.pstnCall.sid, message.pstnCall);
        process.send({ pstnCall: message.pstnCall.sid });
      }
      if (message.pstnTime && fixtureTime !== null) {
        fixtureTime = message.pstnTime;
        process.send({ pstnTime: fixtureTime });
      }
      if (message.holdRead) {
        heldReads.add(message.holdRead);
        process.send({ armed: message.holdRead });
      }
      if (message.holdDeletionJob) {
        heldJob = message.holdDeletionJob;
        process.send({ armed: heldJob });
      }
      if (message.holdAccountFence) {
        heldAccount = message.holdAccountFence;
        process.send({ armed: heldAccount });
      }
      if (message.startDeletion) {
        try {
          const { accountDeletion } = await import("${new URL("./server.js", import.meta.url).href}");
          const job = await accountDeletion.start(message.startDeletion);
          process.send({ deletionReply: message.requestId, jobId: job.jobId, phase: job.phase });
        } catch {
          process.send({ deletionReply: message.requestId, error: "start failed" });
        }
      }
    });
    const listen = Server.prototype.listen;
    Server.prototype.listen = function (port, callback) {
      return listen.call(this, Number(port), "127.0.0.1", () => {
        callback?.();
        console.log("HTTP_FIXTURE_PORT=" + this.address().port);
      });
    };
    const end = ServerResponse.prototype.end;
    let dropDeletionResponse = process.env.DROP_DELETION_RESPONSE === "1";
    ServerResponse.prototype.end = function (...args) {
      if (dropDeletionResponse && this.req.url === "/api/account/deletion/confirm" && this.statusCode === 202) {
        dropDeletionResponse = false;
        this.destroy();
        return this;
      }
      return end.apply(this, args);
    };
    globalThis.fetch = async (url, options) => {
      if (url === "https://api.minepi.com/v2/me") {
        const token = options.headers.Authorization.slice(7);
        if (token === "subscription-no-uid") return Response.json({ username: token });
        if (token === "delete-http-different-uid") return Response.json({ uid: "different-uid", username: "delete-http" });
        if (token === "demo-reviewer-other") return Response.json({ uid: "demo-reviewer-other", username: "demo-reviewer" });
        if (token === "demo-reviewer" || token === "demo-peer") return Response.json({ uid: token + "-uid", username: token });
        const username = ["group-audit-owner", "delete-restart-audit", "delete-http", "delete-http-peer", "delete-http-rate", "alice", "bob", "eve", "dan", "fran", "pat", "chat-a", "chat-b", "chat-c", "group-owner", "group-reader", "group-removed", "group-invite", "group-outsider", "owner-transfer", "owner-successor", "owner-reader", "priv-a", "priv-b", "priv-c", "priv-legacy", "call-a", "call-b", "call-c", "phone-a", "phone-b", "delete-fixture", "delete-peer"].includes(token) ? token : undefined;
        return username ? Response.json({ uid: token + "-uid", username }) : new Response(null, { status: 401 });
      }
      if (url === "https://api.mailgun.net/v3/${emailTestDomain}/messages") {
        if (!options.body.get("h:Reply-To")?.endsWith("@${emailTestDomain}")) throw new Error("Missing reply address");
        if (options.body.get("subject") === "hold-deletion-mail") await pause("mailgun-deletion");
        return Response.json({ id: "<mock-delivery@fixture.test>" });
      }
      throw new Error("Unexpected external fetch");
    };
  `;
  const localMongo = client.options.hosts[0].toString();
  assert.match(localMongo, /^127\.0\.0\.1:\d+$/);
  const child = spawn(process.execPath, [
    "--import", "data:text/javascript;base64," + Buffer.from(bootstrap).toString("base64"),
    fileURLToPath(new URL("./server.js", import.meta.url)),
  ], {
    cwd: tmpdir(),
    env: {
      SystemRoot: process.env.SystemRoot,
      TEMP: tmpdir(),
      NODE_ENV: "test",
      ONE_CONNECT_TEST_ACCOUNT_BINDING: bindAccounts ? "1" : "0",
      MONGODB_URI: `mongodb://${localMongo}/?directConnection=true`,
      PORT: "0",
      MAILGUN_DOMAIN: emailTestDomain,
      MAILGUN_API_KEY: "fixture-key",
      MAILGUN_API_BASE_URL: "https://api.mailgun.net",
      MAILGUN_WEBHOOK_SIGNING_KEY: emailTestSigningKey,
      ...fixtureEnv,
    },
    stdio: ["ignore", "pipe", "pipe", "ipc"],
    windowsHide: true,
  });
  const exited = new Promise((resolve) => child.once("close", resolve));
  t.after(async () => {
    if (child.exitCode === null) child.kill();
    await exited;
  });
  const port = await new Promise((resolve, reject) => {
    let output = "";
    let errors = "";
    const timer = setTimeout(() => reject(new Error("Email fixture did not start: " + errors)), 20000);
    child.stderr.on("data", (data) => {
      errors += data.toString();
      t.diagnostic(data.toString());
    });
    child.stdout.on("data", (data) => {
      output += data.toString();
      const match = output.match(/HTTP_FIXTURE_PORT=(\d+)/);
      if (match) {
        clearTimeout(timer);
        resolve(Number(match[1]));
      }
    });
    child.once("error", (error) => { clearTimeout(timer); reject(error); });
    child.once("close", (code) => { clearTimeout(timer); reject(new Error(`Email fixture exited ${code}: ${errors}`)); });
  });

  async function request(path, { token, method = "GET", body, origin = fixtureEnv.ONECONNECT_PRODUCTION_ORIGIN } = {}) {
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    if (origin) headers.Origin = origin;
    if (body && !(body instanceof FormData)) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(body);
    }
    const response = await fetch(`http://127.0.0.1:${port}${path}`, { method, headers, body });
    const result = response.headers.get("content-type")?.includes("application/json")
      ? await response.json()
      : await response.text();
    return { status: response.status, body: result };
  }

  const login = (accessToken) => request("/api/auth/verify", { method: "POST", body: { accessToken } });
  const upload = (token, recipient) => {
    const body = new FormData();
    body.set("recipient", recipient);
    body.set("file", new Blob(["fixture attachment"]), "fixture.txt");
    return request("/api/emails/attachments", { token, method: "POST", body });
  };
  function webhook(replyToken, label, withAttachment = false) {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const token = randomBytes(25).toString("hex");
    const signature = createHmac("sha256", emailTestSigningKey).update(timestamp + token).digest("hex");
    const body = new FormData();
    for (const [key, value] of Object.entries({
      timestamp, token, signature, recipient: `reply-${replyToken}@${emailTestDomain}`,
      sender: "outside@fixture.test", "Message-Id": `<${label}@fixture.test>`, "body-plain": label,
    })) body.set(key, value);
    if (withAttachment) body.set("attachment-1", new Blob(["inbound attachment"]), "reply.txt");
    return request("/api/emails/external/inbound", { method: "POST", body });
  }
  return { request, login, upload, webhook, child, origin: `http://127.0.0.1:${port}` };
}

test("Production runs existing account routes with separate data and sessions", async (t) => {
  const localMongo = client.options.hosts[0].toString();
  const legacy = await startEmailTestServer(t, true);
  const production = await startEmailTestServer(t, false, {
    NODE_ENV: "production",
    ONECONNECT_DEPLOYMENT: "production",
    ONECONNECT_PRODUCTION_ORIGIN: "https://production-review.example",
    ONECONNECT_PRODUCTION_MONGODB_URI: `mongodb://${localMongo}/oneconnect_production?directConnection=true`,
    PI_TESTNET_SUBSCRIPTION_SERVICE_ID: "460",
  });
  assert.equal((await production.login("invalid")).status, 401);
  const productionOrigin = "https://production-review.example";
  assert.equal((await production.request("/api/auth/verify", {
    method: "POST", body: { accessToken: "demo-reviewer" }, origin: "https://testnet.example",
  })).status, 403);
  const getSession = async (server, token) => {
    const result = await server.login(token);
    assert.equal(result.status, 200);
    return result.body;
  };
  const testnet = await getSession(legacy, "demo-reviewer");
  const reviewer = await getSession(production, "demo-reviewer");
  assert.equal((await production.login("demo-reviewer-other")).status, 409);
  const peer = await getSession(production, "demo-peer");
  const token = reviewer.sessionToken;
  assert.equal(reviewer.piUsername, testnet.piUsername);
  assert.notEqual(reviewer.userId, testnet.userId);
  assert.equal(reviewer.subscriptionStatusSupported, false);
  assert.equal(reviewer.accountDeletionSupported, true);
  assert.equal((await legacy.request("/api/profile", { token, method: "GET" })).status, 401);
  assert.equal((await production.request("/api/profile", { token: testnet.sessionToken })).status, 401);
  assert.equal((await legacy.request("/api/profile", { token: testnet.sessionToken, method: "PUT", body: { displayName: "Testnet only" } })).status, 200);
  assert.equal((await production.request("/api/profile", { token })).body.profile, null);
  assert.equal((await production.request("/api/profile", { token, method: "PUT", body: { displayName: "Production only" } })).body.profile.displayName, "Production only");
  assert.equal((await production.request("/api/profile", { token: peer.sessionToken })).body.profile, null);
  assert.equal((await legacy.request("/api/profile", { token: testnet.sessionToken })).body.profile.displayName, "Testnet only");
  assert.equal((await production.request("/api/contacts", { token, method: "POST", body: { username: "demo-peer" } })).status, 201);
  assert.equal((await production.request("/api/contacts", { token })).body.contacts.length, 1);
  const draftsPath = "/api/state/connect.invoice-drafts";
  assert.equal((await production.request(draftsPath, { token })).body.revision, 0);
  const drafts = { schemaVersion: "1.0", items: [] };
  const savedDrafts = await production.request(draftsPath, { token, method: "PUT", body: { blob: drafts, expectedRevision: 0 } });
  assert.deepEqual(savedDrafts.body, { revision: 1 });
  assert.deepEqual((await production.request(draftsPath, { token })).body.blob, drafts);
  assert.equal((await production.request(draftsPath, { token: peer.sessionToken })).body.blob, null);
  for (const key of ["connect.calls", "connect.emails"]) {
    const path = "/api/state/" + key;
    const blob = { items: [{ id: "owner-only" }] };
    assert.equal((await production.request(path, { token, method: "PUT", body: { blob } })).status, 204);
    assert.deepEqual((await production.request(path, { token })).body.blob, blob);
    assert.equal((await production.request(path, { token: peer.sessionToken })).body.blob, null);
    assert.equal((await production.request(path, { token: testnet.sessionToken })).status, 401);
  }

  for (const [server, wrongToken] of [[legacy, token], [production, testnet.sessionToken]]) {
    const { socket } = connectMailSocket(t, server.origin, wrongToken, "/chat", {}, server === production ? productionOrigin : undefined);
    const rejected = expectSocketEvent(socket, "connect_error");
    socket.connect();
    await rejected;
  }
  const { socket } = connectMailSocket(t, production.origin, token, "/chat", {}, productionOrigin);
  const connected = expectSocketEvent(socket, "connect");
  socket.connect();
  await connected;
  const { socket: peerSocket } = connectMailSocket(t, production.origin, peer.sessionToken, "/chat", {}, productionOrigin);
  const peerConnected = expectSocketEvent(peerSocket, "connect");
  peerSocket.connect();
  await peerConnected;
  const conversation = await production.request("/api/chat/conversations", { token, method: "POST", body: { username: "demo-peer" } });
  assert.equal(conversation.status, 200);
  const conversationId = conversation.body.conversationId;
  const received = expectSocketEvent(peerSocket, "message:new");
  socket.emit("message:send", { conversationId, kind: "text", text: "Production chat", messageId: "prod-demo-message" });
  await received;
  const history = await production.request("/api/chat/conversations/" + conversationId, { token: peer.sessionToken });
  assert.equal(history.status, 200);
  assert.equal(history.body.messages[0].text, "Production chat");
  const inbox = await production.request("/api/chat/conversations", { token: peer.sessionToken });
  assert.equal(inbox.body.conversations[0].last.text, "Production chat");
  assert.equal(inbox.body.conversations[0].unread, 1);
  const group = await production.request("/api/groups", { token, method: "POST", body: { name: "Production group", members: ["demo-peer"] } });
  assert.equal(group.status, 201);
  assert.equal((await production.request("/api/groups", { token })).body.groups.length, 1);
  const groupRoute = "/api/groups/" + group.body.group.id;
  const groupApi = (who, path, method = "GET", body) => production.request(groupRoute + path, { token: who, method, body });
  assert.equal((await groupApi(peer.sessionToken, "/messages")).status, 404);
  assert.equal((await groupApi(peer.sessionToken, "/invitations/accept", "POST")).status, 200);
  assert.equal((await groupApi(peer.sessionToken, "/invitations", "POST", { username: "demo-reviewer" })).status, 403);
  const attachment = new FormData();
  attachment.set("kind", "file");
  attachment.set("file", new Blob(["production group file"]), "review.txt");
  const file = await groupApi(token, "/media", "POST", attachment);
  assert.equal(file.status, 201);
  const mediaId = file.body.mediaId;
  assert.equal((await groupApi(peer.sessionToken, "/media/" + mediaId)).status, 404);
  assert.equal((await groupApi(token, "/messages", "POST", { id: "production-media", kind: "file", text: "", mediaId })).status, 201);
  assert.equal((await groupApi(peer.sessionToken, "/media/" + mediaId)).body, "production group file");
  const member = (await production.request("/api/groups", { token })).body.groups[0].members.find(item => item.username === "demo-peer");
  const offer = await groupApi(token, "/ownership-offers", "POST", { memberId: member.id });
  assert.equal(offer.status, 201);
  assert.equal((await groupApi(peer.sessionToken, "/ownership-offers/" + offer.body.offerId + "/accept", "POST")).status, 200);
  assert.equal((await production.request("/api/groups", { token: peer.sessionToken })).body.groups[0].isOwner, true);
  assert.equal((await groupApi(token, "/invitations", "POST", { username: "demo-peer" })).status, 403);
  const formerOwner = (await production.request("/api/groups", { token: peer.sessionToken })).body.groups[0].members.find(item => item.username === "demo-reviewer");
  assert.equal((await groupApi(peer.sessionToken, "/members/" + formerOwner.id, "DELETE")).status, 200);
  assert.equal((await groupApi(token, "/media/" + mediaId)).status, 404);
  const mail = await production.request("/api/emails/internal", { token, method: "POST", body: {
    id: "production-demo-mail", recipient: "@demo-peer", subject: "Production mail", body: "isolated",
  } });
  assert.equal(mail.status, 201);
  assert.equal((await production.request("/api/emails", { token: peer.sessionToken })).body.emails[0].subject, "Production mail");
  for (const [method, path] of [["GET", "/api/pi-testnet/subscription/plan"], ["GET", "/api/subscriptions/status"],
    ["POST", "/api/emails/external"], ["POST", "/api/emails/external/inbound"], ["POST", "/api/calls/pstn/prepare"], ["POST", "/api/call-test/login"]]) {
    assert.equal((await production.request(path, { token, method })).status, 404);
  }
  for (const [session, origin] of [[testnet.sessionToken, productionOrigin], [token, "https://testnet.example"]]) {
    const { socket: rejected } = connectMailSocket(t, production.origin, session, "/calls", { verifiedCallProtocol: 1 }, origin);
    const error = expectSocketEvent(rejected, "connect_error");
    rejected.connect();
    await error;
  }
  const { socket: caller } = await openMailSocket(t, production.origin, token, "/calls", { verifiedCallProtocol: 1 }, productionOrigin);
  assert.equal((await production.request("/api/calls/ice-servers", { token })).status, 200);
  const old = (await openMailSocket(t, production.origin, peer.sessionToken, "/calls", {}, productionOrigin)).socket;
  const oldRings = [];
  old.on("call:incoming", (data) => oldRings.push(data));
  const protocolRejected = expectSocketEvent(old, "call:error");
  old.emit("call:initiate", { callId: randomBytes(16).toString("hex"), kind: "voice", to: "demo-reviewer" });
  assert.equal((await protocolRejected).reason, "call-update-required");
  const newToOld = expectSocketEvent(caller, "call:error");
  const update = expectSocketEvent(old, "call:update-required");
  caller.emit("call:verified-initiate", { callId: randomBytes(16).toString("hex"), protocol: 1, kind: "voice", to: "demo-peer" });
  assert.equal((await newToOld).reason, "call-update-required");
  await update;
  const { socket: receiver } = await openMailSocket(t, production.origin, peer.sessionToken, "/calls", { verifiedCallProtocol: 1 }, productionOrigin);
  const groupCallRejected = expectSocketEvent(receiver, "group-call:error");
  receiver.emit("group-call:start", { groupId: group.body.group.id, callId: "production-group-call", kind: "voice" });
  assert.equal((await groupCallRejected).reason, "unavailable");
  const identity = {};
  const source = await readFile(new URL("../lib/connect/call-identity.ts", import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  new Function("exports", outputText)(identity);
  const [callerKey, receiverKey, unknownKey] = await Promise.all(Array.from({ length: 3 }, () =>
    crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])));
  const callerPin = await identity.callSafetyCode(callerKey.publicKey);
  const receiverPin = await identity.callSafetyCode(receiverKey.publicKey);
  for (const [kind, untrusted] of [["voice", false], ["video", false], ["voice", true]]) {
    const [from, to, fromKey, toKey, fromPin, toPin, fromName, toName] = kind === "video"
      ? [receiver, caller, receiverKey, callerKey, receiverPin, callerPin, "demo-peer", "demo-reviewer"]
      : [caller, receiver, callerKey, receiverKey, callerPin, receiverPin, "demo-reviewer", "demo-peer"];
    const callId = randomBytes(16).toString("hex");
    const challenge = randomBytes(16).toString("hex");
    const binding = { callId, challenge, kind, caller: fromName, recipient: toName };
    const incoming = expectSocketEvent(to, "call:incoming");
    const initiated = expectSocketEvent(from, "call:initiated");
    from.emit("call:verified-initiate", { callId, protocol: 1, kind, to: toName });
    assert.deepEqual(await initiated, { callId, protocol: 1 });
    assert.deepEqual(await incoming, { callId, protocol: 1, kind, from: fromName });
    if (to === receiver) {
      const denied = expectSocketEvent(old, "call:error");
      old.emit("call:accept", { callId, challenge });
      assert.equal((await denied).reason, "verification-failed");
    }
    const accepted = expectSocketEvent(from, "call:accepted");
    to.emit("call:accept", { callId, challenge });
    assert.deepEqual(await accepted, { callId, challenge });
    const offer = await identity.signCallDescription(untrusted ? unknownKey : fromKey, binding, "offer", "production fixture");
    const offered = expectSocketEvent(to, "call:offer");
    from.emit("call:offer", { callId, offer });
    const delivered = (await offered).offer;
    assert.deepEqual(delivered, offer);
    if (untrusted) {
      await assert.rejects(identity.verifyCallDescription(delivered, binding, "offer", fromPin), /identity verification failed/);
    } else {
      assert.equal((await identity.verifyCallDescription(delivered, binding, "offer", fromPin)).sdp, offer.sdp);
      const answer = await identity.signCallDescription(toKey, binding, "answer", "production answer");
      const answered = expectSocketEvent(from, "call:answered");
      to.emit("call:answer", { callId, answer });
      assert.equal((await identity.verifyCallDescription((await answered).answer, binding, "answer", toPin)).sdp, answer.sdp);
      const connected = [from, to].map(socket => expectSocketEvent(socket, "call:connected"));
      from.emit("call:connected", { callId });
      to.emit("call:connected", { callId });
      await Promise.all(connected);
    }
    const ended = expectSocketEvent(from, "call:ended");
    to.emit("call:end", { callId });
    await ended;
  }
  assert.deepEqual(oldRings, []);
  const challenge = await production.request("/api/account/deletion/challenge", { token, method: "POST", body: {} });
  assert.equal(challenge.status, 201);
  const payload = { confirmationToken: challenge.body.confirmationToken, confirm: true };
  const confirmDelete = (accessToken) => production.request("/api/account/deletion/confirm", {
    token, method: "POST", body: { ...payload, accessToken },
  });
  assert.equal((await confirmDelete("demo-peer")).body.code, "PI_IDENTITY_MISMATCH");
  const disconnected = expectSocketEvent(caller, "disconnect");
  assert.equal((await confirmDelete("demo-reviewer")).status, 202);
  await disconnected;
  assert.equal((await production.request("/api/profile", { token })).status, 401);
  assert.equal((await legacy.request("/api/profile", { token: testnet.sessionToken })).body.profile.displayName, "Testnet only");
});

test("all authorized subscription previews reach session checks independently of PiNet", async (t) => {
  const { request, login } = await startEmailTestServer(t, false, { PI_TESTNET_SUBSCRIPTION_SERVICE_ID: "460" });
  const path = "/api/pi-testnet/subscription";
  const first = "https://demo-kzmid74mzykg7dfhbw4w.vusercontent.net";
  const second = "https://demo-kzmokzvi7qilj4jvt5pu.vusercontent.net";
  const current = "https://demo-kzmj9x7doc3tbnuv0jmh.vusercontent.net";
  const latest = "https://demo-kzmovxi2wuipz4n4bbzo.vusercontent.net";
  const appStudioPreview = "https://demo-kzmqjs94lpvvyhvefiaw.vusercontent.net";
  const registeredPreview = "https://demo-kzmn749ln5p2u45ulw12.vusercontent.net";
  const previews = [first, second, current, latest, appStudioPreview, registeredPreview];
  for (const origin of [...previews, ...previews]) {
    assert.deepEqual(await request(path, { origin }), {
      status: 401, body: { error: "Missing session token" },
    });
    assert.deepEqual(await request(path, { origin, token: "invalid-session" }), {
      status: 401, body: { error: "Invalid session token" },
    });
  }

  const loginResult = await login("subscription-no-uid");
  assert.equal(loginResult.status, 200);
  const token = loginResult.body.sessionToken;
  const ineligible = await request(path, { origin: registeredPreview, token });
  assert.equal(ineligible.status, 403);
  assert.equal(ineligible.body.code, "PI_TESTNET_SESSION_NOT_ELIGIBLE");
  for (const origin of [undefined, "https://demo-unrelated.vusercontent.net", appStudioPreview + ".example", registeredPreview + ".example"]) {
    const forbidden = await request(path, { origin, token });
    assert.equal(forbidden.status, 403);
    assert.equal(forbidden.body.code, "PI_TESTNET_ORIGIN_NOT_ALLOWED");
  }
});

test("subscription attempts release, expire, and serialize concurrent claims", async (t) => {
  const db = client.db("subscription_reservation_lifecycle");
  const collection = db.collection("pi_testnet_subscription_wallets_v1");
  const handlers = new Map();
  let sequence = "42";
  let transaction = null;
  t.mock.method(globalThis, "fetch", async (_url, { headers }) =>
    Response.json({ uid: headers.Authorization.slice("Bearer ".length) }));
  registerPiTestnetSubscriptions({
    app: { get() {}, post(path, _auth, handler) { handlers.set(path.split("/").at(-1), handler); } },
    db, authenticateSession() {}, sessionIsCurrent: () => true,
    provider: { isWallet: value => /^wallet-[abc]$/.test(value), service: async () => ({ active: true }),
      nextSequence: async () => sequence, subscription: async () => ({ status: "expired" }),
      transaction: async () => transaction },
  });
  async function call(action, uid, body) {
    const res = { code: 200, set() { return this; }, status(code) { this.code = code; return this; },
      sendStatus(code) { this.code = code; }, json(value) { this.body = value; } };
    await handlers.get(action)({ user: { verifiedPiUid: uid }, body }, res);
    return res;
  }
  const prepare = (uid, wallet = "wallet-a") => call("prepare", uid, { wallet, accessToken: uid, protocol: 2 });
  async function reserve(uid) {
    const result = await prepare(uid);
    assert.equal(result.code, 200);
    return result.body.id;
  }
  const hash = "a".repeat(64);
  assert.equal((await call("prepare", "a", { wallet: "wallet-a", accessToken: "a" })).code, 426);
  const expire = delay => collection.updateOne({ _id: "wallet-a" }, { $set: { "intent.expiresAt": Date.now() - delay } });
  const cancelled = await reserve("a");
  assert.equal((await call("release", "b", { id: cancelled })).code, 409);
  assert.equal((await call("release", "a", { id: cancelled })).code, 200);
  assert.equal((await call("confirm", "a", { id: cancelled, hash })).code, 409);
  const racing = await reserve("a");
  const race = await Promise.all([call("start", "a", { id: racing }), call("release", "a", { id: racing })]);
  assert.deepEqual(race.map(result => result.code).sort(), [200, 409]);
  if (race[0].code === 200) {
    assert.equal((await call("release", "a", { id: racing, walletRejected: true })).code, 200);
  }
  const abandoned = await reserve("a");
  await expire(1000);
  const replaced = await reserve("b");
  assert.equal((await call("confirm", "a", { id: abandoned, hash })).code, 409);
  assert.equal((await call("start", "b", { id: replaced })).code, 200);
  assert.equal((await call("release", "b", { id: replaced })).code, 409);
  sequence = "43";
  assert.equal((await call("release", "b", { id: replaced, walletRejected: true })).code, 409);
  sequence = "42";
  assert.equal((await call("release", "b", { id: replaced, walletRejected: true })).code, 200);
  assert.equal((await call("confirm", "b", { id: replaced, hash })).code, 409);

  const pending = await reserve("a");
  assert.equal((await call("start", "a", { id: pending })).code, 200);
  assert.equal((await call("confirm", "a", { id: pending, hash })).code, 202);
  assert.equal((await call("release", "a", { id: pending, walletRejected: true })).code, 409);
  await expire(1000);
  assert.equal((await prepare("b")).code, 409);
  await expire(25 * 60 * 60_000);
  const replacement = await reserve("b");
  assert.equal((await call("confirm", "a", { id: pending, hash })).code, 409);
  assert.equal((await call("confirm", "b", { id: replacement, hash })).code, 409);
  transaction = { hash, successful: false };
  assert.equal((await call("start", "b", { id: replacement })).code, 200);
  assert.equal((await call("confirm", "b", { id: replacement, hash })).code, 422);
  assert.equal(await collection.findOne({ _id: "wallet-a" }), null);

  const competing = await Promise.all([prepare("a"), prepare("b")]);
  assert.deepEqual(competing.map(result => result.code).sort(), [200, 409]);
  const singleAccount = await Promise.all([prepare("c", "wallet-b"), prepare("c", "wallet-c")]);
  assert.deepEqual(singleAccount.map(result => result.code).sort(), [200, 409]);
  assert.equal(await collection.countDocuments({ uid: "c" }), 1);

  const established = await collection.findOne({ _id: "wallet-a" });
  await collection.updateOne({ _id: established._id }, {
    $set: { verified: true, confirmedHash: hash, confirmedIntentId: "original" }, $unset: { intent: "" },
  });
  const renewal = await reserve(established.uid);
  assert.equal((await call("release", established.uid, { id: renewal })).code, 200);
  assert.equal((await call("confirm", established.uid, { id: renewal, hash })).code, 409);
  assert.equal((await collection.findOne({ _id: established._id })).verified, true);
  assert.equal((await prepare("other")).code, 409);
});

test("real HTTP email routes isolate generations, preserve recipient copies and reject inactive accounts", async (t) => {
  const db = client.db("oneconnect");
  const emails = db.collection("emails");
  const files = db.collection("email_attachments.files");
  const bindings = db.collection(identityBindingsCollection);
  const legacyToken = "a".repeat(48);
  const legacy = await emails.insertOne({
    type: "external", direction: "outgoing", senderUsername: "bob", ownerUsername: "bob",
    replyToken: legacyToken, subject: "Legacy", body: "Legacy", at: Date.now(),
  });

  const { request, login, upload, webhook } = await startEmailTestServer(t, true);
  async function session(username) {
    const result = await login(username);
    assert.equal(result.status, 200, JSON.stringify(result.body));
    return result.body.sessionToken;
  }
  const [alice, bob, eve] = await Promise.all(["alice", "bob", "eve"].map(session));
  const bobAccount = await bindings.findOne({ _id: "bob-uid" });
  const aliceAccount = await bindings.findOne({ _id: "alice-uid" });
  const mail = (sessionToken, id, recipient, attachmentId, type = "internal") => request(`/api/emails/${type}`, {
    method: "POST", token: sessionToken,
    body: { id, recipient, subject: "fixture", body: "message", ...(attachmentId ? { attachmentId } : {}) },
  });
  const inbox = (token) => request("/api/emails", { token });
  const download = (token, id) => request(`/api/emails/${id}/attachment`, { token });
  const markRead = (token, id) => request(`/api/emails/${id}/read`, { token, method: "PATCH" });
  const remove = (token, id) => request(`/api/emails/${id}`, { token, method: "DELETE" });
  assert.equal((await download(bob, legacy.insertedId)).body.code, "ACCOUNT_MIGRATION_REQUIRED");
  assert.equal((await markRead(bob, legacy.insertedId)).body.code, "ACCOUNT_MIGRATION_REQUIRED");
  assert.equal((await remove(bob, legacy.insertedId)).body.code, "ACCOUNT_MIGRATION_REQUIRED");
  assert.equal((await webhook(legacyToken, "legacy-blocked")).status, 406);

  const attachment = await upload(alice, "@bob");
  assert.equal(attachment.status, 201);
  const { attachmentId } = attachment.body;
  const file = await files.findOne({ _id: new ObjectId(attachmentId) });
  assert.equal(file.metadata.ownerAccountId, aliceAccount.accountId);
  assert.equal(file.metadata.recipientAccountId, bobAccount.accountId);
  assert.equal((await mail(eve, "stolen-attachment-id", "@bob", attachmentId)).status, 400);
  const sent = await mail(alice, "test-internal-send", "@bob", attachmentId);
  assert.equal(sent.status, 201, JSON.stringify(sent.body));
  const id = sent.body.email.id;
  assert.equal((await mail(alice, "test-internal-send", "@bob", attachmentId)).body.email.id, id);
  assert.equal((await emails.findOne({ _id: new ObjectId(id) })).recipientAccountId, bobAccount.accountId);
  const emptyInbox = await inbox(eve);
  assert.equal(emptyInbox.status, 200, JSON.stringify(emptyInbox.body));
  assert.deepEqual(emptyInbox.body.emails, []);
  assert.equal(emptyInbox.body.legacyHistory.code, "ACCOUNT_MIGRATION_REQUIRED");
  assert.equal((await markRead(eve, id)).status, 404);
  assert.equal((await remove(eve, id)).status, 404);
  assert.equal((await download(eve, id)).status, 404);
  assert.equal((await remove(alice, id)).status, 200);
  assert.equal((await download(alice, id)).status, 404);
  assert.equal((await markRead(bob, id)).status, 200);
  assert.deepEqual((await inbox(bob)).body.emails.map((email) => [email.id, email.read]), [[id, true]]);
  assert.deepEqual(await download(bob, id), { status: 200, body: "fixture attachment" });

  const externalFile = await upload(bob, "outside@fixture.test");
  assert.equal(externalFile.status, 201);
  const external = await mail(bob, "test-external-send", "outside@fixture.test", externalFile.body.attachmentId, "external");
  assert.equal(external.status, 201, JSON.stringify(external.body));
  const original = await emails.findOne({ _id: new ObjectId(external.body.email.id) });
  assert.equal(original.ownerAccountId, bobAccount.accountId);
  assert.equal((await webhook(original.replyToken, "active-reply", true)).status, 200);
  const incoming = await emails.findOne({ providerMessageId: "<active-reply@fixture.test>" });
  assert.equal(incoming.ownerAccountId, bobAccount.accountId);
  assert.deepEqual(await download(bob, incoming._id), { status: 200, body: "inbound attachment" });
  assert.equal((await download(eve, incoming._id)).status, 404);

  await bindings.updateOne({ _id: "bob-uid" }, { $set: { state: "deleting" } });
  assert.equal((await login("bob")).body.code, "ACCOUNT_DELETING");
  for (const result of await Promise.all([
    inbox(bob), download(bob, id), markRead(bob, id), remove(bob, id),
    upload(bob, "@alice"), mail(bob, "blocked-new-message", "@alice"),
    mail(bob, "blocked-external-id", "outside@fixture.test", null, "external"),
  ])) assert.equal(result.status, 403, JSON.stringify(result.body));
  assert.equal((await upload(alice, "@bob")).status, 404);
  assert.equal((await mail(alice, "inactive-recipient", "@bob")).status, 404);
  assert.equal((await webhook(original.replyToken, "deleted-reply")).status, 406);

  // Fixture only: simulate the completed release of the old generation.
  await bindings.deleteOne({ _id: "bob-uid", accountId: bobAccount.accountId, state: "deleting" });
  const returned = await session("bob");
  const newBob = await bindings.findOne({ _id: "bob-uid" });
  assert.notEqual(newBob.accountId, bobAccount.accountId);
  assert.deepEqual((await inbox(returned)).body.emails, []);
  assert.equal((await download(returned, id)).status, 404);
  assert.equal((await download(returned, incoming._id)).status, 404);
  assert.equal((await markRead(returned, id)).status, 404);
  assert.equal((await remove(returned, id)).status, 404);
  assert.equal((await download(returned, legacy.insertedId)).body.code, "ACCOUNT_MIGRATION_REQUIRED");
  assert.equal((await mail(alice, "stale-upload-recipient", "@bob", attachmentId)).status, 400);
  assert.equal((await webhook(original.replyToken, "return-reply", true)).status, 406);
  assert.equal((await webhook(legacyToken, "legacy-return-reply", true)).status, 406);
  assert.equal(await emails.countDocuments({ direction: "incoming" }), 1);
  assert.equal(await files.countDocuments(), 3);
  assert.equal((await upload(alice, "@bob")).status, 201);
});

test("real HTTP email routes preserve legacy behavior with the flag disabled", async (t) => {
  const emails = client.db("oneconnect").collection("emails");
  const legacyReplyToken = "b".repeat(48);
  const scopedReplyToken = "c".repeat(48);
  await emails.insertMany([
    {
      type: "external", direction: "outgoing", senderUsername: "bob", ownerUsername: "bob",
      replyToken: legacyReplyToken, subject: "Legacy fixture", body: "legacy", at: Date.now(),
    },
    {
      type: "external", direction: "outgoing", senderUsername: "bob", ownerUsername: "bob",
      accountScoped: true, ownerAccountId: "fixture-original-owner",
      replyToken: scopedReplyToken, subject: "fixture", body: "scoped", at: Date.now(),
    },
  ]);
  const { request, login, upload, webhook, origin } = await startEmailTestServer(t, false);
  const alice = (await login("alice")).body.sessionToken;
  const bob = (await login("bob")).body.sessionToken;
  assert.ok(alice && bob);
  const eve = (await login("eve")).body.sessionToken;
  const [sender, recipient, third] = await Promise.all([
    openMailSocket(t, origin, alice, "/"),
    openMailSocket(t, origin, bob, "/"),
    openMailSocket(t, origin, eve, "/"),
  ]);
  assert.equal((await rejectMailSocket(t, origin, bob, "/email")).message, "Invalid namespace");
  const sentEvent = expectSocketEvent(sender.socket, "email:new");
  const inboxEvent = expectSocketEvent(recipient.socket, "email:new");
  const attachment = await upload(alice, "@bob");
  assert.equal(attachment.status, 201);
  const sent = await request("/api/emails/internal", {
    method: "POST", token: alice,
    body: { id: "test-internal-send", recipient: "@bob", subject: "legacy", body: "message", attachmentId: attachment.body.attachmentId },
  });
  assert.equal(sent.status, 201, JSON.stringify(sent.body));
  const result = await request("/api/emails", { token: bob });
  assert.equal(result.status, 200);
  assert.equal(result.body.legacyHistory, undefined);
  assert.ok(result.body.emails.some((email) => email.id === sent.body.email.id));
  assert.ok(result.body.emails.every((email) => email.subject !== "fixture"));
  assert.deepEqual(await request(`/api/emails/${sent.body.email.id}/attachment`, { token: bob }),
    { status: 200, body: "fixture attachment" });
  assert.equal((await sentEvent).id, sent.body.email.id);
  assert.equal((await inboxEvent).id, sent.body.email.id);
  const replyEvent = expectSocketEvent(recipient.socket, "email:new");
  assert.equal((await webhook(legacyReplyToken, "legacy-delivered")).status, 200);
  assert.equal((await replyEvent).email.body, "legacy-delivered");
  assert.deepEqual(third.messages, []);
  assert.equal((await webhook(scopedReplyToken, "scoped-disabled")).status, 406);
});

function connectMailSocket(t, origin, sessionToken, namespace = "/email", auth = {}, frontendOrigin) {
  const socket = connectSocket(origin + namespace, {
    transports: ["websocket"],
    forceNew: true,
    reconnection: false,
    autoConnect: false,
    auth: { sessionToken, ...auth },
    ...(frontendOrigin && { extraHeaders: { Origin: frontendOrigin } }),
  });
  const messages = [];
  socket.onAny((event, payload) => {
    if (["email:new", "email:read", "email:deleted"].includes(event)) messages.push({ event, payload });
  });
  t.after(() => socket.disconnect());
  return { socket, messages };
}

function expectSocketEvent(socket, event) {
  return once(socket, event, { signal: AbortSignal.timeout(5000) }).then(([payload]) => payload);
}

async function openMailSocket(t, origin, sessionToken, namespace, auth, frontendOrigin) {
  const client = connectMailSocket(t, origin, sessionToken, namespace, auth, frontendOrigin);
  const connected = expectSocketEvent(client.socket, "connect");
  client.socket.connect();
  await connected;
  return client;
}

async function rejectMailSocket(t, origin, sessionToken, namespace) {
  const { socket } = connectMailSocket(t, origin, sessionToken, namespace);
  const rejected = expectSocketEvent(socket, "connect_error");
  socket.connect();
  const error = await rejected;
  assert.equal(socket.connected, false);
  return error;
}

test("actual Socket.IO clients receive scoped email events only for their active account", { timeout: 35000 }, async (t) => {
  const { request, login, webhook, origin, child } = await startEmailTestServer(t, true);
  const db = client.db("oneconnect");
  const bindings = db.collection(identityBindingsCollection);
  const send = (token, id, recipient, type = "internal") => request(`/api/emails/${type}`, {
    token, method: "POST", body: { id, recipient, subject: "socket fixture", body: "message" },
  });
  const [dan, fran, pat] = await Promise.all(["dan", "fran", "pat"].map(async (username) => {
    const result = await login(username);
    assert.equal(result.status, 200);
    return result.body.sessionToken;
  }));
  const oldFran = await bindings.findOne({ _id: "fran-uid" });
  const [sender, recipient, third] = await Promise.all([
    openMailSocket(t, origin, dan),
    openMailSocket(t, origin, fran),
    openMailSocket(t, origin, pat, "/email", { accountId: oldFran.accountId, username: "fran" }),
  ]);
  assert.equal((await rejectMailSocket(t, origin, fran, "/")).data.code, "ACCOUNT_MIGRATION_REQUIRED");
  const targetRoom = `email:account:${oldFran.accountId}`;
  third.socket.emit("join", targetRoom);
  third.socket.emit("user:join", targetRoom);
  third.socket.emit("conversation:join", "fran");

  const sentEvent = expectSocketEvent(sender.socket, "email:new");
  const inboxEvent = expectSocketEvent(recipient.socket, "email:new");
  const sent = await send(dan, "socket-initial-mail", "@fran");
  assert.equal(sent.status, 201);
  const id = sent.body.email.id;
  assert.deepEqual(await sentEvent, sent.body.email);
  const received = await inboxEvent;
  assert.equal(received.id, id);
  assert.equal(received.folder, "inbox");
  assert.equal((await request(`/api/emails/${id}/read`, { token: pat, method: "PATCH" })).status, 404);

  const readEvent = expectSocketEvent(recipient.socket, "email:read");
  assert.equal((await request(`/api/emails/${id}/read`, { token: fran, method: "PATCH" })).status, 200);
  assert.deepEqual(await readEvent, { id });
  const deletedEvent = expectSocketEvent(sender.socket, "email:deleted");
  assert.equal((await request(`/api/emails/${id}`, { token: dan, method: "DELETE" })).status, 200);
  assert.deepEqual(await deletedEvent, { id });
  assert.deepEqual(sender.messages.map(({ event }) => event), ["email:new", "email:deleted"]);
  assert.deepEqual(recipient.messages.map(({ event }) => event), ["email:new", "email:read"]);

  const externalEvent = expectSocketEvent(recipient.socket, "email:new");
  const external = await send(fran, "socket-external-mail", "outside@fixture.test", "external");
  assert.equal(external.status, 201);
  assert.deepEqual(await externalEvent, external.body.email);
  const original = await db.collection("emails").findOne({ _id: new ObjectId(external.body.email.id) });
  const incomingEvent = expectSocketEvent(recipient.socket, "email:new");
  assert.equal((await webhook(original.replyToken, "socket-reply")).status, 200);
  assert.equal((await incomingEvent).email.body, "socket-reply");

  async function holdDelivery(messageId) {
    const held = once(child, "message", { signal: AbortSignal.timeout(5000) });
    const response = send(dan, messageId, "@fran");
    const [notification] = await held;
    assert.deepEqual(notification, { held: messageId });
    return { response, resume: () => child.send({ resume: messageId }) };
  }

  const deletingDelivery = await holdDelivery("socket-held-deleting");
  const disconnected = expectSocketEvent(recipient.socket, "disconnect");
  const unavailable = expectSocketEvent(recipient.socket, "email:unavailable");
  const eventsBeforeDeletion = [...recipient.messages];
  await bindings.updateOne({ _id: "fran-uid" }, { $set: { state: "deleting" } });
  assert.equal((await rejectMailSocket(t, origin, fran, "/email")).data.code, "ACCOUNT_DELETING");
  deletingDelivery.resume();
  assert.equal((await deletingDelivery.response).status, 201);
  assert.equal(await disconnected, "io server disconnect");
  assert.equal((await unavailable).code, "ACCOUNT_DELETING");
  assert.deepEqual(recipient.messages, eventsBeforeDeletion);

  // Fixture only: arrange an old message in flight across release and return.
  await bindings.updateOne({ _id: "fran-uid" }, { $set: { state: "active" } });
  const oldConnection = await openMailSocket(t, origin, fran);
  const oldDelivery = await holdDelivery("socket-held-return");
  const oldDisconnected = expectSocketEvent(oldConnection.socket, "disconnect");
  await bindings.deleteOne({ _id: "fran-uid", accountId: oldFran.accountId });
  const returnedToken = (await login("fran")).body.sessionToken;
  assert.notEqual((await bindings.findOne({ _id: "fran-uid" })).accountId, oldFran.accountId);
  const returned = await openMailSocket(t, origin, returnedToken);
  oldDelivery.resume();
  assert.equal((await oldDelivery.response).status, 201);
  await oldDisconnected;
  assert.deepEqual(oldConnection.messages, []);
  assert.equal((await webhook(original.replyToken, "socket-old-reply")).status, 406);
  const returnedEvent = expectSocketEvent(returned.socket, "email:new");
  const newMessage = await send(dan, "socket-new-generation", "@fran");
  assert.equal(newMessage.status, 201);
  assert.equal((await returnedEvent).id, newMessage.body.email.id);
  assert.deepEqual(returned.messages.map(({ payload }) => payload.id), [newMessage.body.email.id]);

  // A real event addressed to Pat also drains any earlier misrouted packets.
  const thirdEvent = expectSocketEvent(third.socket, "email:new");
  const thirdMessage = await send(dan, "socket-third-control", "@pat");
  assert.equal(thirdMessage.status, 201);
  assert.equal((await thirdEvent).id, thirdMessage.body.email.id);
  assert.deepEqual(third.messages.map(({ payload }) => payload.id), [thirdMessage.body.email.id]);
  const signedOut = expectSocketEvent(returned.socket, "disconnect");
  assert.equal((await request("/api/auth/logout", { token: returnedToken, method: "POST" })).status, 200);
  await signedOut;
});

test("scoped private chat isolates history, read receipts, attachments and account generations", { timeout: 40000 }, async (t) => {
  const { request, login, origin, child } = await startEmailTestServer(t, true);
  const db = client.db("oneconnect");
  const messages = db.collection("messages");
  const bindings = db.collection(identityBindingsCollection);
  const legacy = await messages.insertOne({
    id: "legacy-private-message", senderUsername: "chat-a", recipientUsername: "chat-b",
    kind: "text", text: "legacy private body", status: "sent", at: Date.now(),
  });

  async function signIn(username) {
    const result = await login(username);
    assert.equal(result.status, 200);
    return result.body.sessionToken;
  }
  const [alice, bob, third] = await Promise.all(["chat-a", "chat-b", "chat-c"].map(signIn));
  const aliceBinding = await bindings.findOne({ _id: "chat-a-uid" });
  const oldBob = await bindings.findOne({ _id: "chat-b-uid" });
  const [a, b, c] = await Promise.all([
    openMailSocket(t, origin, alice, "/chat"),
    openMailSocket(t, origin, bob, "/chat"),
    openMailSocket(t, origin, third, "/chat", { accountId: oldBob.accountId, username: "chat-b" }),
  ]);
  c.socket.emit("join", `chat:account:${oldBob.accountId}`);
  const thirdEvents = [];
  c.socket.onAny((event, data) => thirdEvents.push({ event, data }));
  const recipientEvents = [];
  b.socket.on("message:new", (message) => recipientEvents.push(message.id));

  const history = (token, conversationId) => request(`/api/chat/conversations/${conversationId}`, { token });
  const list = (token) => request("/api/chat/conversations", { token });
  const begin = (token, username) => request("/api/chat/conversations", {
    token, method: "POST", body: { username },
  });
  const begun = await Promise.all([begin(alice, "chat-b"), begin(bob, "chat-a")]);
  assert.equal(begun[0].status, 200);
  assert.equal(begun[1].status, 200);
  const idBeforeReturn = begun[0].body.conversationId;
  assert.match(idBeforeReturn, /^[a-f0-9]{64}$/);
  assert.equal(begun[1].body.conversationId, idBeforeReturn);
  const thirdConversation = (await begin(third, "chat-b")).body.conversationId;
  const remove = (token, id) => request(`/api/chat/messages/chat-a/${id}`, { token, method: "DELETE" });
  const download = (token, id, type = "attachments") => request(`/api/chat/${type}/${id}`, { token });
  async function upload(token, conversationId, type = "attachments") {
    const body = new FormData();
    body.set("conversationId", conversationId);
    if (type === "attachments") {
      body.set("kind", "file");
      body.set("file", new Blob(["private chat asset"]), "fixture.txt");
    } else {
      body.set("file", new Blob([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])]), "fixture.png");
    }
    return request(`/api/chat/${type}`, { token, method: "POST", body });
  }
  function emitSend(socket, messageId, attributes = {}) {
    socket.emit("message:send", {
      conversationId: idBeforeReturn, kind: "text", text: "new private body", messageId,
      senderAccountId: oldBob.accountId, recipientAccountId: aliceBinding.accountId,
      ...attributes,
    });
  }
  for (const token of [alice, bob]) {
    const result = await history(token, idBeforeReturn);
    assert.equal(result.status, 200);
    assert.deepEqual(result.body.messages, []);
    assert.equal(result.body.legacyHistory.code, "ACCOUNT_MIGRATION_REQUIRED");
  }
  assert.equal((await history(third, idBeforeReturn)).status, 404);
  assert.equal((await history(alice, "chat-b")).status, 400);
  assert.deepEqual((await list(alice)).body.conversations, []);
  assert.equal((await list(alice)).body.legacyHistory.code, "ACCOUNT_MIGRATION_REQUIRED");
  assert.equal((await remove(alice, legacy.insertedId)).body.code, "ACCOUNT_MIGRATION_REQUIRED");
  const legacyAsset = await db.collection("chat_attachments.files").insertOne({
    metadata: { senderUsername: "chat-a", recipientUsername: "chat-b" },
  });
  assert.equal((await download(bob, legacyAsset.insertedId)).body.code, "ACCOUNT_MIGRATION_REQUIRED");
  const attachment = await upload(alice, idBeforeReturn);
  const image = await upload(alice, idBeforeReturn, "images");
  assert.equal(attachment.status, 201);
  assert.equal(image.status, 201);
  const attachmentId = attachment.body.attachmentId;
  const imageId = image.body.imageId;
  assert.equal((await download(alice, attachmentId)).status, 404);
  assert.equal((await download(bob, attachmentId)).status, 404);
  assert.equal((await download(bob, imageId, "images")).status, 404);
  const stolen = expectSocketEvent(c.socket, "message:error");
  emitSend(c.socket, "stolen-chat-asset", { conversationId: thirdConversation, kind: "file", attachmentId });
  assert.match((await stolen).error, /Attachment is unavailable/);

  const ack = expectSocketEvent(a.socket, "message:saved");
  const received = expectSocketEvent(b.socket, "message:new");
  emitSend(a.socket, "chat-file-original", { kind: "file", attachmentId });
  const message = await received;
  const id = message.id;
  assert.equal((await ack).messageId, id);
  assert.equal(message.senderUsername, "chat-a");
  assert.equal(message.recipientUsername, "chat-b");
  assert.equal(message.senderAccountId, undefined);
  const saved = await messages.findOne({ _id: new ObjectId(id) });
  assert.equal(saved.senderAccountId, aliceBinding.accountId);
  assert.equal(saved.recipientAccountId, oldBob.accountId);

  const imageReceived = expectSocketEvent(b.socket, "message:new");
  emitSend(a.socket, "chat-image-original", { kind: "image", imageId });
  assert.equal((await imageReceived).imageId, imageId);
  assert.equal((await download(bob, imageId, "images")).status, 200);
  assert.deepEqual(await download(bob, attachmentId), { status: 200, body: "private chat asset" });
  assert.equal((await download(third, attachmentId)).status, 404);
  assert.equal((await remove(third, id)).status, 404);

  c.socket.emit("message:receipt", { ids: [id], status: "read", senderUsername: "chat-a" });
  const thirdHistory = expectSocketEvent(c.socket, "conversation:error");
  c.socket.emit("conversation:join", idBeforeReturn);
  assert.equal((await thirdHistory).code, "CONVERSATION_NOT_FOUND");
  assert.equal((await messages.findOne({ _id: new ObjectId(id) })).status, "sent");
  const receipt = expectSocketEvent(a.socket, "message:status");
  b.socket.emit("message:receipt", { ids: [id], status: "read", senderUsername: "chat-c" });
  assert.equal((await receipt).id, id);
  assert.equal((await messages.findOne({ _id: new ObjectId(id) })).status, "read");

  const deleted = expectSocketEvent(b.socket, "message:deleted");
  assert.equal((await remove(bob, id)).status, 200);
  assert.equal((await deleted).id, id);
  assert.equal((await download(bob, attachmentId)).status, 404);
  assert.equal((await download(alice, attachmentId)).status, 200);
  assert.ok((await history(alice, idBeforeReturn)).body.messages.some((entry) => entry.id === id));
  assert.equal((await request("/api/auth/logout", { token: bob, method: "POST" })).status, 200);
  const bobAgain = await signIn("chat-b");
  const currentBob = await openMailSocket(t, origin, bobAgain, "/chat");
  const loaded = expectSocketEvent(currentBob.socket, "conversation:messages");
  currentBob.socket.emit("conversation:join", idBeforeReturn);
  const reloaded = await loaded;
  assert.ok(reloaded.messages.every((entry) => entry.id !== id));
  assert.ok(reloaded.deletedMessages.some((entry) => entry.id === id));
  assert.equal((await download(bobAgain, attachmentId)).status, 404);
  assert.equal(recipientEvents.length, 2);

  const fromBob = await upload(bobAgain, idBeforeReturn);
  assert.equal(fromBob.status, 201);
  const survivorReceipt = expectSocketEvent(a.socket, "message:new");
  currentBob.socket.emit("message:send", {
    conversationId: idBeforeReturn, kind: "file", text: "surviving recipient copy",
    messageId: "chat-retained-by-recipient", attachmentId: fromBob.body.attachmentId,
  });
  const retainedId = (await survivorReceipt).id;

  const deleting = expectSocketEvent(currentBob.socket, "chat:unavailable");
  const dropped = expectSocketEvent(currentBob.socket, "disconnect");
  await bindings.updateOne({ _id: "chat-b-uid" }, { $set: { state: "deleting" } });
  assert.equal((await rejectMailSocket(t, origin, bobAgain, "/chat")).data.code, "ACCOUNT_DELETING");
  assert.equal((await history(bobAgain, idBeforeReturn)).body.code, "ACCOUNT_DELETING");
  assert.equal((await download(bobAgain, imageId, "images")).status, 403);
  assert.equal((await upload(bobAgain, idBeforeReturn)).status, 403);
  currentBob.socket.emit("message:send", {
    conversationId: idBeforeReturn, kind: "text", text: "denied", messageId: "deleting-send-blocked",
  });
  assert.equal((await deleting).code, "ACCOUNT_DELETING");
  await dropped;
  assert.equal(await messages.countDocuments({ clientMessageId: "deleting-send-blocked" }), 0);

  await bindings.updateOne({ _id: "chat-b-uid" }, { $set: { state: "active" } });
  const inFlight = await openMailSocket(t, origin, bobAgain, "/chat");
  const inFlightEvents = [];
  inFlight.socket.on("message:new", (value) => inFlightEvents.push(value));
  const heldDeleting = once(child, "message", { signal: AbortSignal.timeout(5000) });
  const inFlightAck = expectSocketEvent(a.socket, "message:saved");
  emitSend(a.socket, "chat-held-deleting");
  const [deletingNotice] = await heldDeleting;
  assert.deepEqual(deletingNotice, { held: "chat-held-deleting" });
  const inFlightDropped = expectSocketEvent(inFlight.socket, "disconnect");
  const inFlightUnavailable = expectSocketEvent(inFlight.socket, "chat:unavailable");
  await bindings.updateOne({ _id: "chat-b-uid" }, { $set: { state: "deleting" } });
  child.send({ resume: "chat-held-deleting" });
  await inFlightAck;
  assert.equal((await inFlightUnavailable).code, "ACCOUNT_DELETING");
  await inFlightDropped;
  assert.deepEqual(inFlightEvents, []);
  await bindings.updateOne({ _id: "chat-b-uid" }, { $set: { state: "active" } });

  const oldSocket = await openMailSocket(t, origin, bobAgain, "/chat");
  const oldEvents = [];
  oldSocket.socket.on("message:new", (value) => oldEvents.push(value));
  const held = once(child, "message", { signal: AbortSignal.timeout(5000) });
  const oldAck = expectSocketEvent(a.socket, "message:saved");
  emitSend(a.socket, "chat-held-return");
  const [notice] = await held;
  assert.deepEqual(notice, { held: "chat-held-return" });
  const oldDropped = expectSocketEvent(oldSocket.socket, "disconnect");
  // Fixture only: release and reauthenticate the same verified Pi UID.
  await bindings.deleteOne({ _id: "chat-b-uid", accountId: oldBob.accountId });
  const returned = await signIn("chat-b");
  assert.notEqual((await bindings.findOne({ _id: "chat-b-uid" })).accountId, oldBob.accountId);
  const replacement = await openMailSocket(t, origin, returned, "/chat");
  const replacementEvents = [];
  replacement.socket.on("message:new", (value) => replacementEvents.push(value.id));
  child.send({ resume: "chat-held-return" });
  await oldAck;
  await oldDropped;
  assert.deepEqual(oldEvents, []);
  assert.equal((await history(returned, idBeforeReturn)).status, 404);
  const rejectedOld = expectSocketEvent(replacement.socket, "conversation:error");
  replacement.socket.emit("conversation:join", idBeforeReturn);
  assert.equal((await rejectedOld).code, "CONVERSATION_NOT_FOUND");
  assert.deepEqual((await list(returned)).body.conversations, []);
  assert.equal((await download(returned, fromBob.body.attachmentId)).status, 404);
  assert.equal((await download(third, fromBob.body.attachmentId)).status, 404);
  const retained = await history(alice, idBeforeReturn);
  assert.equal(retained.status, 200);
  assert.deepEqual(retained.body.peer, { state: "deleted", label: "حساب محذوف", username: null });
  assert.equal(retained.body.canSend, false);
  const retainedMessage = retained.body.messages.find((entry) => entry.id === retainedId);
  assert.equal(retainedMessage.senderUsername, null);
  assert.equal(retainedMessage.fromMe, false);
  assert.equal(retainedMessage.attachmentId, fromBob.body.attachmentId);
  assert.deepEqual(await download(alice, fromBob.body.attachmentId), { status: 200, body: "private chat asset" });
  const retainedSocket = expectSocketEvent(a.socket, "conversation:messages");
  a.socket.emit("conversation:join", idBeforeReturn);
  assert.ok((await retainedSocket).messages.some((entry) => entry.id === retainedId));
  const unavailable = expectSocketEvent(a.socket, "message:error");
  emitSend(a.socket, "chat-block-deleted-peer");
  assert.equal((await unavailable).code, "CHAT_PEER_UNAVAILABLE");
  assert.equal((await upload(alice, idBeforeReturn)).status, 404);
  assert.equal((await download(returned, attachmentId)).status, 404);
  assert.equal((await download(returned, imageId, "images")).status, 404);
  assert.equal((await remove(returned, id)).status, 404);
  const newStarted = expectSocketEvent(a.socket, "conversation:started");
  a.socket.emit("conversation:start", "chat-b");
  const newConversation = (await newStarted).conversationId;
  assert.notEqual(newConversation, idBeforeReturn);
  assert.equal((await begin(returned, "chat-a")).body.conversationId, newConversation);
  assert.deepEqual((await history(returned, newConversation)).body.messages, []);
  const newGenerationEvent = expectSocketEvent(replacement.socket, "message:new");
  emitSend(a.socket, "chat-new-generation", { conversationId: newConversation });
  const fresh = await newGenerationEvent;
  assert.equal(fresh.conversationId, newConversation);
  assert.deepEqual(replacementEvents, [fresh.id]);
  const listForSurvivor = (await list(alice)).body.conversations;
  assert.deepEqual(listForSurvivor.map((entry) => [entry.conversationId, entry.peer.state, entry.canSend]), [
    [newConversation, "active", true], [idBeforeReturn, "deleted", false],
  ]);
  assert.deepEqual((await list(returned)).body.conversations.map((entry) => entry.conversationId), [newConversation]);
  assert.deepEqual((await history(alice, newConversation)).body.messages.map((entry) => entry.id), [fresh.id]);
  assert.ok((await history(alice, idBeforeReturn)).body.messages.every((entry) => entry.id !== fresh.id));
  assert.deepEqual(thirdEvents.map(({ event }) => event), ["message:error", "conversation:error"]);

  // An earlier scoped record has the same virtual conversation without a backfill.
  const earlier = await messages.insertOne({
    accountScoped: true, senderAccountId: "earlier-account", recipientAccountId: aliceBinding.accountId,
    senderUsername: "earlier-name", recipientUsername: "chat-a", kind: "text",
    text: "earlier scoped data", status: "sent", at: 1,
  });
  const previous = (await list(alice)).body.conversations.find((entry) => entry.latestAt === 1);
  const earlierHistory = await history(alice, previous.conversationId);
  assert.equal(earlierHistory.body.messages[0].id, earlier.insertedId.toHexString());
  assert.equal(earlierHistory.body.peer.username, null);
  assert.equal((await history(returned, previous.conversationId)).status, 404);
  assert.equal(await db.collection("account_chat_conversations").countDocuments({ _id: previous.conversationId }), 0);
});

test("legacy private chat remains functional and cannot read scoped rows", { timeout: 25000 }, async (t) => {
  const { request, login, origin } = await startEmailTestServer(t, false);
  const db = client.db("oneconnect");
  await db.collection("messages").insertOne({
    accountScoped: true, clientMessageId: "legacy-isolation-fixture",
    senderUsername: "chat-a", recipientUsername: "chat-b", kind: "text",
    text: "hidden scoped chat", status: "sent", at: Date.now(),
  });
  const foreignFile = await db.collection("chat_attachments.files").insertOne({
    metadata: { accountScoped: true, senderUsername: "chat-a", recipientUsername: "chat-b" },
  });
  const alice = (await login("chat-a")).body.sessionToken;
  const bob = (await login("chat-b")).body.sessionToken;
  const [a, b] = await Promise.all([
    openMailSocket(t, origin, alice, "/"), openMailSocket(t, origin, bob, "/"),
  ]);
  assert.equal((await rejectMailSocket(t, origin, bob, "/chat")).message, "Invalid namespace");
  const saved = expectSocketEvent(a.socket, "message:saved");
  const received = expectSocketEvent(b.socket, "message:new");
  a.socket.emit("message:send", { conversationId: "chat-b", kind: "text", text: "legacy fixture", messageId: "legacy-socket-chat" });
  assert.equal((await saved).id, "legacy-socket-chat");
  assert.equal((await received).text, "legacy fixture");
  const loaded = expectSocketEvent(b.socket, "conversation:messages");
  b.socket.emit("conversation:join", "chat-a");
  const history = await loaded;
  assert.ok(history.messages.some((message) => message.id === "legacy-socket-chat"));
  assert.ok(history.messages.every((message) => message.accountScoped === undefined));
  assert.equal(history.legacyHistory, undefined);
  const download = await request(`/api/chat/attachments/${foreignFile.insertedId}`, { token: bob });
  assert.equal(download.status, 404);
  const uploadBody = new FormData();
  uploadBody.set("recipient", "chat-b");
  uploadBody.set("kind", "file");
  uploadBody.set("file", new Blob(["legacy asset"]), "legacy.txt");
  const uploaded = await request("/api/chat/attachments", { token: alice, method: "POST", body: uploadBody });
  assert.equal(uploaded.status, 201);
  assert.deepEqual(await request(`/api/chat/attachments/${uploaded.body.attachmentId}`, { token: bob }),
    { status: 200, body: "legacy asset" });
});

test("account groups bind membership, invitations, events and archived media to account generations", { timeout: 40000 }, async (t) => {
  const { request, login, origin, child } = await startEmailTestServer(t, true);
  const db = client.db("oneconnect");
  const groups = db.collection("account_chat_groups");
  const bindings = db.collection(identityBindingsCollection);
  const legacy = await db.collection("chat_groups").insertOne({ name: "Legacy", members: ["group-owner", "group-reader"] });
  async function signIn(name) {
    const result = await login(name);
    assert.equal(result.status, 200, JSON.stringify(result.body));
    assert.equal(result.body.groupSocketMode, "account");
    return (await openMailSocket(t, origin, result.body.sessionToken, "/groups")).socket;
  }
  const [owner, reader, removed, invitee, outsider] = await Promise.all(
    ["group-owner", "group-reader", "group-removed", "group-invite", "group-outsider"].map(signIn),
  );
  const token = (socket) => socket.auth.sessionToken;
  const api = (socket, path, method = "GET", body) => request("/api/groups" + path, { token: token(socket), method, body });
  const denied = [];
  outsider.onAny((event) => denied.push(event));
  assert.equal((await api(owner, `/${legacy.insertedId}/messages`)).body.code, "ACCOUNT_MIGRATION_REQUIRED");
  const readerInvite = expectSocketEvent(reader, "group:invited");
  const removedInvite = expectSocketEvent(removed, "group:invited");
  const pendingNotice = expectSocketEvent(invitee, "group:invited");
  const created = await api(owner, "", "POST", {
    name: "Scoped group", members: ["group-reader", "group-removed", "group-invite"],
    ownerAccountId: "forged",
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const groupId = created.body.group.id;
  const base = `/${groupId}`;
  for (const pending of [readerInvite, removedInvite, pendingNotice]) assert.equal((await pending).groupId, groupId);
  assert.equal(created.body.group.isOwner, true);
  assert.equal(created.body.group.members.length, 1);
  const originalOwner = await bindings.findOne({ _id: "group-owner-uid" });
  const originalInvitee = await bindings.findOne({ _id: "group-invite-uid" });
  const stored = await groups.findOne({ _id: new ObjectId(groupId) });
  assert.equal(stored.ownerAccountId, originalOwner.accountId);
  assert.ok(stored.invitedAccountIds.includes(originalInvitee.accountId));
  assert.equal((await api(reader, base + "/messages")).status, 404);
  assert.equal((await api(outsider, base + "/invitations/accept", "POST")).status, 404);
  assert.equal((await api(reader, base + "/invitations/accept", "POST")).status, 200);
  assert.equal((await api(removed, base + "/invitations/accept", "POST")).status, 200);
  assert.equal((await api(reader, base + "/invitations", "POST", { username: "group-outsider" })).status, 403);
  outsider.emit("join", `groups:account:${originalOwner.accountId}`);
  const refusedWatch = expectSocketEvent(outsider, "group:error");
  outsider.emit("group:watch", groupId);
  assert.equal((await refusedWatch).code, "GROUP_NOT_FOUND");
  const watched = expectSocketEvent(reader, "group:watching");
  reader.emit("group:watch", groupId);
  assert.equal((await watched).canWrite, true);

  function upload(socket) {
    const form = new FormData();
    form.set("kind", "file");
    form.set("file", new Blob(["archived group attachment"]), "group.txt");
    return api(socket, base + "/media", "POST", form);
  }
  const uploadResult = await upload(owner);
  assert.equal(uploadResult.status, 201, JSON.stringify(uploadResult.body));
  const mediaId = uploadResult.body.mediaId;
  assert.equal((await api(reader, base + "/media/" + mediaId)).status, 404);
  const send = (socket, id, extra = {}) => api(socket, base + "/messages", "POST", {
    id, kind: "text", text: "group fixture", ...extra,
  });
  assert.equal((await send(reader, "stolen-media", { kind: "file", mediaId })).status, 400);
  const content = expectSocketEvent(reader, "group:message");
  const attachmentMessage = await send(owner, "archived-attachment", { kind: "file", mediaId });
  assert.equal(attachmentMessage.status, 201, JSON.stringify(attachmentMessage.body));
  const messageId = attachmentMessage.body.message.id;
  assert.equal((await content).message.id, messageId);
  assert.equal((await send(outsider, "outsider-write")).status, 404);
  assert.equal((await api(outsider, base + "/media/" + mediaId)).status, 404);
  const reading = expectSocketEvent(owner, "group:read");
  assert.equal((await api(reader, base + "/read", "POST", { messageIds: [messageId] })).status, 200);
  assert.deepEqual((await reading).messageIds, [messageId]);

  const ownerList = await api(owner, "");
  const removedMember = ownerList.body.groups[0].members.find((member) => member.username === "group-removed");
  const removedEvents = [];
  removed.on("group:message", (payload) => removedEvents.push(payload.message.id));
  const held = once(child, "message", { signal: AbortSignal.timeout(5000) });
  const pendingSend = send(owner, "group-held-remove");
  const [notice] = await held;
  assert.deepEqual(notice, { held: "group-held-remove" });
  const revoked = expectSocketEvent(removed, "group:access-revoked");
  assert.equal((await api(owner, base + "/members/" + removedMember.id, "DELETE")).status, 200);
  assert.deepEqual(await revoked, { groupId });
  const readerEvent = expectSocketEvent(reader, "group:message");
  child.send({ resume: "group-held-remove" });
  assert.equal((await pendingSend).status, 201);
  await readerEvent;
  const removedWatch = expectSocketEvent(removed, "group:error");
  removed.emit("group:watch", groupId);
  assert.equal((await removedWatch).code, "GROUP_NOT_FOUND");
  assert.equal(removed.connected, true);
  assert.deepEqual(removedEvents, []);
  assert.equal((await api(removed, base + "/messages")).status, 404);
  assert.equal((await api(removed, base + "/media/" + mediaId)).status, 404);

  await bindings.updateOne({ _id: "group-reader-uid" }, { $set: { state: "deleting" } });
  assert.equal((await rejectMailSocket(t, origin, token(reader), "/groups")).data.code, "ACCOUNT_DELETING");
  assert.equal((await api(reader, base + "/messages")).body.code, "ACCOUNT_DELETING");
  assert.equal((await upload(reader)).status, 403);
  const stopped = expectSocketEvent(reader, "group:unavailable");
  const disconnected = expectSocketEvent(reader, "disconnect");
  const deletingEvents = [];
  reader.on("group:message", (event) => deletingEvents.push(event));
  assert.equal((await send(owner, "deleting-reader-excluded")).status, 201);
  assert.equal((await stopped).code, "ACCOUNT_DELETING");
  await disconnected;
  assert.deepEqual(deletingEvents, []);
  await bindings.updateOne({ _id: "group-reader-uid" }, { $set: { state: "active" } });
  const survivingReader = await signIn("group-reader");

  // Fixture only: simulate completion for the invitee and archived group's owner.
  await bindings.deleteOne({ _id: "group-invite-uid", accountId: originalInvitee.accountId });
  const returnedInvitee = await signIn("group-invite");
  assert.deepEqual((await api(returnedInvitee, "/invitations")).body.invitations, []);
  assert.equal((await api(returnedInvitee, base + "/invitations/accept", "POST")).status, 404);
  await groups.updateOne({ _id: new ObjectId(groupId) }, { $set: { state: "archived" } });
  await bindings.deleteOne({ _id: "group-owner-uid", accountId: originalOwner.accountId });
  const returnedOwner = await signIn("group-owner");
  assert.deepEqual((await api(returnedOwner, "")).body.groups, []);
  assert.equal((await api(returnedOwner, base + "/messages")).status, 404);
  assert.equal((await api(returnedOwner, base + "/invitations", "POST", { username: "group-outsider" })).status, 404);
  assert.equal((await api(returnedOwner, base + "/media/" + mediaId)).status, 404);
  const returnWatch = expectSocketEvent(returnedOwner, "group:error");
  returnedOwner.emit("group:watch", groupId);
  assert.equal((await returnWatch).code, "GROUP_NOT_FOUND");

  const archive = await api(survivingReader, base + "/messages");
  assert.equal(archive.status, 200);
  assert.equal(archive.body.group.state, "archived");
  assert.equal(archive.body.group.canWrite, false);
  assert.equal(archive.body.group.canManageMembers, false);
  assert.ok(archive.body.messages.some((message) => message.id === messageId));
  const archiveWatch = expectSocketEvent(survivingReader, "group:watching");
  survivingReader.emit("group:watch", groupId);
  assert.equal((await archiveWatch).canWrite, false);
  assert.deepEqual(await api(survivingReader, base + "/media/" + mediaId), { status: 200, body: "archived group attachment" });
  for (const result of await Promise.all([
    send(survivingReader, "archived-write"),
    upload(survivingReader),
    api(survivingReader, base + "/read", "POST", { messageIds: [messageId] }),
    api(survivingReader, base + "/invitations", "POST", { username: "group-outsider" }),
    api(survivingReader, base + "/members/" + removedMember.id, "DELETE"),
  ])) {
    assert.equal(result.status, 409);
    assert.equal(result.body.code, "GROUP_ARCHIVED");
  }
  assert.deepEqual(denied, ["group:error"]);
});

test("group send, read receipt and media upload cannot commit after removal or archival", { timeout: 35000 }, async (t) => {
  const { request, login, child } = await startEmailTestServer(t, true);
  const db = client.db("oneconnect");
  const owner = (await login("delete-peer")).body.sessionToken;
  const member = (await login("delete-http-peer")).body.sessionToken;
  const { accountId: memberId } = await db.collection(identityBindingsCollection).findOne({ _id: "delete-http-peer-uid" });
  const api = (token, path, method = "GET", body) => request("/api/groups" + path, { token, method, body });

  for (const action of ["send", "read", "upload"]) {
    const created = await api(owner, "", "POST", { name: "Write fence " + action, members: ["delete-http-peer"] });
    assert.equal(created.status, 201);
    const { id } = created.body.group;
    assert.equal((await api(member, "/" + id + "/invitations/accept", "POST")).status, 200);
    const view = (await api(owner, "/" + id + "/messages")).body;
    const target = view.group.members.find((entry) => entry.username === "delete-http-peer");
    assert.ok(target);

    const existing = await api(owner, "/" + id + "/messages", "POST", { id: "existing", kind: "text", text: "existing" });
    assert.equal(existing.status, 201);
    const files = db.collection("group_media.files");
    const messages = db.collection("account_group_messages");
    const upload = new FormData();
    upload.set("kind", "file");
    upload.set("file", new Blob(["blocked"]), "blocked.txt");

    const armed = once(child, "message", { signal: AbortSignal.timeout(8000) });
    child.send({ holdAccountFence: memberId });
    assert.deepEqual((await armed)[0], { armed: memberId });
    const held = once(child, "message", { signal: AbortSignal.timeout(8000) });
    const late = action === "send"
      ? api(member, "/" + id + "/messages", "POST", { id: "late", kind: "text", text: "must not persist" })
      : action === "read"
        ? api(member, "/" + id + "/read", "POST", { messageIds: [existing.body.message.id] })
        : api(member, "/" + id + "/media", "POST", upload);
    assert.deepEqual((await held)[0], { held: "deletion-write" });
    try {
      if (action === "read") {
        await db.collection("account_chat_groups").updateOne({ _id: new ObjectId(id) }, { $set: { state: "archived" } });
      } else {
        assert.equal((await api(owner, "/" + id + "/members/" + target.id, "DELETE")).status, 200);
      }
    } finally {
      child.send({ resume: "deletion-write" });
    }
    const rejected = await late;
    assert.equal(rejected.status, action === "read" ? 409 : 404);
    assert.equal(rejected.body.code, action === "read" ? "GROUP_ARCHIVED" : "GROUP_NOT_FOUND");
    assert.equal(await messages.countDocuments({ groupId: id, senderAccountId: memberId }), 0);
    assert.equal(await messages.countDocuments({ groupId: id, readByAccountIds: memberId }), 0);
    assert.equal(await files.countDocuments({ "metadata.groupId": id, "metadata.ownerAccountId": memberId }), 0);
  }

  const departing = (await login("group-audit-owner")).body.sessionToken;
  const invited = await api(departing, "", "POST", { name: "Pending owner deletion", members: ["delete-http-peer"] });
  assert.equal(invited.status, 201);
  await db.collection(identityBindingsCollection).updateOne({ _id: "group-audit-owner-uid" }, { $set: { state: "deleting" } });
  const pendingGroupId = invited.body.group.id;
  const denied = await api(member, "/" + pendingGroupId + "/invitations/accept", "POST");
  assert.equal(denied.status, 403);
  assert.equal(denied.body.code, "ACCOUNT_WRITE_BLOCKED");
  const pending = await db.collection("account_chat_groups").findOne({ _id: new ObjectId(pendingGroupId) });
  assert.ok(!pending.memberAccountIds.includes(memberId));
});

test("production group management retains legacy history, roles, and live access", { timeout: 60000 }, async (t) => {
  const { request, login, origin } = await startEmailTestServer(t, false, { NODE_ENV: "production" });
  const [owner, reader, third, invitee] = await Promise.all(["group-owner", "group-reader", "group-outsider", "group-audit-owner"].map(async (name) => {
    const result = await login(name);
    assert.equal(result.status, 200);
    assert.equal(result.body.groupSocketMode, undefined);
    return result.body.sessionToken;
  }));
  const { socket } = await openMailSocket(t, origin, reader, "/");
  const { socket: secondDevice } = await openMailSocket(t, origin, reader, "/");
  const { socket: inviteSocket } = await openMailSocket(t, origin, invitee, "/");
  assert.equal((await rejectMailSocket(t, origin, reader, "/groups")).message, "Invalid namespace");
  const event = expectSocketEvent(socket, "group:updated");
  const created = await request("/api/groups", { token: owner, method: "POST", body: {
    name: "Legacy group", members: ["group-reader", "group-outsider"],
  } });
  assert.equal(created.status, 201);
  const groupId = created.body.group.id;
  assert.equal((await event).id, groupId);
  assert.deepEqual(created.body.group.members, ["group-owner", "group-reader", "group-outsider"]);
  const preferenceUrl = `/api/groups/${groupId}/management`;
  const mutedA = expectSocketEvent(socket, "group:updated");
  const mutedB = expectSocketEvent(secondDevice, "group:updated");
  assert.equal((await request(preferenceUrl, { token: reader, method: "POST",
    body: { action: "notification-preference", muted: true } })).status, 200);
  assert.equal((await mutedA).muted, true);
  assert.equal((await mutedB).muted, true);
  assert.equal((await request(preferenceUrl, { token: owner })).body.group.muted, false);
  const mutedGroups = await request("/api/groups", { token: reader });
  assert.equal(mutedGroups.body.groups.find(group => group.id === groupId).muted, true);

  const callId = "legacy-group-call-test";
  const startedCall = expectSocketEvent(socket, "group-call:started");
  socket.emit("group-call:start", { groupId, callId, kind: "voice" });
  assert.equal((await startedCall).groupId, groupId);
  socket.emit("group-call:leave", { callId });

  const messageEvent = expectSocketEvent(socket, "group:message");
  const sent = await request(`/api/groups/${groupId}/messages`, {
    token: third, method: "POST", body: { id: "legacy-group-msg", kind: "text", text: "legacy group" },
  });
  assert.equal(sent.status, 201);
  assert.equal((await messageEvent).message.id, "legacy-group-msg");
  const listing = await request("/api/groups", { token: reader });
  assert.equal(listing.body.legacyHistory, undefined);
  assert.ok(listing.body.groups.every((group) => group.name !== "Scoped group"));

  const root = `/api/groups/${groupId}`;
  const voice = new FormData();
  voice.set("kind", "voice");
  voice.set("file", new Blob([Buffer.from("RIFF0000WAVE")], { type: "audio/wav" }), "legacy.wav");
  const uploaded = await request(root + "/media", { token: third, method: "POST", body: voice });
  assert.equal(uploaded.status, 201);
  assert.equal((await request(root + "/messages", { token: third, method: "POST",
    body: { id: "legacy-group-voice", kind: "voice", text: "", mediaId: uploaded.body.mediaId } })).status, 201);
  assert.equal((await fetch(origin + root + "/media/" + uploaded.body.mediaId, {
    headers: { Authorization: `Bearer ${owner}` },
  })).status, 200);
  const action = (token, action, body = {}) => request(root + "/management", {
    token, method: "POST", body: { ...body, action },
  });
  const details = token => request(root + "/management", { token });
  assert.equal((await details(invitee)).status, 404);
  assert.deepEqual((await details(reader)).body.group.members.map(member => member.role), ["owner", "member", "member"]);
  assert.equal((await action(reader, "details", { name: "Denied", description: "", revision: 1 })).status, 403);

  const updateA = expectSocketEvent(socket, "group:updated");
  const updateB = expectSocketEvent(secondDevice, "group:updated");
  assert.equal((await action(owner, "promote", { username: "group-reader" })).status, 200);
  assert.equal((await updateA).id, groupId);
  assert.equal((await updateB).id, groupId);
  assert.equal((await details(reader)).body.group.ownRole, "admin");
  const icon = new FormData();
  const image = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aM14AAAAASUVORK5CYII=", "base64");
  icon.set("kind", "image");
  icon.set("file", new Blob([image], { type: "image/png" }), "group.png");
  const invalidPhoto = (bytes, name) => {
    const form = new FormData();
    form.set("kind", "image");
    form.set("file", new Blob([bytes], { type: "image/png" }), name);
    return request(root + "/media", { token: reader, method: "POST", body: form });
  };
  assert.equal((await invalidPhoto(Buffer.from("not an image"), "forged.png")).status, 415);
  const oversize = Buffer.alloc(5 * 1024 * 1024 + 1);
  image.copy(oversize);
  assert.equal((await invalidPhoto(oversize, "too-large.png")).status, 413);
  const photo = await request(root + "/media", { token: reader, method: "POST", body: icon });
  assert.equal(photo.status, 201);
  const photoId = photo.body.mediaId;
  const displayPhoto = token => fetch(origin + root + "/media/" + photoId, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal((await displayPhoto(owner)).status, 404);
  assert.equal((await action(third, "photo", { photoId })).status, 403);
  assert.equal((await action(owner, "photo", { photoId })).status, 400);
  assert.equal((await action(reader, "photo", { photoId })).status, 200);
  assert.equal((await details(owner)).body.group.photoId, photoId);
  const download = await displayPhoto(owner);
  assert.equal(download.status, 200);
  assert.deepEqual(Buffer.from(await download.arrayBuffer()), image);
  assert.equal((await displayPhoto(invitee)).status, 404);
  assert.equal((await action(owner, "photo", { photoId: null })).status, 200);
  assert.equal((await displayPhoto(owner)).status, 404);

  const alreadyMember = await action(reader, "invite", { username: "group-outsider" });
  assert.equal(alreadyMember.status, 409);
  assert.equal(alreadyMember.body.code, "GROUP_ALREADY_MEMBER");
  assert.equal((await action(reader, "promote", { username: "group-outsider" })).status, 403);
  assert.equal((await action(reader, "remove", { username: "group-owner" })).status, 403);

  assert.equal((await action(reader, "posting-policy", { adminsOnly: true })).status, 403);
  const policyA = expectSocketEvent(socket, "group:updated");
  const policyB = expectSocketEvent(secondDevice, "group:updated");
  assert.equal((await action(owner, "posting-policy", { adminsOnly: true })).status, 200);
  assert.equal((await policyA).adminsOnly, true);
  assert.equal((await policyB).adminsOnly, true);
  const deniedPost = await request(root + "/messages", { token: third, method: "POST",
    body: { id: "blocked-by-posting-policy", kind: "text", text: "blocked" } });
  assert.equal(deniedPost.status, 403);
  assert.equal(deniedPost.body.code, "GROUP_ADMINS_ONLY");
  const deniedUpload = await request(root + "/media", { token: third, method: "POST", body: voice });
  assert.equal(deniedUpload.status, 403);
  const managerPost = await request(root + "/messages", { token: reader, method: "POST",
    body: { id: "manager-post", kind: "text", text: "allowed" } });
  assert.equal(managerPost.status, 201);
  assert.equal((await action(owner, "posting-policy", { adminsOnly: false })).status, 200);


  const revision = (await details(reader)).body.group.revision;
  const edits = await Promise.all(["Updated one", "Updated two"].map(name =>
    action(reader, "details", { name, description: "Group description", revision })));
  assert.deepEqual(edits.map(result => result.status).sort(), [200, 409]);
  assert.equal((await details(owner)).body.group.description, "Group description");

  const inviteAdded = expectSocketEvent(inviteSocket, "group:invited");
  assert.equal((await action(reader, "invite", { username: "group-audit-owner" })).status, 200);
  await inviteAdded;
  const alreadyInvited = await action(reader, "invite", { username: "group-audit-owner" });
  assert.equal(alreadyInvited.status, 409);
  assert.equal(alreadyInvited.body.code, "GROUP_ALREADY_INVITED");
  assert.equal((await request("/api/group-management/invitations", { token: invitee })).body.invitations[0].id, groupId);
  const inviteRemoved = expectSocketEvent(inviteSocket, "group:invited");
  assert.equal((await action(owner, "revoke-invite", { username: "group-audit-owner" })).status, 200);
  await inviteRemoved;
  assert.deepEqual((await request("/api/group-management/invitations", { token: invitee })).body.invitations, []);
  assert.equal((await action(invitee, "accept-invite")).status, 404);
  assert.equal((await action(reader, "invite", { username: "group-audit-owner" })).status, 200);
  assert.equal((await action(invitee, "accept-invite")).status, 200);
  assert.equal((await action(invitee, "leave")).status, 200);
  inviteSocket.disconnect();
  assert.equal((await action(reader, "invite", { username: "group-audit-owner" })).status, 200);
  const storedInvite = await client.db("oneconnect").collection("chat_groups").findOne({
    _id: new ObjectId(groupId), invitations: "group-audit-owner",
  }, { projection: { _id: 1 } });
  assert.ok(storedInvite);
  await openMailSocket(t, origin, invitee, "/");
  assert.equal((await request("/api/group-management/invitations", { token: invitee })).body.invitations[0].id, groupId);
  assert.equal((await action(invitee, "accept-invite")).status, 200);
  assert.equal((await action(owner, "demote", { username: "group-reader" })).status, 200);
  assert.equal((await action(reader, "remove", { username: "group-audit-owner" })).status, 403);
  assert.equal((await action(owner, "promote", { username: "group-reader" })).status, 200);
  assert.equal((await action(reader, "remove", { username: "group-audit-owner" })).status, 200);

  assert.equal((await action(owner, "leave")).status, 409);
  const offer = await action(owner, "offer", { username: "group-reader" });
  assert.equal(offer.status, 200);
  assert.equal((await action(third, "accept-ownership", { offerId: offer.body.group.offer.id })).status, 409);
  assert.equal((await action(reader, "accept-ownership", { offerId: offer.body.group.offer.id })).status, 200);
  assert.equal((await action(owner, "leave")).status, 200);
  assert.equal((await request(root + "/messages", { token: owner })).status, 404);
  assert.equal((await fetch(origin + root + "/media/" + uploaded.body.mediaId, {
    headers: { Authorization: `Bearer ${owner}` },
  })).status, 404);
  const history = await request(root + "/messages", { token: reader });
  assert.equal(history.body.group.id, groupId);
  assert.equal(history.body.messages[0].id, "legacy-group-msg");
  assert.equal(history.body.messages[1].mediaId, uploaded.body.mediaId);
  const activity = history.body.messages.filter(message => message.activity);
  assert.ok(activity.some(message => message.activity.action === "promote" && message.activity.target === "group-reader"));
  assert.ok(activity.some(message => message.activity.action === "accept-ownership" && message.senderUsername === "group-reader"));
  assert.ok(activity.some(message => message.activity.action === "leave" && message.senderUsername === "group-owner"));
  assert.equal(activity.filter(message => message.activity.action === "details").length, 1);



  const replyTo = { id: "legacy-group-msg", senderUsername: "group-outsider" };
  const reply = await request(root + "/messages", { token: reader, method: "POST",
    body: { id: "group-reply", kind: "text", text: "reply @group-reader @nonmember", replyTo } });
  assert.equal(reply.status, 201);
  assert.deepEqual(reply.body.message.replyTo, replyTo);
  assert.deepEqual(reply.body.message.mentions, ["group-reader"]);
  const badReply = await request(root + "/messages", { token: reader, method: "POST",
    body: { id: "bad-group-reply", kind: "text", text: "reply", replyTo: { ...replyTo, id: "not-in-group" } } });
  assert.equal(badReply.status, 404);
  assert.equal(badReply.body.code, "GROUP_REPLY_UNAVAILABLE");
  const interact = (token, action, reaction) => request(root + "/interactions", { token, method: "POST",
    body: { action, target: replyTo, reaction } });
  assert.equal((await interact(invitee, "react", "heart")).status, 404);
  assert.equal((await interact(third, "pin")).status, 403);
  const reactionRace = await Promise.all([interact(reader, "react", "like"), interact(third, "react", "heart")]);
  assert.deepEqual(reactionRace.map(result => result.status), [200, 200]);
  let refreshed = await request(root + "/messages", { token: reader });
  assert.deepEqual(refreshed.body.messages.find(message => message.id === replyTo.id).reactions,
    { like: ["group-reader"], heart: ["group-outsider"] });
  assert.equal((await interact(reader, "pin")).status, 200);
  refreshed = await request(root + "/messages", { token: third });
  assert.deepEqual(refreshed.body.group.pinned, replyTo);
  assert.equal((await interact(reader, "unpin")).status, 200);

  const literalText = "Literal .* https://example.test/shared";
  assert.equal((await request(root + "/messages", { token: reader, method: "POST",
    body: { id: "filtered-history", kind: "text", text: literalText } })).status, 201);
  const search = await request(root + "/messages?filter=search&q=" + encodeURIComponent(".*"), { token: reader });
  assert.deepEqual(search.body.messages.map(message => message.id), ["filtered-history"]);
  const media = await request(root + "/messages?filter=media", { token: reader });
  assert.deepEqual(media.body.messages.map(message => message.mediaId), [uploaded.body.mediaId]);
  const links = await request(root + "/messages?filter=links", { token: reader });
  assert.deepEqual(links.body.messages.map(message => message.text), [literalText]);
  assert.equal((await request(root + "/messages?filter=links", { token: owner })).status, 404);

  assert.equal((await request(root + "/messages", { token: invitee, method: "POST",
    body: { id: "rejected", kind: "text", text: "rejected" } })).status, 404);

  assert.equal((await action(third, "create-link")).status, 403);
  const generated = await action(reader, "create-link");
  assert.equal(generated.status, 200);
  const accessLink = new URL(generated.body.invitationUrl);
  assert.equal(accessLink.hostname, "apppiconnectuvr9006.pinet.com");
  const invitation = accessLink.searchParams.get("groupInvite");
  const join = token => request("/api/group-management/join-request", { token, method: "POST", body: { invitation } });
  assert.equal((await join()).status, 401);
  const beforeApproval = { status: 200, body: { pending: true } };
  assert.deepEqual(await join(invitee), beforeApproval);
  assert.deepEqual(await join(invitee), beforeApproval);
  assert.deepEqual((await details(reader)).body.group.joinRequests, ["group-audit-owner"]);
  assert.equal((await details(invitee)).status, 404);
  assert.equal((await request(root + "/messages?filter=search&q=legacy", { token: invitee })).status, 404);
  assert.equal((await fetch(origin + root + "/media/" + uploaded.body.mediaId, {
    headers: { Authorization: `Bearer ${invitee}` },
  })).status, 404);
  assert.equal((await action(third, "approve-join", { username: "group-audit-owner" })).status, 403);
  assert.equal((await action(reader, "approve-join", { username: "group-audit-owner" })).status, 200);
  assert.equal((await details(invitee)).status, 200);
  assert.equal((await action(reader, "revoke-link")).status, 200);
  assert.equal((await join(owner)).body.code, "GROUP_LINK_UNAVAILABLE");
  const another = await action(reader, "create-link");
  const expired = new URL(another.body.invitationUrl).searchParams.get("groupInvite");
  assert.equal((await join(owner)).body.code, "GROUP_LINK_UNAVAILABLE");
  const requestJoin = invitation => request("/api/group-management/join-request", {
    token: owner, method: "POST", body: { invitation },
  });
  assert.deepEqual(await requestJoin(expired), beforeApproval);
  await client.db("oneconnect").collection("chat_groups").updateOne({ _id: new ObjectId(groupId) },
    { $set: { "inviteLink.expiresAt": Date.now() - 1000 } });
  assert.equal((await requestJoin(expired)).body.code, "GROUP_LINK_UNAVAILABLE");
  assert.equal((await action(reader, "approve-join", { username: "group-owner" })).status, 404);
  const temporary = new URL((await action(reader, "create-link")).body.invitationUrl).searchParams.get("groupInvite");
  assert.deepEqual(await requestJoin(temporary), beforeApproval);
  assert.equal((await action(reader, "revoke-link")).status, 200);
  assert.equal((await requestJoin(temporary)).body.code, "GROUP_LINK_UNAVAILABLE");
  assert.equal((await action(reader, "approve-join", { username: "group-owner" })).status, 404);
  assert.equal((await details(owner)).status, 404);

  assert.equal((await action(third, "topic:create", { title: "Unauthorized" })).status, 403);
  const topicResult = await action(reader, "topic:create", { title: "Logistics" });
  assert.equal(topicResult.status, 200);
  const topicId = topicResult.body.group.planning.topics[0].id;
  const postTopic = (id, topicId) => request(root + "/messages", { token: third, method: "POST",
    body: { id, kind: "text", text: "topic message", topicId } });
  assert.equal((await postTopic("topic-message", topicId)).status, 201);
  const general = await request(root + "/messages", { token: third });
  assert.ok(!general.body.messages.some(message => message.id === "topic-message"));
  const topicHistory = await request(root + "/messages?topic=" + topicId, { token: third });
  assert.deepEqual(topicHistory.body.messages.map(message => message.id), ["topic-message"]);
  assert.equal((await request(root + "/messages?topic=" + topicId, { token: owner })).status, 404);
  assert.equal((await action(reader, "topic:close", { id: topicId })).status, 200);
  assert.equal((await postTopic("blocked-topic-message", topicId)).body.code, "GROUP_TOPIC_UNAVAILABLE");

  assert.equal((await action(reader, "poll:create", { title: "Duplicates", options: ["A", "A"] })).status, 400);
  const pollResult = await action(reader, "poll:create", { title: "When?", options: ["A", "B"] });
  assert.equal(pollResult.status, 200);
  const pollId = pollResult.body.group.planning.polls[0].id;
  assert.equal((await action(third, "poll:vote", { id: pollId, choice: 1 })).status, 200);
  assert.equal((await action(reader, "poll:vote", { id: pollId, choice: 0 })).status, 200);
  const poll = (await details(third)).body.group.planning.polls[0];
  assert.deepEqual(poll.totals, [1, 1]);
  assert.equal(poll.choice, 1);
  assert.equal((await action(third, "poll:close", { id: pollId })).status, 403);
  assert.equal((await action(reader, "poll:close", { id: pollId })).status, 200);
  assert.equal((await action(third, "poll:vote", { id: pollId, choice: 0 })).status, 409);

  const eventResult = await action(reader, "event:create", { title: "Meet", startsAt: Date.now() + 3600000 });
  assert.equal(eventResult.status, 200);
  const eventId = eventResult.body.group.planning.events[0].id;
  assert.equal((await action(third, "event:rsvp", { id: eventId, attending: true })).status, 200);
  assert.equal((await details(reader)).body.group.planning.events[0].attendees, 1);
  assert.equal((await details(third)).body.group.planning.events[0].attending, true);
  assert.equal((await action(reader, "event:close", { id: eventId })).status, 200);
  assert.equal((await action(third, "event:rsvp", { id: eventId, attending: false })).status, 409);

  assert.equal((await action(reader, "remove", { username: "group-audit-owner" })).status, 200);
  assert.equal((await details(invitee)).status, 404);
  for (const query of ["filter=search&q=legacy", "filter=media", "filter=files", "filter=links", "topic=" + topicId]) {
    assert.equal((await request(root + "/messages?" + query, { token: invitee })).status, 404);
  }
  assert.equal((await fetch(origin + root + "/media/" + uploaded.body.mediaId, {
    headers: { Authorization: `Bearer ${invitee}` },
  })).status, 404);
  assert.equal((await action(invitee, "poll:vote", { id: pollId, choice: 0 })).status, 404);
  assert.equal((await action(invitee, "event:rsvp", { id: eventId, attending: true })).status, 404);



});

test("group moderation protects reports and enforces posting under concurrency", { timeout: 60000 }, async t => {
  const { request, login, origin } = await startEmailTestServer(t, false, { NODE_ENV: "production" });
  const names = ["group-owner", "group-reader", "group-outsider", "group-audit-owner"];
  const [owner, admin, member, newcomer] = await Promise.all(names.map(async name => (await login(name)).body.sessionToken));
  const created = await request("/api/groups", { token: owner, method: "POST",
    body: { name: "Moderation fixture", members: names.slice(1) } });
  assert.equal(created.status, 201);
  const groupId = created.body.group.id;
  const root = "/api/groups/" + groupId;
  const action = (token, action, fields = {}) => request(root + "/management", {
    token, method: "POST", body: { action, ...fields },
  });
  const details = token => request(root + "/management", { token });
  const send = (token, id, text) => request(root + "/messages", {
    token, method: "POST", body: { id, kind: "text", text },
  });
  assert.equal((await action(owner, "promote", { username: names[1] })).status, 200);
  assert.equal((await action(member, "rules", { rules: "Forbidden" })).status, 403);
  assert.equal((await action(admin, "rules", { rules: "Keep discussion on topic" })).status, 200);
  assert.equal((await details(member)).body.group.moderation.rules, "Keep discussion on topic");
  assert.equal((await details(member)).body.group.moderation.audit, undefined);
  assert.equal((await details(member)).body.group.moderation.reports, undefined);

  assert.equal((await send(admin, "report-fixture", "Text visible only through the authorized message view")).status, 201);
  const message = { id: "report-fixture", senderUsername: names[1] };
  const report = () => action(member, "report", { message, reason: "spam" });
  assert.equal((await report()).status, 200);
  assert.equal((await report()).body.code, "GROUP_REPORT_EXISTS");
  assert.equal((await action(member, "report", { message: { ...message, id: "missing" }, reason: "spam" })).status, 404);
  const { reports, audit } = (await details(admin)).body.group.moderation;
  assert.equal(reports.length, 1);
  assert.equal(reports[0].message.text, undefined);
  assert.ok(audit.some(entry => entry.action === "rules"));
  assert.ok(audit.every(entry => !("rules" in entry)));
  const preview = token => request(root + "/reports/" + reports[0].id, { token });
  assert.equal((await preview(member)).status, 404);
  assert.equal((await preview(admin)).body.message.text, "Text visible only through the authorized message view");
  assert.equal((await action(member, "resolve-report", { id: reports[0].id })).status, 403);
  assert.equal((await action(admin, "resolve-report", { id: reports[0].id })).status, 200);
  assert.equal((await preview(admin)).status, 404);

  assert.equal((await action(admin, "restrict", { username: names[0], seconds: 300 })).status, 403);
  assert.equal((await action(admin, "restrict", { username: names[2], seconds: 300 })).status, 200);
  const restricted = await send(member, "blocked", "blocked");
  assert.equal(restricted.status, 403);
  assert.equal(restricted.body.code, "GROUP_POSTING_RESTRICTED");
  assert.ok((await details(member)).body.group.moderation.restrictedUntil > Date.now());
  assert.equal((await details(member)).body.group.moderation.restrictions, undefined);
  const voice = new FormData();
  voice.set("kind", "voice");
  voice.set("file", new Blob([Buffer.from("RIFF0000WAVE")], { type: "audio/wav" }), "restricted.wav");
  assert.equal((await request(root + "/media", { token: member, method: "POST", body: voice })).body.code, "GROUP_POSTING_RESTRICTED");
  await client.db("oneconnect").collection("chat_groups").updateOne({ _id: new ObjectId(groupId) },
    { $set: { "restrictions.0.until": Date.now() - 1000 } });
  assert.equal((await send(member, "after-expiry", "allowed")).status, 201);
  assert.equal((await action(admin, "restrict", { username: names[2], seconds: 300 })).status, 200);
  assert.equal((await action(admin, "unrestrict", { username: names[2] })).status, 200);

  assert.equal((await action(admin, "slow-mode", { seconds: 15 })).status, 200);
  const concurrent = await Promise.all([send(newcomer, "slow-a", "first"), send(newcomer, "slow-b", "second")]);
  assert.deepEqual(concurrent.map(response => response.status).sort(), [201, 429]);
  const rejected = concurrent.find(response => response.status === 429);
  assert.equal(rejected.body.code, "GROUP_SLOW_MODE");
  assert.ok(rejected.body.retryAfterSeconds > 0);
  assert.equal((await send(newcomer, concurrent.find(response => response.status === 201).body.message.id, "retry")).status, 200);

  const { socket } = await openMailSocket(t, origin, member, "/");
  assert.equal((await action(member, "notification-preference", { mentionAlerts: true })).status, 200);
  assert.equal((await details(newcomer)).body.group.mentionAlerts, false);
  const alerted = expectSocketEvent(socket, "group:mention");
  assert.equal((await send(admin, "mention-alert", "Hello @group-outsider")).status, 201);
  assert.deepEqual(await alerted, { groupId });
  assert.equal((await action(member, "notification-preference", { muted: true })).status, 200);
  let alerts = 0;
  socket.on("group:mention", () => alerts++);
  const mutedMessage = expectSocketEvent(socket, "group:message");
  assert.equal((await send(admin, "muted-alert", "Hello @group-outsider")).status, 201);
  assert.equal((await mutedMessage).message.id, "muted-alert");
  await wait(100);
  assert.equal(alerts, 0);
  const collection = client.db("oneconnect").collection("chat_groups");
  const key = { _id: new ObjectId(groupId) };
  const stored = await collection.findOne(key);
  assert.ok(stored.audit.every(entry => !("text" in entry)));
  const priorAudit = Array.from({ length: 100 }, (_, at) => ({ action: "rules", actor: names[0], at }));
  await collection.updateOne(key, { $set: { audit: priorAudit } });
  assert.equal((await action(admin, "slow-mode", { seconds: 0 })).status, 200);
  const retained = (await details(owner)).body.group.moderation.audit;
  assert.equal(retained.length, 100);
  assert.equal(retained[0].action, "slow-mode");
  assert.equal(retained.at(-1).at, 1);
});

test("legacy group deletion uses verified identity and resumes without losing history", async () => {
  const db = client.db("legacy_group_deletion");
  const owned = new ObjectId();
  const joined = new ObjectId();
  const invited = new ObjectId();
  const messageId = new ObjectId();
  const mediaId = new ObjectId();
  await db.collection(identityBindingsCollection).insertMany([
    { _id: "verified-uid", accountId: "matching-account", username: "leaving", state: "deleting" },
    { _id: "different-uid", accountId: "different-account", username: "leaving", state: "deleting" },
  ]);
  await db.collection("email_users").insertOne({ _id: "leaving", groupPiUid: "verified-uid" });
  await db.collection("chat_groups").insertMany([
    { _id: owned, ownerUsername: "leaving", members: ["leaving", "remaining"], invitations: ["pending"] },
    { _id: joined, ownerUsername: "remaining", members: ["leaving", "remaining"], admins: ["leaving"],
      ownershipOffer: { fromAccountId: "remaining", toAccountId: "leaving" } },
    { _id: invited, ownerUsername: "remaining", members: ["remaining"], invitations: ["leaving"] },
  ]);
  await db.collection("group_messages").insertOne({ _id: messageId, groupId: owned.toHexString(), mediaId: mediaId.toHexString() });
  await db.collection("group_media.files").insertOne({ _id: mediaId, metadata: { groupId: owned.toHexString() } });
  const cleanup = (accountId, phase = "remove-group-access") =>
    client.withSession(session => session.withTransaction(() => cleanDeletionPhase(db, accountId, phase, session)));

  assert.deepEqual(await cleanup("different-account"), []);
  assert.equal((await db.collection("chat_groups").findOne({ _id: owned })).state, undefined);
  await assert.rejects(cleanup("matching-account", "verify-data-cleanup"), /Legacy group access/);
  const notices = await cleanup("matching-account");
  assert.equal(notices.length, 3);
  assert.deepEqual(notices.find(notice => notice.id.equals(owned)).invitees, ["pending"]);
  assert.deepEqual(await cleanup("matching-account"), []);
  await cleanup("matching-account", "verify-data-cleanup");
  const archived = await db.collection("chat_groups").findOne({ _id: owned });
  assert.equal(archived.state, "archived");
  assert.deepEqual(archived.members, ["remaining"]);
  assert.deepEqual(archived.invitations, []);
  const member = await db.collection("chat_groups").findOne({ _id: joined });
  assert.deepEqual(member.members, ["remaining"]);
  assert.deepEqual(member.admins, []);
  assert.equal(member.ownershipOffer, undefined);
  assert.deepEqual((await db.collection("chat_groups").findOne({ _id: invited })).invitations, []);
  assert.equal((await db.collection("group_messages").findOne({ _id: messageId })).mediaId, mediaId.toHexString());
  assert.equal((await db.collection("group_media.files").findOne({ _id: mediaId })).metadata.groupId, owned.toHexString());
});

test("ownership offers transfer atomically and deletion cleanup preserves group history", { timeout: 60000 }, async (t) => {
  const { request, login, origin } = await startEmailTestServer(t, true);
  const db = client.db("oneconnect");
  const groups = db.collection("account_chat_groups");
  const bindings = db.collection(identityBindingsCollection);
  async function loginAs(name) {
    const result = await login(name);
    assert.equal(result.status, 200, JSON.stringify(result.body));
    return result.body.sessionToken;
  }
  const [owner, nextOwner, reader] = await Promise.all(["owner-transfer", "owner-successor", "owner-reader"].map(loginAs));
  const original = await bindings.findOne({ _id: "owner-transfer-uid" });
  const successor = await bindings.findOne({ _id: "owner-successor-uid" });
  const readerBinding = await bindings.findOne({ _id: "owner-reader-uid" });
  const api = (token, path, method = "GET", body) => request("/api/groups" + path, { token, method, body });
  const current = (token, groupId) => api(token, "/" + groupId + "/messages");
  async function groupWith(name, members) {
    const created = await api(owner, "", "POST", { name, members: members.map(([username]) => username) });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const groupId = created.body.group.id;
    for (const [, token] of members) {
      assert.equal((await api(token, "/" + groupId + "/invitations/accept", "POST")).status, 200);
    }
    return groupId;
  }
  async function offer(groupId, target) {
    const state = (await current(owner, groupId)).body.group;
    assert.equal(state.canOfferOwnership, true);
    const member = state.members.find((person) => person.username === target);
    const sent = await api(owner, "/" + groupId + "/ownership-offers", "POST", { memberId: member.id });
    assert.equal(sent.status, 201, JSON.stringify(sent.body));
    return sent.body.offerId;
  }
  const respond = (token, groupId, offerId, action = "accept") =>
    api(token, "/" + groupId + "/ownership-offers/" + offerId + "/" + action, "POST");
  const transferGroup = await groupWith("Group with successor", [["owner-successor", nextOwner], ["owner-reader", reader]]);
  const { socket } = await openMailSocket(t, origin, nextOwner, "/groups");
  const offeredEvent = expectSocketEvent(socket, "group:updated");
  const rejected = await offer(transferGroup, "owner-successor");
  assert.equal((await offeredEvent).ownershipOffer.id, rejected);
  assert.equal((await current(owner, transferGroup)).body.group.isOwner, true);
  assert.equal((await current(nextOwner, transferGroup)).body.group.isOwner, false);
  assert.equal((await current(nextOwner, transferGroup)).body.group.ownershipOffer.canRespond, true);
  assert.equal((await current(reader, transferGroup)).body.group.ownershipOffer, null);
  assert.equal((await respond(reader, transferGroup, rejected)).status, 409);
  assert.equal((await respond(nextOwner, transferGroup, rejected, "decline")).status, 200);
  assert.equal((await respond(nextOwner, transferGroup, rejected)).body.code, "GROUP_TRANSFER_STALE");
  assert.equal((await current(owner, transferGroup)).body.group.isOwner, true);

  const superseded = await offer(transferGroup, "owner-reader");
  const chosen = await offer(transferGroup, "owner-successor");
  assert.notEqual(chosen, superseded);
  assert.equal((await respond(reader, transferGroup, superseded)).body.code, "GROUP_TRANSFER_STALE");
  const concurrent = await Promise.all(Array.from({ length: 4 }, () => respond(nextOwner, transferGroup, chosen)));
  assert.deepEqual(concurrent.map((result) => result.status).sort(), [200, 409, 409, 409]);
  assert.equal((await respond(nextOwner, transferGroup, chosen)).body.code, "GROUP_TRANSFER_STALE");
  assert.equal((await current(owner, transferGroup)).body.group.canManageMembers, false);
  assert.equal((await current(nextOwner, transferGroup)).body.group.canManageMembers, true);
  assert.equal((await groups.findOne({ _id: new ObjectId(transferGroup) })).ownerAccountId, successor.accountId);

  const archiveGroup = await groupWith("Group to archive", [["owner-reader", reader]]);
  const removedOffer = await offer(archiveGroup, "owner-reader");
  const accountMember = (await current(owner, archiveGroup)).body.group.members.find((person) => person.username === "owner-reader");
  assert.equal((await api(owner, "/" + archiveGroup + "/members/" + accountMember.id, "DELETE")).status, 200);
  assert.equal((await groups.findOne({ _id: new ObjectId(archiveGroup) })).ownershipOffer, undefined);
  async function rejoin() {
    assert.equal((await api(owner, "/" + archiveGroup + "/invitations", "POST", { username: "owner-reader" })).status, 201);
    assert.equal((await api(reader, "/" + archiveGroup + "/invitations/accept", "POST")).status, 200);
  }
  await rejoin();
  assert.equal((await respond(reader, archiveGroup, removedOffer)).body.code, "GROUP_TRANSFER_STALE");
  const leaveOffer = await offer(archiveGroup, "owner-reader");
  assert.equal((await api(reader, "/" + archiveGroup + "/leave", "POST")).status, 200);
  await rejoin();
  assert.equal((await respond(reader, archiveGroup, leaveOffer)).body.code, "GROUP_TRANSFER_STALE");
  const deletingOffer = await offer(archiveGroup, "owner-reader");
  await bindings.updateOne({ accountId: readerBinding.accountId }, { $set: { state: "deleting" } });
  assert.equal((await current(owner, archiveGroup)).body.group.ownershipOffer, null);
  assert.equal((await respond(reader, archiveGroup, deletingOffer)).body.code, "ACCOUNT_DELETING");
  assert.equal((await groups.findOne({ _id: new ObjectId(archiveGroup) })).ownershipOffer, undefined);
  await bindings.updateOne({ accountId: readerBinding.accountId }, { $set: { state: "active" } });
  assert.equal((await respond(reader, archiveGroup, deletingOffer)).body.code, "GROUP_TRANSFER_STALE");

  const attachment = new FormData();
  attachment.set("kind", "file");
  attachment.set("file", new Blob(["kept reader media"]), "reader.txt");
  const media = await api(reader, "/" + archiveGroup + "/media", "POST", attachment);
  assert.equal(media.status, 201, JSON.stringify(media.body));
  const sent = await api(reader, "/" + archiveGroup + "/messages", "POST", {
    id: "reader-message-survives", text: "surviving member", kind: "file", mediaId: media.body.mediaId,
  });
  assert.equal(sent.status, 201);
  const neverAccepted = await offer(archiveGroup, "owner-reader");
  assert.deepEqual(await archiveOwnedGroupsForDeletion(db, original.accountId), { archived: 0, membershipsRemoved: 0 });
  await bindings.updateOne({ accountId: original.accountId }, { $set: { state: "deleting" } });
  assert.equal((await current(reader, archiveGroup)).body.group.ownershipOffer, null);
  assert.equal((await respond(reader, archiveGroup, neverAccepted)).body.code, "GROUP_TRANSFER_STALE");
  assert.deepEqual(await archiveOwnedGroupsForDeletion(db, original.accountId), { archived: 1, membershipsRemoved: 1 });
  assert.deepEqual(await archiveOwnedGroupsForDeletion(db, original.accountId), { archived: 0, membershipsRemoved: 0 });
  const archive = await current(reader, archiveGroup);
  assert.equal(archive.body.group.canWrite, false);
  assert.equal(archive.body.group.canOfferOwnership, false);
  assert.equal(archive.body.group.state, "archived");
  assert.ok(archive.body.group.members.every((person) => person.username !== "owner-transfer"));
  assert.equal(archive.body.messages[0].id, sent.body.message.id);
  assert.deepEqual(await api(reader, "/" + archiveGroup + "/media/" + media.body.mediaId), { status: 200, body: "kept reader media" });
  assert.equal((await api(reader, "/" + archiveGroup + "/messages", "POST", {
    id: "no-new-message", kind: "text", text: "archived",
  })).body.code, "GROUP_ARCHIVED");
  const transferred = await current(nextOwner, transferGroup);
  assert.equal(transferred.body.group.state, "active");
  assert.equal(transferred.body.group.isOwner, true);
  assert.ok(transferred.body.group.members.every((person) => person.username !== "owner-transfer"));
});

test("private HTTP data is owned by the verified account generation", { timeout: 45000 }, async (t) => {
  const { request, login } = await startEmailTestServer(t, true);
  const db = client.db("oneconnect");
  const bindings = db.collection(identityBindingsCollection);
  await db.collection("app_state").insertMany([
    { ownerUserId: "pi_priv-a", key: "connect.profile", blob: { displayName: "Legacy name" } },
    { ownerUserId: "pi_priv-a", key: "connect.invoice-drafts", blob: { secret: "legacy invoice" }, revision: 14 },
  ]);
  await db.collection("contacts").insertOne({ ownerUserId: "pi_priv-a", username: "priv-c", name: "Legacy contact" });
  async function signIn(username) {
    const result = await login(username);
    assert.equal(result.status, 200, JSON.stringify(result.body));
    assert.match(result.body.privateDataOwner, /^account-[0-9a-f]{64}$/);
    return result.body;
  }
  const [a, b, c] = await Promise.all(["priv-a", "priv-b", "priv-c"].map(signIn));
  const invoke = (session, path, method = "GET", body) =>
    request("/api" + path, { token: session.sessionToken, method, body });
  const statePath = (key) => "/state/" + key;
  const draftPath = statePath("connect.invoice-drafts");
  const avatar = "data:image/png;base64,iVBORw0KGgo=";
  const oldA = await bindings.findOne({ _id: "priv-a-uid" });
  assert.notEqual(a.privateDataOwner, oldA.accountId);
  assert.equal((await invoke(a, "/profile")).body.profile, null);
  for (const path of ["/profile", "/contacts", statePath("connect.profile"), draftPath]) {
    assert.equal((await invoke(a, path)).body.legacyHistory.code, "ACCOUNT_MIGRATION_REQUIRED");
  }
  assert.deepEqual((await invoke(a, "/contacts")).body.contacts, []);
  assert.equal((await invoke(a, draftPath)).body.revision, 0);
  assert.equal((await invoke(a, "/profile", "PUT", { ownerAccountId: "forged", avatar })).body.code, "CLIENT_OWNERSHIP_REJECTED");
  assert.equal((await invoke(b, "/profile/" + a.userId)).status, 403);
  assert.equal((await invoke(b, "/contacts/" + a.userId)).status, 403);
  assert.equal((await invoke(b, "/contacts", "POST", { username: "priv-c", contactAccountId: oldA.accountId })).status, 400);
  assert.equal((await invoke(b, "/profile?ownerUserId=" + a.userId)).status, 400);
  assert.equal((await invoke(a, "/profile", "PUT", { displayName: "Private Alice", avatar, language: "ar", username: "forged" })).status, 200);
  assert.equal((await invoke(a, statePath("connect.profile"))).body.blob.avatar, avatar);
  assert.equal((await invoke(a, statePath("connect.profile"))).body.blob.username, "priv-a");
  assert.equal((await invoke(a, statePath("connect.profile"), "PUT", { blob: { statusText: "Private status" } })).status, 204);
  assert.equal((await invoke(a, "/profile")).body.profile.statusText, "Private status");
  assert.equal((await invoke(b, "/profile")).body.profile, null);
  assert.equal((await invoke(a, "/profile", "PUT", { avatar: "data:image/svg+xml;base64,eA==" })).status, 400);

  assert.equal((await invoke(a, "/contacts", "POST", { username: "priv-c", name: "Alice's contact" })).status, 201);
  assert.equal((await invoke(b, "/contacts", "POST", { username: "priv-a", name: "Bob's contact" })).status, 201);
  const [aContact] = (await invoke(a, "/contacts")).body.contacts;
  const [bContact] = (await invoke(b, "/contacts")).body.contacts;
  assert.equal(aContact.username, "priv-c");
  assert.equal(bContact.username, "priv-a");
  assert.equal((await invoke(a, statePath("connect.contacts"))).body.blob.items[0].id, aContact.id);
  assert.equal((await invoke(a, statePath("connect.contacts"), "PUT", { blob: { items: [{ username: "priv-b" }] } })).body.code,
    "CONTACTS_REQUIRE_ACCOUNT_ROUTES");

  for (const key of ["connect.settings", "connect.chats", "connect.calls", "connect.emails", "connect.groups", "connect.requests", "phone-contacts"]) {
    assert.equal((await invoke(a, statePath(key), "PUT", { blob: { value: key } })).status, 204);
    assert.deepEqual((await invoke(a, statePath(key))).body.blob, { value: key });
    assert.equal((await invoke(b, statePath(key))).body.blob, null);
  }
  assert.equal((await invoke(b, statePath("connect.settings"), "PUT", { blob: { accountId: oldA.accountId } })).status, 400);
  const drafts = { schemaVersion: "1.0", items: [{
    schemaVersion: "1.0", id: "96cbdffb-eae2-40b4-b55c-9f622c381e73", status: "draft",
    createdByUserId: a.privateDataOwner, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    content: {
      documentType: "invoice", billingStage: "standard", language: "ar",
      asset: { kind: "fiat", code: "EUR", decimals: 2 }, lines: [], relatedDocumentIds: [],
    },
  }] };
  assert.equal((await invoke(b, draftPath, "PUT", { blob: drafts, expectedRevision: 0 })).status, 400);
  assert.deepEqual((await invoke(a, draftPath, "PUT", { blob: drafts, expectedRevision: 0 })).body, { revision: 1 });
  assert.equal((await invoke(a, draftPath, "PUT", { blob: drafts, expectedRevision: 0 })).status, 409);
  assert.equal((await invoke(b, draftPath)).body.revision, 0);

  assert.equal((await invoke(a, "/auth/logout", "POST")).status, 200);
  assert.equal((await invoke(a, "/profile")).status, 401);
  const loginAgain = await signIn("priv-a");
  assert.equal(loginAgain.privateDataOwner, a.privateDataOwner);
  assert.notEqual(loginAgain.sessionToken, a.sessionToken);
  assert.equal((await invoke(loginAgain, "/profile")).body.profile.avatar, avatar);
  assert.equal((await invoke(loginAgain, "/contacts")).body.contacts[0].id, aContact.id);
  assert.deepEqual((await invoke(loginAgain, draftPath)).body.blob, drafts);

  await bindings.updateOne({ _id: "priv-a-uid" }, { $set: { state: "deleting" } });
  for (const result of await Promise.all([
    invoke(loginAgain, "/profile"), invoke(loginAgain, "/profile", "PUT", { avatar: null }),
    invoke(loginAgain, "/contacts"), invoke(loginAgain, "/contacts", "POST", { username: "priv-c" }),
    invoke(loginAgain, draftPath), invoke(loginAgain, statePath("connect.settings"), "PUT", { blob: { value: "blocked" } }),
  ])) {
    assert.equal(result.status, 403);
    assert.equal(result.body.code, "ACCOUNT_DELETING");
  }
  // The old private documents deliberately remain in the isolated database.
  await bindings.deleteOne({ _id: "priv-a-uid", accountId: oldA.accountId, state: "deleting" });
  const returned = await signIn("priv-a");
  assert.notEqual(returned.privateDataOwner, a.privateDataOwner);
  assert.equal((await invoke(returned, "/profile")).body.profile, null);
  assert.deepEqual((await invoke(returned, "/contacts")).body.contacts, []);
  assert.equal((await invoke(returned, statePath("connect.settings"))).body.blob, null);
  assert.equal((await invoke(returned, draftPath)).body.revision, 0);
  assert.equal((await invoke(returned, draftPath, "PUT", { blob: drafts, expectedRevision: 0 })).status, 400);
  assert.equal((await db.collection("account_private_state").findOne({ ownerAccountId: oldA.accountId, key: "connect.profile" })).blob.avatar, avatar);
  const oldContact = (await invoke(b, "/contacts")).body.contacts[0];
  assert.deepEqual({ id: oldContact.id, name: oldContact.name, username: oldContact.username, state: oldContact.state },
    { id: bContact.id, name: "حساب محذوف", username: null, state: "deleted" });
  assert.equal((await invoke(b, "/contacts", "POST", { username: "priv-a" })).status, 201);
  const explicitContacts = (await invoke(b, "/contacts")).body.contacts;
  assert.equal(explicitContacts.length, 2);
  assert.ok(explicitContacts.some((contact) => contact.id === bContact.id && contact.state === "deleted"));
  assert.ok(explicitContacts.some((contact) => contact.id !== bContact.id && contact.username === "priv-a"));
  assert.equal((await invoke(c, draftPath)).body.revision, 0);
});

test("private state retains the legacy shape and scope when the flag is disabled", async (t) => {
  const { request, login } = await startEmailTestServer(t, false);
  const db = client.db("oneconnect");
  const ownerUserId = "pi_priv-legacy";
  await db.collection("app_state").insertMany([
    { ownerUserId, key: "connect.profile", blob: { displayName: "Legacy name" } },
    { ownerUserId, key: "connect.invoice-drafts", blob: { secret: "legacy invoice" }, revision: 14 },
  ]);
  await db.collection("contacts").insertOne({ ownerUserId, username: "priv-c", name: "Legacy contact" });
  const auth = (await login("priv-legacy")).body;
  assert.equal(auth.privateDataOwner, undefined);
  const token = auth.sessionToken;
  assert.deepEqual(await request("/api/state/connect.profile", { token }),
    { status: 200, body: { blob: { displayName: "Legacy name" } } });
  assert.deepEqual(await request("/api/state/connect.invoice-drafts", { token }),
    { status: 200, body: { blob: { secret: "legacy invoice" }, revision: 14 } });
  assert.equal((await request("/api/contacts/" + auth.userId, { token })).body[0].username, "priv-c");
  assert.equal((await request("/api/profile/" + auth.userId, { token })).status, 200);
});

test("scoped call signals and logs isolate accounts, revoked sessions and group membership", { timeout: 40000 }, async (t) => {
  const { request, login, origin } = await startEmailTestServer(t, true);
  const db = client.db("oneconnect");
  const bindings = db.collection(identityBindingsCollection);
  async function signIn(name) {
    const result = await login(name);
    assert.equal(result.status, 200, JSON.stringify(result.body));
    assert.equal(result.body.callSocketMode, "account");
    return result.body.sessionToken;
  }
  const [aToken, bToken, cToken] = await Promise.all(["call-a", "call-b", "call-c"].map(signIn));
  const [a, b, c] = (await Promise.all([aToken, bToken, cToken].map((token) => openMailSocket(t, origin, token, "/calls")))).map(({ socket }) => socket);
  const bBinding = await bindings.findOne({ _id: "call-b-uid" });
  const aBinding = await bindings.findOne({ _id: "call-a-uid" });
  const history = (token) => request("/api/calls/history", { token });
  async function invite(callId, recipient = b) {
    const started = expectSocketEvent(a, "call:initiated");
    const incoming = expectSocketEvent(recipient, "call:incoming");
    a.emit("call:initiate", { to: "call-b", kind: "voice", callId, accountId: bBinding.accountId });
    assert.equal((await started).callId, callId);
    assert.equal((await incoming).from, "call-a");
  }
  const first = "account-call-first";
  await invite(first);
  c.emit("join", "calls:account:" + bBinding.accountId);
  const rejected = expectSocketEvent(c, "call:error");
  c.emit("call:accept", { callId: first, accountId: bBinding.accountId, username: "call-b" });
  assert.equal((await rejected).reason, "unavailable");
  const accepted = expectSocketEvent(a, "call:accepted");
  b.emit("call:accept", { callId: first });
  await accepted;
  const offer = expectSocketEvent(b, "call:offer");
  a.emit("call:offer", { callId: first, offer: { type: "offer", sdp: "fixture" } });
  assert.equal((await offer).offer.sdp, "fixture");
  const answered = expectSocketEvent(a, "call:answered");
  b.emit("call:answer", { callId: first, answer: { type: "answer", sdp: "answer fixture" } });
  await answered;
  const connected = expectSocketEvent(b, "call:connected");
  a.emit("call:connected", { callId: first });
  b.emit("call:connected", { callId: first });
  await connected;
  const ended = expectSocketEvent(b, "call:ended");
  a.emit("call:end", { callId: first });
  await ended;
  assert.equal((await history(aToken)).body.calls[0].callId, first);
  assert.equal((await history(bToken)).body.calls[0].callId, first);
  assert.deepEqual((await history(cToken)).body.calls, []);
  assert.equal((await history(cToken)).body.legacyHistory.code, "ACCOUNT_MIGRATION_REQUIRED");

  const second = "account-deleting-call";
  await invite(second);
  await bindings.updateOne({ accountId: bBinding.accountId }, { $set: { state: "deleting" } });
  assert.equal((await history(bToken)).body.code, "ACCOUNT_DELETING");
  const blocked = expectSocketEvent(b, "call:error");
  const cutOff = expectSocketEvent(a, "call:ended");
  b.emit("call:accept", { callId: second });
  assert.equal((await blocked).reason, "account-unavailable");
  assert.equal((await cutOff).reason, "account-unavailable");
  await rejectMailSocket(t, origin, bToken, "/calls");
  await bindings.deleteOne({ _id: "call-b-uid", accountId: bBinding.accountId });
  const returnedToken = await signIn("call-b");
  const returned = (await openMailSocket(t, origin, returnedToken, "/calls")).socket;
  assert.deepEqual((await history(returnedToken)).body.calls, []);
  const oldCall = expectSocketEvent(returned, "call:error");
  returned.emit("call:accept", { callId: second });
  assert.equal((await oldCall).reason, "unavailable");
  const newId = "account-returning-call";
  await invite(newId, returned);
  const endedNew = expectSocketEvent(returned, "call:ended");
  a.emit("call:end", { callId: newId });
  await endedNew;
  assert.deepEqual((await history(returnedToken)).body.calls.map((record) => record.callId), [newId]);

  const newBinding = await bindings.findOne({ _id: "call-b-uid" });
  const scopedGroup = await db.collection("account_chat_groups").insertOne({
    name: "Call fixture", state: "active", memberAccountIds: [aBinding.accountId, newBinding.accountId],
  });
  const groupId = scopedGroup.insertedId.toHexString();
  const groupCallId = "scoped-group-call-1";
  const outsider = expectSocketEvent(c, "group-call:error");
  c.emit("group-call:start", { groupId, callId: groupCallId, kind: "voice" });
  assert.equal((await outsider).reason, "not-member");
  const notice = expectSocketEvent(returned, "group-call:incoming");
  a.emit("group-call:start", { groupId, callId: groupCallId, kind: "voice" });
  const host = (await notice).participants[0];
  const joined = expectSocketEvent(returned, "group-call:joined");
  returned.emit("group-call:join", { callId: groupCallId });
  assert.equal((await joined).participants.length, 2);
  const relayed = expectSocketEvent(a, "group-call:signal");
  returned.emit("group-call:signal", { callId: groupCallId, toPeerId: host.peerId, description: { type: "offer", sdp: "fixture group" } });
  assert.equal((await relayed).description.sdp, "fixture group");
  assert.deepEqual((await history(cToken)).body.calls, []);
});

test("PSTN mock callbacks and service quotas stay tied to the original account and verified UID", { timeout: 40000 }, async (t) => {
  const db = client.db("oneconnect");
  const bindings = db.collection(identityBindingsCollection);
  const before = "10000000-0000-4000-8000-000000000001";
  const returnedId = "10000000-0000-4000-8000-000000000002";
  const other = "10000000-0000-4000-8000-000000000003";
  const secret = "isolated-pstn-abuse-secret-0123456789";
  await bindings.insertMany([
    { _id: "phone-a-uid", accountId: before, state: "active" },
    { _id: "phone-b-uid", accountId: other, state: "active" },
  ]);
  const today = Date.parse("2026-11-21T23:59:00Z");
  const midnight = Date.parse("2026-11-22T00:00:00Z");
  const { request, login, origin, child } = await startEmailTestServer(t, true, {
    PSTN_FIXTURE_TIME: String(today), PSTN_DAILY_ATTEMPT_LIMIT: "3", PSTN_ENABLED: "true", PSTN_ALLOWED_ACCOUNT_IDS: [before, returnedId, other].join(","),
    PSTN_ABUSE_KEY_SECRET: secret, TWILIO_ACCOUNT_SID: "AC" + "1".repeat(32),
    TWILIO_API_KEY_SID: "SK" + "2".repeat(32), TWILIO_API_KEY_SECRET: "fixture-only",
    TWILIO_AUTH_TOKEN: "fixture-auth", TWILIO_TWIML_APP_SID: "AP" + "3".repeat(32),
    TWILIO_CALLER_ID: "+12025550111",
  });
  const [a, b] = (await Promise.all([login("phone-a"), login("phone-b")])).map((result) => result.body.sessionToken);
  const prepare = (token, requestId, extra = {}) => request("/api/calls/pstn/prepare", {
    token, method: "POST", body: { requestId, phone: "+33123456789", ...extra },
  });
  const history = (token) => request("/api/calls/pstn/history", { token });
  async function callback(kind, fields, forged = false) {
    const path = "/api/calls/pstn/" + kind;
    const parameters = { AccountSid: "AC" + "1".repeat(32), ...fields };
    const signature = createHmac("sha256", "fixture-auth").update(
      JSON.stringify(["https://one-connect.onrender.com" + path, Object.entries(parameters).sort()]),
    ).digest("hex");
    const result = await fetch(origin + path, {
      method: "POST", headers: { "x-twilio-signature": forged ? "bad" : signature },
      body: new URLSearchParams(parameters),
    });
    return { status: result.status, body: await result.text() };
  }
  const usage = db.collection("pstn_usage");
  const key = "pi:2026-11-21:" + pstnAbuseKey(secret, "phone-a-uid");
  const denied = await prepare(a, "forged-preparation", { ownerAccountId: other });
  assert.equal(denied.status, 400);
  const first = await prepare(a, "isolated-phone-first");
  assert.equal(first.status, 201, JSON.stringify(first.body));
  assert.equal(first.body.token, "mock-token:" + first.body.attemptId);
  const second = await prepare(a, "isolated-phone-second");
  assert.equal(second.status, 201);
  assert.deepEqual((await history(b)).body.calls, []);
  assert.equal(first.body.quotaResetsAt, midnight);
  const voiceFor = (prepared, sid) => ({
    From: "client:" + prepared.body.attemptId, CallSid: "CA" + sid.repeat(32),
  });
  const voices = [voiceFor(first, "4"), voiceFor(second, "5")];
  assert.equal((await callback("voice", voices[0], true)).status, 403);
  assert.equal(await usage.findOne({ _id: key }), null);
  const replies = await Promise.all(voices.map((voice) => callback("voice", voice)));
  assert.deepEqual(replies.map((result) => result.status).sort(), [200, 403]);
  const winner = replies.findIndex((result) => result.status === 200);
  assert.match(replies[winner].body, /timeLimit="120"/);
  assert.match(replies[winner].body, /\+33123456789/);
  assert.equal((await callback("voice", voices[winner])).status, 403);
  assert.equal((await callback("voice", { ...voices[winner], CallSid: "CA" + "e".repeat(32) })).status, 403);

  assert.equal((await usage.findOne({ _id: key })).count, 1);
  const blocked = await prepare(a, "isolated-phone-blocked");
  assert.equal(blocked.status, 429);
  assert.equal(blocked.body.quotaResetsAt, midnight);

  const childSid = (id) => "CA" + id.repeat(32);
  const dialResult = (voice, id, status, bridged = false) => ({
    CallSid: voice.CallSid, DialCallSid: childSid(id), DialCallStatus: status, DialBridged: String(bridged),
  });
  const childEvent = (voice, id, status) => callback("progress", {
    ParentCallSid: voice.CallSid, CallSid: childSid(id), CallStatus: status,
    CallbackSource: "call-progress-events",
  });
  async function mockCall(voice, id, status, overrides = {}) {
    const response = once(child, "message");
    child.send({ pstnCall: {
      sid: childSid(id), accountSid: "AC" + "1".repeat(32), parentCallSid: voice.CallSid,
      direction: "outbound-dial", to: "+33123456789", status, duration: null, ...overrides,
    } });
    assert.deepEqual((await response)[0], { pstnCall: childSid(id) });
  }
  const noAnswer = dialResult(voices[winner], "a", "no-answer");
  assert.equal((await callback("status", noAnswer, true)).status, 403);
  assert.equal((await usage.findOne({ _id: key })).count, 1);
  assert.equal((await callback("status", noAnswer)).status, 503);
  assert.equal((await childEvent(voices[winner], "a", "no-answer")).status, 204);
  await mockCall(voices[winner], "a", "no-answer", { parentCallSid: voices[1 - winner].CallSid });
  assert.equal((await callback("status", noAnswer)).status, 200);
  assert.equal((await usage.findOne({ _id: key })).count, 1);
  assert.equal((await callback("voice", voices[1 - winner])).status, 403);
  await mockCall(voices[winner], "a", "no-answer");
  assert.equal((await usage.findOne({ _id: key })).count, 1);
  assert.equal((await callback("status", noAnswer)).status, 200);
  assert.equal((await usage.findOne({ _id: key })).count, 0);
  assert.equal((await callback("voice", voices[1 - winner])).status, 200);
  assert.equal((await callback("status", noAnswer)).status, 200);
  assert.equal((await usage.findOne({ _id: key })).count, 1);

  const busy = dialResult(voices[1 - winner], "b", "busy");
  await mockCall(voices[1 - winner], "b", "ringing");
  assert.equal((await callback("status", busy)).status, 200);
  assert.equal((await usage.findOne({ _id: key })).count, 1);

  assert.equal((await childEvent(voices[1 - winner], "b", "busy")).status, 204);
  assert.equal((await usage.findOne({ _id: key })).count, 1);
  await mockCall(voices[1 - winner], "b", "busy");
  assert.equal((await callback("status", busy)).status, 200);
  assert.equal((await usage.findOne({ _id: key })).count, 0);
  const third = await prepare(a, "isolated-phone-third");
  assert.equal(third.status, 201);
  const activeVoice = voiceFor(third, "6");
  assert.equal((await callback("voice", activeVoice)).status, 200);
  const completed = dialResult(activeVoice, "c", "completed", true);
  const contradictory = dialResult(activeVoice, "c", "failed", true);
  assert.equal((await childEvent(activeVoice, "c", "completed")).status, 204);
  assert.equal((await childEvent(activeVoice, "c", "in-progress")).status, 204);
  assert.equal((await childEvent(activeVoice, "c", "failed")).status, 204);
  assert.equal((await usage.findOne({ _id: key })).count, 1);
  assert.equal((await usage.findOne({ _id: "attempt:" + key })).count, 3);

  await bindings.updateOne({ accountId: before }, { $set: { state: "deleting" } });
  assert.equal((await prepare(a, "deleting-phone-call")).status, 403);
  assert.equal((await history(a)).body.code, "ACCOUNT_DELETING");
  assert.equal((await callback("voice", activeVoice)).status, 403);
  const terminated = [];
  await terminateAccountPstn(db, before, async (sid) => { terminated.push(sid); });
  await terminateAccountPstn(db, before, async (sid) => { terminated.push(sid); });
  assert.deepEqual(terminated, [activeVoice.CallSid]);

  await bindings.deleteOne({ _id: "phone-a-uid", accountId: before });
  await bindings.insertOne({ _id: "phone-a-uid", accountId: returnedId, state: "active" });
  const returned = (await login("phone-a")).body.sessionToken;
  assert.equal((await callback("status", contradictory)).status, 200);
  for (let i = 0; i < 2; i++) assert.equal((await callback("status", completed)).status, 200);
  assert.equal((await callback("status", dialResult(activeVoice, "c", "no-answer"))).status, 200);
  assert.equal((await usage.findOne({ _id: key })).count, 1);
  const original = await db.collection("account_pstn_attempts").findOne({ _id: third.body.attemptId });
  assert.equal(original.state, "terminated");
  assert.equal(original.ownerAccountId, before);
  assert.deepEqual((await history(returned)).body.calls, []);
  assert.equal((await prepare(returned, "isolated-phone-returned")).status, 429);
  const ambiguous = voiceFor(await prepare(b, "isolated-phone-other"), "d");
  const bRetry = voiceFor(await prepare(b, "isolated-phone-other-retry"), "e");
  const duplicates = await Promise.all([callback("voice", ambiguous), callback("voice", ambiguous)]);
  assert.deepEqual(duplicates.map(({ status }) => status).sort(), [200, 403]);
  await mockCall(ambiguous, "f", "ringing");
  const ambiguousResult = dialResult(ambiguous, "f", "no-answer");
  assert.equal((await callback("status", ambiguousResult)).status, 200);
  assert.equal((await childEvent(ambiguous, "f", "no-answer")).status, 204);
  assert.equal((await callback("status", ambiguousResult)).status, 200);
  assert.equal((await callback("voice", bRetry)).status, 403);
  assert.equal((await childEvent(ambiguous, "f", "in-progress")).status, 204);
  assert.equal((await callback("voice", bRetry)).status, 403);

  const advanced = once(child, "message");
  child.send({ pstnTime: midnight });
  assert.deepEqual((await advanced)[0], { pstnTime: midnight });
  assert.equal((await callback("voice", bRetry)).status, 403);
  assert.equal((await callback("voice", activeVoice)).status, 403);
  const nextDay = await prepare(returned, "isolated-phone-next-day");
  assert.equal(nextDay.status, 201);
  assert.equal(nextDay.body.quotaResetsAt, midnight + 86_400_000);
  assert.equal((await callback("voice", voiceFor(nextDay, "7"))).status, 200);
  const nextKey = key.replace("11-21", "11-22");
  assert.equal((await usage.findOne({ _id: nextKey })).count, 1);
  const nextReservation = await usage.findOne({ _id: nextKey });
  const nextAttempts = await usage.findOne({ _id: "attempt:" + nextKey });
  assert.equal((await childEvent(voices[winner], "a", "in-progress")).status, 204);
  assert.equal((await callback("status", noAnswer)).status, 200);
  assert.deepEqual(await usage.findOne({ _id: nextKey }), nextReservation);
  assert.deepEqual(await usage.findOne({ _id: "attempt:" + nextKey }), nextAttempts);

  for (const [i, voice] of [voiceFor(nextDay, "7"), null, null].entries()) {
    const nextVoice = voice ?? voiceFor(await prepare(returned, "isolated-phone-retry-" + i), String(7 + i));
    if (i) assert.equal((await callback("voice", nextVoice)).status, 200);
    const id = String(i + 1);
    await mockCall(nextVoice, id, "failed");
    assert.equal((await callback("status", dialResult(nextVoice, id, "failed"))).status, 200);
    assert.equal((await childEvent(nextVoice, id, "failed")).status, 204);
  }
  assert.equal((await usage.findOne({ _id: nextKey })).count, 0);
  await bindings.updateOne({ accountId: returnedId }, { $set: { state: "deleting" } });
  await bindings.deleteOne({ accountId: returnedId });
  await bindings.insertOne({ _id: "phone-a-uid", accountId: before, state: "active" });
  const newSession = (await login("phone-a")).body.sessionToken;
  const attemptBlocked = await prepare(newSession, "isolated-phone-max-retries");
  assert.equal(attemptBlocked.status, 429);
  assert.equal(attemptBlocked.body.code, "PSTN_DAILY_ATTEMPT_LIMIT");
  assert.equal((await usage.findOne({ _id: "attempt:" + nextKey })).count, 3);

  // An older positive event overrides a released reservation without changing the attempt counter.
  assert.equal((await childEvent(voiceFor(nextDay, "7"), "1", "in-progress")).status, 204);
  assert.equal((await callback("status", dialResult(voiceFor(nextDay, "7"), "1", "failed"))).status, 200);
  assert.equal((await usage.findOne({ _id: nextKey })).count, 1);
});

test("the ordinary server supports verified calls and preserves mock PSTN preparation", { timeout: 30000 }, async (t) => {
  const { request, login, origin } = await startEmailTestServer(t, false, {
    PSTN_ENABLED: "true", PSTN_ALLOWED_USERS: "phone-b", TWILIO_ACCOUNT_SID: "AC" + "1".repeat(32),
    TWILIO_API_KEY_SID: "SK" + "2".repeat(32), TWILIO_API_KEY_SECRET: "fixture-only",
    TWILIO_AUTH_TOKEN: "fixture-auth", TWILIO_TWIML_APP_SID: "AP" + "3".repeat(32), TWILIO_CALLER_ID: "+12025550111",
  });
  const [a, b] = (await Promise.all([login("call-a"), login("phone-b")])).map(({ body }) => body);
  assert.equal(a.callSocketMode, undefined);
  for (const suffix of ["challenge", "confirm"]) {
    assert.equal((await request("/api/account/deletion/" + suffix, { token: a.sessionToken, method: "POST", body: {} })).status, 404);
  }
  assert.equal((await request("/api/call-test/login", { method: "POST", body: {} })).status, 404);
  const [left, right] = (await Promise.all([a, b].map(({ sessionToken }) =>
    openMailSocket(t, origin, sessionToken, "/", { verifiedCallProtocol: 1 })))).map(({ socket }) => socket);
  assert.equal((await rejectMailSocket(t, origin, a.sessionToken, "/calls")).message, "Invalid namespace");
  const callId = "verified-call-fixture";
  const incoming = expectSocketEvent(right, "call:incoming");
  left.emit("call:verified-initiate", { callId, to: "phone-b", kind: "voice", protocol: 1 });
  assert.deepEqual(await incoming, { callId, from: "call-a", kind: "voice", protocol: 1 });
  const ending = expectSocketEvent(right, "call:ended");
  left.emit("call:end", { callId });
  await ending;
  const prepare = await request("/api/calls/pstn/prepare", {
    token: b.sessionToken, method: "POST", body: { requestId: "legacy-phone-fixture", phone: "+33123456789" },
  });
  assert.equal(prepare.status, 201, JSON.stringify(prepare.body));
  assert.equal(prepare.body.token, "mock-token:" + prepare.body.attemptId);
  assert.equal(prepare.body.quotaResetsAt, undefined);
  const stored = await client.db("oneconnect").collection("pstn_attempts").findOne({ _id: prepare.body.attemptId });
  assert.equal(stored.ownerUsername, "phone-b");
  assert.equal(stored.ownerAccountId, undefined);
});

test("deletion HTTP confirms a bound session, handles a lost response and cannot delete a returned account", { timeout: 45000 }, async (t) => {
  const db = client.db("oneconnect");
  const jobs = db.collection(deletionCollection);
  const grants = db.collection(deletionConfirmations);
  const bindings = db.collection(identityBindingsCollection);
  const { request, login, origin } = await startEmailTestServer(t, true, {
    DROP_DELETION_RESPONSE: "1", PSTN_FIXTURE_TIME: String(Date.now()),
  });
  const startSession = async (identity) => {
    const result = await login(identity);
    assert.equal(result.status, 200);
    return result.body.sessionToken;
  };
  const original = await startSession("delete-http");
  const alternate = await startSession("delete-http");
  const stranger = await startSession("delete-http-peer");
  const { accountId } = await bindings.findOne({ _id: "delete-http-uid" });
  const { accountId: otherId } = await bindings.findOne({ _id: "delete-http-peer-uid" });
  const base = "/api/account/deletion";
  const challenge = (token, body = {}) => request(base + "/challenge", { token, method: "POST", body });
  const submit = (token, proof, accessToken = "delete-http", extra = {}) => request(base + "/confirm", {
    token, method: "POST", body: { confirmationToken: proof, accessToken, confirm: true, ...extra },
  });

  assert.equal((await request(base + "/confirm", { token: original })).status, 404);
  assert.equal((await request(base + "/" + accountId, { token: original })).status, 404);
  assert.equal((await challenge(original, { accountId: otherId })).status, 400);
  assert.equal(await jobs.findOne({ _id: accountId }), null);

  const expired = await challenge(original);
  assert.equal(expired.status, 201);
  assert.deepEqual(Object.keys(expired.body).sort(), ["confirmationToken", "expiresAt"]);
  await grants.updateOne({ accountId }, { $set: { expiresAt: new Date(0) } });
  assert.equal((await submit(original, expired.body.confirmationToken)).body.code, "DELETION_CONFIRMATION_INVALID");

  const issued = await challenge(original);
  assert.equal(issued.status, 201);
  const proof = issued.body.confirmationToken;
  assert.equal((await submit(original, proof, "delete-http", { accountId: otherId })).status, 400);
  assert.equal((await submit(original, proof, "delete-http", { confirm: false })).status, 400);
  assert.equal((await submit(alternate, proof)).status, 409);
  assert.equal((await submit(stranger, proof, "delete-http-peer")).status, 409);
  assert.deepEqual(await submit(original, proof, "delete-http-different-uid"),
    { status: 403, body: { code: "PI_IDENTITY_MISMATCH" } });
  assert.equal(await jobs.findOne({ _id: accountId }), null);

  const sockets = await Promise.all(["/email", "/chat", "/groups", "/calls"].map((namespace, i) =>
    openMailSocket(t, origin, i % 2 ? alternate : original, namespace)));
  const disconnected = Promise.all(sockets.map(({ socket }) => expectSocketEvent(socket, "disconnect")));
  const paired = await Promise.allSettled([submit(original, proof), submit(original, proof)]);
  assert.equal(paired.filter(({ status }) => status === "rejected").length, 1);
  assert.deepEqual(paired.find(({ status }) => status === "fulfilled")?.value, { status: 202, body: { status: "accepted" } });
  await disconnected;
  for (const token of [original, alternate]) assert.equal((await request("/api/profile", { token })).status, 401);
  assert.equal((await submit(alternate, proof)).status, 401);
  assert.deepEqual(await submit(original, proof), { status: 202, body: { status: "accepted" } });
  assert.equal(await grants.countDocuments({ accountId, acceptedAt: { $exists: true } }), 1);

  let job;
  for (let i = 0; i < 100; i++) {
    job = await jobs.findOne({ _id: accountId });
    if (job?.phase === "completed") break;
    await wait(50);
  }
  assert.equal(job?.phase, "completed");
  assert.equal(await jobs.countDocuments({ _id: accountId }), 1);
  assert.equal(await jobs.findOne({ _id: otherId }), null);
  const returned = await startSession("delete-http");
  const { accountId: returnedId } = await bindings.findOne({ _id: "delete-http-uid" });
  assert.notEqual(returnedId, accountId);
  assert.equal((await submit(returned, proof)).status, 409);
  assert.deepEqual(await submit(original, proof), { status: 202, body: { status: "accepted" } });
  assert.equal(await jobs.findOne({ _id: returnedId }), null);
  assert.equal((await request("/api/profile", { token: returned })).status, 200);
  await grants.updateOne({ accountId, acceptedAt: { $exists: true } }, { $set: { expiresAt: new Date(0) } });
  assert.equal((await submit(original, proof)).status, 401);

  const signedOut = await startSession("delete-http-peer");
  const signedOutProof = (await challenge(signedOut)).body.confirmationToken;
  assert.equal((await request("/api/auth/logout", { token: signedOut, method: "POST" })).status, 200);
  assert.equal((await submit(signedOut, signedOutProof, "delete-http-peer")).status, 401);
  assert.equal(await jobs.findOne({ _id: otherId }), null);

  const rateToken = await startSession("delete-http-rate");
  const rateAlternate = await startSession("delete-http-rate");
  const rateProof = (await challenge(rateToken)).body.confirmationToken;
  for (let i = 0; i < 4; i++) assert.equal((await challenge(rateAlternate)).status, 201);
  assert.equal((await challenge(rateToken)).status, 429);
  for (let i = 0; i < 8; i++) {
    assert.equal((await submit(rateToken, rateProof, "unknown-pi-token")).body.code, "PI_VERIFICATION_FAILED");
  }
  assert.equal((await submit(rateToken, rateProof, "delete-http-rate")).status, 429);
});

test("real deletion start revokes every session and rejects a write held before its commit fence", { timeout: 35000 }, async (t) => {
  const { request, login, origin, child, upload, webhook } = await startEmailTestServer(t, true, {
    PSTN_ENABLED: "true", PSTN_ALLOWED_ACCOUNT_IDS: "10000000-0000-4000-8000-000000000001",
    PSTN_ABUSE_KEY_SECRET: "isolated-deletion-pstn-secret-0123456789",
    TWILIO_ACCOUNT_SID: "AC" + "1".repeat(32), TWILIO_API_KEY_SID: "SK" + "2".repeat(32),
    TWILIO_API_KEY_SECRET: "fixture", TWILIO_AUTH_TOKEN: "fixture-auth",
    TWILIO_TWIML_APP_SID: "AP" + "3".repeat(32), TWILIO_CALLER_ID: "+12025550111",
  });
  const db = client.db("oneconnect");
  const bindings = db.collection(identityBindingsCollection);
  const [original, otherSession, peer] = (await Promise.all([login("delete-fixture"), login("delete-fixture"), login("delete-peer")]))
    .map(({ body }) => body.sessionToken);
  const { accountId } = await bindings.findOne({ _id: "delete-fixture-uid" });
  const { accountId: peerId } = await bindings.findOne({ _id: "delete-peer-uid" });
  const deletedLabel = "حساب محذوف";
  await db.collection("account_private_state").insertMany([
    ...["connect.profile", "connect.settings", "connect.invoice-drafts"].map((key) => ({
      ownerAccountId: accountId, key, blob: { secret: "erase me" },
    })),
    { ownerAccountId: peerId, key: "connect.settings", blob: { keep: true } },
  ]);
  await db.collection("account_private_contacts").insertMany([
    { ownerAccountId: accountId, contactAccountId: peerId, name: "peer", addedAt: 1 },
    { ownerAccountId: peerId, contactAccountId: accountId, name: "old username", addedAt: 1 },
  ]);
  const sharedFile = await upload(original, "@delete-peer");
  const orphan = await upload(original, "@delete-peer");
  assert.equal(sharedFile.status, 201);
  assert.equal(orphan.status, 201);
  const mail = await request("/api/emails/internal", { method: "POST", token: original, body: {
    id: "delete-cleanup-mail", recipient: "@delete-peer", body: "keep recipient copy", subject: "fixture",
    attachmentId: sharedFile.body.attachmentId,
  } });
  assert.equal(mail.status, 201);
  const replyToken = "f".repeat(48);
  await db.collection("emails").insertOne({ accountScoped: true, type: "external", direction: "outgoing",
    ownerAccountId: accountId, ownerUsername: "delete-fixture", replyToken });
  const chat = db.collection("messages");
  const chatParty = { accountScoped: true, senderAccountId: accountId, recipientAccountId: peerId,
    senderUsername: "delete-fixture", recipientUsername: "delete-peer", kind: "text", at: Date.now() };
  const sharedChat = await chat.insertOne({ ...chatParty, text: "preserve chat" });
  const hiddenChat = await chat.insertOne({ ...chatParty, text: "remove both copies", deletedForAccountIds: [peerId] });
  const groups = db.collection("account_chat_groups");
  const ownedId = new ObjectId(), transferredId = new ObjectId();
  await groups.insertMany([
    { _id: ownedId, ownerAccountId: accountId, name: "archive me", memberAccountIds: [accountId, peerId],
      invitedAccountIds: [], state: "active" },
    { _id: transferredId, ownerAccountId: peerId, name: "keep active", memberAccountIds: [peerId],
      formerOwnerAccountIds: [accountId], invitedAccountIds: [accountId], state: "active" },
  ]);
  const groupUpload = new FormData();
  groupUpload.set("kind", "file");
  groupUpload.set("file", new Blob(["group archived file stays"]), "archived.txt");
  const groupMediaRoute = "/api/groups/" + ownedId.toHexString() + "/media";
  const groupFile = await request(groupMediaRoute, { method: "POST", token: original, body: groupUpload });
  assert.equal(groupFile.status, 201, JSON.stringify(groupFile.body));
  await db.collection("account_group_messages").insertOne({
    groupId: ownedId.toHexString(), senderAccountId: accountId, kind: "file", text: "keep group message",
    mediaId: groupFile.body.mediaId,
    readByAccountIds: [accountId, peerId], at: Date.now(),
  });
  const callbackSid = "CA" + randomBytes(16).toString("hex");
  const quotaKey = "fixture-deletion-quota";
  await db.collection("account_pstn_attempts").insertOne({
    ownerAccountId: accountId, requestId: "fixture-deletion-attempt", state: "completed",
    parentCallSid: callbackSid, quotaKey, phone: "+33123456789",
  });
  await db.collection("pstn_usage").insertOne({ _id: quotaKey, count: 1 });
  const sockets = await Promise.all(["/chat", "/email", "/groups", "/calls"].map((namespace, index) =>
    openMailSocket(t, origin, index % 2 ? otherSession : original, namespace)));
  const secondary = await startEmailTestServer(t, true);
  const secondaryToken = (await secondary.login("delete-fixture")).body.sessionToken;
  const secondaryClient = await openMailSocket(t, secondary.origin, secondaryToken, "/email");
  const secondaryDisconnect = expectSocketEvent(secondaryClient.socket, "disconnect");
  const peerCall = (await openMailSocket(t, origin, peer, "/calls")).socket;
  const call = sockets[3].socket;
  const incoming = expectSocketEvent(peerCall, "call:incoming");
  call.emit("call:initiate", { callId: "account-deletion-fixture", kind: "voice", to: "delete-peer" });
  await incoming;
  const ended = expectSocketEvent(peerCall, "call:ended");
  const disconnects = sockets.map(({ socket }) => expectSocketEvent(socket, "disconnect"));

  function receive(predicate) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { child.off("message", onMessage); reject(new Error("Fixture IPC timed out")); }, 8000);
      function onMessage(message) {
        if (!predicate(message)) return;
        clearTimeout(timer);
        child.off("message", onMessage);
        resolve(message);
      }
      child.on("message", onMessage);
    });
  }
  const quotaDay = new Date().toISOString().slice(0, 10);
  await db.collection("external_email_usage").insertOne({ _id: "account:" + accountId + ":" + quotaDay, count: 9 });
  const heldMail = receive((message) => message.held === "mailgun-deletion");
  const pendingMail = request("/api/emails/external", { token: original, method: "POST", body: {
    id: "deletion-held-mail", subject: "hold-deletion-mail", recipient: "out@fixture.test", body: "fixture message",
  } });
  await heldMail;
  const pendingReads = [];
  for (const [holdRead, path] of [
    ["toArray:emails", "/api/emails"],
    ["next:email_attachments.files", "/api/emails/" + mail.body.email.id + "/attachment"],
    ["toArray:messages", "/api/chat/conversations/" + privateConversationId(accountId, peerId)],
  ]) {
    const readArmed = receive((message) => message.armed === holdRead);
    child.send({ holdRead });
    await readArmed;
    const reading = receive((message) => message.held === holdRead);
    pendingReads.push({ holdRead, response: request(path, { token: original }) });
    await reading;
  }

  const armed = receive((message) => message.armed === accountId);
  child.send({ holdAccountFence: accountId });
  await armed;
  const held = receive((message) => message.held === "deletion-write");
  const pending = request("/api/state/connect.settings", {
    token: original, method: "PUT", body: { blob: { fixture: "must not be stored" } },
  });
  await held;

  const first = receive((message) => message.deletionReply === "first");
  const second = receive((message) => message.deletionReply === "second");
  child.send({ startDeletion: accountId, requestId: "first" });
  child.send({ startDeletion: accountId, requestId: "second" });
  const results = await Promise.all([first, second]);
  assert.ok(results.every(({ jobId }) => typeof jobId === "string"));
  assert.equal(results[0].jobId, results[1].jobId);
  await Promise.all([...disconnects, secondaryDisconnect]);
  assert.equal((await secondary.request("/api/profile", { token: secondaryToken })).status, 401);
  assert.equal((await ended).callId, "account-deletion-fixture");
  child.send({ resume: "deletion-write" });
  const blocked = await pending;
  assert.equal(blocked.status, 403, JSON.stringify(blocked.body));
  assert.equal(blocked.body.code, "ACCOUNT_WRITE_BLOCKED");
  for (const { holdRead, response } of pendingReads) {
    child.send({ resume: holdRead });
    const result = await response;
    assert.equal(result.status, 403);
    assert.equal(result.body.code, "ACCOUNT_DELETING");
  }
  assert.equal(await db.collection("account_private_state").countDocuments({ ownerAccountId: accountId }), 0);
  assert.equal((await request("/api/profile", { token: original })).status, 401);
  assert.equal((await request("/api/groups", { token: otherSession })).status, 401);
  assert.equal((await login("delete-fixture")).body.code, "ACCOUNT_DELETING");
  assert.equal((await bindings.findOne({ accountId })).state, "deleting");
  let record;
  for (let i = 0; i < 100; i++) {
    record = await db.collection(deletionCollection).findOne({ _id: accountId });
    if (record.blocker === "EXTERNAL_OPERATION_PENDING") break;
    await wait(50);
  }
  assert.equal(record.phase, "awaiting-final-review", JSON.stringify(record));
  assert.deepEqual(record.fileCleanup, { removed: 1, retained: 2, blocked: 0 });
  assert.equal(record.blocker, "EXTERNAL_OPERATION_PENDING");
  assert.equal((await login("delete-fixture")).body.code, "ACCOUNT_DELETING");
  assert.equal(await db.collection("account_private_contacts").countDocuments({ ownerAccountId: accountId }), 0);
  assert.equal((await request("/api/contacts", { token: peer })).body.contacts[0].name, deletedLabel);
  assert.equal((await request("/api/state/connect.settings", { token: peer })).body.blob.keep, true);
  const peerMail = (await request("/api/emails", { token: peer })).body.emails.find((email) => email.id === mail.body.email.id);
  assert.equal(peerMail.senderName, deletedLabel);
  assert.equal(peerMail.senderUsername, undefined);
  assert.equal(peerMail.peerDeleted, true);
  const { parseInternalEmail } = await import("../lib/connect/data.ts");
  assert.equal(parseInternalEmail(peerMail, "delete-peer", "account")?.senderName, deletedLabel);
  assert.deepEqual(await request("/api/emails/" + peerMail.id + "/attachment", { token: peer }),
    { status: 200, body: "fixture attachment" });
  assert.equal((await webhook(replyToken, "reply-after-cleanup", true)).status, 406);
  assert.equal(await db.collection("emails").countDocuments({ ownerAccountId: accountId }), 0);
  const sharedHistory = await request("/api/chat/conversations/" + privateConversationId(accountId, peerId), { token: peer });
  assert.equal(sharedHistory.status, 200);
  assert.equal(sharedHistory.body.peer.label, deletedLabel);
  assert.ok(await chat.findOne({ _id: sharedChat.insertedId, deletedForAccountIds: accountId }));
  assert.equal(await chat.findOne({ _id: hiddenChat.insertedId }), null);
  assert.equal((await groups.findOne({ _id: ownedId })).state, "archived");
  assert.deepEqual((await groups.findOne({ _id: ownedId })).memberAccountIds, [peerId]);
  assert.equal((await groups.findOne({ _id: transferredId })).state, "active");
  assert.deepEqual((await groups.findOne({ _id: transferredId })).invitedAccountIds, []);
  assert.deepEqual((await db.collection("account_group_messages").findOne({ groupId: ownedId.toHexString() })).readByAccountIds, [peerId]);
  const files = await db.collection(deletionFileCandidates).find({ accountId }).toArray();
  assert.deepEqual(files.map(({ fileId, result }) => [fileId.toHexString(), result]).sort(), [
    [sharedFile.body.attachmentId, "retained"], [orphan.body.attachmentId, "removed"],
    [groupFile.body.mediaId, "retained"],
  ].sort());
  const orphanId = new ObjectId(orphan.body.attachmentId);
  assert.equal(await db.collection("email_attachments.files").countDocuments({ _id: orphanId }), 0);
  assert.equal(await db.collection("email_attachments.chunks").countDocuments({ files_id: orphanId }), 0);
  assert.deepEqual(await request(groupMediaRoute + "/" + groupFile.body.mediaId, { token: peer }),
    { status: 200, body: "group archived file stays" });
  const callHistory = await request("/api/calls/history", { token: peer });
  assert.ok(callHistory.body.calls.some(({ callId }) => callId === "account-deletion-fixture"));
  assert.equal(await db.collection("account_call_logs").countDocuments({ participantAccountIds: accountId }), 0);

  child.send({ resume: "mailgun-deletion" });
  assert.equal((await pendingMail).status, 403);
  const finishes = ["finish-first", "finish-second"].map((requestId) => {
    const reply = receive((message) => message.deletionReply === requestId);
    child.send({ startDeletion: accountId, requestId });
    return reply;
  });
  await Promise.all(finishes);
  for (let i = 0; i < 100; i++) {
    record = await db.collection(deletionCollection).findOne({ _id: accountId });
    if (record.phase === "completed") break;
    await wait(50);
  }
  assert.equal(record.phase, "completed", JSON.stringify(record));
  assert.deepEqual(Object.keys(record).sort(), ["_id", "completedAt", "fileCleanup", "jobId", "phase"].sort());
  assert.equal(record.jobId, results[0].jobId);
  assert.equal(await bindings.findOne({ accountId }), null);
  const returned = (await login("delete-fixture")).body.sessionToken;
  const rebound = await bindings.findOne({ _id: "delete-fixture-uid" });
  assert.notEqual(rebound.accountId, accountId);
  assert.ok(returned);
  assert.equal((await request("/api/profile", { token: returned })).body.profile, null);
  assert.equal((await request("/api/state/connect.invoice-drafts", { token: returned })).body.blob, null);
  assert.deepEqual((await request("/api/contacts", { token: returned })).body.contacts, []);
  assert.deepEqual((await request("/api/groups", { token: returned })).body.groups, []);
  assert.deepEqual((await request("/api/groups/invitations", { token: returned })).body.invitations, []);
  assert.equal((await request("/api/chat/conversations/" + privateConversationId(accountId, peerId), { token: returned })).status, 404);
  assert.equal((await request("/api/emails/" + peerMail.id + "/attachment", { token: returned })).status, 404);
  assert.equal((await request(groupMediaRoute + "/" + groupFile.body.mediaId, { token: returned })).status, 404);
  assert.equal((await request("/api/emails/" + peerMail.id + "/attachment", { token: peer })).status, 200);
  assert.equal((await webhook(replyToken, "reply-after-return", true)).status, 406);
  assert.equal(await db.collection("emails").countDocuments({ ownerAccountId: accountId }), 0);
  assert.equal((await db.collection("external_email_usage").findOne({ _id: mailQuotaKey("delete-fixture-uid", quotaDay) })).count, 10);
  const rejectedMail = await request("/api/emails/external", { token: returned, method: "POST", body: {
    id: "deletion-return-mail", subject: "quota remains", recipient: "out@fixture.test", body: "fixture message",
  } });
  assert.equal(rejectedMail.status, 429);
  assert.equal((await request("/api/profile", { token: original })).status, 401);
  const beforeRetry = await bindings.findOne({ _id: "delete-fixture-uid" });
  const oldJobRetry = receive((message) => message.deletionReply === "retry-old");
  child.send({ startDeletion: accountId, requestId: "retry-old" });
  assert.equal((await oldJobRetry).phase, "completed");
  assert.deepEqual(await bindings.findOne({ _id: "delete-fixture-uid" }), beforeRetry);

  const path = "/api/calls/pstn/status";
  const fields = { AccountSid: "AC" + "1".repeat(32), CallSid: callbackSid, DialCallStatus: "completed" };
  const signature = createHmac("sha256", "fixture-auth")
    .update(JSON.stringify(["https://one-connect.onrender.com" + path, Object.entries(fields).sort()])).digest("hex");
  assert.equal((await fetch(origin + path, { method: "POST", headers: { "X-Twilio-Signature": signature },
    body: new URLSearchParams(fields) })).status, 200);
  assert.equal(await db.collection("account_pstn_attempts").countDocuments({ ownerAccountId: accountId }), 0);
  assert.equal((await db.collection("pstn_usage").findOne({ _id: quotaKey })).connected, true);
  assert.equal(await db.collection(deletionCollection).countDocuments({ _id: accountId }), 1);
});

test("server startup resumes an HTTP deletion after the accepting process exits", { timeout: 40000 }, async (t) => {
  const original = await startEmailTestServer(t, true);
  const db = client.db("oneconnect");
  const login = await original.login("delete-restart-audit");
  const token = login.body.sessionToken;
  const bindings = db.collection(identityBindingsCollection);
  const { accountId } = await bindings.findOne({ _id: "delete-restart-audit-uid" });
  const job = db.collection(deletionCollection);
  const base = "/api/account/deletion";
  const armed = once(original.child, "message", { signal: AbortSignal.timeout(8000) });
  original.child.send({ holdDeletionJob: accountId });
  assert.deepEqual((await armed)[0], { armed: accountId });
  const claimed = once(original.child, "message", { signal: AbortSignal.timeout(8000) });
  const challenge = await original.request(base + "/challenge", { method: "POST", token, body: {} });
  // A distinct authenticated account keeps this test independent of rate-limit fixtures.
  assert.equal(challenge.status, 201, JSON.stringify(challenge.body));
  const confirmation = await original.request(base + "/confirm", { method: "POST", token, body: {
    confirmationToken: challenge.body.confirmationToken, accessToken: "delete-restart-audit", confirm: true,
  } });
  assert.equal(confirmation.status, 202);
  assert.deepEqual((await claimed)[0], { held: "deletion-lease" });
  const crashed = once(original.child, "close");
  original.child.kill();
  await crashed;
  const accepted = await job.findOne({ _id: accountId });
  assert.ok(accepted.lease);
  await job.updateOne({ _id: accountId }, { $set: { "lease.until": 0 } });
  const restarted = await startEmailTestServer(t, true);
  let record;
  for (let i = 0; i < 160; i++) {
    record = await job.findOne({ _id: accountId });
    if (record?.phase === "completed") break;
    await wait(50);
  }
  assert.equal(record?.phase, "completed", JSON.stringify(record));
  assert.equal(record.jobId, accepted.jobId);
  assert.equal((await restarted.request("/api/profile", { token })).status, 401);
  assert.equal(await bindings.findOne({ accountId }), null);
});

test("deletion worker recovers a crashed phase and leases prevent conflicting execution", { timeout: 20000 }, async () => {
  const db = client.db("one_connect_deletion_workers");
  const { accountId } = await resolveVerifiedPiAccount(db, "fixture-worker-account");
  const [{ host, port }] = client.options.hosts;
  assert.equal(host, "127.0.0.1");
  const uri = "mongodb://127.0.0.1:" + port + "/?directConnection=true";
  const source = `
    import { MongoClient } from ${JSON.stringify(import.meta.resolve("mongodb"))};
    import { createAccountDeletion } from ${JSON.stringify(new URL("./account-deletion.js", import.meta.url).href)};
    const local = new MongoClient(${JSON.stringify(uri)});
    const worker = createAccountDeletion({
      db: local.db("one_connect_deletion_workers"), client: local, leaseMs: 50,
      revokeAccess: async () => {}, stopCalls: async () => process.exit(73),
    });
    await worker.start(${JSON.stringify(accountId)});
  `;
  const crashed = spawn(process.execPath, ["--input-type=module", "--eval", source], { stdio: "ignore", windowsHide: true });
  const [exit] = await once(crashed, "exit", { signal: AbortSignal.timeout(8000) });
  assert.equal(exit, 73);
  const jobs = db.collection(deletionCollection);
  const before = await jobs.findOne({ _id: accountId });
  assert.equal(before.phase, "stop-calls");
  assert.equal(before.attempts["stop-calls"], 1);
  let resume;
  const blocker = new Promise((resolve) => { resume = resolve; });
  let entered;
  const started = new Promise((resolve) => { entered = resolve; });
  let calls = 0;
  const time = before.lease.until + 1;
  const make = () => createAccountDeletion({
    db, client, now: () => time, revokeAccess: async () => {},
    stopCalls: async (_id, ownsLease) => { assert.equal(await ownsLease(), true); calls++; entered(); await blocker; },
  });
  const worker = make();
  const inProgress = worker.resumePending();
  await started;
  await make().resumePending();
  assert.equal(calls, 1);
  resume();
  await inProgress;
  const resumed = await jobs.findOne({ _id: accountId });
  assert.equal(resumed.jobId, before.jobId);
  assert.equal(resumed.phase, "completed");
  assert.equal(calls, 1);
  assert.equal(await db.collection(identityBindingsCollection).findOne({ accountId }), null);
  assert.notEqual((await resolveVerifiedPiAccount(db, "fixture-worker-account")).accountId, accountId);
});

test("deletion resumes after a crash between inventory and data erasure", { timeout: 40000 }, async () => {
  const database = "one_connect_deletion_inventory";
  const db = client.db(database);
  const { accountId } = await resolveVerifiedPiAccount(db, "fixture-inventory-account");
  const fileId = new ObjectId();
  await db.collection("chat_attachments.files").insertOne({
    _id: fileId, metadata: { accountScoped: true, ownerAccountId: accountId },
  });
  await db.collection("account_private_state").insertOne({ ownerAccountId: accountId, key: "connect.settings" });
  const [{ host, port }] = client.options.hosts;
  assert.equal(host, "127.0.0.1");
  const uri = "mongodb://127.0.0.1:" + port + "/?directConnection=true";
  const source = `
    import { MongoClient, ClientSession } from ${JSON.stringify(import.meta.resolve("mongodb"))};
    import { createAccountDeletion, deletionCollection } from ${JSON.stringify(new URL("./account-deletion.js", import.meta.url).href)};
    const local = new MongoClient(${JSON.stringify(uri)});
    const db = local.db(${JSON.stringify(database)});
    const accountId = ${JSON.stringify(accountId)};
    const commit = ClientSession.prototype.commitTransaction;
    ClientSession.prototype.commitTransaction = async function () {
      await commit.call(this);
      if ((await db.collection(deletionCollection).findOne({ _id: accountId }))?.phase === "erase-private-data") {
        process.exit(74);
      }
    };
    const result = await createAccountDeletion({ db, client: local, revokeAccess: async () => {}, stopCalls: async () => {} }).start(accountId);
    console.error(JSON.stringify(result));
    await local.close();
    process.exit(75);
  `;
  const worker = spawn(process.execPath, ["--input-type=module", "--eval", source], { stdio: ["ignore", "ignore", "pipe"], windowsHide: true });
  let error = "";
  worker.stderr.on("data", (chunk) => { error += chunk; });
  assert.equal((await once(worker, "close", { signal: AbortSignal.timeout(25000) }))[0], 74, error);
  const jobs = db.collection(deletionCollection);
  assert.equal((await jobs.findOne({ _id: accountId })).phase, "erase-private-data");
  assert.equal(await db.collection(deletionFileCandidates).countDocuments({ accountId, fileId }), 1);
  assert.equal(await db.collection("account_private_state").countDocuments({ ownerAccountId: accountId }), 1);

  const makeWorker = () => createAccountDeletion({ db, client, revokeAccess: async () => {}, stopCalls: async () => {} });
  await Promise.all([makeWorker().resumePending(), makeWorker().resumePending()]);
  const job = await jobs.findOne({ _id: accountId });
  assert.equal(job.phase, "completed");
  assert.equal(await db.collection("account_private_state").countDocuments({ ownerAccountId: accountId }), 0);
  assert.equal(await db.collection("chat_attachments.files").countDocuments({ _id: fileId }), 0);
  assert.equal(await db.collection(identityBindingsCollection).findOne({ accountId }), null);
});

test("file cleanup serializes new references, preserves uncertain files and resumes after a file transaction", { timeout: 40000 }, async () => {
  const database = "one_connect_file_delete";
  const db = client.db(database);
  const { accountId } = await resolveVerifiedPiAccount(db, "file-owner");
  const { accountId: peer } = await resolveVerifiedPiAccount(db, "file-peer");
  const write = createAccountWriteFence(db, client);
  const upload = (owner) => saveScopedFile(db, write, owner, "email_attachments", "file.txt", Buffer.from("fixture"), {
    accountScoped: true, ownerAccountId: owner, recipientAccountId: accountId,
  });
  const retained = await upload(peer);
  const removed = await upload(accountId);
  const ambiguous = await upload(accountId);
  const missing = new ObjectId();
  const jobs = db.collection(deletionCollection);
  const manifests = db.collection(deletionFileCandidates);
  const files = db.collection("email_attachments.files");
  const chunks = db.collection("email_attachments.chunks");
  const emails = db.collection("emails");
  const candidate = (fileId) => ({ accountId, bucket: "email_attachments", fileId });
  await manifests.insertMany([retained, removed, ambiguous, missing].map((fileId) => ({
    _id: candidate(fileId), ...candidate(fileId),
  })));
  const legacy = await emails.insertOne({ type: "internal", attachmentId: ambiguous.toHexString() });
  await db.collection(identityBindingsCollection).updateOne({ accountId },
    { $set: { state: "deleting", privateDataErased: true } });
  await jobs.insertOne({ _id: accountId, phase: "awaiting-file-cleanup", updatedAt: Date.now(), attempts: {} });

  let releaseWriter;
  let notifyWriter;
  const writerReady = new Promise((resolve) => { notifyWriter = resolve; });
  const writerRelease = new Promise((resolve) => { releaseWriter = resolve; });
  const email = { accountScoped: true, type: "external", direction: "outgoing", ownerAccountId: peer,
    attachmentId: retained.toHexString() };
  const commitReference = insertWithScopedFile(db, (id, execute) => write(id, async (session) => {
    const saved = await execute(session);
    notifyWriter();
    await writerRelease;
    return saved;
  }), peer, emails, email, "email_attachments", retained);
  await writerReady;

  const makeWorker = () => createAccountDeletion({ db, client, revokeAccess: async () => {}, stopCalls: async () => {} });
  let notifyCleaner;
  const cleaningFile = new Promise((resolve) => { notifyCleaner = resolve; });
  const updateFile = Collection.prototype.findOneAndUpdate;
  Collection.prototype.findOneAndUpdate = function (filter, ...args) {
    const operation = updateFile.call(this, filter, ...args);
    if (this.dbName === database && this.collectionName === "email_attachments.files" && retained.equals(filter._id)) {
      notifyCleaner();
    }
    return operation;
  };
  const cleaning = makeWorker().resumePending();
  try {
    assert.equal(await Promise.race([cleaningFile.then(() => true), wait(5000, false, { ref: false })]), true);
    assert.ok((await jobs.findOne({ _id: accountId })).lease);
    assert.ok(await files.findOne({ _id: retained }));
  } finally {
    releaseWriter();
    Collection.prototype.findOneAndUpdate = updateFile;
  }
  await Promise.all([commitReference, cleaning]);
  assert.equal((await manifests.findOne(candidate(retained))).result, "retained");
  assert.equal((await manifests.findOne(candidate(ambiguous))).result, "blocked");
  assert.equal((await manifests.findOne(candidate(missing))).result, "removed");
  assert.ok(await files.findOne({ _id: ambiguous }));
  assert.equal(await files.findOne({ _id: removed }), null);
  assert.equal(await chunks.countDocuments({ files_id: removed }), 0);
  await assert.rejects(insertWithScopedFile(db, write, peer, emails,
    { ...email, attachmentId: removed.toHexString() }, "email_attachments", removed),
    { code: "FILE_REFERENCE_UNAVAILABLE" });
  assert.equal((await jobs.findOne({ _id: accountId })).phase, "awaiting-file-cleanup");

  await emails.deleteOne({ _id: legacy.insertedId });
  const deleteChunks = Collection.prototype.deleteMany;
  Collection.prototype.deleteMany = function (filter, ...args) {
    if (this.dbName === database && this.collectionName === "email_attachments.chunks" && ambiguous.equals(filter.files_id)) {
      throw new Error("fixture interrupted GridFS deletion");
    }
    return deleteChunks.call(this, filter, ...args);
  };
  try {
    await makeWorker().resumePending();
  } finally {
    Collection.prototype.deleteMany = deleteChunks;
  }
  assert.ok(await files.findOne({ _id: ambiguous }));
  assert.equal(await chunks.countDocuments({ files_id: ambiguous }), 1);
  assert.equal((await jobs.findOne({ _id: accountId })).phase, "awaiting-file-cleanup");

  const [{ host, port }] = client.options.hosts;
  assert.equal(host, "127.0.0.1");
  const source = `
    import { MongoClient, ClientSession } from ${JSON.stringify(import.meta.resolve("mongodb"))};
    import { createAccountDeletion } from ${JSON.stringify(new URL("./account-deletion.js", import.meta.url).href)};
    import { deletionFileCandidates } from ${JSON.stringify(new URL("./account-file-cleanup.js", import.meta.url).href)};
    const local = new MongoClient(${JSON.stringify("mongodb://127.0.0.1:" + port + "/?directConnection=true")});
    const db = local.db(${JSON.stringify(database)});
    const commit = ClientSession.prototype.commitTransaction;
    ClientSession.prototype.commitTransaction = async function () {
      await commit.call(this);
      if (!await db.collection(deletionFileCandidates).findOne({ result: "blocked" })) process.exit(76);
    };
    await createAccountDeletion({ db, client: local, leaseMs: 2000, revokeAccess: async () => {}, stopCalls: async () => {} }).resumePending();
    await local.close();
  `;
  const worker = spawn(process.execPath, ["--input-type=module", "--eval", source], { stdio: "ignore", windowsHide: true });
  assert.equal((await once(worker, "exit", { signal: AbortSignal.timeout(12000) }))[0], 76);
  const interrupted = await jobs.findOne({ _id: accountId });
  assert.equal(interrupted.phase, "awaiting-file-cleanup");
  assert.equal((await manifests.findOne(candidate(ambiguous))).result, "removed");
  assert.equal(await files.findOne({ _id: ambiguous }), null);
  const resumedWorker = () => createAccountDeletion({ db, client, now: () => interrupted.lease.until + 1,
    revokeAccess: async () => {}, stopCalls: async () => {} });
  await Promise.all([resumedWorker().resumePending(), resumedWorker().resumePending()]);
  const report = await jobs.findOne({ _id: accountId });
  assert.equal(report.phase, "awaiting-final-review");
  assert.equal(report.blocker, "EXTERNAL_OPERATION_HISTORY_UNVERIFIED");
  assert.deepEqual(report.fileCleanup, { removed: 3, retained: 1, blocked: 0 });
  assert.equal((await db.collection(identityBindingsCollection).findOne({ accountId })).state, "deleting");
});

test("deletion final review discovers unproven files and preserves the old binding", async () => {
  const db = client.db("one_connect_deletion_unknown_file");
  const { accountId } = await resolveVerifiedPiAccount(db, "fixture-ambiguous-account");
  await db.collection(identityBindingsCollection).updateOne({ accountId },
    { $set: { state: "deleting", privateDataErased: true } });
  const jobs = db.collection(deletionCollection);
  await jobs.insertOne({ _id: accountId, phase: "awaiting-final-review", updatedAt: Date.now(),
    externalOperationsTracked: true, fileCleanup: { removed: 0, retained: 0, blocked: 0 } });
  const fileId = new ObjectId();
  await db.collection("email_attachments.files").insertOne({ _id: fileId, metadata: { ownerAccountId: accountId } });
  const service = createAccountDeletion({ db, client, revokeAccess: async () => {}, stopCalls: async () => {} });
  await service.resumePending();
  assert.equal((await jobs.findOne({ _id: accountId })).blocker, "FILES_REQUIRE_REVIEW");
  await service.resumePending();
  const job = await jobs.findOne({ _id: accountId });
  assert.equal(job.phase, "awaiting-file-cleanup");
  assert.equal(job.fileCleanup.blocked, 1);
  assert.ok(await db.collection("email_attachments.files").findOne({ _id: fileId }));
  assert.equal((await resolveVerifiedPiAccount(db, "fixture-ambiguous-account")).state, "deleting");

  const legacy = await resolveVerifiedPiAccount(db, "fixture-legacy-file-account", "legacyfile");
  const legacyId = new ObjectId();
  await db.collection("chat_images.files").insertOne({ _id: legacyId, metadata: { senderUsername: "legacyfile" } });
  const legacyJob = await service.start(legacy.accountId);
  assert.equal(legacyJob.phase, "awaiting-file-cleanup");
  assert.equal(legacyJob.fileCleanup.blocked, 1);
  assert.ok(await db.collection("chat_images.files").findOne({ _id: legacyId }));
  assert.equal((await resolveVerifiedPiAccount(db, "fixture-legacy-file-account")).state, "deleting");
});

test("deletion records only bounded operational codes and can retry without releasing Pi", async () => {
  const db = client.db("one_connect_deletion_errors");
  const { accountId } = await resolveVerifiedPiAccount(db, "fixture-errors");
  const service = createAccountDeletion({
    db, client, revokeAccess: async () => {}, stopCalls: async () => { throw Error("private fixture value"); },
  });
  const started = await service.start(accountId);
  for (let attempt = 0; attempt < 9; attempt++) await service.resumePending();
  const job = await db.collection(deletionCollection).findOne({ _id: accountId });
  assert.equal(job.jobId, started.jobId);
  assert.equal(job.phase, "stop-calls");
  assert.equal(job.errors.length, 8);
  assert.ok(job.errors.every((error) => error.code === "STEP_FAILED"));
  assert.doesNotMatch(JSON.stringify(job), /private fixture value/);
});

test("subscription settings are independent and disabled outside testing", () => {
  const enforcement = { NODE_ENV: "test", ONE_CONNECT_TEST_SUBSCRIPTION_ENFORCEMENT: "1" };
  const collection = { NODE_ENV: "test", ONE_CONNECT_TEST_SUBSCRIPTION_COLLECTION: "1" };
  assert.deepEqual(subscriptionSettings({}), { enforcementEnabled: false, collectionEnabled: false });
  assert.deepEqual(subscriptionSettings(enforcement), { enforcementEnabled: true, collectionEnabled: false });
  assert.deepEqual(subscriptionSettings(collection), { enforcementEnabled: false, collectionEnabled: true });
  assert.deepEqual(subscriptionSettings({ ...enforcement, ...collection, NODE_ENV: "production" }),
    { enforcementEnabled: false, collectionEnabled: false });
});

test("verified periods respect exact boundaries and cannot be replayed for a returning account", async () => {
  const { db, bindings } = await accountFixture("one_connect_entitlement_fixture");
  const { accountId } = await resolveVerifiedPiAccount(db, "entitlement-fixture-uid");
  let clock = 1000;
  const entitlements = await createSubscriptionFixture({ db, writeAccount: createAccountWriteFence(db, client), now: () => clock });
  const proof = { source: "test-fixture", proofId: "synthetic-cycle-one", startsAt: new Date(2000), endsAt: new Date(8000) };
  const forged = { ...proof, source: "pi-testnet", network: "pi-testnet", mode: "simulate", success: true };
  await assert.rejects(entitlements.recordFixturePeriod(accountId, forged), TypeError);
  for (const evidence of [forged, proof, { ...forged, mode: "submit" }]) {
    assert.deepEqual(await recordVerifiedPeriod(accountId, evidence), { status: "unavailable" });
  }
  assert.equal(await db.collection(subscriptionFixtureCollection).countDocuments(), 0);
  // Previously seeded periods, even with provider-looking metadata, are not trusted.
  await db.collection("account_entitlement_periods").insertOne({ ...forged, accountId });
  const replies = await Promise.all(Array.from({ length: 8 }, () => entitlements.recordFixturePeriod(accountId, proof)));
  assert.equal(replies.filter(Boolean).length, 1);
  assert.equal(await db.collection(subscriptionFixtureCollection).countDocuments(), 1);
  await assert.rejects(entitlements.recordFixturePeriod(accountId, { ...proof, endsAt: new Date(8001) }), EntitlementProofConflict);

  for (const [at, expected] of [[1999, "none"], [2000, "active"], [7999, "active"], [8000, "expired"], [8001, "expired"]]) {
    clock = at;
    const status = await entitlements.status(accountId);
    assert.equal(status.accessMode, "free");
    assert.equal(status.entitlement.status, expected);
  }

  const runtime = createAccountEntitlements({ db, now: () => 3000 });
  assert.equal((await runtime.status(accountId)).entitlement.status, "none");
  await bindings.updateOne({ accountId }, { $set: { state: "deleting" } });
  await assert.rejects(entitlements.recordFixturePeriod(accountId, { ...proof, proofId: "late-proof" }), { code: "ACCOUNT_WRITE_BLOCKED" });
  await bindings.deleteOne({ accountId, state: "deleting" });
  const returned = (await resolveVerifiedPiAccount(db, "entitlement-fixture-uid")).accountId;
  assert.notEqual(returned, accountId);
  assert.equal((await entitlements.status(returned)).entitlement.status, "none");
  await assert.rejects(entitlements.recordFixturePeriod(returned, proof), EntitlementProofConflict);
});

test("subscription HTTP status uses the session and legacy flags grant no entitlement", { timeout: 30000 }, async (t) => {
  const enabled = await startEmailTestServer(t, true, { ONE_CONNECT_TEST_SUBSCRIPTION_FIXTURES: "1" });
  const signedIn = await enabled.login("delete-peer");
  const token = signedIn.body.sessionToken;
  const db = client.db("oneconnect");
  const { accountId } = await db.collection(identityBindingsCollection).findOne({ _id: "delete-peer-uid" });
  const path = "/api/subscriptions/status";
  assert.equal((await enabled.request(path)).status, 401);
  assert.equal((await enabled.request(path + "?accountId=forged", { token })).status, 400);
  await db.collection("account_private_state").updateOne({ ownerAccountId: accountId, key: "oneconnect.premium" },
    { $set: { blob: { premiumActive: true, active: true } } }, { upsert: true });
  assert.deepEqual((await enabled.request(path, { token })).body, {
    accessMode: "free", plan: { pricePi: "0.1", cycle: "monthly" }, entitlement: { status: "none" },
    settings: { enforcementEnabled: false, collectionEnabled: false },
  });
  assert.equal((await enabled.request(path, { token, method: "POST", body: { premiumActive: true } })).status, 404);
  const entitlements = await createSubscriptionFixture({ db, writeAccount: createAccountWriteFence(db, client) });
  await entitlements.recordFixturePeriod(accountId, {
    source: "test-fixture", proofId: "synthetic-http-cycle",
    startsAt: new Date(Date.now() - 60000), endsAt: new Date(Date.now() + 60000),
  });
  const current = (await enabled.request(path, { token })).body;
  assert.equal(current.accessMode, "free");
  assert.equal(current.entitlement.status, "active");
  assert.equal(current.entitlement.source, "test-fixture");

  const providerConfigured = await startEmailTestServer(t, true, { ONE_CONNECT_PI_TESTNET_SUBSCRIPTIONS: "1" });
  const providerToken = (await providerConfigured.login("delete-peer")).body.sessionToken;
  assert.deepEqual((await providerConfigured.request(path, { token: providerToken })).body.entitlement, { status: "none" });
  const legacy = await startEmailTestServer(t, false);
  const legacyToken = (await legacy.login("phone-b")).body.sessionToken;
  assert.equal((await legacy.request(path, { token: legacyToken })).status, 404);
});
