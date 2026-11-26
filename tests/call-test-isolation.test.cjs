const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { randomBytes } = require("node:crypto");
const { mkdtemp } = require("node:fs/promises");
const { createRequire } = require("node:module");
const { createConnection, createServer } = require("node:net");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { setTimeout: delay } = require("node:timers/promises");
const { test } = require("node:test");
const { io } = require("socket.io-client");

const origin = "http://127.0.0.1:3000";
const build = "calls_fixture_1";
const database = "oneconnect_call_test_fixture";
const codeA = randomBytes(32).toString("base64url");
const codeB = randomBytes(32).toString("base64url");
const env = {
  ONECONNECT_CALL_TEST: "1", CALL_TEST_BUILD_ID: build, CALL_TEST_DATABASE: database,
  CALL_TEST_FRONTEND_ORIGIN: origin, CALL_TEST_MONGODB_URI: `mongodb://127.0.0.1/${database}`,
  CALL_TEST_CODE_A: codeA, CALL_TEST_CODE_B: codeB,
};

test("only the dedicated process can enable synthetic login and choose the test database", async () => {
  const { allowsCallTestEvent, allowsCallTestRoute, callTestSettings } = await import("../server/call-test-settings.js");
  assert.equal(callTestSettings({ MONGODB_URI: "unused" }, false), null);
  assert.throws(() => callTestSettings(env, false));
  assert.throws(() => callTestSettings({}, true));
  assert.throws(() => callTestSettings({ ...env, MONGODB_URI: "unused" }, true));
  assert.throws(() => callTestSettings({ ...env, CALL_TEST_DATABASE: "oneconnect" }, true));
  assert.throws(() => callTestSettings({ ...env, CALL_TEST_FRONTEND_ORIGIN: "https://one-connect-lake.vercel.app" }, true));
  assert.throws(() => callTestSettings({ ...env, CALL_TEST_CODE_B: codeA }, true));
  assert.throws(() => callTestSettings({ ...env, CALL_TEST_FRONTEND_ORIGIN: "https://oneconnect-verified-calls-ui.onrender.com" }, true));
  const settings = callTestSettings(env, true);
  assert.equal(settings.database, database);
  assert.equal(settings.login("calltest-a", codeA, "different"), null);
  assert.equal(settings.login("calltest-b", codeA, build), null);
  assert.equal(settings.login("ordinary-user", codeA, build), null);
  const login = settings.login("calltest-a", codeA, build);
  assert.match(login.token, /^calltest_[a-f0-9]{64}$/);
  assert.equal(login.session.piUsername, "calltest-a");
  assert.equal(settings.acceptsOrigin(origin), true);
  assert.equal(settings.acceptsOrigin(undefined), false);
  assert.equal(allowsCallTestRoute("POST", "/api/auth/verify"), false);
  assert.equal(allowsCallTestRoute("GET", "/api/calls/ice-servers"), true);
  assert.equal(allowsCallTestEvent("group-call:start"), false);
  assert.equal(allowsCallTestEvent("message:send"), false);
  assert.equal(allowsCallTestEvent("call:verified-initiate"), true);
});

test("test frontend requires both explicit origins and rejects the existing API", async () => {
  const { callTestBuildSettings } = await import("../call-test-build.mjs");
  const api = "https://oneconnect-verified-calls-api.onrender.com";
  const values = {
    NEXT_PUBLIC_CALL_TEST_MODE: "1", NEXT_PUBLIC_CALL_TEST_API_URL: api,
    NEXT_PUBLIC_CALL_TEST_WS_URL: api, NEXT_PUBLIC_CALL_TEST_BUILD_ID: build,
  };
  assert.equal(callTestBuildSettings({}), null);
  assert.throws(() => callTestBuildSettings({ ...values, NEXT_PUBLIC_CALL_TEST_API_URL: undefined }));
  assert.throws(() => callTestBuildSettings({ ...values, NEXT_PUBLIC_CALL_TEST_WS_URL: undefined }));
  assert.throws(() => callTestBuildSettings({ ...values, NEXT_PUBLIC_CALL_TEST_API_URL: "https://one-connect.onrender.com" }));
  assert.throws(() => callTestBuildSettings({ ...values, NEXT_PUBLIC_CALL_TEST_WS_URL: "http://localhost:3001" }));
  assert.throws(() => callTestBuildSettings({ ...values, NEXT_PUBLIC_CALL_TEST_BUILD_ID: "" }));
  assert.deepEqual(callTestBuildSettings(values), { api, socket: api.replace("https:", "wss:"), build });
});

async function port() {
  const server = createServer();
  await new Promise((resolve, reject) => server.once("error", reject).listen(0, "127.0.0.1", resolve));
  const number = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return number;
}

async function until(callback, child) {
  let lastError;
  for (let attempt = 0; attempt < 160; attempt++) {
    assert.equal(child.exitCode, null, "Fixture process exited");
    const result = await callback().catch((error) => { lastError = error; return null; });
    if (result) return result;
    await delay(125);
  }
  assert.fail(`Fixture did not become ready${lastError ? `: ${lastError.message}` : ""}`);
}

