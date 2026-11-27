"use client";

import { useEffect, useRef, useState } from "react";
import { usePiAuth } from "@/contexts/pi-auth-context";
import { startAccountGroups, type AccountGroup, type AccountGroupHistory, type GroupInvitation, type GroupStatus } from "@/lib/account-groups";
import { requestAccountGroup, type GroupMediaKind } from "@/lib/api-client";
import { useConnect } from "@/contexts/connect-context";
import { CreateGroupSheet } from "./create-group-sheet";
import { GroupAvatar } from "./group-avatar";
import { Header, IconButton } from "./ui";
import { IconBack } from "./icons";
import { GroupMediaContent } from "./group-media";
import { Sheet } from "./feedback";
import { VoiceRecorder } from "./voice-recorder";

type Groups = ReturnType<typeof startAccountGroups>;
const migration = "ACCOUNT_MIGRATION_REQUIRED — Older groups require account migration.";
const statusText: Record<GroupStatus, string> = {
  connecting: "Connecting to groups…", connected: "", offline: "Live group updates are offline.",
  migration, unavailable: "Groups are unavailable because this account is no longer active.",
};

export function AccountGroupsView({ sessionToken, embedded = false, query = "" }: { sessionToken: string; embedded?: boolean; query?: string }) {
  const { isCurrentSession, endLocalSession } = usePiAuth();
  const [status, setStatus] = useState<GroupStatus>("connecting");
  const [groups, setGroups] = useState<AccountGroup[] | null>(null);
  const [invitations, setInvitations] = useState<GroupInvitation[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [history, setHistory] = useState<AccountGroupHistory | null>(null);
  const [notice, setNotice] = useState("");
  const connection = useRef<Groups | null>(null);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [pendingAction, setPendingAction] = useState(false);
  const pending = useRef(false);

  useEffect(() => {
    const groups = startAccountGroups({
      sessionToken, isCurrent: () => isCurrentSession(sessionToken),
      onLists: (next, invites) => { setGroups(next); setInvitations(invites); },
      onSelection: (id) => { setSelected(id); setHistory(null); setNotice(""); },
      onHistory: setHistory, onStatus: setStatus, onError: setNotice,
    });
    connection.current = groups;
    const visible = () => { if (document.visibilityState === "visible") groups.refresh(); };
    document.addEventListener("visibilitychange", visible);
    return () => {
      document.removeEventListener("visibilitychange", visible);
      groups.close();
      connection.current = null;
    };
  }, [sessionToken, isCurrentSession]);

  async function act(path: string, body?: Record<string, unknown>) {
    const groups = connection.current;
    if (!groups || pending.current) return false;
    pending.current = true;
    setPendingAction(true);
    setNotice("");
    try { return await groups.action(path, "POST", body); }
    finally {
      pending.current = false;
      if (groups === connection.current) setPendingAction(false);
    }
  }
  const terminal = status === "migration" || status === "unavailable";
  const open = history?.group.id === selected ? history : null;
  const listed = groups?.find((group) => group.id === selected);
  const shown = open && listed && !listed.canWrite ? { ...open, group: listed } : open;

  if (embedded) {
    return <AccountGroupsPanel sessionToken={sessionToken} groups={groups} invitations={invitations} query={query}
      shown={shown} selected={selected} connection={connection.current} loading={status === "connecting"}
      notice={notice || (status !== "connected" && status !== "connecting" ? statusText[status] : "")}
      creating={creating} setCreating={setCreating} pendingAction={pendingAction} act={act} />;
  }

  return (
    <main className="mx-auto max-w-md space-y-3 p-4">
      <header className="flex justify-between">
        <h1 className="text-xl font-semibold">Groups</h1>
        <button type="button" className="underline" onClick={() => endLocalSession("en")}>Sign out</button>
      </header>
      {statusText[status] && <p role="status">{statusText[status]}</p>}
      {process.env.NEXT_PUBLIC_ONECONNECT_DEPLOYMENT === "production-review" && (
        <p className="text-sm text-muted-foreground">Group calls are unavailable. Start voice and video calls in a private chat.</p>
      )}
      {!terminal && process.env.NEXT_PUBLIC_ONECONNECT_DEPLOYMENT !== "production-review" && (
        <p className="text-sm text-muted-foreground">{migration}</p>
      )}
      {!terminal && notice && <p role="alert">{notice}</p>}
      {!terminal && selected === null && (
        <>
          <form className="flex gap-2" onSubmit={(event) => {
            event.preventDefault();
            if (name.trim()) void act("", { name: name.trim() }).then((ok) => { if (ok) setName(""); });
          }}>
            <input className="min-w-0 flex-1 rounded border bg-background p-2" aria-label="Group name"
              maxLength={80} value={name} onChange={(event) => setName(event.target.value)} />
            <button className="underline" type="submit" disabled={!name.trim() || pendingAction}>Create group</button>
          </form>
          {invitations.length > 0 && <section>
            <h2 className="font-semibold">Invitations</h2>
            <ul className="space-y-2">{invitations.map((invite) => (
              <li key={invite.groupId} className="space-x-2 rounded bg-card p-3">
                <span>{invite.name}</span>
                <button type="button" disabled={pendingAction} className="underline"
                  onClick={() => void act("/" + invite.groupId + "/invitations/accept")}>Accept</button>
                <button type="button" disabled={pendingAction} className="underline"
                  onClick={() => void act("/" + invite.groupId + "/invitations/decline")}>Decline</button>
              </li>
            ))}</ul>
          </section>}
          {groups === null ? <p>Loading groups…</p> : (
            <ul className="space-y-2">{groups.map((group) => (
              <li key={group.id}>
                <button type="button" className="w-full rounded bg-card p-3 text-start"
                  onClick={() => connection.current?.select(group.id)}>
                  {group.name} {group.state === "archived" && <span className="text-sm text-muted-foreground">Archived</span>}
                </button>
              </li>
            ))}</ul>
          )}
        </>
      )}
      {!terminal && selected !== null && (
        <>
          <button type="button" className="underline" onClick={() => connection.current?.select(null)}>Back to groups</button>
          {shown && connection.current ? (
            <ScopedGroupConversation key={selected} history={shown} connection={connection.current} />
          ) : !notice && <p>Loading messages…</p>}
        </>
      )}
    </main>
  );
}

function AccountGroupsPanel({ sessionToken, groups, invitations, query, shown, selected, connection, loading, notice,
  creating, setCreating, pendingAction, act }: {
  sessionToken: string; groups: AccountGroup[] | null; invitations: GroupInvitation[]; query: string;
  shown: AccountGroupHistory | null; selected: string | null; connection: Groups | null; loading: boolean; notice: string;
  creating: boolean; setCreating: (creating: boolean) => void; pendingAction: boolean;
  act: (path: string) => Promise<boolean>;
}) {
  const { lang, t } = useConnect();
  const arabic = lang === "ar";
  const loadingText = arabic ? "جارٍ تحميل المجموعات…" : "Loading groups…";
  const search = query.trim().toLowerCase();
  const visibleGroups = groups?.filter((group) => !search || group.name.toLowerCase().includes(search) ||
    group.members.some((member) => member.username?.includes(search)));
  return <section className="px-2 pt-3">
    <div className="flex items-center justify-between gap-3 px-3 pb-2">
      <h2 className="text-sm font-bold text-muted-foreground">{arabic ? "المجموعات" : "Groups"}</h2>
      <button type="button" onClick={() => setCreating(true)}
        className="pc-press rounded-full bg-primary/15 px-4 py-2 text-sm font-semibold text-primary">
        {arabic ? "+ إنشاء مجموعة" : "+ Create group"}
      </button>
    </div>
    {loading && <p className="px-3 text-sm text-muted-foreground">{loadingText}</p>}
    {notice && <p role="alert" className="px-3 text-sm text-destructive">{notice}</p>}
    {invitations.map((invite) => <div key={invite.groupId} className="flex items-center gap-3 rounded-xl bg-card px-3 py-2">
      <span className="flex-1">{invite.name}</span>
      <button type="button" disabled={pendingAction} onClick={() => void act("/" + invite.groupId + "/invitations/accept")}>{t.accept}</button>
      <button type="button" disabled={pendingAction} onClick={() => void act("/" + invite.groupId + "/invitations/decline")}>{t.decline}</button>
    </div>)}
    <ul>{visibleGroups?.map((group) => <li key={group.id}>
      <button type="button" onClick={() => connection?.select(group.id)}
        className="pc-press flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-start hover:bg-card/50">
        <GroupAvatar name={group.name} groupId={group.id} size={52} />
        <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{group.name}</span>
          <span className="block text-xs text-muted-foreground">{group.members.length} {arabic ? "أعضاء" : "members"}</span></span>
      </button>
    </li>)}</ul>
    {creating && connection && <CreateGroupSheet onClose={() => setCreating(false)} onCreated={(id) => {
      setCreating(false); connection.refresh(); connection.select(id);
    }} create={async (name, members) => {
      const result = await requestAccountGroup(sessionToken, connection.signal, "", "POST", { name, members });
      const group = (result as { group?: { id?: string } }).group;
      if (!group?.id || !/^[a-f0-9]{24}$/.test(group.id)) throw new Error("Invalid group response.");
      return { id: group.id };
    }} />}
    {selected && <div className="fixed inset-0 z-40 flex flex-col overflow-y-auto bg-background">
      <Header title={shown?.group.name ?? ""} left={<IconButton onClick={() => connection?.select(null)} aria-label={t.back}>
        <IconBack className="h-5 w-5 rtl:rotate-180" /></IconButton>} />
      <div className="space-y-3 px-3 py-4">
        {shown && connection ? <ScopedGroupConversation key={selected} history={shown} connection={connection} /> :
          <p role="status">{notice || loadingText}</p>}
      </div>
    </div>}
  </section>;
}

export function ScopedGroupConversation({ history, connection }: { history: AccountGroupHistory; connection: Groups }) {
  const { group, messages, nextCursor } = history;
  const [invitee, setInvitee] = useState("");
  const [managing, setManaging] = useState(false);
  const changing = useRef(false);
  const canWrite = group.state === "active" && group.canWrite;
  const canManage = canWrite && group.canManageMembers;
  const canOfferOwnership = canManage && group.canOfferOwnership === true;
  const offer = canWrite ? group.ownershipOffer : null;
  const base = "/" + group.id;

  async function manage(suffix: string, method: "POST" | "DELETE", body?: Record<string, unknown>) {
    if ((!canManage && !offer?.canRespond) || changing.current) return false;
    changing.current = true;
    setManaging(true);
    try { return await connection.action(base + suffix, method, body, group.id); }
    finally { changing.current = false; setManaging(false); }
  }

  return (
    <section aria-label={group.name} className="space-y-3">
      <h2 className="text-lg font-semibold">{group.name}</h2>
      {!canWrite && <p role="status">{group.state === "archived" ? "Archived group · Read only" : "Read only"}</p>}
      {offer && <section className="space-y-2 rounded bg-card p-3" aria-label="Ownership offer">
        <p>{offer.canRespond ? (offer.fromUsername ?? "The owner") + " offered you ownership."
          : "Ownership offered to " + (offer.toUsername ?? "a member") + "."}</p>
        {offer.canRespond && <div className="flex gap-3">
          <button type="button" className="underline" disabled={managing}
            onClick={() => void manage("/ownership-offers/" + encodeURIComponent(offer.id) + "/accept", "POST")}>Accept ownership</button>
          <button type="button" className="underline" disabled={managing}
            onClick={() => void manage("/ownership-offers/" + encodeURIComponent(offer.id) + "/decline", "POST")}>Decline ownership</button>
        </div>}
      </section>}
      {canManage && <section className="space-y-2" aria-label="Manage members">
        <form className="flex gap-2" onSubmit={(event) => {
          event.preventDefault();
          if (invitee.trim()) void manage("/invitations", "POST", { username: invitee.trim() }).then((ok) => { if (ok) setInvitee(""); });
        }}>
          <input className="min-w-0 flex-1 rounded border bg-background p-2" aria-label="Invite by Pi username"
            value={invitee} maxLength={33} onChange={(event) => setInvitee(event.target.value)} />
          <button className="underline" type="submit" disabled={managing || !invitee.trim()}>Invite</button>
        </form>
        <ul>{group.members.filter((member) => member.id !== group.ownerId).map((member) => (
          <li key={member.id} className="flex justify-between">
            <span>{member.username ?? "Deleted account"}</span>
            <button type="button" disabled={managing} className="underline"
              onClick={() => void manage("/members/" + encodeURIComponent(member.id), "DELETE")}>Remove member</button>
            {canOfferOwnership && member.state === "active" && <button type="button" disabled={managing} className="underline"
              onClick={() => void manage("/ownership-offers", "POST", { memberId: member.id })}>Offer ownership</button>}
          </li>
        ))}</ul>
        <ul>{group.pendingInvitations?.map((invite) => (
          <li key={invite.id} className="flex justify-between">
            <span>{invite.username ?? "Deleted account"}</span>
            <button type="button" disabled={managing} className="underline"
              onClick={() => void manage("/invitations/" + encodeURIComponent(invite.id), "DELETE")}>Revoke invitation</button>
          </li>
        ))}</ul>
      </section>}
      {nextCursor && <button type="button" className="underline" onClick={() => void connection.loadOlder()}>Load older messages</button>}
      <ul className="space-y-2">{messages.map((message) => (
        <li key={message.id} className="space-y-1 rounded bg-card p-3">
          <span className="text-sm font-semibold">{message.senderUsername ?? "حساب محذوف"}</span>
          {message.text && <p className="whitespace-pre-wrap break-words">{message.text}</p>}
          <GroupMediaContent message={message} accessSignal={connection.signalFor(group.id)} />
        </li>
      ))}</ul>
      {canWrite && <GroupComposer groupId={group.id} connection={connection} />}
    </section>
  );
}

function GroupComposer({ groupId, connection }: { groupId: string; connection: Groups }) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [voice, setVoice] = useState(false);
  const busy = useRef(false);
  const retry = useRef<{ id: string; text: string } | null>(null);
  async function send(kind: "text" | GroupMediaKind, content: string, file?: File) {
    if (busy.current) return false;
    busy.current = true;
    setSending(true);
    const id = kind === "text" && retry.current?.text === content ? retry.current.id : crypto.randomUUID();
    if (kind === "text") retry.current = { id, text: content };
    try {
      const sent = await connection.send(groupId, id, content, kind, file);
      if (sent && kind === "text") { retry.current = null; setText(""); }
      return sent;
    } finally { busy.current = false; setSending(false); }
  }
  return (
    <div className="space-y-2">
      <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); if (text.trim()) void send("text", text.trim()); }}>
        <textarea aria-label="Group message" className="min-w-0 flex-1 rounded border bg-background p-2"
          value={text} maxLength={2000} disabled={sending} onChange={(event) => setText(event.target.value)} />
        <button type="submit" className="underline" disabled={!text.trim() || sending}>Send</button>
      </form>
      <div className="flex gap-3 text-sm">
        {([["image", "Image", "image/*"], ["file", "File", undefined], ["video", "Video", "video/*"]] as const)
          .map(([kind, label, accept]) => <label key={kind} className="underline">
            {label}
            <input className="sr-only" aria-label={label} type="file" accept={accept} disabled={sending}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void send(kind, "", file);
              }} />
          </label>)}
        <button type="button" className="underline" disabled={sending} onClick={() => setVoice(true)}>Voice message</button>
      </div>
      <Sheet open={voice} title="Voice message" onClose={() => { if (!sending) setVoice(false); }}>
        <VoiceRecorder disabled={sending} onSend={async (file) => {
          const sent = await send("voice", "", file);
          if (sent) setVoice(false);
          return sent;
        }} />
      </Sheet>
    </div>
  );
}
