"use client";

import { useEffect, useState } from "react";
import { useConnect } from "@/contexts/connect-context";
import { getGroupCopy, groupFailureMessage } from "@/lib/connect/i18n";
import { getGroupReportedContent, type GroupManagement, type GroupReportedContent } from "@/lib/api-client";
import { GroupMediaContent } from "./group-media";

const button = "min-h-11 rounded-lg border px-3 disabled:opacity-60";
const input = "min-h-11 w-full rounded-lg border bg-background p-2";
const slowIntervals = [0, 5, 15, 30, 60, 120, 300];
const restrictIntervals = [5, 30, 60, 1440, 10080];

export function GroupModerationPanel({ group, token, busy, act, confirm }: {
  group: GroupManagement;
  token: string;
  busy: boolean;
  act: (action: string, data: Record<string, unknown>) => Promise<void>;
  confirm: (label: string, action: string, data: Record<string, unknown>) => void;
}) {
  const { lang } = useConnect();
  const copy = getGroupCopy(lang);
  const mod = group.moderation;
  const [selected, setSelected] = useState("");
  const [preview, setPreview] = useState<{ id: string; message?: GroupReportedContent; error?: string }>();
  const reportId = group.canManage && mod?.reports?.some(report => report.id === selected) ? selected : "";
  useEffect(() => {
    if (!reportId) return;
    const scope = new AbortController();
    void getGroupReportedContent(token, group.id, reportId, scope.signal).then(({ message }) => {
      if (!scope.signal.aborted) setPreview({ id: reportId, message });
    }, failure => {
      if (!scope.signal.aborted) setPreview({ id: reportId, error: groupFailureMessage(failure, getGroupCopy(lang)) });
    });
    return () => scope.abort();
  }, [group.id, reportId, token, lang]);
  if (!mod || !group.canManage) return null;
  const canRestrict = (member: GroupManagement["members"][number]) =>
    member.role === "member" || (member.role === "admin" && group.ownRole === "owner");
  const eligible = group.members.filter(canRestrict);
  const auditLabels: Record<string, string> = {
    details: copy.save, rules: copy.saveRules, photo: copy.changePhoto, invite: copy.invite,
    "revoke-invite": copy.revoke, remove: copy.remove, promote: copy.promote, demote: copy.demote,
    offer: copy.offer, "accept-ownership": copy.acceptOwnership, "approve-join": copy.approve,
    "decline-join": copy.decline, "create-link": copy.createLink, "revoke-link": copy.revokeLink,
    "sharing-permission": copy.sharingPermission, "posting-policy": copy.postingPolicy,
    "slow-mode": copy.slowMode, restrict: copy.restrict, unrestrict: copy.unrestrict, "resolve-report": copy.resolveReport,
  };
  const date = (time: number) => new Date(time).toLocaleString(lang);
  return <details className="space-y-3 rounded-xl border p-3">
    <summary className="min-h-9 cursor-pointer font-medium">{copy.moderation}</summary>
    <form key={mod.rules} className="space-y-2" onSubmit={event => {
      event.preventDefault();
      void act("rules", { rules: new FormData(event.currentTarget).get("rules") });
    }}>
      <label className="block">{copy.rules}
        <textarea name="rules" rows={3} maxLength={2000} defaultValue={mod.rules} dir="auto" className={input} />
      </label>
      <button className={button} disabled={busy}>{copy.saveRules}</button>
    </form>
    <label className="block">{copy.slowSeconds}
      <select value={mod.slowModeSeconds} className={input} disabled={busy}
        onChange={event => confirm(copy.slowMode, "slow-mode", { seconds: Number(event.target.value) })}>
        {slowIntervals.map(seconds => <option key={seconds} value={seconds}>{seconds || copy.off}</option>)}
      </select>
    </label>
    {!!eligible.length && <form className="space-y-2" onSubmit={event => {
      event.preventDefault();
      const fields = new FormData(event.currentTarget);
      const username = fields.get("username");
      confirm(copy.restrict + " @" + username, "restrict", { username, seconds: Number(fields.get("minutes")) * 60 });
    }}>
      <label className="block">{copy.members}
        <select name="username" className={input} required>
          {eligible.map(member => <option key={member.username} value={member.username}>@{member.username}</option>)}
        </select>
      </label>
      <label className="block">{copy.restrictMinutes}
        <select name="minutes" className={input} required>
          {restrictIntervals.map(minutes => <option key={minutes} value={minutes}>{minutes}</option>)}
        </select>
      </label>
      <button className={button} disabled={busy}>{copy.restrict}</button>
    </form>}
    {!!mod.restrictions?.length && <ul className="space-y-2">
      {mod.restrictions.map(entry => <li key={entry.username} className="flex flex-wrap items-center gap-2">
        <bdi>@{entry.username}</bdi>
        <span>{copy.restrictedUntil} {date(entry.until)}</span>
        {eligible.some(member => member.username === entry.username) && <button type="button" className={button} disabled={busy}
          onClick={() => confirm(copy.unrestrict + " @" + entry.username, "unrestrict", { username: entry.username })}>{copy.unrestrict}</button>}
      </li>)}
    </ul>}
    <section>
      <h4 className="font-medium">{copy.reports} ({mod.reports?.length ?? 0})</h4>
      <ul className="space-y-2">
        {mod.reports?.map(report => <li key={report.id} className="space-y-1 rounded-lg border p-2">
          <p><bdi>@{report.reporter}</bdi> {" / "} <bdi>@{report.message.senderUsername}</bdi> {" · "} {copy[report.reason]}</p>
          <p className="text-xs text-muted-foreground" dir="auto">{date(report.at)} {" · "} <bdi>{report.message.id}</bdi></p>
          <button type="button" className={button} aria-expanded={reportId === report.id} onClick={() => {
            setPreview(undefined);
            setSelected(reportId === report.id ? "" : report.id);
          }}>{copy.inspectReport}</button>
          {reportId === report.id && (preview?.id !== report.id
            ? <p role="status">{copy.loading}</p>
            : preview.error ? <p role="alert">{preview.error}</p> : preview.message && <div className="space-y-2">
              <p dir="auto" className="whitespace-pre-wrap break-words">{preview.message.text}</p>
              {preview.message.mediaId && <GroupMediaContent message={preview.message} arabic={lang === "ar"} />}
            </div>)}
          <button type="button" className={button} disabled={busy}
            onClick={() => confirm(copy.resolveReport, "resolve-report", { id: report.id })}>{copy.resolveReport}</button>
        </li>)}
      </ul>
    </section>
    <details>
      <summary className="min-h-9 cursor-pointer">{copy.audit}</summary>
      <ul className="space-y-1 text-sm">
        {mod.audit?.map((entry, index) => <li key={entry.at + ":" + index}>
          <time dateTime={new Date(entry.at).toISOString()}>{date(entry.at)}</time>{" · "}
          <bdi>@{entry.actor}</bdi>{" · "}{auditLabels[entry.action] ?? entry.action}
          {entry.target && <>{" · "}<bdi>@{entry.target}</bdi></>}
        </li>)}
      </ul>
    </details>
  </details>;
}
