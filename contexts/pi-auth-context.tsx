"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  type ReactNode,
} from "react";
import { PI_NETWORK_CONFIG } from "@/lib/system-config";
import { LANGUAGES, type LangId } from "@/lib/connect/data";
import { buildPiSdk, createSdk } from "@/lib/pi";
import { verifyPiAuth, initSocket, disconnectSocket, revokeSession } from "@/lib/api-client";
import type {
  SDKLiteInstance,
} from "@/lib/sdklite-types";

const SIGNED_OUT_KEY = "oneconnect.explicit-logout";
type SignedOutNotice = "accepted" | "deleting";
const DELETION_NOTICE_KEY = "oneconnect.deletion-notice";

function readDeletionNotice(): SignedOutNotice | null {
  try {
    const notice = window.sessionStorage.getItem(DELETION_NOTICE_KEY);
    return notice === "accepted" || notice === "deleting" ? notice : null;
  } catch {
    return null;
  }
}

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

function writeSignedOutLanguage(language: LangId | null, notice: SignedOutNotice | null = null) {
  try {
    if (language === null) window.sessionStorage.removeItem(SIGNED_OUT_KEY);
    else window.sessionStorage.setItem(SIGNED_OUT_KEY, language);
    if (notice) window.sessionStorage.setItem(DELETION_NOTICE_KEY, notice);
    else window.sessionStorage.removeItem(DELETION_NOTICE_KEY);
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
  signedOutNotice: SignedOutNotice | null;
  accountDeletionSupported: boolean;
  subscriptionStatusSupported: boolean;
  getDeletionPiToken: (token: string, signal: AbortSignal) => Promise<string>;
  finishAccountDeletion: (token: string, language: LangId) => void;
  signIn: () => void;
  isAuthenticated: boolean;
  authMessage: string;
  hasError: boolean;
  accountMigrationRequired: boolean;
  privateDataOwner: string | null;
  emailSocketMode: "legacy" | "account";
  chatSocketMode: "legacy" | "account";
  groupSocketMode: "legacy" | "account";
  isCurrentSession: (token: string) => boolean;
  piUsername: string;
  userId: string | null;
  sessionToken: string | null;
  sdk: SDKLiteInstance | null;
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
  const [privateDataOwner, setPrivateDataOwner] = useState<string | null>(null);
  const [accountMigrationRequired, setAccountMigrationRequired] = useState(false);
  const [groupSocketMode, setGroupSocketMode] = useState<"legacy" | "account">("legacy");
  const [chatSocketMode, setChatSocketMode] = useState<"legacy" | "account">("legacy");
  const [emailSocketMode, setEmailSocketMode] = useState<"legacy" | "account">("legacy");
  const [piUsername, setPiUsername] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [sdk, setSdk] = useState<SDKLiteInstance | null>(null);
  const [signedOutLanguage, setSignedOutLanguage] = useState<LangId | null>(null);
  const [signedOutNotice, setSignedOutNotice] = useState<SignedOutNotice | null>(null);
  const [accountDeletionSupported, setAccountDeletionSupported] = useState(false);
  const [subscriptionStatusSupported, setSubscriptionStatusSupported] = useState(false);
  const authSource = useRef<"pi" | "parent" | null>(null);
  const authAttempt = useRef<AbortController | null>(null);
  const activeSessionToken = useRef<string | null>(null);
  const isCurrentSession = useCallback((token: string) => activeSessionToken.current === token, []);

  const endLocalSession = (language: LangId, notice: SignedOutNotice | null = null) => {
    writeSignedOutLanguage(language, notice);
    authAttempt.current?.abort();
    authAttempt.current = null;
    const token = activeSessionToken.current;
    activeSessionToken.current = null;
    authSource.current = null;
    if (token && notice !== "accepted") revokeOneConnectSession(token);
    disconnectSocket();
    setIsAuthenticated(false);
    setAccountMigrationRequired(false);
    setAccountDeletionSupported(false);
    setSubscriptionStatusSupported(false);
    setPrivateDataOwner(null);
    setEmailSocketMode("legacy");
    setChatSocketMode("legacy");
    setGroupSocketMode("legacy");
    setSessionToken(null);
    setUserId(null);
    setPiUsername("");
    setSdk(null);
    setHasError(false);
    setSignedOutLanguage(language);
    setSignedOutNotice(notice);
  };

  function finishAccountDeletion(token: string, language: LangId) {
    if (isCurrentSession(token)) endLocalSession(language, "accepted");
  }

  async function getDeletionPiToken(token: string, signal: AbortSignal) {
    signal.throwIfAborted();
    if (!isCurrentSession(token)) throw new Error("Session changed");
    const accessToken = authSource.current === "parent"
      ? (await requestParentCredentials(signal))?.accessToken
      : (await Pi.authenticate(["username"], () => {})).accessToken;
    signal.throwIfAborted();
    if (!accessToken || !isCurrentSession(token)) throw new Error("Pi verification unavailable");
    return accessToken;
  }

  const initialize = async (explicit = false, requestedLanguage?: LangId) => {
    if (authAttempt.current || activeSessionToken.current) return;
    const attempt = new AbortController();
    authAttempt.current = attempt;
    const { signal } = attempt;
    setHasError(false);
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
        authSource.current = "parent";
        setAccountDeletionSupported(authResult.accountDeletionSupported === true);
        setSubscriptionStatusSupported(authResult.subscriptionStatusSupported === true);
        setSignedOutNotice(null);
        activeSessionToken.current = authResult.sessionToken;
        setSessionToken(authResult.sessionToken);
        setUserId(authResult.userId);
        setPiUsername(authResult.piUsername || "");
        setSdk(null);
        if (authResult.emailSocketMode === "account") setEmailSocketMode("account");
        if (authResult.chatSocketMode === "account") setChatSocketMode("account");
        if (authResult.groupSocketMode === "account") setGroupSocketMode("account");
        if (typeof authResult.privateDataOwner === "string" && /^account-[0-9a-f]{64}$/.test(authResult.privateDataOwner)) setPrivateDataOwner(authResult.privateDataOwner);
        if (authResult.subscriptionStatusSupported === true || authResult.accountDataStatus === "ACCOUNT_MIGRATION_REQUIRED" || authResult.emailSocketMode === "account" || authResult.chatSocketMode === "account" || authResult.groupSocketMode === "account") {
          setAccountMigrationRequired(true);
          setIsAuthenticated(true);
          if (explicit) writeSignedOutLanguage(null);
          return;
        }
        initSocket(
          authResult.userId,
          authResult.piUsername,
          authResult.sessionToken,
        );
        setIsAuthenticated(true);
        if (explicit) writeSignedOutLanguage(null);

        // Initialize the SDK separately from App Studio sign-in.
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

        } catch (error) {
          if (signal.aborted) return;
          console.error("[PiAuth] SDK initialization failed:", error);
          setSdk(null);
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
      await pi.auth.login(undefined, signal);
      const renderSession = pi.auth.getRenderSession();
      if (signal.aborted) {
        if (renderSession) revokeOneConnectSession(renderSession.sessionToken);
        return;
      }
      if (!renderSession) {
        throw new Error("Render session unavailable after Pi login");
      }

      authSource.current = "pi";
      setAccountDeletionSupported(renderSession.accountDeletionSupported === true);
      setSubscriptionStatusSupported(renderSession.subscriptionStatusSupported === true);
      setSignedOutNotice(null);
      activeSessionToken.current = renderSession.sessionToken;
      setSessionToken(renderSession.sessionToken);
      setUserId(renderSession.userId);
      setPiUsername(renderSession.piUsername);
      if (renderSession.emailSocketMode === "account") setEmailSocketMode("account");
      if (renderSession.chatSocketMode === "account") setChatSocketMode("account");
      if (renderSession.groupSocketMode === "account") setGroupSocketMode("account");
      if (typeof renderSession.privateDataOwner === "string" && /^account-[0-9a-f]{64}$/.test(renderSession.privateDataOwner)) setPrivateDataOwner(renderSession.privateDataOwner);
      if (renderSession.subscriptionStatusSupported === true || renderSession.accountDataStatus === "ACCOUNT_MIGRATION_REQUIRED" || renderSession.emailSocketMode === "account" || renderSession.chatSocketMode === "account" || renderSession.groupSocketMode === "account") {
        setAccountMigrationRequired(true);
        setIsAuthenticated(true);
        if (explicit) writeSignedOutLanguage(null);
        return;
      }

      initSocket(
        renderSession.userId,
        renderSession.piUsername,
        renderSession.sessionToken,
      );
      const sdkInstance = createSdk(sdkLite, pi);
      setSdk(sdkInstance);
      setIsAuthenticated(true);
      if (explicit) writeSignedOutLanguage(null);
    } catch (err) {
      if (signal.aborted) return;
      if (err instanceof Error && "code" in err && err.code === "ACCOUNT_DELETING") {
        const browserLanguage = window.navigator?.language?.split("-")[0];
        const language = requestedLanguage ?? readSignedOutLanguage() ??
          LANGUAGES.find(({ id }) => id === browserLanguage)?.id ?? "en";
        endLocalSession(language, "deleting");
        return;
      }
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
    void initialize(true, signedOutLanguage ?? undefined);
  };

  useEffect(() => {
    const language = readSignedOutLanguage();
    if (language === null) void initialize();
    else {
      setSignedOutLanguage(language ?? "en");
      setSignedOutNotice(readDeletionNotice());
    }

    return () => {
      authAttempt.current?.abort();
      authAttempt.current = null;
    };
  }, []);

  const value: PiAuthContextType = {
    endLocalSession,
    signedOutLanguage,
    signedOutNotice,
    accountDeletionSupported,
    subscriptionStatusSupported,
    getDeletionPiToken,
    finishAccountDeletion,
    signIn,
    isAuthenticated,
    authMessage,
    hasError,
    accountMigrationRequired,
    privateDataOwner,
    emailSocketMode,
    chatSocketMode,
    groupSocketMode,
    isCurrentSession,
    piUsername,
    userId,
    sessionToken,
    sdk,
    reinitialize: () => initialize(true, signedOutLanguage ?? undefined),
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
