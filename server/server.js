import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { MongoClient } from "mongodb";
import cors from "cors";
import { config } from "dotenv";
import dns from "dns";
import { fileURLToPath } from "url";
import { dirname } from "path";
import crypto from "node:crypto";

config();

dns.setServers(["8.8.8.8"]);

const mongoClient = new MongoClient(process.env.MONGODB_URI);

await mongoClient.connect();
console.log("MongoDB connected successfully");

const db = mongoClient.db("oneconnect");
const messagesCollection = db.collection("messages");
await messagesCollection.createIndex(
  { senderUsername: 1, id: 1 },
  {
    unique: true,
    name: "unique_sender_message",
    partialFilterExpression: {
      senderUsername: { $type: "string" },
      id: { $type: "string" },
    },
  }
);
const contactsCollection = db.collection("contacts");
await contactsCollection.createIndex(
  { ownerUserId: 1, username: 1 },
  { unique: true, name: "unique_owner_contact" }
);

const allowedOrigins = [
  process.env.FRONTEND_URL,
  "https://one-connect-lake.vercel.app",
  "https://one-connect-git-develop-musabkorchachs-projects.vercel.app",
  "https://demo-kzmkra2mcgav4p1ncaco.vusercontent.net",
  "http://localhost:3000",
].filter(Boolean);
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    credentials: true,
  },
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Middleware
app.use(cors({
  origin: allowedOrigins,
  credentials: true,
}));
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb" }));
app.use(express.static(new URL("../public", import.meta.url).pathname));

// In-memory storage (replace with MongoDB in production)
const users = new Map();
const conversations = new Map();
const contacts = new Map();
const userSessions = new Map();

function requireSession(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing session token" });
  }

  const sessionToken = authHeader.substring(7);
  const session = userSessions.get(sessionToken);

  if (!session) {
    return res.status(401).json({ error: "Invalid session token" });
  }

  if (session.expiresAt < Date.now()) {
    userSessions.delete(sessionToken);
    return res.status(401).json({ error: "Session expired" });
  }

  req.user = {
    userId: session.userId,
    piUsername: session.piUsername,
  };

  next();
}

// Routes
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Auth: Verify Pi token and create session
app.post("/api/auth/verify", express.json(), async (req, res) => {
  const { accessToken } = req.body;

  if (!accessToken) {
  return res.status(400).json({ error: "Missing accessToken" });
}

  try {
    // In production: verify token with Pi server
    const piResponse = await fetch("https://api.minepi.com/v2/me", {
  headers: {
    Authorization: `Bearer ${accessToken}`,
  },
});

if (!piResponse.ok) {
  return res.status(401).json({ error: "Invalid Pi access token" });
}

const piUser = await piResponse.json();
const piUsername = piUser.username;
if (!piUsername) {
  return res.status(401).json({ error: "Pi user identity not available" });
}
    const userId = `pi_${piUsername}`;
    const sessionToken = crypto.randomBytes(32).toString("hex");

    users.set(userId, {
      id: userId,
      piUsername,
      accessToken,
      status: "available",
      statusText: "",
      createdAt: new Date(),
    });

    userSessions.set(sessionToken, { userId, piUsername, accessToken, expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000 });

    res.json({ sessionToken, userId, piUsername, message: "Authenticated" });
  } catch (error) {
    console.error("Auth error:", error);
    res.status(500).json({ error: "Authentication failed" });
  }
});
// Revoke the current authenticated session
app.post("/api/auth/logout", requireSession, (req, res) => {
  const sessionToken = req.headers.authorization.substring(7);

  userSessions.delete(sessionToken);
  for (const socket of io.sockets.sockets.values()) {
  if (socket.sessionToken === sessionToken) {
    socket.disconnect(true);
  }
}

  res.json({ success: true });
});
// Profile endpoints
app.get("/api/profile/:userId", requireSession, (req, res) => {
    if (req.params.userId !== req.user.userId) {
    return res.status(403).json({ error: "Access denied" });
  }

  const user = users.get(req.params.userId);
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json(user);
});

app.put("/api/profile/:userId", requireSession, express.json(), (req, res) => {
    if (req.params.userId !== req.user.userId) {
    return res.status(403).json({ error: "Access denied" });
  }

  const user = users.get(req.params.userId);
  if (!user) return res.status(404).json({ error: "User not found" });

  const { displayName, status, statusText, avatar } = req.body;
  Object.assign(user, { displayName, status, statusText, avatar });
  res.json(user);
});

// Contacts endpoints
app.get("/api/contacts/:userId", requireSession, async (req, res) => {
  if (req.params.userId !== req.user.userId) {
    return res.status(403).json({
      error: "Access denied",
    });
  }
  const userContacts = await contactsCollection.find(
  { ownerUserId: req.user.userId },
  { projection: { _id: 0, ownerUserId: 0 } }
).toArray();
  res.json(userContacts);
});

