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
import { registerExternalEmailRoutes } from "./external-email-routes.js";
import { registerMailgunInboundRoutes } from "./mailgun-inbound-routes.js";

config();

dns.setServers(["8.8.8.8"]);

const mongoClient = new MongoClient(process.env.MONGODB_URI);

await mongoClient.connect();
console.log("MongoDB connected successfully");

const db = mongoClient.db("oneconnect");
const emailsCollection = db.collection("emails");
const emailUsersCollection = db.collection("email_users");

await emailsCollection.createIndex(
  { senderUsername: 1, id: 1 },
  {
    unique: true,
    name: "unique_sender_email",
    partialFilterExpression: {
      senderUsername: { $type: "string" },
      id: { $type: "string" },
    },
  },
);

await emailsCollection.createIndex(
  { recipientUsername: 1, at: -1 },
  { name: "email_recipient_date" },
);

await emailsCollection.createIndex(
  { senderUsername: 1, at: -1 },
  { name: "email_sender_date" },
);
const chatImagesBucket = new GridFSBucket(db, {
  bucketName: "chat_images",
});

const chatAttachmentsBucket = new GridFSBucket(db, {
  bucketName: "chat_attachments",
});
const emailAttachmentsBucket = new GridFSBucket(db, {
  bucketName: "email_attachments",
});

const emailAttachmentUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 1,
    fields: 1,
    parts: 3,
  },
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

const groupsCollection = db.collection("chat_groups");
const groupMessagesCollection = db.collection("group_messages");

await groupsCollection.createIndex(
  { members: 1, updatedAt: -1 },
  { name: "group_member_updated" },
);

await groupMessagesCollection.createIndex(
  { groupId: 1, _id: -1 },
  { name: "group_message_history" },
);

await groupMessagesCollection.createIndex(
  { groupId: 1, senderUsername: 1, id: 1 },
  { unique: true, name: "unique_group_sender_message" },
);
const groupMediaBucket = new GridFSBucket(db, {
  bucketName: "group_media",
});

const groupMediaUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024,
    files: 1,
    fields: 1,
    parts: 3,
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

async function requireGroupMember(req, res, next) {
  const username = normalizeMessagingUsername(req.user.piUsername);
  const groupId = req.params.groupId;

  if (!username) {
    return res.status(401).json({ error: "Invalid account" });
  }

  if (
    typeof groupId !== "string" ||
    !/^[a-f0-9]{24}$/.test(groupId)
  ) {
    return res.status(400).json({ error: "Invalid group ID" });
  }

  try {
    const group = await groupsCollection.findOne({
      _id: new ObjectId(groupId),
      members: username,
    });

    if (!group) {
      return res.status(404).json({ error: "Group not found" });
    }

    req.chatGroup = group;
    req.groupUsername = username;
    next();
  } catch (error) {
    console.error("[GROUP MEMBERSHIP ERROR]", error);
    return res.status(500).json({
      error: "Group membership could not be verified",
    });
  }
}

app.post(
  "/api/groups/:groupId/media",
  requireSession,
  requireGroupMember,
  (req, res) => {
    groupMediaUpload.single("file")(req, res, async (uploadError) => {
      if (uploadError) {
        return res.status(
          uploadError.code === "LIMIT_FILE_SIZE" ? 413 : 400,
        ).json({
          error: uploadError.code === "LIMIT_FILE_SIZE"
            ? "Media must be 25 MB or smaller"
            : "Invalid media upload",
        });
      }

      const kind = req.body?.kind;
      const file = req.file;

      if (!["image", "file", "video", "voice"].includes(kind)) {
        return res.status(400).json({ error: "Invalid media kind" });
      }

      if (!file || !file.buffer?.length || file.size <= 0) {
        return res.status(400).json({ error: "Media file is required" });
      }

      const maxSize =
        (kind === "image" || kind === "voice" ? 5 : 25) * 1024 * 1024;

      if (file.size > maxSize) {
        return res.status(413).json({
          error: kind === "image" || kind === "voice"
            ? "Images and voice messages must be 5 MB or smaller"
            : "Videos and files must be 25 MB or smaller",
        });
      }

      const mimeType =
        kind === "image"
          ? detectChatImageType(file.buffer)
          : kind === "video"
            ? detectChatVideoType(file.buffer)
            : kind === "voice"
              ? detectChatAudioType(file.buffer)
              : "application/octet-stream";

      if (!mimeType) {
        return res.status(415).json({
          error: "Unsupported media format",
        });
      }

      const fileName = file.originalname
        .replace(/[/\\\u0000-\u001f\u007f]/g, "_")
        .slice(0, 120) || kind;

      let uploadStream;

      try {
        const groupId = req.chatGroup._id.toString();

        // Recheck membership after receiving the file.
        const group = await groupsCollection.findOne({
          _id: req.chatGroup._id,
          members: req.groupUsername,
        });

        if (!group) {
          return res.status(404).json({ error: "Group not found" });
        }

        uploadStream = groupMediaBucket.openUploadStream(fileName, {
          metadata: {
            groupId,
            ownerUserId: req.user.userId,
            senderUsername: req.groupUsername,
            kind,
            mimeType,
            uploadedAt: Date.now(),
          },
        });

        await new Promise((resolve, reject) => {
          uploadStream.once("error", reject);
          uploadStream.once("finish", resolve);
          uploadStream.end(file.buffer);
        });

        return res.status(201).json({
          mediaId: uploadStream.id.toString(),
          groupId,
          kind,
          fileName,
          mimeType,
          fileSize: file.size,
        });
      } catch (error) {
        if (uploadStream) {
          await uploadStream.abort().catch(() => {});
        }

        console.error("[GROUP MEDIA UPLOAD ERROR]", error);

        if (!res.headersSent) {
          return res.status(500).json({
            error: "Group media could not be uploaded",
          });
        }
      }
    });
  },
);

