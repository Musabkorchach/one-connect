// ---------- Types ----------
export type TabId = "chats" | "contacts" | "calls" | "emails" | "profile";

export type LangId =
  | "en" | "zh" | "es" | "fr" | "ar" | "hi" | "ru" | "ja"
  | "ko" | "pt" | "de" | "it" | "tr" | "vi" | "id" | "am" | "ti";

export type MsgStatus = "sent" | "delivered" | "read";
export type MsgKind = "text" | "image" | "file" | "video" | "voice";
export type CallKind = "voice" | "video";
export type CallDir = "incoming" | "outgoing" | "missed";
export type EmailFolder = "inbox" | "sent" | "drafts";
export type EmailType = "internal" | "external";
export type UserStatus = "available" | "away" | "busy" | "offline";

export interface Email {
  id: string;
  folder: EmailFolder;
  threadId: string;
  type: EmailType;           // internal (@username) or external (user@domain.com)
  fromMe: boolean;
  recipient: string;         // @username for internal, email@domain.com for external
  senderName: string;        // display name for sender
  color: number;             // hue for avatar (internal only; external uses gray)
  subject: string;
  body: string;
  attachmentName?: string;   // file name only (no data URI)
  attachmentSize?: number;   // bytes for limit checking
  deliveryStatus?: "pending" | "sent" | "failed" | "spam";  // external only
  readAt?: number;           // timestamp when read (external tracking)
  read: boolean;
  at: number;
}

export interface Contact {
  id: string;
  username: string;      // pi username (their digital ID)
  name: string;
  color: number;         // hue for avatar
  online: boolean;
  status: UserStatus;    // available, away, busy, offline
  statusText?: string;   // custom status message
  addedAt: number;
}

export interface GroupMember {
  username: string;
  name: string;
  color: number;
  admin: boolean;
  addedAt: number;
}

export interface Group {
  id: string;
  name: string;
  description?: string;
  icon?: string;         // data url
  members: GroupMember[];
  createdAt: number;
  updatedAt: number;
}

export interface ContactRequest {
  id: string;
  username: string;
  name: string;
  color: number;
  at: number;
}

export interface Message {
  id: string;
  fromMe: boolean;
  kind: MsgKind;
  text: string;          // text body / caption / file name
  fileName?: string;
  fileSize?: number;     // bytes
  duration?: number;     // for voice/video, in seconds
  mimeType?: string;     // for media files
  status: MsgStatus;
  at: number;
}

export interface Conversation {
  id: string;            // = contact id or group id
  isGroup: boolean;      // true for group chats
  username?: string;     // only for 1:1 conversations
  name: string;
  color: number;
  icon?: string;         // for groups, data url
  messages: Message[];
  updatedAt: number;
  unread: number;
}

export interface CallLog {
  id: string;
  username: string;
  name: string;
  color: number;
  kind: CallKind;
  dir: CallDir;
  durationSec: number;   // 0 for missed
  at: number;
}



export interface Profile {
  setupDone: boolean;
  displayName: string;
  username: string;      // derived from Pi SDK
  avatar: string | null; // data url or null
  language: LangId;
  status: UserStatus;    // available, away, busy, offline
  statusText?: string;   // custom status message
  piUsername?: string;   // from Pi SDK profile
}

export interface Toast {
  id: string;
  message: string;
  tone: "default" | "success" | "error";
}

// ---------- Keys & caps ----------
export const KEYS = {
  profile: "connect.profile",
  contacts: "connect.contacts",
  requests: "connect.requests",
  chats: "connect.chats",
  calls: "connect.calls",
  emails: "connect.emails",
  groups: "connect.groups",
} as const;

export const CAPS = {
  contacts: 200,
  requests: 40,
  chats: 60,
  messages: 120,
  calls: 80,
  emails: 120,
  groups: 50,
};

export const NAME_MAX = 40;
export const MSG_MAX = 2000;
export const SUBJECT_MAX = 120;
export const BODY_MAX = 4000;
export const MAX_AMOUNT = 1000000;
export const BLOB_BUDGET = 58000;

export const RTL_LANGS: LangId[] = ["ar"];

export const LANGUAGES: { id: LangId; label: string; english: string }[] = [
  { id: "en", label: "English", english: "English" },
  { id: "zh", label: "中文", english: "Chinese" },
  { id: "es", label: "Español", english: "Spanish" },
  { id: "fr", label: "Français", english: "French" },
  { id: "ar", label: "العربية", english: "Arabic" },
  { id: "hi", label: "हिन्दी", english: "Hindi" },
  { id: "ru", label: "Русский", english: "Russian" },
  { id: "ja", label: "日本語", english: "Japanese" },
  { id: "ko", label: "한국어", english: "Korean" },
  { id: "pt", label: "Português", english: "Portuguese" },
  { id: "de", label: "Deutsch", english: "German" },
  { id: "it", label: "Italiano", english: "Italian" },
  { id: "tr", label: "Türkçe", english: "Turkish" },
  { id: "vi", label: "Tiếng Việt", english: "Vietnamese" },
  { id: "id", label: "Bahasa Indonesia", english: "Indonesian" },
  { id: "am", label: "አማርኛ", english: "Amharic" },
  { id: "ti", label: "ትግርኛ", english: "Tigrinya" },
];

