import { AccountChatError, createAccountGroupSocket, requestAccountGroup, uploadGroupMedia, type GroupMediaKind, type GroupMessageRecord } from "@/lib/api-client";

type Person = { id: string; username: string | null; state: string };
export type AccountGroup = {
  id: string; name: string; state: "active" | "archived"; canWrite: boolean; canManageMembers: boolean;
  ownerId: string; members: Person[]; pendingInvitations?: Person[];
  canOfferOwnership?: boolean;
  ownershipOffer?: { id: string; fromUsername: string | null; toUsername: string | null; canRespond: boolean } | null;
};
export type AccountGroupMessage = Omit<GroupMessageRecord, "senderUsername"> & { senderUsername: string | null };
export type GroupInvitation = { groupId: string; name: string };
export type AccountGroupHistory = { group: AccountGroup; messages: AccountGroupMessage[]; nextCursor: string | null };
export type GroupStatus = "connecting" | "connected" | "offline" | "migration" | "unavailable";
const migration = "ACCOUNT_MIGRATION_REQUIRED";
const id24 = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{24}$/.test(value);

function snapshot(data: unknown) {
  const value = data as Record<string, unknown> & { legacyHistory?: { code?: string } };
  if (value?.legacyHistory?.code !== migration) throw new AccountChatError(migration, "Group migration is required.");
  return value;
}
function groupRecord(data: unknown): AccountGroup {
  const group = data as AccountGroup | null;
  if (!group || !id24(group.id) || typeof group.name !== "string" || !["active", "archived"].includes(group.state) ||
      !Array.isArray(group.members) || !group.members.every((person) => typeof person?.id === "string") ||
      (group.pendingInvitations !== undefined && !Array.isArray(group.pendingInvitations))) {
    throw new Error("Invalid group response.");
  }
  const canWrite = group.state === "active" && group.canWrite === true;
  return { ...group, canWrite, canManageMembers: canWrite && group.canManageMembers === true };
}

type Options = {
  sessionToken: string; isCurrent: () => boolean;
  onLists: (groups: AccountGroup[], invitations: GroupInvitation[]) => void;
  onSelection: (id: string | null) => void;
  onHistory: (value: AccountGroupHistory) => void;
  onStatus: (status: GroupStatus) => void;
  onError: (error: string) => void;
};
type Selection = {
  id: string; abort: AbortController; refresh: () => void; history?: AccountGroupHistory;
  older: Map<string, AccountGroupMessage>; cursor?: string | null; loadingOlder?: boolean;
};