app.post("/api/groups", requireSession, async (req, res) => {
  const ownerUsername = normalizeMessagingUsername(req.user.piUsername);
  if (!ownerUsername) {
    return res.status(401).json({ error: "Invalid account" });
  }

  const data = req.body;

  if (
    !data ||
    typeof data.name !== "string" ||
    !data.name.trim() ||
    data.name.trim().length > 80 ||
    !Array.isArray(data.members) ||
    data.members.length > 50
  ) {
    return res.status(400).json({ error: "Invalid group details" });
  }

  const normalizedMembers = data.members.map(normalizeMessagingUsername);

  if (normalizedMembers.some((username) => !username)) {
    return res.status(400).json({ error: "Invalid member username" });
  }

  const members = [...new Set([ownerUsername, ...normalizedMembers])];

  if (members.length < 3 || members.length > 50) {
    return res.status(400).json({
      error: "A group must have between 3 and 50 members",
    });
  }

  try {
    const registered = await emailUsersCollection
      .find(
        { _id: { $in: members } },
        { projection: { _id: 1 } },
      )
      .toArray();

    const registeredNames = new Set(registered.map((user) => user._id));

    if (members.some((username) => !registeredNames.has(username))) {
      return res.status(400).json({
        error: "All members must first sign in to One Connect",
      });
    }

    const now = Date.now();
    const group = {
      _id: new ObjectId(),
      name: data.name.trim(),
      ownerUsername,
      members,
      createdAt: now,
      updatedAt: now,
    };

    await groupsCollection.insertOne(group);

    const result = groupForClient(group);

    for (const username of members) {
      io.to(`peer:${username}`).emit("group:updated", result);
    }

    return res.status(201).json({ group: result });
  } catch (error) {
    console.error("[GROUP CREATE ERROR]", error);
    return res.status(500).json({ error: "Group could not be created" });
  }
});

app.get("/api/groups", requireSession, async (req, res) => {
  const username = normalizeMessagingUsername(req.user.piUsername);

  if (!username) {
    return res.status(401).json({ error: "Invalid account" });
  }

  try {
    const groups = await groupsCollection
      .find({ members: username })
      .sort({ updatedAt: -1, _id: -1 })
      .toArray();

    const groupIds = groups.map((group) => group._id.toString());

    const counts = groupIds.length
      ? await groupMessagesCollection.aggregate([
          {
            $match: {
              groupId: { $in: groupIds },
              senderUsername: { $ne: username },
              readBy: { $ne: username },
              deletedFor: { $ne: username },
            },
          },
          {
            $group: {
              _id: "$groupId",
              count: { $sum: 1 },
            },
          },
        ]).toArray()
      : [];

    const unreadByGroup = new Map(
      counts.map((item) => [item._id, item.count]),
    );

    return res.json({
      groups: groups.map((group) => ({
        ...groupForClient(group),
        unreadCount: unreadByGroup.get(group._id.toString()) || 0,
      })),
    });
  } catch (error) {
    console.error("[GROUP LIST ERROR]", error);
    return res.status(500).json({ error: "Groups could not be loaded" });
  }
});

