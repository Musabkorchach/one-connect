"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import { useConnect } from "@/contexts/connect-context";
import { Avatar, Header, IconButton, Button, EmptyState, TextInput, TextArea, cx } from "./ui";
import { Overlay, ConfirmDialog } from "./feedback";
import {
  IconMail,
  IconInbox,
  IconArrowUp,
  IconEdit,
  IconPlus,
  IconPaperclip,
  IconSend,
  IconTrash,
  IconFile,
  IconDownload,
} from "./icons";
import { formatDate, timeAgo, type Email, type EmailFolder } from "@/lib/connect/data";

export function EmailsView() {
  const { t, emails } = useConnect();
  const [folder, setFolder] = useState<EmailFolder>("inbox");
  const [composeOpen, setComposeOpen] = useState(false);
  const [reading, setReading] = useState<Email | null>(null);
  const [replyTo, setReplyTo] = useState<Email | null>(null);

  const folderEmails = useMemo(
    () => emails.filter((e) => e.folder === folder).sort((a, b) => b.at - a.at),
    [emails, folder],
  );

  const folders: { id: EmailFolder; label: string; icon: ReactNode }[] = [
    { id: "inbox", label: t.inbox, icon: <IconInbox className="h-4 w-4" /> },
    { id: "sent", label: t.sentFolder, icon: <IconArrowUp className="h-4 w-4" /> },
    { id: "drafts", label: t.drafts, icon: <IconEdit className="h-4 w-4" /> },
  ];

  return (
    <div className="pb-24">
      <Header
        title={t.emailsTitle}
        right={
          <IconButton
            className="h-9 w-9 bg-primary text-primary-foreground"
            onClick={() => {
              setReplyTo(null);
              setComposeOpen(true);
            }}
            aria-label={t.compose}
          >
            <IconPlus className="h-5 w-5" />
          </IconButton>
        }
      />

      {/* folder tabs */}
      <div className="flex gap-2 px-4 pt-3">
        {folders.map((f) => (
          <button
            key={f.id}
            onClick={() => setFolder(f.id)}
            className={cx(
              "pc-press flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-semibold",
              folder === f.id ? "bg-primary text-primary-foreground" : "pc-glass text-muted-foreground",
            )}
          >
            {f.icon}
            {f.label}
          </button>
        ))}
      </div>

      {folderEmails.length === 0 ? (
        <EmptyState icon={<IconMail className="h-7 w-7" />} title={t.noEmails} />
      ) : (
        <ul className="px-2 pt-3">
          {folderEmails.map((e, i) => (
            <li key={e.id} style={{ animationDelay: `${Math.min(i, 8) * 30}ms` }} className="pc-fade-up">
              <button
                onClick={() => {
                  if (e.folder === "drafts") {
                    setReplyTo(e);
                    setComposeOpen(true);
                  } else {
                    setReading(e);
                  }
                }}
                className="pc-press flex w-full items-start gap-3 rounded-2xl px-3 py-3 text-start hover:bg-card/50"
              >
                <Avatar name={e.senderName} color={e.color} size={46} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <div className="flex flex-col">
                      <span className={cx("truncate", e.folder === "inbox" && !e.read ? "font-bold text-foreground" : "font-semibold text-foreground")}>
                        {e.folder === "sent" ? `${t.to} ${e.recipient}` : e.senderName}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {e.type === "internal" ? "Internal" : "External"}
                        {e.type === "external" && e.deliveryStatus && ` • ${e.deliveryStatus}`}
                      </span>
                    </div>
                    <span className="ms-auto shrink-0 text-[11px] text-muted-foreground">{timeAgo(e.at)}</span>
                  </div>
                  <p className={cx("mt-0.5 truncate text-sm", !e.read && e.folder === "inbox" ? "font-semibold text-foreground" : "text-muted-foreground")}>
                    {e.subject}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground pc-clamp-1">{e.body}</p>
                  {e.attachmentName && (
                    <span className="mt-1 inline-flex items-center gap-1 text-[11px] text-turquoise">
                      <IconPaperclip className="h-3 w-3" />
                      {e.attachmentName} {e.attachmentSize && `(${Math.round(e.attachmentSize / 1024)}KB)`}
                    </span>
                  )}
                </div>
                {!e.read && e.folder === "inbox" && <span className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full bg-primary" />}
              </button>
            </li>
          ))}
        </ul>
      )}

      <ReadEmail
        email={reading}
        onClose={() => setReading(null)}
        onReply={(e) => {
          setReading(null);
          setReplyTo(e);
          setComposeOpen(true);
        }}
      />

      <ComposeEmail
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        replyTo={replyTo}
      />
    </div>
  );
}

function ReadEmail({
  email,
  onClose,
  onReply,
}: {
  email: Email | null;
  onClose: () => void;
  onReply: (e: Email) => void;
}) {
  const { t, markEmailRead, deleteEmail, lang } = useConnect();
  const [confirm, setConfirm] = useState(false);

  useMemo(() => {
    if (email && !email.read) markEmailRead(email.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email?.id]);

  return (
    <Overlay
      open={!!email}
      onClose={onClose}
      title={email?.subject}
      right={
        email && (
          <IconButton className="h-9 w-9 text-destructive" onClick={() => setConfirm(true)} aria-label="Delete">
            <IconTrash className="h-5 w-5" />
          </IconButton>
        )
      }
    >
      {email && (
        <div className="px-4 py-4">
          <div className="flex items-center gap-3">
            <Avatar name={email.senderName} color={email.color} size={52} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate font-bold">{email.senderName}</p>
                <span className="inline-block whitespace-nowrap rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                  {email.type === "internal" ? "Internal" : "External"}
                </span>
              </div>
              <p className="truncate text-xs text-muted-foreground">
                {email.type === "internal" ? email.recipient : email.recipient}
                {email.type === "external" && email.deliveryStatus && ` • ${email.deliveryStatus}`}
              </p>
            </div>
            <span className="text-xs text-muted-foreground">{formatDate(email.at, lang)}</span>
          </div>

          <h1 className="mt-5 text-xl font-bold text-balance">{email.subject}</h1>
          <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">{email.body}</p>

          {email.attachmentName && (
            <div className="mt-5 flex items-center gap-3 rounded-2xl pc-glass p-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-turquoise/20 text-turquoise">
                <IconFile className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                {email.attachmentName}
                {email.attachmentSize && ` (${Math.round(email.attachmentSize / 1024)}KB)`}
              </span>
              <button className="pc-press text-muted-foreground" aria-label="Download">
                <IconDownload className="h-5 w-5" />
              </button>
            </div>
          )}

          {email.folder !== "drafts" && (
            <Button variant="primary" className="mt-6 w-full py-3.5" onClick={() => onReply(email)}>
              <IconSend className="h-5 w-5 rtl:rotate-180" />
              {t.reply}
            </Button>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirm}
        title={t.emailsTitle}
        message={`${email?.subject || ""}`}
        confirmLabel={t.confirm}
        cancelLabel={t.cancel}
        onConfirm={() => {
          if (email) deleteEmail(email.id);
          setConfirm(false);
          onClose();
        }}
        onCancel={() => setConfirm(false)}
      />
    </Overlay>
  );
}

function ComposeEmail({
  open,
  onClose,
  replyTo,
}: {
  open: boolean;
  onClose: () => void;
  replyTo: Email | null;
}) {
  const { t, sendEmail, saveDraft, pushToast, contacts } = useConnect();
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [attachmentName, setAttachmentName] = useState<string | undefined>();
  const [attachmentSize, setAttachmentSize] = useState<number | undefined>();
  const fileRef = useRef<HTMLInputElement>(null);
  const initialized = useRef<string | null>(null);

  // seed from reply/draft when opened
  if (open && initialized.current !== (replyTo?.id || "new")) {
    initialized.current = replyTo?.id || "new";
    if (replyTo?.folder === "drafts") {
      setTo(replyTo.recipient);
      setSubject(replyTo.subject);
      setBody(replyTo.body);
      setAttachmentName(replyTo.attachmentName);
      setAttachmentSize(replyTo.attachmentSize);
    } else if (replyTo) {
      setTo(replyTo.recipient);
      setSubject(replyTo.subject.startsWith("Re:") ? replyTo.subject : `Re: ${replyTo.subject}`);
      setBody("");
      setAttachmentName(undefined);
      setAttachmentSize(undefined);
    } else {
      setTo("");
      setSubject("");
      setBody("");
      setAttachmentName(undefined);
      setAttachmentSize(undefined);
    }
  }
  if (!open && initialized.current !== null) initialized.current = null;

  const send = () => {
    const recipient = to.trim().toLowerCase();
    if (!recipient) {
      pushToast("Please enter a recipient (e.g., @username or email@domain.com)", "error");
      return;
    }
    sendEmail(recipient, subject, body, attachmentName, attachmentSize);
    onClose();
  };
  const draft = () => {
    const recipient = to.trim().toLowerCase();
    if (!recipient) {
      pushToast("Please enter a recipient", "error");
      return;
    }
    saveDraft(recipient, subject, body, attachmentName, attachmentSize);
    pushToast(t.draftSaved, "success");
    onClose();
  };

  return (
    <Overlay
      open={open}
      onClose={onClose}
      title={t.compose}
      right={
        <IconButton className="h-9 w-9 text-gold" onClick={draft} aria-label={t.saveDraft}>
          <IconEdit className="h-5 w-5" />
        </IconButton>
      }
    >
      <div className="flex flex-col gap-3 px-4 py-4">
        <div>
          <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t.to}</label>
          <div className="mt-1.5 rounded-xl bg-input/70 border border-border px-3 py-3">
            <input
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="@username or email@domain.com"
              list="contact-usernames"
              className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              {to.includes("@") && !to.startsWith("@") && "📧 External email"}
              {to.startsWith("@") && "👤 Internal Pi user"}
              {!to && "Enter @ for internal or email for external"}
            </p>
          </div>
          <datalist id="contact-usernames">
            {contacts.map((c) => (
              <option key={c.id} value={`@${c.username}`} />
            ))}
          </datalist>
        </div>

        <div>
          <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t.subject}</label>
          <TextInput
            className="mt-1.5"
            value={subject}
            maxLength={120}
            placeholder={t.subjectPh}
            onChange={(e) => setSubject(e.target.value)}
          />
        </div>

        <div>
          <TextArea
            rows={8}
            value={body}
            maxLength={4000}
            placeholder={t.emailBody}
            onChange={(e) => setBody(e.target.value)}
          />
        </div>

        {attachmentName ? (
          <div className="flex items-center gap-3 rounded-2xl pc-glass p-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-turquoise/20 text-turquoise">
              <IconFile className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{attachmentName}</p>
              {attachmentSize && <p className="text-xs text-muted-foreground">{Math.round(attachmentSize / 1024)}KB</p>}
            </div>
            <button onClick={() => { setAttachmentName(undefined); setAttachmentSize(undefined); }} className="pc-press text-destructive" aria-label={t.cancel}>
              <IconTrash className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => fileRef.current?.click()}
            className="pc-press flex items-center justify-center gap-2 rounded-2xl border border-dashed border-border py-3 text-sm font-medium text-muted-foreground"
          >
            <IconPaperclip className="h-4 w-4" />
            Attach file (max 10MB)
          </button>
        )}
        <input
          ref={fileRef}
          type="file"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) {
              if (f.size > 10 * 1024 * 1024) {
                pushToast("File too large (max 10MB)", "error");
                return;
              }
              setAttachmentName(f.name);
              setAttachmentSize(f.size);
            }
          }}
        />

        <Button variant="primary" className="mt-2 w-full py-3.5" onClick={send}>
          <IconSend className="h-5 w-5 rtl:rotate-180" />
          {t.send}
        </Button>
      </div>
    </Overlay>
  );
}
