"use client";

import { useEffect, useRef, useState } from "react";
import { getGroupInvitations, getGroupManagement, manageGroup, onGroupEvent, type GroupManagement } from "@/lib/api-client";
import { usePiAuth } from "@/contexts/pi-auth-context";
import { Sheet } from "./feedback";

export function GroupManagementSheet({ groupId, token, username, onClose, onLeave }: {
  groupId: string; token: string; username: string; onClose: () => void; onLeave: () => void;
}) {
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
      if (!scope.signal.aborted) setError(failure instanceof Error ? failure.message : "Group update failed");
    } finally {
      busyRef.current = false;
      if (!scope.signal.aborted) setBusy(false);
    }
  }

  return (
    <Sheet open title="Group information" onClose={onClose}>
      <div className="max-h-[72vh] space-y-4 overflow-y-auto p-4">
        {error && <p role="alert">{error}</p>}
        {!group && !error && <p role="status">Loading group information…</p>}
        {group && (
          <>
            <h3 className="font-semibold">{group.name}</h3>
            {group.description && <p className="whitespace-pre-wrap">{group.description}</p>}
            <p>Owner: @{group.owner}</p>
            <ul aria-label="Group members" className="space-y-2">
              {group.members.map(member => (
                <li key={member.username} className="flex flex-wrap gap-x-3 gap-y-1">
                  <span>@{member.username} · {member.role}</span>
                  {group.canManage && member.role !== "owner" && (group.ownRole === "owner" || member.role === "member") &&
                    <button type="button" className="underline" disabled={busy}
                      onClick={() => void act("remove", { username: member.username })}>Remove</button>}
                  {group.canManage && group.ownRole === "owner" && member.role !== "owner" && (
                    <>
                      <button type="button" className="underline" disabled={busy} onClick={() => void act(
                        member.role === "admin" ? "demote" : "promote", { username: member.username },
                      )}>{member.role === "admin" ? "Remove admin role" : "Make admin"}</button>
                      <button type="button" className="underline" disabled={busy}
                        onClick={() => void act("offer", { username: member.username })}>Offer ownership</button>
                    </>
                  )}
                </li>
              ))}
            </ul>
            {group.offer?.toAccountId === username && (
              <div className="flex flex-wrap gap-3">
                <span>@{group.offer.fromAccountId} offered you ownership.</span>
                <button type="button" className="underline" disabled={busy}
                  onClick={() => void act("accept-ownership", { offerId: group.offer?.id })}>Accept ownership</button>
                <button type="button" className="underline" disabled={busy}
                  onClick={() => void act("decline-ownership", { offerId: group.offer?.id })}>Decline</button>
              </div>
            )}
            {group.ownRole === "owner" && group.offer && <p role="status">Ownership offered to @{group.offer.toAccountId}.</p>}
            {group.canManage && (
              <>
                <form key={group.revision} className="space-y-2" onSubmit={event => {
                  event.preventDefault();
                  const data = new FormData(event.currentTarget);
                  void act("details", { name: data.get("name"), description: data.get("description"), revision: group.revision });
                }}>
                  <label className="block">Name <input name="name" className="w-full rounded border bg-background p-2"
                    required maxLength={80} defaultValue={group.name} /></label>
                  <label className="block">Description <textarea name="description" className="w-full rounded border bg-background p-2"
                    maxLength={500} defaultValue={group.description} /></label>
                  <button className="underline" disabled={busy}>Save details</button>
                </form>
                <form className="flex gap-2" onSubmit={event => {
                  event.preventDefault();
                  void act("invite", { username: new FormData(event.currentTarget).get("username") });
                }}>
                  <input name="username" aria-label="Pi username" placeholder="Pi username" required maxLength={33}
                    className="min-w-0 flex-1 rounded border bg-background p-2" />
                  <button className="underline" disabled={busy}>Invite</button>
                </form>
                <ul className="space-y-2">{group.invitations.map(person => (
                  <li key={person}>@{person} <button type="button" className="underline" disabled={busy}
                    onClick={() => void act("revoke-invite", { username: person })}>Revoke invitation</button></li>
                ))}</ul>
              </>
            )}
            {group.canLeave && <button type="button" className="text-destructive underline" disabled={busy}
              onClick={() => void act("leave")}>Leave group</button>}
          </>
        )}
      </div>
    </Sheet>
  );
}

export function GroupInvitations() {
  const { sessionToken } = usePiAuth();
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
      if (!scope.signal.aborted) setError(failure instanceof Error ? failure.message : "Invitation update failed");
    } finally {
      if (!scope.signal.aborted) setBusy(false);
    }
  }
  return (
    <>
      {error && <p className="px-3 py-2 text-sm" role="alert">{error}</p>}
      {invitations.length > 0 && <ul aria-label="Group invitations" className="space-y-2 px-3 py-2">
        {invitations.map(invite => <li key={invite.id} className="space-x-2">
          <span>{invite.name} · @{invite.owner}</span>
          <button type="button" className="underline" disabled={busy} onClick={() => void respond(invite.id, true)}>Accept</button>
          <button type="button" className="underline" disabled={busy} onClick={() => void respond(invite.id, false)}>Decline</button>
        </li>)}
      </ul>}
    </>
  );
}
