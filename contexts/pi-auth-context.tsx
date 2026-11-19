"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import { PI_NETWORK_CONFIG } from "@/lib/system-config";
import { LANGUAGES, type LangId } from "@/lib/connect/data";
import { PRODUCT_CONFIG } from "@/lib/product-config";
import { buildPiSdk, createSdk } from "@/lib/pi";
import { verifyPiAuth, initSocket, disconnectSocket, revokeSession } from "@/lib/api-client";
import type {
  Product,
  SDKLiteInstance,
  UserPurchaseBalance,
} from "@/lib/sdklite-types";

const SIGNED_OUT_KEY = "oneconnect.explicit-logout";

function readSignedOutLanguage(): LangId | null | undefined {
  try {
    const value = window.sessionStorage.getItem(SIGNED_OUT_KEY);
    if (value === null) return null;
    return LANGUAGES.find((language) => language.id === value)?.id ?? "en";
  } catch {
    // Unlike a missing marker, an unreadable store requires explicit sign-in.
    return undefined;
  }
}

function writeSignedOutLanguage(language: LangId | null) {
  try {
    if (language === null) window.sessionStorage.removeItem(SIGNED_OUT_KEY);
    else window.sessionStorage.setItem(SIGNED_OUT_KEY, language);
  } catch {
    // The in-memory state still controls login when storage is unavailable.
  }
}

function revokeOneConnectSession(token: string) {
  void revokeSession(token).catch((error) => {
    console.error("[SESSION REVOCATION ERROR]", error);
  });
}

const COMMUNICATION_REQUEST_TYPE = '@pi:app:sdk:communication_information_request';

function isInIframe(): boolean {
  try {
    return window.self !== window.top;
  } catch (error) {
    // Cross-origin access may throw when in an iframe
    if (
      error instanceof DOMException &&
      (error.name === 'SecurityError' || error.code === DOMException.SECURITY_ERR || error.code === 18)
    ) {
      return true;
    }
    // Firefox may throw generic Permission denied errors
    if (error instanceof Error && /Permission denied/i.test(error.message)) {
      return true;
    }

    throw error;
  }
}

function parseJsonSafely(value: any): any {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch (error) {
      return null;
    }
  }
  return typeof value === 'object' && value !== null ? value : null;
}

/**
 * Requests authentication credentials from the parent window (App Studio) via postMessage.
 * Returns null if not in iframe, timeout, or missing token (non-fatal check).
 *
 * @returns {Promise<{accessToken: string, appId: string}|null>} Resolves with credentials or null
 */
function requestParentCredentials(signal: AbortSignal): Promise<{ accessToken: string; appId: string | null } | null> {
  // Early return if not in an iframe
  if (signal.aborted || !isInIframe()) {
    return Promise.resolve(null);
  }

  const requestId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const timeoutMs = 1500;

  return new Promise((resolve) => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    // Cleanup function to remove listener and clear timeout
    const cleanup = (listener: (event: MessageEvent) => void) => {
      window.removeEventListener('message', listener);
      signal.removeEventListener('abort', abort);
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
    };

    const messageListener = (event: MessageEvent) => {
      // Security: only accept messages from parent window
      if (signal.aborted || event.source !== window.parent) {
        return;
      }

      // Validate message type and request ID match
      const data = parseJsonSafely(event.data);
      if (!data || data.type !== COMMUNICATION_REQUEST_TYPE || data.id !== requestId) {
        return;
      }

      cleanup(messageListener);

      // Extract credentials from response payload
      const payload = typeof data.payload === 'object' && data.payload !== null ? data.payload : {};
      const accessToken = typeof payload.accessToken === 'string' ? payload.accessToken : null;
      const appId = typeof payload.appId === 'string' ? payload.appId : null;

      // Return credentials or null if missing token
      resolve(accessToken ? { accessToken, appId } : null);
    };

    const abort = () => {
      cleanup(messageListener);
      resolve(null);
    };
    signal.addEventListener('abort', abort, { once: true });

    // Set timeout handler (resolve with null on timeout)
    timeoutId = setTimeout(() => {
      cleanup(messageListener);
      resolve(null);
    }, timeoutMs);

    // Register listener before sending request to avoid race condition
    window.addEventListener('message', messageListener);

    // Send request to parent window to get credentials
    window.parent.postMessage(
      JSON.stringify({
        type: COMMUNICATION_REQUEST_TYPE,
        id: requestId
      }),
      '*'
    );
  });
}

