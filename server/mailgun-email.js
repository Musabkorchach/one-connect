import { Blob, Buffer } from "node:buffer";

export class MailgunSendError extends Error {
  constructor(message, outcome = "unknown") {
    super(message);
    this.name = "MailgunSendError";
    this.outcome = outcome;
  }
}

export function getMailgunConfig() {
  const apiKey = (process.env.MAILGUN_API_KEY || "").trim();
  const domain = (process.env.MAILGUN_DOMAIN || "").trim().toLowerCase();
  const apiBaseUrl = (
    process.env.MAILGUN_API_BASE_URL || "https://api.mailgun.net"
  ).trim().replace(/\/+$/, "");

  if (
    !apiKey ||
    !/^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$/.test(domain) ||
    !domain.includes(".") ||
    ![
      "https://api.mailgun.net",
      "https://api.eu.mailgun.net",
    ].includes(apiBaseUrl)
  ) {
    throw new MailgunSendError(
      "External email service is not configured correctly.",
      "not-submitted",
    );
  }

  return { apiKey, domain, apiBaseUrl };
}

export async function sendMailgunEmail({
  messageId,
  senderUsername,
  recipient,
  subject,
  body,
  replyToken,
  attachment,
}) {
  const { apiKey, domain, apiBaseUrl } = getMailgunConfig();

  if (
    typeof messageId !== "string" ||
    !/^[a-f0-9]{24}$/.test(messageId) ||
    typeof senderUsername !== "string" ||
    !/^[a-z0-9._-]{1,32}$/.test(senderUsername) ||
    typeof recipient !== "string" ||
    recipient.length > 254 ||
    !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i.test(recipient) ||
    typeof subject !== "string" ||
    !subject.trim() ||
    subject.length > 120 ||
    /[\r\n\0]/.test(subject) ||
    typeof body !== "string" ||
    !body.trim() ||
    body.length > 4000 ||
    typeof replyToken !== "string" ||
    !/^[a-f0-9]{48}$/.test(replyToken)
  ) {
    throw new MailgunSendError(
      "Invalid external email data.",
      "not-submitted",
    );
  }

  const form = new FormData();

  form.set(
    "from",
    `One Connect @${senderUsername} <postmaster@${domain}>`,
  );
  form.set("to", recipient);
  form.set("subject", subject);
  form.set("text", body);
  form.set("h:Reply-To", `reply-${replyToken}@${domain}`);
  form.set("v:oneconnect_id", messageId);
  form.set("o:tracking", "no");

  if (attachment) {
    if (
      !Buffer.isBuffer(attachment.buffer) ||
      attachment.buffer.length === 0 ||
      attachment.buffer.length > 10 * 1024 * 1024 ||
      typeof attachment.fileName !== "string" ||
      !attachment.fileName.trim() ||
      attachment.fileName.length > 120 ||
      /[\r\n\0/\\]/.test(attachment.fileName)
    ) {
      throw new MailgunSendError(
        "Invalid external email attachment.",
        "not-submitted",
      );
    }

    form.append(
      "attachment",
      new Blob([attachment.buffer], {
        type: "application/octet-stream",
      }),
      attachment.fileName,
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);

  try {
    const response = await fetch(
      `${apiBaseUrl}/v3/${encodeURIComponent(domain)}/messages`,
      {
        method: "POST",
        headers: {
          Authorization:
            `Basic ${Buffer.from(`api:${apiKey}`).toString("base64")}`,
        },
        body: form,
        signal: controller.signal,
        redirect: "error",
      },
    );

    if (!response.ok) {
      const rejected =
        response.status >= 400 && response.status < 500;

      throw new MailgunSendError(
        `Email provider returned HTTP ${response.status}.`,
        rejected ? "rejected" : "unknown",
      );
    }

    const result = await response.json();

    if (
      !result ||
      typeof result.id !== "string" ||
      !result.id.trim() ||
      result.id.length > 500
    ) {
      throw new MailgunSendError(
        "Email provider returned an invalid confirmation.",
      );
    }

    return { providerMessageId: result.id };
  } catch (error) {
    if (error instanceof MailgunSendError) throw error;

    throw new MailgunSendError(
      "Email submission could not be confirmed. Do not resend automatically.",
    );
  } finally {
    clearTimeout(timer);
  }
}