function socketEvent(socket, name) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Missing ${name}`)), 5000);
    socket.once(name, (data) => { clearTimeout(timeout); resolve(data); });
  });
}

test("isolated server rejects other origins, builds and sessions, and relays calls for the two test users",
  { skip: !process.env.ONE_CONNECT_TEST_MONGOD, timeout: 65000 }, async (t) => {
    const serverPath = join(__dirname, "..", "server");
    const { MongoClient } = createRequire(join(serverPath, "package.json"))("mongodb");
    const directory = await mkdtemp(join(tmpdir(), "oneconnect-call-test-"));
    const mongoPort = await port();
    const apiPort = await port();
    const uri = `mongodb://127.0.0.1:${mongoPort}/${database}?directConnection=true`;
    const mongo = spawn(process.env.ONE_CONNECT_TEST_MONGOD, [
      "--bind_ip", "127.0.0.1", "--port", String(mongoPort), "--dbpath", directory,
      "--logpath", join(directory, "mongo.log"),
    ], { stdio: "ignore", windowsHide: true });
    t.after(() => mongo.kill());
    await until(() => new Promise((resolve, reject) => {
      const probe = createConnection(mongoPort, "127.0.0.1");
      probe.once("error", reject);
      probe.once("connect", () => { probe.destroy(); resolve(true); });
    }), mongo);
    const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
    t.after(() => client.close());
    await client.connect();
    assert.equal(Number((await client.db("admin").command({ serverStatus: 1 })).pid), mongo.pid);
    const server = spawn(process.execPath, [join(serverPath, "call-test-server.js")], {
      cwd: directory, env: { SystemRoot: process.env.SystemRoot, ...env, PORT: String(apiPort), CALL_TEST_MONGODB_URI: uri },
      stdio: ["ignore", "ignore", "inherit"], windowsHide: true,
    });
    t.after(() => server.kill());
    const base = `http://127.0.0.1:${apiPort}`;
    const health = await until(() => fetch(`${base}/health`), server);
    assert.deepEqual(await health.json(), { mode: "call-test", build, protocol: 1 });
    assert.equal((await client.db(database).listCollections().toArray()).length > 0, true);
    assert.deepEqual(await client.db("oneconnect").listCollections().toArray(), []);
    const login = (user, code, requestBuild = build, requestOrigin = origin) => fetch(`${base}/api/call-test/login`, {
      method: "POST", headers: { Origin: requestOrigin, "Content-Type": "application/json" },
      body: JSON.stringify({ user, code, build: requestBuild }),
    });
    const foreign = await login("calltest-a", codeA, build, "https://unrelated.test");
    assert.equal(foreign.status, 403);
    assert.equal(foreign.headers.get("access-control-allow-origin"), null);
    assert.equal((await login("calltest-a", codeA, "wrong_build")).status, 401);
    assert.equal((await login("calltest-a", codeB)).status, 401);
    for (const path of ["/api/auth/verify", "/api/groups", "/api/emails", "/api/pstn/prepare"]) {
      assert.equal((await fetch(base + path, { method: "POST", headers: { Origin: origin } })).status, 404);
    }
    const a = await (await login("calltest-a", codeA)).json();
    const b = await (await login("calltest-b", codeB)).json();
    const ice = (token) => fetch(`${base}/api/calls/ice-servers`, { headers: { Origin: origin, Authorization: `Bearer ${token}` } });
    assert.equal((await ice("ordinary-session")).status, 401);
    assert.equal((await ice(a.sessionToken)).status, 200);
    const connect = (sessionToken, requestedBuild, requestOrigin = origin) => {
      const socket = io(base, { autoConnect: false, forceNew: true, reconnection: false,
        extraHeaders: { Origin: requestOrigin }, auth: { sessionToken, callTestBuild: requestedBuild, verifiedCallProtocol: 1 } });
      t.after(() => socket.disconnect());
      return socket;
    };
    for (const bad of [connect(a.sessionToken, "wrong_build"), connect(a.sessionToken, build, "https://unrelated.test")]) {
      const error = socketEvent(bad, "connect_error");
      bad.connect();
      assert.ok(await error);
    }
    const caller = connect(a.sessionToken, build);
    const recipient = connect(b.sessionToken, build);
    const ready = Promise.all([socketEvent(caller, "connect"), socketEvent(recipient, "connect")]);
    caller.connect();
    recipient.connect();
    await ready;
    const callId = randomBytes(16).toString("hex");
    const incoming = socketEvent(recipient, "call:incoming");
    caller.emit("call:verified-initiate", { callId, protocol: 1, kind: "voice", to: "calltest-b" });
    assert.deepEqual(await incoming, { callId, protocol: 1, kind: "voice", from: "calltest-a" });
    caller.emit("call:end", { callId });
    await login("calltest-a", codeA);
    assert.equal((await ice(a.sessionToken)).status, 401);
  });
