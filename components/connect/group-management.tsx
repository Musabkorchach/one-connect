"use client";

import { useEffect, useRef, useState } from "react";
import { getGroupInvitations, getGroupManagement, manageGroup, onGroupEvent, type GroupManagement } from "@/lib/api-client";
import { usePiAuth } from "@/contexts/pi-auth-context";
import { ConfirmDialog, Sheet } from "./feedback";
import { useConnect } from "@/contexts/connect-context";
import { getGroupCopy } from "@/lib/connect/i18n";

const inviteErrorCopy = new Map<string, "alreadyMember" | "alreadyInvited" | "groupFull" | "notVerified">([
  ["GROUP_ALREADY_MEMBER", "alreadyMember"],
  ["GROUP_ALREADY_INVITED", "alreadyInvited"],
  ["GROUP_FULL", "groupFull"],
  ["GROUP_INVITEE_NOT_VERIFIED", "notVerified"],
] as const);

function groupError(failure: unknown, copy: ReturnType<typeof getGroupCopy>) {
  const code = failure instanceof Error && "code" in failure ? failure.code : undefined;
  const key = typeof code === "string" ? inviteErrorCopy.get(code) : undefined;
  return key ? copy[key] : copy.failure;
}

const actionButton = "min-h-11 rounded-lg px-2.5 text-sm font-medium underline-offset-4 hover:underline focus-visible:outline";


export function GroupManagementSheet({ groupId, token, username, onClose, onLeave }: {
  groupId: string; token: string; username: string; onClose: () => void; onLeave: () => void;
}) {
  const { lang } = useConnect();
  const copy = getGroupCopy(lang);
  const [confirmation, setConfirmation] = useState<{ label: string; action: string; data?: Record<string, unknown> } | null>(null);
  const [group, setGroup] = useState<GroupManagement | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const lifetime = useRef<AbortController | null>(null);
  const refreshRef = useRef<() => void>(() => {});
  const busyRef = useRef(false);

  useEffect(() => {
    const scope = new AbortController();
    lifetime.current = scope;
    let revision = 0;
    const refresh = () => {
      const request = ++revision;
      void getGroupManagement(token, groupId, scope.signal).then(({ group: result }) => {
        if (!scope.signal.aborted && request === revision) { setGroup(result); setError(""); }
      }, (failure: Error) => {
        if (!scope.signal.aborted && request === revision) { setGroup(null); setError(failure.message); }
      });
    };
    refreshRef.current = refresh;
    const unsub = onGroupEvent("group:updated", event => { if (event.id === groupId) refresh(); });
    const disconnectRefresh = onGroupEvent("connect", refresh);
    refresh();
    return () => { scope.abort(); unsub(); disconnectRefresh(); };
  }, [groupId, token]);

  async function act(action: string, data = {}) {
    const scope = lifetime.current;
    if (!scope || scope.signal.aborted || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      const { group: result } = await manageGroup(token, groupId, action, data, scope.signal);
      if (scope.signal.aborted) return;
      if (action === "leave" && !result) onLeave();
      else refreshRef.current();
    } catch (failure) {
      if (!scope.signal.aborted) setError(groupError(failure, copy));
    } finally {
      busyRef.current = false;
      if (!scope.signal.aborted) setBusy(false);
    }
  }

  return (
    <Sheet open title={copy.title} onClose={onClose}>
      <ConfirmDialog open={confirmation !== null} title={copy.confirm} message={confirmation?.label ?? ""}
        confirmLabel={copy.confirm} cancelLabel={copy.cancel}
        onCancel={() => setConfirmation(null)} onConfirm={() => {
          if (!confirmation) return;
          setConfirmation(null);
          void act(confirmation.action, confirmation.data);
        }} />
      <div dir={lang === "ar" ? "rtl" : "ltr"} className="max-h-[60dvh] space-y-4 overflow-y-auto py-3">
        {error && <p role="alert">{error}</p>}
        {!group && !error && <p role="status">Loading group information…</p>}
        {group && (
          <>
            <h3 className="font-semibold">{group.name}</h3>
            {group.description && <p className="whitespace-pre-wrap">{group.description}</p>}
            <p>{copy.owner} ? @{group.owner}</p>
            <ul aria-label={copy.members} className="space-y-2">
              {group.members.map(member => (
                <li key={member.username} className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border p-2">
                  <span>@{member.username} · {member.role}</span>
                  {group.canManage && member.role !== "owner" && (group.ownRole === "owner" || member.role === "member") &&
                    <button type="button" className={actionButton} disabled={busy}
                      onClick={() => setConfirmation({ label: copy.remove + " @" + member.username, action: "remove", data: { username: member.username } })}>{copy.remove}</button>}
                  {group.canManage && group.ownRole === "owner" && member.role !== "owner" && (
                    <>
                      <button type="button" className={actionButton} disabled={busy} onClick={() => {
                        const action = member.role === "admin" ? "demote" : "promote";
                        setConfirmation({ label: copy[action] + " @" + member.username, action, data: { username: member.username } });
                      }}>{copy[member.role === "admin" ? "demote" : "promote"]}</button>
                      <button type="button" className={actionButton} disabled={busy}
                        onClick={() => setConfirmation({ label: copy.offer + " @" + member.username, action: "offer", data: { username: member.username } })}>{copy.offer}</button>
                    </>
                  )}
                </li>
              ))}
            </ul>
            {group.offer?.toAccountId === username && (
              <div className="flex flex-wrap gap-3">
                <span>@{group.offer.fromAccountId} {copy.receivedOffer}</span>
                <button type="button" className={actionButton} disabled={busy}
                  onClick={() => setConfirmation({ label: copy.acceptOwnership, action: "accept-ownership", data: { offerId: group.offer?.id } })}>{copy.acceptOwnership}</button>
                <button type="button" className={actionButton} disabled={busy}
                  onClick={() => void act("decline-ownership", { offerId: group.offer?.id })}>{copy.decline}</button>
              </div>
            )}
            {group.ownRole === "owner" && group.offer && <p role="status">{copy.sentOffer} @{group.offer.toAccountId}.</p>}
            {group.canManage && (
              <>
                <form key={group.revision} className="space-y-2" onSubmit={event => {
                  event.preventDefault();
                  const data = new FormData(event.currentTarget);
                  void act("details", { name: data.get("name"), description: data.get("description"), revision: group.revision });
                }}>
                  <label className="block">{copy.name}<input name="name" dir="auto" className="w-full rounded border bg-background p-2"
                    required maxLength={80} defaultValue={group.name} /></label>
                  <label className="block">{copy.description}<textarea name="description" dir="auto" className="w-full rounded border bg-background p-2"
                    maxLength={500} defaultValue={group.description} /></label>
                  <button className={actionButton} disabled={busy}>{copy.save}</button>
                </form>
                <form className="flex gap-2" onSubmit={event => {
                  event.preventDefault();
                  void act("invite", { username: new FormData(event.currentTarget).get("username") });
                }}>
                  <input name="username" aria-label={copy.username} placeholder={copy.username} dir="ltr" required maxLength={33}
                    className="min-w-0 flex-1 rounded border bg-background p-2" />
                  <button className={actionButton} disabled={busy}>{copy.invite}</button>
                </form>
                <ul className="space-y-2">{group.invitations.map(person => (
                  <li key={person}>@{person} <button type="button" className={actionButton} disabled={busy}
                    onClick={() => setConfirmation({ label: copy.revoke + " @" + person, action: "revoke-invite", data: { username: person } })}>{copy.revoke}</button></li>
                ))}</ul>
              </>
            )}
            {group.canLeave && <button type="button" className={actionButton + " text-destructive"} disabled={busy}
              onClick={() => setConfirmation({ label: copy.leave, action: "leave" })}>{copy.leave}</button>}
          </>
        )}
      </div>
    </Sheet>
  );
}

