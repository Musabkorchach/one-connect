import { AccountMailboxError, createAccountEmailSocket, getAccountMailbox } from "@/lib/api-client";
import { parseInternalEmail, type Email } from "@/lib/connect/data";

export type MailboxStatus = "connecting" | "connected" | "offline" | "deleting" | "inactive" | "migration";

type MailboxOptions = {
  sessionToken: string;
  username: string;
  isCurrent: () => boolean;
  onEmails: (emails: Email[]) => void;
  onStatus: (status: MailboxStatus) => void;
  onLoadError: () => void;
};

export function startAccountMailbox({ sessionToken, username, isCurrent, onEmails, onStatus, onLoadError }: MailboxOptions) {
  const socket = createAccountEmailSocket(sessionToken);
  const abort = new AbortController();
  let refreshing = false;
  let refreshPending = false;
  const current = () => !abort.signal.aborted && isCurrent();

  function close() {
    if (abort.signal.aborted) return;
    abort.abort();
    socket.removeAllListeners();
    socket.disconnect();
  }

  function terminal(code: unknown) {
    const status = code === "ACCOUNT_DELETING" ? "deleting"
      : code === "ACCOUNT_INACTIVE" ? "inactive"
        : code === "ACCOUNT_MIGRATION_REQUIRED" ? "migration" : null;
    if (!status) return false;
    if (current()) {
      close();
      onEmails([]);
      onStatus(status);
    }
    return true;
  }

  function refresh() {
    if (!current()) return;
    refreshPending = true;
    if (refreshing) return;
    refreshing = true;
    void reload();
  }

  async function reload() {
    try {
      while (current() && refreshPending) {
        refreshPending = false;
        try {
          const records = await getAccountMailbox(sessionToken, abort.signal);
          if (!current()) return;
          const next = new Map<string, Email>();
          for (const record of records) {
            const email = parseInternalEmail(record, username, "account");
            if (!email) throw new Error("Invalid account email");
            next.set(email.id, email);
          }
          if (!refreshPending) {
            onEmails([...next.values()]);
          }
        } catch (error) {
          if (!current()) return;
          if (error instanceof AccountMailboxError && terminal(error.code)) return;
          onLoadError();
        }
      }
    } finally {
      refreshing = false;
    }
  }

  socket.on("connect", () => {
    if (!current()) return;
    onStatus("connected");
    refresh();
  });
  socket.on("connect_error", (error) => {
    if (!current()) return;
    const details = (error as Error & { data?: { code?: unknown } }).data;
    if (!terminal(details?.code)) onStatus("offline");
  });
  socket.on("disconnect", () => {
    if (current()) onStatus("offline");
  });
  socket.on("email:unavailable", (data) => terminal(data?.code));
  for (const event of ["email:new", "email:read", "email:deleted"]) {
    socket.on(event, refresh);
  }
  socket.connect();
  if (!refreshing) refresh();
  return { close, refresh, canUseMailbox: current };
}
