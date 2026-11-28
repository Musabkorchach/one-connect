function validateCallOrigins(api, ws) {
  for (const value of [api, ws]) {
    const url = new URL(value);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (url.origin !== value || (!local && (url.protocol !== "https:" ||
        !/^oneconnect-verified-calls-api(?:-[a-z0-9]+)*\.onrender\.com$/.test(url.hostname))) ||
        (local && !["http:", "https:"].includes(url.protocol))) {
      throw new Error("Call test requires dedicated API and Socket.IO origins.");
    }
  }
  if (api !== ws) throw new Error("Call testing requires a common API and Socket.IO origin.");
}

export function callIntegrationBuildSettings(env) {
  if (!env.NEXT_PUBLIC_CALL_INTEGRATION_MODE) return null;
  if (env.NEXT_PUBLIC_CALL_INTEGRATION_MODE !== "1" || env.NEXT_PUBLIC_CALL_TEST_MODE) {
    throw new Error("Call integration mode cannot be combined with synthetic test mode.");
  }
  const api = env.NEXT_PUBLIC_CALL_INTEGRATION_API_URL;
  const socket = env.NEXT_PUBLIC_CALL_INTEGRATION_WS_URL;
  validateCallOrigins(api, socket);
  return { api, socket };
}

export function callTestBuildSettings(env) {
  if (!env.NEXT_PUBLIC_CALL_TEST_MODE) return null;
  if (env.NEXT_PUBLIC_CALL_TEST_MODE !== "1") throw new Error("Invalid call test mode.");
  const api = env.NEXT_PUBLIC_CALL_TEST_API_URL;
  const ws = env.NEXT_PUBLIC_CALL_TEST_WS_URL;
  validateCallOrigins(api, ws);
  const build = env.NEXT_PUBLIC_CALL_TEST_BUILD_ID;
  if (!/^[a-zA-Z0-9_-]{8,64}$/.test(build ?? "")) {
    throw new Error("Call test requires a build ID.");
  }
  return { api, socket: ws.replace(/^http/, "ws"), build };
}
