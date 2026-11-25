import { createHash, randomBytes } from "node:crypto";
import { ObjectId } from "mongodb";
import { auditedGroupActions, groupModerationChange, groupModerationView, moderationActions } from "./group-moderation.js";
import { groupPlanningChange, groupPlanningView, removePlanningParticipant } from "./group-planning.js";
import { isCurrentOwnershipOffer, ownershipOffer } from "./group-ownership.js";

const accessAppUrl = "https://apppiconnectuvr9006.pinet.com/";
const inviteLifeMs = 24 * 60 * 60 * 1000;

function inviteDigest(secret) {
  return createHash("sha256").update(secret).digest("hex");
}

function toggleGroupPreference(people = [], username, enabled) {
  return enabled ? [...new Set([...people, username])] : people.filter(person => person !== username);
}

function currentInvitation(group) {
  return group.inviteLink && group.inviteLink.expiresAt > Date.now() ? group.inviteLink : null;
}

export async function removeVerifiedLegacyGroupAccess(db, binding, session) {
  const username = binding.username;
  if (!username || !await db.collection("email_users").findOne({ _id: username, groupPiUid: binding._id }, { session })) return [];
  const groups = db.collection("chat_groups");
  const rows = await groups.find({
    $or: [{ members: username }, { admins: username }, { invitations: username }, { "joinRequests.username": username }, { "reports.reporter": username },
      { "ownershipOffer.toAccountId": username }, { ownerUsername: username, state: { $ne: "archived" } }],
  }, { session }).toArray();
  const notices = [];
  for (const group of rows) {
    const owned = group.ownerUsername === username;
    const invitations = group.invitations ?? [];
    const update = {
      $pull: { members: username, admins: username, mutedBy: username, mentionAlertsBy: username, restrictions: { username }, reports: { reporter: username }, ...(!owned && { invitations: username, joinRequests: { username } }) },
      $inc: { managementRevision: 1 },
      $max: { updatedAt: Date.now() },
      $set: {
        ...removePlanningParticipant(group, username),
        ...(owned && { state: "archived", invitations: [], joinRequests: [] }),
      },
      ...((owned || group.ownershipOffer?.toAccountId === username) && { $unset: { ownershipOffer: "", ...(owned && { inviteLink: "" }) } }),
    };
    await groups.updateOne({ _id: group._id }, update, { session });
    notices.push({ id: group._id, legacy: true, invitees: owned ? invitations : [username] });
  }
  return notices;
}

