"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePiAuth } from "@/contexts/pi-auth-context";
import { getDict, type Dict } from "@/lib/connect/i18n";
import { emitMessage, joinConversation } from "@/lib/api-client";
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
const memStore = new Map<string, Record<string, unknown>>();

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
  totalUnread: number;
  sendMessage: (username: string, kind: MsgKind, text: string, fileName?: string, amount?: number) => void;
  markChatRead: (username: string) => void;
  // calls
  calls: CallLog[];
  logCall: (username: string, name: string, color: number, kind: CallKind, dir: CallDir, durationSec: number) => void;
  // emails
  emails: Email[];
  sendEmail: (recipient: string, subject: string, body: string, attachmentName?: string, attachmentSize?: number) => void;
  saveDraft: (recipient: string, subject: string, body: string, attachmentName?: string, attachmentSize?: number) => void;
  markEmailRead: (id: string) => void;
  deleteEmail: (id: string) => void;
  unreadEmails: number;
}

const ConnectContext = createContext<ConnectContextType | undefined>(undefined);

export function ConnectProvider({ children }: { children: ReactNode }) {
  const { sdk, isAuthenticated, piUsername } = usePiAuth();

  const [ready, setReady] = useState(false);
  const [storageNotice, setStorageNotice] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const [profile, setProfile] = useState<Profile>(defaultProfile());
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [requests, setRequests] = useState<ContactRequest[]>([]);
  const [chats, setChats] = useState<Conversation[]>([]);
  const [calls, setCalls] = useState<CallLog[]>([]);
  const [emails, setEmails] = useState<Email[]>([]);

  // authoritative refs
  const profileRef = useRef(profile);
  const contactsRef = useRef(contacts);
  const requestsRef = useRef(requests);
  const chatsRef = useRef(chats);
  const callsRef = useRef(calls);
  const emailsRef = useRef(emails);

  const stateApi = useRef<StateApi | null>(null);

  // ---- toasts ----
  const pushToast = (message: string, tone: Toast["tone"] = "default") => {
    const id = uid();
    setToasts((prev) => [...prev, { id, message, tone }]);
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 2600);
  };
  const dismissToast = (id: string) => setToasts((prev) => prev.filter((x) => x.id !== id));

  // ---- per-key saver factory ----
  const savers = useRef<Record<string, { timer: ReturnType<typeof setTimeout> | null; delay: number; pending: Record<string, unknown> | null }>>({});

  const writeNow = async (key: string, blob: Record<string, unknown>) => {
    const api = stateApi.current;
    if (!api) return;
    try {
      await api.set(key, blob);
      const s = savers.current[key];
      if (s) s.delay = 1300;
    } catch {
      setStorageNotice(true);
      setTimeout(() => setStorageNotice(false), 2600);
      const s = savers.current[key];
      if (s) {
        s.delay = Math.min(30000, Math.round(s.delay * 1.8));
        s.pending = blob;
        if (s.timer) clearTimeout(s.timer);
        s.timer = setTimeout(() => {
          const p = s.pending;
          s.pending = null;
          s.timer = null;
          if (p) void writeNow(key, p);
        }, s.delay);
      }
    }
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

    const api: StateApi = sdk
      ? {
          get: (k) => sdk.state.get(k),
          set: (k, b) => sdk.state.set(k, b),
        }
      : {
          get: async (k) => (memStore.has(k) ? { blob: memStore.get(k)! } : null),
          set: async (k, b) => { memStore.set(k, b); },
        };
    stateApi.current = api;

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
        const canonicalIdentity = canonicalPiUsername(piUsername || loadedProfile.piUsername || loadedProfile.username);
        if (canonicalIdentity) {
          loadedProfile.username = canonicalIdentity;
          loadedProfile.piUsername = canonicalIdentity;
        }
        const fresh = !pRec;

        const loadedContacts = cRec ? sanitizeContacts(cRec.blob) : (fresh ? seedContacts() : []);
        const loadedRequests = rRec ? sanitizeRequests(rRec.blob) : (fresh ? seedRequests() : []);
        const loadedChats = chRec ? sanitizeChats(chRec.blob) : (fresh ? seedChats() : []);
        const loadedCalls = clRec ? sanitizeCalls(clRec.blob) : (fresh ? seedCalls() : []);
        const loadedEmails = emRec ? sanitizeEmails(emRec.blob) : (fresh ? seedEmails() : []);

        setProfile(loadedProfile); profileRef.current = loadedProfile;
        setContacts(loadedContacts); contactsRef.current = loadedContacts;
        setRequests(loadedRequests); requestsRef.current = loadedRequests;
        setChats(loadedChats); chatsRef.current = loadedChats;
        setCalls(loadedCalls); callsRef.current = loadedCalls;
        setEmails(loadedEmails); emailsRef.current = loadedEmails;

        setReady(true);
      } catch {
        setReady(true);
      }
    })();

    return () => { cancelled = true; };
  }, [sdk, isAuthenticated, piUsername]);

  // flush on hide
  useEffect(() => {
    const onHide = () => flushAll();
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") flushAll();
    });
    return () => window.removeEventListener("pagehide", onHide);
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
    scheduleSave(KEYS.chats, chatsToBlob(next), immediate);
  };
  const commitCalls = (next: CallLog[], immediate = false) => {
    callsRef.current = next;
    setCalls(next);
    scheduleSave(KEYS.calls, callsToBlob(next), immediate);
  };
  const commitEmails = (next: Email[], immediate = false) => {
    emailsRef.current = next;
    setEmails(next);
    scheduleSave(KEYS.emails, emailsToBlob(next), immediate);
  };

  // ---- profile actions ----
  const finishSetup = (displayName: string, avatar: string | null, providedPiUsername?: string) => {
    const name = cleanStr(displayName, 40) || "Pioneer";
    const identity = canonicalPiUsername(providedPiUsername || piUsername || profileRef.current.piUsername || profileRef.current.username);
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
    setProfile(defaultProfile());
    setContacts([]);
    setRequests([]);
    setChats([]);
    setCalls([]);
    setEmails([]);
    setReady(false);
    Object.keys(savers.current).forEach((key) => {
      if (stateApi.current) {
        void stateApi.current.set(key, {});
      }
    });
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
    commitContacts([c, ...contactsRef.current], true);
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
    chatsRef.current.find((c) => c.username === normalizeUsername(username));

  const ensureChat = (person: Contact | ContactRequest) => {
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
  ) => {
    const uname = normalizeUsername(username);
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
      fromMe: true,
      kind,
      text: cleanStr(text, 2000),
      fileName: fileName ? cleanStr(fileName, 40) : undefined,
      status: "sent",
      at: Date.now(),
    };

    emitMessage(conv.id, kind, msg.text, msg.fileName);

    conv = { ...conv, messages: [...conv.messages, msg].slice(-CAPS.messages), updatedAt: Date.now() };
    list = list.map((c) => (c.username === uname ? conv! : c));
    list = bumpChat(list, uname);
    commitChats(list, true);

    // simulate delivery -> read -> reply
    const msgId = msg.id;
    const advance = (status: Message["status"], delay: number) => {
      setTimeout(() => {
        const cur = [...chatsRef.current];
        const ci = cur.findIndex((c) => c.username === uname);
        if (ci < 0) return;
        const conv2 = cur[ci];
        cur[ci] = {
          ...conv2,
          messages: conv2.messages.map((m) => (m.id === msgId ? { ...m, status } : m)),
        };
        commitChats(cur);
      }, delay);
    };
    advance("delivered", 700);
    advance("read", 1600);

    setTimeout(() => {
      const replyText = pickReply(uname);
      const cur = [...chatsRef.current];
      const ci = cur.findIndex((c) => c.username === uname);
      if (ci < 0) return;
      const conv2 = cur[ci];
      const reply: Message = {
        id: uid(),
        fromMe: false,
        kind: "text",
        text: replyText,
        status: "read",
        at: Date.now(),
      };
      cur[ci] = {
        ...conv2,
        messages: [...conv2.messages, reply].slice(-CAPS.messages),
        updatedAt: Date.now(),
      };
      commitChats(bumpChat(cur, uname));
    }, 2600);
  };

  const markChatRead = (username: string) => {
    const uname = normalizeUsername(username);
    const list = chatsRef.current.map((c) => (c.username === uname && c.unread ? { ...c, unread: 0 } : c));
    if (list.some((c, i) => c !== chatsRef.current[i])) commitChats(list);
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

  // ---- emails ----
  const sendEmail = (recipient: string, subject: string, body: string, attachmentName?: string, attachmentSize?: number) => {
    const emailType = validateEmailRecipient(recipient);
    if (!emailType) {
      pushToast("Invalid email recipient", "error");
      return;
    }

    const now = Date.now();
    const threadId = uid();
    
    // Build email object
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
      folder: "sent",
      threadId,
      type: emailType,
      fromMe: true,
      recipient: recipient.toLowerCase(),
      senderName,
      color,
      subject: cleanStr(subject, 120) || "(no subject)",
      body: cleanStr(body, 4000),
      attachmentName: attachmentName ? cleanStr(attachmentName, 40) : undefined,
      attachmentSize: attachmentSize ? Math.min(attachmentSize, MAX_ATTACHMENT_SIZE) : undefined,
      deliveryStatus: emailType === "external" ? "pending" : undefined,
      read: true,
      at: now,
    };

    commitEmails([email, ...emailsRef.current].slice(0, CAPS.emails), true);

    // Handle external email sending
    if (emailType === "external") {
      fetch("/api/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipient: email.recipient,
          subject: email.subject,
          body: email.body,
          attachmentName: email.attachmentName,
        }),
      })
        .then((r) => r.json())
        .then((data) => {
          if (data.success) {
            pushToast("Email sent", "success");
            // Update delivery status
            const updated = emailsRef.current.map((e) =>
              e.id === email.id ? { ...e, deliveryStatus: "sent" as const } : e
            );
            commitEmails(updated);
          } else {
            pushToast("Failed to send email", "error");
            
            const updated = emailsRef.current.map((e) =>
              e.id === email.id ? { ...e, deliveryStatus: "failed" as const } : e
            );
            commitEmails(updated);
          }
        })
        .catch((err) => {
          console.error("[v0] Email send error:", err);
          pushToast("Email delivery failed", "error");
        });
    } else {
  // Simulate internal email reply
  pushToast("Email sent", "success");
  return;
  setTimeout(() => {
    const reply: Email = {
      id: uid(),
      folder: "inbox",
      threadId,
      type: "internal",
      fromMe: false,
      recipient: `@${profile.username}`,
      senderName: email.senderName,
      color: email.color,
      subject: `Re: ${email.subject}`,
      body: "Thanks for your message! I'll get back to you soon.\n\nSent from One Connect.",
      read: false,
      at: Date.now(),
    };
    commitEmails([reply, ...emailsRef.current].slice(0, CAPS.emails));
  }, 3000);
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

  const markEmailRead = (id: string) => {
    const list = emailsRef.current.map((e) => (e.id === id && !e.read ? { ...e, read: true } : e));
    if (list.some((e, i) => e !== emailsRef.current[i])) commitEmails(list);
  };
  const deleteEmail = (id: string) => {
    commitEmails(emailsRef.current.filter((e) => e.id !== id), true);
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
    totalUnread,
    sendMessage,
    markChatRead,
    calls,
    logCall,
    emails,
    sendEmail,
    saveDraft,
    markEmailRead,
    deleteEmail,
    unreadEmails,
  };

  return <ConnectContext.Provider value={value}>{children}</ConnectContext.Provider>;
}

// deterministic reply pool per contact
const REPLIES = [
  "Got it, thanks!",
  "Sounds good 👍",
  "Let me check and get back to you.",
  "That works for me.",
  "Perfect, talk soon!",
  "Sure thing.",
  "On it now.",
  "Great, appreciate it!",
];
function pickReply(seed: string): string {
  return REPLIES[hueFromString(seed + Date.now()) % REPLIES.length];
}

export function useConnect() {
  const ctx = useContext(ConnectContext);
  if (!ctx) throw new Error("useConnect must be used within ConnectProvider");
  return ctx;
}
