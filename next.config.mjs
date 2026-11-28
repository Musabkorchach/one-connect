import { createRequire } from "node:module";
import { callIntegrationBuildSettings, callTestBuildSettings } from "./call-test-build.mjs";

const require = createRequire(import.meta.url);
const callTest = callTestBuildSettings(process.env);
const callIntegration = callIntegrationBuildSettings(process.env);

if (process.env.NEXT_PUBLIC_ONECONNECT_DEPLOYMENT === "production-review") {
  if (callTest || callIntegration) throw new Error("Production review cannot be combined with call test modes.");
  for (const name of ["NEXT_PUBLIC_ONECONNECT_API_URL", "NEXT_PUBLIC_ONECONNECT_WS_URL"]) {
    const value = process.env[name];
    let origin;
    try {
      origin = new URL(value);
    } catch {
      throw new Error(name + " must be an explicit HTTPS origin for Production review.");
    }
    if (origin.protocol !== "https:" || value !== origin.origin ||
        origin.hostname === "one-connect.onrender.com") {
      throw new Error(name + " must be the HTTPS origin of the isolated Production API.");
    }
  }
  if (process.env.NEXT_PUBLIC_ONECONNECT_API_URL !== process.env.NEXT_PUBLIC_ONECONNECT_WS_URL) {
    throw new Error("Production review requires the same HTTPS origin for API and Socket.IO.");
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  ...(callIntegration && {
    env: {
      NEXT_PUBLIC_CALL_INTEGRATION_MODE: "1",
      NEXT_PUBLIC_CALL_INTEGRATION_API_URL: callIntegration.api,
      NEXT_PUBLIC_CALL_INTEGRATION_WS_URL: callIntegration.socket,
    },
  }),
  ...(callTest && {
    generateBuildId: async () => callTest.build,
    async headers() {
      return [{ source: "/:path*", headers: [
        { key: "Content-Security-Policy", value: `connect-src 'self' ${callTest.api} ${callTest.socket}; frame-ancestors 'none'; object-src 'none'` },
        { key: "X-Robots-Tag", value: "noindex, nofollow" },
      ] }];
    },
  }),
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  webpack(config) {
    config.resolve.alias = {
      ...config.resolve.alias,
      "@twilio/voice-sdk$": require.resolve("@twilio/voice-sdk"),
    };
    return config;
  },
};

export default nextConfig;
