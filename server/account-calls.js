import { accountWrites } from "./account-write-fence.js";
import { createHash } from "node:crypto";
import { ObjectId } from "mongodb";
import { migrationRequired } from "./pi-login.js";
import { accountBinding, terminateAccountPstn } from "./pstn-account.js";
import { identityBindingsCollection } from "./account-identity.js";

const callRoom = (id) => "calls:account:" + id;
const peerKey = (callId, accountId) => createHash("sha256").update(JSON.stringify([callId, accountId])).digest("hex");
const validCallId = (id) => typeof id === "string" && /^[a-zA-Z0-9_-]{16,80}$/.test(id);
const validGroupId = (id) => typeof id === "string" && /^[0-9a-f]{24}$/.test(id);
function description(value, type) {
  return value && value.type === type && typeof value.sdp === "string" && value.sdp.length > 0 && value.sdp.length <= 100000
    ? { type, sdp: value.sdp } : null;
}
function ice(value) {
  if (!value || typeof value.candidate !== "string" || value.candidate.length > 8192 ||
      (value.sdpMid != null && (typeof value.sdpMid !== "string" || value.sdpMid.length > 256)) ||
      (value.sdpMLineIndex != null && (!Number.isInteger(value.sdpMLineIndex) || value.sdpMLineIndex < 0 || value.sdpMLineIndex > 65535)) ||
      (value.usernameFragment != null && (typeof value.usernameFragment !== "string" || value.usernameFragment.length > 256))) return null;
  return { candidate: value.candidate, sdpMid: value.sdpMid ?? null, sdpMLineIndex: value.sdpMLineIndex ?? null,
    ...(value.usernameFragment != null ? { usernameFragment: value.usernameFragment } : {}) };
}

