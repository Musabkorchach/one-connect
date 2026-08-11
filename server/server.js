import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import { config } from "dotenv";
import { fileURLToPath } from "url";
import { dirname } from "path";

config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    credentials: true,
  },
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Middleware
app.use(cors({ origin: process.env.FRONTEND_URL || "http://localhost:3000" }));
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb" }));

// In-memory storage (replace with MongoDB in production)
const users = new Map();
const conversations = new Map();
const contacts = new Map();
const userSessions = new Map();

// Routes
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Auth: Verify Pi token and create session
app.post("/api/auth/verify", express.json(), async (req, res) => {
  const { accessToken, piUsername } = req.body;

  if (!accessToken || !piUsername) {
    return res.status(400).json({ error: "Missing accessToken or piUsername" });
  }

  try {
    // In production: verify token with Pi server
    const userId = `pi_${piUsername}`;
    const sessionToken = Buffer.from(`${userId}:${Date.now()}`).toString("base64");

    users.set(userId, {
      id: userId,
      piUsername,
      accessToken,
      status: "available",
      statusText: "",
      createdAt: new Date(),
    });

    userSessions.set(sessionToken, { userId, piUsername, accessToken, expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000 });

    res.json({ sessionToken, userId, message: "Authenticated" });
  } catch (error) {
    console.error("Auth error:", error);
    res.status(500).json({ error: "Authentication failed" });
  }
});

// Profile endpoints
app.get("/api/profile/:userId", (req, res) => {
  const user = users.get(req.params.userId);
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json(user);
});

app.put("/api/profile/:userId", express.json(), (req, res) => {
  const user = users.get(req.params.userId);
  if (!user) return res.status(404).json({ error: "User not found" });

  const { displayName, status, statusText, avatar } = req.body;
  Object.assign(user, { displayName, status, statusText, avatar });
  res.json(user);
});

// Contacts endpoints
app.get("/api/contacts/:userId", (req, res) => {
  const userContacts = contacts.get(req.params.userId) || [];
  res.json(userContacts);
});

app.post("/api/contacts/:userId", express.json(), (req, res) => {
  const { username, name } = req.body;
  const userId = req.params.userId;
  const contact = { username, name, addedAt: new Date() };

  if (!contacts.has(userId)) contacts.set(userId, []);
  contacts.get(userId).push(contact);

  res.json(contact);
});

// Messages endpoint
app.post("/api/messages/:userId", express.json(), (req, res) => {
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
io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("user:login", (userId, piUsername) => {
    socket.userId = userId;
    socket.piUsername = piUsername;
    socket.join(`user:${userId}`);
    io.emit("user:online", { userId, piUsername });
  });

  socket.on("message:send", (data) => {
    const { conversationId, kind, text, fileName } = data;
    const message = {
      id: Math.random().toString(36).slice(2),
      fromMe: true,
      kind,
      text,
      fileName,
      status: "delivered",
      at: Date.now(),
    };

    io.to(`conv:${conversationId}`).emit("message:new", message);
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
