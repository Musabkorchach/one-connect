import { insertWithScopedFile, accountWrites, respondToBlockedWrite, AccountWriteRejected } from "./account-write-fence.js";
import { carryMailQuota, settleMailSubmission, trackMailSubmission } from "./account-external-operations.js";
import { findActiveEmailAccount } from "./email-account-access.js";
import { senderEmailKey } from "./email-account-access.js";
import crypto from "node:crypto";
import { ObjectId } from "mongodb";
import {
  getMailgunConfig,
  MailgunSendError,
  sendMailgunEmail,
} from "./mailgun-email.js";

const ADDRESS_PATTERN =
  /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i;

async function reserveDailyQuota(collection, key, limit) {
  try {
    await collection.updateOne(
      { _id: key, count: { $lt: limit } },
      { $inc: { count: 1 } },
      { upsert: true },
    );
    return true;
  } catch (error) {
    if (error?.code === 11000) return false;
    throw error;
  }
}

export function registerExternalEmailRoutes({
  app,
  db,
  writeAccount,
  publishEmailEvent,
  requireSession,
  normalizeMessagingUsername,
  emailForUser,
  emailAttachmentsBucket,
}) {
  const emails = db.collection("emails");
  const usage = db.collection("external_email_usage");

  app.post("/api/emails/external", requireSession, async (req, res) => {
    const username = normalizeMessagingUsername(req.user.piUsername);
    const data = req.body;
    const { accountId } = req.user;
    const mutations = accountWrites(emails, writeAccount, accountId);

    if (!username) {
      return res.status(401).json({ error: "Invalid user identity" });
    }

    if (
      !data ||
      typeof data !== "object" ||
      Array.isArray(data) ||
      typeof data.id !== "string" ||
      !/^[a-zA-Z0-9_-]{16,80}$/.test(data.id) ||
      typeof data.recipient !== "string" ||
      typeof data.subject !== "string" ||
      data.subject.length > 120 ||
      /[\r\n\0]/.test(data.subject) ||
      typeof data.body !== "string" ||
      !data.body.trim() ||
      data.body.length > 4000
    ) {
      return res.status(400).json({ error: "Invalid external email data" });
    }

    const recipient = data.recipient.trim().toLowerCase();
    const subject = data.subject.trim() || "(no subject)";
    const attachmentId = data.attachmentId === undefined
      ? null
      : typeof data.attachmentId === "string"
        ? data.attachmentId.toLowerCase()
        : "";

    if (
      recipient.length > 254 ||
      !ADDRESS_PATTERN.test(recipient) ||
      (attachmentId !== null && !/^[a-f0-9]{24}$/.test(attachmentId)) ||
      data.attachmentName !== undefined ||
      data.attachmentSize !== undefined
    ) {
      return res.status(400).json({
        error: "Invalid recipient or attachment",
      });
    }

    let record = null;

    try {
      getMailgunConfig();

      const existing = await emails.findOne(senderEmailKey(accountId, username, data.id));

      if (existing) {
        const sameRequest =
          existing.type === "external" &&
          existing.direction === "outgoing" &&
          (accountId ? existing.ownerAccountId === accountId : existing.ownerUsername === username) &&
          existing.externalAddress === recipient &&
          existing.subject === subject &&
          existing.body === data.body &&
          (existing.attachmentId ?? null) === attachmentId;

        if (!sameRequest) {
          return res.status(409).json({
            error: "Email ID is already used for another message",
          });
        }

        if (existing.submissionState === "accepted") {
          return res.json({ email: emailForUser(existing, username, accountId) });
        }

        return res.status(409).json({
          error: existing.submissionState === "failed"
            ? "This email attempt failed. Create a new message to try again."
            : "This email attempt is already recorded. Check Sent before trying again.",
        });
      }

      let attachment;

      if (attachmentId) {
        const file = await emailAttachmentsBucket.find({
          _id: new ObjectId(attachmentId),
          ...(accountId ? {
            "metadata.accountScoped": true,
            "metadata.ownerAccountId": accountId,
          } : {
            "metadata.accountScoped": { $ne: true },
            "metadata.ownerUserId": req.user.userId,
            "metadata.senderUsername": username,
          }),
          "metadata.externalAddress": recipient,
        }).next();

        if (
          !file ||
          !Number.isSafeInteger(file.length) ||
          file.length <= 0 ||
          file.length > 10 * 1024 * 1024
        ) {
          return res.status(400).json({
            error: "Attachment is unavailable or does not match this recipient",
          });
        }

        const chunks = [];
        let size = 0;
        const stream = emailAttachmentsBucket.openDownloadStream(file._id);

        try {
          for await (const chunk of stream) {
            size += chunk.length;

            if (size > 10 * 1024 * 1024) {
              throw new Error("Attachment exceeds the size limit");
            }

            chunks.push(chunk);
          }
        } finally {
          stream.destroy();
        }

        if (size !== file.length) {
          throw new Error("Attachment size does not match stored metadata");
        }

        attachment = {
          buffer: Buffer.concat(chunks),
          fileName: file.filename,
        };
      }

      record = {
        _id: new ObjectId(),
        ...(accountId ? {
          accountScoped: true,
          accountMessageId: data.id,
          senderAccountId: accountId,
          ownerAccountId: accountId,
        } : { id: data.id }),
        threadId: crypto.randomUUID(),
        type: "external",
        direction: "outgoing",
        ownerUsername: username,
        senderUsername: username,
        externalAddress: recipient,
        subject,
        body: data.body,
        replyToken: crypto.randomBytes(24).toString("hex"),
        submissionState: "preparing",
        deliveryStatus: "pending",
        senderDeleted: false,
        recipientRead: true,
        at: Date.now(),
        ...(attachment ? {
          attachmentId,
          attachmentName: attachment.fileName,
          attachmentSize: attachment.buffer.length,
        } : {}),
      };

      try {
        await insertWithScopedFile(db, writeAccount, accountId, emails, record, "email_attachments", record.attachmentId);
      } catch (error) {
        if (error?.code !== 11000) throw error;

        return res.status(409).json({
          error: "This email request is already being processed",
        });
      }

      const day = new Date().toISOString().slice(0, 10);
      const userQuotaKey = accountId
        ? await writeAccount(accountId, async (session) => {
          const binding = await findActiveEmailAccount(db, accountId);
          if (!binding) throw new AccountWriteRejected();
          return carryMailQuota(db, accountId, binding._id, day, session);
        })
        : `user:${username}:${day}`;
      const userAllowed = await reserveDailyQuota(usage, userQuotaKey, 10);
      const appAllowed = userAllowed && await reserveDailyQuota(
        usage,
        `app:${day}`,
        90,
      );

      if (!appAllowed) {
        await mutations.updateOne(
          { _id: record._id },
          {
            $set: {
              submissionState: "failed",
              deliveryStatus: "failed",
            },
          },
        );

        return res.status(429).json({
          error: "The external email test limit has been reached for today",
        });
      }

      if (accountId) {
        await writeAccount(accountId, async (session) => {
          const updated = await emails.updateOne({ _id: record._id, ownerAccountId: accountId, submissionState: "preparing" },
            { $set: { submissionState: "submitting" } }, { session });
          if (!updated.matchedCount) throw new AccountWriteRejected();
          await trackMailSubmission(db, accountId, record._id, session);
        });
      } else {
        await mutations.updateOne({ _id: record._id }, { $set: { submissionState: "submitting" } });
      }

      let confirmation;

      try {
        if (accountId && !await findActiveEmailAccount(db, accountId)) throw new AccountWriteRejected();
        confirmation = await sendMailgunEmail({
          messageId: record._id.toString(),
          senderUsername: username,
          recipient,
          subject,
          body: data.body,
          replyToken: record.replyToken,
          attachment,
        });
      } catch (error) {
        const failed =
          error instanceof MailgunSendError &&
          error.outcome !== "unknown";

        if (accountId && (failed || error instanceof AccountWriteRejected)) {
          await settleMailSubmission(db, accountId, record._id);
        }
        await mutations.updateOne(
          { _id: record._id, submissionState: "submitting" },
          {
            $set: {
              submissionState: failed ? "failed" : "unknown",
              deliveryStatus: failed ? "failed" : "pending",
            },
          },
        );

        throw error;
      }

      if (accountId) await settleMailSubmission(db, accountId, record._id);
      await mutations.updateOne(
        { _id: record._id },
        {
          $set: {
            submissionState: "accepted",
            providerMessageId: confirmation.providerMessageId,
          },
        },
      );

      const saved = await emails.findOne({ _id: record._id });
      const email = emailForUser(saved, username, accountId);

      await publishEmailEvent({ accountId, username }, "email:new", email);

      return res.status(201).json({ email });
    } catch (error) {
      if (respondToBlockedWrite(error, res)) return;
      // Do not log provider credentials or email contents.
      console.error("[EXTERNAL EMAIL SEND ERROR]", {
        name: error?.name,
        outcome: error instanceof MailgunSendError
          ? error.outcome
          : "unknown",
        emailId: record?._id?.toString(),
      });

      return res.status(502).json({
        error: error instanceof MailgunSendError
          ? error.message
          : "Email submission could not be confirmed. Check Sent before retrying.",
      });
    }
  });
}