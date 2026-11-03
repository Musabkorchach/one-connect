import twilio from "twilio";

const AccessToken = twilio.jwt.AccessToken;

export function createPstnAccessToken(config, identity) {
  if (!/^oc_[a-f0-9]{32}$/.test(identity)) {
    throw new Error("Invalid PSTN call identity");
  }

  const ttl = 300;

  const token = new AccessToken(
    config.accountSid,
    config.apiKeySid,
    config.apiKeySecret,
    {
      identity,
      ttl,
    },
  );

  token.addGrant(
    new AccessToken.VoiceGrant({
      incomingAllow: false,
      outgoingApplicationSid: config.applicationSid,
    }),
  );

  return {
    token: token.toJwt(),
    expiresAt: Date.now() + ttl * 1000,
  };
}