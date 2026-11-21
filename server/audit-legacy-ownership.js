import { pathToFileURL } from "node:url";

const usernameFields = {
  email_users: ["_id", "piUsername"],
  emails: ["ownerUsername", "senderUsername", "recipientUsername"],
  messages: ["senderUsername", "recipientUsername", "deletedFor"],
  chat_groups: ["ownerUsername", "members"],
  group_messages: ["senderUsername", "readBy", "deletedFor"],
  contacts: ["username"],
  app_state: [],
  "email_attachments.files": ["metadata.ownerUsername", "metadata.senderUsername", "metadata.recipientUsername"],
  "chat_attachments.files": ["metadata.senderUsername", "metadata.recipientUsername"],
  "chat_images.files": ["metadata.senderUsername", "metadata.recipientUsername"],
  "group_media.files": ["metadata.senderUsername"],
  external_email_usage: [],
  pstn_attempts: ["ownerUsername"],
  pstn_usage: [],
};

const legacyIdFields = {
  email_users: "userId",
  contacts: "ownerUserId",
  app_state: "ownerUserId",
  "email_attachments.files": "metadata.ownerUserId",
  "chat_attachments.files": "metadata.ownerUserId",
  "chat_images.files": "metadata.ownerUserId",
  "group_media.files": "metadata.ownerUserId",
};

const ownerUsernameFields = {
  email_users: "_id",
  "email_attachments.files": "metadata.senderUsername",
  "chat_attachments.files": "metadata.senderUsername",
  "chat_images.files": "metadata.senderUsername",
  "group_media.files": "metadata.senderUsername",
};

const get = (record, path) => path.split(".").reduce((value, key) => value?.[key], record);
const normalized = (value) => {
  if (typeof value !== "string") return null;
  const name = value.trim().replace(/^@+/, "").toLowerCase();
  return /^[a-z0-9._-]{1,32}$/.test(name) ? name : null;
};
const legacyOwner = (value) =>
  typeof value === "string" && value.startsWith("pi_") ? normalized(value.slice(3)) : null;

function project(fields) {
  return { _id: 0, ...Object.fromEntries(fields.map((field) => [field, 1])) };
}

export async function auditLegacyOwnership(db) {
  const registrations = new Map();
  for await (const row of db.collection("email_users").find({}, {
    projection: project(["_id", "userId"]),
  })) {
    const name = normalized(row._id);
    if (!name) continue;
    const previous = registrations.get(name);
    registrations.set(name, { count: (previous?.count ?? 0) + 1, userId: row.userId });
  }

  const report = { mode: "dry-run", collections: {} };
  for (const [collection, fields] of Object.entries(usernameFields)) {
    const legacyIdField = legacyIdFields[collection];
    const usage = collection === "external_email_usage" || collection === "pstn_usage";
    const projection = project([
      ...fields,
      ...(legacyIdField ? [legacyIdField] : []),
      ...(usage ? ["_id"] : []),
    ]);
    const counts = { scanned: 0, usernameDependent: 0, issues: {} };
    report.collections[collection] = counts;
    for await (const row of db.collection(collection).find({}, { projection })) {
      counts.scanned++;
      const names = fields.flatMap((field) => {
        const value = get(row, field);
        return value === undefined ? [] : [value].flat();
      });
      const issues = new Set();
      if (usage && typeof row._id === "string" && row._id.startsWith("user:")) {
        const pattern = collection === "pstn_usage"
          ? /^user:\d{4}-\d{2}-\d{2}:([^:]+)$/
          : /^user:([^:]+):\d{4}-\d{2}-\d{2}$/;
        names.push(row._id.match(pattern)?.[1]);
      }
      const inboundAttachment = collection === "email_attachments.files" &&
        row.metadata?.ownerUsername !== undefined && row.metadata?.senderUsername === undefined;
      if (legacyIdField && !inboundAttachment) {
        const legacyId = get(row, legacyIdField);
        const name = legacyOwner(legacyId);
        const expectedField = ownerUsernameFields[collection];
        const expected = expectedField && normalized(get(row, expectedField));
        if (!name) issues.add("missing_or_invalid_legacy_owner");
        else {
          names.push(name);
          const registration = registrations.get(name);
          if ((expected && expected !== name) ||
              (registration?.count === 1 && registration.userId !== legacyId)) {
            issues.add("conflicting_legacy_owner");
          }
        }
      }
      if (collection === "email_users" && normalized(row._id) !== normalized(row.piUsername)) {
        issues.add("conflicting_registration");
      }
      if (!usage && names.length === 0 && !legacyIdField) {
        issues.add("missing_username_reference");
      }
      if (!usage || names.length) {
        counts.usernameDependent++;
        // The current registry stores pi_<username>, which cannot attest a stable Pi UID.
        issues.add("unproven_pi_uid_ownership");
      }
      for (const value of names) {
        const name = normalized(value);
        if (!name) issues.add("invalid_username_reference");
        else if (!registrations.has(name)) issues.add("missing_legacy_registration");
        else if (registrations.get(name).count > 1) issues.add("ambiguous_legacy_registration");
      }
      for (const issue of issues) counts.issues[issue] = (counts.issues[issue] ?? 0) + 1;
    }
  }
  return report;
}

async function main() {
  const [mode, port, database, ...extra] = process.argv.slice(2);
  if (mode !== "--dry-run" || !/^\d{1,5}$/.test(port ?? "") ||
      Number(port) < 1 || Number(port) > 65535 ||
      !/^one_connect_audit_[a-z0-9_]{1,35}$/.test(database ?? "") || extra.length) {
    console.error("Usage: node audit-legacy-ownership.js --dry-run <local-port> <one_connect_audit_name>");
    process.exitCode = 2;
    return;
  }
  const { MongoClient } = await import("mongodb");
  const client = new MongoClient(`mongodb://127.0.0.1:${port}/?directConnection=true`, {
    serverSelectionTimeoutMS: 5000,
  });
  try {
    console.log(JSON.stringify(await auditLegacyOwnership(client.db(database)), null, 2));
  } finally {
    await client.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {
    console.error("Dry-run failed. Check the isolated MongoDB instance and database name.");
    process.exitCode = 1;
  });
}
