export const VERIFIED_CALL_PROTOCOL = 1;

export function selectVerifiedCallSockets(legacyEvent, protocol, callerVersion, recipients) {
  if (legacyEvent || protocol !== VERIFIED_CALL_PROTOCOL || callerVersion !== VERIFIED_CALL_PROTOCOL) return null;
  return recipients.filter((socket) => socket.handshake.auth?.verifiedCallProtocol === VERIFIED_CALL_PROTOCOL);
}
