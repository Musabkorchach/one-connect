import crypto from "node:crypto";

export function verifyMailgunSignature(payload) {
  const signingKey = (
    process.env.MAILGUN_WEBHOOK_SIGNING_KEY || ""
  ).trim();

  if (
    !signingKey ||
    !payload ||
    typeof payload !== "object" ||
    Array.isArray(payload)
  ) {
    return false;
  }

  const { timestamp, token, signature } = payload;

  if (
    (typeof timestamp !== "string" && typeof timestamp !== "number") ||
    typeof token !== "string" ||
    token.length !== 50 ||
    typeof signature !== "string" ||
    !/^[a-f0-9]{64}$/i.test(signature)
  ) {
    return false;
  }

  const timestampText = String(timestamp);

  if (!/^[0-9]{10,12}$/.test(timestampText)) {
    return false;
  }

  const expected = crypto
    .createHmac("sha256", signingKey)
    .update(timestampText + token)
    .digest();

  const received = Buffer.from(signature, "hex");

  return crypto.timingSafeEqual(expected, received);
}