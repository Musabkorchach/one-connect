"use client";

import { useEffect, useRef, useState } from "react";
import { usePiAuth } from "@/contexts/pi-auth-context";
import { fileToAvatar, LANGUAGES, type LangId, type Profile } from "@/lib/connect/data";
import { startPrivateDataSession, type PrivateContact } from "@/lib/account-private-data";
import { InvoicesPanel } from "./invoices-view";
import { AccountDeletionSettings } from "./account-deletion-settings";
import { AccountSubscriptionStatus } from "./account-subscription-status";

export function AccountPrivateDataView({ sessionToken }: { sessionToken: string }) {
  const { isCurrentSession, endLocalSession, piUsername } = usePiAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [contacts, setContacts] = useState<PrivateContact[] | null>(null);
  const [tab, setTab] = useState<"profile" | "contacts" | "invoices">("profile");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const editing = useRef(false);
  const [contactName, setContactName] = useState("");
  const [contactUsername, setContactUsername] = useState("");
  const resource = useRef<ReturnType<typeof startPrivateDataSession> | null>(null);
  useEffect(() => {
    const session = startPrivateDataSession({
      sessionToken, isCurrent: () => isCurrentSession(sessionToken),
      onProfile: setProfile, onContacts: setContacts, onError: setNotice,
    });
    resource.current = session;
    return () => { session.close(); resource.current = null; };
  }, [sessionToken, isCurrentSession]);

  async function submit(action: (session: ReturnType<typeof startPrivateDataSession>) => Promise<boolean>) {
    const session = resource.current;
    if (!session?.current() || editing.current) return false;
    editing.current = true;
    setBusy(true);
    setNotice("");
    try { return await action(session); }
    finally {
      editing.current = false;
      if (session.current()) setBusy(false);
    }
  }
  return (
    <main className="mx-auto max-w-md space-y-4 p-4">
      <header className="flex justify-between">
        <h1 className="text-xl font-semibold">Private data</h1>
        <button className="underline" type="button" onClick={() => endLocalSession(profile?.language ?? "en")}>Sign out</button>
      </header>
      <p className="text-sm text-muted-foreground">ACCOUNT_MIGRATION_REQUIRED — Older private data requires migration.</p>
      <nav className="flex gap-4" aria-label="Private data">
        {([["profile", "Profile"], ["contacts", "Contacts"], ["invoices", "Invoices"]] as const).map(([id, label]) => (
          <button key={id} type="button" aria-pressed={tab === id} onClick={() => setTab(id)}>{label}</button>
        ))}
      </nav>
      {notice && <p role="alert">{notice}</p>}
      {tab === "profile" && profile && (
        <form className="space-y-3" onSubmit={(event) => {
          event.preventDefault();
          const { displayName, avatar, language, status, statusText } = profile;
          void submit((session) => session.saveProfile({ displayName, avatar, language, status, statusText }));
        }}>
          <p>@{piUsername}</p>
          {profile.avatar && <img className="h-20 w-20 rounded-full object-cover" alt="Profile photo" src={profile.avatar} />}
          <label className="block">Profile photo
            <input type="file" accept="image/*" disabled={busy} onChange={(event) => {
              const file = event.target.files?.[0];
              const session = resource.current;
              if (!file || !session) return;
              void fileToAvatar(file).then(
                (avatar) => { if (session.current()) setProfile((value) => value && { ...value, avatar }); },
                () => { if (session.current()) setNotice("Could not load the photo."); },
              );
            }} />
          </label>
          {profile.avatar && <button type="button" className="underline"
            onClick={() => setProfile({ ...profile, avatar: null })}>Remove photo</button>}
          <label className="block">Display name
            <input className="block rounded border bg-background p-2" maxLength={80} value={profile.displayName}
              onChange={(event) => setProfile({ ...profile, displayName: event.target.value })} />
          </label>
          <label className="block">Language
            <select className="block rounded border bg-background p-2" value={profile.language}
              onChange={(event) => setProfile({ ...profile, language: event.target.value as LangId })}>
              {LANGUAGES.map((language) => <option key={language.id} value={language.id}>{language.label}</option>)}
            </select>
          </label>
          <label className="block">Status
            <select className="block rounded border bg-background p-2" value={profile.status}
              onChange={(event) => setProfile({ ...profile, status: event.target.value as Profile["status"] })}>
              {["available", "away", "busy", "offline"].map((value) => <option key={value}>{value}</option>)}
            </select>
          </label>
          <label className="block">Status text
            <input className="block rounded border bg-background p-2" value={profile.statusText} maxLength={100}
              onChange={(event) => setProfile({ ...profile, statusText: event.target.value })} />
          </label>
          <button type="submit" disabled={busy} className="underline">Save profile</button>
        </form>
      )}
      {tab === "contacts" && contacts && (
        <>
          <form className="space-y-2" onSubmit={(event) => {
            event.preventDefault();
            const target = contactUsername.trim();
            if (target) void submit((session) => session.addContact(target, contactName.trim())).then((ok) => {
              if (ok) { setContactUsername(""); setContactName(""); }
            });
          }}>
            <input aria-label="Pi username" maxLength={33} value={contactUsername} className="block rounded border bg-background p-2"
              onChange={(event) => setContactUsername(event.target.value)} />
            <input aria-label="Contact name" maxLength={80} value={contactName} className="block rounded border bg-background p-2"
              onChange={(event) => setContactName(event.target.value)} />
            <button type="submit" disabled={busy || !contactUsername.trim()} className="underline">Add contact</button>
          </form>
          <ul className="space-y-2">{contacts.map((contact) => <li key={contact.id} className="rounded bg-card p-3">
            {contact.name}{contact.state === "active" && contact.username && <span className="ms-2">@{contact.username}</span>}
          </li>)}</ul>
        </>
      )}
      {tab === "invoices" && <InvoicesPanel language={profile?.language ?? "en"} />}
      {tab === "profile" && <AccountSubscriptionStatus sessionToken={sessionToken} language={profile?.language ?? "en"} />}
      {tab === "profile" && <AccountDeletionSettings sessionToken={sessionToken} language={profile?.language ?? "en"} />}
    </main>
  );
}
