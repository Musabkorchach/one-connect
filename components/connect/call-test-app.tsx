"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { API_URL, callTestBuildId, disconnectSocket, getSocket, initSocket, onCallEvent,
  sendCallEvent, VERIFIED_CALL_PROTOCOL } from "@/lib/api-client";
import { newCallChallenge } from "@/lib/connect/call-identity";
import { CallSession } from "@/lib/connect/call-session";
import type { CallIceStatistics } from "@/lib/connect/call-ice-statistics";
import { useCallRingtone } from "@/lib/connect/use-call-ringtone";
import { CallSafetySettings } from "./call-safety-settings";
import { CallStream } from "@/lib/connect/call-stream";

const testUsers = ["calltest-a", "calltest-b"] as const;
const callErrors: Record<string, string> = {
  "call-update-required": "Update or reload both test devices.",
  "call-device-missing": "Create a device key and verify its code before retrying.",
  "call-storage-unavailable": "Call key storage is unavailable. Allow site storage and retry.",
  "verification-failed": "Verification failed. Compare both safety codes.",
  "media-error": "Check microphone and camera permissions.",
};

export function CallTestApp() {
  const [user, setUser] = useState<string>(testUsers[0]);
  const [secret, setSecret] = useState("");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [relayOnly, setRelayOnly] = useState(false);
  const [phase, setPhase] = useState("Idle");
  const [status, setStatus] = useState("");
  const [local, setLocal] = useState<MediaStream | null>(null);
  const [remote, setRemote] = useState<MediaStream | null>(null);
  const [muted, setMuted] = useState(false);
  const [ice, setIce] = useState<
    { phase: "idle" | "loading" } | { phase: "error"; message: string } |
    { phase: "ready"; stats: CallIceStatistics }
  >({ phase: "idle" });
  const active = useRef<CallSession | null>(null);
  const peer = testUsers.find((name) => name !== user)!;
  const { ringtoneBlocked, enableRingtone } = useCallRingtone(phase === "Incoming");

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setStatus("");
    try {
      const health = await fetch(`${API_URL}/health`, { cache: "no-store" });
      const expected = await health.json();
      if (!health.ok || expected.mode !== "call-test" || expected.build !== callTestBuildId ||
          expected.protocol !== VERIFIED_CALL_PROTOCOL) throw new Error("Test backend build mismatch.");
      const response = await fetch(`${API_URL}/api/call-test/login`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user, code: secret, build: callTestBuildId }),
      });
      if (!response.ok) throw new Error("Test login rejected.");
      const result = await response.json();
      if (result.username !== user || result.build !== callTestBuildId ||
          !/^calltest_[a-f0-9]{64}$/.test(result.sessionToken)) throw new Error("Invalid test session.");
      setToken(result.sessionToken);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Test login failed.");
    } finally {
      setSecret("");
      setBusy(false);
    }
  }

  function makeCall(callId: string, kind: "voice" | "video", direction: "incoming" | "outgoing") {
    if (active.current) return;
    setStatus("");
    setIce({ phase: "idle" });
    setMuted(false);
    setPhase(direction === "incoming" ? "Incoming" : "Preparing");
    const session = new CallSession({
      callId, kind, direction, ownUsername: user, username: peer, configuration: {}, relayOnly,
      onRinging: () => setPhase("Ringing"),
      onConnecting: () => setPhase("Connecting"),
      onConnected: () => setPhase("Peer device verified"),
      onLocalStream: setLocal,
      onRemoteStream: setRemote,
      onEnd(reason) {
        if (active.current !== session) return;
        active.current = null;
        setLocal(null);
        setRemote(null);
        setIce({ phase: "idle" });
        setPhase("Idle");
        setStatus(callErrors[reason] ?? reason);
      },
    });
    active.current = session;
    if (direction === "outgoing") void session.start().catch(() => {});
  }

  const runtime = useRef({ makeCall, peer });
  runtime.current = { makeCall, peer };
  useEffect(() => {
    if (!token) return;
    const stopIncoming = onCallEvent("call:incoming", (event) => {
      if (!event || !/^[a-f0-9]{32}$/.test(event.callId) ||
          event.from !== runtime.current.peer || !["voice", "video"].includes(event.kind)) return;
      if (event.protocol !== VERIFIED_CALL_PROTOCOL || active.current) {
        sendCallEvent("call:end", { callId: event.callId });
        if (event.protocol !== VERIFIED_CALL_PROTOCOL) setStatus(callErrors["call-update-required"]);
        return;
      }
      runtime.current.makeCall(event.callId, event.kind, "incoming");
    });
    const stopUpdate = onCallEvent("call:update-required", () => setStatus(callErrors["call-update-required"]));
    const socket = initSocket(user, user, token);
    socket.on("connect_error", () => setStatus("Unable to connect to test signaling. Check the build and test origin."));
    return () => {
      stopIncoming();
      stopUpdate();
      active.current?.end();
      disconnectSocket();
    };
  }, [token, user]);

  async function logout() {
    active.current?.end();
    const previous = token;
    setToken("");
    await fetch(`${API_URL}/api/auth/logout`, {
      method: "POST", headers: { Authorization: `Bearer ${previous}` },
    }).catch(() => {});
  }

  async function inspectIce() {
    const session = active.current;
    if (!session || ice.phase === "loading") return;
    setIce({ phase: "loading" });
    try {
      const stats = await session.selectedIcePair();
      if (active.current !== session) return;
      setIce(stats ? { phase: "ready", stats } : {
        phase: "error", message: "The browser did not report an unambiguous ICE pair. Retry while connected.",
      });
    } catch (error) {
      if (active.current !== session) return;
      setIce({ phase: "error", message: error instanceof Error && error.message === "ice-statistics-timeout"
        ? "Reading ICE statistics timed out. Try again."
        : "The browser could not read ICE statistics. Try again." });
    }
  }

  const button = "rounded border px-3 py-2 disabled:opacity-50";
  return (
    <main className="mx-auto max-w-lg space-y-4 p-4">
      <h1 className="text-xl font-bold">One Connect call test</h1>
      <p className="text-sm">Build {callTestBuildId}</p>
      {!token ? (
        <form onSubmit={(event) => void login(event)} className="space-y-3">
          <label className="block">Test account <select value={user} disabled={busy}
            onChange={(event) => setUser(event.target.value)} className="bg-background">
            {testUsers.map((name) => <option key={name}>{name}</option>)}
          </select></label>
          <label className="block">Test code <input className="rounded border bg-background p-2" required
            type="password" autoComplete="off" disabled={busy} value={secret}
            onChange={(event) => setSecret(event.target.value)} /></label>
          <button className={button} disabled={busy}>Connect</button>
        </form>
      ) : <>
        <p>{user} → {peer}</p>
        <CallSafetySettings key={user} username={user} testPeer={peer} />
        <label className="block"><input type="checkbox" checked={relayOnly} disabled={phase !== "Idle"}
          onChange={(event) => setRelayOnly(event.target.checked)} /> Force TURN relay</label>
        <div className="flex flex-wrap gap-2">
          {(["voice", "video"] as const).map((kind) => <button key={kind} className={button} disabled={phase !== "Idle"}
            onClick={() => getSocket()?.connected ? makeCall(newCallChallenge(), kind, "outgoing")
              : setStatus("Test signaling is not connected.")}>{kind === "voice" ? "Voice call" : "Video call"}</button>)}
          {phase === "Incoming" && <button className={button} onClick={() => {
            setPhase("Preparing");
            void active.current?.start().catch(() => {});
          }}>Accept</button>}
          {ringtoneBlocked && <button className={button} onClick={() => void enableRingtone()}>Enable ringtone</button>}
          {phase !== "Idle" && <button className={button} onClick={() => active.current?.end()}>End call</button>}
          {phase === "Peer device verified" && <>
            <button className={button} onClick={() => {
              active.current?.setMuted(!muted);
              setMuted(!muted);
            }}>{muted ? "Unmute" : "Mute"}</button>
            {Boolean(local?.getVideoTracks().length) && <button className={button} onClick={() => {
              void active.current?.switchCamera().catch(() => setStatus("Camera switching failed."));
            }}>Switch camera</button>}
          </>}
          <button className={button} onClick={() => void logout()}>Sign out</button>
        </div>
        {phase === "Peer device verified" && <section className="space-y-2 rounded border p-3">
          <button type="button" className={button} disabled={ice.phase === "loading"}
            onClick={() => void inspectIce()}>Read ICE statistics</button>
          <div aria-live="polite" aria-busy={ice.phase === "loading"} className="text-sm">
            {ice.phase === "loading" && <p>Reading ICE statistics…</p>}
            {ice.phase === "error" && <p>{ice.message}</p>}
            {ice.phase === "ready" && <>
              <p>{ice.stats.source === "selected" ? "Selected ICE pair" : "Nominated ICE pair (selection unconfirmed)"}</p>
              <dl className="grid grid-cols-2 gap-x-2">
                <dt>Connection</dt><dd>{ice.stats.connectionState}</dd>
                <dt>Local candidate</dt><dd>{ice.stats.local ?? "Unavailable"}</dd>
                <dt>Remote candidate</dt><dd>{ice.stats.remote ?? "Unavailable"}</dd>
                <dt>Bytes sent</dt><dd>{ice.stats.bytesSent?.toLocaleString() ?? "Unavailable"}</dd>
                <dt>Bytes received</dt><dd>{ice.stats.bytesReceived?.toLocaleString() ?? "Unavailable"}</dd>
              </dl>
            </>}
          </div>
        </section>}
        <p role="status">{phase}</p>
        {remote && <CallStream stream={remote} playbackLabel="Play remote media" />}
        {local && <CallStream stream={local} muted playbackLabel="Play local preview" />}
      </>}
      {status && <p role="status">{status}</p>}
    </main>
  );
}
