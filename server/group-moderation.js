import { ObjectId } from "mongodb";

const durations = new Set([300, 1800, 3600, 86400, 604800]);
const slowIntervals = new Set([0, 5, 15, 30, 60, 120, 300]);
const reportReasons = new Set(["spam", "abuse", "other"]);

export const auditedGroupActions = new Set([
  "details", "rules", "photo", "invite", "revoke-invite", "remove", "promote", "demote",
  "offer", "accept-ownership", "approve-join", "decline-join", "create-link", "revoke-link",
  "sharing-permission", "posting-policy", "slow-mode", "restrict", "unrestrict", "resolve-report",
]);

export function groupModerationView(group, username, manage) {
  return {
    rules: group.rules ?? "",
    slowModeSeconds: group.slowModeSeconds ?? 0,
    restrictedUntil: group.restrictions?.find(entry => entry.username === username && entry.until > Date.now())?.until ?? null,
    ...(manage && {
      restrictions: (group.restrictions ?? []).filter(entry => entry.until > Date.now()),
      reports: group.reports ?? [],
      audit: (group.audit ?? []).slice().reverse(),
    }),
  };
}

export const moderationActions = new Set(["rules", "slow-mode", "restrict", "unrestrict", "report", "resolve-report"]);

export async function groupModerationChange({ group, username, target, owner, manage, regular, data, findMessage, normalize }) {
  const failure = (status, code, message) => ({ status, code, message });
  const invalid = () => failure(400, "GROUP_MODERATION_INVALID", "Invalid moderation request");
  const denied = () => failure(403, "GROUP_MODERATION_FORBIDDEN", "Group moderation permission required");
  const missing = () => failure(404, "GROUP_MODERATION_UNAVAILABLE", "Moderation item is unavailable");
  const { action } = data;
  if (!manage && action !== "report") return denied();
  switch (action) {
    case "rules":
      if (typeof data.rules !== "string" || data.rules.trim().length > 2000) return invalid();
      return { rules: data.rules.trim() };
    case "slow-mode":
      if (!slowIntervals.has(data.seconds)) return invalid();
      return { slowModeSeconds: data.seconds };
    case "restrict":
    case "unrestrict": {
      if (!target || target === username || target === group.ownerUsername || !group.members.includes(target) || (!owner && !regular)) return denied();
      if (action === "restrict" && !durations.has(data.seconds)) return invalid();
      const restrictions = (group.restrictions ?? []).filter(entry => entry.username !== target && entry.until > Date.now());
      if (action === "restrict") restrictions.push({ username: target, until: Date.now() + data.seconds * 1000 });
      return { restrictions };
    }
    case "report": {
      const ref = data.message;
      if (!ref || typeof ref.id !== "string" || !ref.id.trim() || ref.id.length > 120 ||
          typeof ref.senderUsername !== "string" || normalize(ref.senderUsername) !== ref.senderUsername ||
          !reportReasons.has(data.reason)) return invalid();
      if (ref.senderUsername === username) return invalid();
      if (!await findMessage(group, username, ref)) return missing();
      const reports = group.reports ?? [];
      if (reports.some(report => report.reporter === username && report.message.id === ref.id &&
        report.message.senderUsername === ref.senderUsername)) {
        return failure(409, "GROUP_REPORT_EXISTS", "You have already reported this message");
      }
      if (reports.length >= 50) return failure(409, "GROUP_REPORT_QUEUE_FULL", "Group report queue is full");
      return { reports: [...reports, {
        id: new ObjectId().toHexString(), reporter: username, reason: data.reason, at: Date.now(),
        message: { id: ref.id, senderUsername: ref.senderUsername },
      }] };
    }
    case "resolve-report": {
      const reports = group.reports ?? [];
      if (!reports.some(report => report.id === data.id)) return missing();
      return { reports: reports.filter(report => report.id !== data.id) };
    }
    default:
      return invalid();
  }
}
