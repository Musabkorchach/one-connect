import twilio from "twilio";
import { getPstnConfig, normalizePstnPhone } from "./pstn-config.js";

const WEBHOOK_PATH = "/api/calls/pstn/voice";
const WEBHOOK_URL =
  `https://one-connect.onrender.com${WEBHOOK_PATH}`;

export function registerPstnVoiceWebhook({ app, db }) {
  const attempts = db.collection("pstn_attempts");

  app.post(WEBHOOK_PATH, async (req, res) => {
    res.set("Cache-Control", "no-store");

    try {
      const config = getPstnConfig();

      if (!config) {
        return res.sendStatus(503);
      }

      const body = req.body;
      const signature = req.get("X-Twilio-Signature");

      if (
        req.originalUrl !== WEBHOOK_PATH ||
        !req.is("application/x-www-form-urlencoded") ||
        !body ||
        typeof body !== "object" ||
        Array.isArray(body) ||
        Object.values(body).some((value) => typeof value !== "string") ||
        typeof signature !== "string" ||
        !twilio.validateRequest(
          config.authToken,
          signature,
          WEBHOOK_URL,
          body,
        )
      ) {
        return res.sendStatus(403);
      }

      if (
        body.AccountSid !== config.accountSid ||
        !/^CA[a-f0-9]{32}$/i.test(body.CallSid || "") ||
        !/^client:oc_[a-f0-9]{32}$/.test(body.From || "")
      ) {
        return res.sendStatus(403);
      }

      const identity = body.From.slice("client:".length);
      const record = await attempts.findOne({ _id: identity });

      if (
        !record ||
        !config.allowedUsers.has(record.ownerUsername) ||
        typeof record.phone !== "string" ||
        normalizePstnPhone(record.phone) !== record.phone
      ) {
        return res.sendStatus(403);
      }

      // Return the same instructions if Twilio retries this call's webhook.
      if (
        record.state === "dialing" &&
        record.parentCallSid === body.CallSid &&
        typeof record.voiceXml === "string"
      ) {
        return res.type("text/xml").send(record.voiceXml);
      }

      const now = Date.now();

      if (
        record.state !== "ready" ||
        record.expiresAt <= now ||
        !Number.isInteger(record.maxDurationSeconds) ||
        record.maxDurationSeconds < 1
      ) {
        return res.sendStatus(403);
      }

      const response = new twilio.twiml.VoiceResponse();

      response.dial({
        callerId: config.callerId,
        answerOnBridge: true,
        timeout: 30,
        timeLimit: Math.min(
          record.maxDurationSeconds,
          config.maxDurationSeconds,
        ),
      }).number(record.phone);

      response.hangup();

      const voiceXml = response.toString();

      const claimed = await attempts.findOneAndUpdate(
        {
          _id: identity,
          state: "ready",
          expiresAt: { $gt: now },
        },
        {
          $set: {
            state: "dialing",
            parentCallSid: body.CallSid,
            submittedAt: now,
            voiceXml,
          },
        },
        {
          returnDocument: "after",
          includeResultMetadata: false,
        },
      );

      if (claimed) {
        return res.type("text/xml").send(voiceXml);
      }

      // Another request may have claimed the attempt concurrently.
      const existing = await attempts.findOne({
        _id: identity,
        state: "dialing",
        parentCallSid: body.CallSid,
      });

      if (existing && typeof existing.voiceXml === "string") {
        return res.type("text/xml").send(existing.voiceXml);
      }

      return res.sendStatus(403);
    } catch (error) {
      console.error("[PSTN VOICE ERROR]", error?.name || "Error");
      return res.sendStatus(503);
    }
  });
}