export function GroupInvitations() {
  const { sessionToken } = usePiAuth();
  const { lang } = useConnect();
  const copy = getGroupCopy(lang);
  const [invitations, setInvitations] = useState<Awaited<ReturnType<typeof getGroupInvitations>>["invitations"]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const refreshRef = useRef<() => void>(() => {});
  const lifetime = useRef<AbortController | null>(null);
  useEffect(() => {
    if (!sessionToken) return;
    const scope = new AbortController();
    lifetime.current = scope;
    let revision = 0;
    const refresh = () => {
      const request = ++revision;
      void getGroupInvitations(sessionToken, scope.signal).then(result => {
        if (!scope.signal.aborted && request === revision) { setInvitations(result.invitations); setError(""); }
      }, (failure: Error) => {
        if (!scope.signal.aborted && request === revision) setError(failure.message);
      });
    };
    refreshRef.current = refresh;
    const unsubscribe = onGroupEvent("group:invited", refresh);
    const reconnect = onGroupEvent("connect", refresh);
    refresh();
    return () => { scope.abort(); unsubscribe(); reconnect(); };
  }, [sessionToken]);
  async function respond(id: string, accept: boolean) {
    const scope = lifetime.current;
    if (!sessionToken || !scope || scope.signal.aborted || busy) return;
    setBusy(true);
    try {
      await manageGroup(sessionToken, id, accept ? "accept-invite" : "decline-invite", {}, scope.signal);
      refreshRef.current();
    } catch (failure) {
      if (!scope.signal.aborted) setError(groupError(failure, copy));
    } finally {
      if (!scope.signal.aborted) setBusy(false);
    }
  }
  return (
    <>
      {error && <p className="px-3 py-2 text-sm" role="alert">{error}</p>}
      {invitations.length > 0 && <ul dir={lang === "ar" ? "rtl" : "ltr"} aria-label={copy.invitations} className="space-y-2 px-3 py-2">
        {invitations.map(invite => <li key={invite.id} className="flex flex-wrap items-center gap-2">
          <span>{invite.name} · @{invite.owner}</span>
          <button type="button" className={actionButton} disabled={busy} onClick={() => void respond(invite.id, true)}>{copy.accept}</button>
          <button type="button" className={actionButton} disabled={busy} onClick={() => void respond(invite.id, false)}>{copy.decline}</button>
        </li>)}
      </ul>}
    </>
  );
}
