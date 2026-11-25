import { ObjectId } from "mongodb";
import { isCurrentOwnershipOffer, ownershipOffer } from "./group-ownership.js";

export async function removeVerifiedLegacyGroupAccess(db, binding, session) {
  const username = binding.username;
  if (!username || !await db.collection("email_users").findOne({ _id: username, groupPiUid: binding._id }, { session })) return [];
  const groups = db.collection("chat_groups");
  const rows = await groups.find({
    $or: [{ members: username }, { admins: username }, { invitations: username },
      { "ownershipOffer.toAccountId": username }, { ownerUsername: username, state: { $ne: "archived" } }],
  }, { session }).toArray();
  const notices = [];
  for (const group of rows) {
    const owned = group.ownerUsername === username;
    const invitations = group.invitations ?? [];
    const update = {
      $pull: { members: username, admins: username, ...(!owned && { invitations: username }) },
      $inc: { managementRevision: 1 },
      $max: { updatedAt: Date.now() },
      ...(owned && { $set: { state: "archived", invitations: [] } }),
      ...((owned || group.ownershipOffer?.toAccountId === username) && { $unset: { ownershipOffer: "" } }),
    };
    await groups.updateOne({ _id: group._id }, update, { session });
    notices.push({ id: group._id, legacy: true, invitees: owned ? invitations : [username] });
  }
  return notices;
}

