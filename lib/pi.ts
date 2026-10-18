"use client";

// Builds the Pi SDK from the modular @swetate npm packages and adapts it to the
// SDKLiteInstance surface the rest of this template already consumes (usePiAuth().sdk,
// lib/pi-payment.ts, generated app code).
//
// Phase 1: authentication and user-state are served by the @swetate packages by default.
// Payments, ads, products and purchase-restore continue to flow through SDKLite until
// @swetate/payments and @swetate/ads are published — at which point the SDKLite fallback is
// removed and this becomes a single SDK. Keeping the SDKLiteInstance shape means no app
// code, locked file, or V0 prompt has to change in the meantime.

import { createPiSDK } from "@swetate/core";
import { authPlugin } from "@swetate/auth";
import { userStatePlugin } from "@swetate/user-state";
import { PI_NETWORK_CONFIG } from "@/lib/system-config";
import { verifyPiAuth } from "@/lib/api-client";
import type { RestoreOptions, SDKLiteInstance, UserStateRecord } from "@/lib/sdklite-types";

type OneConnectAuthPlugin = ReturnType<typeof authPlugin>;

interface PiUser {
  uid: string;
  username: string;
}

// The public surfaces the @pi-sdk plugins mount on the instance. createPiSDK types the
// instance as an open record, so we narrow the two namespaces we use.
interface PiAuthApi {
  login: (scopes?: string[]) => Promise<PiUser>;
  getUser: () => PiUser | null;
  isLoggedIn: () => boolean;
  getRenderSession: () => {
    sessionToken: string;
    userId: string;
    piUsername: string;
  } | null;
}
interface PiUserStateApi {
  get: (key: string) => Promise<UserStateRecord | null>;
  set: (key: string, blob: Record<string, unknown>) => Promise<void>;
  delete: (key: string) => Promise<void>;
  keys: () => Promise<string[]>;
}

export interface PiSdk {
  auth: PiAuthApi;
  userState: PiUserStateApi;
}

function oneConnectAuthPlugin(): OneConnectAuthPlugin {
  return {
    name: "auth",
    apiVersion: "v1",

    install(ctx) {
      let user: PiUser | null = null;
      let appStudioToken: string | null = null;
      let renderSession: {
        sessionToken: string;
        userId: string;
        piUsername: string;
      } | null = null;

      let incompletePaymentHandler = (_payment: unknown) => {};

      async function login(
        scopes: string[] = ["username", "payments"],
      ): Promise<PiUser> {
        if (user) return user;

        const result = await Pi.authenticate(
          scopes,
          incompletePaymentHandler,
        );

        const appStudioResponse = await ctx.backendClient.post(
          "/login",
          { accessToken: result.accessToken },
        );

        const verifiedRenderSession = await verifyPiAuth(
          result.accessToken,
        );

        if (
          !appStudioResponse.data?.sessionToken ||
          !appStudioResponse.data?.user ||
          !verifiedRenderSession?.sessionToken ||
          !verifiedRenderSession?.userId ||
          verifiedRenderSession.piUsername !== result.user.username
        ) {
          throw new Error("Pi authentication verification failed");
        }

        appStudioToken = appStudioResponse.data.sessionToken;
        renderSession = {
          sessionToken: verifiedRenderSession.sessionToken,
          userId: verifiedRenderSession.userId,
          piUsername: verifiedRenderSession.piUsername,
        };
        user = appStudioResponse.data.user;

        return user!;
      }

      async function ensureLoggedIn(scopes?: string[]) {
        if (!user) await login(scopes);
      }

      function getHeaders() {
        return appStudioToken
          ? { Authorization: `Bearer ${appStudioToken}` }
          : {};
      }

      return {
        internal: {
          getHeaders,
          ensureLoggedIn,
          setIncompletePaymentHandler: (
            handler: (payment: unknown) => void,
          ) => {
            incompletePaymentHandler = handler;
          },
        },
        public: {
          login,
          getUser: () => user,
          isLoggedIn: () => user !== null,
          getRenderSession: () => renderSession,
        },
      };
    },
  };
}

/**
 * Construct the @pi-sdk instance with the auth and user-state plugins. The plugins mount
 * `auth` and `userState`, and core auto-namespaces their requests to /pi/{plugin}/{version}
 * against the build-time backend URL.
 */
export function buildPiSdk(): PiSdk {
  const pi = createPiSDK({ backendUrl: PI_NETWORK_CONFIG.BACKEND_URL });
  pi.use(oneConnectAuthPlugin());
  pi.use(userStatePlugin());
  return pi as unknown as PiSdk;
}

/**
 * Wrap the legacy SDKLite instance so that `login` and `state.get`/`state.set` are served by
 * the @pi-sdk packages, while everything not yet packaged (payments, ads, products,
 * purchases, consume, restore) keeps delegating to SDKLite. The returned object is a drop-in
 * SDKLiteInstance, so `usePiAuth().sdk` and all existing call sites are unchanged.
 */
export function createSdk(sdkLite: SDKLiteInstance, pi: PiSdk): SDKLiteInstance {
  // SDKLite is a class instance — spread only copies own enumerable properties,
  // silently dropping prototype methods. Capture them in plain objects first so
  // the spread-and-override pattern works as expected.
  const sdkLiteMethods = {
    makePurchase: (productId: string) => sdkLite.makePurchase(productId),
    isAdNetworkSupported: () => sdkLite.isAdNetworkSupported(),
    showInterstitial: () => sdkLite.showInterstitial(),
    showRewarded: (productId: string) => sdkLite.showRewarded(productId),
  };

  const sdkLiteStateMethods = {
    products: () => sdkLite.state.products(),
    purchases: () => sdkLite.state.purchases(),
    consume: (productId: string, quantity?: number) => sdkLite.state.consume(productId, quantity),
    restore: (options?: RestoreOptions) => sdkLite.state.restore(options),
  };

  return {
    ...sdkLiteMethods,
    login: async () => {
      await pi.auth.login();
      return sdkLite.login();
    },
    state: {
      ...sdkLiteStateMethods,
      get: (key) => pi.userState.get(key),
      set: (key, blob) => pi.userState.set(key, blob),
    },
  };
}
