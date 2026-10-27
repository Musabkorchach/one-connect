"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePiAuth } from "@/contexts/pi-auth-context";
import {
  createGroup as createGroupRequest,
  getGroups,
  onGroupEvent,
  type GroupRecord,
} from "@/lib/api-client";

interface GroupContextType {
  groups: GroupRecord[];
  loading: boolean;
  error: string | null;
  createGroup: (name: string, members: string[]) => Promise<GroupRecord>;
}

const GroupContext = createContext<GroupContextType | null>(null);

function validGroup(value: unknown): value is GroupRecord {
  if (!value || typeof value !== "object") return false;
  const group = value as GroupRecord;

  return (
    typeof group.id === "string" &&
    /^[a-f0-9]{24}$/.test(group.id) &&
    typeof group.name === "string" &&
    group.name.length > 0 &&
    group.name.length <= 80 &&
    typeof group.ownerUsername === "string" &&
    Array.isArray(group.members) &&
    group.members.length >= 3 &&
    group.members.length <= 50 &&
    group.members.every(
      (member) =>
        typeof member === "string" &&
        /^[a-z0-9._-]{1,32}$/.test(member),
    ) &&
    group.members.includes(group.ownerUsername) &&
    Number.isFinite(group.createdAt) &&
    Number.isFinite(group.updatedAt) &&
    Number.isSafeInteger(group.unreadCount) &&
    group.unreadCount >= 0
  );
}

function mergeGroups(
  current: GroupRecord[],
  incoming: GroupRecord[],
): GroupRecord[] {
  const merged = new Map(current.map((group) => [group.id, group]));

  for (const group of incoming) {
    const previous = merged.get(group.id);

    if (!previous || group.updatedAt >= previous.updatedAt) {
      merged.set(group.id, group);
    }
  }

  return [...merged.values()].sort(
    (a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id),
  );
}

export function GroupProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, sessionToken, piUsername } = usePiAuth();
  const token = isAuthenticated ? sessionToken : null;
  const me = (piUsername || "").replace(/^@+/, "").toLowerCase();

  const activeTokenRef = useRef(token);
  activeTokenRef.current = token;

  const [state, setState] = useState<{
    token: string | null;
    groups: GroupRecord[];
    loading: boolean;
    error: string | null;
  }>({
    token: null,
    groups: [],
    loading: false,
    error: null,
  });

  useEffect(() => {
    if (!token || !me) return;

    const controller = new AbortController();
    let disposed = false;
    let refreshVersion = 0;

    const active = () =>
      !disposed && activeTokenRef.current === token;

    setState({
      token,
      groups: [],
      loading: true,
      error: null,
    });

    const refresh = async () => {
    const version = ++refreshVersion;

      try {
        const result = await getGroups(token, controller.signal);
        if (!active() || version !== refreshVersion) return;

        if (!Array.isArray(result.groups)) {
          throw new Error("Invalid groups response");
        }

        const incoming = result.groups.filter(
          (group) => validGroup(group) && group.members.includes(me),
        );

        setState((previous) => ({
          token,
          groups: mergeGroups(
            previous.token === token ? previous.groups : [],
            incoming,
          ),
          loading: false,
          error: null,
        }));
      } catch (error) {
        if (
          !active() ||
          controller.signal.aborted ||
          version !== refreshVersion
        ) return;

        setState((previous) => ({
          token,
          groups: previous.token === token ? previous.groups : [],
          loading: false,
          error: error instanceof Error
            ? error.message
            : "Groups could not be loaded",
        }));
      }
    };

    const unsubscribeRead = onGroupEvent("group:read", (receipt) => {
      if (!active() || receipt?.username !== me) return;
      void refresh();
    });
    const unsubscribeUpdated = onGroupEvent("group:updated", (group) => {
      if (!active() || !validGroup(group) || !group.members.includes(me)) {
        return;
      }

      setState((previous) => ({
        token,
        groups: mergeGroups(
          previous.token === token ? previous.groups : [],
          [group],
        ),
        loading: previous.token === token ? previous.loading : false,
        error: previous.token === token ? previous.error : null,
      }));
    });

    const unsubscribeMessage = onGroupEvent("group:message", (event) => {
      if (!active() || !event?.message) return;

      const message = event.message;
      if (
        typeof message.groupId !== "string" ||
        !Number.isFinite(message.at)
      ) return;

      setState((previous) => {
        if (previous.token !== token) return previous;

        return {
          ...previous,
          groups: mergeGroups(
            previous.groups,
            previous.groups
              .filter((group) => group.id === message.groupId)
              .map((group) => ({
                ...group,
                updatedAt: Math.max(group.updatedAt, message.at),
              })),
          ),
        };
      });

      void refresh();
    });

    const unsubscribeConnect = onGroupEvent("connect", () => {
      void refresh();
    });

    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };

    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", onVisible);
    void refresh();

    return () => {
      disposed = true;
      controller.abort();
      unsubscribeUpdated();
      unsubscribeMessage();
      unsubscribeRead();
      unsubscribeConnect();
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [token, me]);

  const createGroup = async (name: string, members: string[]) => {
    if (!token || !me) throw new Error("Authentication required");

    const result = await createGroupRequest(token, name, members);

    if (activeTokenRef.current !== token) {
      throw new Error("Session changed");
    }

    if (!validGroup(result.group) || !result.group.members.includes(me)) {
      throw new Error("Invalid group response");
    }

    setState((previous) => ({
      token,
      groups: mergeGroups(
        previous.token === token ? previous.groups : [],
        [result.group],
      ),
      loading: false,
      error: null,
    }));

    return result.group;
  };

  const current = state.token === token && Boolean(token);

  return (
    <GroupContext.Provider
      value={{
        groups: current ? state.groups : [],
        loading: current ? state.loading : Boolean(token),
        error: current ? state.error : null,
        createGroup,
      }}
    >
      {children}
    </GroupContext.Provider>
  );
}

export function useGroups() {
  const context = useContext(GroupContext);
  if (!context) throw new Error("useGroups must be used within GroupProvider");
  return context;
}