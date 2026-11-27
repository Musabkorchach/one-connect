const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { setTimeout: delay } = require("node:timers/promises");
const { test } = require("node:test");
const ts = require("typescript");

function load(file, dependencies = {}) {
  const { outputText } = ts.transpileModule(readFileSync(join(__dirname, "..", file), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  });
  const exports = {};
  new Function("require", "exports", outputText)((name) => {
    assert.ok(name in dependencies, name);
    return dependencies[name];
  }, exports);
  return exports;
}

const identity = load("lib/connect/call-identity.ts");
const ice = load("lib/connect/call-ice-statistics.ts");
const binding = {
  callId: "aa".repeat(16), challenge: "bb".repeat(16), caller: "alice", recipient: "bob", kind: "video",
};
const sdp = "v=0\r\na=fingerprint:sha-256 AA:BB\r\n";
const keyPair = () => crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, false, ["sign", "verify"]);

test("ICE diagnostics prefer the selected pair and expose only candidate types, state and bytes", () => {
  const report = new Map([
    ["transport", { type: "transport", selectedCandidatePairId: "pair" }],
    ["other", { type: "candidate-pair", state: "succeeded", nominated: true }],
    ["pair", { type: "candidate-pair", localCandidateId: "local", remoteCandidateId: "remote", bytesSent: 0, bytesReceived: 171 }],
    ["local", { type: "local-candidate", candidateType: "relay", address: "192.0.2.1", usernameFragment: "sensitive" }],
    ["remote", { type: "remote-candidate", candidateType: "srflx", address: "192.0.2.2", url: "turn:example.invalid" }],
  ]);
  assert.deepEqual(ice.selectIceStatistics(report, "connected"), {
    source: "selected", connectionState: "connected", local: "relay", remote: "srflx", bytesSent: 0, bytesReceived: 171,
  });
});

test("ICE diagnostics label a unique nominated pair, reject ambiguous reports and preserve missing counters", () => {
  const pair = { type: "candidate-pair", localCandidateId: "local", state: "succeeded", nominated: true };
  const report = new Map([
    ["pair", pair],
    ["local", { type: "local-candidate", candidateType: "host" }],
  ]);
  assert.deepEqual(ice.selectIceStatistics(report, "connected"), {
    source: "nominated", connectionState: "connected", local: "host", remote: null, bytesSent: null, bytesReceived: null,
  });
  assert.equal(ice.selectIceStatistics(report, "disconnected"), null);
  report.set("another", pair);
  assert.equal(ice.selectIceStatistics(report, "connected"), null);
  report.set("transport", { type: "transport", selectedCandidatePairId: "missing" });
  assert.equal(ice.selectIceStatistics(report, "connected"), null);
  report.set("transport", { type: "transport", selectedCandidatePairId: "pair" });
  report.set("another-transport", { type: "transport", selectedCandidatePairId: "another" });
  assert.equal(ice.selectIceStatistics(report, "connected"), null);
});

test("reading ICE diagnostics rejects failed or stalled getStats calls", async () => {
  const failure = new Error("test failure");
  await assert.rejects(ice.readIceStatistics({ getStats: async () => { throw failure; } }), failure);
  await assert.rejects(ice.readIceStatistics({ getStats: () => new Promise(() => {}) }, 5), /ice-statistics-timeout/);
});