// ---------- Helpers ----------
export function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function clampNum(v: unknown, min: number, max: number, fallback = 0): number {
  const n = typeof v === "number" && Number.isFinite(v) ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function cleanStr(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  // strip control chars and angle brackets
  return v.replace(/[\u0000-\u001f\u007f<>]/g, "").slice(0, max);
}

export function normalizeUsername(raw: string): string {
  return cleanStr(raw, NAME_MAX)
    .replace(/^@+/, "")
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .toLowerCase()
    .slice(0, 32);
}

/** Canonical display identity from Pi: no @ duplication, domain, or SDK suffix. */
export function canonicalPiUsername(raw: unknown): string {
  const value = cleanStr(typeof raw === "string" ? raw : "", NAME_MAX)
    .trim()
    .replace(/^@+/, "")
    .split("@")[0]
    .replace(/\.xlbt$/i, "");
  return normalizeUsername(value);
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function hueFromString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}

export function formatPi(n: number): string {
  const v = Math.round(n * 1e6) / 1e6;
  return v.toLocaleString("en-US", { maximumFractionDigits: 6 });
}

export function formatTime(ts: number, locale = "en-US"): string {
  try {
    return new Date(ts).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

export function formatDate(ts: number, locale = "en-US"): string {
  try {
    return new Date(ts).toLocaleDateString(locale, { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

export function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  const w = Math.floor(d / 7);
  return `${w}w`;
}

export function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function dayLabel(ts: number, locale = "en-US"): string {
  const now = new Date();
  const d = new Date(ts);
  const sameDay = now.toDateString() === d.toDateString();
  if (sameDay) return "Today";
  const yest = new Date(now);
  yest.setDate(now.getDate() - 1);
  if (yest.toDateString() === d.toDateString()) return "Yesterday";
  try {
    return d.toLocaleDateString(locale, { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

// ---------- Seed sample data (module const, not persisted alone) ----------
export interface SeedPerson {
  username: string;
  name: string;
}
export const SEED_PEOPLE: SeedPerson[] = [
  { username: "maya.rivera", name: "Maya Rivera" },
  { username: "kenji.watanabe", name: "Kenji Watanabe" },
  { username: "amara.okoye", name: "Amara Okoye" },
  { username: "luca.bianchi", name: "Luca Bianchi" },
  { username: "sofia.marquez", name: "Sofia Marquez" },
  { username: "omar.haddad", name: "Omar Haddad" },
  { username: "priya.nair", name: "Priya Nair" },
  { username: "noah.schmidt", name: "Noah Schmidt" },
];

export function seedContacts(): Contact[] {
  return [];
}

export function seedRequests(): ContactRequest[] {
  return [];
}

export function seedChats(): Conversation[] {
  return [];
}

export function seedCalls(): CallLog[] {
  return [];
}

export function seedEmails(): Email[] {
  return [];
}

export function defaultProfile(): Profile {
  return { setupDone: false, displayName: "", username: "", avatar: null, language: "en", status: "available", statusText: "", piUsername: "" };
}

// ---------- Image helper ----------
export function isValidImage(v: unknown): v is string {
  return typeof v === "string" && (v.startsWith("data:image/") && v.length < 95000);
}

// ---------- Email helpers ----------
export const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024; // 10 MB
export const EXTERNAL_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isExternalEmail(address: string): boolean {
  return EXTERNAL_EMAIL_REGEX.test(address);
}

export function isInternalEmail(address: string): boolean {
  return address.startsWith("@") && normalizeUsername(address.slice(1)) === address.slice(1);
}

export function validateEmailRecipient(recipient: string): "internal" | "external" | null {
  const trimmed = recipient.trim().toLowerCase();
  if (trimmed.startsWith("@")) {
    return isInternalEmail(trimmed) ? "internal" : null;
  }
  return isExternalEmail(trimmed) ? "external" : null;
}

export function fileToAvatar(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const size = 256;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("no ctx"));
        const scale = Math.max(size / img.width, size / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
        resolve(canvas.toDataURL("image/jpeg", 0.7));
      };
      img.onerror = reject;
      img.src = reader.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ---------- Sanitizers (treat loaded blob as untrusted) ----------
export function sanitizeProfile(blob: unknown): Profile {
  const b = (blob && typeof blob === "object" ? blob : {}) as Record<string, unknown>;
  const lang = LANGUAGES.some((l) => l.id === b.language) ? (b.language as LangId) : "en";
  const status = (["available", "away", "busy", "offline"].includes(b.status as string) ? (b.status as UserStatus) : "available");
  return {
    setupDone: b.setupDone === true,
    displayName: cleanStr(b.displayName, NAME_MAX),
    username: normalizeUsername(typeof b.username === "string" ? b.username : ""),
    avatar: isValidImage(b.avatar) ? (b.avatar as string) : null,
    language: lang,
    status,
    statusText: cleanStr(b.statusText, 100),
    piUsername: cleanStr(typeof b.piUsername === "string" ? b.piUsername : "", NAME_MAX),
  };
}
export function profileToBlob(p: Profile): Record<string, unknown> {
  return { ...p };
}

function sanitizeContact(v: unknown): Contact | null {
  if (!v || typeof v !== "object") return null;
  const c = v as Record<string, unknown>;
  const username = normalizeUsername(typeof c.username === "string" ? c.username : "");
  if (!username) return null;
  const status = (["available", "away", "busy", "offline"].includes(c.status as string) ? (c.status as UserStatus) : "available");
  return {
    id: username,
    username,
    name: cleanStr(c.name, NAME_MAX) || username,
    color: clampNum(c.color, 0, 360, hueFromString(username)),
    online: c.online === true,
    status,
    statusText: cleanStr(c.statusText, 100),
    addedAt: clampNum(c.addedAt, 0, Number.MAX_SAFE_INTEGER, Date.now()),
  };
}
export function sanitizeContacts(blob: unknown): Contact[] {
  const items = (blob as { items?: unknown })?.items;
  if (!Array.isArray(items)) return [];
  const out: Contact[] = [];
  const seen = new Set<string>();
  for (const it of items) {
    const c = sanitizeContact(it);
    if (c && !seen.has(c.id)) {
      seen.add(c.id);
      out.push(c);
    }
    if (out.length >= CAPS.contacts) break;
  }
  return out;
}
export function contactsToBlob(items: Contact[]): Record<string, unknown> {
  return { items: items.slice(0, CAPS.contacts) };
}

export function sanitizeRequests(blob: unknown): ContactRequest[] {
  const items = (blob as { items?: unknown })?.items;
  if (!Array.isArray(items)) return [];
  const out: ContactRequest[] = [];
  for (const it of items) {
    if (!it || typeof it !== "object") continue;
    const r = it as Record<string, unknown>;
    const username = normalizeUsername(typeof r.username === "string" ? r.username : "");
    if (!username) continue;
    out.push({
      id: typeof r.id === "string" ? r.id : uid(),
      username,
      name: cleanStr(r.name, NAME_MAX) || username,
      color: clampNum(r.color, 0, 360, hueFromString(username)),
      at: clampNum(r.at, 0, Number.MAX_SAFE_INTEGER, Date.now()),
    });
    if (out.length >= CAPS.requests) break;
  }
  return out;
}
export function requestsToBlob(items: ContactRequest[]): Record<string, unknown> {
  return { items: items.slice(0, CAPS.requests) };
}

const MSG_KINDS: MsgKind[] = ["text", "image", "file", "video", "voice"];
const MSG_STATUS: MsgStatus[] = ["sent", "delivered", "read"];
function sanitizeMessage(v: unknown): Message | null {
  if (!v || typeof v !== "object") return null;
  const m = v as Record<string, unknown>;
  const kind = MSG_KINDS.includes(m.kind as MsgKind) ? (m.kind as MsgKind) : "text";
  const status = MSG_STATUS.includes(m.status as MsgStatus) ? (m.status as MsgStatus) : "sent";
  return {
    id: typeof m.id === "string" ? m.id : uid(),
    fromMe: m.fromMe === true,
    kind,
    text: cleanStr(m.text, MSG_MAX),
    fileName: m.fileName ? cleanStr(m.fileName, NAME_MAX) : undefined,
    fileSize: clampNum(m.fileSize, 0, 500 * 1024 * 1024),
    duration: clampNum(m.duration, 0, 3600),
    mimeType: m.mimeType ? cleanStr(m.mimeType, 60) : undefined,
    status,
    at: clampNum(m.at, 0, Number.MAX_SAFE_INTEGER, Date.now()),
  };
}
export function sanitizeChats(blob: unknown): Conversation[] {
  const items = (blob as { items?: unknown })?.items;
  if (!Array.isArray(items)) return [];
  const out: Conversation[] = [];
  for (const it of items) {
    if (!it || typeof it !== "object") continue;
    const c = it as Record<string, unknown>;
    const username = normalizeUsername(typeof c.username === "string" ? c.username : "");
    if (!username) continue;
    const msgs = Array.isArray(c.messages)
      ? (c.messages.map(sanitizeMessage).filter(Boolean) as Message[]).slice(-CAPS.messages)
      : [];
    out.push({
      id: username,
      username,
      name: cleanStr(c.name, NAME_MAX) || username,
      color: clampNum(c.color, 0, 360, hueFromString(username)),
      messages: msgs,
      updatedAt: clampNum(c.updatedAt, 0, Number.MAX_SAFE_INTEGER, Date.now()),
      unread: clampNum(c.unread, 0, 999, 0),
    });
    if (out.length >= CAPS.chats) break;
  }
  out.sort((a, b) => b.updatedAt - a.updatedAt);
  return out;
}
export function chatsToBlob(items: Conversation[]): Record<string, unknown> {
  return {
    items: items.slice(0, CAPS.chats).map((c) => ({
      ...c,
      messages: c.messages.slice(-CAPS.messages),
    })),
  };
}

const CALL_KINDS: CallKind[] = ["voice", "video"];
const CALL_DIRS: CallDir[] = ["incoming", "outgoing", "missed"];
export function sanitizeCalls(blob: unknown): CallLog[] {
  const items = (blob as { items?: unknown })?.items;
  if (!Array.isArray(items)) return [];
  const out: CallLog[] = [];
  for (const it of items) {
    if (!it || typeof it !== "object") continue;
    const c = it as Record<string, unknown>;
    const username = normalizeUsername(typeof c.username === "string" ? c.username : "");
    if (!username) continue;
    out.push({
      id: typeof c.id === "string" ? c.id : uid(),
      username,
      name: cleanStr(c.name, NAME_MAX) || username,
      color: clampNum(c.color, 0, 360, hueFromString(username)),
      kind: CALL_KINDS.includes(c.kind as CallKind) ? (c.kind as CallKind) : "voice",
      dir: CALL_DIRS.includes(c.dir as CallDir) ? (c.dir as CallDir) : "outgoing",
      durationSec: clampNum(c.durationSec, 0, 86400, 0),
      at: clampNum(c.at, 0, Number.MAX_SAFE_INTEGER, Date.now()),
    });
    if (out.length >= CAPS.calls) break;
  }
  out.sort((a, b) => b.at - a.at);
  return out;
}
export function callsToBlob(items: CallLog[]): Record<string, unknown> {
  return { items: items.slice(0, CAPS.calls) };
}

const FOLDERS: EmailFolder[] = ["inbox", "sent", "drafts"];
export function sanitizeEmails(blob: unknown): Email[] {
  const items = (blob as { items?: unknown })?.items;
  if (!Array.isArray(items)) return [];
  const EMAIL_TYPES: EmailType[] = ["internal", "external"];
  const DELIVERY_STATUSES: (Email["deliveryStatus"])[] = ["pending", "sent", "failed", "spam"];
  const out: Email[] = [];
  for (const it of items) {
    if (!it || typeof it !== "object") continue;
    const e = it as Record<string, unknown>;
    const recipient = cleanStr(typeof e.recipient === "string" ? e.recipient : "", 255);
    const type = EMAIL_TYPES.includes(e.type as EmailType) ? (e.type as EmailType) : "internal";
    if (!recipient) continue;
    out.push({
      id: typeof e.id === "string" ? e.id : uid(),
      folder: FOLDERS.includes(e.folder as EmailFolder) ? (e.folder as EmailFolder) : "inbox",
      threadId: typeof e.threadId === "string" ? cleanStr(e.threadId, 40) : uid(),
      type,
      fromMe: e.fromMe === true,
      recipient,
      senderName: cleanStr(e.senderName, NAME_MAX) || recipient,
      color: type === "internal" ? clampNum(e.color, 0, 360, hueFromString(recipient)) : 0,
      subject: cleanStr(e.subject, SUBJECT_MAX),
      body: cleanStr(e.body, BODY_MAX),
      attachmentName: e.attachmentName ? cleanStr(e.attachmentName, NAME_MAX) : undefined,
      attachmentSize: clampNum(e.attachmentSize, 0, MAX_ATTACHMENT_SIZE, undefined),
      deliveryStatus: type === "external" && DELIVERY_STATUSES.includes(e.deliveryStatus as Email["deliveryStatus"]) ? (e.deliveryStatus as Email["deliveryStatus"]) : undefined,
      readAt: type === "external" ? clampNum(e.readAt, 0, Number.MAX_SAFE_INTEGER, undefined) : undefined,
      read: e.read === true,
      at: clampNum(e.at, 0, Number.MAX_SAFE_INTEGER, Date.now()),
    });
    if (out.length >= CAPS.emails) break;
  }
  out.sort((a, b) => b.at - a.at);
  return out;
}
export function emailsToBlob(items: Email[]): Record<string, unknown> {
  return { items: items.slice(0, CAPS.emails) };
}
