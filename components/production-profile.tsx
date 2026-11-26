"use client";

import Script from "next/script";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { io } from "socket.io-client";
import { API_URL, WS_URL } from "@/lib/api-client";
import { PI_NETWORK_CONFIG } from "@/lib/system-config";

type Profile = { username: string; status: string };
type Session = Profile & { sessionToken: string };

async function request(path: string, init: RequestInit, sessionToken?: string) {
  const headers = new Headers(init.headers);
  if (init.body) headers.set("Content-Type", "application/json");
  if (sessionToken) headers.set("Authorization", "Bearer " + sessionToken);
  const response = await fetch(API_URL + "/api/production" + path, { ...init, headers });
  if (!response.ok) throw new Error(response.status === 401 ? "Pi sign-in or session was rejected." : "One Connect is unavailable.");
  return response;
}

export function ProductionProfile() {
  const [sdkReady, setSdkReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState("");
  const [message, setMessage] = useState("");
  const [live, setLive] = useState(false);
  const [busy, setBusy] = useState(false);
  const sdkInitialized = useRef(false);
  const sessionToken = session?.sessionToken;

  useEffect(() => {
    if (!sessionToken) return;
    const socket = io(WS_URL, { path: "/production/socket.io", auth: { sessionToken } });
    const onProfile = (profile: Profile) => {
      setSession(current => current?.sessionToken === sessionToken ? { ...current, ...profile } : current);
    };
    socket.on("connect", () => setLive(true));
    socket.on("disconnect", () => setLive(false));
    socket.on("connect_error", () => setLive(false));
    socket.on("profile:updated", onProfile);
    return () => {
      socket.disconnect();
    };
  }, [sessionToken]);

  async function signIn() {
    setBusy(true);
    setMessage("");
    try {
      if (!sdkInitialized.current) {
        await window.Pi.init({ version: "2.0", sandbox: false });
        sdkInitialized.current = true;
      }
      const { accessToken } = await window.Pi.authenticate(["username"], () => {});
      const response = await request("/auth", { method: "POST", body: JSON.stringify({ accessToken }) });
      const signedIn: Session = await response.json();
      setSession(signedIn);
      setStatus(signedIn.status);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to sign in.");
    } finally {
      setBusy(false);
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!sessionToken) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await request("/profile", { method: "PUT", body: JSON.stringify({ status }) }, sessionToken);
      const profile: Profile = await response.json();
      setSession(current => current?.sessionToken === sessionToken ? { ...current, ...profile } : current);
      setStatus(profile.status);
      setMessage("Status saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save.");
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    if (!sessionToken) return;
    setBusy(true);
    try {
      await request("/logout", { method: "POST" }, sessionToken);
      setSession(null);
      setStatus("");
      setLive(false);
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to sign out.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-lg space-y-5 px-6 py-16">
      <Script src={PI_NETWORK_CONFIG.SDK_URL} onReady={() => setSdkReady(true)}
        onError={() => setMessage("Pi SDK could not load.")} />
      <h1 className="text-3xl font-semibold">One Connect</h1>
      {session ? (
        <section className="space-y-4" aria-label="Your One Connect profile">
          <h2 className="text-xl font-medium">@{session.username.replace(/^@/, "")}</h2>
          <p className="text-sm text-muted-foreground">{live ? "Live updates connected" : "Live updates disconnected"}</p>
          {session.status && <p>{session.status}</p>}
          <form onSubmit={save} className="space-y-3">
            <label htmlFor="profile-status" className="block">Status message</label>
            <input id="profile-status" className="w-full rounded-md border border-border bg-background p-2"
              maxLength={140} value={status} onChange={event => setStatus(event.target.value)} />
            <button className="rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50" disabled={busy}>Save status</button>
          </form>
          <button type="button" onClick={() => void signOut()} disabled={busy} className="underline">Sign out</button>
        </section>
      ) : (
        <button type="button" onClick={() => void signIn()} disabled={!sdkReady || busy}
          className="rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50">
          {busy ? "Signing in…" : "Sign in with Pi"}
        </button>
      )}
      {message && <p role="status">{message}</p>}
    </main>
  );
}