test("test safety settings distinguish self, code and storage failures and save either hyphenated peer", () => {
  const stored = new Map();
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  let blocked = false;
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem: (key) => stored.get(key) ?? null,
    setItem(key, value) {
      if (blocked) throw new DOMException("Site storage blocked", "SecurityError");
      stored.set(key, value);
    },
  } });
  const element = (type, props) => ({ type, props });
  function find(node, predicate) {
    if (!node || typeof node !== "object") return undefined;
    if (predicate(node)) return node;
    for (const child of [node.props?.children].flat()) {
      const match = find(child, predicate);
      if (match) return match;
    }
  }
  function submit(username, testPeer, enteredPeer, code, confirmed = true) {
    const state = ["", enteredPeer, code, confirmed, "", false, false];
    let index = 0;
    const { CallSafetySettings } = load("components/connect/call-safety-settings.tsx", {
      react: { useState: () => {
        const slot = index++;
        return [state[slot], (value) => { state[slot] = value; }];
      } },
      "react/jsx-runtime": { jsx: element, jsxs: element },
      "@/lib/connect/call-identity": identity,
    });
    const tree = CallSafetySettings({ username, testPeer });
    const input = find(tree, (node) => node.type === "input");
    if (testPeer !== undefined) {
      assert.equal(input.props.value, testPeer);
      assert.equal(input.props.readOnly, true);
    }
    find(tree, (node) => node.type === "form").props.onSubmit({ preventDefault() {} });
    return state[4];
  }
  try {
    const code = "ab".repeat(32);
    assert.equal(identity.validCallName("calltest-a"), true);
    assert.equal(identity.validCallName("calltest-b"), true);
    assert.match(submit("calltest-b", undefined, "calltest-b", code), /Enter a valid Pi username/);
    assert.match(submit("calltest-b", "calltest-b", "", code), /Invalid test peer/);
    assert.match(submit("calltest-b", "calltest-a", "", "ab"), /64-character/);
    assert.match(submit("calltest-b", "calltest-a", "", "z".repeat(64)), /hexadecimal/);
    assert.equal(submit("calltest-b", "calltest-a", "", code, false), "");
    blocked = true;
    assert.match(submit("calltest-b", "calltest-a", "", code), /browser storage/);
    assert.equal(stored.size, 0);
    blocked = false;
    assert.match(submit("calltest-b", "calltest-a", "calltest-b", code), /saved for @calltest-a/);
    assert.match(submit("calltest-a", "calltest-b", "", code), /saved for @calltest-b/);
    assert.equal(identity.getCallPin("calltest-b", "calltest-a"), code);
    assert.equal(identity.getCallPin("calltest-a", "calltest-b"), code);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "localStorage", descriptor);
    else delete globalThis.localStorage;
  }
});

test("peer proof binds exact SDP, call, recipient challenge, participants, role and media kind", async () => {
  const alice = await keyPair();
  const bob = await keyPair();
  const pin = await identity.callSafetyCode(alice.publicKey);
  assert.equal(alice.privateKey.extractable, false);
  await assert.rejects(crypto.subtle.exportKey("pkcs8", alice.privateKey));
  const signed = await identity.signCallDescription(alice, binding, "offer", sdp);
  assert.deepEqual(await identity.verifyCallDescription(signed, binding, "offer", pin), { type: "offer", sdp });
  const alteredBindings = {
    callId: "cc".repeat(16), challenge: "dd".repeat(16), caller: "eve", recipient: "mallory", kind: "voice",
  };
  for (const [field, value] of Object.entries(alteredBindings)) {
    await assert.rejects(identity.verifyCallDescription(signed, { ...binding, [field]: value }, "offer", pin), field);
  }
  await assert.rejects(identity.verifyCallDescription({ ...signed, sdp: sdp.replace("AA", "CC") }, binding, "offer", pin));
  await assert.rejects(identity.verifyCallDescription({ ...signed, type: "answer" }, binding, "answer", pin));
  await assert.rejects(identity.verifyCallDescription({ ...signed, signature: "00".repeat(64) }, binding, "offer", pin));
  const replacement = await identity.signCallDescription(bob, binding, "offer", sdp);
  await assert.rejects(identity.verifyCallDescription(replacement, binding, "offer", pin));
  assert.deepEqual(await identity.verifyCallDescription(
    replacement, binding, "offer", await identity.callSafetyCode(bob.publicKey),
  ), { type: "offer", sdp });
});