interface PiAuthContextType {
  endLocalSession: (language: LangId) => void;
  signedOutLanguage: LangId | null;
  signIn: () => void;
  isAuthenticated: boolean;
  authMessage: string;
  hasError: boolean;
  piUsername: string;
  userId: string | null;
  sessionToken: string | null;
  sdk: SDKLiteInstance | null;
  products: Product[] | null;
  restoredPurchases: UserPurchaseBalance[] | null;
  premiumActive: boolean;
  setPremiumActive: (active: boolean) => Promise<void>;
  reinitialize: () => Promise<void>;
}

const PiAuthContext = createContext<PiAuthContextType | undefined>(undefined);

const loadPiSDK = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (typeof window.Pi !== "undefined") {
      resolve();
      return;
    }

    const script = document.createElement("script");
    if (!PI_NETWORK_CONFIG.SDK_URL) {
      reject(new Error("SDK URL is not set"));
      return;
    }
    script.src = PI_NETWORK_CONFIG.SDK_URL;
    script.async = true;

    script.onload = () => {
      console.log("Pi SDK script loaded successfully");
      resolve();
    };

    script.onerror = () => {
      console.error("Failed to load Pi SDK script");
      reject(new Error("Failed to load Pi SDK script"));
    };

    document.head.appendChild(script);
  });
};

const loadSDKLite = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (typeof window.SDKLite !== "undefined") {
      resolve();
      return;
    }

    const script = document.createElement("script");
    if (!PI_NETWORK_CONFIG.SDK_LITE_URL) {
      reject(new Error("SDKLite URL is not set"));
      return;
    }
    script.src = PI_NETWORK_CONFIG.SDK_LITE_URL;
    script.async = true;

    script.onload = () => {
      console.log("SDKLite script loaded successfully");
      resolve();
    };

    script.onerror = () => {
      console.error("Failed to load SDKLite script");
      reject(new Error("Failed to load SDKLite script"));
    };

    document.head.appendChild(script);
  });
};

