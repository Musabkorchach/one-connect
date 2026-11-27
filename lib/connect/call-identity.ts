const curve = { name: "ECDSA", namedCurve: "P-256" };
const algorithm = { name: "ECDSA", hash: "SHA-256" };
const hex = (bytes: ArrayBuffer) =>
  Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
const unhex = (value: string) => Uint8Array.from(value.match(/../g) ?? [], (byte) => parseInt(byte, 16));

export const normalizeCallName = (name: string) => name.trim().replace(/^@/, "").toLowerCase();
export const validCallName = (name: string) => /^[a-z0-9._-]{1,32}$/.test(name);
export const validSafetyCode = (code: string) => /^[a-f0-9]{64}$/.test(code);
export const newCallChallenge = () => hex(crypto.getRandomValues(new Uint8Array(16)).buffer);

function pinKey(own: string, peer: string) {
  if (!validCallName(own) || !validCallName(peer) || own === peer) throw new Error("Invalid call identity.");
  return `oneconnect.call-peer.v1:${own}:${peer}`;
}

export function getCallPin(own: string, peer: string) {
  const value = localStorage.getItem(pinKey(own, peer));
  return value && validSafetyCode(value) ? value : null;
}

export function setCallPin(own: string, peer: string, code: string) {
  if (!validSafetyCode(code)) throw new Error("Invalid safety code.");
  localStorage.setItem(pinKey(own, peer), code);
}

export class CallKeyError extends Error {
  constructor(readonly reason: "call-storage-unavailable" | "call-device-missing") {
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
  if (!validCallName(own) || !globalThis.isSecureContext) throw new Error("Secure call identity unavailable.");
  const db = await openCallKeyStore();
  try {
    const read = () => new Promise<CryptoKeyPair | undefined>((resolve, reject) => {
      const request = db.transaction("devices").objectStore("devices").get(own);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const existing = await read();
    if (existing) return existing;
    if (!create) throw new CallKeyError("call-device-missing");
    const pair = await crypto.subtle.generateKey(curve, false, ["sign", "verify"]);
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction("devices", "readwrite");
      const request = transaction.objectStore("devices").add(pair, own);
      request.onerror = (event) => {
        if (request.error?.name === "ConstraintError") event.preventDefault();
      };
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error);
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
  if (value?.type !== type || typeof value.sdp !== "string" ||
      typeof value.publicKey !== "string" || !/^04[a-f0-9]{128}$/.test(value.publicKey) ||
      typeof value.signature !== "string" || !/^[a-f0-9]{128}$/.test(value.signature) ||
      !validSafetyCode(pin)) throw new Error("Invalid signed call description.");
  const key = await crypto.subtle.importKey("raw", unhex(value.publicKey), curve, true, ["verify"]);
  if (await callSafetyCode(key) !== pin ||
      !await crypto.subtle.verify(algorithm, key, unhex(value.signature), signedBytes(binding, type, value.sdp))) {
    throw new Error("Call identity verification failed.");
  }
  return { type, sdp: value.sdp };
}
