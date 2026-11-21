import { insertWithScopedFile, accountWrites, respondToBlockedWrite } from "./account-write-fence.js";
import { createHash } from "node:crypto";
import { ObjectId } from "mongodb";
import { identityBindingsCollection } from "./account-identity.js";
import { migrationRequired } from "./pi-login.js";
import { invalidateGroupOwnershipOffers, registerGroupOwnership, removeGroupMember } from "./group-ownership.js";

const room = (accountId) => `groups:account:${accountId}`;
const opaqueMember = (groupId, accountId) => createHash("sha256").update(JSON.stringify([groupId, accountId])).digest("hex");
const isId = (value) => typeof value === "string" && /^[0-9a-f]{24}$/.test(value);
const missing = { code: "GROUP_NOT_FOUND", error: "Group not found" };
const archived = { code: "GROUP_ARCHIVED", error: "Archived groups are read only" };
const notInvited = { code: "INVITATION_NOT_FOUND", error: "Invitation not found" };
const inactive = (account) => account?.state === "deleting"
  ? { code: "ACCOUNT_DELETING", error: "Account deletion is in progress" }
  : { code: "ACCOUNT_INACTIVE", error: "Account is not active" };

class GroupError extends Error {
  constructor(status, body) {
    super(body.error);
    this.status = status;
    this.body = body;
  }
}
const reject = (status, info) => { throw new GroupError(status, typeof info === "string" ? { error: info } : info); };