export async function createAccountCalls({ app, io, db, writeAccount, userSessions, authenticateSession, normalizeMessagingUsername }) {
  const namespace = io.of("/calls");
  const live = new Map();
  const busy = new Map();
  const logs = db.collection("account_call_logs");
  const memberships = db.collection("account_chat_groups");
  const bindings = db.collection(identityBindingsCollection);
  await logs.createIndex({ participantAccountIds: 1, startedAt: -1 });
  const binding = (id) => accountBinding(db, id);
  const group = (id) => memberships.findOne({ _id: new ObjectId(id), state: "active" });

  function requireCallsSession(req, res, next) {
    return authenticateSession(req, res, async () => {
      try {
        if (!req.user.accountId) return res.status(409).json(migrationRequired);
        const account = await binding(req.user.accountId);
        if (account?.state !== "active") return res.status(403).json({
          code: account?.state === "deleting" ? "ACCOUNT_DELETING" : "ACCOUNT_INACTIVE",
          error: "Account is not active",
        });
        next();
      } catch (error) { next(error); }
    });
  }

  app.get("/api/calls/history", requireCallsSession, async (req, res, next) => {
    try {
      const entries = await logs.find({ participantAccountIds: req.user.accountId }, {
        projection: { _id: 0, callId: 1, kind: 1, groupId: 1, startedAt: 1, endedAt: 1, reason: 1 },
      }).sort({ startedAt: -1 }).limit(200).toArray();
      res.set("Cache-Control", "private, no-store");
      if ((await binding(req.user.accountId))?.state !== "active") return res.sendStatus(403);
      res.json({ calls: entries, legacyHistory: migrationRequired });
    } catch (error) { next(error); }
  });

  function deliver(call, id, event, payload, joinedOnly = false) {
    const participant = call.participants.get(id);
    if (participant) namespace.to(participant.socketId).emit(event, payload);
    else if (!joinedOnly) namespace.to(callRoom(id)).emit(event, payload);
  }

  async function finish(call, reason) {
    if (live.get(call.id) !== call) return;
    live.delete(call.id);
    clearTimeout(call.timer);
    for (const id of call.audience) if (busy.get(id) === call.id) busy.delete(id);
    await Promise.all([...call.audience].map(async (id) => {
      if ((await binding(id))?.state !== "active") return;
      if (call.groupId && !(await group(call.groupId))?.memberAccountIds.includes(id)) return;
      deliver(call, id, call.groupId ? "group-call:ended" : "call:ended", { callId: call.id, reason });
    }));
    if (await call.logReady?.then(() => true, () => false)) {
      await logs.updateOne({ _id: call.logId }, { $set: { endedAt: Date.now(), reason } });
    }
  }

  async function endInternal(accountId) {
    await Promise.all([...live.values()].filter((call) => call.participants.has(accountId) ||
      (!call.groupId && call.audience.has(accountId))).map((call) => finish(call, "account-unavailable")));
    namespace.in(callRoom(accountId)).disconnectSockets();
  }
  async function endForDeletion(accountId, completeCall, ownsLease = async () => true) {
    if ((await binding(accountId))?.state !== "deleting") return;
    if (!await ownsLease()) throw new Error("Deletion lease expired");
    await Promise.all([endInternal(accountId), terminateAccountPstn(db, accountId, completeCall, ownsLease)]);
  }

  function arm(call, milliseconds, reason) {
    clearTimeout(call.timer);
    call.timer = setTimeout(() => void finish(call, reason).catch(report), milliseconds);
    call.timer.unref();
  }
  const report = (error) => console.error("[ACCOUNT CALL ERROR]", error?.name ?? "Error");
  const payloadForGroup = (call) => ({
    callId: call.id, groupId: call.groupId, groupName: call.groupName, kind: call.kind,
    participants: [...call.participants].map(([id, participant]) => ({ peerId: peerKey(call.id, id), username: participant.username })),
  });

  namespace.use(async (socket, next) => {
    const token = socket.handshake.auth?.sessionToken;
    const session = typeof token === "string" && userSessions.get(token);
    if (!session?.accountId || session.expiresAt <= Date.now()) return next(new Error("Invalid session"));
    try {
      if ((await binding(session.accountId))?.state !== "active") return next(new Error("Account is not active"));
      socket.data.sessionToken = token;
      next();
    } catch (error) { report(error); next(new Error("Calls are unavailable")); }
  });
  namespace.on("connection", (socket) => {
    const token = socket.data.sessionToken;
    const session = userSessions.get(token);
    if (!session?.accountId || session.expiresAt <= Date.now()) return socket.disconnect();
    const id = session.accountId;
    const username = session.piUsername;
    const here = () => socket.connected && userSessions.get(token) === session && session.expiresAt > Date.now();
    const participant = () => ({ socketId: socket.id, username });
    socket.join(callRoom(id));
    const expiry = setTimeout(() => socket.disconnect(), session.expiresAt - Date.now());
    expiry.unref();

    const on = (event, handler) => socket.on(event, async (data) => {
      if (!here()) return;
      try {
        if ((await binding(id))?.state !== "active") {
          socket.emit(event.startsWith("group-call:") ? "group-call:error" : "call:error", { reason: "account-unavailable" });
          await endInternal(id);
          return;
        }
        if (here() && data && typeof data === "object") await handler(data);
      } catch (error) { report(error); }
    });
    async function canSignal(call, target, requiredSocket = true) {
      if (!call || !call.audience.has(id) || (requiredSocket && call.participants.get(id)?.socketId !== socket.id)) return false;
      const roster = call.groupId ? (await group(call.groupId))?.memberAccountIds : [...call.audience];
      if (!roster?.includes(id) || !roster.includes(target)) return false;
      if ((await binding(target))?.state !== "active") {
        await endInternal(target);
        return false;
      }
      const actor = await binding(id);
      return actor?.state === "active" && here() && live.get(call.id) === call;
    }
    async function initiate(data, isGroup) {
      const errorEvent = isGroup ? "group-call:error" : "call:error";
      const reject = (reason) => socket.emit(errorEvent, { callId: data.callId, reason });
      if (!validCallId(data.callId) || !["voice", "video"].includes(data.kind)) return reject("invalid");
      let members;
      let groupRecord;
      if (isGroup) {
        if (!validGroupId(data.groupId)) return reject("invalid");
        groupRecord = await group(data.groupId);
        if (!groupRecord?.memberAccountIds.includes(id)) return reject("not-member");
        members = groupRecord.memberAccountIds;
      } else {
        const target = normalizeMessagingUsername(data.to);
        if (!target) return reject("invalid");
        const result = await bindings.find({ username: target, state: "active" }).limit(2).toArray();
        const peer = result.length === 1 ? result[0].accountId : null;
        if (!peer || peer === id || !namespace.adapter.rooms.get(callRoom(peer))?.size) return reject("offline");
        members = [id, peer];
      }
      if (!here() || (await binding(id))?.state !== "active") return reject("account-unavailable");
      if (live.has(data.callId) || (isGroup
        ? busy.has(id) || [...live.values()].some((existing) => existing.groupId === data.groupId)
        : members.some((member) => busy.has(member)))) return reject("busy");
      const call = { id: data.callId, logId: new ObjectId(), callerId: id, kind: data.kind,
        audience: new Set(members), participants: new Map([[id, participant()]]), phase: "ringing",
        links: new Map(), connected: new Set(),
        ...(isGroup ? { groupId: data.groupId, groupName: groupRecord.name } : {}) };
      live.set(call.id, call);
      for (const member of isGroup ? [id] : members) busy.set(member, call.id);
      // Create the log before publishing any call information.
      try {
        call.logReady = accountWrites(logs, writeAccount, isGroup ? id : members).insertOne({ _id: call.logId, callId: call.id, kind: call.kind, groupId: call.groupId,
          startedAt: Date.now(), participantAccountIds: isGroup ? [id] : members });
        await call.logReady;
      } catch (error) { await finish(call, "server-error"); throw error; }
      if ((await binding(id))?.state !== "active" || !here() || live.get(call.id) !== call) return finish(call, "account-unavailable");
      arm(call, 45000, "no-answer");
      socket.emit(isGroup ? "group-call:started" : "call:initiated", isGroup ? payloadForGroup(call) : { callId: call.id });
      for (const target of members) {
        if (target === id || !await canSignal(call, target)) continue;
        deliver(call, target, isGroup ? "group-call:incoming" : "call:incoming",
          isGroup ? payloadForGroup(call) : { callId: call.id, from: username, kind: call.kind });
      }
    }
    on("call:initiate", (data) => initiate(data, false));
    on("group-call:start", (data) => initiate(data, true));

    async function join(data, isGroup) {
      const call = live.get(data.callId);
      const errorEvent = isGroup ? "group-call:error" : "call:error";
      if (!call || Boolean(call.groupId) !== isGroup || id === call.callerId ||
          !await canSignal(call, call.callerId, false)) return socket.emit(errorEvent, { callId: data.callId, reason: "unavailable" });
      if (call.participants.has(id) || (isGroup ? busy.has(id) || call.participants.size >= 6 : call.phase !== "ringing")) return;
      call.participants.set(id, participant());
      busy.set(id, call.id);
      call.phase = "connecting";
      if (isGroup) {
        clearTimeout(call.timer);
        await accountWrites(logs, writeAccount, [id, call.callerId]).updateOne({ _id: call.logId }, { $addToSet: { participantAccountIds: id } });
        for (const member of call.participants.keys()) {
          if (await canSignal(call, member)) deliver(call, member, member === id ? "group-call:joined" : "group-call:participant-joined", payloadForGroup(call), true);
        }
      } else {
        arm(call, 30000, "connection-timeout");
        socket.to(callRoom(id)).emit("call:ended", { callId: call.id, reason: "answered-elsewhere" });
        socket.emit("call:accepted", { callId: call.id });
        deliver(call, call.callerId, "call:accepted", { callId: call.id }, true);
      }
    }
    on("call:accept", (data) => join(data, false));
    on("group-call:join", (data) => join(data, true));

    async function relay(data, kind, isGroup) {
      const call = live.get(data.callId);
      if (!call || Boolean(call.groupId) !== isGroup) return;
      const target = [...call.participants.keys()].find((peer) => peer !== id && (!isGroup || peerKey(call.id, peer) === data.toPeerId));
      if (!target || !await canSignal(call, target)) return;
      const base = { callId: call.id, ...(isGroup ? { fromPeerId: peerKey(call.id, id) } : {}) };
      const type = isGroup ? data.description?.type : kind;
      const desc = description(isGroup ? data.description : data[kind], type);
      const candidate = ice(data.candidate);
      if (kind === "ice" || (isGroup && !data.description)) {
        if (candidate) deliver(call, target, isGroup ? "group-call:signal" : "call:ice-candidate", { ...base, candidate }, true);
        return;
      }
      if (!["offer", "answer"].includes(type) || !desc || (!isGroup && call.phase !== "connecting")) return;
      const pair = [id, target].sort().join(":");
      const link = call.links.get(pair);
      if (type === "offer") {
        const offerer = isGroup ? [...call.participants.keys()].indexOf(id) > [...call.participants.keys()].indexOf(target) : id === call.callerId;
        if (!offerer || link) return;
        call.links.set(pair, { from: id, to: target, answered: false });
      } else {
        if (link?.to !== id || link.from !== target || link.answered) return;
        link.answered = true;
      }
      deliver(call, target, isGroup ? "group-call:signal" : "call:" + (type === "answer" ? "answered" : "offer"),
        { ...base, [isGroup ? "description" : type]: desc }, true);
    }
    on("call:offer", (data) => relay(data, "offer", false));
    on("call:answer", (data) => relay(data, "answer", false));
    on("call:ice-candidate", (data) => relay(data, "ice", false));
    on("group-call:signal", (data) => relay(data, "signal", true));

    on("call:connected", async (data) => {
      const call = live.get(data.callId);
      if (!call || call.groupId || call.phase !== "connecting" || ![...call.links.values()].some((link) => link.answered)) return;
      const target = [...call.participants.keys()].find((peer) => peer !== id);
      if (!target || !await canSignal(call, target)) return;
      call.connected.add(id);
      if (call.connected.size !== 2) return;
      call.phase = "active";
      clearTimeout(call.timer);
      for (const peer of call.participants.keys()) deliver(call, peer, "call:connected", { callId: call.id }, true);
    });

    async function leave(data, isGroup) {
      const call = live.get(data.callId);
      if (!call || Boolean(call.groupId) !== isGroup || !call.audience.has(id)) return;
      const joined = call.participants.get(id)?.socketId === socket.id;
      if (!joined && (isGroup || call.phase !== "ringing" || id === call.callerId)) return;
      if (!isGroup || id === call.callerId) return finish(call, "ended");
      call.participants.delete(id);
      busy.delete(id);
      for (const [key, link] of call.links) if (link.from === id || link.to === id) call.links.delete(key);
      for (const peer of call.participants.keys()) {
        if ((await binding(peer))?.state === "active" && (await group(call.groupId))?.memberAccountIds.includes(peer)) {
          deliver(call, peer, "group-call:participant-left", { ...payloadForGroup(call), peerId: peerKey(call.id, id) }, true);
        }
      }
    }
    on("call:end", (data) => leave(data, false));
    on("group-call:leave", (data) => leave(data, true));
    socket.once("disconnect", () => {
      clearTimeout(expiry);
      const call = live.get(busy.get(id));
      if (call?.participants.get(id)?.socketId === socket.id) void leave({ callId: call.id }, Boolean(call.groupId)).catch(report);
    });
  });
  return {
    requireCallsSession,
    endForDeletion,
    disconnectSession(token) {
      for (const socket of namespace.sockets.values()) if (socket.data.sessionToken === token) socket.disconnect();
    },
  };
}
