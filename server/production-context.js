import { randomBytes } from "node:crypto";
import cors from "cors";
import express from "express";
import { Server } from "socket.io";

const lifetime = 60 * 60 * 1000;
const appId = "6b0816fb28dcb2b91021ca03";

export function mountProductionContext({ app, httpServer, origin, profiles, verifyFetch = fetch }) {
  const sessions = new Map();
  const socketServer = new Server(httpServer, {
    path: "/production/socket.io",
    destroyUpgrade: false,
    cors: { origin },
    allowRequest: (req, done) => done(null, req.headers.origin === origin),
  });
  const production = express.Router();
  production.use(cors({ origin }), express.json({ limit: "8kb" }));
  production.use((_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });

  function active(token) {
    const session = sessions.get(token);
    if (!session || session.expiresAt <= Date.now()) return null;
    return session;
  }

  function revoke(token) {
    const session = sessions.get(token);
    if (!session) return;
    clearTimeout(session.timer);
    sessions.delete(token);
    socketServer.in(token).disconnectSockets(true);
  }

  function requireSession(req, res, next) {
    const token = req.get("Authorization")?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
    const session = active(token);
    if (!session) return res.sendStatus(401);
    res.locals.session = session;
    res.locals.token = token;
    next();
  }

  production.post("/auth", async (req, res, next) => {
    const token = req.body?.accessToken;
    if (typeof token !== "string" || !/^[\x21-\x7e]{1,4096}$/.test(token)) return res.sendStatus(401);
    try {
      const reply = await verifyFetch("https://api.minepi.com/v2/me", {
        headers: { Authorization: "Bearer " + token },
        redirect: "error", signal: AbortSignal.timeout(8000),
      });
      if (reply.status === 401 || reply.status === 403) return res.sendStatus(401);
      if (!reply.ok) return res.sendStatus(502);
      const { uid, username } = await reply.json();
      if (typeof uid !== "string" || !uid || uid !== uid.trim() ||
          typeof username !== "string" || !username.trim()) return res.sendStatus(401);
      // Pi's public /me contract identifies the user but does not attest this appId.
      const account = { _id: { appId, uid } };
      const profile = await profiles.findOneAndUpdate(account,
        { $set: { username }, $setOnInsert: { status: "" } },
        { upsert: true, returnDocument: "after" });
      const sessionToken = randomBytes(32).toString("hex");
      const timer = setTimeout(() => revoke(sessionToken), lifetime);
      timer.unref();
      sessions.set(sessionToken, { account, username, expiresAt: Date.now() + lifetime, timer });
      res.json({ sessionToken, username, status: profile.status });
    } catch (error) {
      next(error);
    }
  });

  production.get("/profile", requireSession, async (_req, res, next) => {
    try {
      const { account, username } = res.locals.session;
      const profile = await profiles.findOne(account);
      res.json({ username, status: profile?.status ?? "" });
    } catch (error) {
      next(error);
    }
  });

  production.put("/profile", requireSession, async (req, res, next) => {
    const status = req.body?.status;
    if (typeof status !== "string" || status.length > 140) return res.sendStatus(400);
    try {
      const { account, username } = res.locals.session;
      const profile = { username, status: status.trim() };
      await profiles.updateOne(account, { $set: { status: profile.status } });
      socketServer.in(res.locals.token).emit("profile:updated", profile);
      res.json(profile);
    } catch (error) {
      next(error);
    }
  });

  production.post("/logout", requireSession, (_req, res) => {
    revoke(res.locals.token);
    res.sendStatus(204);
  });
  production.use((_req, res) => res.sendStatus(404));
  production.use((error, _req, res, _next) => {
    res.sendStatus(error.status === 400 || error.status === 413 ? error.status : 502);
  });

  socketServer.use((socket, next) => {
    const token = socket.handshake.auth?.sessionToken;
    if (!active(token)) return next(new Error("Unauthorized"));
    socket.data.sessionToken = token;
    next();
  });
  socketServer.on("connection", (socket) => {
    const token = socket.data.sessionToken;
    if (!active(token)) return socket.disconnect(true);
    socket.join(token);
  });
  app.use("/api/production", production);
}