export function startAccountGroups({ sessionToken, isCurrent, onLists, onSelection, onHistory, onStatus, onError }: Options) {
  const socket = createAccountGroupSocket(sessionToken);
  const lifetime = new AbortController();
  let listRequest = new AbortController();
  let selected: Selection | null = null;
  let groups: AccountGroup[] = [];
  const revoked = new Set<string>();
  let invitations: GroupInvitation[] = [];
  const active = () => !lifetime.signal.aborted && isCurrent();
  const isSelected = (id: string) => active() && selected?.id === id;
  function close() {
    if (lifetime.signal.aborted) return;
    lifetime.abort();
    listRequest.abort();
    selected?.abort.abort();
    selected = null;
    socket.removeAllListeners();
    socket.disconnect();
  }
  function terminal(code: unknown) {
    if (![migration, "ACCOUNT_DELETING", "ACCOUNT_INACTIVE"].includes(String(code))) return false;
    if (active()) {
      close();
      onLists([], []);
      onSelection(null);
      onStatus(code === migration ? "migration" : "unavailable");
    }
    return true;
  }
  function fail(error: unknown, groupId?: string) {
    if (!active()) return;
    if (error instanceof AccountChatError) {
      if (terminal(error.code)) return;
      if (groupId && error.code === "GROUP_NOT_FOUND") return revoke(groupId);
      if (error.code === "GROUP_ARCHIVED" || error.code === "GROUP_TRANSFER_STALE") refresh();
    }
    onError(error instanceof Error ? error.message : "Group request failed.");
  }
  function task(scope: AbortSignal, perform: () => Promise<void>, groupId?: string) {
    let busy = false;
    let pending = false;
    return () => {
      if (!active() || scope.aborted) return;
      pending = true;
      if (busy) return;
      busy = true;
      void (async () => {
        try {
          while (pending && active() && !scope.aborted) {
            pending = false;
            try { await perform(); }
            catch (error) { if (!scope.aborted) fail(error, groupId); }
          }
        } finally { busy = false; }
      })();
    };
  }

  function makeListRefresh(signal: AbortSignal) {
    return task(signal, async () => {
      const [groupData, inviteData] = (await Promise.all([
        requestAccountGroup(sessionToken, signal),
        requestAccountGroup(sessionToken, signal, "/invitations"),
      ])).map(snapshot);
      if (!active() || signal.aborted) return;
      if (!Array.isArray(groupData.groups) || !Array.isArray(inviteData.invitations) ||
          !inviteData.invitations.every((value) => id24(value?.groupId) && typeof value.name === "string")) {
        throw new Error("Invalid group list.");
      }
      groups = [...new Map(groupData.groups.map((item) => {
        const group = groupRecord(item);
        return [group.id, group] as const;
      })).values()];
      for (const group of groups) revoked.delete(group.id);
      invitations = [...new Map(inviteData.invitations.map((item: GroupInvitation) => [item.groupId, item])).values()];
      if (selected && !groups.some((group) => group.id === selected?.id)) {
        select(null);
        onError("You no longer have access to this group.");
      }
      onLists(groups, invitations);
    });
  }
  let refreshLists = makeListRefresh(listRequest.signal);
  function revoke(groupId: string) {
    if (!active() || revoked.has(groupId)) return;
    revoked.add(groupId);
    listRequest.abort();
    listRequest = new AbortController();
    refreshLists = makeListRefresh(listRequest.signal);
    if (selected?.id === groupId) {
      select(null);
      onError("You no longer have access to this group.");
    }
    groups = groups.filter((group) => group.id !== groupId);
    onLists(groups, invitations);
    refreshLists();
  }

  async function load(scope: Selection, before?: string) {
    const path = "/" + scope.id + "/messages" + (before ? "?before=" + before : "");
    const data = snapshot(await requestAccountGroup(sessionToken, scope.abort.signal, path));
    const group = groupRecord(data.group);
    if (group.id !== scope.id || !Array.isArray(data.messages) ||
        !data.messages.every((message) => id24(message?.id) && message.groupId === scope.id) ||
        (data.nextCursor !== null && !id24(data.nextCursor))) throw new Error("Invalid group history.");
    return { group, messages: data.messages as AccountGroupMessage[], nextCursor: data.nextCursor };
  }
  function show(scope: Selection) {
    if (!scope.history || !isSelected(scope.id) || scope.abort.signal.aborted) return;
    const messages = [...new Map([...scope.older.values(), ...scope.history.messages].map((message) => [message.id, message])).values()];
    onHistory({ ...scope.history, messages, nextCursor: scope.cursor === undefined ? scope.history.nextCursor : scope.cursor });
  }
  function select(id: string | null) {
    if (!active() || selected?.id === id) return;
    selected?.abort.abort();
    selected = null;
    onSelection(id);
    if (!id24(id)) return;
    const scope: Selection = { id, abort: new AbortController(), refresh: () => {}, older: new Map() };
    scope.refresh = task(scope.abort.signal, async () => {
      const result = await load(scope);
      if (!scope.abort.signal.aborted) {
        scope.history = result;
        show(scope);
      }
    }, id);
    selected = scope;
    scope.refresh();
  }
  async function loadOlder() {
    const scope = selected;
    const cursor = scope?.cursor === undefined ? scope?.history?.nextCursor : scope.cursor;
    if (!scope || !cursor || scope.loadingOlder || !active()) return;
    scope.loadingOlder = true;
    try {
      const result = await load(scope, cursor);
      if (!scope.abort.signal.aborted) {
        for (const message of result.messages) scope.older.set(message.id, message);
        scope.older = new Map([...scope.older.entries()].sort(([first], [second]) => first.localeCompare(second)));
        scope.cursor = result.nextCursor;
        show(scope);
      }
    } catch (error) {
      if (!scope.abort.signal.aborted) fail(error, scope.id);
    } finally {
      scope.loadingOlder = false;
    }
  }

  function refresh(groupId?: string) {
    if (!active()) return;
    refreshLists();
    if (!groupId || groupId === selected?.id) selected?.refresh();
  }
  async function action(path: string, method: "POST" | "DELETE", body?: Record<string, unknown>, groupId?: string) {
    const scope = groupId ? selected : null;
    if (!active() || (groupId && scope?.id !== groupId)) return false;
    const signal = scope?.abort.signal ?? lifetime.signal;
    try {
      await requestAccountGroup(sessionToken, signal, path, method, body);
      if (!active() || signal.aborted) return false;
      refresh(groupId);
      return true;
    } catch (error) {
      if (!signal.aborted) fail(error, groupId);
      return false;
    }
  }
  async function send(groupId: string, id: string, text: string, kind: "text" | GroupMediaKind = "text", file?: File) {
    const scope = selected;
    if (!scope || scope.id !== groupId || !scope.history?.group.canWrite || !active()) return false;
    const signal = scope.abort.signal;
    try {
      const media = file && kind !== "text" ? await uploadGroupMedia(sessionToken, groupId, kind, file, signal) : null;
      if (!isSelected(groupId) || signal.aborted) return false;
      return await action("/" + groupId + "/messages", "POST", { id, kind, text, ...(media ? { mediaId: media.mediaId } : {}) }, groupId);
    } catch (error) {
      if (!signal.aborted) {
        fail(error, groupId);
        refresh(groupId);
      }
      return false;
    }
  }

  socket.on("connect", () => { if (active()) { onStatus("connected"); refresh(); } });
  socket.on("disconnect", () => { if (active()) onStatus("offline"); });
  socket.on("connect_error", (error) => {
    const code = (error as Error & { data?: { code?: string } }).data?.code;
    if (active() && !terminal(code)) onStatus("offline");
  });
  socket.on("group:unavailable", (data) => terminal(data?.code));
  socket.on("group:access-revoked", (data) => { if (id24(data?.groupId)) revoke(data.groupId); });
  socket.on("group:updated", (data) => { if (id24(data?.id)) refresh(data.id); });
  socket.on("group:invited", () => refreshLists());
  socket.on("group:message", (data) => { if (id24(data?.message?.groupId) && !revoked.has(data.message.groupId)) refresh(data.message.groupId); });
  socket.on("group:read", (data) => { if (id24(data?.groupId) && !revoked.has(data.groupId)) refresh(data.groupId); });
  socket.connect();
  refreshLists();
  return { close, select, loadOlder, refresh, action, send, signalFor: (id: string) => selected?.id === id ? selected.abort.signal : undefined };
}
