import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { MongoClient, GridFSBucket, ObjectId } from "mongodb";
import multer from "multer";
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
const chatImagesBucket = new GridFSBucket(db, {
  bucketName: "chat_images",
});

const chatAttachmentsBucket = new GridFSBucket(db, {
  bucketName: "chat_attachments",
});
const chatImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1,
    fields: 1,
    parts: 3,
  },
});

const chatAttachmentUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024,
    files: 1,
    fields: 2,
    parts: 4,
  },
});

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

const appStateCollection = db.collection("app_state");

await appStateCollection.createIndex(
  { ownerUserId: 1, key: 1 },
  { unique: true, name: "unique_owner_state_key" }
);

const allowedStateKeys = new Set([
  "connect.profile",
  "connect.contacts",
  "connect.requests",
  "connect.chats",
  "connect.calls",
  "connect.emails",
  "connect.groups",
]);

const allowedOrigins = [
  process.env.FRONTEND_URL,
  ...(process.env.CORS_EXTRA_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
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

function detectChatImageType(buffer) {
  if (!Buffer.isBuffer(buffer)) return null;

  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
    )
  ) return "image/png";

  if (
    buffer.length >= 3 &&
    buffer[0] === 255 &&
    buffer[1] === 216 &&
    buffer[2] === 255
  ) return "image/jpeg";

  if (
    buffer.length >= 6 &&
    ["GIF87a", "GIF89a"].includes(buffer.toString("ascii", 0, 6))
  ) return "image/gif";

  if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) return "image/webp";

  return null;
}

function detectChatVideoType(buffer) {
  if (!Buffer.isBuffer(buffer)) return null;

  if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 4, 8) === "ftyp" &&
    buffer.toString("ascii", 8, 12) !== "qt  "
  ) {
    return "video/mp4";
  }

  if (
    buffer.length >= 4 &&
    buffer.subarray(0, 4).equals(
      Buffer.from([0x1a, 0x45, 0xdf, 0xa3]),
    ) &&
    buffer.subarray(0, 4096).includes(Buffer.from("webm"))
  ) {
    return "video/webm";
  }

  return null;
}

function detectChatAudioType(buffer) {
  if (!Buffer.isBuffer(buffer)) return null;

  if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WAVE"
  ) {
    return "audio/wav";
  }

  if (
    buffer.length >= 4 &&
    buffer.toString("ascii", 0, 4) === "OggS"
  ) {
    return "audio/ogg";
  }

  if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 4, 8) === "ftyp" &&
    buffer.toString("ascii", 8, 12) !== "qt  "
  ) {
    return "audio/mp4";
  }

  if (
    buffer.length >= 4 &&
    buffer.subarray(0, 4).equals(
      Buffer.from([0x1a, 0x45, 0xdf, 0xa3]),
    ) &&
    buffer.subarray(0, 4096).includes(Buffer.from("webm"))
  ) {
    return "audio/webm";
  }

  return null;
}

function normalizeMessagingUsername(value) {
  if (typeof value !== "string") return "";

  const username = value.trim().replace(/^@+/, "").toLowerCase();

  return /^[a-z0-9._-]{1,32}$/.test(username)
    ? username
    : "";
}

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

app.get("/api/state/:key", requireSession, async (req, res) => {
  const { key } = req.params;
  res.set("Cache-Control", "no-store");

  if (!allowedStateKeys.has(key)) {
    return res.status(400).json({ error: "Invalid state key" });
  }

  try {
    const record = await appStateCollection.findOne(
      { ownerUserId: req.user.userId, key },
      { projection: { _id: 0, blob: 1 } }
    );

    return res.json(record ? { blob: record.blob } : null);
  } catch (error) {
    console.error("[APP STATE LOAD ERROR]", error);
    return res.status(500).json({ error: "State could not be loaded" });
  }
});