export async function createAccountGroups({
  app, io, db, mongoClient, writeAccount, userSessions, authenticateSession, normalizeMessagingUsername, groupMediaBucket,
}) {
  const groups = db.collection("account_chat_groups");
  const messages = db.collection("account_group_messages");
  const bindings = db.collection(identityBindingsCollection);
  await Promise.all([
    groups.createIndex({ memberAccountIds: 1, updatedAt: -1 }),
    groups.createIndex({ invitedAccountIds: 1, state: 1 }),
    groups.createIndex({ ownerAccountId: 1 }),
    messages.createIndex({ groupId: 1, _id: -1 }),
    messages.createIndex({ groupId: 1, senderAccountId: 1, clientMessageId: 1 }, { unique: true }),
    messages.createIndex({ groupId: 1, mediaId: 1 }),
  ]);
  const topology = await db.command({ hello: 1 });
  const transferSupported = Boolean(topology.setName || topology.msg === "isdbgrid");
  const namespace = io.of("/groups");

  const account = (accountId) => bindings.findOne({ accountId });
  async function requireActive(accountId) {
    if (!accountId) reject(409, migrationRequired);
    const binding = await account(accountId);
    if (binding?.state !== "active") {
      if (binding?.state === "deleting") await invalidateGroupOwnershipOffers(db, accountId);
      reject(403, inactive(binding));
    }
    return binding;
  }

  async function member(groupId, accountId, { write = false, owner = false } = {}) {
    await requireActive(accountId);
    if (!isId(groupId)) reject(400, "Invalid group ID");
    const _id = new ObjectId(groupId);
    const group = await groups.findOne({ _id, memberAccountIds: accountId });
    if (!group) {
      const legacy = await db.collection("chat_groups").findOne({ _id }, { projection: { _id: 1 } });
      reject(legacy ? 409 : 404, legacy ? migrationRequired : missing);
    }
    if (write && group.state !== "active") reject(409, archived);
    if (owner && group.ownerAccountId !== accountId) reject(403, "Only the group owner may manage membership");
    return group;
  }

  function writeForMember(groupId, accountId, updatedAt) {
    return (accounts, execute) => writeAccount(accounts, async (session) => {
      // Group membership and archival changes write this same document.
      const _id = new ObjectId(groupId);
      const result = await groups.updateOne({ _id, memberAccountIds: accountId, state: "active" },
        { $inc: { memberWriteRevision: 1 }, ...(updatedAt ? { $max: { updatedAt } } : {}) }, { session });
      if (!result.matchedCount) {
        if (await groups.findOne({ _id, memberAccountIds: accountId, state: "archived" }, { session })) reject(409, archived);
        reject(404, missing);
      }
      return execute(session);
    });
  }

  function report(res, error, next) {
    if (respondToBlockedWrite(error, res)) return;
    if (error instanceof GroupError) return res.status(error.status).json(error.body);
    return next(error);
  }
  function route(handler) {
    return (req, res, next) => authenticateSession(req, res, async () => {
      try {
        await requireActive(req.user.accountId);
        await handler(req, res);
      } catch (error) {
        report(res, error, next);
      }
    });
  }

  async function names(ids) {
    const records = await bindings.find({ accountId: { $in: [...new Set(ids)] } }).toArray();
    return new Map(records.map((record) => [record.accountId, record]));
  }

  async function groupForClient(group, viewerId) {
    const id = group._id.toHexString();
    const isOwner = viewerId === group.ownerAccountId;
    const pending = isOwner ? group.invitedAccountIds : [];
    const people = await names([...group.memberAccountIds, ...pending]);
    function describe(accountId) {
      const binding = people.get(accountId);
      return { id: opaqueMember(id, accountId), username: binding?.username ?? null, state: binding?.state ?? "deleted" };
    }
    const canWrite = group.state === "active";
    const offer = group.ownershipOffer;
    const validOffer = canWrite && offer && offer.fromAccountId === group.ownerAccountId &&
      people.get(offer.fromAccountId)?.state === "active" && people.get(offer.toAccountId)?.state === "active" &&
      group.memberAccountIds.includes(offer.fromAccountId) && group.memberAccountIds.includes(offer.toAccountId);
    const canRespond = transferSupported && validOffer && offer.toAccountId === viewerId;
    const ownershipOffer = validOffer && (isOwner || canRespond) ? {
      id: offer.id,
      fromUsername: people.get(offer.fromAccountId).username ?? null,
      toUsername: people.get(offer.toAccountId).username ?? null,
      canRespond: Boolean(canRespond),
    } : null;
    return {
      id, name: group.name, state: group.state, isOwner, canWrite, canManageMembers: canWrite && isOwner,
      canOfferOwnership: transferSupported && canWrite && isOwner, ownershipOffer,
      ownerId: opaqueMember(id, group.ownerAccountId), members: group.memberAccountIds.map(describe),
      ...(isOwner ? { pendingInvitations: pending.map(describe) } : {}),
      createdAt: group.createdAt, updatedAt: group.updatedAt,
    };
  }

  function messageForClient(record, people, viewerId) {
    return {
      id: record._id.toHexString(), groupId: record.groupId,
      senderId: opaqueMember(record.groupId, record.senderAccountId),
      senderUsername: people.get(record.senderAccountId)?.username ?? null,
      fromMe: record.senderAccountId === viewerId,
      kind: record.kind, text: record.text, at: record.at,
      readBy: record.readByAccountIds.map((id) => opaqueMember(record.groupId, id)),
      mediaId: record.mediaId, fileName: record.fileName, mimeType: record.mimeType, fileSize: record.fileSize,
    };
  }

  async function publish(groupId, event, payload, { invite = false, activeGroup = false } = {}) {
    const _id = new ObjectId(groupId);
    const field = invite ? "invitedAccountIds" : "memberAccountIds";
    try {
      const group = await groups.findOne({ _id });
      if (!group) return;
      await Promise.all(group[field].map(async (accountId) => {
        const binding = await account(accountId);
        const target = namespace.to(room(accountId));
        if (binding?.state !== "active") {
          target.emit("group:unavailable", inactive(binding));
          target.disconnectSockets();
          return;
        }
        const current = await groups.findOne({ _id, [field]: accountId, ...(activeGroup ? { state: "active" } : {}) });
        if (!current) return;
        const body = await payload(current, accountId);
        if (!await groups.findOne({ _id, [field]: accountId, ...(activeGroup ? { state: "active" } : {}) }, { projection: { _id: 1 } })) return;
        if ((await account(accountId))?.state === "active") target.emit(event, body);
      }));
    } catch (error) {
      console.error("[ACCOUNT GROUP EVENT ERROR]", error);
    }
  }

  async function resolveInvitees(values, senderId) {
    if (!Array.isArray(values) || values.length > 49) reject(400, "Invalid invitees");
    const usernames = [...new Set(values.map(normalizeMessagingUsername))];
    if (usernames.includes("")) reject(400, "Invalid invitee username");
    const records = await bindings.find({ username: { $in: usernames }, state: "active" }).toArray();
    const ids = [];
    for (const username of usernames) {
      const matches = records.filter((record) => record.username === username);
      if (matches.length !== 1 || typeof matches[0].accountId !== "string") reject(404, "Invitee is unavailable");
      if (matches[0].accountId !== senderId) ids.push(matches[0].accountId);
    }
    return ids;
  }
  const inviteNotice = (group) => ({ groupId: group._id.toHexString(), name: group.name });
  const groupChanged = (id) => publish(id, "group:updated", groupForClient);
  const invitationsChanged = (id) => publish(id, "group:invited", inviteNotice, { invite: true, activeGroup: true });

  app.post("/api/groups", route(async (req, res) => {
    const name = req.body?.name?.trim?.();
    if (!name || name.length > 80) reject(400, "Invalid group details");
    const ownerAccountId = req.user.accountId;
    const invitedAccountIds = await resolveInvitees(req.body.members ?? [], ownerAccountId);
    await requireActive(ownerAccountId);
    const now = Date.now();
    const group = {
      _id: new ObjectId(), name, ownerAccountId, memberAccountIds: [ownerAccountId],
      invitedAccountIds, state: "active", createdAt: now, updatedAt: now,
    };
    await accountWrites(groups, writeAccount, [ownerAccountId, ...invitedAccountIds]).insertOne(group);
    const id = group._id.toHexString();
    await Promise.all([groupChanged(id), invitationsChanged(id)]);
    res.status(201).json({ group: await groupForClient(group, ownerAccountId) });
  }));

  app.get("/api/groups", route(async (req, res) => {
    const { accountId } = req.user;
    res.set("Cache-Control", "private, no-store");
    const rows = await groups.find({ memberAccountIds: accountId }).sort({ updatedAt: -1, _id: -1 }).toArray();
    const serialized = await Promise.all(rows.map((group) => groupForClient(group, accountId)));
    const visible = await groups.find({ _id: { $in: rows.map(({ _id }) => _id) }, memberAccountIds: accountId },
      { projection: { _id: 1 } }).toArray();
    const visibleIds = new Set(visible.map(({ _id }) => _id.toHexString()));
    await requireActive(accountId);
    res.json({ groups: serialized.filter(({ id }) => visibleIds.has(id)), legacyHistory: migrationRequired });
  }));

  app.get("/api/groups/invitations", route(async (req, res) => {
    res.set("Cache-Control", "private, no-store");
    const rows = await groups.find({ invitedAccountIds: req.user.accountId, state: "active" }).toArray();
    await requireActive(req.user.accountId);
    res.json({ invitations: rows.map(inviteNotice), legacyHistory: migrationRequired });
  }));

  app.post("/api/groups/:groupId/invitations", route(async (req, res) => {
    const { accountId } = req.user;
    const group = await member(req.params.groupId, accountId, { owner: true, write: true });
    const ids = await resolveInvitees([req.body?.username], accountId);
    if (!ids.length || group.memberAccountIds.includes(ids[0])) reject(409, "Account is already a member");
    await requireActive(accountId);
    const outcome = await accountWrites(groups, writeAccount, [accountId, ids[0]]).updateOne({
      _id: group._id, ownerAccountId: accountId, memberAccountIds: { $ne: ids[0] },
      state: "active",
      $expr: { $lt: [{ $add: [{ $size: "$memberAccountIds" }, { $size: "$invitedAccountIds" }] }, 50] },
    }, { $addToSet: { invitedAccountIds: ids[0] } });
    if (!outcome.matchedCount) reject(409, "Invitation cannot be added");
    await Promise.all([groupChanged(req.params.groupId), invitationsChanged(req.params.groupId)]);
    res.status(201).json({ invitationId: opaqueMember(req.params.groupId, ids[0]) });
  }));

  app.post("/api/groups/:groupId/invitations/:action", route(async (req, res) => {
    const { groupId, action } = req.params;
    if (!isId(groupId) || !["accept", "decline"].includes(action)) reject(400, "Invalid invitation action");
    const { accountId } = req.user;
    const _id = new ObjectId(groupId);
    const invitation = await groups.findOne({ _id, invitedAccountIds: accountId });
    if (!invitation) reject(404, notInvited);
    if (invitation.state !== "active") reject(409, archived);
    await requireActive(accountId);
    const accepting = action === "accept";
    const accounts = accepting ? [accountId, invitation.ownerAccountId] : [accountId];
    const result = await accountWrites(groups, writeAccount, accounts).updateOne({
      _id, state: "active", invitedAccountIds: accountId,
      ...(accepting ? { ownerAccountId: invitation.ownerAccountId } : {}),
    }, {
      $pull: { invitedAccountIds: accountId },
      ...(accepting ? { $addToSet: { memberAccountIds: accountId } } : {}),
    });
    if (!result.matchedCount) reject(409, "Invitation is no longer available");
    await groupChanged(groupId);
    res.json({ success: true });
  }));

  registerGroupOwnership({
    app, db, mongoClient, route, member, reject, opaqueMember, groupChanged, supported: transferSupported,
  });

  async function memberRevoked(groupId, target) {
    if ((await account(target))?.state === "active" &&
        !await groups.findOne({ _id: new ObjectId(groupId), memberAccountIds: target })) {
      namespace.to(room(target)).emit("group:access-revoked", { groupId });
    }
  }

  app.post("/api/groups/:groupId/leave", route(async (req, res) => {
    const { accountId } = req.user;
    const { groupId } = req.params;
    const group = await member(groupId, accountId, { write: true });
    if (group.ownerAccountId === accountId) reject(409, "The owner must transfer ownership before leaving");
    const result = await accountWrites(groups, writeAccount, accountId).updateOne({
      _id: group._id, state: "active", ownerAccountId: { $ne: accountId }, memberAccountIds: accountId,
    }, removeGroupMember(accountId));
    if (!result.matchedCount) reject(409, "Group membership changed");
    await memberRevoked(groupId, accountId);
    await groupChanged(groupId);
    res.json({ success: true });
  }));

  function removeMemberOrInvite(field) {
    return route(async (req, res) => {
      const { groupId, targetId } = req.params;
      const { accountId } = req.user;
      const group = await member(groupId, accountId, { owner: true, write: true });
      const target = group[field].find((id) => opaqueMember(groupId, id) === targetId);
      if (!target) reject(404, "Account not found in this group");
      if (target === group.ownerAccountId) reject(409, "The owner cannot be removed");
      await requireActive(accountId);
      const outcome = await accountWrites(groups, writeAccount, accountId).updateOne({
        _id: group._id, ownerAccountId: accountId, state: "active", [field]: target,
      }, field === "memberAccountIds" ? removeGroupMember(target) : { $pull: { [field]: target } });
      if (!outcome.matchedCount) reject(409, "Group membership changed");
      if (field === "memberAccountIds") await memberRevoked(groupId, target);
      await groupChanged(groupId);
      res.json({ success: true });
    });
  }
  app.delete("/api/groups/:groupId/members/:targetId", removeMemberOrInvite("memberAccountIds"));
  app.delete("/api/groups/:groupId/invitations/:targetId", removeMemberOrInvite("invitedAccountIds"));

  app.get("/api/groups/:groupId/messages", route(async (req, res) => {
    const { groupId } = req.params;
    const { accountId } = req.user;
    const before = req.query.before;
    if (before !== undefined && !isId(before)) reject(400, "Invalid history cursor");
    await member(groupId, accountId);
    const records = await messages.find({ groupId, ...(before ? { _id: { $lt: new ObjectId(before) } } : {}) })
      .sort({ _id: -1 }).limit(101).toArray();
    const group = await member(groupId, accountId);
    const hasMore = records.length > 100;
    const page = records.slice(0, 100);
    const people = await names(page.map(({ senderAccountId }) => senderAccountId));
    const view = await groupForClient(group, accountId);
    await member(groupId, accountId);
    res.set("Cache-Control", "private, no-store");
    res.json({
      group: view,
      messages: page.slice().reverse().map((row) => messageForClient(row, people, accountId)),
      hasMore, nextCursor: hasMore ? page.at(-1)._id.toHexString() : null, legacyHistory: migrationRequired,
    });
  }));

  app.post("/api/groups/:groupId/messages", route(async (req, res) => {
    const { groupId } = req.params;
    const { accountId } = req.user;
    const { id, kind, text, mediaId } = req.body ?? {};
    if (typeof id !== "string" || !id.trim() || id.length > 120 ||
        !["text", "image", "file", "video", "voice"].includes(kind) ||
        typeof text !== "string" || text.length > 2000 || (kind === "text" ? !text.trim() || mediaId !== undefined : !isId(mediaId))) {
      reject(400, "Invalid group message");
    }
    await member(groupId, accountId, { write: true });
    const key = { groupId, senderAccountId: accountId, clientMessageId: id };
    let existing = await messages.findOne(key);
    let created = false;
    const candidate = { ...key, kind, text: text.trim(), at: Date.now(), readByAccountIds: [accountId], _id: new ObjectId() };
    if (!existing) {
      if (mediaId) {
        const media = await groupMediaBucket.find({
          _id: new ObjectId(mediaId), "metadata.groupId": groupId, "metadata.accountScoped": true,
          "metadata.ownerAccountId": accountId, "metadata.kind": kind,
        }).next();
        if (!media) reject(400, "Media is unavailable");
        Object.assign(candidate, { mediaId, fileName: media.filename, mimeType: media.metadata.mimeType, fileSize: media.length });
      }
      await member(groupId, accountId, { write: true });
      try {
        await insertWithScopedFile(db, writeForMember(groupId, accountId, candidate.at), accountId, messages, candidate, "group_media", mediaId);
        existing = candidate;
        created = true;
      } catch (error) {
        if (error.code !== 11000) throw error;
        existing = await messages.findOne(key);
        if (!existing) throw error;
      }
    }
    if (existing.kind !== kind || existing.text !== text.trim() || existing.mediaId !== mediaId) reject(409, "Message ID is already used");
    const people = await names([accountId]);
    if (created) {
      await member(groupId, accountId, { write: true });
      await publish(groupId, "group:message", (_group, viewer) => ({ message: messageForClient(existing, people, viewer) }), { activeGroup: true });
    }
    await member(groupId, accountId, { write: true });
    res.status(created ? 201 : 200).json({ message: messageForClient(existing, people, accountId) });
  }));

  app.post("/api/groups/:groupId/read", route(async (req, res) => {
    const { groupId } = req.params;
    const { accountId } = req.user;
    const ids = req.body?.messageIds;
    if (!Array.isArray(ids) || !ids.length || ids.length > 100 || !ids.every(isId)) reject(400, "Invalid message IDs");
    await member(groupId, accountId, { write: true });
    const filter = { groupId, _id: { $in: [...new Set(ids)].map((id) => new ObjectId(id)) } };
    const rows = await messages.find(filter, { projection: { _id: 1 } }).toArray();
    await member(groupId, accountId, { write: true });
    const update = await accountWrites(messages, writeForMember(groupId, accountId), accountId).updateMany(filter, { $addToSet: { readByAccountIds: accountId } });
    const payload = { groupId, memberId: opaqueMember(groupId, accountId), messageIds: rows.map((row) => row._id.toHexString()) };
    if (update.modifiedCount) {
      await member(groupId, accountId, { write: true });
      await publish(groupId, "group:read", () => payload, { activeGroup: true });
    }
    res.json({ success: true, ...payload });
  }));

  namespace.use(async (socket, next) => {
    const token = socket.handshake.auth?.sessionToken;
    const session = typeof token === "string" && userSessions.get(token);
    if (!session?.accountId || session.expiresAt <= Date.now()) return next(new Error("Invalid session"));
    try {
      await requireActive(session.accountId);
      socket.data.sessionToken = token;
      next();
    } catch (error) {
      const failure = new Error(error instanceof GroupError ? error.message : "Group authentication failed");
      failure.data = error instanceof GroupError ? { code: error.body.code } : undefined;
      next(failure);
    }
  });
  namespace.on("connection", (socket) => {
    const token = socket.data.sessionToken;
    const session = userSessions.get(token);
    const current = () => session?.accountId && session === userSessions.get(token) && session.expiresAt > Date.now();
    if (!current()) return socket.disconnect();
    socket.join(room(session.accountId));
    const timer = setTimeout(() => socket.disconnect(), session.expiresAt - Date.now());
    timer.unref();
    socket.once("disconnect", () => clearTimeout(timer));
    socket.on("group:watch", async (groupId) => {
      if (!current()) return socket.disconnect();
      try {
        const group = await member(groupId, session.accountId);
        const state = await groupForClient(group, session.accountId);
        await member(groupId, session.accountId);
        if (current() && socket.connected) socket.emit("group:watching", state);
      } catch (error) {
        if (!current()) return;
        if (error.status === 403) {
          socket.emit("group:unavailable", error.body);
          socket.disconnect();
        } else {
          socket.emit("group:error", error instanceof GroupError ? error.body : { error: "Group is unavailable" });
        }
      }
    });
  });

  function guardMedia(write) {
    return (req, res, next) => authenticateSession(req, res, async () => {
      try {
        req.chatGroup = await member(req.params.groupId, req.user.accountId, { write });
        req.groupUsername = normalizeMessagingUsername(req.user.piUsername);
        next();
      } catch (error) {
        report(res, error, next);
      }
    });
  }
  async function authorizeMediaWrite(req, res, next) {
    try {
      await member(req.params.groupId, req.user.accountId, { write: true });
      return true;
    } catch (error) {
      report(res, error, next);
      return false;
    }
  }
  async function authorizeMediaRead(req, res, next, media, mediaId) {
    try {
      await member(req.params.groupId, req.user.accountId);
      const message = await messages.findOne({
        groupId: req.params.groupId, mediaId,
        senderAccountId: media.metadata.ownerAccountId, kind: media.metadata.kind,
      }, { projection: { _id: 1 } });
      await member(req.params.groupId, req.user.accountId);
      return Boolean(message);
    } catch (error) {
      report(res, error, next);
      return null;
    }
  }

  return {
    guardMedia, authorizeMediaWrite, authorizeMediaRead, writeForMember, report,
    disconnectSession(token) {
      for (const socket of namespace.sockets.values()) {
        if (socket.data.sessionToken === token) socket.disconnect();
      }
    },
  };
}