app.post("/api/contacts/:userId", requireSession, express.json(), async (req, res) => {
  if (req.params.userId !== req.user.userId) {
    return res.status(403).json({
      error: "Access denied",
    });
  }
  const { username, name } = req.body;
  if (
  typeof username !== "string" ||
  !/^[a-zA-Z0-9._-]{1,32}$/.test(username) ||
  username !== username.toLowerCase() ||
  username === req.user.piUsername?.toLowerCase()
) {
  return res.status(400).json({
    error: "Invalid contact username",
  });
}
  const userId = req.params.userId;
  const contact = { username, name, addedAt: new Date() };

  try {
  await contactsCollection.updateOne(
    {
      ownerUserId: req.user.userId,
      username,
    },
    {
      $setOnInsert: {
        ownerUserId: req.user.userId,
        username,
        name,
        addedAt: new Date(),
      },
    },
    { upsert: true }
  );
} catch (error) {
  console.error("[CONTACT SAVE ERROR]", error);
  return res.status(500).json({
    error: "Failed to save contact",
  });
}

  res.json(contact);
});

// Messages endpoint
app.post("/api/messages/:userId", requireSession, express.json(), (req, res) => {
    if (req.params.userId !== req.user.userId) {
    return res.status(403).json({ error: "Access denied" });
  }

  const { conversationId, kind, text, fileName } = req.body;
  const message = {
    id: Math.random().toString(36).slice(2),
    fromMe: true,
    kind,
    text,
    fileName,
    status: "sent",
    at: Date.now(),
  };

  res.json(message);
});

// WebSocket handlers
io.use((socket, next) => {
  const sessionToken = socket.handshake.auth?.sessionToken;

  if (typeof sessionToken !== "string" || !sessionToken) {
    return next(new Error("Authentication required"));
  }

  const session = userSessions.get(sessionToken);

  if (!session || session.expiresAt <= Date.now()) {
    return next(new Error("Invalid or expired session"));
  }

  socket.userId = session.userId;
  socket.piUsername = session.piUsername;
  socket.sessionToken = sessionToken;

  next();
});
io.on("connection", (socket) => {
  console.log("User connected:", socket.id);
  socket.join(`user:${socket.userId}`);

  socket.on("conversation:join", async (conversationId) => {
  return socket.emit("conversation:error", { error: "Conversation access verification pending" });

  const messages = await messagesCollection
    .find({
  $or: [
    {
      senderUsername: socket.piUsername,
      recipientUsername: conversationId,
    },
    {
      senderUsername: conversationId,
      recipientUsername: socket.piUsername,
    },
  ],
})
    .sort({ at: 1 })
    .toArray();

  socket.emit("conversation:messages", messages);
});

  socket.on("user:login", () => {
  const userId = socket.userId;
  const piUsername = socket.piUsername;

  if (!userId || !piUsername) return;

  socket.join(`user:${userId}`);
  io.emit("user:online", { userId, piUsername });
});

  socket.on("message:send", async (data) => {
    if (!data || typeof data !== "object" || Array.isArray(data)) {
  return socket.emit("message:error", {
    error: "Invalid message data",
  });
}
    const { conversationId, kind, text, fileName, messageId } = data;
        if (
      typeof messageId !== "string" ||
      !/^[a-zA-Z0-9_-]{1,100}$/.test(messageId)
    ) {
      return socket.emit("message:error", {
        error: "Invalid message ID",
      });
    }
    if (
  typeof kind !== "string" ||
  !["text", "image", "file", "video", "voice"].includes(kind) ||
  typeof text !== "string" ||
  text.length > 10000 ||
  (fileName !== undefined &&
    (typeof fileName !== "string" || fileName.length > 255))
) {
  return socket.emit("message:error", {
    error: "Invalid message content",
  });
}
    if (
  typeof conversationId !== "string" ||
  !/^[a-zA-Z0-9_]{1,50}$/.test(conversationId) ||
  conversationId === socket.piUsername
) {
  return socket.emit("message:error", {
    error: "Invalid recipient",
  });
}
    const message = {
      id: messageId,
      senderUsername: socket.piUsername,
      recipientUsername: conversationId,
      kind,
      text,
      fileName,
      status: "sent",
      at: Date.now(),
    };

        try {
      await messagesCollection.insertOne({
        conversationId,
        ...message,
      });
    } catch (error) {
      console.error("[MESSAGE SAVE ERROR]", error);

      return socket.emit("message:error", {
        id: message.id,
        error: "Message could not be saved",
      });
    }

    socket.emit("message:saved", { id: message.id, status: "sent" });

    io.to(`user:pi_${conversationId}`).emit("message:new", message);
  });

  socket.on("status:update", (userId, status, statusText) => {
    const user = users.get(userId);
    if (user) {
      user.status = status;
      user.statusText = statusText;
      io.emit("user:status", { userId, status, statusText });
    }
  });

  socket.on("call:initiate", (data) => {
    const { from, to, offer } = data;
    io.to(`user:${to}`).emit("call:incoming", { from, offer });
  });

  socket.on("call:answer", (data) => {
    const { from, to, answer } = data;
    io.to(`user:${from}`).emit("call:answered", { to, answer });
  });

  socket.on("call:ice-candidate", (data) => {
    const { from, to, candidate } = data;
    io.to(`user:${to}`).emit("call:ice-candidate", { from, candidate });
  });

  socket.on("disconnect", () => {
    if (socket.userId) {
      io.emit("user:offline", { userId: socket.userId, piUsername: socket.piUsername });
    }
    console.log("User disconnected:", socket.id);
  });
});

// Error handling
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

// Start server
const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Frontend URL: ${process.env.FRONTEND_URL || "http://localhost:3000"}`);
});