app.get(
  "/api/groups/:groupId/media/:mediaId",
  requireSession,
  requireGroupMember,
  async (req, res) => {
    res.setHeader("Cache-Control", "private, no-store");

    const { mediaId } = req.params;
    const groupId = req.chatGroup._id.toString();

    if (!/^[a-f0-9]{24}$/.test(mediaId)) {
      return res.status(400).json({ error: "Invalid media ID" });
    }

    try {
      const id = new ObjectId(mediaId);

      const media = await groupMediaBucket.find({
        _id: id,
        "metadata.groupId": groupId,
      }).next();

      if (!media) {
        return res.status(404).json({ error: "Media not found" });
      }

      const message = await groupMessagesCollection.findOne({
        groupId,
        mediaId,
        senderUsername: media.metadata?.senderUsername,
        kind: media.metadata?.kind,
        deletedFor: { $ne: req.groupUsername },
      });

      if (!message) {
        return res.status(404).json({ error: "Media not found" });
      }

      const kind = media.metadata.kind;
      const mimeType = media.metadata.mimeType;

      const allowedTypes = {
        image: ["image/png", "image/jpeg", "image/gif", "image/webp"],
        video: ["video/mp4", "video/webm"],
        voice: ["audio/webm", "audio/mp4", "audio/ogg", "audio/wav"],
        file: ["application/octet-stream"],
      };

      const maxSize =
        (kind === "image" || kind === "voice" ? 5 : 25) * 1024 * 1024;

      if (
        !Object.hasOwn(allowedTypes, kind) ||
        !allowedTypes[kind].includes(mimeType) ||
        !Number.isSafeInteger(media.length) ||
        media.length <= 0 ||
        media.length > maxSize
      ) {
        return res.status(415).json({ error: "Invalid media format" });
      }

      const encodedName = encodeURIComponent(
        media.filename || kind,
      ).replace(
        /['()*]/g,
        (character) =>
          `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
      );

      res.set({
        "Content-Type": mimeType,
        "Content-Length": String(media.length),
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition":
          `${kind === "file" ? "attachment" : "inline"}; ` +
          `filename="media"; filename*=UTF-8''${encodedName}`,
      });

      const downloadStream = groupMediaBucket.openDownloadStream(id);

      downloadStream.on("error", (error) => {
        console.error("[GROUP MEDIA READ ERROR]", error);

        if (!res.headersSent) {
          res.removeHeader("Content-Length");
          res.removeHeader("Content-Disposition");
          res.status(500).end();
        } else {
          res.destroy();
        }
      });

      res.on("close", () => downloadStream.destroy());
      downloadStream.pipe(res);
    } catch (error) {
      console.error("[GROUP MEDIA LOAD ERROR]", error);

      if (!res.headersSent) {
        return res.status(500).json({
          error: "Group media could not be loaded",
        });
      }
    }
  },
);

function groupForClient(group) {
  return {
    id: group._id.toString(),
    name: group.name,
    ownerUsername: group.ownerUsername,
    members: group.members,
    createdAt: group.createdAt,
    updatedAt: group.updatedAt,
    unreadCount: 0,
  };
}

function groupMessageForClient(message) {
  return {
    id: message.id,
    groupId: message.groupId,
    senderUsername: message.senderUsername,
    kind: message.kind,
    text: message.text,
    at: message.at,
    readBy: message.readBy || [],
    mediaId: message.mediaId,
    fileName: message.fileName,
    mimeType: message.mimeType,
    fileSize: message.fileSize,
  };
}

app.get("/api/groups/:groupId/messages", requireSession, async (req, res) => {
  const username = normalizeMessagingUsername(req.user.piUsername);
  const groupId = req.params.groupId;

  if (!username) {
    return res.status(401).json({ error: "Invalid account" });
  }

  if (!/^[a-f0-9]{24}$/.test(groupId)) {
    return res.status(400).json({ error: "Invalid group ID" });
  }

  const before = req.query.before;

  if (
    before !== undefined &&
    (typeof before !== "string" || !/^[a-f0-9]{24}$/.test(before))
  ) {
    return res.status(400).json({ error: "Invalid history cursor" });
  }

  try {
    const group = await groupsCollection.findOne({
      _id: new ObjectId(groupId),
      members: username,
    });

    if (!group) {
      return res.status(404).json({ error: "Group not found" });
    }

    const filter = {
      groupId,
      deletedFor: { $ne: username },
    };

    if (before) {
      filter._id = { $lt: new ObjectId(before) };
    }

    const records = await groupMessagesCollection
      .find(filter)
      .sort({ _id: -1 })
      .limit(101)
      .toArray();

    const hasMore = records.length > 100;
    const page = records.slice(0, 100);

    return res.json({
      group: groupForClient(group),
      messages: page.slice().reverse().map(groupMessageForClient),
      hasMore,
      nextCursor: hasMore
        ? page[page.length - 1]._id.toString()
        : null,
    });
  } catch (error) {
    console.error("[GROUP HISTORY ERROR]", error);
    return res.status(500).json({
      error: "Group messages could not be loaded",
    });
  }
});

app.post(
  "/api/groups/:groupId/messages",
  requireSession,
  requireGroupMember,
  async (req, res) => {
    const senderUsername = req.groupUsername;
    const group = req.chatGroup;
    const groupId = group._id.toString();
    const data = req.body;

    if (
      !data ||
      typeof data.id !== "string" ||
      !data.id.trim() ||
      data.id.length > 120 ||
      !["text", "image", "file", "video", "voice"].includes(data.kind) ||
      typeof data.text !== "string" ||
      data.text.length > 2000 ||
      (data.kind === "text" && !data.text.trim())
    ) {
      return res.status(400).json({ error: "Invalid group message" });
    }

    if (
      data.kind !== "text" &&
      (
        typeof data.mediaId !== "string" ||
        !/^[a-f0-9]{24}$/.test(data.mediaId)
      )
    ) {
      return res.status(400).json({ error: "Invalid media ID" });
    }

    try {
      const identity = {
        groupId,
        senderUsername,
        id: data.id,
      };

      let message = await groupMessagesCollection.findOne(identity);
      let created = false;

      if (!message) {
        let mediaFields = {};

        if (data.kind !== "text") {
          const media = await groupMediaBucket.find({
            _id: new ObjectId(data.mediaId),
            "metadata.groupId": groupId,
            "metadata.ownerUserId": req.user.userId,
            "metadata.senderUsername": senderUsername,
            "metadata.kind": data.kind,
          }).next();

          const maxSize =
            (data.kind === "image" || data.kind === "voice" ? 5 : 25) *
            1024 * 1024;

          if (
            !media ||
            !Number.isSafeInteger(media.length) ||
            media.length <= 0 ||
            media.length > maxSize
          ) {
            return res.status(400).json({
              error: "Media is unavailable or does not match this message",
            });
          }

          mediaFields = {
            mediaId: media._id.toString(),
            fileName: media.filename,
            mimeType: media.metadata.mimeType,
            fileSize: media.length,
          };
        }

        const candidate = {
          _id: new ObjectId(),
          ...identity,
          kind: data.kind,
          text: data.text.trim(),
          ...mediaFields,
          at: Date.now(),
          readBy: [senderUsername],
          deletedFor: [],
        };

        try {
          await groupMessagesCollection.insertOne(candidate);
          message = candidate;
          created = true;
        } catch (error) {
          if (error?.code !== 11000) throw error;

          message = await groupMessagesCollection.findOne(identity);
          if (!message) throw error;
        }
      }

      await groupsCollection.updateOne(
        { _id: group._id },
        { $max: { updatedAt: message.at } },
      );

      const result = groupMessageForClient(message);

      for (const username of group.members) {
        io.to(`peer:${username}`).emit("group:message", {
          message: result,
        });
      }

      return res.status(created ? 201 : 200).json({
        message: result,
      });
    } catch (error) {
      console.error("[GROUP MESSAGE SEND ERROR]", error);
      return res.status(500).json({
        error: "Group message could not be sent",
      });
    }
  },
);

app.post("/api/groups/:groupId/read", requireSession, async (req, res) => {
  const username = normalizeMessagingUsername(req.user.piUsername);
  const groupId = req.params.groupId;
  const messageIds = req.body?.messageIds;

  if (!username) {
    return res.status(401).json({ error: "Invalid account" });
  }

  if (!/^[a-f0-9]{24}$/.test(groupId)) {
    return res.status(400).json({ error: "Invalid group ID" });
  }

  if (
    !Array.isArray(messageIds) ||
    messageIds.length === 0 ||
    messageIds.length > 100 ||
    messageIds.some(
      (id) => typeof id !== "string" || !id.trim() || id.length > 120,
    )
  ) {
    return res.status(400).json({ error: "Invalid message IDs" });
  }

  try {
    const group = await groupsCollection.findOne({
      _id: new ObjectId(groupId),
      members: username,
    });

    if (!group) {
      return res.status(404).json({ error: "Group not found" });
    }

    const filter = {
      groupId,
      id: { $in: [...new Set(messageIds)] },
      deletedFor: { $ne: username },
    };

    const records = await groupMessagesCollection
      .find(filter, { projection: { _id: 1, id: 1 } })
      .toArray();

    if (records.length > 0) {
      await groupMessagesCollection.updateMany(
        { groupId, _id: { $in: records.map((message) => message._id) } },
        { $addToSet: { readBy: username } },
      );
    }

    const readIds = [...new Set(records.map((message) => message.id))];

    if (readIds.length > 0) {
      for (const member of group.members) {
        io.to(`peer:${member}`).emit("group:read", {
          groupId,
          username,
          messageIds: readIds,
        });
      }
    }

    return res.json({
      success: true,
      groupId,
      username,
      messageIds: readIds,
    });
  } catch (error) {
    console.error("[GROUP READ ERROR]", error);
    return res.status(500).json({
      error: "Group messages could not be marked as read",
    });
  }
});

app.post("/api/emails/attachments", requireSession, (req, res) => {
  emailAttachmentUpload.single("file")(req, res, async (uploadError) => {
    if (uploadError) {
      return res.status(
        uploadError.code === "LIMIT_FILE_SIZE" ? 413 : 400,
      ).json({
        error: uploadError.code === "LIMIT_FILE_SIZE"
          ? "Email attachment must be 10 MB or smaller"
          : "Invalid email attachment upload",
      });
    }

    const senderUsername = normalizeMessagingUsername(req.user.piUsername);
    const recipient = typeof req.body?.recipient === "string"
      ? req.body.recipient.trim().toLowerCase()
      : "";
    const file = req.file;

    const isInternal = /^@[a-z0-9._-]{1,32}$/.test(recipient);
    const isExternal =
      recipient.length <= 254 &&
      /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i.test(recipient);

    if (!senderUsername || (!isInternal && !isExternal)) {
      return res.status(400).json({
        error: "Invalid email attachment details",
      });
    }

    const recipientUsername = isInternal
      ? normalizeMessagingUsername(recipient)
      : null;

    if (
      isInternal &&
      (!recipientUsername || recipientUsername === senderUsername)
    ) {
      return res.status(400).json({
        error: "Invalid email recipient",
      });
    }

    if (!file || file.size === 0 || !file.buffer?.length) {
      return res.status(400).json({
        error: "Email attachment file is required",
      });
    }

    const fileName = file.originalname
      .replace(/[/\\\u0000-\u001f\u007f]/g, "_")
      .slice(0, 120) || "attachment";

    let uploadStream;

    try {
      if (isInternal) {
        const registered = await emailUsersCollection.findOne({
          _id: recipientUsername,
        });

        if (!registered) {
          return res.status(404).json({
            error: "Recipient has not registered for One Connect email",
          });
        }
      }

      uploadStream = emailAttachmentsBucket.openUploadStream(fileName, {
        metadata: {
          ownerUserId: req.user.userId,
          senderUsername,
          ...(isInternal
            ? { recipientUsername }
            : {
                ownerUsername: senderUsername,
                externalAddress: recipient,
              }),
          mimeType: "application/octet-stream",
          uploadedAt: new Date(),
        },
      });

      await new Promise((resolve, reject) => {
        uploadStream.once("error", reject);
        uploadStream.once("finish", resolve);
        uploadStream.end(file.buffer);
      });

      return res.status(201).json({
        attachmentId: uploadStream.id.toString(),
        attachmentName: fileName,
        attachmentSize: file.size,
      });
    } catch (error) {
      if (uploadStream) {
        await uploadStream.abort().catch(() => {});
      }

      console.error("[EMAIL ATTACHMENT UPLOAD ERROR]", error);

      if (!res.headersSent) {
        return res.status(500).json({
          error: "Email attachment could not be uploaded",
        });
      }
    }
  });
});

function emailForUser(record, username) {
    if (record.type === "external") {
    if (record.ownerUsername !== username) {
      throw new Error("External email owner does not match session");
    }

    const fromMe = record.direction === "outgoing";

    return {
      id: record._id.toString(),
      threadId: record.threadId,
      type: "external",
      ownerUsername: record.ownerUsername,
      folder: fromMe ? "sent" : "inbox",
      fromMe,
      senderUsername: fromMe ? username : undefined,
      recipientUsername: fromMe ? undefined : username,
      recipient: record.externalAddress,
      senderName: record.externalAddress,
      color: 0,
      subject: record.subject,
      body: record.body,
      attachmentId: record.attachmentId,
      attachmentName: record.attachmentName,
      attachmentSize: record.attachmentSize,
      deliveryStatus: record.deliveryStatus || "pending",
      read: fromMe || record.recipientRead === true,
      at: record.at,
    };
  }
  const fromMe = record.senderUsername === username;

  return {
    id: record._id.toString(),
    threadId: record.threadId,
    type: "internal",
    folder: fromMe ? "sent" : "inbox",
    fromMe,
    senderUsername: record.senderUsername,
    recipientUsername: record.recipientUsername,
    recipient: `@${record.recipientUsername}`,
    senderName: fromMe
      ? `@${record.recipientUsername}`
      : `@${record.senderUsername}`,
    color: 200,
    subject: record.subject,
    body: record.body,
    attachmentId: record.attachmentId,
    attachmentName: record.attachmentName,
    attachmentSize: record.attachmentSize,
    read: fromMe || record.recipientRead === true,
    at: record.at,
  };
}

await registerMailgunInboundRoutes({
  app,
  db,
  io,
  emailForUser,
  emailAttachmentsBucket,
});

registerExternalEmailRoutes({
  app,
  db,
  io,
  requireSession,
  normalizeMessagingUsername,
  emailForUser,
  emailAttachmentsBucket,
});
app.post("/api/emails/internal", requireSession, async (req, res) => {
  const data = req.body;
  const senderUsername = normalizeMessagingUsername(req.user.piUsername);

  if (!senderUsername) {
    return res.status(401).json({ error: "Invalid user identity" });
  }

  if (
    !data ||
    typeof data !== "object" ||
    Array.isArray(data) ||
    typeof data.id !== "string" ||
    !/^[a-zA-Z0-9_-]{16,80}$/.test(data.id) ||
    typeof data.recipient !== "string" ||
    !/^@[a-z0-9._-]{1,32}$/i.test(data.recipient) ||
    typeof data.subject !== "string" ||
    data.subject.length > 120 ||
    typeof data.body !== "string" ||
    data.body.length > 4000 ||
    !data.body.trim()
  ) {
    return res.status(400).json({ error: "Invalid email data" });
  }

    if (
    (
      data.attachmentId !== undefined &&
      (
        typeof data.attachmentId !== "string" ||
        !/^[a-f0-9]{24}$/i.test(data.attachmentId)
      )
    ) ||
    (
      data.attachmentId === undefined &&
      (data.attachmentName || data.attachmentSize)
    )
  ) {
    return res.status(400).json({
      error: "Invalid email attachment",
    });
  }

  const attachmentId = typeof data.attachmentId === "string"
    ? data.attachmentId.toLowerCase()
    : null;

  const recipientUsername = normalizeMessagingUsername(data.recipient);

  if (!recipientUsername || recipientUsername === senderUsername) {
    return res.status(400).json({ error: "Invalid email recipient" });
  }

  const subject = data.subject.trim() || "(no subject)";
  const matchesRequest = (record) =>
    record.recipientUsername === recipientUsername &&
    record.subject === subject &&
    record.body === data.body &&
    (record.attachmentId ?? null) === attachmentId;

  try {
    const existing = await emailsCollection.findOne({
      senderUsername,
      id: data.id,
    });

    if (existing) {
      if (!matchesRequest(existing)) {
        return res.status(409).json({
          error: "Email ID is already used for another message",
        });
      }

      return res.json({
        email: emailForUser(existing, senderUsername),
      });
    }

    const recipient = await emailUsersCollection.findOne({
      _id: recipientUsername,
    });

    if (!recipient) {
      return res.status(404).json({
        error: "Recipient has not registered for One Connect email",
      });
    }

    let attachment = null;

    if (attachmentId) {
      attachment = await emailAttachmentsBucket.find({
        _id: new ObjectId(attachmentId),
        "metadata.ownerUserId": req.user.userId,
        "metadata.senderUsername": senderUsername,
        "metadata.recipientUsername": recipientUsername,
      }).next();

      if (
        !attachment ||
        !Number.isSafeInteger(attachment.length) ||
        attachment.length <= 0 ||
        attachment.length > 10 * 1024 * 1024
      ) {
        return res.status(400).json({
          error: "Email attachment is unavailable or does not match this recipient",
        });
      }
    }

    const record = {
      id: data.id,
      threadId: crypto.randomUUID(),
      type: "internal",
      senderUsername,
      recipientUsername,
      subject,
      body: data.body,
      ...(attachment ? {
        attachmentId,
        attachmentName: attachment.filename,
        attachmentSize: attachment.length,
      } : {}),
      recipientRead: false,
      senderDeleted: false,
      recipientDeleted: false,
      at: Date.now(),
    };

    let result;

    try {
      result = await emailsCollection.insertOne(record);
    } catch (error) {
      if (error?.code !== 11000) throw error;

      const saved = await emailsCollection.findOne({
        senderUsername,
        id: data.id,
      });

      if (!saved || !matchesRequest(saved)) {
        return res.status(409).json({
          error: "Email ID is already used for another message",
        });
      }

      return res.json({
        email: emailForUser(saved, senderUsername),
      });
    }

    const saved = { ...record, _id: result.insertedId };

    io.to(`peer:${recipientUsername}`).emit(
      "email:new",
      emailForUser(saved, recipientUsername),
    );

    io.to(`peer:${senderUsername}`).emit(
      "email:new",
      emailForUser(saved, senderUsername),
    );

    return res.status(201).json({
      email: emailForUser(saved, senderUsername),
    });
  } catch (error) {
    console.error("[EMAIL SEND ERROR]", error);
    return res.status(500).json({
      error: "Email could not be sent",
    });
  }
});

app.get("/api/emails/:emailId/attachment", requireSession, async (req, res) => {
  res.setHeader("Cache-Control", "private, no-store");

  const username = normalizeMessagingUsername(req.user.piUsername);
  const { emailId } = req.params;

  if (!username) {
    return res.status(401).json({ error: "Invalid user identity" });
  }

  if (!/^[a-f0-9]{24}$/i.test(emailId)) {
    return res.status(400).json({ error: "Invalid email ID" });
  }

  try {
    const email = await emailsCollection.findOne({
      _id: new ObjectId(emailId),
      $or: [
        {
          type: "internal",
          $or: [
            {
              senderUsername: username,
              senderDeleted: { $ne: true },
            },
            {
              recipientUsername: username,
              recipientDeleted: { $ne: true },
            },
          ],
        },
        {
          type: "external",
          ownerUsername: username,
          senderDeleted: { $ne: true },
        },
      ],
    });

    if (
      !email ||
      typeof email.attachmentId !== "string" ||
      !/^[a-f0-9]{24}$/i.test(email.attachmentId)
    ) {
      return res.status(404).json({ error: "Email attachment not found" });
    }

    const id = new ObjectId(email.attachmentId);

    const attachment = await emailAttachmentsBucket.find({
      _id: id,
      ...(email.type === "external"
        ? {
            "metadata.ownerUsername": username,
            "metadata.externalAddress": email.externalAddress,
          }
        : {
            "metadata.senderUsername": email.senderUsername,
            "metadata.recipientUsername": email.recipientUsername,
          }),
    }).next();

    if (
      !attachment ||
      !Number.isSafeInteger(attachment.length) ||
      attachment.length <= 0 ||
      attachment.length > 10 * 1024 * 1024
    ) {
      return res.status(404).json({ error: "Email attachment not found" });
    }

    const encodedName = encodeURIComponent(
      attachment.filename || "attachment",
    ).replace(
      /['()*]/g,
      (character) =>
        `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
    );

    res.set({
      "Content-Type": "application/octet-stream",
      "Content-Length": String(attachment.length),
      "Content-Disposition":
        `attachment; filename="attachment"; filename*=UTF-8''${encodedName}`,
      "X-Content-Type-Options": "nosniff",
    });

    const downloadStream = emailAttachmentsBucket.openDownloadStream(id);

    downloadStream.on("error", (error) => {
      console.error("[EMAIL ATTACHMENT READ ERROR]", error);

      if (!res.headersSent) {
        res.removeHeader("Content-Length");
        res.removeHeader("Content-Disposition");
        res.status(500).end();
      } else {
        res.destroy();
      }
    });

    res.on("close", () => downloadStream.destroy());
    downloadStream.pipe(res);
  } catch (error) {
    console.error("[EMAIL ATTACHMENT LOAD ERROR]", error);

    if (!res.headersSent) {
      res.removeHeader("Content-Length");
      res.removeHeader("Content-Disposition");

      return res.status(500).json({
        error: "Email attachment could not be downloaded",
      });
    }

    res.destroy();
  }
});

app.get("/api/emails", requireSession, async (req, res) => {
  res.setHeader("Cache-Control", "no-store");

  const username = normalizeMessagingUsername(req.user.piUsername);

  if (!username) {
    return res.status(401).json({ error: "Invalid user identity" });
  }

  try {
    const records = await emailsCollection
      .find({
        $or: [
          {
            type: "internal",
            $or: [
              {
                senderUsername: username,
                senderDeleted: { $ne: true },
              },
              {
                recipientUsername: username,
                recipientDeleted: { $ne: true },
              },
            ],
          },
          {
            type: "external",
            ownerUsername: username,
            senderDeleted: { $ne: true },
          },
        ],
      })
      .sort({ at: -1, _id: -1 })
      .limit(200)
      .toArray();

    return res.json({
      emails: records.map((record) => emailForUser(record, username)),
    });
  } catch (error) {
    console.error("[EMAIL LOAD ERROR]", error);
    return res.status(500).json({
      error: "Emails could not be loaded",
    });
  }
});

app.patch("/api/emails/:id/read", requireSession, async (req, res) => {
  const username = normalizeMessagingUsername(req.user.piUsername);
  const { id } = req.params;

  if (!username) {
    return res.status(401).json({ error: "Invalid user identity" });
  }

  if (!/^[a-f0-9]{24}$/i.test(id)) {
    return res.status(400).json({ error: "Invalid email ID" });
  }

  try {
    const result = await emailsCollection.updateOne(
      {
        _id: new ObjectId(id),
        $or: [
          {
            type: "internal",
            recipientUsername: username,
            recipientDeleted: { $ne: true },
          },
          {
            type: "external",
            direction: "incoming",
            ownerUsername: username,
            senderDeleted: { $ne: true },
          },
        ],
      },
      {
        $set: { recipientRead: true },
      },
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: "Email not found" });
    }

    io.to(`peer:${username}`).emit("email:read", { id });

    return res.json({ success: true });
  } catch (error) {
    console.error("[EMAIL READ ERROR]", error);
    return res.status(500).json({
      error: "Email could not be marked as read",
    });
  }
});

