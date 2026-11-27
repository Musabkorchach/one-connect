export const VERIFIED_CALL_PROTOCOL = 1;

export function validCallProof(description) {
  return typeof description?.publicKey === "string" && /^04[a-f0-9]{128}$/.test(description.publicKey) &&
    typeof description.signature === "string" && /^[a-f0-9]{128}$/.test(description.signature);
}

export function selectVerifiedCallSockets(legacyEvent, protocol, callerVersion, recipients) {
  if (legacyEvent || protocol !== VERIFIED_CALL_PROTOCOL || callerVersion !== VERIFIED_CALL_PROTOCOL) return null;
  return recipients.filter((socket) => socket.handshake.auth?.verifiedCallProtocol === VERIFIED_CALL_PROTOCOL);
}
