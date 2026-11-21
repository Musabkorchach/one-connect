import { requestPrivateData } from "@/lib/api-client";
import { sanitizeProfile, type Profile } from "@/lib/connect/data";

export type PrivateContact = { id: string; name: string; username: string | null; state: "active" | "deleting" | "deleted" };

export function startPrivateDataSession({
  sessionToken, isCurrent, onProfile, onContacts, onError,
}: {
  sessionToken: string; isCurrent: () => boolean;
  onProfile: (value: Profile) => void; onContacts: (value: PrivateContact[]) => void;
  onError: (message: string) => void;
}) {
  const abort = new AbortController();
  const current = () => !abort.signal.aborted && isCurrent();
  async function run(action: () => Promise<void>) {
    if (!current()) return false;
    try {
      await action();
      return current();
    } catch (error) {
      if (current()) onError(error instanceof Error ? error.message : "Private data request failed.");
      return false;
    }
  }
  async function loadContacts() {
    const response = await requestPrivateData(sessionToken, abort.signal, "/contacts");
    const contacts = response.contacts;
    if (!Array.isArray(contacts) || !contacts.every((item) => typeof item?.id === "string" &&
        typeof item.name === "string" && ["active", "deleting", "deleted"].includes(item.state))) {
      throw new Error("Invalid account contacts.");
    }
    if (current()) onContacts(contacts);
  }
  void run(async () => {
    await Promise.all([
      requestPrivateData(sessionToken, abort.signal, "/profile").then((value) => {
        if (current()) onProfile(sanitizeProfile(value.profile));
      }),
      loadContacts(),
    ]);
  });
  return {
    current,
    close: () => abort.abort(),
    saveProfile: (changes: Pick<Profile, "displayName" | "avatar" | "language" | "status" | "statusText">) => run(async () => {
      const saved = await requestPrivateData(sessionToken, abort.signal, "/profile", "PUT", { ...changes });
      if (current()) onProfile(sanitizeProfile(saved.profile));
    }),
    addContact: (username: string, name: string) => run(async () => {
      await requestPrivateData(sessionToken, abort.signal, "/contacts", "POST", { username, name });
      if (current()) await loadContacts();
    }),
  };
}
