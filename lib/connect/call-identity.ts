const curve = { name: "ECDSA", namedCurve: "P-256" };
const algorithm = { name: "ECDSA", hash: "SHA-256" };
const hex = (bytes: ArrayBuffer) =>
  Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
const unhex = (value: string) => Uint8Array.from(value.match(/../g) ?? [], (byte) => parseInt(byte, 16));

export const normalizeCallName = (name: string) => name.trim().replace(/^@/, "").toLowerCase();
export const validCallName = (name: string) => /^[a-z0-9._-]{1,32}$/.test(name);
export const validSafetyCode = (code: string) => /^[a-f0-9]{64}$/.test(code);
export const newCallChallenge = () => hex(crypto.getRandomValues(new Uint8Array(16)).buffer);

export function validCallParties(own: string, peer: string) {
  return validCallName(own) && validCallName(peer) && own !== peer;
}

function pinKey(own: string, peer: string) {
  if (!validCallParties(own, peer)) throw new CallKeyError("call-identity-mismatch");
  return `oneconnect.call-peer.v1:${own}:${peer}`;
}

export function getCallPin(own: string, peer: string) {
  const key = pinKey(own, peer);
  let value: string | null;
  try { value = localStorage.getItem(key); } catch { throw storageError(); }
  return value && validSafetyCode(value) ? value : null;
}

export function setCallPin(own: string, peer: string, code: string) {
  if (!validSafetyCode(code)) throw new Error("Invalid safety code.");
  localStorage.setItem(pinKey(own, peer), code);
}

function linkedPinKey(own: string, peer: string) {
  return pinKey(own, peer).replace("call-peer.v1:", "call-linked-peer.v1:");
}

export interface ChangedCallKey { previous: string; code: string }

export function approveLinkedCallKey(own: string, peer: string, change: ChangedCallKey) {
  const manual = getCallPin(own, peer);
  const previous = manual ?? getLinkedCallPin(own, peer);
  if (previous !== change.previous || !validSafetyCode(change.code) || previous === change.code) {
    throw new CallKeyError("call-peer-key-mismatch");
  }
  localStorage.setItem(linkedPinKey(own, peer), change.code);
  if (manual) localStorage.removeItem(pinKey(own, peer));
}

export function getLinkedCallPin(own: string, peer: string) {
  const key = linkedPinKey(own, peer);
  try { return localStorage.getItem(key); } catch { throw storageError(); }
}

export function rememberLinkedCallPin(own: string, peer: string, code: string) {
  if (!validSafetyCode(code)) throw new CallKeyError("call-signature-invalid");
  const manual = getCallPin(own, peer);
  const previous = getLinkedCallPin(own, peer);
  if ((manual ?? previous ?? code) !== code) throw new CallKeyError("call-peer-key-mismatch");
  if (previous === code) return;
  const key = linkedPinKey(own, peer);
  try { localStorage.setItem(key, code); } catch { throw storageError(); }
}

export async function registeredKeyCode(publicKey: string) {
  if (!/^04[a-f0-9]{128}$/.test(publicKey)) throw new CallKeyError("call-signature-invalid");
  return hex(await crypto.subtle.digest("SHA-256", unhex(publicKey)));
}

export const rawCallKey = async (pair: CryptoKeyPair) => hex(await crypto.subtle.exportKey("raw", pair.publicKey));

export async function signCallFields(pair: CryptoKeyPair, fields: unknown[]) {
  try {
    return hex(await crypto.subtle.sign(algorithm, pair.privateKey, new TextEncoder().encode(JSON.stringify(fields))));
  } catch {
    throw new CallKeyError("call-identity-unavailable");
  }
}

export interface CallInvite { nonce: string; publicKey: string; signature: string }

export async function verifyCallInvite(invite: CallInvite | undefined, fields: string[]) {
  if (!invite || !/^[a-f0-9]{32}$/.test(invite.nonce) || !/^[a-f0-9]{128}$/.test(invite.signature)) {
    throw new CallKeyError("call-signature-invalid");
  }
  const code = await registeredKeyCode(invite.publicKey);
  try {
    const key = await crypto.subtle.importKey("raw", unhex(invite.publicKey), curve, false, ["verify"]);
    const bytes = new TextEncoder().encode(JSON.stringify(["oneconnect/call-invite/v1", fields[0], invite.nonce, ...fields.slice(1)]));
    if (await crypto.subtle.verify(algorithm, key, unhex(invite.signature), bytes)) return code;
  } catch {
    // Invalid key or proof.
  }
  throw new CallKeyError("call-signature-invalid");
}

export class CallKeyError extends Error {
  constructor(readonly reason: "call-storage-unavailable" | "call-device-missing" | "call-identity-unavailable"
    | "call-device-registration-failed" | "call-identity-mismatch" | "call-peer-untrusted" | "call-peer-key-mismatch" | "call-signature-invalid") {
    super(reason);
  }
}

const storageError = () => new CallKeyError("call-storage-unavailable");