async function callFixture({ paired = true, direction = "outgoing", keyError } = {}) {
  const alice = await keyPair();
  const bob = await keyPair();
  const handlers = new Map();
  const sent = [];
  const track = { kind: "audio" };
  const stream = { getTracks: () => [track] };
  let captures = 0;
  let remoteDescriptions = 0;
  let connected = 0;
  let ringing = 0;
  let ended;
  let onConnectionState;
  const sender = {
    track: null,
    async replaceTrack(next) { this.track = next; },
  };
  const peer = {
    connectionState: "new",
    createOffer: async () => ({ type: "offer", sdp }),
    createAnswer: async () => ({ type: "answer", sdp }),
    async setLocalDescription(description) { this.localDescription = description; },
    addTransceiver(kind) { assert.equal(kind, "audio"); return { sender }; },
    getTransceivers: () => [{ receiver: { track }, sender }],
    close() {},
  };
  const outgoing = direction === "outgoing";
  const pin = paired ? await identity.callSafetyCode((outgoing ? bob : alice).publicKey) : null;
  const { CallSession } = load("lib/connect/call-session.ts", {
    "./call-ice-statistics": load("lib/connect/call-ice-statistics.ts"),
    "./call-identity": { ...identity, getCallDevice: async () => {
      if (keyError) throw new identity.CallKeyError(keyError);
      return outgoing ? alice : bob;
    }, getCallPin: () => pin },
    "@/lib/api-client": {
      VERIFIED_CALL_PROTOCOL: 1,
      getCallConfiguration: async () => ({}),
      onCallEvent(name, handler) { handlers.set(name, handler); return () => handlers.delete(name); },
      sendCallEvent(name, data) { sent.push({ name, data }); return true; },
    },
    "./call-media": {
      async openCallMedia() { captures++; return stream; },
      stopCallMedia() {},
      createCallPeer(local, options, callbacks, prepare) {
        onConnectionState = callbacks.onConnectionState;
        prepare(peer, local);
        return peer;
      },
      createRemoteSignalQueue: () => ({
        async setDescription() { remoteDescriptions++; },
      }),
    },
  });
  const session = new CallSession({
    callId: binding.callId, ownUsername: outgoing ? "alice" : "bob",
    username: outgoing ? "bob" : "alice", direction,
    kind: "video", configuration: {},
    onConnecting() {}, onRinging() { ringing++; }, onConnected() { connected++; }, onLocalStream() {}, onRemoteStream() {},
    onEnd(reason) { ended = reason; },
  });
  return {
    session, sent, sender, track, alice, bob,
    state: () => ({ captures, remoteDescriptions, connected, ended, ringing }),
    emit: (name, data) => handlers.get(name)?.({ callId: binding.callId, ...data }),
    connect() { peer.connectionState = "connected"; onConnectionState("connected"); },
  };
}

async function waitFor(predicate) {
  const deadline = performance.now() + 7000;
  while (!predicate() && performance.now() < deadline) await delay(10);
  assert.ok(predicate());
}

test("caller sends no tracks and displays no verified state before checking the answer and connecting", async () => {
  const fixture = await callFixture();
  await fixture.session.start();
  assert.equal(fixture.state().captures, 0);
  assert.equal(fixture.state().ringing, 0);
  fixture.emit("call:initiated", { protocol: 1 });
  assert.equal(fixture.state().ringing, 1);
  assert.equal(fixture.state().captures, 0);
  fixture.emit("call:accepted", { challenge: binding.challenge });
  await waitFor(() => fixture.sent.some(({ name }) => name === "call:offer"));
  fixture.emit("call:connected");
  assert.equal(fixture.sender.track, null);
  assert.equal(fixture.state().connected, 0);

  const answer = await identity.signCallDescription(fixture.bob, binding, "answer", sdp);
  fixture.emit("call:answered", { answer });
  await waitFor(() => fixture.state().remoteDescriptions === 1);
  assert.equal(fixture.sender.track, null);
  fixture.connect();
  await waitFor(() => fixture.sent.some(({ name }) => name === "call:connected"));
  assert.equal(fixture.sender.track, fixture.track);
  fixture.emit("call:connected");
  assert.equal(fixture.state().connected, 1);
  fixture.emit("call:answered", { answer });
  await waitFor(() => fixture.state().ended === "verification-failed");
  assert.equal(fixture.state().remoteDescriptions, 1);
});

