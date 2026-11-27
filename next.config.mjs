import { createRequire } from "node:module";
import { callIntegrationBuildSettings, callTestBuildSettings } from "./call-test-build.mjs";

const require = createRequire(import.meta.url);
const callTest = callTestBuildSettings(process.env);
const callIntegration = callIntegrationBuildSettings(process.env);

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
