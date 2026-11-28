"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { LangId } from "@/lib/connect/data";
import {
  approveLinkedCallKey, type ChangedCallKey, CallKeyError, callSafetyCode, getCallDevice, getCallPin, getLinkedCallPin, normalizeCallName, setCallPin, validCallParties, validSafetyCode,
} from "@/lib/connect/call-identity";

export function CallSafetySettings({ username, testPeer, initialPeer, changedKey, language, accountLinked = false }: { username: string; testPeer?: string; initialPeer?: string; changedKey?: ChangedCallKey; language?: LangId; accountLinked?: boolean }) {
  const own = normalizeCallName(username);
  const [ownCode, setOwnCode] = useState("");
  const [peer, setPeer] = useState(initialPeer ?? "");
  const [code, setCode] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const [saved, setSaved] = useState<boolean | null>(null);
  const [linked, setLinked] = useState(false);
  const [storageBlocked, setStorageBlocked] = useState(false);
  const section = useRef<HTMLElement>(null);
  const [reviewingChange, setReviewingChange] = useState(false);
  const [changeResolved, setChangeResolved] = useState(false);
  const name = normalizeCallName(testPeer ?? peer);

  useEffect(() => {
    if (initialPeer) section.current?.focus();
  }, [initialPeer]);

  useEffect(() => {
    function readTrust() {
      try {
        const valid = validCallParties(own, name);
        setSaved(valid ? Boolean(getCallPin(own, name)) : null);
        setLinked(accountLinked && valid && Boolean(getLinkedCallPin(own, name)));
        setStorageBlocked(false);
      } catch {
        setSaved(null);
        setLinked(false);
        setStorageBlocked(true);
      }
    }
    readTrust();
    window.addEventListener("storage", readTrust);
    return () => window.removeEventListener("storage", readTrust);
  }, [own, name, accountLinked]);

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

  function acceptChange() {
    if (!changedKey || !reviewingChange || name !== initialPeer) return;
    try {
      approveLinkedCallKey(own, name, changedKey);
      setSaved(false);
      setLinked(true);
      setConfirmed(false);
      setCode("");
      setChangeResolved(true);
      setMessage(`The new device for @${name} is trusted through its Pi account. You can call again.`);
    } catch {
      setMessage("Could not update the saved device. Retry calling to review the current device.");
    }
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!confirmed) return;
    const safetyCode = code.trim().toLowerCase();
    if (!validCallParties(own, name)) {
      setMessage("Enter a valid Pi username for the other person.");
      return;
    }
    if (safetyCode.length !== 64) {
      setMessage("Paste the other device's full 64-character safety code.");
      return;
    }
    if (!validSafetyCode(safetyCode)) {
      setMessage("The safety code must contain only hexadecimal characters (0-9 and A-F).");
      return;
    }
    try {
      setCallPin(own, name, safetyCode);
      if (getCallPin(own, name) !== safetyCode) throw new Error("Trust was not saved.");
      setSaved(true);
      if (name === initialPeer) setChangeResolved(true);
      setStorageBlocked(false);
      setMessage(`Safety code saved for @${name} on this device.`);
      setCode("");
      setConfirmed(false);
    } catch {
      setMessage("Could not save the safety code in browser storage. Allow site storage and retry.");
    }
  }

  return (
    <section ref={section} tabIndex={-1} className="rounded-2xl pc-glass p-5 space-y-3" aria-labelledby="call-safety-title">
      <h3 id="call-safety-title" className="font-bold">{language === "ar" ? "رموز أمان المكالمات" : language === "fr" ? "Codes de sécurité des appels" : "Call safety codes"}</h3>
      <p className="text-sm text-muted-foreground">
        {accountLinked
          ? "One Connect links devices to signed-in Pi accounts. Comparing codes in person or through a separate trusted channel is optional and lets you verify a device independently of One Connect."
          : "Both people must exchange device codes in person or through a separate trusted channel before calling."}
        {" Saved trust applies to this account in this browser and site."}
      </p>
      <button type="button" disabled={busy} className="text-sm text-accent underline" onClick={() => void showCode()}>
        {language === "ar" ? "عرض رمز جهازي أو إنشاؤه" : language === "fr" ? "Afficher ou créer le code de mon appareil" : "Show or create my device code"}
      </button>
      {ownCode && <output className="block break-all select-all font-mono text-sm">{ownCode}</output>}
      {accountLinked && changedKey && !changeResolved && name === initialPeer && (
        <div className="space-y-2 rounded border p-3 text-sm">
          <p>The saved device for @{name} changed. You can compare codes below or trust the new device through its Pi account.</p>
          <label className="flex items-start gap-2">
            <input type="checkbox" checked={reviewingChange} onChange={(event) => setReviewingChange(event.target.checked)} />
            I want to replace the saved device using its Pi account link. Any previous safety code verification will be removed.
          </label>
          <button type="button" disabled={!reviewingChange} className="text-accent underline disabled:opacity-50" onClick={acceptChange}>
            Trust new account-linked device
          </button>
        </div>
      )}
      <form className="space-y-3" onSubmit={save}>
        <label className="block text-sm">
          {testPeer === undefined ? "Other person's Pi username" : "Other test account"}
          <input required dir="ltr" className="mt-1 w-full rounded border bg-background p-2"
            value={testPeer ?? peer} readOnly={testPeer !== undefined}
            onChange={(event) => { setPeer(event.target.value); setReviewingChange(false); setCode(""); setSaved(null); setLinked(false); setMessage(""); setConfirmed(false); }} />
        </label>
        {storageBlocked && <p role="status" className="text-sm">Browser storage is unavailable.</p>}
        {saved === true && <p className="text-sm">A safety code is saved for @{name} in this browser.</p>}
        {saved === false && <p className="text-sm">{linked
          ? `A device is linked to @${name} through One Connect. You have not compared its safety code.`
          : `No safety code is saved for @${name} in this browser.`}</p>}
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
          {saved ? "Replace saved safety code" : "Save safety code"}
        </button>
      </form>
      {message && <p role="status" className="text-sm">{message}</p>}
    </section>
  );
}
