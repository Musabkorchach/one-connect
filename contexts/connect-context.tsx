"use client";

import React, {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePiAuth } from "@/contexts/pi-auth-context";
import { getDict, type Dict } from "@/lib/connect/i18n";
import { PI_NETWORK_CONFIG } from "@/lib/system-config";
import { startPrivateChat, type PrivateConversation } from "@/lib/account-private-chat";
import { startAccountMailbox } from "@/lib/account-mailbox";
import { normalizeCallName } from "@/lib/connect/call-identity";
import {
  emitMessage,
  joinConversation,
  onConversationMessages,
  getSocket,
  onNewMessage,
  onMessageSaved,
  onMessageError,
  onMessageStatus,
  acknowledgeMessages,
  addContact as saveContactToServer,
  getUserContacts,
  getAppState,
  saveAppState,
  disconnectSocket,
  getInternalEmails,
  onEmailEvent,
  sendInternalEmail,
  sendExternalEmail,
  markInternalEmailRead,
  deleteInternalEmail,
  uploadEmailAttachment,
  deleteChatMessage,
  onMessageDeleted,
  requestPrivateData,
} from "@/lib/api-client";
import {
  KEYS,
  CAPS,
  RTL_LANGS,
  uid,
  hueFromString,
  normalizeUsername,
  cleanStr,
  defaultProfile,
  seedContacts,
  seedRequests,
  seedChats,
  seedCalls,
  seedEmails,
  canonicalPiUsername,
  sanitizeProfile,
  profileToBlob,
  sanitizeContacts,
  contactsToBlob,
  sanitizeRequests,
  requestsToBlob,
  sanitizeChats,
  chatsToBlob,
  sanitizeCalls,
  callsToBlob,
  sanitizeEmails,
  emailsToBlob,
  validateEmailRecipient,
  MAX_ATTACHMENT_SIZE,
  parseInternalEmail,
  type Profile,
  type Contact,
  type ContactRequest,
  type Conversation,
  type Message,
  type MsgKind,
  type CallLog,
  type CallKind,
  type CallDir,
  type Email,
  type EmailFolder,
  type LangId,
  type Toast,
} from "@/lib/connect/data";

// ---- Fallback in-memory store (App Studio preview: sdk is null) ----

interface StateApi {
  get: (key: string) => Promise<{ blob: Record<string, unknown> } | null>;
  set: (key: string, blob: Record<string, unknown>) => Promise<void>;
}

interface ConnectContextType {
  ready: boolean;
  storageNotice: boolean;
  toasts: Toast[];
  pushToast: (message: string, tone?: Toast["tone"]) => void;
  dismissToast: (id: string) => void;
  // profile / lang
  profile: Profile;
  lang: LangId;
  t: Dict;
  dir: "ltr" | "rtl";
  finishSetup: (displayName: string, avatar: string | null, piUsername?: string) => void;
  updateProfile: (patch: Partial<Pick<Profile, "displayName" | "avatar" | "status" | "statusText">>) => void;
  setLanguage: (lang: LangId) => void;
  logout: () => void;
  // contacts
  contacts: Contact[];
  requests: ContactRequest[];
  isContact: (username: string) => boolean;
  addContact: (username: string, name?: string) => "added" | "exists" | "self" | "invalid";
  acceptRequest: (id: string) => void;
  declineRequest: (id: string) => void;
  // chats
  chats: Conversation[];
  getChat: (username: string) => Conversation | undefined;
  ensureChat: (c: Contact | ContactRequest) => void;
  openChat: (target: string | null) => void;
  totalUnread: number;
    sendMessage: (
    username: string,
    kind: MsgKind,
    text: string,
    fileName?: string,
    amount?: number,
    imageId?: string,
    attachmentId?: string
  ) => void | Promise<boolean>;
  markChatRead: (username: string, messageIds?: string[]) => void;
  deleteMessage: (username: string, messageId: string) => Promise<boolean>;
  // calls
  calls: CallLog[];
  logCall: (username: string, name: string, color: number, kind: CallKind, dir: CallDir, durationSec: number) => void;
  deleteCall: (id: string) => void;
  clearCallHistory: () => void;
  // emails
  emails: Email[];
  sendEmail: (
    recipient: string,
    subject: string,
    body: string,
    attachmentName?: string,
    attachmentSize?: number,
    requestId?: string,
    attachmentFile?: File,
  ) => Promise<boolean>;
  saveDraft: (recipient: string, subject: string, body: string, attachmentName?: string, attachmentSize?: number) => void;
  markEmailRead: (id: string) => void;
  deleteEmail: (id: string) => Promise<boolean>;
  unreadEmails: number;
}

const ConnectContext = createContext<ConnectContextType | undefined>(undefined);

