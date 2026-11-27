"use client";

import { useState, type FormEvent } from "react";
import type { LangId } from "@/lib/connect/data";
import {
  CallKeyError, callSafetyCode, getCallDevice, normalizeCallName, setCallPin, validCallName, validSafetyCode,
} from "@/lib/connect/call-identity";

export function CallSafetySettings({ username, testPeer, language }: { username: string; testPeer?: string; language?: LangId }) {
  const own = normalizeCallName(username);
  const [ownCode, setOwnCode] = useState("");
  const [peer, setPeer] = useState("");
  const [code, setCode] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function showCode() {
    setBusy(true);
    setOwnCode("");
    try {
      setOwnCode(await callSafetyCode((await getCallDevice(own, true)).publicKey));
      setMessage("");
    } catch (error) {
      const keyMissing = error instanceof CallKeyError && error.reason === "call-device-missing";
      setMessage(error instanceof CallKeyError && error.reason === "call-identity-unavailable"
        ? "Secure device identity is unavailable. Open One Connect directly over HTTPS in Pi Browser."
        : keyMissing
        ? "There is no call key on this device. Create one here, then verify its new code with the other person."
        : "Call key storage is blocked or unavailable. Allow site storage or close other One Connect tabs, then retry.");
    } finally {
      setBusy(false);
    }
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!confirmed) return;
    const name = normalizeCallName(testPeer ?? peer);
    const safetyCode = code.trim().toLowerCase();
    if (testPeer !== undefined) {
      if (!validCallName(own) || !validCallName(name) || own === name) {
        setMessage("Invalid test peer. Use the other test account for this device.");
        return;
      }
      if (safetyCode.length !== 64) {
        setMessage("Paste the other device’s full 64-character safety code.");
        return;
      }
      if (!validSafetyCode(safetyCode)) {
        setMessage("The safety code must contain only hexadecimal characters (0–9 and A–F).");
        return;
      }
    }
    try {
      setCallPin(own, name, safetyCode);
      setMessage(`Safety code saved for @${name} on this device.`);
      setCode("");
      setConfirmed(false);
    } catch {
      setMessage(testPeer !== undefined
        ? "Could not save the safety code in browser storage. Allow site storage and retry."
        : "Enter a valid Pi username and the full 64-character safety code. Make sure browser storage is available.");
    }
  }

  return (
    <section className="rounded-2xl pc-glass p-5 space-y-3" aria-labelledby="call-safety-title">
      <h3 id="call-safety-title" className="font-bold">{language === "ar" ? "رموز أمان المكالمات" : language === "fr" ? "Codes de sécurité des appels" : "Call safety codes"}</h3>
      <p className="text-sm text-muted-foreground">
        Both people must exchange their device codes in person or through a separate trusted channel
        before calling. Verify the new code again if either person changes devices.
      </p>
      <button type="button" disabled={busy} className="text-sm text-accent underline" onClick={() => void showCode()}>
        {language === "ar" ? "عرض رمز جهازي أو إنشاؤه" : language === "fr" ? "Afficher ou créer le code de mon appareil" : "Show or create my device code"}
      </button>
      {ownCode && <output className="block break-all select-all font-mono text-sm">{ownCode}</output>}
      <form className="space-y-3" onSubmit={save}>
        <label className="block text-sm">
          {testPeer === undefined ? "Other person's Pi username" : "Other test account"}
          <input required dir="ltr" className="mt-1 w-full rounded border bg-background p-2"
            value={testPeer ?? peer} readOnly={testPeer !== undefined}
            onChange={(event) => { setPeer(event.target.value); setConfirmed(false); }} />
        </label>
        <label className="block text-sm">
          {testPeer === undefined ? "Their device safety code" : `Device safety code from @${testPeer}`}
          <input required dir="ltr" className="mt-1 w-full rounded border bg-background p-2 font-mono" value={code}
            autoComplete="off" autoCapitalize="off" spellCheck={false}
            onChange={(event) => { setCode(event.target.value); setConfirmed(false); }} />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
          I checked this code with this person through a separate trusted channel.
        </label>
        <button type="submit" disabled={!confirmed} className="text-sm text-accent underline disabled:opacity-50">
          Save or replace safety code
        </button>
      </form>
      {message && <p role="status" className="text-sm">{message}</p>}
    </section>
  );
}
