import { randomBytes } from "node:crypto";
import { identityBindingsCollection, privateDataOwnerKey, resolveVerifiedPiAccount } from "./account-identity.js";

export const migrationRequired = {
  code: "ACCOUNT_MIGRATION_REQUIRED",
  error: "Account data migration is required before history and other account data can be accessed.",
};

export function isAccountBindingEnabled(env) {
  return env.NODE_ENV === "test" && env.ONE_CONNECT_TEST_ACCOUNT_BINDING === "1";
}

export function assertLocalAccountBindingDatabase(options) {
  if (options.srvHost || options.directConnection !== true || options.hosts?.length !== 1 ||
      !["127.0.0.1", "::1"].includes(options.hosts[0].host)) {
    throw new Error("Experimental account binding requires a direct loopback MongoDB connection");
  }
}

export function createVerifyPiLogin({
  db, emailUsersCollection, users, userSessions,
  normalizeMessagingUsername, bindAccounts, verifyFetch = fetch,
}) {
  return async (req, res) => {
    const { accessToken } = req.body;
    if (!accessToken) {
      return res.status(400).json({ error: "Missing accessToken" });
    }

    try {
      const piResponse = await verifyFetch("https://api.minepi.com/v2/me", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!piResponse.ok) {
        return res.status(401).json({ error: "Invalid Pi access token" });
      }

      const { uid, username: piUsername } = await piResponse.json();
      if (!piUsername) {
        return res.status(401).json({ error: "Pi user identity not available" });
      }
      const messagingUsername = normalizeMessagingUsername(piUsername);
      if (!messagingUsername) {
        return res.status(401).json({ error: "Invalid Pi username" });
      }

      const userId = `pi_${piUsername}`;
      let accountId;
      if (bindAccounts) {
        if (typeof uid !== "string" || !uid || uid !== uid.trim()) {
          return res.status(401).json({ error: "Verified Pi UID not available" });
        }
        const binding = await resolveVerifiedPiAccount(db, uid, messagingUsername);
        if (binding.state === "deleting") {
          return res.status(409).json({
            code: "ACCOUNT_DELETING",
            error: "Account deletion is in progress",
          });
        }
        accountId = binding.accountId;
      } else {
        await emailUsersCollection.updateOne(
          { _id: messagingUsername },
          {
            $set: {
              userId,
              piUsername: messagingUsername,
            },
            $setOnInsert: {
              createdAt: Date.now(),
            },
          },
          { upsert: true },
        );
        users.set(userId, {
          id: userId,
          piUsername,
          accessToken,
          status: "available",
          statusText: "",
          createdAt: new Date(),
        });
      }

      const sessionToken = randomBytes(32).toString("hex");
      userSessions.set(sessionToken, {
        userId, piUsername, accessToken,
        expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
        ...(bindAccounts ? { accountId } : {}),
      });
      if (bindAccounts && !(await db.collection(identityBindingsCollection).findOne({ accountId, state: "active" }))) {
        userSessions.delete(sessionToken);
        return res.status(409).json({ code: "ACCOUNT_DELETING", error: "Account is no longer active" });
      }
      if (!userSessions.has(sessionToken)) return res.status(409).json({ code: "ACCOUNT_DELETING", error: "Account is no longer active" });
      res.json({
        sessionToken, userId, piUsername, message: "Authenticated",
        ...(bindAccounts ? { accountDeletionSupported: true, accountDataStatus: migrationRequired.code, emailSocketMode: "account", chatSocketMode: "account", groupSocketMode: "account", callSocketMode: "account", privateDataOwner: privateDataOwnerKey(accountId) } : {}),
      });
    } catch (error) {
      console.error("Auth error:", error);
      res.status(500).json({ error: "Authentication failed" });
    }
  };
}
