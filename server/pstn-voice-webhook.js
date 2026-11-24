import { AccountWriteRejected, accountWrites } from "./account-write-fence.js";
import { accountAttempts, accountBinding, deletedPstnAttempts, pstnDailyQuota } from "./pstn-account.js";
import { identityBindingsCollection } from "./account-identity.js";
import twilio from "twilio";
import { getPstnConfig, normalizePstnPhone } from "./pstn-config.js";

const WEBHOOK_PATH = "/api/calls/pstn/voice";
const WEBHOOK_URL =
  `https://one-connect.onrender.com${WEBHOOK_PATH}`;

const STATUS_PATH = "/api/calls/pstn/status";
const STATUS_URL = "https://one-connect.onrender.com" + STATUS_PATH;
const PROGRESS_PATH = "/api/calls/pstn/progress";
const PROGRESS_URL = "https://one-connect.onrender.com" + PROGRESS_PATH;
const callSid = /^CA[a-f0-9]{32}$/i;
const noConnection = ["failed", "no-answer", "busy", "canceled"];

async function markConnected(usage, attempt) {
  if (!attempt.quotaKey) return;
  await usage.updateOne({ _id: attempt.quotaKey },
    { $set: { connected: true, count: 1, pending: false } });
}

async function verifyNonConnection(usage, attempt, config, childSid, result) {
  if (!attempt.quotaKey || !callSid.test(childSid || "") || childSid === attempt.parentCallSid) return;
  const reservation = { _id: attempt.quotaKey, attemptId: attempt._id, pending: true, connected: { $ne: true } };
  if (!await usage.findOne(reservation)) return;

  const child = await twilio(config.accountSid, config.authToken, { timeout: 3000 }).calls(childSid).fetch();
  if (child.sid !== childSid || child.accountSid !== config.accountSid ||
      child.parentCallSid !== attempt.parentCallSid || child.direction !== "outbound-dial" ||
      child.to !== attempt.phone) return;

  if (["in-progress", "completed"].includes(child.status) || Number(child.duration) > 0) {
    await markConnected(usage, attempt);
    return;
  }

  // The authenticated Call resource must independently confirm a terminal non-connection.
  if (child.status === result && [null, "", "0", 0].includes(child.duration)) {
    await usage.updateOne(reservation, { $set: { count: 0, pending: false, verifiedRelease: true } });
  }
}

function signed(req, config, path, url) {
  const signature = req.get("X-Twilio-Signature");
  return req.originalUrl === path && req.is("application/x-www-form-urlencoded") && req.body &&
    typeof req.body === "object" && !Array.isArray(req.body) &&
    Object.values(req.body).every((value) => typeof value === "string") && typeof signature === "string" &&
    twilio.validateRequest(config.authToken, signature, url, req.body) && req.body.AccountSid === config.accountSid;
}