export function PiAuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authMessage, setAuthMessage] = useState("Initializing Pi Network...");
  const [hasError, setHasError] = useState(false);
  const [piUsername, setPiUsername] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [sdk, setSdk] = useState<SDKLiteInstance | null>(null);
  const [products, setProducts] = useState<Product[] | null>(null);
  const [restoredPurchases, setRestoredPurchases] = useState<
    UserPurchaseBalance[] | null
  >(null);
  const [premiumActive, setPremiumActiveState] = useState(false);
  const [signedOutLanguage, setSignedOutLanguage] = useState<LangId | null>(null);
  const authAttempt = useRef<AbortController | null>(null);
  const activeSessionToken = useRef<string | null>(null);

  const endLocalSession = (language: LangId) => {
    writeSignedOutLanguage(language);
    authAttempt.current?.abort();
    authAttempt.current = null;
    const token = activeSessionToken.current;
    activeSessionToken.current = null;
    if (token) revokeOneConnectSession(token);
    disconnectSocket();
    setIsAuthenticated(false);
    setSessionToken(null);
    setUserId(null);
    setPiUsername("");
    setSdk(null);
    setProducts(null);
    setRestoredPurchases(null);
    setPremiumActiveState(false);
    setHasError(false);
    setSignedOutLanguage(language);
  };

  const setPremiumActive = async (active: boolean) => {
    setPremiumActiveState(active);
    if (!sdk) return;
    try {
      await sdk.state.set("oneconnect.premium", {
        active,
        piUsername,
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Failed to save Premium entitlement:", error);
    }
  };

  const restorePremiumEntitlement = async (
    sdkInstance: SDKLiteInstance,
    purchases: UserPurchaseBalance[],
    productSlug: string | undefined,
    authenticatedUsername: string,
    signal: AbortSignal,
  ) => {
    const premium = purchases.some(
      (purchase) =>
        purchase.productId === PRODUCT_CONFIG.PRODUCT_6a7b58c52ac65f143bd43595 ||
        (productSlug != null && purchase.productId === productSlug),
    );
    try {
      const saved = await sdkInstance.state.get("oneconnect.premium");
      if (signal.aborted) return;
      const savedBlob = saved?.blob as { active?: unknown; piUsername?: unknown } | undefined;
      const savedActive = savedBlob?.active === true && savedBlob.piUsername === authenticatedUsername;
      setPremiumActiveState(premium || savedActive);
      if (premium && !savedActive) {
        await sdkInstance.state.set("oneconnect.premium", {
          active: true,
          piUsername: authenticatedUsername,
          updatedAt: new Date().toISOString(),
        });
      }
    } catch (error) {
      console.error("Failed to restore Premium entitlement:", error);
      if (!signal.aborted) setPremiumActiveState(premium);
    }
  };

  const fetchProducts = async (sdkInstance: SDKLiteInstance, signal: AbortSignal): Promise<Product[]> => {
    try {
      const { products } = await sdkInstance.state.products();
      if (!signal.aborted) setProducts(products);
      return products;
    } catch (e) {
      console.error("Failed to load products:", e);
      if (!signal.aborted) setProducts([]);
      return [];
    }
  };

  const initialize = async (explicit = false) => {
    if (authAttempt.current || activeSessionToken.current) return;
    const attempt = new AbortController();
    authAttempt.current = attempt;
    const { signal } = attempt;
    setHasError(false);
    setRestoredPurchases(null);
    setPremiumActiveState(false);
    try {
      // Probe for parent credentials (App Studio iframe environment).
      // When running inside App Studio's restore-preview iframe, SDKLite.login()
      // cannot complete outside the Pi CDN wrapper and would hang indefinitely.
      const parentCredentials = await requestParentCredentials(signal);
      if (signal.aborted) return;
      if (parentCredentials) {
        const authResult = await verifyPiAuth(
          parentCredentials.accessToken,
        );

        if (signal.aborted) {
          revokeOneConnectSession(authResult.sessionToken);
          return;
        }
        activeSessionToken.current = authResult.sessionToken;
        setSessionToken(authResult.sessionToken);
        setUserId(authResult.userId);
        setPiUsername(authResult.piUsername || "");
        setSdk(null);
        setProducts(null);
        initSocket(
          authResult.userId,
          authResult.piUsername,
          authResult.sessionToken,
        );
        setIsAuthenticated(true);
        if (explicit) writeSignedOutLanguage(null);

        // Purchase services are initialized separately from app login.
        try {
          await loadPiSDK();
          if (signal.aborted) return;
          await window.Pi.init({
            version: "2.0",
            sandbox: PI_NETWORK_CONFIG.SANDBOX,
          });
          if (signal.aborted) return;

          await loadSDKLite();
          if (signal.aborted) return;
          const purchaseSdk = await window.SDKLite.init();
          if (signal.aborted) return;
          setSdk(purchaseSdk);

          const availableProducts = await fetchProducts(purchaseSdk, signal);
          if (signal.aborted) return;

          try {
            const { purchases } = await purchaseSdk.state.restore();
            if (signal.aborted) return;
            setRestoredPurchases(purchases);

            const premiumProduct = availableProducts.find(
              (product) =>
                product.id ===
                PRODUCT_CONFIG.PRODUCT_6a7b58c52ac65f143bd43595,
            );

            await restorePremiumEntitlement(
              purchaseSdk,
              purchases,
              premiumProduct?.slug,
              authResult.piUsername,
              signal,
            );
          } catch (error) {
            if (signal.aborted) return;
            console.error("[PiAuth] Purchase restore failed:", error);
            setRestoredPurchases([]);
          }
        } catch (error) {
          if (signal.aborted) return;
          console.error("[PiAuth] Purchase initialization failed:", error);
          setSdk(null);
          setProducts([]);
          setRestoredPurchases([]);
        }

        return;
      }
      setAuthMessage("Loading Pi SDK...");
      await loadPiSDK();
      if (signal.aborted) return;
      setAuthMessage("Initializing Pi Network...");
      await window.Pi.init({
        version: "2.0",
        sandbox: PI_NETWORK_CONFIG.SANDBOX,
      });
      if (signal.aborted) return;
      setAuthMessage("Loading SDKLite...");
      await loadSDKLite();
      if (signal.aborted) return;

      setAuthMessage("Initializing SDKLite...");
      const sdkLite = await window.SDKLite.init();
      if (signal.aborted) return;

      // Auth + user-state are served by the @pi-sdk npm packages; SDKLite still backs
      // payments, ads, products and restore until those packages ship. The adapter keeps
      // the SDKLiteInstance surface so nothing downstream changes.
      setAuthMessage("Logging in...");
      const pi = buildPiSdk();
      const authenticatedUser = await pi.auth.login(undefined, signal);
      const renderSession = pi.auth.getRenderSession();
      if (signal.aborted) {
        if (renderSession) revokeOneConnectSession(renderSession.sessionToken);
        return;
      }
      if (!renderSession) {
        throw new Error("Render session unavailable after Pi login");
      }

      activeSessionToken.current = renderSession.sessionToken;
      setSessionToken(renderSession.sessionToken);
      setUserId(renderSession.userId);
      setPiUsername(renderSession.piUsername);

      initSocket(
        renderSession.userId,
        renderSession.piUsername,
        renderSession.sessionToken,
      );
      const sdkInstance = createSdk(sdkLite, pi);
      setSdk(sdkInstance);
      setIsAuthenticated(true);
      if (explicit) writeSignedOutLanguage(null);
      setAuthMessage("Loading products...");
      const availableProducts = await fetchProducts(sdkInstance, signal);
      if (signal.aborted) return;

      try {
        const { purchases } = await sdkInstance.state.restore();
        if (signal.aborted) return;
        setRestoredPurchases(purchases);
        const premiumProduct = availableProducts.find(
          (product) => product.id === PRODUCT_CONFIG.PRODUCT_6a7b58c52ac65f143bd43595,
        );
        await restorePremiumEntitlement(
          sdkInstance,
          purchases,
          premiumProduct?.slug,
          authenticatedUser.username || "",
          signal,
        );
        console.log("[PiAuth] Purchases restored", purchases);
      } catch (e) {
        if (signal.aborted) return;
        console.error("[PiAuth] Failed to restore purchases:", e);
        setRestoredPurchases([]);
      }
    } catch (err) {
      if (signal.aborted) return;
      console.error("SDKLite initialization failed:", err);
      setHasError(true);
      setAuthMessage((currentStage) =>
       `${currentStage} — Origin: ${window.location.origin} — ${
          err instanceof Error
            ? err.message
            : "Authentication failed. Please try again."
        }`
      );
    } finally {
      if (authAttempt.current === attempt) authAttempt.current = null;
    }
  };

  const signIn = () => {
    if (authAttempt.current || activeSessionToken.current) return;
    setSignedOutLanguage(null);
    void initialize(true);
  };

  useEffect(() => {
    const language = readSignedOutLanguage();
    if (language === null) void initialize();
    else setSignedOutLanguage(language ?? "en");

    return () => {
      authAttempt.current?.abort();
      authAttempt.current = null;
    };
  }, []);

  const value: PiAuthContextType = {
    endLocalSession,
    signedOutLanguage,
    signIn,
    isAuthenticated,
    authMessage,
    hasError,
    piUsername,
    userId,
    sessionToken,
    sdk,
    products,
    restoredPurchases,
    premiumActive,
    setPremiumActive,
    reinitialize: () => initialize(true),
  };

  return (
    <PiAuthContext.Provider value={value}>{children}</PiAuthContext.Provider>
  );
}

export function usePiAuth() {
  const context = useContext(PiAuthContext);
  if (context === undefined) {
    throw new Error("usePiAuth must be used within a PiAuthProvider");
  }
  return context;
}