app.delete("/api/emails/:id", requireSession, async (req, res) => {
  const username = normalizeMessagingUsername(req.user.piUsername);
  const { id } = req.params;

  if (!username) {
    return res.status(401).json({ error: "Invalid user identity" });
  }

  if (!/^[a-f0-9]{24}$/i.test(id)) {
    return res.status(400).json({ error: "Invalid email ID" });
  }

  try {
    const record = await emailsCollection.findOne({
      _id: new ObjectId(id),
      $or: [
        {
          type: "internal",
          $or: [
            { senderUsername: username },
            { recipientUsername: username },
          ],
        },
        {
          type: "external",
          ownerUsername: username,
          senderDeleted: { $ne: true },
        },
      ],
    });

    if (!record) {
      return res.status(404).json({ error: "Email not found" });
    }

    const fromMe =
      record.type === "external" ||
      record.senderUsername === username;

    await emailsCollection.updateOne(
      {
        _id: record._id,
        ...(record.type === "external"
          ? { ownerUsername: username }
          : fromMe
            ? { senderUsername: username }
            : { recipientUsername: username }),
      },
      {
        $set: fromMe
          ? { senderDeleted: true }
          : { recipientDeleted: true },
      },
    );

    io.to(`peer:${username}`).emit("email:deleted", { id });

    return res.json({ success: true });
  } catch (error) {
    console.error("[EMAIL DELETE ERROR]", error);
    return res.status(500).json({
      error: "Email could not be deleted",
    });
  }
});

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

        const messagingUsername = normalizeMessagingUsername(piUsername);

    if (!messagingUsername) {
      return res.status(401).json({
        error: "Invalid Pi username",
      });
    }

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