export function registerLegacyGroupManagement({ app, groups, users, authorizePhoto, findModerationMessage, requireSession, normalize, publish, revoke, inviteChanged, commitActivity, publishActivity }) {
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
    const link = currentInvitation(group);
    const canShare = active && (owner || (admin && group.adminsCanShare === true));
    return {
      id: group._id.toHexString(), name: group.name, description: group.description ?? "",
      owner: group.ownerUsername, members: group.members.map(member => ({
        username: member, role: member === group.ownerUsername ? "owner" : admins.includes(member) ? "admin" : "member",
      })),
      ownRole: owner ? "owner" : admin ? "admin" : "member",
      canManage: active && (owner || admin), canLeave: active && !owner,
      enhancedGroups: true,
      moderation: groupModerationView(group, username, active && (owner || admin)),
      canShare, adminsCanShare: group.adminsCanShare === true,
      inviteExpiresAt: canShare ? link?.expiresAt ?? null : null,
      inviteGeneration: canShare ? link?.generation ?? null : null,
      joinRequests: active && (owner || admin) && link ? (group.joinRequests ?? []).map(request => request.username) : [],
      adminsOnly: group.adminsOnly === true,
      photoId: group.photoId ?? null,
      muted: group.mutedBy?.includes(username) ?? false,
      mentionAlerts: group.mentionAlertsBy?.includes(username) ?? false,
      invitations: active && (owner || admin) ? group.invitations ?? [] : [],
      offer: active && offer && (owner || offer.toAccountId === username) ? offer : null,
      revision: group.managementRevision ?? 0,
      planning: groupPlanningView(group, username),
    };
  }

  app.get(invitationPath, requireSession, authenticated(async (_req, res, username) => {
    const records = await groups.find({ invitations: username, state: { $ne: "archived" } },
      { projection: { name: 1, ownerUsername: 1 } }).toArray();
    res.set("Cache-Control", "private, no-store").json({ invitations: records.map(group => ({
      id: group._id.toHexString(), name: group.name, owner: group.ownerUsername,
    })) });
  }));

  app.post("/api/group-management/join-request", requireSession, authenticated(async (req, res, username) => {
    const { invitation } = req.body ?? {};
    if (typeof invitation !== "string" || !/^[a-f0-9]{24}\.[A-Za-z0-9_-]{43}$/.test(invitation)) {
      return error(res, 400, "Invalid invitation link");
    }
    const [id, secret] = invitation.split(".");
    const filter = { _id: new ObjectId(id), "inviteLink.digest": inviteDigest(secret),
      "inviteLink.expiresAt": { $gt: Date.now() }, state: { $ne: "archived" } };
    const group = await groups.findOne(filter);
    if (!group) return error(res, 404, "Invitation link has expired or was revoked", "GROUP_LINK_UNAVAILABLE");
    if (group.members.includes(username)) return error(res, 409, "This person is already a member", "GROUP_ALREADY_MEMBER");
    const requests = group.joinRequests ?? [];
    const uid = req.user.verifiedPiUid;
    if (requests.some(request => request.uid === uid)) return res.json({ pending: true, groupName: group.name });
    if (requests.length >= 50) return error(res, 409, "Too many pending join requests");
    const updated = await groups.findOneAndUpdate({
      ...filter, managementRevision: group.managementRevision, members: { $ne: username },
    }, { $set: { joinRequests: [...requests, { username, uid }] }, $inc: { managementRevision: 1 } },
    { returnDocument: "after" });
    if (!updated) return error(res, 409, "Group changed. Refresh and retry.", "GROUP_CONCURRENT_UPDATE");
    await publish(updated);
    return res.json({ pending: true, groupName: updated.name });
  }));

  app.get("/api/groups/:groupId/reports/:reportId", requireSession, authenticated(async (req, res, username) => {
    const { groupId, reportId } = req.params;
    if (!/^[a-f0-9]{24}$/.test(groupId) || !/^[a-f0-9]{24}$/.test(reportId)) return error(res, 400, "Invalid report");
    const filter = { _id: new ObjectId(groupId), members: username, state: { $ne: "archived" },
      $or: [{ ownerUsername: username }, { admins: username }], "reports.id": reportId };
    const group = await groups.findOne(filter);
    const report = group?.reports.find(entry => entry.id === reportId);
    if (!report) return error(res, 404, "Moderation item is unavailable", "GROUP_MODERATION_UNAVAILABLE");
    const message = await findModerationMessage(group, username, report.message, true);
    if (!message || !await groups.findOne(filter, { projection: { _id: 1 } })) {
      return error(res, 404, "Moderation item is unavailable", "GROUP_MODERATION_UNAVAILABLE");
    }
    return res.set("Cache-Control", "private, no-store").json({ message });
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
    let invitationUrl;
    let departed;
    const unset = {};

    switch (action) {
      case "details":
        if (!manage) return error(res, 403, "Group management permission required");
        if (revision !== (group.managementRevision ?? 0)) return error(res, 409, "Group details changed", "GROUP_CONCURRENT_UPDATE");
        if (typeof name !== "string" || !name.trim() || name.trim().length > 80 ||
            typeof description !== "string" || description.trim().length > 500) return error(res, 400, "Invalid group details");
        Object.assign(changes, { name: name.trim(), description: description.trim() });
        break;
      case "notification-preference": {
        const { muted, mentionAlerts } = req.body;
        if ((muted === undefined && mentionAlerts === undefined) ||
            (muted !== undefined && typeof muted !== "boolean") ||
            (mentionAlerts !== undefined && typeof mentionAlerts !== "boolean")) {
          return error(res, 400, "Invalid notification preference", "GROUP_MODERATION_INVALID");
        }
        if (muted !== undefined) changes.mutedBy = toggleGroupPreference(group.mutedBy, username, muted);
        if (mentionAlerts !== undefined) changes.mentionAlertsBy = toggleGroupPreference(group.mentionAlertsBy, username, mentionAlerts);
        break;
      }
      case "sharing-permission":
        if (!owner) return error(res, 403, "Only the owner may change sharing permission");
        if (typeof req.body.adminsCanShare !== "boolean") return error(res, 400, "Invalid sharing permission");
        changes.adminsCanShare = req.body.adminsCanShare;
        if (!changes.adminsCanShare) {
          unset.inviteLink = "";
          changes.joinRequests = [];
        }
        break;
      case "create-link":
      case "revoke-link": {
        if (!owner && !(manage && group.adminsCanShare === true)) return error(res, 403, "Cannot share this group");
        changes.joinRequests = [];
        if (action === "revoke-link") {
          unset.inviteLink = "";
        } else {
          const secret = randomBytes(32).toString("base64url");
          changes.inviteLink = { digest: inviteDigest(secret), generation: new ObjectId().toHexString(), expiresAt: Date.now() + inviteLifeMs };
          const url = new URL(accessAppUrl);
          url.searchParams.set("groupInvite", _id.toHexString() + "." + secret);
          invitationUrl = url.toString();
        }
        break;
      }
      case "approve-join":
      case "decline-join": {
        if (!manage) return error(res, 403, "Group management permission required");
        const requests = group.joinRequests ?? [];
        const request = currentInvitation(group) && requests.find(entry => entry.username === target);
        if (!request) return error(res, 404, "Join request is unavailable");
        changes.joinRequests = requests.filter(entry => entry.username !== target);
        if (action === "approve-join") {
          if (member || (group.members.length + invitations.filter(person => person !== target).length >= 50)) {
            return error(res, 409, "Invitation cannot be added");
          }
          if (!await users.findOne({ _id: target, groupPiUid: request.uid }, { projection: { _id: 1 } })) {
            return error(res, 404, "Invitee must sign in with a verified Pi identity", "GROUP_INVITEE_NOT_VERIFIED");
          }
          changes.members = [...group.members, target];
          changes.invitations = invitations.filter(person => person !== target);
          notifyInvite = target;
        }
        break;
      }
      case "photo": {
        if (!manage) return error(res, 403, "Group management permission required");
        const { photoId } = req.body;
        if (photoId === null) { unset.photoId = ""; break; }
        if (typeof photoId !== "string" || !/^[a-f0-9]{24}$/.test(photoId) ||
            !await authorizePhoto(req, group, new ObjectId(photoId))) return error(res, 400, "Invalid group photo");
        changes.photoId = photoId;
        break;
      }
      case "posting-policy":
        if (!owner) return error(res, 403, "Only the owner may change posting permissions");
        if (typeof req.body.adminsOnly !== "boolean") return error(res, 400, "Invalid posting policy");
        changes.adminsOnly = req.body.adminsOnly;
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
        if (action === "accept-invite") {
          changes.members = [...new Set([...group.members, username])];
          changes.joinRequests = (group.joinRequests ?? []).filter(request => request.username !== username);
        }
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
        changes.mutedBy = toggleGroupPreference(group.mutedBy, departed, false);
        changes.mentionAlertsBy = toggleGroupPreference(group.mentionAlertsBy, departed, false);
        Object.assign(changes, removePlanningParticipant(group, departed));
        changes.restrictions = (group.restrictions ?? []).filter(entry => entry.username !== departed);
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
      default: {
        if (moderationActions.has(action)) {
          const moderation = await groupModerationChange({
            group, username, target, owner, manage, regular, data: req.body, findMessage: findModerationMessage, normalize,
          });
          if (moderation.status) return error(res, moderation.status, moderation.message, moderation.code);
          Object.assign(changes, moderation);
          break;
        }
        if (typeof action !== "string" || !/^(topic|poll|event):/.test(action)) return error(res, 400, "Unknown group action");
        const planning = groupPlanningChange(group, username, manage, req.body);
        if (planning.status) return error(res, planning.status, planning.message);
        Object.assign(changes, planning.changes);
      }
    }

    const filter = {
      _id, managementRevision: group.managementRevision ?? { $exists: false },
      ...((action === "approve-join" || action === "decline-join") && { "inviteLink.expiresAt": { $gt: Date.now() } }),
      state: { $ne: "archived" }, [invitationResponse ? "invitations" : "members"]: username,
    };
    const at = Date.now();
    const update = {
      $set: changes, $inc: { managementRevision: 1 }, $max: { updatedAt: at },
      ...(auditedGroupActions.has(action) && { $push: { audit: { $each: [{
        action, actor: username, at, ...(target && ["invite", "revoke-invite", "remove", "promote", "demote", "offer", "restrict", "unrestrict", "approve-join", "decline-join"].includes(action) && { target }),
        ...(action === "resolve-report" && { reportId: req.body.id }),
      }], $slice: -100 } } }),
      ...(Object.keys(unset).length && { $unset: unset }),
    };
    const activity = ({
      details: "updated the group details.",
      "accept-invite": "joined the group.",
      "approve-join": "approved a request to join the group.",
      leave: "left the group.",
      remove: "removed a member.",
      promote: "appointed an administrator.",
      demote: "removed an administrator role.",
      "accept-ownership": "accepted group ownership.",
    })[action];
    const message = activity ? {
      _id: new ObjectId(), groupId: _id.toHexString(), id: "group-activity-" + new ObjectId().toHexString(),
      kind: "text", senderUsername: username, text: "@" + username + " " + activity, at, readBy: [username], deletedFor: [],
      activity: { action, ...(["remove", "promote", "demote", "approve-join"].includes(action) && { target }) },
    } : null;
    const result = message ? await commitActivity(filter, update, message) :
      await groups.findOneAndUpdate(filter, update, { returnDocument: "after" });
    if (!result) return error(res, 409, "Group changed. Refresh and retry.", "GROUP_CONCURRENT_UPDATE");
    await publish(result);
    if (message) publishActivity(result, message);
    if (departed) await revoke(result, departed);
    if (notifyInvite) inviteChanged(notifyInvite);
    return res.set("Cache-Control", "private, no-store").json({ group: result.members.includes(username) ? view(result, username) : null, ...(invitationUrl && { invitationUrl }) });
  }));
}