app.put("/api/state/:key", requireSession, async (req, res) => {
  const { key } = req.params;
  const blob = req.body?.blob;

  if (!allowedStateKeys.has(key)) {
    return res.status(400).json({ error: "Invalid state key" });
  }

  if (!blob || typeof blob !== "object" || Array.isArray(blob)) {
    return res.status(400).json({ error: "Invalid state data" });
  }

  if (Buffer.byteLength(JSON.stringify(blob), "utf8") > 256 * 1024) {
    return res.status(413).json({ error: "State data is too large" });
  }

  try {
    await appStateCollection.updateOne(
      { ownerUserId: req.user.userId, key },
      {
        $set: {
          blob,
          updatedAt: new Date(),
        },
      },
      { upsert: true }
    );

    return res.status(204).end();
  } catch (error) {
    console.error("[APP STATE SAVE ERROR]", error);
    return res.status(500).json({ error: "State could not be saved" });
  }
});

app.post("/api/chat/attachments", requireSession, (req, res) => {
  chatAttachmentUpload.single("file")(req, res, async (uploadError) => {
    if (uploadError) {
      return res.status(
        uploadError.code === "LIMIT_FILE_SIZE" ? 413 : 400,
      ).json({
        error: uploadError.code === "LIMIT_FILE_SIZE"
          ? "Attachment must be 25 MB or smaller"
          : "Invalid attachment upload",
      });
    }

    const senderUsername = normalizeMessagingUsername(req.user.piUsername);
    const recipientUsername = normalizeMessagingUsername(req.body?.recipient);
    const kind = req.body?.kind;
    const file = req.file;

    if (
      !senderUsername ||
      !recipientUsername ||
      senderUsername === recipientUsername ||
      !["file", "video", "voice"].includes(kind)
    ) {
      return res.status(400).json({ error: "Invalid attachment details" });
    }

    if (!file || !file.buffer.length) {
      return res.status(400).json({ error: "Attachment file is required" });
    }

    if (kind === "voice" && file.size > 5 * 1024 * 1024) {
  return res.status(413).json({
    error: "Voice message must be 5 MB or smaller",
  });
}

const mimeType = kind === "video"
  ? detectChatVideoType(file.buffer)
  : kind === "voice"
    ? detectChatAudioType(file.buffer)
    : "application/octet-stream";

if (!mimeType) {
  return res.status(415).json({
    error: kind === "voice"
      ? "Supported audio: WebM, MP4, Ogg and WAV"
      : "Supported videos: MP4 and WebM",
  });
}

    const fileName = file.originalname
      .replace(/[/\\\u0000-\u001f\u007f]/g, "_")
      .slice(0, 120) || (kind === "video" ? "video" : "file");

    try {
      const uploadStream = chatAttachmentsBucket.openUploadStream(fileName, {
        metadata: {
          ownerUserId: req.user.userId,
          senderUsername,
          recipientUsername,
          kind,
          mimeType,
        },
      });

      await new Promise((resolve, reject) => {
        uploadStream.once("error", reject);
        uploadStream.once("finish", resolve);
        uploadStream.end(file.buffer);
      });

      return res.status(201).json({
        attachmentId: uploadStream.id.toHexString(),
        kind,
        fileName,
        mimeType,
        fileSize: file.size,
      });
    } catch (error) {
      console.error("[CHAT ATTACHMENT UPLOAD ERROR]", error);
      return res.status(500).json({
        error: "Attachment could not be uploaded",
      });
    }
  });
});

