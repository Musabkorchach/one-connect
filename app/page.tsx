"use client";

import { useState } from "react";
import Link from "next/link";
import { AccountPrivateDataView } from "@/components/connect/account-private-data-view";
import { AccountGroupsView } from "@/components/connect/account-groups-view";
import { AccountPrivateChat } from "@/components/connect/account-private-chat";
import { AccountEmailsView } from "@/components/connect/account-emails-view";
import { AccountPeerCalls, type StartPeerCall } from "@/components/connect/account-peer-calls";
import { ConnectApp } from "@/components/connect/connect-app";
import { CallTestApp } from "@/components/connect/call-test-app";
import { CallSafetySettings } from "@/components/connect/call-safety-settings";

import { usePiAuth } from "@/contexts/pi-auth-context";

export default function HomePage() {
  if (process.env.NEXT_PUBLIC_CALL_TEST_MODE === "1") return <CallTestApp />;
  return <OneConnectHome />;
}

function OneConnectHome() {
  const { accountMigrationRequired, privateDataOwner, emailSocketMode, chatSocketMode, groupSocketMode, sessionToken, piUsername, endLocalSession } = usePiAuth();
  if ((chatSocketMode === "account" || groupSocketMode === "account" || privateDataOwner) && sessionToken) {
    return <AccountCommunication key={sessionToken} sessionToken={sessionToken} username={piUsername} emailEnabled={emailSocketMode === "account"} chatEnabled={chatSocketMode === "account"} groupsEnabled={groupSocketMode === "account"} privateDataEnabled={Boolean(privateDataOwner)} />;
  }
  if (emailSocketMode === "account" && sessionToken) {
    return <AccountEmailsView key={sessionToken} sessionToken={sessionToken} username={piUsername} />;
  }
  if (accountMigrationRequired) {
    return (
      <main className="mx-auto max-w-md space-y-4 p-6">
        <h1 className="text-xl font-semibold">Account migration required</h1>
        <p role="status">History and other account data for {piUsername} require migration before they can be accessed.</p>
        <button type="button" className="underline" onClick={() => endLocalSession("en")}>
          Sign out
        </button>
      </main>
    );
  }
  return <ConnectApp key={sessionToken ?? "legacy"} />;
}

function AccountCommunication({ sessionToken, username, emailEnabled, chatEnabled, groupsEnabled, privateDataEnabled }: {
  sessionToken: string; username: string; emailEnabled: boolean; chatEnabled: boolean; groupsEnabled: boolean; privateDataEnabled: boolean;
}) {
  const [view, setView] = useState<"chat" | "email" | "groups" | "private">(chatEnabled ? "chat" : groupsEnabled ? "groups" : "private");
  const content = (startCall?: StartPeerCall) => (
    <>
      {process.env.NEXT_PUBLIC_ONECONNECT_DEPLOYMENT === "production-review" && (
        <>
          <header className="mx-auto flex max-w-md items-center justify-between px-4 pt-4">
            <span className="font-semibold">One Connect</span>
            <span className="text-sm text-muted-foreground">@{username.replace(/^@/, "")}</span>
          </header>
          <details className="mx-auto max-w-md px-4 py-2">
            <summary>Call safety and policies</summary>
            <CallSafetySettings key={username} username={username} />
            <div className="flex gap-4 py-2 text-sm">
              <Link href="/privacy" className="underline">Privacy policy</Link>
              <Link href="/terms" className="underline">Terms of use</Link>
            </div>
          </details>
        </>
      )}
      {(emailEnabled || privateDataEnabled || (chatEnabled && groupsEnabled)) && (
        <nav className="mx-auto flex max-w-md gap-4 px-4 pt-4" aria-label="Account communication">
          {chatEnabled && <button type="button" aria-pressed={view === "chat"} onClick={() => setView("chat")}>Chats</button>}
          {groupsEnabled && <button type="button" aria-pressed={view === "groups"} onClick={() => setView("groups")}>Groups</button>}
          {privateDataEnabled && <button type="button" aria-pressed={view === "private"} onClick={() => setView("private")}>Private data</button>}
          {emailEnabled && <button type="button" aria-pressed={view === "email"} onClick={() => setView("email")}>Email</button>}
        </nav>
      )}
      {privateDataEnabled && view === "private" ? <AccountPrivateDataView sessionToken={sessionToken} />
        : groupsEnabled && view === "groups" ? <AccountGroupsView sessionToken={sessionToken} /> : emailEnabled && view === "email"
        ? <AccountEmailsView sessionToken={sessionToken} username={username} />
        : <AccountPrivateChat sessionToken={sessionToken} username={username} startCall={startCall} />}
    </>
  );
  return process.env.NEXT_PUBLIC_ONECONNECT_DEPLOYMENT === "production-review"
    ? <AccountPeerCalls sessionToken={sessionToken} username={username}>{content}</AccountPeerCalls>
    : content();
}