test("an unpaired call never captures media and a tampered answer never reaches WebRTC", async () => {
  const unpaired = await callFixture({ paired: false });
  await assert.rejects(unpaired.session.start());
  assert.equal(unpaired.state().captures, 0);
  assert.equal(unpaired.state().ended, "verification-failed");

  const fixture = await callFixture();
  await fixture.session.start();
  fixture.emit("call:initiated", { protocol: 1 });
  fixture.emit("call:accepted", { challenge: binding.challenge });
  await waitFor(() => fixture.sent.some(({ name }) => name === "call:offer"));
  const answer = await identity.signCallDescription(fixture.bob, binding, "answer", sdp);
  fixture.emit("call:answered", { answer: { ...answer, sdp: sdp + "tampered" } });
  await waitFor(() => fixture.state().ended === "verification-failed");
  assert.equal(fixture.state().remoteDescriptions, 0);
  assert.equal(fixture.sender.track, null);
});

test("callee rejects an old offer for the same call ID before applying SDP or attaching tracks", async () => {
  const fixture = await callFixture({ direction: "incoming" });
  await fixture.session.start();
  const { challenge } = fixture.sent.find(({ name }) => name === "call:accept").data;
  assert.match(challenge, /^[a-f0-9]{32}$/);
  assert.notEqual(challenge, binding.challenge);
  const oldOffer = await identity.signCallDescription(fixture.alice, binding, "offer", sdp);
  fixture.emit("call:offer", { offer: oldOffer });
  await waitFor(() => fixture.state().ended === "verification-failed");
  assert.equal(fixture.state().remoteDescriptions, 0);
  assert.equal(fixture.sender.track, null);
  assert.equal(fixture.sent.some(({ name }) => name === "call:answer"), false);
});

test("blocked, failed and timed-out IndexedDB opens can be retried without touching device keys", async () => {
  const requests = [];
  const original = Object.getOwnPropertyDescriptor(globalThis, "indexedDB");
  Object.defineProperty(globalThis, "indexedDB", {
    configurable: true, value: { open() { const request = {}; requests.push(request); return request; } },
  });
  try {
    const unavailable = { reason: "call-storage-unavailable" };
    const blocked = identity.openCallKeyStore();
    requests[0].onblocked();
    await assert.rejects(blocked, unavailable);
    const failed = identity.openCallKeyStore();
    requests[1].onerror();
    await assert.rejects(failed, unavailable);
    await assert.rejects(identity.openCallKeyStore(10), unavailable);
    let closed = false;
    requests[2].result = { close() { closed = true; } };
    requests[2].onsuccess();
    assert.equal(closed, true);
    const retry = identity.openCallKeyStore();
    const database = {};
    requests[3].result = database;
    requests[3].onsuccess();
    assert.equal(await retry, database);
  } finally {
    if (original) Object.defineProperty(globalThis, "indexedDB", original);
    else delete globalThis.indexedDB;
  }
});

test("missing or unavailable keys stop the call before signaling and media capture", async () => {
  for (const reason of ["call-device-missing", "call-storage-unavailable"]) {
    const fixture = await callFixture({ keyError: reason });
    await assert.rejects(fixture.session.start(), { reason });
    assert.equal(fixture.state().ended, reason);
    assert.equal(fixture.state().captures, 0);
    assert.equal(fixture.sent.some(({ name }) => name === "call:verified-initiate"), false);
  }
});