app.post("/api/chat/images", requireSession, (req, res) => {
  chatImageUpload.single("file")(req, res, async (uploadError) => {
    if (uploadError) {
      return res.status(
        uploadError.code === "LIMIT_FILE_SIZE" ? 413 : 400
      ).json({
        error: uploadError.code === "LIMIT_FILE_SIZE"
          ? "Image must be 5 MB or smaller"
          : "Invalid image upload",
      });
    }

    const senderUsername = normalizeMessagingUsername(req.user.piUsername);
    const recipientUsername = normalizeMessagingUsername(req.body?.recipient);
    const file = req.file;

    if (
      !senderUsername ||
      !recipientUsername ||
      senderUsername === recipientUsername
    ) {
      return res.status(400).json({ error: "Invalid recipient" });
    }

    if (!file || !file.buffer.length) {
      return res.status(400).json({ error: "Image file is required" });
    }

    const mimeType = detectChatImageType(file.buffer);

    if (!mimeType) {
      return res.status(415).json({
        error: "Supported images: PNG, JPEG, GIF and WebP",
      });
    }

    const fileName = file.originalname
      .replace(/[/\\\u0000-\u001f\u007f]/g, "_")
      .slice(0, 120) || "image";

    try {
      const uploadStream = chatImagesBucket.openUploadStream(fileName, {
        metadata: {
          ownerUserId: req.user.userId,
          senderUsername,
          recipientUsername,
          mimeType,
        },
      });

      await new Promise((resolve, reject) => {
        uploadStream.once("error", reject);
        uploadStream.once("finish", resolve);
        uploadStream.end(file.buffer);
      });

      return res.status(201).json({
        imageId: uploadStream.id.toHexString(),
        fileName,
        mimeType,
        fileSize: file.size,
      });
    } catch (error) {
      console.error("[CHAT IMAGE UPLOAD ERROR]", error);
      return res.status(500).json({
        error: "Image could not be uploaded",
      });
    }
  });
});

app.get(
  "/api/chat/attachments/:attachmentId",
  requireSession,
  async (req, res) => {
    const { attachmentId } = req.params;

    if (!/^[a-fA-F0-9]{24}$/.test(attachmentId)) {
      return res.status(400).json({ error: "Invalid attachment ID" });
    }

    try {
      const id = new ObjectId(attachmentId);
      const attachment = await chatAttachmentsBucket.find({ _id: id }).next();
      const username = normalizeMessagingUsername(req.user.piUsername);

      if (
        !attachment ||
        !username ||
        (
          attachment.metadata?.senderUsername !== username &&
          attachment.metadata?.recipientUsername !== username
        )
      ) {
        return res.status(404).json({ error: "Attachment not found" });
      }

      const kind = attachment.metadata?.kind;
      const mimeType = kind === "file"
        ? "application/octet-stream"
        : attachment.metadata?.mimeType;

      if (
        !["file", "video", "voice"].includes(kind) ||
        (kind === "video" &&
          !["video/mp4", "video/webm"].includes(mimeType)) ||
        (kind === "voice" &&
          !["audio/webm", "audio/mp4", "audio/ogg", "audio/wav"]
            .includes(mimeType))
      ) {
        return res.status(415).json({ error: "Unsupported attachment type" });
    }

      const encodedName = encodeURIComponent(
        attachment.filename || "attachment",
      ).replace(
        /['()*]/g,
        (character) =>
          `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
      );

      res.set({
        "Content-Type": mimeType,
        "Content-Length": String(attachment.length),
        "Content-Disposition":
          `attachment; filename="attachment"; filename*=UTF-8''${encodedName}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      });

      const downloadStream = chatAttachmentsBucket.openDownloadStream(id);

      downloadStream.on("error", (error) => {
        console.error("[CHAT ATTACHMENT READ ERROR]", error);

        if (!res.headersSent) {
          res.removeHeader("Content-Length");
          res.status(500).end();
        } else {
          res.destroy();
        }
      });

      res.on("close", () => downloadStream.destroy());
      downloadStream.pipe(res);
    } catch (error) {
      console.error("[CHAT ATTACHMENT LOAD ERROR]", error);

      if (!res.headersSent) {
        return res.status(500).json({
          error: "Attachment could not be loaded",
        });
      }
    }
  },
);