export function ConnectProvider({ children }: { children: ReactNode }) {
  const { sdk, isAuthenticated, piUsername, sessionToken, endLocalSession, isCurrentSession } = usePiAuth();
  const production = PI_NETWORK_CONFIG.PRODUCTION_REVIEW;

  const [ready, setReady] = useState(false);
  const [chatsLoaded, setChatsLoaded] = useState(false);
  const [storageNotice, setStorageNotice] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const [profile, setProfile] = useState<Profile>(defaultProfile());
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [requests, setRequests] = useState<ContactRequest[]>([]);
  const [chats, setChats] = useState<Conversation[]>([]);
  const [calls, setCalls] = useState<CallLog[]>([]);
  const [emails, setEmails] = useState<Email[]>([]);
  const [emailsLoadedFor, setEmailsLoadedFor] = useState<string | null>(null);

  // authoritative refs
  const profileRef = useRef(profile);
  const contactsRef = useRef(contacts);
  const requestsRef = useRef(requests);
  const chatsRef = useRef(chats);
  const callsRef = useRef(calls);
  const emailsRef = useRef(emails);
  const emailSessionRef = useRef<string | null>(null);
  emailSessionRef.current = isAuthenticated ? sessionToken : null;
  const deletedChatMessagesRef = useRef<{
    token: string | null;
    keys: Set<string>;
  }>({
    token: null,
    keys: new Set<string>(),
  });

  if (deletedChatMessagesRef.current.token !== emailSessionRef.current) {
    deletedChatMessagesRef.current = {
      token: emailSessionRef.current,
      keys: new Set<string>(),
    };
  }

  const emailUploadRef = useRef<{
    token: string;
    recipient: string;
    file: File;
    attachmentId: string;
  } | null>(null);

  if (emailUploadRef.current?.token !== emailSessionRef.current) {
    emailUploadRef.current = null;
  }

  const stateApi = useRef<StateApi | null>(null);
  const accountChat = useRef<ReturnType<typeof startPrivateChat> | null>(null);
  const accountMailbox = useRef<ReturnType<typeof startAccountMailbox> | null>(null);
  const openChat = useCallback((target: string | null) => {
    const connection = accountChat.current;
    if (!connection) return;
    const known = chatsRef.current.find((chat) => chat.id === target || chat.username === target);
    if (!target || (known && /^[a-f0-9]{64}$/.test(known.id))) connection.select(target ? known!.id : null);
    else void connection.start(target);
  }, []);

  // ---- toasts ----
  const pushToast = (message: string, tone: Toast["tone"] = "default") => {
    const id = uid();
    setToasts((prev) => [...prev, { id, message, tone }]);
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 2600);
  };
  const dismissToast = (id: string) => setToasts((prev) => prev.filter((x) => x.id !== id));

  // ---- per-key saver factory ----
  const savers = useRef<Record<string, { timer: ReturnType<typeof setTimeout> | null; delay: number; pending: Record<string, unknown> | null }>>({});

  const saveQueues = useRef<
    Map<
      string,
      {
        api: StateApi;
        tail: Promise<void>;
        latest: Record<string, unknown>;
      }
    >
  >(new Map());

  const writeNow = async (
    key: string,
    blob: Record<string, unknown>,
  ) => {
    const api = stateApi.current;

    if (!api) {
      console.error("[ONE CONNECT STORAGE NOT READY]", { key });
      setStorageNotice(true);
      return;
    }

    let queue = saveQueues.current.get(key);

    if (!queue || queue.api !== api) {
      queue = {
        api,
        tail: Promise.resolve(),
        latest: blob,
      };
      saveQueues.current.set(key, queue);
    }

    queue.latest = blob;
    const activeQueue = queue;

    const task = activeQueue.tail.then(async () => {
      if (
        stateApi.current !== api ||
        activeQueue.latest !== blob
      ) {
        return;
      }

      try {
        await api.set(key, blob);

        if (stateApi.current !== api) return;

        const saver = savers.current[key];
        if (saver) saver.delay = 1300;
      } catch (error) {
        console.error("[ONE CONNECT STORAGE ERROR]", { key, error });

        if (
          stateApi.current !== api ||
          activeQueue.latest !== blob
        ) {
          return;
        }

        setStorageNotice(true);

        const saver = savers.current[key];
        if (!saver) return;

        saver.delay = Math.min(
          30000,
          Math.round(saver.delay * 1.8),
        );

        // Preserve any newer change waiting to be saved.
        if (!saver.pending) saver.pending = blob;
        if (saver.timer) return;

        saver.timer = setTimeout(() => {
          const pending = saver.pending;
          saver.pending = null;
          saver.timer = null;

          if (stateApi.current === api && pending) {
            void writeNow(key, pending);
          }
        }, saver.delay);
      }
    });

    activeQueue.tail = task.catch(() => {});
    await task;
  };

  const scheduleSave = (key: string, blob: Record<string, unknown>, immediate = false) => {
    if (!savers.current[key]) savers.current[key] = { timer: null, delay: 1300, pending: null };
    const s = savers.current[key];
    s.pending = blob;
    if (immediate) {
      if (s.timer) { clearTimeout(s.timer); s.timer = null; }
      const p = s.pending;
      s.pending = null;
      void writeNow(key, p!);
      return;
    }
    if (s.timer) return;
    s.timer = setTimeout(() => {
      const p = s.pending;
      s.pending = null;
      s.timer = null;
      if (p) void writeNow(key, p);
    }, s.delay);
  };

  const flushAll = () => {
    Object.entries(savers.current).forEach(([key, s]) => {
      if (s.pending) {
        const p = s.pending;
        s.pending = null;
        if (s.timer) { clearTimeout(s.timer); s.timer = null; }
        void writeNow(key, p);
      }
    });
  };

  // ---- load ----
  useEffect(() => {
  if (!isAuthenticated) return;
  let cancelled = false;
  setChatsLoaded(false);
  setEmailsLoadedFor(null);

        if (!sessionToken) return;

    const api: StateApi = {
      get: (key) => getAppState(key, sessionToken),
      set: (key, blob) => saveAppState(key, blob, sessionToken),
    };
    stateApi.current = api;

    if (production) {
      const abort = new AbortController();
      const current = () => !abort.signal.aborted && isCurrentSession(sessionToken);
      const owner = normalizeCallName(piUsername || "");
      const placeChat = (entry: PrivateConversation): Conversation => {
        const old = chatsRef.current.find((chat) => chat.id === entry.conversationId);
        return {
          id: entry.conversationId, username: entry.peer.username ?? undefined,
          name: entry.peer.label, color: hueFromString(entry.peer.username ?? entry.conversationId),
          isGroup: false, readOnly: !entry.canSend, messages: old?.messages ?? [],
          preview: entry.last ?? old?.preview,
          updatedAt: entry.latestAt ?? old?.updatedAt ?? 0, unread: entry.unread ?? old?.unread ?? 0,
        };
      };
      const showChats = (next: Conversation[]) => {
        chatsRef.current = next;
        setChats(next);
      };
      let mailboxSnapshot: Email[] = [];
      let draftsLoaded = false;
      const showMailbox = () => {
        emailsRef.current = [...emailsRef.current.filter((email) => email.folder === "drafts"), ...mailboxSnapshot];
        setEmails(emailsRef.current);
        if (draftsLoaded) setEmailsLoadedFor(sessionToken);
      };
      const chat = startPrivateChat({
        sessionToken, isCurrent: current,
        onList: (entries) => showChats(entries.map(placeChat)),
        onSelection: () => {},
        onHistory: (history) => {
          const next = { ...placeChat(history), messages: history.messages,
            unread: history.messages.filter((message) => !message.fromMe && message.status !== "read").length,
            preview: history.messages.at(-1),
            updatedAt: history.messages.at(-1)?.at ?? 0 };
          showChats([next, ...chatsRef.current.filter((item) => item.id !== next.id)]
            .sort((a, b) => b.updatedAt - a.updatedAt));
        },
        onStatus: (status) => { if (status === "deleting" || status === "inactive") endLocalSession(profileRef.current.language); },
        onError: (error) => pushToast(error, "error"),
      });
      accountChat.current = chat;
      const mailbox = startAccountMailbox({
        sessionToken, username: owner, isCurrent: current,
        onEmails: (next) => { mailboxSnapshot = next; showMailbox(); },
        onStatus: (status) => { if (status === "deleting" || status === "inactive") endLocalSession(profileRef.current.language); },
        onLoadError: () => setStorageNotice(true),
      });
      accountMailbox.current = mailbox;
      void Promise.all([
        requestPrivateData(sessionToken, abort.signal, "/profile").then(({ profile: blob }) => {
          if (!current()) return;
          const next = sanitizeProfile(blob);
          if (blob && typeof blob === "object" && !("setupDone" in blob)) next.setupDone = Boolean(next.displayName);
          profileRef.current = { ...next, username: owner, piUsername: owner };
          setProfile(profileRef.current);
          setReady(true);
        }),
        requestPrivateData(sessionToken, abort.signal, "/contacts").then(({ contacts: items }) => {
          if (!current() || !Array.isArray(items)) return;
          contactsRef.current = sanitizeContacts({ items: items.filter((item) => item?.state === "active") });
          setContacts(contactsRef.current);
        }),
        api.get(KEYS.calls).then((record) => {
          if (!current() || !record) return;
          callsRef.current = sanitizeCalls(record.blob);
          setCalls(callsRef.current);
        }),
        api.get(KEYS.emails).then((record) => {
          if (!current()) return;
          const drafts = record ? sanitizeEmails(record.blob).filter((email) => email.folder === "drafts") : [];
          emailsRef.current = drafts;
          draftsLoaded = true;
          showMailbox();
        }),
      ]).catch(() => { if (current()) setStorageNotice(true); });
      return () => {
        abort.abort();
        chat.close();
        mailbox.close();
        accountChat.current = null;
        accountMailbox.current = null;
        if (stateApi.current === api) stateApi.current = null;
      };
    }

    (async () => {
      try {
        const [pRec, cRec, rRec, chRec, clRec, emRec] = await Promise.all([
          api.get(KEYS.profile),
          api.get(KEYS.contacts),
          api.get(KEYS.requests),
          api.get(KEYS.chats),
          api.get(KEYS.calls),
          api.get(KEYS.emails),
        ]);
        if (cancelled) return;

        const loadedProfile = pRec ? sanitizeProfile(pRec.blob) : defaultProfile();
        console.log("[PROFILE LOAD]", {
  hasProfileRecord: !!pRec,
  setupDone: loadedProfile.setupDone,
  displayName: loadedProfile.displayName,
  piUsername: loadedProfile.piUsername,
});
        const canonicalIdentity = canonicalPiUsername(piUsername || loadedProfile.piUsername || loadedProfile.username);
        if (canonicalIdentity) {
          loadedProfile.username = canonicalIdentity;
          loadedProfile.piUsername = canonicalIdentity;
        }
        const fresh = !pRec;

        const localContacts = cRec
  ? sanitizeContacts(cRec.blob)
  : (fresh ? seedContacts() : []);

let loadedContacts = localContacts;

if (sessionToken && piUsername) {
  try {
    const serverContacts = await getUserContacts(
      `pi_${piUsername}`,
      sessionToken
    );

    if (cancelled) return;

    if (Array.isArray(serverContacts)) {
      loadedContacts = sanitizeContacts({
        items: [...localContacts, ...serverContacts],
      });
      // Migrate previously saved contacts without duplicating them.
if (cRec) {
  const existingUsernames = new Set(
    sanitizeContacts({ items: serverContacts }).map(
      (contact) => contact.username
    )
  );

  const missingContacts = localContacts.filter(
    (contact) =>
      !existingUsernames.has(contact.username) &&
      contact.username !== canonicalIdentity
  );

  const results = await Promise.allSettled(
    missingContacts.map((contact) =>
      saveContactToServer(
        `pi_${piUsername}`,
        contact.username,
        contact.name,
        sessionToken
      )
    )
  );

  if (cancelled) return;

  if (results.some((result) => result.status === "rejected")) {
    console.error("[CONTACT MIGRATION ERROR]", results);
    setStorageNotice(true);
  }
}
    }
  } catch (error) {
    console.error("[CONTACT SERVER LOAD ERROR]", error);
  }
}
        const loadedRequests = rRec ? sanitizeRequests(rRec.blob) : (fresh ? seedRequests() : []);
        const loadedChats = chRec ? sanitizeChats(chRec.blob) : (fresh ? seedChats() : []);
        const loadedCalls = clRec ? sanitizeCalls(clRec.blob) : (fresh ? seedCalls() : []);
        const savedEmails = emRec ? sanitizeEmails(emRec.blob) : [];

        let loadedEmails = savedEmails.filter(
        (email) => email.folder === "drafts",
        );

        try {
          const records = await getInternalEmails(sessionToken);
          if (cancelled) return;

          const serverEmails: Email[] = [];

          for (const record of records) {
            const email = parseInternalEmail(record, piUsername || "");

            if (!email) {
              throw new Error("Invalid internal email data.");
            }

            serverEmails.push(email);
          }

          loadedEmails = [...loadedEmails, ...serverEmails]
            .sort((a, b) => b.at - a.at)
            .slice(0, CAPS.emails);
        } catch (error) {
          if (cancelled) return;

          console.error("[EMAIL LOAD ERROR]", error);
          setStorageNotice(true);
          pushToast("Unable to load email. Please try again.", "error");
        }

        setProfile(loadedProfile); profileRef.current = loadedProfile;
        setContacts(loadedContacts); contactsRef.current = loadedContacts;
        setRequests(loadedRequests); requestsRef.current = loadedRequests;
        setChats(loadedChats); chatsRef.current = loadedChats;
        setChatsLoaded(true);
        setCalls(loadedCalls); callsRef.current = loadedCalls;
        setEmails(loadedEmails); emailsRef.current = loadedEmails;
        setEmailsLoadedFor(sessionToken);

        setReady(true);
            } catch (error) {
        console.error("[ONE CONNECT STORAGE LOAD ERROR]", error);
        setStorageNotice(true);
        setReady(true);
      }
    })();

    return () => { cancelled = true; };
  }, [sdk, isAuthenticated, piUsername, sessionToken, production, isCurrentSession]);

  useEffect(() => () => {
    stateApi.current = null;
    for (const saver of Object.values(savers.current)) {
      if (saver.timer) clearTimeout(saver.timer);
    }
    savers.current = {};
    saveQueues.current.clear();
  }, []);

  // flush on hide
  useEffect(() => {
    const onHide = () => flushAll();
    window.addEventListener("pagehide", onHide);
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") flushAll();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  // sync <html> lang/dir with language
  useEffect(() => {
    const dir = RTL_LANGS.includes(profile.language) ? "rtl" : "ltr";
    document.documentElement.setAttribute("lang", profile.language);
    document.documentElement.setAttribute("dir", dir);
  }, [profile.language]);

  // ---- commit helpers ----
  const commitProfile = (next: Profile, immediate = false) => {
    profileRef.current = next;
    setProfile(next);
    scheduleSave(KEYS.profile, profileToBlob(next), immediate);
  };
  const commitContacts = (next: Contact[], immediate = false) => {
    contactsRef.current = next;
    setContacts(next);
    scheduleSave(KEYS.contacts, contactsToBlob(next), immediate);
  };
  const commitRequests = (next: ContactRequest[], immediate = false) => {
    requestsRef.current = next;
    setRequests(next);
    scheduleSave(KEYS.requests, requestsToBlob(next), immediate);
  };
  const commitChats = (next: Conversation[], immediate = false) => {
    chatsRef.current = next;
    setChats(next);
    if (!production) scheduleSave(KEYS.chats, chatsToBlob(next), immediate);
  };
  const commitCalls = (next: CallLog[], immediate = false) => {
    callsRef.current = next;
    setCalls(next);
    scheduleSave(KEYS.calls, callsToBlob(next), immediate);
  };
  const commitEmails = (next: Email[], immediate = false) => {
    emailsRef.current = next;
    setEmails(next);

    const savedEmails = next.filter(
      (email) =>
        email.folder === "drafts" || email.type === "external",
    );

    scheduleSave(
      KEYS.emails,
      emailsToBlob(savedEmails),
      immediate,
    );
  };

    useEffect(() => {
    if (
      !isAuthenticated ||
      !sessionToken ||
      !piUsername ||
      emailsLoadedFor !== sessionToken
    ) {
      return;
    }

    let cancelled = false;
    let revision = 0;

    const refresh = async (): Promise<void> => {
      if (cancelled || !isCurrentSession(sessionToken)) return;
      const requestRevision = ++revision;

      try {
        const records = await getInternalEmails(sessionToken);

        if (cancelled || !isCurrentSession(sessionToken) || requestRevision !== revision) return;

        const serverEmails: Email[] = [];

        for (const record of records) {
          const email = parseInternalEmail(record, piUsername);

          if (!email) {
            throw new Error("Invalid internal email data.");
          }

          serverEmails.push(email);
        }

        const savedEmails = emailsRef.current.filter(
          (email) => email.folder === "drafts",
        );

        const next = [...savedEmails, ...serverEmails]
          .sort((a, b) => b.at - a.at)
          .slice(0, CAPS.emails);

        emailsRef.current = next;
        setEmails(next);
      } catch (error) {
        if (cancelled || !isCurrentSession(sessionToken) || requestRevision !== revision) return;

        console.error("[EMAIL SYNC ERROR]", error);
        setStorageNotice(true);
      }
    };

    const refreshMailbox = (): void => {
      void refresh();
    };

    const unsubscribe = [
      onEmailEvent("connect", refreshMailbox),
      onEmailEvent("email:new", refreshMailbox),
      onEmailEvent("email:read", refreshMailbox),
      onEmailEvent("email:deleted", refreshMailbox),
    ];

    const onVisible = (): void => {
      if (document.visibilityState === "visible") {
        refreshMailbox();
      }
    };

    document.addEventListener("visibilitychange", onVisible);
    refreshMailbox();

    return () => {
      cancelled = true;
      revision++;

      for (const stop of unsubscribe) stop();

      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [isAuthenticated, sessionToken, piUsername, emailsLoadedFor, isCurrentSession]);

  useEffect(() => {
    if (!isAuthenticated || !chatsLoaded || !sessionToken || !piUsername) {
      return;
    }

    const token = sessionToken;
    const me = normalizeUsername(piUsername);

    return onMessageDeleted((data) => {
      if (
        emailSessionRef.current !== token ||
        !data ||
        typeof data.id !== "string" ||
        typeof data.senderUsername !== "string"
      ) {
        return;
      }

      const sender = normalizeUsername(data.senderUsername);
      if (!sender) return;
      deletedChatMessagesRef.current.keys.add(`${sender}:${data.id}`);

      let changed = false;

      const updated = chatsRef.current.map((chat) => {
        if (chat.isGroup || !chat.username) return chat;

        const messages = chat.messages.filter((message) => {
          const messageSender = message.fromMe ? me : chat.username;

          return message.id !== data.id || messageSender !== sender;
        });

        if (messages.length === chat.messages.length) return chat;

        changed = true;

        return {
          ...chat,
          messages,
          unread: messages.filter(
            (message) => !message.fromMe && message.status !== "read",
          ).length,
        };
      });

      if (changed) commitChats(updated, true);
    });
  }, [isAuthenticated, chatsLoaded, sessionToken, piUsername]);
  const receiveConversationHistory = (data: {
    username: string;
    messages: Record<string, unknown>[];
    deletedMessages?: Record<string, unknown>[];
  }) => {
    if (!data || typeof data.username !== "string" ||
        !Array.isArray(data.messages)) return;

    const me = normalizeUsername(piUsername || "");
    const peer = normalizeUsername(data.username);
    if (!me || !peer || peer === me) return;

    const list = [...chatsRef.current];
    const existing = list.find(
      (chat) => !chat.isGroup && chat.username === peer
    );
    const merged = new Map<string, Message>(
      (existing?.messages || []).map((message) => [message.id, message])
    );

    for (const item of data.messages) {
      if (
        !item ||
        typeof item.id !== "string" ||
        typeof item.senderUsername !== "string" ||
        typeof item.recipientUsername !== "string" ||
        typeof item.text !== "string" ||
        typeof item.kind !== "string" ||
        typeof item.at !== "number" ||
        !Number.isFinite(item.at) ||
        !["text", "image", "file", "video", "voice"].includes(item.kind)
      ) continue;

      const sender = normalizeUsername(item.senderUsername);
      const recipient = normalizeUsername(item.recipientUsername);
      const fromMe = sender === me && recipient === peer;
      if (!fromMe && !(sender === peer && recipient === me)) continue;

      const previous = merged.get(item.id);
      merged.set(item.id, {
        id: item.id,
        attachmentId:
          (item.kind === "file" || item.kind === "video" || item.kind === "voice") &&
          typeof item.attachmentId === "string" &&
          /^[a-fA-F0-9]{24}$/.test(item.attachmentId)
            ? item.attachmentId
            : undefined,
        imageId:
          item.kind === "image" &&
          typeof item.imageId === "string" &&
          /^[a-fA-F0-9]{24}$/.test(item.imageId)
            ? item.imageId
            : undefined,
        fromMe,
        kind: item.kind as MsgKind,
        text: cleanStr(item.text, 2000),
        fileName: typeof item.fileName === "string"
          ? cleanStr(item.fileName, 120)
          : undefined,
        at: item.at,
        status:
  item.status === "read" || previous?.status === "read"
    ? "read"
    : item.status === "delivered" || previous?.status === "delivered"
      ? "delivered"
      : fromMe
        ? "sent"
        : "delivered",
      });
    }

    const deletedKeys = new Set<string>(
      deletedChatMessagesRef.current.keys,
    );
    if (Array.isArray(data.deletedMessages)) {
      for (const item of data.deletedMessages) {
        if (
          !item ||
          typeof item.id !== "string" ||
          typeof item.senderUsername !== "string"
        ) continue;

        const sender = normalizeUsername(item.senderUsername);
        if (sender !== me && sender !== peer) continue;

        deletedKeys.add(`${sender}:${item.id}`);
        deletedChatMessagesRef.current.keys.add(`${sender}:${item.id}`);
      }
    }

    const messages = [...merged.values()]
      .filter((message) => {
        const sender = message.fromMe ? me : peer;
        return !deletedKeys.has(`${sender}:${message.id}`);
      })
      .sort((a, b) => a.at - b.at)
      .slice(-CAPS.messages);

    if (!messages.length && !existing) return;

    const contact = contactsRef.current.find((item) => item.username === peer);
    const conversation: Conversation = {
      ...existing,
      id: peer,
      username: peer,
      isGroup: false,
      name: existing?.name || contact?.name || peer,
      color: existing?.color ?? contact?.color ?? hueFromString(peer),
      messages,
      updatedAt:
        messages[messages.length - 1]?.at ??
        existing?.updatedAt ??
        Date.now(),
      unread: messages.filter(
        (message) => !message.fromMe && message.status !== "read",
      ).length,
    };

    const updated = [
      conversation,
      ...list.filter((chat) => chat.isGroup || chat.username !== peer),
    ].sort((a, b) => b.updatedAt - a.updatedAt);

    commitChats(updated, true);
    acknowledgeMessages(
      peer,
      messages.filter((message) => !message.fromMe).map((message) => message.id),
      "delivered",
    );
  };

    useEffect(() => {
    if (!isAuthenticated || !chatsLoaded || !piUsername) return;

    const unsubscribe = onConversationMessages(
      receiveConversationHistory
    );
    const currentSocket = getSocket();

    const requestHistory = () => {
      const me = normalizeUsername(piUsername);
      const peers = new Set<string>();

      for (const contact of contactsRef.current) {
        peers.add(normalizeUsername(contact.username));
      }

      for (const chat of chatsRef.current) {
        if (!chat.isGroup && chat.username) {
          peers.add(normalizeUsername(chat.username));
        }
      }

      for (const peer of peers) {
        if (peer && peer !== me) {
          joinConversation(peer);
        }
      }
    };

    currentSocket?.on("connect", requestHistory);

    if (currentSocket?.connected) {
      requestHistory();
    }

    return () => {
      unsubscribe();
      currentSocket?.off("connect", requestHistory);
    };
  }, [
    isAuthenticated,
    chatsLoaded,
    piUsername,
    sessionToken,
    contacts,
  ]);

useEffect(() => {
  if (!isAuthenticated || !chatsLoaded) return;

  return onMessageStatus(({ id, recipientUsername, status }) => {
    if (
      typeof id !== "string" ||
      typeof recipientUsername !== "string" ||
      (status !== "delivered" && status !== "read")
    ) {
      return;
    }

    const peer = normalizeUsername(recipientUsername);
    let changed = false;

    const updated = chatsRef.current.map((chat) => {
      if (chat.isGroup || chat.username !== peer) return chat;

      const messages = chat.messages.map((message) => {
        if (
          !message.fromMe ||
          message.id !== id ||
          message.status === "read" ||
          message.status === status
        ) {
          return message;
        }

        changed = true;
        return { ...message, status };
      });

      return { ...chat, messages };
    });

    if (changed) commitChats(updated, true);
  });
}, [isAuthenticated, chatsLoaded, piUsername]);

  const receiveMessage = (incoming: Record<string, unknown>) => {
  if (
    typeof incoming.id !== "string" ||
    typeof incoming.senderUsername !== "string" ||
    typeof incoming.recipientUsername !== "string" ||
    typeof incoming.text !== "string" ||
    typeof incoming.kind !== "string" ||
    typeof incoming.at !== "number"
  ) return;

  const me = normalizeUsername(piUsername || "");
  const sender = normalizeUsername(incoming.senderUsername);
  const recipient = normalizeUsername(incoming.recipientUsername);

  if (!me || !sender || recipient !== me || sender === me) return;

  if (
    deletedChatMessagesRef.current.keys.has(`${sender}:${incoming.id}`)
  ) return;

  if (
    !["text", "image", "file", "video", "voice"].includes(incoming.kind)
  ) return;

  acknowledgeMessages(sender, [incoming.id], "delivered");
  const message: Message = {
    id: incoming.id,
    attachmentId:
      (incoming.kind === "file" || incoming.kind === "video" || incoming.kind === "voice") &&
      typeof incoming.attachmentId === "string" &&
      /^[a-fA-F0-9]{24}$/.test(incoming.attachmentId)
        ? incoming.attachmentId
        : undefined,
    imageId:
      incoming.kind === "image" &&
      typeof incoming.imageId === "string" &&
      /^[a-fA-F0-9]{24}$/.test(incoming.imageId)
        ? incoming.imageId
        : undefined,
    fileName:
      typeof incoming.fileName === "string"
        ? cleanStr(incoming.fileName, 120)
        : undefined,
    fromMe: false,
    kind: incoming.kind as MsgKind,
    text: cleanStr(incoming.text, 2000),
    status: "delivered",
    at: incoming.at,
  };

  const list = [...chatsRef.current];
  const index = list.findIndex((chat) => chat.username === sender);

  if (index === -1) {
  const contact = contactsRef.current.find(
    (item) => item.username === sender
  );

  const newChat: Conversation = {
    id: sender,
    username: sender,
    name: contact?.name || sender,
    color: contact?.color ?? hueFromString(sender),
    messages: [message],
    updatedAt: Date.now(),
    isGroup: false,
    unread: 1,
  };

  commitChats([newChat, ...list], true);
  return;
}

  const chat = list[index];

  if (chat.messages.some((item) => item.id === message.id)) return;

  const messages = [...chat.messages, message].slice(-CAPS.messages);

  list[index] = {
    ...chat,
    messages,
    unread: messages.filter(
      (item) => !item.fromMe && item.status !== "read",
    ).length,
    updatedAt: Date.now(),
  };
  commitChats(bumpChat(list, sender), true);
};

  useEffect(() => {
    if (!isAuthenticated || !chatsLoaded) return;

    const unsubscribe = onNewMessage(receiveMessage);

    return () => {
      unsubscribe();
    };
  }, [isAuthenticated, chatsLoaded, piUsername]);
    useEffect(() => {
    if (!isAuthenticated || !chatsLoaded) return;

    const unsubscribe = onMessageSaved(({ id }) => {
      const list = chatsRef.current;
      let changed = false;

      const updated = list.map((chat) => ({
        ...chat,
        messages: chat.messages.map((message) => {
          if (message.id !== id || !message.fromMe || message.status !== "pending") {
            return message;
          }

          changed = true;
          return { ...message, status: "sent" as const };
        }),
      }));

      if (changed) {
        commitChats(updated, true);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [isAuthenticated, chatsLoaded, piUsername]);

    useEffect(() => {
    if (!isAuthenticated || !chatsLoaded) return;

    const unsubscribe = onMessageError(({ id, error }) => {
      if (!id) {
        console.error("[MESSAGE ERROR]", error);
        return;
      }

      let changed = false;

      const updated = chatsRef.current.map((chat) => ({
        ...chat,
        messages: chat.messages.map((message) => {
          if (
            message.id !== id ||
            !message.fromMe ||
            message.status !== "pending"
          ) {
            return message;
          }

          changed = true;
          return { ...message, status: "failed" as const };
        }),
      }));

      if (changed) {
        commitChats(updated, true);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [isAuthenticated, chatsLoaded, piUsername]);

  // ---- profile actions ----
  const finishSetup = (displayName: string, avatar: string | null, providedPiUsername?: string) => {
    const name = cleanStr(displayName, 40) || "Pioneer";
    const identity = production ? normalizeCallName(piUsername || "") :
      canonicalPiUsername(providedPiUsername || piUsername || profileRef.current.piUsername || profileRef.current.username);
    if (!identity) {
      pushToast("Your Pi username is not available yet. Please try again.", "error");
      return;
    }
    commitProfile(
      {
        ...profileRef.current,
        setupDone: true,
        displayName: name,
        username: identity,
        piUsername: identity,
        avatar,
        status: profileRef.current.status || "available",
        statusText: profileRef.current.statusText || "",
      },
      true,
    );
  };
  const updateProfile = (patch: Partial<Pick<Profile, "displayName" | "avatar" | "status" | "statusText">>) => {
    const next: Profile = { ...profileRef.current };
    if (patch.displayName !== undefined) next.displayName = cleanStr(patch.displayName, 40) || next.displayName;
    if (patch.avatar !== undefined) next.avatar = patch.avatar;
    if (patch.status !== undefined) next.status = patch.status;
    if (patch.statusText !== undefined) next.statusText = cleanStr(patch.statusText, 100);
    commitProfile(next, true);
  };
  const setLanguage = (lang: LangId) => {
    commitProfile({ ...profileRef.current, language: lang }, true);
  };
  const logout = () => {
    endLocalSession(profileRef.current.language);
    setProfile(defaultProfile());
    setContacts([]);
    setRequests([]);
    setChats([]);
    setCalls([]);
    setEmails([]);
    setReady(false);
    setChatsLoaded(false);
    Object.values(savers.current).forEach((saver) => {
  if (saver.timer) {
    clearTimeout(saver.timer);
    saver.timer = null;
  }
  saver.pending = null;
});

stateApi.current = null;
  };

  // ---- contacts ----
  const isContact = (username: string) =>
    contactsRef.current.some((c) => c.username === normalizeUsername(username));

  const addContact = (rawUsername: string, name?: string): "added" | "exists" | "self" | "invalid" => {
    const username = normalizeUsername(rawUsername);
    if (!username) return "invalid";
    if (username === profileRef.current.username) return "self";
    if (isContact(username)) return "exists";
    const c: Contact = {
      id: username,
      username,
      name: cleanStr(name || "", 40) || username.replace(/[._-]/g, " ").replace(/\b\w/g, (m) => m.toUpperCase()),
      color: hueFromString(username),
      online: Math.random() > 0.4,
      status: "available",
      statusText: "",
      addedAt: Date.now(),
    };
    if (production && sessionToken) {
      const previous = contactsRef.current;
      contactsRef.current = [c, ...previous];
      setContacts(contactsRef.current);
      const signal = accountChat.current?.signal;
      if (signal) void requestPrivateData(sessionToken, signal, "/contacts", "POST", { username, name: c.name }).catch(() => {
        if (!isCurrentSession(sessionToken) || signal.aborted) return;
        contactsRef.current = contactsRef.current.filter((contact) => contact !== c);
        setContacts(contactsRef.current);
        pushToast(t.addByUsername, "error");
      });
      return "added";
    }
    commitContacts([c, ...contactsRef.current], true);

if (sessionToken && piUsername) {
  void saveContactToServer(
    `pi_${piUsername}`,
    username,
    c.name,
    sessionToken
  ).catch((error) => {
    console.error("[CONTACT SERVER SAVE ERROR]", error);
    setStorageNotice(true);
  });
}

return "added";
  };

  const acceptRequest = (id: string) => {
    const req = requestsRef.current.find((r) => r.id === id);
    if (!req) return;
    commitRequests(requestsRef.current.filter((r) => r.id !== id));
    if (!isContact(req.username)) {
      const c: Contact = {
        id: req.username,
        username: req.username,
        name: req.name,
        color: req.color,
        online: true,
        status: "available",
        statusText: "",
        addedAt: Date.now(),
      };
      commitContacts([c, ...contactsRef.current], true);
    }
  };
  const declineRequest = (id: string) => {
    commitRequests(requestsRef.current.filter((r) => r.id !== id), true);
  };

  // ---- contacts status updates ----
  const updateContactStatus = (username: string, status: Profile["status"], statusText?: string) => {
    const uname = normalizeUsername(username);
    const updated = contactsRef.current.map((c) => 
      c.username === uname 
        ? { ...c, status, statusText: statusText ? cleanStr(statusText, 100) : c.statusText } 
        : c
    );
    if (updated.some((c, i) => c !== contactsRef.current[i])) {
      commitContacts(updated);
    }
  };

  // ---- chats ----
  const getChat = (username: string) =>
    chatsRef.current.find((c) => c.id === username || c.username === normalizeUsername(username));

  const ensureChat = (person: Contact | ContactRequest) => {
    if (production) return;
    const username = person.username;
    if (getChat(username)) return;
    const conv: Conversation = {
      id: username,
      username,
      name: person.name,
      color: person.color,
      messages: [],
      updatedAt: Date.now(),
      isGroup: false,
      unread: 0,
    };
    commitChats([conv, ...chatsRef.current]);
  };

  const bumpChat = (list: Conversation[], username: string) => {
    const idx = list.findIndex((c) => c.username === username);
    if (idx <= 0) return list;
    const copy = [...list];
    const [item] = copy.splice(idx, 1);
    copy.unshift(item);
    return copy;
  };

  const sendMessage = (
    username: string,
    kind: MsgKind,
    text: string,
    fileName?: string,
    amount?: number,
    imageId?: string,
    attachmentId?: string,
  ) => {
    const uname = normalizeUsername(username);
    if (production) {
      const conversation = getChat(username);
      const connection = accountChat.current;
      if (!conversation || conversation.readOnly || !connection) return Promise.resolve(false);
      return connection.send(conversation.id, { messageId: uid(), kind, text: cleanStr(text, 2000), imageId, attachmentId })
        .then(() => !connection.signal.aborted, (error) => {
          if (!connection.signal.aborted) pushToast(error.message, "error");
          return false;
        });
    }
    let list = [...chatsRef.current];
    let conv = list.find((c) => c.username === uname);
    if (!conv) {
      const contact = contactsRef.current.find((c) => c.username === uname);
      conv = {
        id: uname,
        isGroup: false,
        username: uname,
        name: contact?.name || uname,
        color: contact?.color ?? hueFromString(uname),
        messages: [],
        updatedAt: Date.now(),
        unread: 0,
      };
      list = [conv, ...list];
    }
    const msg: Message = {
      id: uid(),
      imageId: kind === "image" ? imageId : undefined,
      attachmentId:
      kind === "file" || kind === "video" || kind === "voice" ? attachmentId : undefined,
      fromMe: true,
      kind,
      text: cleanStr(text, 2000),
      fileName: fileName ? cleanStr(fileName, 120) : undefined,
      status: "pending",
      at: Date.now(),
    };

        conv = { ...conv, messages: [...conv.messages, msg].slice(-CAPS.messages), updatedAt: Date.now() };
    list = list.map((c) => (c.username === uname ? conv! : c));
    list = bumpChat(list, uname);
    commitChats(list, true);

        const emitted = emitMessage(
      conv.id,
      kind,
      msg.text,
      msg.fileName,
      msg.id,
      msg.imageId,
      msg.attachmentId,
    );

    if (!emitted) {
      const updated = chatsRef.current.map((chat) => ({
        ...chat,
        messages: chat.messages.map((message) =>
          message.id === msg.id && message.fromMe
            ? { ...message, status: "failed" as const }
            : message,
        ),
      }));

      commitChats(updated, true);
    }
  };

    const deleteMessage = async (
    username: string,
    messageId: string,
  ): Promise<boolean> => {
    const token = emailSessionRef.current;
    const ownUsername = normalizeUsername(piUsername || "");
    const peer = normalizeUsername(username);

    if (!token || !ownUsername) {
      pushToast("Please sign in before deleting messages.", "error");
      return false;
    }

    const chat = chatsRef.current.find(
      (item) => !item.isGroup && item.username === peer,
    );
    const message = chat?.messages.find((item) => item.id === messageId);
    if (production) {
      const conversation = getChat(username);
      const connection = accountChat.current;
      if (!conversation || !connection || !conversation.messages.some((item) => item.id === messageId)) return false;
      try {
        await deleteChatMessage(token, ownUsername, messageId, connection.signal);
        connection.refresh(conversation.id);
        return !connection.signal.aborted;
      } catch (error) {
        if (!connection.signal.aborted) pushToast(error instanceof Error ? error.message : "Message could not be deleted.", "error");
        return false;
      }
    }
    if (!message) return true;

    const sender = message.fromMe ? ownUsername : peer;

    try {
      await deleteChatMessage(token, sender, messageId);

      if (emailSessionRef.current !== token) return false;
        deletedChatMessagesRef.current.keys.add(`${sender}:${messageId}`);

      const updated = chatsRef.current.map((item) => {
        if (item.isGroup || item.username !== peer) return item;

        const messages = item.messages.filter(
          (entry) =>
            entry.id !== messageId || entry.fromMe !== message.fromMe,
        );

        return {
          ...item,
          messages,
          unread: messages.filter(
            (entry) => !entry.fromMe && entry.status !== "read",
          ).length,
        };
      });

      commitChats(updated, true);
      return true;
    } catch (error) {
      if (emailSessionRef.current !== token) return false;

      pushToast(
        error instanceof Error
          ? error.message
          : "Message could not be deleted.",
        "error",
      );
      return false;
    }
  };

  const markChatRead = (username: string, messageIds: string[] = []) => {
    if (
      typeof document === "undefined" ||
      document.visibilityState !== "visible" ||
      messageIds.length === 0
    ) {
      return;
    }

    const uname = normalizeUsername(username);
    const chat = getChat(username);
    if (!chat) return;

    const requested = new Set(messageIds);
    const received = chat.messages.filter(
      (message) => !message.fromMe && requested.has(message.id),
    );
    if (received.length === 0) return;
    if (production) {
      accountChat.current?.markRead(chat.id, received);
      return;
    }

    const emitted = acknowledgeMessages(
      uname,
      received.map((message) => message.id),
      "read",
    );
    if (!emitted) return;

    const readIds = new Set(received.map((message) => message.id));
    const messages = chat.messages.map((message) =>
      readIds.has(message.id) && message.status !== "read"
        ? { ...message, status: "read" as const }
        : message,
    );

    const unread = messages.filter(
      (message) => !message.fromMe && message.status !== "read",
    ).length;

    const changed =
      unread !== chat.unread ||
      messages.some((message, index) => message !== chat.messages[index]);

    if (!changed) return;

    commitChats(
      chatsRef.current.map((item) =>
        item === chat ? { ...item, messages, unread } : item,
      ),
      true,
    );
  };

  const totalUnread = chats.reduce((sum, c) => sum + c.unread, 0);

  // ---- calls ----
  const logCall = (
    username: string,
    name: string,
    color: number,
    kind: CallKind,
    dir: CallDir,
    durationSec: number,
  ) => {
    const log: CallLog = {
      id: uid(),
      username: normalizeUsername(username),
      name: cleanStr(name, 40) || username,
      color,
      kind,
      dir,
      durationSec: Math.max(0, Math.round(durationSec)),
      at: Date.now(),
    };
    commitCalls([log, ...callsRef.current].slice(0, CAPS.calls), true);
  };

    const deleteCall = (id: string) => {
    if (!ready || !isAuthenticated || !sessionToken) return;

    const next = callsRef.current.filter((call) => call.id !== id);
    if (next.length === callsRef.current.length) return;

    commitCalls(next, true);
  };

  const clearCallHistory = () => {
    if (!ready || !isAuthenticated || !sessionToken) return;
    if (callsRef.current.length === 0) return;

    commitCalls([], true);
  };

  // ---- emails ----
  const sendEmail = async (
    recipient: string,
    subject: string,
    body: string,
    attachmentName?: string,
    attachmentSize?: number,
    requestId?: string,
    attachmentFile?: File,
  ): Promise<boolean> => {
    const token = emailSessionRef.current;
    const username = piUsername || "";

    if (!token || !username) {
      pushToast("Please sign in before sending email.", "error");
      return false;
    }

    const target = recipient.trim().toLowerCase();
    const emailType = validateEmailRecipient(target);
    if (production && emailType !== "internal") return false;

    if (!emailType) {
      pushToast("Invalid email recipient.", "error");
      return false;
    }

    if (!body.trim()) {
      pushToast("Please enter an email message.", "error");
      return false;
    }

    if (subject.length > 120 || body.length > 4000) {
      pushToast("The email exceeds the allowed length.", "error");
      return false;
    }

    if ((attachmentName || attachmentSize) && !attachmentFile) {
      pushToast("Please select the attachment file again.", "error");
      return false;
    }

    if (
      attachmentFile &&
      (
        attachmentFile.size === 0 ||
        attachmentFile.size > 10 * 1024 * 1024
      )
    ) {
      pushToast("Email attachment must be between 1 byte and 10 MB.", "error");
      return false;
    }

    try {
      let attachmentId: string | undefined;

      if (attachmentFile) {
        const cached = emailUploadRef.current;

        if (
          cached?.token === token &&
          cached.recipient === target &&
          cached.file === attachmentFile
        ) {
          attachmentId = cached.attachmentId;
        } else {
          const uploaded = await uploadEmailAttachment(
            token,
            target,
            attachmentFile,
          );

          if (emailSessionRef.current !== token) return false;

          attachmentId = uploaded.attachmentId;

          emailUploadRef.current = {
            token,
            recipient: target,
            file: attachmentFile,
            attachmentId,
          };
        }
      }

      const send = emailType === "external"
        ? sendExternalEmail
        : sendInternalEmail;

      const record = await send(token, {
        id: requestId || crypto.randomUUID(),
        recipient: target,
        subject: subject.trim() || "(no subject)",
        body,
        ...(attachmentId ? { attachmentId } : {}),
      });

      if (emailSessionRef.current !== token) return false;

      const email = parseInternalEmail(record, username, production ? "account" : undefined);

      if (!email || !email.fromMe) {
        throw new Error("Invalid email response.");
      }

      const next = [
        email,
        ...emailsRef.current.filter((item) => item.id !== email.id),
      ]
        .sort((a, b) => b.at - a.at)
        .slice(0, CAPS.emails);

      emailsRef.current = next;
      setEmails(next);
      if (production) accountMailbox.current?.refresh();

      pushToast(
        emailType === "external"
          ? "Email accepted for delivery."
          : "Email sent.",
        "success",
      );
      return true;
    } catch (error) {
      if (emailSessionRef.current !== token) return false;

      pushToast(
        error instanceof Error
          ? error.message
          : "Unable to send email.",
        "error",
      );

      return false;
    }
  };

  const saveDraft = (recipient: string, subject: string, body: string, attachmentName?: string, attachmentSize?: number) => {
    const emailType = validateEmailRecipient(recipient);
    if (!emailType) return;

    let senderName = profile.displayName || profile.username || "You";
    let color = 0;
    
    if (emailType === "internal") {
      const uname = normalizeUsername(recipient.slice(1));
      const contact = contactsRef.current.find((c) => c.username === uname);
      senderName = contact?.name || uname;
      color = contact?.color ?? hueFromString(uname);
    }

    const email: Email = {
      id: uid(),
      folder: "drafts",
      threadId: uid(),
      type: emailType,
      fromMe: true,
      recipient: recipient.toLowerCase(),
      senderName,
      color,
      subject: cleanStr(subject, 120) || "(no subject)",
      body: cleanStr(body, 4000),
      attachmentName: attachmentName ? cleanStr(attachmentName, 40) : undefined,
      attachmentSize: attachmentSize ? Math.min(attachmentSize, MAX_ATTACHMENT_SIZE) : undefined,
      read: true,
      at: Date.now(),
    };
    commitEmails([email, ...emailsRef.current].slice(0, CAPS.emails), true);
  };

  const markEmailRead = async (id: string): Promise<void> => {
    const email = emailsRef.current.find((item) => item.id === id);
    if (!email || email.read) return;

    if (email.folder === "drafts") {
      commitEmails(
        emailsRef.current.map((item) =>
          item.id === id ? { ...item, read: true } : item,
        ),
      );
      return;
    }

    const token = emailSessionRef.current;

    if (!token) {
      pushToast("Please sign in before updating email.", "error");
      return;
    }

    try {
      await markInternalEmailRead(token, id);

      if (emailSessionRef.current !== token) return;

      const next = emailsRef.current.map((item) =>
        item.id === id ? { ...item, read: true } : item,
      );

      emailsRef.current = next;
      setEmails(next);
    } catch {
      if (emailSessionRef.current !== token) return;

      pushToast("Unable to mark email as read.", "error");
    }
  };

    const deleteEmail = async (id: string): Promise<boolean> => {
    const email = emailsRef.current.find((item) => item.id === id);
    if (!email) return true;

    if (email.folder === "drafts") {
      commitEmails(
        emailsRef.current.filter((item) => item.id !== id),
        true,
      );
      return true;
    }

    const token = emailSessionRef.current;

    if (!token) {
      pushToast("Please sign in before deleting email.", "error");
      return false;
    }

    try {
      await deleteInternalEmail(token, id);

      if (emailSessionRef.current !== token) return false;

      const next = emailsRef.current.filter((item) => item.id !== id);

      emailsRef.current = next;
      setEmails(next);

      return true;
    } catch {
      if (emailSessionRef.current !== token) return false;

      pushToast("Unable to delete email. Please try again.", "error");
      return false;
    }
  };

  const unreadEmails = emails.filter((e) => e.folder === "inbox" && !e.read).length;

  const lang = profile.language;
  const t = getDict(lang);
  const dir = RTL_LANGS.includes(lang) ? "rtl" : "ltr";

  const value: ConnectContextType = {
    ready,
    storageNotice,
    toasts,
    pushToast,
    dismissToast,
    profile,
    lang,
    t,
    dir,
    finishSetup,
    updateProfile,
    setLanguage,
    logout,
    contacts,
    requests,
    isContact,
    addContact,
    acceptRequest,
    declineRequest,
    chats,
    getChat,
    ensureChat,
    totalUnread, openChat,
    sendMessage,
    markChatRead,
    deleteMessage,
    calls,
    logCall,
    deleteCall,
    clearCallHistory,
    emails,
    sendEmail,
    saveDraft,
    markEmailRead,
    deleteEmail,
    unreadEmails,
  };

  return <ConnectContext.Provider value={value}>{children}</ConnectContext.Provider>;
}

export function useConnect() {
  const ctx = useContext(ConnectContext);
  if (!ctx) throw new Error("useConnect must be used within ConnectProvider");
  return ctx;
}
