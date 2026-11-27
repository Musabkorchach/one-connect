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

test("ordinary integration builds require both dedicated destinations and exclude synthetic mode", async () => {
  const { callIntegrationBuildSettings } = await import("../call-test-build.mjs");
  const api = "https://oneconnect-verified-calls-api.onrender.com";
  const values = {
    NEXT_PUBLIC_CALL_INTEGRATION_MODE: "1", NEXT_PUBLIC_CALL_INTEGRATION_API_URL: api,
    NEXT_PUBLIC_CALL_INTEGRATION_WS_URL: api,
  };
  assert.equal(callIntegrationBuildSettings({}), null);
  assert.deepEqual(callIntegrationBuildSettings(values), { api, socket: api });
  for (const field of ["NEXT_PUBLIC_CALL_INTEGRATION_API_URL", "NEXT_PUBLIC_CALL_INTEGRATION_WS_URL"]) {
    assert.throws(() => callIntegrationBuildSettings({ ...values, [field]: undefined }));
    assert.throws(() => callIntegrationBuildSettings({ ...values, [field]: "https://one-connect.onrender.com" }));
  }
  assert.throws(() => callIntegrationBuildSettings({ ...values, NEXT_PUBLIC_CALL_TEST_MODE: "1" }));
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

async function startMongoFixture(t) {
  const serverPath = join(__dirname, "..", "server");
  const { MongoClient } = createRequire(join(serverPath, "package.json"))("mongodb");
  const directory = await mkdtemp(join(tmpdir(), "oneconnect-call-test-"));
  const mongoPort = await port();
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
  return { serverPath, directory, client, uri };
}

test("isolated server rejects other origins, builds and sessions, and relays calls for the two test users",
  { skip: !process.env.ONE_CONNECT_TEST_MONGOD, timeout: 65000 }, async (t) => {
    const { serverPath, directory, client, uri } = await startMongoFixture(t);
    const apiPort = await port();
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
    const connect = (sessionToken, requestedBuild, requestOrigin = origin, protocol = 1) => {
      const socket = io(base, { autoConnect: false, forceNew: true, reconnection: false,
        extraHeaders: { Origin: requestOrigin }, auth: {
          sessionToken, callTestBuild: requestedBuild, ...(protocol && { verifiedCallProtocol: protocol }),
        } });
      t.after(() => socket.disconnect());
      return socket;
    };
    for (const bad of [connect(a.sessionToken, "wrong_build"), connect(a.sessionToken, build, "https://unrelated.test")]) {
      const error = socketEvent(bad, "connect_error");
      bad.connect();
      assert.ok(await error);
    }
    for (const [modernSession, legacySession, modernUser, legacyUser] of [
      [a, b, "calltest-a", "calltest-b"],
      [b, a, "calltest-b", "calltest-a"],
    ]) {
      const modern = connect(modernSession.sessionToken, build);
      const legacy = connect(legacySession.sessionToken, build, origin, 0);
      const sockets = [modern, legacy];
      const ready = sockets.map((socket) => socketEvent(socket, "connect"));
      const unexpected = [];
      for (const socket of sockets) {
        socket.on("call:incoming", (data) => unexpected.push(data));
        socket.on("call:initiated", (data) => unexpected.push(data));
        socket.connect();
      }
      await Promise.all(ready);
      for (const [source, target, event, to, version] of [
        [modern, legacy, "call:verified-initiate", legacyUser, { protocol: 1 }],
        [legacy, modern, "call:initiate", modernUser, {}],
      ]) {
        const rejected = socketEvent(source, "call:error");
        const update = socketEvent(target, "call:update-required");
        const callId = randomBytes(16).toString("hex");
        source.emit(event, { callId, kind: "voice", to, ...version });
        assert.deepEqual(await rejected, { callId, reason: "call-update-required" });
        assert.deepEqual(await update, { reason: "call-update-required" });
      }
      assert.deepEqual(unexpected, []);
      const disconnected = sockets.map((socket) => socketEvent(socket, "disconnect"));
      for (const socket of sockets) socket.disconnect();
      await Promise.all(disconnected);
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

test("original-app integration verifies Pi identities and isolates HTTP, Socket.IO and MongoDB",
  { skip: !process.env.ONE_CONNECT_TEST_MONGOD, timeout: 65000 }, async (t) => {
    const { serverPath, directory, client, uri } = await startMongoFixture(t);
    const { callIntegrationSettings } = await import("../server/call-test-settings.js");
    const settings = {
      ONECONNECT_CALL_INTEGRATION: "1", CALL_TEST_FRONTEND_ORIGIN: origin,
      CALL_TEST_DATABASE: database, CALL_TEST_MONGODB_URI: uri,
    };
    assert.equal(callIntegrationSettings({}, false), null);
    assert.throws(() => callIntegrationSettings(settings, true));
    for (const extra of [{ ONECONNECT_CALL_TEST: "1" }, { MONGODB_URI: uri }, { CALL_TEST_CODE_A: codeA },
      { CALL_TEST_DATABASE: "oneconnect" }, { CALL_TEST_FRONTEND_ORIGIN: "https://oneconnect1066.pinet.com" }]) {
      assert.throws(() => callIntegrationSettings({ ...settings, ...extra }, false));
    }
    const wrongDatabase = spawn(process.execPath, [join(serverPath, "server.js")], {
      cwd: directory, env: { SystemRoot: process.env.SystemRoot, ...settings,
        CALL_TEST_MONGODB_URI: uri.replace("/" + database, "/oneconnect") },
      stdio: ["ignore", "ignore", "pipe"], windowsHide: true,
    });
    let error = "";
    wrongDatabase.stderr.setEncoding("utf8").on("data", (chunk) => { error += chunk; });
    t.after(() => wrongDatabase.kill());
    assert.equal(await new Promise((resolve, reject) => {
      wrongDatabase.once("error", reject).once("close", resolve);
    }), 1);
    assert.match(error, /MongoDB URI must name its assigned test database/);
    const apiPort = await port();
    const bootstrap = `
      globalThis.fetch = async (url, options) => {
        if (url !== "https://api.minepi.com/v2/me") throw new Error("Unexpected external request");
        const token = options.headers.Authorization;
        if (!["Bearer fixture-a", "Bearer fixture-b"].includes(token)) return new Response(null, { status: 401 });
        const name = token.endsWith("-a") ? "pi-fixture-a" : "pi-fixture-b";
        return Response.json({ uid: name + "-uid", username: name });
      };
    `;
    const server = spawn(process.execPath, [
      "--import", "data:text/javascript;base64," + Buffer.from(bootstrap).toString("base64"), join(serverPath, "server.js"),
    ], {
      cwd: directory, env: { SystemRoot: process.env.SystemRoot, ...settings, PORT: String(apiPort),
        PI_TESTNET_SUBSCRIPTION_SERVICE_ID: "460" },
      stdio: ["ignore", "ignore", "inherit"], windowsHide: true,
    });
    t.after(() => server.kill());
    const base = `http://127.0.0.1:${apiPort}`;
    const health = await until(() => fetch(base + "/health"), server);
    assert.deepEqual(await health.json(), { mode: "call-integration", protocol: 1 });
    const post = (path, accessToken, requestOrigin = origin) => fetch(base + path, {
      method: "POST", headers: { Origin: requestOrigin, "Content-Type": "application/json" },
      body: JSON.stringify({ accessToken }),
    });
    assert.equal((await post("/api/auth/verify", "fixture-a", "https://unrelated.test")).status, 403);
    assert.equal((await post("/api/auth/verify", "invalid")).status, 401);
    for (const path of ["/api/call-test/login", "/api/pi-testnet/subscription/prepare", "/api/calls/pstn/prepare",
      "/api/emails/external", "/api/emails/external/inbound"]) {
      assert.equal((await post(path, "fixture-a")).status, 404, path);
    }
    const sessions = [];
    for (const token of ["fixture-a", "fixture-b"]) {
      const response = await post("/api/auth/verify", token);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("access-control-allow-origin"), origin);
      sessions.push(await response.json());
    }
    assert.equal(await client.db(database).collection("email_users").countDocuments(), 2);
    assert.deepEqual(await client.db("oneconnect").listCollections().toArray(), []);
    const connect = (sessionToken, requestOrigin) => {
      const socket = io(base, { autoConnect: false, forceNew: true, reconnection: false,
        extraHeaders: { Origin: requestOrigin }, auth: { sessionToken, verifiedCallProtocol: 1 } });
      t.after(() => socket.disconnect());
      return socket;
    };
    const [a, b] = sessions.map(({ sessionToken }) => connect(sessionToken, origin));
    const foreignSocket = connect(sessions[0].sessionToken, "https://unrelated.test");
    const rejected = socketEvent(foreignSocket, "connect_error");
    foreignSocket.connect();
    await rejected;
    const ready = [a, b].map((socket) => socketEvent(socket, "connect"));
    a.connect();
    b.connect();
    await Promise.all(ready);
    const callId = randomBytes(16).toString("hex");
    const incoming = socketEvent(b, "call:incoming");
    a.emit("call:verified-initiate", { callId, protocol: 1, kind: "voice", to: "pi-fixture-b" });
    assert.deepEqual(await incoming, { callId, protocol: 1, kind: "voice", from: "pi-fixture-a" });
  });
