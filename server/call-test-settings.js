import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const callTestUsers = ["calltest-a", "calltest-b"];
const events = new Set([
  "call:initiate", "call:verified-initiate", "call:accept", "call:offer",
  "call:answer", "call:ice-candidate", "call:connected", "call:end",
]);

export const allowsCallTestEvent = (event) => events.has(event);
export const allowsCallTestRoute = (method, path) =>
  (method === "GET" && (path === "/health" || path === "/api/calls/ice-servers")) ||
  (method === "POST" && (path === "/api/call-test/login" || path === "/api/auth/logout"));

function testFrontendSettings(origin) {
  const url = new URL(origin);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.origin !== origin || (!local && (url.protocol !== "https:" ||
      !/^oneconnect-verified-calls-ui(?:-[a-z0-9]+)*\.onrender\.com$/.test(url.hostname))) ||
      (local && !["http:", "https:"].includes(url.protocol))) {
    throw new Error("Call testing requires an approved, dedicated frontend origin.");
  }
  return { origin, local, acceptsOrigin: (value) => value === origin };
}

export function callIntegrationSettings(env, testEntry) {
  if (!env.ONECONNECT_CALL_INTEGRATION) return null;
  if (env.ONECONNECT_CALL_INTEGRATION !== "1" || testEntry || env.ONECONNECT_CALL_TEST ||
      env.MONGODB_URI != null || env.CALL_TEST_CODE_A != null || env.CALL_TEST_CODE_B != null) {
    throw new Error("Call integration requires the normal entry point and isolated settings.");
  }
  const database = env.CALL_TEST_DATABASE ?? "";
  const uri = env.CALL_TEST_MONGODB_URI ?? "";
  if (!/^oneconnect_call_test_[a-z0-9]{6,24}$/.test(database) || !/^mongodb(?:\+srv)?:\/\//.test(uri)) {
    throw new Error("Call integration requires a dedicated MongoDB URI and database name.");
  }
  return { ...testFrontendSettings(env.CALL_TEST_FRONTEND_ORIGIN), database, uri };
}

export function callTestSettings(env, testEntry) {
  if (!testEntry && !env.ONECONNECT_CALL_TEST) return null;
  if (!testEntry || env.ONECONNECT_CALL_TEST !== "1" || env.MONGODB_URI != null) {
    throw new Error("Call test requires its dedicated entry point and must not have MONGODB_URI.");
  }
  const uri = env.CALL_TEST_MONGODB_URI ?? "";
  const database = env.CALL_TEST_DATABASE ?? "";
  const build = env.CALL_TEST_BUILD_ID ?? "";
  const frontend = testFrontendSettings(env.CALL_TEST_FRONTEND_ORIGIN);
  if (!/^oneconnect_call_test_[a-z0-9]{6,24}$/.test(database) ||
      !/^mongodb(?:\+srv)?:\/\//.test(uri) || !/^[a-zA-Z0-9_-]{8,64}$/.test(build)) {
    throw new Error("Call test requires a dedicated database URI, database name and build ID.");
  }
  if (!frontend.local && (!/^[a-f0-9]{32}$/i.test(env.CLOUDFLARE_TURN_TOKEN_ID ?? "") ||
      !env.CLOUDFLARE_TURN_API_TOKEN?.trim())) {
    throw new Error("Hosted call test requires dedicated Cloudflare TURN credentials.");
  }
  const a = env.CALL_TEST_CODE_A ?? "";
  const b = env.CALL_TEST_CODE_B ?? "";
  if (![a, b].every((code) => /^[A-Za-z0-9_-]{43,128}$/.test(code)) || a === b) {
    throw new Error("Set two distinct, randomly generated call test codes.");
  }
  const digest = (value) => createHash("sha256").update(value).digest();
  const codes = new Map([[callTestUsers[0], digest(a)], [callTestUsers[1], digest(b)]]);
  return {
    ...frontend, uri, database, build,
    login(user, code, requestedBuild) {
      const expected = codes.get(user);
      if (requestedBuild !== build || !expected || typeof code !== "string" ||
          code.length > 128 || !timingSafeEqual(digest(code), expected)) return null;
      return {
        token: `calltest_${randomBytes(32).toString("hex")}`,
        session: { userId: user, piUsername: user, expiresAt: Date.now() + 2 * 60 * 60 * 1000 },
      };
    },
  };
}
