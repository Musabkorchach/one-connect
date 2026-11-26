import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import test from "node:test";
import express from "express";
import { Server } from "socket.io";
import { io } from "socket.io-client";
import { mountProductionContext } from "./production-context.js";

test("Production profile HTTP and socket isolation", { timeout: 15000 }, async (t) => {
  const app = express();
  const httpServer = createServer(app);
  const origin = "https://frontend.example.com";
  const legacyToken = "a".repeat(64);
  const legacyProfile = { username: "Reviewer", status: "Testnet only" };
  const legacySocket = new Server(httpServer);
  legacySocket.use((socket, next) => next(socket.handshake.auth.sessionToken === legacyToken ? undefined : new Error("Unauthorized")));
  const data = new Map();
  const key = filter => JSON.stringify(filter._id);
  mountProductionContext({
    app, httpServer, origin,
    profiles: {
      findOne: async filter => data.get(key(filter)),
      findOneAndUpdate: async (filter, update) => {
        const id = key(filter);
        const record = { ...(data.get(id) ?? update.$setOnInsert), ...update.$set };
        data.set(id, record);
        return record;
      },
      updateOne: async (filter, update) => Object.assign(data.get(key(filter)), update.$set),
    },
    verifyFetch: async (url, options) => {
      assert.equal(url, "https://api.minepi.com/v2/me");
      const token = options.headers.Authorization;
      if (token === "Bearer invalid-fixture") return new Response(null, { status: 401 });
      assert.match(token, /^Bearer demo-fixture-[12]$/);
      // These two successful responses test UID isolation, not the Pi token's app provenance.
      return Response.json({ uid: token.slice(-1), username: "Reviewer" });
    },
  });
  app.get("/api/testnet/profile", (req, res) => {
    if (req.get("Authorization") !== "Bearer " + legacyToken) return res.sendStatus(401);
    res.json(legacyProfile);
  });
  httpServer.listen(0, "127.0.0.1");
  await once(httpServer, "listening");
  const base = "http://127.0.0.1:" + httpServer.address().port;
  function request(path, { method = "GET", token, body } = {}) {
    const headers = { Origin: origin };
    if (token) headers.Authorization = "Bearer " + token;
    if (body) headers["Content-Type"] = "application/json";
    return fetch(base + path, { method, headers, body: JSON.stringify(body) });
  }
  async function login(accessToken) {
    return request("/api/production/auth", { method: "POST", body: { accessToken } });
  }
  const sockets = [];
  t.after(() => {
    sockets.forEach(socket => socket.disconnect());
    return legacySocket.close();
  });
  function connect(path, sessionToken, socketOrigin = origin, transports) {
    const socket = io(base, { path, auth: { sessionToken }, extraHeaders: { Origin: socketOrigin }, reconnection: false, transports });
    sockets.push(socket);
    return socket;
  }

  assert.equal((await login("invalid-fixture")).status, 401);
  assert.equal(data.size, 0);
  const firstResponse = await login("demo-fixture-1");
  assert.equal(firstResponse.status, 200);
  assert.equal(firstResponse.headers.get("access-control-allow-origin"), origin);
  const first = await firstResponse.json();
  const second = await (await login("demo-fixture-2")).json();
  assert.equal(first.username, second.username);
  assert.notEqual(first.sessionToken, second.sessionToken);
  assert.equal(data.size, 2);
  assert.equal(first.status, "");
  assert.equal((await request("/api/production/profile", { token: legacyToken })).status, 401);
  assert.equal((await request("/api/testnet/profile", { token: first.sessionToken })).status, 401);
  assert.equal((await request("/api/production/payments", { method: "POST", token: first.sessionToken })).status, 404);

  const legacyRejected = connect("/production/socket.io", legacyToken);
  const productionRejected = connect("/socket.io", first.sessionToken);
  const originRejected = connect("/production/socket.io", first.sessionToken, "https://other.example.com");
  const productionSocket = connect("/production/socket.io", first.sessionToken, origin, ["websocket"]);
  const testnetSocket = connect("/socket.io", legacyToken);
  const [legacyError, productionError] = await Promise.all([
    once(legacyRejected, "connect_error"), once(productionRejected, "connect_error"),
    once(originRejected, "connect_error"), once(productionSocket, "connect"), once(testnetSocket, "connect"),
  ]);
  assert.equal(legacyError[0].message, "Unauthorized");
  assert.equal(productionError[0].message, "Unauthorized");

  const event = once(productionSocket, "profile:updated");
  const edited = await request("/api/production/profile", { method: "PUT", token: first.sessionToken, body: { status: "Production only" } });
  assert.equal(edited.status, 200);
  assert.equal((await event)[0].status, "Production only");
  assert.equal((await (await request("/api/production/profile", { token: second.sessionToken })).json()).status, "");
  assert.equal((await (await request("/api/testnet/profile", { token: legacyToken })).json()).status, "Testnet only");

  const disconnected = once(productionSocket, "disconnect");
  assert.equal((await request("/api/production/logout", { method: "POST", token: first.sessionToken })).status, 204);
  await disconnected;
  assert.equal((await request("/api/production/profile", { token: first.sessionToken })).status, 401);
});
