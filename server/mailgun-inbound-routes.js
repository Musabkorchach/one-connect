import crypto from "node:crypto";
import multer from "multer";
import { ObjectId } from "mongodb";
import { verifyMailgunSignature } from "./mailgun-webhook-signature.js";

const ADDRESS_PATTERN =
  /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i;

const hash = (value) =>
  crypto.createHash("sha256").update(value).digest("hex");

function readMessageId(data) {
  if (
    typeof data["Message-Id"] === "string" &&
    data["Message-Id"].trim()
  ) {
    return data["Message-Id"].trim();
  }

  try {
    const headers = JSON.parse(data["message-headers"]);

    if (!Array.isArray(headers)) return "";

    const header = headers.find(
      (item) =>
        Array.isArray(item) &&
        typeof item[0] === "string" &&
        item[0].toLowerCase() === "message-id" &&
        typeof item[1] === "string",
    );

    return header ? header[1].trim() : "";
  } catch {
    return "";
  }
}

function limitText(value, maximum) {
  if (value.length <= maximum) return value;

  const notice = "\n[Message truncated]";
  return value.slice(0, maximum - notice.length) + notice;
}

export async function registerMailgunInboundRoutes({
  app,
  db,
  io,
  emailForUser,
  emailAttachmentsBucket,
}) {
  const emails = db.collection("emails");

  await emails.createIndex(
    { inboundTokenHash: 1 },
    {
      unique: true,
      partialFilterExpression: {
        inboundTokenHash: { $type: "string" },
      },
    },
  );

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 10 * 1024 * 1024,
      files: 1,
      fields: 64,
      parts: 65,
      fieldSize: 2 * 1024 * 1024,
    },
  }).any();

  const receive = async (req, res) => {
    let uploadedAttachmentId = null;
    let inserted = false;

    try {
      if (!process.env.MAILGUN_WEBHOOK_SIGNING_KEY?.trim()) {
        return res.status(503).json({
          error: "Inbound email verification is not configured",
        });
      }

      const data = req.body;

      if (!verifyMailgunSignature(data)) {
        return res.status(406).json({
          error: "Invalid Mailgun signature",
        });
      }

      const age = Date.now() / 1000 - Number(data.timestamp);

      if (age < -300 || age > 24 * 60 * 60) {
        return res.status(406).json({
          error: "Expired Mailgun request",
        });
      }

      const domain = (
        process.env.MAILGUN_DOMAIN || ""
      ).trim().toLowerCase();

      const recipient = typeof data.recipient === "string"
        ? data.recipient.trim().toLowerCase()
        : "";

      const separator = recipient.indexOf("@");
      const localPart = recipient.slice(0, separator);
      const recipientDomain = recipient.slice(separator + 1);
      const match = /^reply-([a-f0-9]{48})$/.exec(localPart);

      if (
        separator < 0 ||
        !domain ||
        recipientDomain !== domain ||
        !match
      ) {
        return res.status(406).json({
          error: "Unknown reply address",
        });
      }

      const sender = typeof data.sender === "string"
        ? data.sender.trim().toLowerCase()
        : "";

      const messageId = readMessageId(data);
      const files = req.files || [];

      if (
        sender.length > 254 ||
        !ADDRESS_PATTERN.test(sender) ||
        !messageId ||
        messageId.length > 998 ||
        /[\r\n\0]/.test(messageId) ||
        typeof data["body-plain"] !== "string" ||
        files.length > 1 ||
        files.some(
          (file) =>
            !/^attachment-[1-9][0-9]*$/.test(file.fieldname) ||
            file.size === 0,
        )
      ) {
        return res.status(406).json({
          error: "Unsupported incoming email",
        });
      }

      const original = await emails.findOne({
        type: "external",
        direction: "outgoing",
        replyToken: match[1],
      });

      if (!original) {
        return res.status(406).json({
          error: "Reply destination not found",
        });
      }

      const username = original.ownerUsername;

      const id = new ObjectId(
        hash(
          `${username}\0${match[1]}\0${messageId}`,
        ).slice(0, 24),
      );

      const inboundTokenHash = hash(data.token);

      const existing = await emails.findOne({
        $or: [
          { _id: id },
          { inboundTokenHash },
        ],
      });

      if (existing) {
        return res.status(200).json({ success: true });
      }

      let attachmentFields = {};

      if (files.length === 1) {
        const file = files[0];
        const fileName = file.originalname
          .replace(/[/\\\u0000-\u001f\u007f]/g, "_")
          .slice(0, 120) || "attachment";

        const stream = emailAttachmentsBucket.openUploadStream(
          fileName,
          {
            metadata: {
              ownerUsername: username,
              externalAddress: sender,
              mimeType: "application/octet-stream",
              uploadedAt: new Date(),
            },
          },
        );

        uploadedAttachmentId = stream.id;

        try {
          await new Promise((resolve, reject) => {
            stream.once("error", reject);
            stream.once("finish", resolve);
            stream.end(file.buffer);
          });
        } catch (error) {
          await stream.abort().catch(() => {});
          throw error;
        }

        attachmentFields = {
          attachmentId: stream.id.toString(),
          attachmentName: fileName,
          attachmentSize: file.size,
        };
      }

      const subject = typeof data.subject === "string"
        ? data.subject.replace(/[\r\n\0]/g, " ").trim()
        : "";

      const record = {
        _id: id,
        threadId: original.threadId,
        type: "external",
        direction: "incoming",
        ownerUsername: username,
        recipientUsername: username,
        externalAddress: sender,
        subject: limitText(subject || "(no subject)", 120),
        body: limitText(data["body-plain"], 4000),
        inboundTokenHash,
        providerMessageId: messageId,
        deliveryStatus: "sent",
        recipientRead: false,
        senderDeleted: false,
        at: Date.now(),
        ...attachmentFields,
      };

      await emails.insertOne(record);
      inserted = true;

      io.to(`peer:${username}`).emit("email:new", {
        email: emailForUser(record, username),
      });

      return res.status(200).json({ success: true });
    } catch (error) {
      if (uploadedAttachmentId && !inserted) {
        await emailAttachmentsBucket
          .delete(uploadedAttachmentId)
          .catch(() => {});
      }

      if (error?.code === 11000) {
        return res.status(200).json({ success: true });
      }

      console.error("[MAILGUN INBOUND ERROR]", {
        name: error?.name,
        code: error?.code,
      });

      return res.status(500).json({
        error: "Incoming email could not be stored",
      });
    }
  };

  app.post("/api/emails/external/inbound", (req, res) => {
    upload(req, res, (error) => {
      if (error) {
        return res.status(406).json({
          error: "Incoming email supports one attachment up to 10 MB",
        });
      }

      void receive(req, res);
    });
  });
}