export function openCallKeyStore(timeoutMs = 4000) {
  return new Promise<IDBDatabase>((resolve, reject) => {
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open("oneconnect-call-identity", 1);
    } catch {
      reject(storageError());
      return;
    }
    let failed = false;
    const fail = () => {
      failed = true;
      clearTimeout(timer);
      reject(storageError());
    };
    const timer = setTimeout(fail, timeoutMs);
    request.onblocked = fail;
    request.onerror = fail;
    request.onupgradeneeded = () => {
      if (failed) request.transaction?.abort();
      else request.result.createObjectStore("devices");
    };
    request.onsuccess = () => {
      clearTimeout(timer);
      if (failed) request.result.close();
      else resolve(request.result);
    };
  });
}

export async function getCallDevice(own: string, create = false): Promise<CryptoKeyPair> {
  if (!validCallName(own) || !globalThis.isSecureContext || !globalThis.crypto?.subtle) {
    throw new CallKeyError("call-identity-unavailable");
  }
  const db = await openCallKeyStore();
  try {
    const read = () => new Promise<CryptoKeyPair | undefined>((resolve, reject) => {
      const request = db.transaction("devices").objectStore("devices").get(own);
      const timer = setTimeout(() => reject(storageError()), 4000);
      request.onsuccess = () => { clearTimeout(timer); resolve(request.result); };
      request.onerror = () => { clearTimeout(timer); reject(request.error); };
    });
    const existing = await read();
    if (existing) return existing;
    if (!create) throw new CallKeyError("call-device-missing");
    let pair: CryptoKeyPair;
    try {
      pair = await crypto.subtle.generateKey(curve, false, ["sign", "verify"]);
      await callSafetyCode(pair.publicKey);
    } catch {
      throw new CallKeyError("call-identity-unavailable");
    }
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction("devices", "readwrite");
      const request = transaction.objectStore("devices").add(pair, own);
      request.onerror = (event) => {
        if (request.error?.name === "ConstraintError") event.preventDefault();
      };
      const timer = setTimeout(() => {
        try { transaction.abort(); } catch {}
        reject(storageError());
      }, 4000);
      transaction.oncomplete = () => { clearTimeout(timer); resolve(); };
      transaction.onabort = () => { clearTimeout(timer); reject(transaction.error); };
    });
    const stored = await read();
    if (!stored) throw new Error("Call identity could not be saved.");
    return stored;
  } catch (error) {
    if (error instanceof CallKeyError) throw error;
    throw storageError();
  } finally {
    db.close();
  }
}

export async function callSafetyCode(publicKey: CryptoKey) {
  return hex(await crypto.subtle.digest("SHA-256", await crypto.subtle.exportKey("raw", publicKey)));
}

export interface CallBinding {
  callId: string;
  challenge: string;
  caller: string;
  recipient: string;
  kind: "voice" | "video";
}

export interface SignedCallDescription {
  type: "offer" | "answer";
  sdp: string;
  publicKey: string;
  signature: string;
}

function signedBytes(binding: CallBinding, type: "offer" | "answer", sdp: string) {
  if (!/^[a-f0-9]{32}$/.test(binding.callId) || !/^[a-f0-9]{32}$/.test(binding.challenge) ||
      !validCallName(binding.caller) || !validCallName(binding.recipient) || binding.caller === binding.recipient ||
      !sdp || sdp.length > 100000) throw new Error("Invalid call binding.");
  return new TextEncoder().encode(JSON.stringify([
    "oneconnect/call-sdp/v1", binding.callId, binding.challenge,
    binding.caller, binding.recipient, binding.kind, type, sdp,
  ]));
}

export async function signCallDescription(
  pair: CryptoKeyPair, binding: CallBinding, type: "offer" | "answer", sdp: string,
): Promise<SignedCallDescription> {
  const signature = await crypto.subtle.sign(algorithm, pair.privateKey, signedBytes(binding, type, sdp));
  return { type, sdp, publicKey: hex(await crypto.subtle.exportKey("raw", pair.publicKey)), signature: hex(signature) };
}

export async function verifyCallDescription(
  value: SignedCallDescription, binding: CallBinding, type: "offer" | "answer", pin: string,
): Promise<RTCSessionDescriptionInit> {
  if (!validCallParties(binding.caller, binding.recipient)) throw new CallKeyError("call-identity-mismatch");
  if (value?.type !== type || typeof value.sdp !== "string" ||
      typeof value.publicKey !== "string" || !/^04[a-f0-9]{128}$/.test(value.publicKey) ||
      typeof value.signature !== "string" || !/^[a-f0-9]{128}$/.test(value.signature) ||
      !validSafetyCode(pin)) throw new CallKeyError("call-signature-invalid");
  let code: string;
  try {
    const key = await crypto.subtle.importKey("raw", unhex(value.publicKey), curve, true, ["verify"]);
    const valid = await crypto.subtle.verify(algorithm, key, unhex(value.signature), signedBytes(binding, type, value.sdp));
    if (!valid) throw new CallKeyError("call-signature-invalid");
    code = await callSafetyCode(key);
  } catch {
    throw new CallKeyError("call-signature-invalid");
  }
  if (code !== pin) throw new CallKeyError("call-peer-key-mismatch");
  return { type, sdp: value.sdp };
}
