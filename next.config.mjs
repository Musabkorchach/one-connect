import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

if (process.env.NEXT_PUBLIC_ONECONNECT_DEPLOYMENT === "production-review") {
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
}

/** @type {import('next').NextConfig} */
const nextConfig = {
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
