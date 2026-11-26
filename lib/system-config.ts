export const PI_NETWORK_CONFIG = {
  PRODUCTION_REVIEW: process.env.NEXT_PUBLIC_ONECONNECT_DEPLOYMENT === "production-review",
  SDK_URL: "https://sdk.minepi.com/pi-sdk.js",
  SDK_LITE_URL: "https://pi-apps.github.io/pi-sdk-lite/build/production/sdklite.js",
  BACKEND_URL: "https://backend.appstudio-u7cm9zhmha0ruwv8.piappengine.com",
  SANDBOX: false,
} as const;
