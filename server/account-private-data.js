import { accountWrites, respondToBlockedWrite } from "./account-write-fence.js";
import { migrationRequired } from "./pi-login.js";
import { identityBindingsCollection, privateDataOwnerKey } from "./account-identity.js";

const ownerFields = ["accountId", "ownerAccountId", "ownerUserId", "userId", "contactAccountId", "piUid", "privateDataOwner"];
const profileKey = "connect.profile";
const contactsKey = "connect.contacts";
const hasOwner = (value) => value && ownerFields.some((key) => Object.hasOwn(value, key));
const profileFields = {
  displayName: (value) => typeof value === "string" && value.length <= 80,
  status: (value) => ["available", "busy", "away", "dnd", "offline"].includes(value),
  statusText: (value) => typeof value === "string" && value.length <= 160,
  language: (value) => typeof value === "string" && /^[a-z]{2,3}$/.test(value),
  setupDone: (value) => typeof value === "boolean",
  avatar: (value) => value === null || (typeof value === "string" && value.length < 95000 &&
    /^data:image\/(?:png|jpe?g|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/.test(value)),
};

function profilePatch(blob) {
  if (!blob || typeof blob !== "object" || Array.isArray(blob) || hasOwner(blob)) return null;
  const patch = {};
  for (const [field, valid] of Object.entries(profileFields)) {
    if (!Object.hasOwn(blob, field)) continue;
    if (!valid(blob[field])) return null;
    patch[field] = blob[field];
  }
  return Object.keys(patch).length ? patch : null;
}

export async function createPrivateData({ app, db, writeAccount, authenticateSession, normalizeMessagingUsername }) {
  const state = db.collection("account_private_state");
  const contacts = db.collection("account_private_contacts");
  const bindings = db.collection(identityBindingsCollection);
  await Promise.all([
    state.createIndex({ ownerAccountId: 1, key: 1 }, { unique: true }),
    contacts.createIndex({ ownerAccountId: 1, contactAccountId: 1 }, { unique: true }),
  ]);

  async function checkActive(req, res) {
    const accountId = req.user.accountId;
    if (!accountId) {
      res.status(409).json(migrationRequired);
      return false;
    }
    const binding = await bindings.findOne({ accountId }, { projection: { state: 1 } });
    if (binding?.state !== "active") {
      res.status(403).json({
        code: binding?.state === "deleting" ? "ACCOUNT_DELETING" : "ACCOUNT_INACTIVE",
        error: "Account is not active",
      });
      return false;
    }
    return true;
  }

  function requirePrivateSession(req, res, next) {
    return authenticateSession(req, res, async () => {
      try {
        if (!await checkActive(req, res)) return;
        res.set("Cache-Control", "private, no-store");
        if (hasOwner(req.body) || hasOwner(req.query)) {
          return res.status(400).json({ code: "CLIENT_OWNERSHIP_REJECTED", error: "Ownership is assigned by the server session" });
        }
        if (req.params.userId !== undefined && req.params.userId !== req.user.userId) {
          return res.status(403).json({ error: "Access denied" });
        }
        next();
      } catch (error) {
        next(error);
      }
    });
  }

  const owner = (req) => ({ ownerAccountId: req.user.accountId });
  const profileFilter = (req) => ({ ...owner(req), key: profileKey });
  const profileForClient = (req, record) => record ? {
    ...record.blob,
    username: req.user.piUsername,
    piUsername: req.user.piUsername,
  } : null;
  async function saveProfile(req, res, blob) {
    const patch = profilePatch(blob);
    if (!patch) {
      res.status(400).json({ error: "Invalid profile fields" });
      return null;
    }
    if (!await checkActive(req, res)) return null;
    const set = Object.fromEntries(Object.entries(patch).map(([key, value]) => ["blob." + key, value]));
    return accountWrites(state, writeAccount, req.user.accountId).findOneAndUpdate(profileFilter(req), { $set: { ...set, updatedAt: new Date() } },
      { upsert: true, returnDocument: "after" });
  }

  async function contactsForClient(req) {
    const records = await contacts.find(owner(req)).sort({ addedAt: 1, _id: 1 }).toArray();
    const targets = records.length ? await bindings.find(
      { accountId: { $in: records.map(({ contactAccountId }) => contactAccountId) } },
      { projection: { accountId: 1, username: 1, state: 1, privateDataErased: 1 } },
    ).toArray() : [];
    const current = new Map(targets.map((binding) => [binding.accountId, binding]));
    return records.map((record) => {
      const target = current.get(record.contactAccountId);
      const deleting = target?.state === "deleting" && !target.privateDataErased;
      return {
        id: record._id.toHexString(), addedAt: record.addedAt,
        state: target?.state === "active" ? "active" : deleting ? "deleting" : "deleted",
        username: target?.state === "active" ? target.username ?? null : null,
        name: target?.state === "active" ? record.name : deleting ? "الحساب قيد الحذف" : "حساب محذوف",
      };
    });
  }

  function route(handler) {
    return [requirePrivateSession, async (req, res, next) => {
      try { await handler(req, res); } catch (error) { if (!respondToBlockedWrite(error, res)) next(error); }
    }];
  }
  app.get(["/api/profile", "/api/profile/:userId"], ...route(async (req, res) => {
    const record = await state.findOne(profileFilter(req));
    if (await checkActive(req, res)) res.json({ profile: profileForClient(req, record), legacyHistory: migrationRequired });
  }));
  app.put(["/api/profile", "/api/profile/:userId"], ...route(async (req, res) => {
    const saved = await saveProfile(req, res, req.body);
    if (saved) res.json({ profile: profileForClient(req, saved), legacyHistory: migrationRequired });
  }));
  app.get(["/api/contacts", "/api/contacts/:userId"], ...route(async (req, res) => {
    const records = await contactsForClient(req);
    if (await checkActive(req, res)) res.json({ contacts: records, legacyHistory: migrationRequired });
  }));
  app.post(["/api/contacts", "/api/contacts/:userId"], ...route(async (req, res) => {
    const username = normalizeMessagingUsername(req.body?.username);
    const name = req.body?.name;
    if (!username || (name !== undefined && (typeof name !== "string" || name.length > 80))) {
      return res.status(400).json({ error: "Invalid contact" });
    }
    const targets = await bindings.find({ username, state: "active" }).limit(2).toArray();
    if (targets.length !== 1 || targets[0].accountId === req.user.accountId) {
      return res.status(404).json({ error: "Active contact not found" });
    }
    if (!await checkActive(req, res)) return;
    const identity = { ...owner(req), contactAccountId: targets[0].accountId };
    await accountWrites(contacts, writeAccount, [req.user.accountId, targets[0].accountId]).updateOne(identity, {
      $setOnInsert: { name: name?.trim() || username, addedAt: new Date() },
    }, { upsert: true });
    res.status(201).json({ success: true });
  }));

  async function readSpecialState(req, res, key) {
    if (key === contactsKey) {
      const items = await contactsForClient(req);
      if (await checkActive(req, res)) res.json({ blob: { items }, legacyHistory: migrationRequired });
      return true;
    }
    if (key === profileKey) {
      const record = await state.findOne(profileFilter(req));
      if (await checkActive(req, res)) res.json({ blob: profileForClient(req, record), legacyHistory: migrationRequired });
      return true;
    }
    return false;
  }

  async function writeSpecialState(req, res, key, blob) {
    if (hasOwner(blob)) {
      res.status(400).json({ code: "CLIENT_OWNERSHIP_REJECTED", error: "Ownership is assigned by the server session" });
      return true;
    }
    if (key === contactsKey) {
      res.status(409).json({ code: "CONTACTS_REQUIRE_ACCOUNT_ROUTES", error: "Use the account contacts endpoint" });
      return true;
    }
    if (key === profileKey) {
      if (await saveProfile(req, res, blob)) res.status(204).end();
      return true;
    }
    if (key === "connect.invoice-drafts") {
      const ownerKey = privateDataOwnerKey(req.user.accountId);
      if (blob.schemaVersion !== "1.0" || !Array.isArray(blob.items) || blob.items.length > 50 ||
          !blob.items.every((item) => item?.createdByUserId === ownerKey && !hasOwner(item))) {
        res.status(400).json({ code: "CLIENT_OWNERSHIP_REJECTED", error: "Invalid account draft ownership" });
        return true;
      }
    }
    return false;
  }

  return { state, owner, requirePrivateSession, checkActive, readSpecialState, writeSpecialState };
}