app.get("/api/chat/images/:imageId", requireSession, async (req, res) => {
  const { imageId } = req.params;

  if (!/^[a-fA-F0-9]{24}$/.test(imageId)) {
    return res.status(400).json({ error: "Invalid image ID" });
  }

  try {
    const id = new ObjectId(imageId);
    const image = await chatImagesBucket.find({ _id: id }).next();
    const username = normalizeMessagingUsername(req.user.piUsername);

    if (
      !image ||
      !username ||
      (
        image.metadata?.senderUsername !== username &&
        image.metadata?.recipientUsername !== username
      )
    ) {
      return res.status(404).json({ error: "Image not found" });
    }

    const mimeType = image.metadata?.mimeType;

    if (
      !["image/png", "image/jpeg", "image/gif", "image/webp"]
        .includes(mimeType)
    ) {
      return res.status(415).json({ error: "Unsupported image type" });
    }

    res.set({
      "Content-Type": mimeType,
      "Content-Length": String(image.length),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": "inline",
    });

    const downloadStream = chatImagesBucket.openDownloadStream(id);

    downloadStream.on("error", (error) => {
      console.error("[CHAT IMAGE READ ERROR]", error);

      if (!res.headersSent) {
        res.removeHeader("Content-Length");
        res.status(500).end();
      } else {
        res.destroy();
      }
    });

    res.on("close", () => downloadStream.destroy());
    downloadStream.pipe(res);
  } catch (error) {
    console.error("[CHAT IMAGE LOAD ERROR]", error);

    if (!res.headersSent) {
      return res.status(500).json({
        error: "Image could not be loaded",
      });
    }
  }
});

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

app.get("/api/calls/ice-servers", requireSession, async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const cloudflareId = process.env.CLOUDFLARE_TURN_TOKEN_ID?.trim();
  const cloudflareToken = process.env.CLOUDFLARE_TURN_API_TOKEN?.trim();

  if (cloudflareId || cloudflareToken) {
    if (
      !cloudflareId ||
      !/^[a-f0-9]{32}$/i.test(cloudflareId) ||
      !cloudflareToken
    ) {
      return res.status(503).json({
        error: "Incomplete Cloudflare TURN configuration",
      });
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7000);

    try {
      const response = await fetch(
        `https://rtc.live.cloudflare.com/v1/turn/keys/${cloudflareId}/credentials/generate-ice-servers`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${cloudflareToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ ttl: 86400 }),
          signal: controller.signal,
          redirect: "error",
        },
      );

      if (!response.ok) {
        throw new Error("TURN credential generation failed");
      }

      const data = await response.json();
      const servers = data?.iceServers;

      if (
        !Array.isArray(servers) ||
        servers.length === 0 ||
        servers.length > 10 ||
        !servers.every((server) => {
          const urls =
            typeof server?.urls === "string"
              ? [server.urls]
              : server?.urls;

          if (
            !Array.isArray(urls) ||
            urls.length === 0 ||
            urls.length > 8 ||
            !urls.every(
              (url) =>
                typeof url === "string" &&
                /^(stun|stuns|turn|turns):[^\s]+$/i.test(url),
            )
          ) {
            return false;
          }

          return (
            !urls.some((url) => /^turns?:/i.test(url)) ||
            (typeof server.username === "string" &&
              server.username.length > 0 &&
              typeof server.credential === "string" &&
              server.credential.length > 0)
          );
        }) ||
        !servers.some((server) => {
          const urls = Array.isArray(server.urls)
            ? server.urls
            : [server.urls];

          return urls.some((url) => /^turns?:/i.test(url));
        })
      ) {
        throw new Error("Invalid TURN configuration response");
      }

      return res.json({
        iceServers: servers,
        relayConfigured: true,
      });
    } catch {
      return res.status(502).json({
        error: "Unable to generate TURN credentials",
      });
    } finally {
      clearTimeout(timer);
    }
  }

  const iceServers = [
    { urls: "stun:stun.l.google.com:19302" },
  ];

  const urls = (process.env.TURN_URLS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  const sharedSecret = process.env.TURN_SHARED_SECRET;
  let username = process.env.TURN_USERNAME;
  let credential = process.env.TURN_CREDENTIAL;

  const hasTurnSettings =
    urls.length > 0 || sharedSecret || username || credential;

  if (hasTurnSettings) {
    if (
      urls.length === 0 ||
      urls.length > 8 ||
      urls.some((url) => !/^turns?:[^\s]+$/i.test(url))
    ) {
      return res.status(503).json({
        error: "Invalid TURN server configuration",
      });
    }

    if (sharedSecret) {
      const expiresAt = Math.floor(Date.now() / 1000) + 3600;
      username = `${expiresAt}:${crypto.randomBytes(12).toString("hex")}`;
      credential = crypto
        .createHmac("sha1", sharedSecret)
        .update(username)
        .digest("base64");
    }

    if (!username || !credential) {
      return res.status(503).json({
        error: "Missing TURN credentials",
      });
    }

    iceServers.push({ urls, username, credential });
  }

  return res.json({
    iceServers,
    relayConfigured: urls.length > 0,
  });
});