export function registerLegacyGroupManagement({ app, groups, users, requireSession, normalize, publish, revoke, inviteChanged }) {
  const base = "/api/groups/:groupId/management";
  const invitationPath = "/api/group-management/invitations";
  const error = (res, status, message, code) => res.status(status).json({ error: message, ...(code && { code }) });
  const authenticated = (handler) => async (req, res, next) => {
    const username = normalize(req.user.piUsername);
    if (!username || !req.user.verifiedPiUid) return error(res, 403, "A verified Pi session is required");
    try {
      const identity = await users.findOne({ _id: username, groupPiUid: req.user.verifiedPiUid });
      if (!identity) return error(res, 403, "Sign in again with your verified Pi identity");
      return await handler(req, res, username);
    }
    catch (failure) { return next(failure); }
  };
  function view(group, username) {
    const owner = group.ownerUsername === username;
    const admins = group.admins ?? [];
    const admin = admins.includes(username);
    const active = group.state !== "archived";
    const offer = group.ownershipOffer;
    return {
      id: group._id.toHexString(), name: group.name, description: group.description ?? "",
      owner: group.ownerUsername, members: group.members.map(member => ({
        username: member, role: member === group.ownerUsername ? "owner" : admins.includes(member) ? "admin" : "member",
      })),
      ownRole: owner ? "owner" : admin ? "admin" : "member",
      canManage: active && (owner || admin), canLeave: active && !owner,
      invitations: active && (owner || admin) ? group.invitations ?? [] : [],
      offer: active && offer && (owner || offer.toAccountId === username) ? offer : null,
      revision: group.managementRevision ?? 0,
    };
  }

  app.get(invitationPath, requireSession, authenticated(async (_req, res, username) => {
    const records = await groups.find({ invitations: username, state: { $ne: "archived" } },
      { projection: { name: 1, ownerUsername: 1 } }).toArray();
    res.set("Cache-Control", "private, no-store").json({ invitations: records.map(group => ({
      id: group._id.toHexString(), name: group.name, owner: group.ownerUsername,
    })) });
  }));

  app.get(base, requireSession, authenticated(async (req, res, username) => {
    if (!/^[a-f0-9]{24}$/.test(req.params.groupId)) return error(res, 400, "Invalid group");
    const group = await groups.findOne({ _id: new ObjectId(req.params.groupId), members: username });
    if (!group) return error(res, 404, "Group not found");
    res.set("Cache-Control", "private, no-store").json({ group: view(group, username) });
  }));

  app.post(base, requireSession, authenticated(async (req, res, username) => {
    if (!/^[a-f0-9]{24}$/.test(req.params.groupId)) return error(res, 400, "Invalid group");
    const _id = new ObjectId(req.params.groupId);
    const { action, name, description, offerId, revision } = req.body ?? {};
    const target = normalize(req.body?.username);
    const invitationResponse = action === "accept-invite" || action === "decline-invite";
    const group = await groups.findOne({ _id, [invitationResponse ? "invitations" : "members"]: username });
    if (!group) return error(res, 404, "Group not found");
    if (group.state === "archived") return error(res, 409, "Group is archived");
    const owner = group.ownerUsername === username;
    const admins = group.admins ?? [];
    const invitations = group.invitations ?? [];
    const manage = owner || admins.includes(username);
    const member = group.members.includes(target);
    const regular = member && target !== group.ownerUsername && !admins.includes(target);
    const changes = {};
    let notifyInvite;
    let departed;
    const unset = {};

    switch (action) {
      case "details":
        if (!manage) return error(res, 403, "Group management permission required");
        if (revision !== (group.managementRevision ?? 0)) return error(res, 409, "Group details changed");
        if (typeof name !== "string" || !name.trim() || name.trim().length > 80 ||
            typeof description !== "string" || description.trim().length > 500) return error(res, 400, "Invalid group details");
        Object.assign(changes, { name: name.trim(), description: description.trim() });
        break;
      case "invite":
      case "revoke-invite":
        if (!manage) return error(res, 403, "Group management permission required");
        if (!target) return error(res, 400, "Invalid Pi username");
        if (action === "invite") {
          if (member) return error(res, 409, "This person is already a member", "GROUP_ALREADY_MEMBER");
          if (invitations.includes(target)) return error(res, 409, "This invitation is already pending", "GROUP_ALREADY_INVITED");
          if (group.members.length + invitations.length >= 50) return error(res, 409, "Group is full", "GROUP_FULL");
          if (!await users.findOne({ _id: target, groupPiUid: { $type: "string" } }, { projection: { _id: 1 } })) {
            return error(res, 404, "Invitee must sign in with a verified Pi identity", "GROUP_INVITEE_NOT_VERIFIED");
          }
          changes.invitations = [...invitations, target];
        } else {
          if (!invitations.includes(target)) return error(res, 404, "Invitation not found");
          changes.invitations = invitations.filter(person => person !== target);
        }
        notifyInvite = target;
        break;
      case "accept-invite":
      case "decline-invite":
        changes.invitations = invitations.filter(person => person !== username);
        if (action === "accept-invite") changes.members = [...new Set([...group.members, username])];
        notifyInvite = username;
        break;
      case "promote":
      case "demote":
        if (!owner) return error(res, 403, "Only the owner may change administrators");
        if (!member || target === group.ownerUsername) return error(res, 400, "Choose another member");
        changes.admins = action === "promote" ? [...new Set([...admins, target])] : admins.filter(person => person !== target);
        break;
      case "remove":
      case "leave":
        if (action === "remove" && (!manage || (!owner && !regular))) return error(res, 403, "Cannot remove this member");
        departed = action === "leave" ? username : target;
        if (!group.members.includes(departed) || departed === group.ownerUsername) {
          return error(res, 409, "The owner must transfer ownership before leaving");
        }
        changes.members = group.members.filter(person => person !== departed);
        changes.admins = admins.filter(person => person !== departed);
        if (group.ownershipOffer?.toAccountId === departed) unset.ownershipOffer = "";
        break;
      case "offer":
        if (!owner) return error(res, 403, "Only the owner may transfer ownership");
        if (!member || target === username) return error(res, 400, "Choose another member");
        if (!await users.findOne({ _id: target, groupPiUid: { $type: "string" } }, { projection: { _id: 1 } })) {
          return error(res, 404, "Member must sign in with a verified Pi identity");
        }
        changes.ownershipOffer = ownershipOffer(username, target);
        break;
      case "accept-ownership":
      case "decline-ownership":
        if (!isCurrentOwnershipOffer(group.ownershipOffer, offerId, group.ownerUsername, username)) {
          return error(res, 409, "Ownership offer is no longer available");
        }
        unset.ownershipOffer = "";
        if (action === "accept-ownership") {
          changes.ownerUsername = username;
          changes.admins = admins.filter(person => person !== username);
        }
        break;
      default:
        return error(res, 400, "Unknown group action");
    }

    const result = await groups.findOneAndUpdate({
      _id, managementRevision: group.managementRevision ?? { $exists: false },
      state: { $ne: "archived" }, [invitationResponse ? "invitations" : "members"]: username,
    }, {
      $set: changes, $inc: { managementRevision: 1 }, $max: { updatedAt: Date.now() },
      ...(Object.keys(unset).length && { $unset: unset }),
    }, { returnDocument: "after" });
    if (!result) return error(res, 409, "Group changed. Refresh and retry.");
    await publish(result);
    if (departed) await revoke(result, departed);
    if (notifyInvite) inviteChanged(notifyInvite);
    return res.json({ group: result.members.includes(username) ? view(result, username) : null });
  }));
}