export function registerPstnVoiceWebhook({ app, db, writeAccount, bindAccounts }) {
  const attempts = bindAccounts ? accountAttempts(db) : db.collection("pstn_attempts");
  const usage = db.collection("pstn_usage");
  const deletedAttempts = deletedPstnAttempts(db);
  const eligible = async (record, config) => Boolean(record && (bindAccounts
    ? config.allowedAccountIds.has(record.ownerAccountId) && (await accountBinding(db, record.ownerAccountId))?.state === "active"
    : config.allowedUsers.has(record.ownerUsername)));

  if (bindAccounts) app.post(STATUS_PATH, async (req, res) => {
    res.set("Cache-Control", "no-store");
    try {
      const config = getPstnConfig(true);
      if (!config) return res.sendStatus(503);
      if (!signed(req, config, STATUS_PATH, STATUS_URL) || !/^CA[a-f0-9]{32}$/i.test(req.body.CallSid || "") ||
          !["completed", "busy", "no-answer", "failed", "canceled"].includes(req.body.DialCallStatus)) return res.sendStatus(403);
      const record = await attempts.findOne({ parentCallSid: req.body.CallSid });
      const { DialCallStatus, DialBridged, DialCallSid } = req.body;
      if (!record) {
        const deleted = await deletedAttempts.findOne({ _id: req.body.CallSid });
        if (!deleted) return res.sendStatus(403);
        if (DialBridged === "true" || DialCallStatus === "completed") await markConnected(usage, deleted);
        return res.type("text/xml").send(new twilio.twiml.VoiceResponse().toString());
      }
      if (DialBridged === "true" || DialCallStatus === "completed") {
        await markConnected(usage, record);
      } else if (DialBridged === "false" && noConnection.includes(DialCallStatus)) {
        await verifyNonConnection(usage, record, config, DialCallSid, DialCallStatus);
      }
      await accountWrites(attempts, writeAccount, record.ownerAccountId).updateOne({ _id: record._id, ownerAccountId: record.ownerAccountId, parentCallSid: req.body.CallSid, state: "dialing" },
        { $set: { state: req.body.DialCallStatus, endedAt: Date.now() }, $unset: { voiceXml: "" } });
      return res.type("text/xml").send(new twilio.twiml.VoiceResponse().toString());
    } catch (error) {
      if (error instanceof AccountWriteRejected) return res.type("text/xml").send(new twilio.twiml.VoiceResponse().toString());
      console.error("[PSTN STATUS ERROR]", error?.name || "Error");
      return res.sendStatus(503);
    }
  });

  if (bindAccounts) app.post(PROGRESS_PATH, async (req, res) => {
    res.set("Cache-Control", "no-store");
    try {
      const config = getPstnConfig(true);
      if (!config) return res.sendStatus(503);
      if (!signed(req, config, PROGRESS_PATH, PROGRESS_URL)) return res.sendStatus(403);
      const { CallSid, ParentCallSid, CallStatus, CallbackSource } = req.body;
      if (!callSid.test(CallSid || "") || !callSid.test(ParentCallSid || "") || CallSid === ParentCallSid ||
          CallbackSource !== "call-progress-events" ||
          !["in-progress", "completed", ...noConnection].includes(CallStatus)) return res.sendStatus(403);
      const attempt = await attempts.findOne({ parentCallSid: ParentCallSid }) ??
        await deletedAttempts.findOne({ _id: ParentCallSid });
      if (!attempt) return res.sendStatus(403);
      if (["in-progress", "completed"].includes(CallStatus)) await markConnected(usage, attempt);
      return res.sendStatus(204);
    } catch (error) {
      console.error("[PSTN PROGRESS ERROR]", error?.name || "Error");
      return res.sendStatus(503);
    }
  });

  app.post(WEBHOOK_PATH, async (req, res) => {
    res.set("Cache-Control", "no-store");

    try {
      const config = getPstnConfig(bindAccounts);

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
        !(await eligible(record, config)) ||
        typeof record.phone !== "string" ||
        normalizePstnPhone(record.phone) !== record.phone
      ) {
        return res.sendStatus(403);
      }

      // Preserve replay behavior only for the legacy path.
      if (
        !bindAccounts && record.state === "dialing" &&
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
        ...(bindAccounts ? { action: STATUS_URL } : {}),
        answerOnBridge: true,
        timeout: 30,
        timeLimit: Math.min(
          record.maxDurationSeconds,
          config.maxDurationSeconds,
        ),
      }).number(bindAccounts ? {
        statusCallback: PROGRESS_URL,
        statusCallbackEvent: ["answered", "completed"],
        statusCallbackMethod: "POST",
      } : {}, record.phone);

      response.hangup();

      const voiceXml = response.toString();

      const claim = (collection, claimTime, options = {}, quotaKey) => collection.findOneAndUpdate(
        {
          _id: identity,
          state: "ready",
          expiresAt: { $gt: claimTime },
        },
        {
          $set: {
            state: "dialing",
            parentCallSid: body.CallSid,
            submittedAt: claimTime,
            ...(quotaKey ? { quotaKey } : { voiceXml }),
          },
        },
        {
          returnDocument: "after",
          includeResultMetadata: false,
          ...options,
        },
      );

      const claimed = bindAccounts
        ? await writeAccount(record.ownerAccountId, async (session) => {
          const binding = await db.collection(identityBindingsCollection).findOne(
            { accountId: record.ownerAccountId }, { session },
          );
          const claimTime = Date.now();
          const { key, quotaResetsAt, attemptKey } = pstnDailyQuota(config.abuseSecret, binding._id, claimTime);
          if (await usage.findOne({
            _id: key, $or: [{ count: { $gte: 1 } }, { verifiedRelease: { $ne: true } }],
          }, { session })) return null;
          if (await usage.findOne({ _id: attemptKey, count: { $gte: config.attemptLimit } }, { session })) return null;
          const attempt = await claim(attempts, claimTime, { session }, key);
          if (attempt) {
            await usage.updateOne({ _id: attemptKey },
              { $inc: { count: 1 }, $set: { quotaResetsAt } }, { upsert: true, session });
            // Reserve in the same transaction as the attempt, before returning Dial instructions.
            await usage.updateOne({ _id: key }, {
              $set: { count: 1, quotaResetsAt, attemptId: attempt._id, pending: true },
              $unset: { dial: "", child: "", verifiedRelease: "" },
            }, { upsert: true, session });
          }
          return attempt;
        })
        : await claim(attempts, now);

      if (claimed && (!bindAccounts || ((await eligible(claimed, config)) && await usage.findOne({
        _id: claimed.quotaKey, attemptId: claimed._id, pending: true, connected: { $ne: true },
      })))) {
        return res.type("text/xml").send(voiceXml);
      }

      // Experimental attempts issue Dial at most once, even when a response is lost.
      if (bindAccounts) return res.sendStatus(403);

      // Another legacy request may have claimed the attempt concurrently.
      const existing = await attempts.findOne({
        _id: identity,
        state: "dialing",
        parentCallSid: body.CallSid,
      });

      if (existing && typeof existing.voiceXml === "string" && (!bindAccounts || await eligible(existing, config))) {
        return res.type("text/xml").send(existing.voiceXml);
      }

      return res.sendStatus(403);
    } catch (error) {
      if (error instanceof AccountWriteRejected) return res.sendStatus(403);
      console.error("[PSTN VOICE ERROR]", error?.name || "Error");
      return res.sendStatus(503);
    }
  });
}