// WebSocket handlers
const liveCallsById = new Map();
const liveCallIdByUsername = new Map();
function finishLiveCall(callId, reason = "ended") {
  const call = liveCallsById.get(callId);
  if (!call) return;

  clearTimeout(call.ringTimer);
  liveCallsById.delete(callId);

  for (const username of [call.callerUsername, call.recipientUsername]) {
    if (liveCallIdByUsername.get(username) === callId) {
      liveCallIdByUsername.delete(username);
    }
  }

  const event = { callId, reason };

  io.to(call.callerSocketId).emit("call:ended", event);

  if (call.recipientSocketId) {
    io.to(call.recipientSocketId).emit("call:ended", event);
  } else {
    io.to(`peer:${call.recipientUsername}`).emit("call:ended", event);
  }
}
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
    const messagingUsername = normalizeMessagingUsername(socket.piUsername);

  if (!messagingUsername) {
    socket.disconnect(true);
    return;
  }

  socket.join(`peer:${messagingUsername}`);

      socket.on("conversation:join", async (conversationId) => {
    const peer = normalizeMessagingUsername(conversationId);

    if (!peer || peer === messagingUsername) {
      return socket.emit("conversation:error", {
        error: "Invalid recipient",
      });
    }

    const exactUsername = (username) => ({
      $regex: `^${username.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
      $options: "i",
    });

    try {
      const messages = await messagesCollection
        .find({
          $or: [
            {
              senderUsername: exactUsername(messagingUsername),
              recipientUsername: exactUsername(peer),
            },
            {
              senderUsername: exactUsername(peer),
              recipientUsername: exactUsername(messagingUsername),
            },
          ],
        })
        .project({ _id: 0 })
        .sort({ at: -1 })
        .limit(200)
        .toArray();

      socket.emit("conversation:messages", {
        username: peer,
        messages: messages.reverse(),
      });
    } catch (error) {
      console.error("[CONVERSATION LOAD ERROR]", error);
      socket.emit("conversation:error", {
        username: peer,
        error: "Messages could not be loaded",
      });
    }
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
  const {
    conversationId,
    kind,
    text,
    fileName,
    messageId,
    imageId,
    attachmentId,
  } = data;
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
       const recipient = normalizeMessagingUsername(conversationId);

    if (!recipient || recipient === messagingUsername) {
      return socket.emit("message:error", {
        id: messageId,
        error: "Invalid recipient",
      });
    }

    let imageRecord = null;

    if (kind === "image") {
      if (
        typeof imageId !== "string" ||
        !/^[a-fA-F0-9]{24}$/.test(imageId)
      ) {
        return socket.emit("message:error", {
          id: messageId,
          error: "Upload the image before sending",
        });
      }

      try {
        imageRecord = await chatImagesBucket.find({
          _id: new ObjectId(imageId),
          "metadata.ownerUserId": socket.userId,
          "metadata.senderUsername": messagingUsername,
          "metadata.recipientUsername": recipient,
        }).next();
      } catch (error) {
        console.error("[CHAT IMAGE VERIFY ERROR]", error);
        return socket.emit("message:error", {
          id: messageId,
          error: "Image could not be verified",
        });
      }

      if (!imageRecord) {
        return socket.emit("message:error", {
          id: messageId,
          error: "Image is unavailable for this conversation",
        });
      }
    } else if (imageId !== undefined) {
      return socket.emit("message:error", {
        id: messageId,
        error: "Image attachment requires an image message",
      });
    }

    let attachmentRecord = null;

if (kind === "file" || kind === "video" || kind === "voice") {
  if (
    typeof attachmentId !== "string" ||
    !/^[a-fA-F0-9]{24}$/.test(attachmentId)
  ) {
    return socket.emit("message:error", {
      id: messageId,
      error: "Upload the attachment before sending",
    });
  }

  try {
    attachmentRecord = await chatAttachmentsBucket.find({
      _id: new ObjectId(attachmentId),
      "metadata.ownerUserId": socket.userId,
      "metadata.senderUsername": messagingUsername,
      "metadata.recipientUsername": recipient,
      "metadata.kind": kind,
    }).next();
  } catch (error) {
    console.error("[CHAT ATTACHMENT VERIFY ERROR]", error);
    return socket.emit("message:error", {
      id: messageId,
      error: "Attachment could not be verified",
    });
  }

  if (!attachmentRecord) {
    return socket.emit("message:error", {
      id: messageId,
      error: "Attachment is unavailable for this conversation",
    });
  }
} else if (attachmentId !== undefined) {
  return socket.emit("message:error", {
    id: messageId,
    error: "Attachment requires a file or video message",
  });
}

    const message = {
      id: messageId,
      senderUsername: messagingUsername,
      recipientUsername: recipient,
      kind,
      text,
      fileName: attachmentRecord
        ? attachmentRecord.filename
        : imageRecord
         ? imageRecord.filename
         : fileName,
      ...(imageRecord ? {
        imageId: imageRecord._id.toHexString(),
        mimeType: imageRecord.metadata.mimeType,
        fileSize: imageRecord.length,
      } : {}),
      ...(attachmentRecord ? {
        attachmentId: attachmentRecord._id.toHexString(),
        mimeType: attachmentRecord.metadata.mimeType,
        fileSize: attachmentRecord.length,
      } : {}),
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

        const recipientUsername = normalizeMessagingUsername(conversationId);
    io.to(`peer:${recipientUsername}`).emit("message:new", message);
  });

  socket.on("message:receipt", async (data) => {
  if (!data || typeof data !== "object" || Array.isArray(data)) return;

  const sender = normalizeMessagingUsername(data.senderUsername);
  const { ids, status } = data;

  if (
    !sender ||
    sender === messagingUsername ||
    !["delivered", "read"].includes(status) ||
    !Array.isArray(ids) ||
    ids.length === 0 ||
    ids.length > 120 ||
    !ids.every(
      (id) =>
        typeof id === "string" &&
        /^[a-zA-Z0-9_-]{1,100}$/.test(id),
    )
  ) {
    return;
  }

  const session = userSessions.get(socket.sessionToken);
  if (!session || session.expiresAt < Date.now()) return;

  const exactUsername = (username) => ({
    $regex: `^${username.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
    $options: "i",
  });

  const filter = {
    id: { $in: [...new Set(ids)] },
    senderUsername: exactUsername(sender),
    recipientUsername: exactUsername(messagingUsername),
  };

  try {
    await messagesCollection.updateMany(
      {
        ...filter,
        status: {
          $in: status === "read" ? ["sent", "delivered"] : ["sent"],
        },
      },
      { $set: { status } },
    );

    const confirmed = await messagesCollection
      .find({
        ...filter,
        status: { $in: ["delivered", "read"] },
      })
      .project({ _id: 0, id: 1, status: 1 })
      .toArray();

    for (const message of confirmed) {
      io.to(`peer:${sender}`).emit("message:status", {
        id: message.id,
        recipientUsername: messagingUsername,
        status: message.status,
      });
    }
  } catch (error) {
    console.error("[MESSAGE RECEIPT ERROR]", error);
  }
});

  socket.on("status:update", (userId, status, statusText) => {
    const user = users.get(userId);
    if (user) {
      user.status = status;
      user.statusText = statusText;
      io.emit("user:status", { userId, status, statusText });
    }
  });

    socket.on("call:initiate", (data = {}) => {
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return;
    }

    const { callId, kind } = data;
    const to = normalizeMessagingUsername(
      typeof data.to === "string" ? data.to : ""
    );
    const session = userSessions.get(socket.sessionToken);

    const reject = (reason) => {
      socket.emit("call:error", { callId, reason });
    };

    if (!session || session.expiresAt <= Date.now()) {
      reject("unauthorized");
      return;
    }

    if (
      typeof callId !== "string" ||
      !/^[a-zA-Z0-9_-]{16,80}$/.test(callId) ||
      !to ||
      to === messagingUsername ||
      (kind !== "voice" && kind !== "video")
    ) {
      reject("invalid");
      return;
    }

    if (
      liveCallsById.has(callId) ||
      liveCallIdByUsername.has(messagingUsername) ||
      liveCallIdByUsername.has(to)
    ) {
      reject("busy");
      return;
    }

    if (!io.sockets.adapter.rooms.get(`peer:${to}`)?.size) {
      reject("offline");
      return;
    }

    const call = {
      callerUsername: messagingUsername,
      recipientUsername: to,
      callerSocketId: socket.id,
      recipientSocketId: null,
      kind,
      phase: "ringing",
      ringTimer: null,
    };

    liveCallsById.set(callId, call);
    liveCallIdByUsername.set(messagingUsername, callId);
    liveCallIdByUsername.set(to, callId);

    call.ringTimer = setTimeout(() => {
      finishLiveCall(callId, "no-answer");
    }, 45000);

    socket.emit("call:initiated", { callId });

    io.to(`peer:${to}`).emit("call:incoming", {
      callId,
      from: messagingUsername,
      kind,
    });
  });

    socket.on("call:accept", (data = {}) => {
    const callId = data?.callId;
    const call = liveCallsById.get(callId);
    const session = userSessions.get(socket.sessionToken);

    if (!session || session.expiresAt <= Date.now()) return;

    if (
      !call ||
      call.recipientUsername !== messagingUsername ||
      call.phase !== "ringing" ||
      call.recipientSocketId
    ) {
      return;
    }

    call.recipientSocketId = socket.id;
    call.phase = "connecting";

    clearTimeout(call.ringTimer);
    call.ringTimer = setTimeout(() => {
      finishLiveCall(callId, "connection-timeout");
    }, 30000);

    socket.to(`peer:${messagingUsername}`).emit("call:ended", {
      callId,
      reason: "answered-elsewhere",
    });

    socket.emit("call:accepted", { callId });
    io.to(call.callerSocketId).emit("call:accepted", { callId });
  });

    socket.on("call:offer", (data = {}) => {
    const callId = data?.callId;
    const offer = data?.offer;
    const call = liveCallsById.get(callId);
    const session = userSessions.get(socket.sessionToken);

    if (!session || session.expiresAt <= Date.now()) return;

    if (
      !call ||
      call.callerSocketId !== socket.id ||
      call.phase !== "connecting" ||
      !call.recipientSocketId ||
      call.offerSent ||
      offer?.type !== "offer" ||
      typeof offer.sdp !== "string" ||
      !offer.sdp.length ||
      offer.sdp.length > 100000
    ) {
      return;
    }

    call.offerSent = true;

    io.to(call.recipientSocketId).emit("call:offer", {
      callId,
      offer: {
        type: "offer",
        sdp: offer.sdp,
      },
    });
  });

    socket.on("call:answer", (data = {}) => {
    const callId = data?.callId;
    const answer = data?.answer;
    const call = liveCallsById.get(callId);
    const session = userSessions.get(socket.sessionToken);

    if (!session || session.expiresAt <= Date.now()) return;

    if (
      !call ||
      call.recipientSocketId !== socket.id ||
      call.phase !== "connecting" ||
      !call.offerSent ||
      call.answerSent ||
      answer?.type !== "answer" ||
      typeof answer.sdp !== "string" ||
      !answer.sdp.length ||
      answer.sdp.length > 100000
    ) {
      return;
    }

    call.answerSent = true;

    io.to(call.callerSocketId).emit("call:answered", {
      callId,
      answer: {
        type: "answer",
        sdp: answer.sdp,
      },
    });
  });

    socket.on("call:ice-candidate", (data = {}) => {
    const callId = data?.callId;
    const candidate = data?.candidate;
    const call = liveCallsById.get(callId);
    const session = userSessions.get(socket.sessionToken);

    if (!session || session.expiresAt <= Date.now()) return;
    if (!call || !call.recipientSocketId) return;

    const isCaller = call.callerSocketId === socket.id;
    const isRecipient = call.recipientSocketId === socket.id;

    if (!isCaller && !isRecipient) return;

    if (
      !candidate ||
      typeof candidate.candidate !== "string" ||
      candidate.candidate.length > 8192 ||
      (candidate.sdpMid != null &&
        (typeof candidate.sdpMid !== "string" ||
          candidate.sdpMid.length > 256)) ||
      (candidate.sdpMLineIndex != null &&
        (!Number.isInteger(candidate.sdpMLineIndex) ||
          candidate.sdpMLineIndex < 0 ||
          candidate.sdpMLineIndex > 65535)) ||
      (candidate.usernameFragment != null &&
        (typeof candidate.usernameFragment !== "string" ||
          candidate.usernameFragment.length > 256))
    ) {
      return;
    }

    const targetSocketId = isCaller
      ? call.recipientSocketId
      : call.callerSocketId;

    io.to(targetSocketId).emit("call:ice-candidate", {
      callId,
      candidate: {
        candidate: candidate.candidate,
        sdpMid: candidate.sdpMid ?? null,
        sdpMLineIndex: candidate.sdpMLineIndex ?? null,
        ...(candidate.usernameFragment != null
          ? { usernameFragment: candidate.usernameFragment }
          : {}),
      },
    });
  });

      socket.on("call:connected", (data = {}) => {
    const callId = data?.callId;
    const call = liveCallsById.get(callId);
    const session = userSessions.get(socket.sessionToken);

    if (!session || session.expiresAt <= Date.now()) return;

    if (
      !call ||
      call.phase !== "connecting" ||
      !call.answerSent ||
      (socket.id !== call.callerSocketId &&
        socket.id !== call.recipientSocketId)
    ) {
      return;
    }

    if (!call.connectedSockets) {
      call.connectedSockets = new Set();
    }

    call.connectedSockets.add(socket.id);

    if (call.connectedSockets.size !== 2) return;

    clearTimeout(call.ringTimer);
    call.phase = "active";

    io.to(call.callerSocketId).emit("call:connected", { callId });
    io.to(call.recipientSocketId).emit("call:connected", { callId });
  });
    socket.on("call:end", (data = {}) => {
    const callId = data?.callId;
    const call = liveCallsById.get(callId);
    const session = userSessions.get(socket.sessionToken);

    if (!session || session.expiresAt <= Date.now()) return;
    if (!call) return;

    const isCaller = call.callerSocketId === socket.id;
    const isRecipient =
      call.recipientSocketId === socket.id ||
      (call.phase === "ringing" &&
        call.recipientUsername === messagingUsername);

    if (!isCaller && !isRecipient) return;

    const reason =
      call.phase === "ringing"
        ? isCaller
          ? "cancelled"
          : "declined"
        : "ended";

    finishLiveCall(callId, reason);
  });
  socket.on("disconnect", () => {
    const callId = liveCallIdByUsername.get(messagingUsername);
    const call = callId ? liveCallsById.get(callId) : null;

    if (call) {
      const isCaller = call.callerSocketId === socket.id;
      const isRecipient = call.recipientSocketId === socket.id;

      const recipientUnavailable =
        call.phase === "ringing" &&
        call.recipientUsername === messagingUsername &&
        !io.sockets.adapter.rooms.get(`peer:${messagingUsername}`)?.size;

      if (isCaller || isRecipient || recipientUnavailable) {
        finishLiveCall(callId, "disconnected");
      }
    }
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
