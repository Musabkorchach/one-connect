import { emailAccountUnavailable, findEmailAccount } from "./email-account-access.js";

const accountRoom = (accountId) => `email:account:${accountId}`;

export function createEmailSocket({ io, db, bindAccounts, userSessions }) {
  if (!bindAccounts) {
    return {
      publishEmailEvent: ({ username }, event, payload) => io.to(`peer:${username}`).emit(event, payload),
      disconnectEmailSession: () => {},
    };
  }

  // Keep the experimental sockets outside the namespace used by chat and calls.
  const email = io.of("/email");
  email.use(async (socket, next) => {
    const token = socket.handshake.auth?.sessionToken;
    const session = typeof token === "string" && userSessions.get(token);
    if (!session?.accountId || session.expiresAt <= Date.now()) {
      return next(new Error("Invalid or expired session"));
    }

    try {
      const account = await findEmailAccount(db, session.accountId);
      if (account?.state !== "active") {
        const unavailable = emailAccountUnavailable(account);
        const error = new Error(unavailable.error);
        error.data = { code: unavailable.code };
        return next(error);
      }
      socket.data.accountId = session.accountId;
      socket.data.sessionToken = token;
      socket.data.expiresAt = session.expiresAt;
      next();
    } catch (error) {
      console.error("[EMAIL SOCKET AUTH ERROR]", error);
      next(new Error("Email socket authentication failed"));
    }
  });

  email.on("connection", (socket) => {
    const { accountId, sessionToken, expiresAt } = socket.data;
    if (userSessions.get(sessionToken)?.accountId !== accountId || expiresAt <= Date.now()) {
      socket.disconnect();
      return;
    }
    socket.join(accountRoom(accountId));
    const expiry = setTimeout(() => socket.disconnect(), expiresAt - Date.now());
    expiry.unref();
    socket.once("disconnect", () => clearTimeout(expiry));
  });

  async function publishEmailEvent({ accountId }, event, payload) {
    if (!accountId) return;
    const room = email.to(accountRoom(accountId));
    try {
      // A login may predate deletion. Check again at every publication.
      const account = await findEmailAccount(db, accountId);
      if (account?.state !== "active") {
        room.emit("email:unavailable", emailAccountUnavailable(account));
        room.disconnectSockets();
        return;
      }
      room.emit(event, payload);
    } catch (error) {
      // The HTTP write may already be committed. Suppress the event on lookup failure.
      console.error("[EMAIL SOCKET PUBLISH ERROR]", error);
    }
  }

  function disconnectEmailSession(token) {
    for (const socket of email.sockets.values()) {
      if (socket.data.sessionToken === token) socket.disconnect();
    }
  }

  return { publishEmailEvent, disconnectEmailSession };
}