app.delete(
  "/api/chat/messages/:senderUsername/:messageId",
  requireSession,
  async (req, res) => {
    const username = normalizeMessagingUsername(req.user.piUsername);
    const sender = normalizeMessagingUsername(req.params.senderUsername);
    const messageId = req.params.messageId;

    if (
      !username ||
      !sender ||
      typeof messageId !== "string" ||
      !messageId.trim() ||
      messageId.length > 120
    ) {
      return res.status(400).json({ error: "Invalid message details" });
    }

    const exactUsername = (value) => ({
      $regex: `^${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
      $options: "i",
    });

    try {
      const filter = {
        id: messageId,
        senderUsername: exactUsername(sender),
        $or: [
          { senderUsername: exactUsername(username) },
          { recipientUsername: exactUsername(username) },
        ],
      };

      const result = await messagesCollection.updateOne(
        filter,
        { $addToSet: { deletedFor: username } },
      );

      if (result.matchedCount === 0) {
        return res.status(404).json({ error: "Message not found" });
      }

      io.to(`peer:${username}`).emit("message:deleted", {
        id: messageId,
        senderUsername: sender,
      });

      return res.json({ success: true });
    } catch (error) {
      console.error("[MESSAGE DELETE ERROR]", error);
      return res.status(500).json({
        error: "Message could not be deleted",
      });
    }
  },
);

// WebSocket handlers
const liveCallsById = new Map();
const liveCallIdByUsername = new Map();
const MAX_GROUP_CALL_PARTICIPANTS = 5;

const groupCallsById = new Map();
const groupCallIdByGroup = new Map();
const groupCallIdByUsername = new Map();

function groupCallForClient(call) {
  return {
    callId: call.callId,
    groupId: call.groupId,
    groupName: call.groupName,
    hostUsername: call.hostUsername,
    kind: call.kind,
    participants: [...call.participants.keys()],
    maxParticipants: MAX_GROUP_CALL_PARTICIPANTS,
  };
}

function removeGroupCallParticipant(
  callId,
  username,
  socketId,
  reason = "left",
) {
  const call = groupCallsById.get(callId);
  const participant = call?.participants.get(username);

  // Disconnecting another device must not remove the active device.
  if (!call || !participant || participant.socketId !== socketId) return;

  call.participants.delete(username);
    if (call.links) {
    for (const [key, link] of call.links) {
      if (link.offerer === username || link.answerer === username) {
        call.links.delete(key);
      }
    }
  }

  if (groupCallIdByUsername.get(username) === callId) {
    groupCallIdByUsername.delete(username);
  }

  io.to(socketId).emit("group-call:left", {
    callId,
    groupId: call.groupId,
    reason,
  });

  if (call.participants.size === 0) {
    finishGroupCall(callId, "ended");
    return;
  }

  if (call.hostUsername === username) {
    call.hostUsername = call.participants.keys().next().value;
  }

  clearTimeout(call.idleTimer);
  call.idleTimer = null;

  if (call.participants.size === 1) {
    call.idleTimer = setTimeout(() => {
      if (
        groupCallsById.get(callId) === call &&
        call.participants.size === 1
      ) {
        finishGroupCall(callId, "alone");
      }
    }, 30000);
  }

  const event = {
    ...groupCallForClient(call),
    username,
    reason,
  };

  for (const remaining of call.participants.values()) {
    io.to(remaining.socketId).emit("group-call:participant-left", event);
  }
}

function finishGroupCall(callId, reason = "ended") {
  const call = groupCallsById.get(callId);
  if (!call) return;

  clearTimeout(call.ringTimer);
  clearTimeout(call.idleTimer);

  groupCallsById.delete(callId);

  if (groupCallIdByGroup.get(call.groupId) === callId) {
    groupCallIdByGroup.delete(call.groupId);
  }

  for (const username of call.participants.keys()) {
    if (groupCallIdByUsername.get(username) === callId) {
      groupCallIdByUsername.delete(username);
    }
  }

  const event = {
    callId,
    groupId: call.groupId,
    reason,
  };

  for (const username of call.members) {
    io.to(`peer:${username}`).emit("group-call:ended", event);
  }
}
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
          deletedFor: { $ne: messagingUsername },
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

      const deletedMessages = await messagesCollection
        .find({
          deletedFor: messagingUsername,
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
        .project({
          _id: 0,
          id: 1,
          senderUsername: 1,
        })
        .toArray();

      socket.emit("conversation:messages", {
        username: peer,
        messages: messages.reverse(),
        deletedMessages,
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

    socket.on("group-call:signal", (data = {}) => {
    if (!data || typeof data !== "object" || Array.isArray(data)) return;

    const { callId } = data;
    const to = normalizeMessagingUsername(data.to);
    const session = userSessions.get(socket.sessionToken);

    if (
      !session ||
      session.expiresAt <= Date.now() ||
      typeof callId !== "string" ||
      !to ||
      to === messagingUsername
    ) return;

    const call = groupCallsById.get(callId);
    const sender = call?.participants.get(messagingUsername);
    const recipient = call?.participants.get(to);

    if (
      !call ||
      !sender ||
      sender.socketId !== socket.id ||
      !recipient
    ) return;

    const hasDescription = data.description !== undefined;
    const hasCandidate = data.candidate !== undefined;

    if (hasDescription === hasCandidate) return;

    const pairKey = [messagingUsername, to].sort().join(":");
    if (!call.links) call.links = new Map();

    if (hasDescription) {
      const description = data.description;

      if (
        !description ||
        (description.type !== "offer" && description.type !== "answer") ||
        typeof description.sdp !== "string" ||
        !description.sdp.length ||
        description.sdp.length > 100000
      ) return;

      const link = call.links.get(pairKey);

      if (description.type === "offer") {
        const order = [...call.participants.keys()];

        // The newer participant offers to the existing participant.
        if (
          order.indexOf(messagingUsername) <= order.indexOf(to) ||
          link
        ) return;

        call.links.set(pairKey, {
          offerer: messagingUsername,
          answerer: to,
          answered: false,
        });
      } else {
        if (
          !link ||
          link.offerer !== to ||
          link.answerer !== messagingUsername ||
          link.answered
        ) return;

        link.answered = true;
      }

      io.to(recipient.socketId).emit("group-call:signal", {
        callId,
        from: messagingUsername,
        description: {
          type: description.type,
          sdp: description.sdp,
        },
      });

      return;
    }

    const candidate = data.candidate;

    if (
      !candidate ||
      typeof candidate.candidate !== "string" ||
      candidate.candidate.length > 8192 ||
      (
        candidate.sdpMid != null &&
        (
          typeof candidate.sdpMid !== "string" ||
          candidate.sdpMid.length > 256
        )
      ) ||
      (
        candidate.sdpMLineIndex != null &&
        (
          !Number.isInteger(candidate.sdpMLineIndex) ||
          candidate.sdpMLineIndex < 0 ||
          candidate.sdpMLineIndex > 65535
        )
      ) ||
      (
        candidate.usernameFragment != null &&
        (
          typeof candidate.usernameFragment !== "string" ||
          candidate.usernameFragment.length > 256
        )
      )
    ) return;

    io.to(recipient.socketId).emit("group-call:signal", {
      callId,
      from: messagingUsername,
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

    let pendingGroupCallRequest = null;
    socket.on("group-call:leave", (data = {}) => {
    const callId = data?.callId;

    if (
      typeof callId !== "string" ||
      !/^[a-zA-Z0-9_-]{16,80}$/.test(callId)
    ) return;

  if (pendingGroupCallRequest?.callId === callId) {
    pendingGroupCallRequest.cancelled = true;
  }

    removeGroupCallParticipant(
      callId,
      messagingUsername,
      socket.id,
      "left",
    );
  });

    socket.on("group-call:join", async (data = {}) => {
    const callId = data?.callId;

    const reject = (reason) => {
      socket.emit("group-call:error", {
        callId: typeof callId === "string" ? callId : undefined,
        reason,
      });
    };

    const validSession = () => {
      const session = userSessions.get(socket.sessionToken);

      return (
        socket.connected &&
        session &&
        session.expiresAt > Date.now() &&
        session.userId === socket.userId
      );
    };

    if (!validSession()) {
      reject("unauthorized");
      return;
    }

    if (
      typeof callId !== "string" ||
      !/^[a-zA-Z0-9_-]{16,80}$/.test(callId)
    ) {
      reject("invalid");
      return;
    }

    const call = groupCallsById.get(callId);

    if (!call || !call.members.includes(messagingUsername)) {
      reject("unavailable");
      return;
    }

    if (pendingGroupCallRequest) {
      reject("busy");
      return;
    }

    const request = { callId, cancelled: false };
    pendingGroupCallRequest = request;

    try {
      const group = await groupsCollection.findOne({
        _id: new ObjectId(call.groupId),
        members: messagingUsername,
      });

      if (request.cancelled) return;

      if (!validSession()) {
        reject("unauthorized");
        return;
      }

      if (!group || groupCallsById.get(callId) !== call) {
        reject("unavailable");
        return;
      }

      const existing = call.participants.get(messagingUsername);

      if (existing) {
        if (existing.socketId === socket.id) {
          socket.emit("group-call:joined", groupCallForClient(call));
        } else {
          reject("answered-elsewhere");
        }
        return;
      }

      if (
        liveCallIdByUsername.has(messagingUsername) ||
        groupCallIdByUsername.has(messagingUsername)
      ) {
        reject("busy");
        return;
      }

      // No await between this check and adding the participant.
      if (call.participants.size >= MAX_GROUP_CALL_PARTICIPANTS) {
        reject("full");
        return;
      }

      const previousParticipants = [...call.participants.values()];

      call.participants.set(messagingUsername, {
        socketId: socket.id,
        joinedAt: Date.now(),
      });
      groupCallIdByUsername.set(messagingUsername, callId);

      clearTimeout(call.ringTimer);
      clearTimeout(call.idleTimer);
      call.ringTimer = null;
      call.idleTimer = null;

      const event = groupCallForClient(call);

      socket.emit("group-call:joined", event);

      socket.to(`peer:${messagingUsername}`).emit(
        "group-call:answered-elsewhere",
        { callId },
      );

      for (const participant of previousParticipants) {
        io.to(participant.socketId).emit("group-call:participant-joined", {
          ...event,
          username: messagingUsername,
        });
      }
    } catch (error) {
      console.error("[GROUP CALL JOIN ERROR]", error);
      if (!request.cancelled) reject("server-error");
    } finally {
      if (pendingGroupCallRequest === request) {
        pendingGroupCallRequest = null;
      }
    }
  });

  socket.on("group-call:start", async (data = {}) => {
    if (!data || typeof data !== "object" || Array.isArray(data)) return;

    const { callId, groupId, kind } = data;

    const reject = (reason) => {
      socket.emit("group-call:error", {
        callId: typeof callId === "string" ? callId : undefined,
        reason,
      });
    };

    const validSession = () => {
      const session = userSessions.get(socket.sessionToken);

      return (
        socket.connected &&
        session &&
        session.expiresAt > Date.now() &&
        session.userId === socket.userId
      );
    };

    if (!validSession()) {
      reject("unauthorized");
      return;
    }

    if (
      typeof callId !== "string" ||
      !/^[a-zA-Z0-9_-]{16,80}$/.test(callId) ||
      typeof groupId !== "string" ||
      !/^[a-f0-9]{24}$/.test(groupId) ||
      (kind !== "voice" && kind !== "video")
    ) {
      reject("invalid");
      return;
    }

    if (pendingGroupCallRequest) {
      reject("busy");
      return;
    }

    const request = { callId, cancelled: false };
    pendingGroupCallRequest = request;

    try {
      const group = await groupsCollection.findOne({
        _id: new ObjectId(groupId),
        members: messagingUsername,
      });

      if (request.cancelled) return;
      if (!validSession()) {
        reject("unauthorized");
        return;
      }

      if (!group) {
        reject("not-member");
        return;
      }

      // Check after the database request to avoid concurrent starts.
      if (
        liveCallIdByUsername.has(messagingUsername) ||
        groupCallIdByUsername.has(messagingUsername)
      ) {
        reject("busy");
        return;
      }

      const activeCallId = groupCallIdByGroup.get(groupId);

      if (activeCallId) {
        const activeCall = groupCallsById.get(activeCallId);

        if (!activeCall) {
          groupCallIdByGroup.delete(groupId);
        } else {
          if (!activeCall.members.includes(messagingUsername)) {
            reject("not-member");
            return;
          }

          if (
            activeCall.participants.size >=
            MAX_GROUP_CALL_PARTICIPANTS
          ) {
            reject("full");
            return;
          }

          // Close the new local attempt before offering the existing call.
          reject("join-existing");

          socket.emit(
            "group-call:incoming",
            groupCallForClient(activeCall),
          );
          return;
        }
      }

      if (groupCallsById.has(callId) || liveCallsById.has(callId)) {
        reject("invalid");
        return;
      }

      const call = {
        callId,
        groupId,
        groupName: group.name,
        hostUsername: messagingUsername,
        kind,
        members: [...group.members],
        participants: new Map([
          [
            messagingUsername,
            { socketId: socket.id, joinedAt: Date.now() },
          ],
        ]),
        ringTimer: null,
        idleTimer: null,
      };

      groupCallsById.set(callId, call);
      groupCallIdByGroup.set(groupId, callId);
      groupCallIdByUsername.set(messagingUsername, callId);

      call.ringTimer = setTimeout(() => {
        const current = groupCallsById.get(callId);

        if (current === call && current.participants.size < 2) {
          finishGroupCall(callId, "no-answer");
        }
      }, 45000);

      const event = groupCallForClient(call);

      socket.emit("group-call:started", event);

      for (const username of call.members) {
        if (username !== messagingUsername) {
          io.to(`peer:${username}`).emit("group-call:incoming", event);
        }
      }
        } catch (error) {
      console.error("[GROUP CALL START ERROR]", error);
      if (!request.cancelled) reject("server-error");
    } finally {
      if (pendingGroupCallRequest === request) {
        pendingGroupCallRequest = null;
      }
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
      groupCallsById.has(callId) ||
      liveCallIdByUsername.has(messagingUsername) ||
      liveCallIdByUsername.has(to) ||
      groupCallIdByUsername.has(messagingUsername) ||
      groupCallIdByUsername.has(to)
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
    const groupCallId = groupCallIdByUsername.get(messagingUsername);

    if (groupCallId) {
      removeGroupCallParticipant(
        groupCallId,
        messagingUsername,
        socket.id,
        "disconnected",
      );
    }
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
