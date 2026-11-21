import { ObjectId } from "mongodb";
import { accountIdentityIndexes, identityBindingsCollection } from "./account-identity.js";
import { migrationRequired } from "./pi-login.js";

export const scopedEmail = { accountScoped: true };
export const legacyEmailScope = { accountScoped: { $ne: true } };

export function emailViewer(accountId, username) {
  return accountId ? {
    scope: scopedEmail,
    sender: { senderAccountId: accountId },
    recipient: { recipientAccountId: accountId },
    owner: { ownerAccountId: accountId },
  } : {
    scope: legacyEmailScope,
    sender: { senderUsername: username },
    recipient: { recipientUsername: username },
    owner: { ownerUsername: username },
  };
}

export function senderEmailKey(accountId, username, id) {
  const viewer = emailViewer(accountId, username);
  return { ...viewer.scope, ...viewer.sender, ...(accountId ? { accountMessageId: id } : { id }) };
}

export function findEmailAccount(db, accountId) {
  if (typeof accountId !== "string" || !accountId) return null;
  return db.collection(identityBindingsCollection).findOne({ accountId });
}

export async function findActiveEmailAccount(db, accountId) {
  const account = await findEmailAccount(db, accountId);
  return account?.state === "active" ? account : null;
}

export function emailAccountUnavailable(account) {
  return account?.state === "deleting"
    ? { code: "ACCOUNT_DELETING", error: "Account deletion is in progress" }
    : { code: "ACCOUNT_INACTIVE", error: "Account is not active" };
}

export async function createEmailAccess({ db, bindAccounts, authenticateSession }) {
  const emails = db.collection("emails");
  const bindings = db.collection(identityBindingsCollection);
  const legacyRecipients = db.collection("email_users");
  if (bindAccounts) {
    await emails.createIndex(
      { senderAccountId: 1, accountMessageId: 1 },
      {
        name: "unique_account_message",
        unique: true,
        partialFilterExpression: { accountScoped: true, accountMessageId: { $type: "string" } },
      },
    );
    await bindings.createIndexes(accountIdentityIndexes);
    await bindings.createIndex({ username: 1, state: 1 }, { name: "email_recipient_lookup" });
  }

  function requireEmailSession(req, res, next) {
    return authenticateSession(req, res, async () => {
      if (!bindAccounts) return next();
      if (!req.user.accountId) return res.status(409).json(migrationRequired);
      try {
        const account = await findEmailAccount(db, req.user.accountId);
        if (account?.state !== "active") {
          return res.status(403).json(emailAccountUnavailable(account));
        }
        return next();
      } catch (error) {
        next(error);
      }
    });
  }

  async function findEmailRecipient(username) {
    if (!bindAccounts) return legacyRecipients.findOne({ _id: username });
    const matches = await bindings.find(
      { username, state: "active", accountId: { $type: "string" } },
      { projection: { accountId: 1 } },
    ).limit(2).toArray();
    return matches.length === 1 ? matches[0] : null;
  }

  async function emailNotFound(res, accountId, id, error) {
    if (accountId && await emails.findOne(
      { _id: new ObjectId(id), ...legacyEmailScope },
      { projection: { _id: 1 } },
    )) {
      return res.status(409).json(migrationRequired);
    }
    return res.status(404).json({ error });
  }

  return { requireEmailSession, findEmailRecipient, emailNotFound };
}
