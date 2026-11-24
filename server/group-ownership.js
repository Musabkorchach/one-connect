import { ObjectId } from "mongodb";
import { identityBindingsCollection } from "./account-identity.js";

const stale = { code: "GROUP_TRANSFER_STALE", error: "This ownership offer is no longer available" };
const unavailable = { code: "GROUP_TRANSFER_UNAVAILABLE", error: "Ownership transfer requires a transactional database" };

export function ownershipOffer(fromAccountId, toAccountId) {
  return { id: new ObjectId().toHexString(), fromAccountId, toAccountId };
}

export function isCurrentOwnershipOffer(offer, id, owner, recipient) {
  return offer?.id === id && offer.fromAccountId === owner &&
    offer.toAccountId === recipient && owner !== recipient;
}

export function removeGroupMember(accountId) {
  return [
    { $set: {
      memberAccountIds: { $filter: { input: "$memberAccountIds", cond: { $ne: ["$$this", accountId] } } },
      ownershipOffer: { $cond: [
        { $or: [
          { $eq: ["$ownershipOffer.toAccountId", accountId] },
          { $eq: ["$ownershipOffer.fromAccountId", accountId] },
        ] },
        "$$REMOVE",
        "$ownershipOffer",
      ] },
    } },
  ];
}

export async function invalidateGroupOwnershipOffers(db, accountId, session) {
  const binding = await db.collection(identityBindingsCollection).findOne({ accountId, state: "deleting" }, { session });
  if (!binding) return 0;
  const result = await db.collection("account_chat_groups").updateMany({
    $or: [{ "ownershipOffer.fromAccountId": accountId }, { "ownershipOffer.toAccountId": accountId }],
  }, { $unset: { ownershipOffer: "" } }, { session });
  return result.modifiedCount;
}

// An internal cleanup step for a future worker. Run before releasing the binding.
export async function archiveOwnedGroupsForDeletion(db, accountId, session) {
  if (typeof accountId !== "string" || !accountId) throw new TypeError("Account ID is required");
  const binding = await db.collection(identityBindingsCollection).findOne({ accountId, state: "deleting" }, { session });
  if (!binding) return { archived: 0, membershipsRemoved: 0 };
  await invalidateGroupOwnershipOffers(db, accountId, session);
  const groups = db.collection("account_chat_groups");
  const owned = await groups.updateMany({
    ownerAccountId: accountId, $or: [{ state: "active" }, { memberAccountIds: accountId }],
  }, {
    $set: { state: "archived", invitedAccountIds: [] },
    $pull: { memberAccountIds: accountId },
    $unset: { ownershipOffer: "" },
  }, { session });
  const departed = await groups.updateMany({
    ownerAccountId: { $ne: accountId },
    $or: [{ memberAccountIds: accountId }, { formerOwnerAccountIds: accountId }, { invitedAccountIds: accountId }],
  }, { $pull: { memberAccountIds: accountId, formerOwnerAccountIds: accountId, invitedAccountIds: accountId } }, { session });
  return { archived: owned.modifiedCount, membershipsRemoved: departed.modifiedCount };
}

export function registerGroupOwnership({
  app, db, mongoClient, route, member, reject, opaqueMember, groupChanged, supported,
}) {
  const groups = db.collection("account_chat_groups");
  const bindings = db.collection(identityBindingsCollection);

  async function fenceAccounts(ids, session) {
    // A real write to each binding also conflicts with a concurrent deleting transition.
    for (const accountId of [...ids].sort()) {
      const result = await bindings.updateOne(
        { accountId, state: "active" },
        { $inc: { groupOwnershipRevision: 1 } },
        { session },
      );
      if (!result.matchedCount) reject(409, stale);
    }
  }

  async function transaction(run) {
    if (!supported) reject(503, unavailable);
    return mongoClient.withSession((session) => session.withTransaction(() => run(session)));
  }

  app.post("/api/groups/:groupId/ownership-offers", route(async (req, res) => {
    const { accountId } = req.user;
    const { groupId } = req.params;
    const group = await member(groupId, accountId, { owner: true, write: true });
    const target = group.memberAccountIds.find((id) => opaqueMember(groupId, id) === req.body?.memberId);
    if (!target || target === accountId) reject(400, "Choose another active member");
    const offer = ownershipOffer(accountId, target);
    await transaction(async (session) => {
      await fenceAccounts([accountId, target], session);
      const result = await groups.updateOne({
        _id: group._id, state: "active", ownerAccountId: accountId,
        memberAccountIds: { $all: [accountId, target] },
      }, { $set: { ownershipOffer: offer } }, { session });
      if (!result.matchedCount) reject(409, stale);
    });
    await groupChanged(groupId);
    res.status(201).json({ offerId: offer.id });
  }));

  app.post("/api/groups/:groupId/ownership-offers/:offerId/:action", route(async (req, res) => {
    const { accountId } = req.user;
    const { groupId, offerId, action } = req.params;
    if (!["accept", "decline"].includes(action) || !/^[0-9a-f]{24}$/.test(offerId)) reject(400, "Invalid offer action");
    const group = await member(groupId, accountId, { write: true });
    await transaction(async (session) => {
      const current = await groups.findOne({
        _id: group._id, state: "active", "ownershipOffer.id": offerId, "ownershipOffer.toAccountId": accountId,
      }, { session });
      const offer = current?.ownershipOffer;
      if (!current || !isCurrentOwnershipOffer(offer, offerId, current.ownerAccountId, accountId)) reject(409, stale);
      await fenceAccounts([offer.fromAccountId, accountId], session);
      const accepted = action === "accept";
      const result = await groups.updateOne({
        _id: group._id, state: "active", ownerAccountId: offer.fromAccountId,
        memberAccountIds: { $all: [offer.fromAccountId, accountId] },
        "ownershipOffer.id": offerId, "ownershipOffer.toAccountId": accountId,
      }, {
        $unset: { ownershipOffer: "" },
        ...(accepted ? {
          $set: { ownerAccountId: accountId },
          $addToSet: { formerOwnerAccountIds: offer.fromAccountId },
        } : {}),
      }, { session });
      if (!result.matchedCount) reject(409, stale);
    });
    await groupChanged(groupId);
    res.json({ success: true });
  }));
}
