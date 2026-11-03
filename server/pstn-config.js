export function normalizeFrancePhone(value) {
  if (typeof value !== "string" || value.length > 40) return null;

  let phone = value.trim().replace(/[\s().-]/g, "");

  if (phone.startsWith("0033")) {
    phone = `+33${phone.slice(4)}`;
  } else if (/^0[1-79]\d{8}$/.test(phone)) {
    phone = `+33${phone.slice(1)}`;
  }

  // Initial test policy excludes 08 and short numbers.
  return /^\+33[1-79]\d{8}$/.test(phone) ? phone : null;
}

function readList(value) {
  return (value || "").split(",").map((item) => item.trim()).filter(Boolean);
}

export function getPstnConfig() {
  if (process.env.PSTN_ENABLED !== "true") return null;

  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const apiKeySid = process.env.TWILIO_API_KEY_SID?.trim();
  const apiKeySecret = process.env.TWILIO_API_KEY_SECRET?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const applicationSid = process.env.TWILIO_TWIML_APP_SID?.trim();
  const callerId = process.env.TWILIO_CALLER_ID?.trim();

  const allowedUsers = readList(process.env.PSTN_ALLOWED_USERS)
    .map((username) => username.replace(/^@/, "").toLowerCase());
  const allowedNumbers = readList(process.env.PSTN_ALLOWED_NUMBERS)
    .map(normalizeFrancePhone);

  if (
    !/^AC[a-f0-9]{32}$/i.test(accountSid || "") ||
    !/^SK[a-f0-9]{32}$/i.test(apiKeySid || "") ||
    !apiKeySecret ||
    !authToken ||
    !/^AP[a-f0-9]{32}$/i.test(applicationSid || "") ||
    !/^\+[1-9]\d{7,14}$/.test(callerId || "") ||
    allowedUsers.length === 0 ||
    allowedUsers.some((username) => !/^[a-z0-9._-]{1,32}$/.test(username)) ||
    allowedNumbers.length === 0 ||
    allowedNumbers.some((phone) => phone === null)
  ) {
    throw new Error("Invalid PSTN server configuration");
  }

  return {
    accountSid,
    apiKeySid,
    apiKeySecret,
    authToken,
    applicationSid,
    callerId,
    allowedUsers: new Set(allowedUsers),
    allowedNumbers: new Set(allowedNumbers),
    maxDurationSeconds: 120,
    dailyCallLimit: 5,
  };
}