test("reading a missing device key never opens a write transaction", async () => {
  const descriptors = Object.fromEntries(["indexedDB", "isSecureContext"].map((name) =>
    [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  let stored;
  const database = {
    transaction(store, mode) {
      assert.equal(store, "devices");
      assert.equal(mode, undefined);
      return { objectStore: () => ({ get() {
        const request = { result: stored };
        queueMicrotask(() => request.onsuccess());
        return request;
      } }) };
    },
    close() {},
  };
  Object.defineProperty(globalThis, "isSecureContext", { configurable: true, value: true });
  Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: {
    open() {
      const request = { result: database };
      queueMicrotask(() => request.onsuccess());
      return request;
    },
  } });
  try {
    await assert.rejects(identity.getCallDevice("alice"), { reason: "call-device-missing" });
    stored = await keyPair();
    assert.equal(await identity.getCallDevice("alice"), stored);
    assert.equal(await identity.getCallDevice("alice", true), stored);
  } finally {
    for (const [name, descriptor] of Object.entries(descriptors)) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  }
});

test("an explicit device-code request creates one non-exportable private key and reuses it", async () => {
  const descriptors = ["indexedDB", "isSecureContext"].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
  let stored;
  let writes = 0;
  const database = {
    transaction(_store, mode) {
      const transaction = { objectStore: () => ({
        get() {
          const request = { result: stored };
          queueMicrotask(() => request.onsuccess());
          return request;
        },
        add(key) {
          assert.equal(mode, "readwrite");
          assert.equal(stored, undefined);
          stored = key;
          writes++;
          queueMicrotask(() => transaction.oncomplete());
          return {};
        },
      }) };
      return transaction;
    },
    close() {},
  };
  Object.defineProperty(globalThis, "isSecureContext", { configurable: true, value: true });
  Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: {
    open() {
      const request = { result: database };
      queueMicrotask(() => request.onsuccess());
      return request;
    },
  } });
  try {
    const first = await identity.getCallDevice("alice", true);
    assert.equal(first.privateKey.extractable, false);
    const code = await identity.callSafetyCode(first.publicKey);
    assert.ok(identity.validSafetyCode(code));
    assert.equal(await identity.callSafetyCode((await identity.getCallDevice("alice", true)).publicKey), code);
    assert.equal(writes, 1);
  } finally {
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});

test("incompatible or missing signaling confirmation never rings or captures media", async () => {
  const incompatible = await callFixture();
  await incompatible.session.start();
  incompatible.emit("call:initiated", {});
  assert.equal(incompatible.state().ended, "call-update-required");
  assert.equal(incompatible.state().ringing, 0);
  assert.equal(incompatible.state().captures, 0);
  assert.equal(incompatible.sent[0].name, "call:verified-initiate");
  assert.equal(incompatible.sent.some(({ name }) => name === "call:initiate"), false);

  const oldServer = await callFixture();
  await oldServer.session.start();
  await waitFor(() => oldServer.state().ended === "call-update-required");
  assert.equal(oldServer.state().ringing, 0);
  assert.equal(oldServer.state().captures, 0);
});

test("server rejects legacy callers and invites only compatible recipient sockets", async () => {
  const { selectVerifiedCallSockets, VERIFIED_CALL_PROTOCOL } = await import("../server/verified-call-protocol.js");
  const old = { handshake: { auth: {} } };
  const current = { handshake: { auth: { verifiedCallProtocol: VERIFIED_CALL_PROTOCOL } } };
  assert.equal(selectVerifiedCallSockets(true, 1, 1, [current]), null);
  assert.equal(selectVerifiedCallSockets(false, 0, 1, [current]), null);
  assert.equal(selectVerifiedCallSockets(false, 1, undefined, [current]), null);
  assert.deepEqual(selectVerifiedCallSockets(false, 1, 1, [old]), []);
  assert.deepEqual(selectVerifiedCallSockets(false, 1, 1, [old, current]), [current]);
});
