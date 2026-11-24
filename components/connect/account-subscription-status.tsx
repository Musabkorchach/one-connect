"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { usePiAuth } from "@/contexts/pi-auth-context";
import { API_URL } from "@/lib/api-client";
import { monthlyTestnetPrice, resolveTestnetSubscriptionServiceId, submitTestnetSubscription, testnetWalletPattern } from "@/lib/pi-testnet-subscription";
import type { LangId } from "@/lib/connect/data";
import { Button } from "./ui";

const endpoint = API_URL + "/api/pi-testnet/subscription";
type Proof = { id: string; hash: string };
type StatusFailure = "forbidden" | "disabled" | "unavailable";
type WalletFailure = "walletMissing" | "walletMismatch" | "walletAuthRejected" |
  "walletUnavailable" | "walletIdentityMismatch" | "walletConsent";
const walletResponseErrors = new Map<string, WalletFailure>([
  ["WALLET_ADDRESS_MISSING", "walletMissing"],
  ["WALLET_ADDRESS_MISMATCH", "walletMismatch"],
  ["WALLET_PI_AUTH_REJECTED", "walletAuthRejected"],
  ["WALLET_PI_UNAVAILABLE", "walletUnavailable"],
  ["WALLET_PI_IDENTITY_MISMATCH", "walletIdentityMismatch"],
]);
const walletFailures = new Set<string>([...walletResponseErrors.values(), "walletConsent"]);
function isWalletFailure(code: string): code is WalletFailure {
  return walletFailures.has(code);
}
type Status = {
  plan: { active: boolean; network: string; serviceId: string };
  wallet: string | null;
  pending: Proof | null;
  reserved: boolean;
  subscription: { status: "unknown" } | {
    status: "active" | "expired"; endsAt: string; subscriptionId: string; autoRenew: boolean;
  };
};

async function request<T>(token: string, path = "", body?: object, signal?: AbortSignal): Promise<T> {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  const timeout = setTimeout(cancel, 15000);
  if (signal?.aborted) cancel();
  signal?.addEventListener("abort", cancel, { once: true });
  try {
    const response = await fetch(endpoint + path, {
      method: body ? "POST" : "GET", cache: "no-store", signal: controller.signal,
      headers: { Authorization: "Bearer " + token, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body && JSON.stringify(body),
    });
    if (path === "/prepare" && (response.status === 403 || response.status === 503)) {
      const denial = await response.json().catch(() => null);
      const failure = walletResponseErrors.get(denial?.code);
      if (failure) throw new Error(failure);
    }
    if (response.status === 403) throw new Error("forbidden");
    if (response.status === 404) throw new Error("disabled");
    if (!response.ok) throw new Error(response.status === 422 ? "rejected" : "unavailable");
    return await response.json();
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", cancel);
  }
}

export function AccountSubscriptionStatus({ sessionToken, language }: { sessionToken: string; language: LangId }) {
  const { isCurrentSession, piSdkReady } = usePiAuth();
  if (typeof window === "undefined" || !isCurrentSession(sessionToken)) return null;
  const serviceId = resolveTestnetSubscriptionServiceId(
    window.location.origin,
    process.env.NEXT_PUBLIC_PI_TESTNET_SUBSCRIPTION_SERVICE_ID,
  );
  if (!serviceId) return (
    <SubscriptionCard language={language}>
      <p role="status" className="text-sm">{subscriptionCopy(language).context}</p>
    </SubscriptionCard>
  );
  return <SubscriptionPanel key={sessionToken} token={sessionToken} language={language} serviceId={serviceId}
    isCurrentSession={isCurrentSession} piSdkReady={piSdkReady} />;
}

function subscriptionCopy(language: LangId) {
  if (language === "ar") return {
    title: "اشتراك Pi على Testnet", loading: "جارٍ التحقق من توفر الاشتراك…",
    context: "اشتراك Testnet غير متاح من هذا التطبيق أو المعاينة.",
    forbidden: "لم يسمح الخادم بالاشتراك لهذه الجلسة أو المعاينة.",
    disabled: "خدمة اشتراك Testnet غير متاحة على الخادم.",
    unavailable: "تعذّر التحقق من حالة الاشتراك. حاول مجددًا.",
    inactive: "الخطة لا تقبل اشتراكات جديدة حاليًا.",
    sdk: "معاملات الاشتراك غير متاحة في جلسة Pi Browser الحالية.",
    walletMissing: "لم يُرجع Pi عنوان محفظة لحسابك. تحقق من ربط المحفظة ومنح صلاحية عنوانها.",
    walletMismatch: "العنوان الذي أعاده Pi يختلف عن عنوان المحفظة الذي أدخلته.",
    walletAuthRejected: "رفض Pi رمز التحقق أو صلاحية عنوان المحفظة. أعد التفويض وحاول مجددًا.",
    walletUnavailable: "تعذّر الاتصال بخدمة Pi أو قراءة ردها للتحقق من المحفظة. حاول مجددًا.",
    walletIdentityMismatch: "حساب Pi الذي وافق على التفويض يختلف عن حساب جلسة One Connect.",
    walletConsent: "لم يكتمل تفويض عنوان المحفظة في Pi Browser. أعد المحاولة وامنح الصلاحية.",
    refresh: "حدّث الحالة",
  };
  if (language === "fr") return {
    title: "Abonnement Pi sur Testnet", loading: "Vérification de la disponibilité de l’abonnement…",
    context: "L’abonnement Testnet est indisponible dans cette application ou cet aperçu.",
    forbidden: "Le serveur n’a pas autorisé l’abonnement pour cette session ou cet aperçu.",
    disabled: "Le service d’abonnement Testnet est indisponible sur le serveur.",
    unavailable: "Impossible de vérifier l’état de l’abonnement. Réessayez.",
    inactive: "Le forfait n’accepte pas de nouveaux abonnements pour le moment.",
    sdk: "Les transactions d’abonnement sont indisponibles dans cette session Pi Browser.",
    walletMissing: "Pi n’a renvoyé aucune adresse de portefeuille pour votre compte. Vérifiez le portefeuille associé et l’autorisation.",
    walletMismatch: "L’adresse renvoyée par Pi diffère de l’adresse de portefeuille saisie.",
    walletAuthRejected: "Pi a refusé le jeton ou l’autorisation du portefeuille. Autorisez de nouveau l’accès.",
    walletUnavailable: "Impossible de joindre Pi ou de lire sa réponse pour vérifier le portefeuille. Réessayez.",
    walletIdentityMismatch: "Le compte Pi qui a autorisé l’accès diffère du compte de la session One Connect.",
    walletConsent: "L’autorisation du portefeuille n’a pas abouti dans Pi Browser. Réessayez et accordez l’accès.",
    refresh: "Actualiser l’état",
  };
  return {
    title: "Pi Subscription · Testnet", loading: "Checking subscription availability…",
    context: "Testnet subscriptions are unavailable in this app or preview.",
    forbidden: "The server did not allow subscriptions for this session or preview.",
    disabled: "The Testnet subscription service is unavailable on the server.",
    unavailable: "Could not verify the subscription status. Try again.",
    inactive: "The plan is currently closed to new subscriptions.",
    sdk: "Subscription transactions are unavailable in this Pi Browser session.",
    walletMissing: "Pi returned no wallet address for your account. Check your linked wallet and address permission.",
    walletMismatch: "The wallet address returned by Pi differs from the address you entered.",
    walletAuthRejected: "Pi rejected the verification token or wallet address permission. Authorize access again.",
    walletUnavailable: "Could not reach Pi or read its response to verify the wallet. Try again.",
    walletIdentityMismatch: "The Pi account that authorized access differs from your One Connect session.",
    walletConsent: "Wallet address authorization did not complete in Pi Browser. Try again and grant access.",
    refresh: "Refresh status",
  };
}

function SubscriptionCard({ language, children }: { language: LangId; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-2xl pc-glass p-4" dir={language === "ar" ? "rtl" : "ltr"}>
      <h2 className="font-semibold">{subscriptionCopy(language).title}</h2>
      {children}
    </section>
  );
}

function SubscriptionPanel({ token, language, serviceId, isCurrentSession, piSdkReady }: {
  token: string;
  language: LangId;
  serviceId: NonNullable<ReturnType<typeof resolveTestnetSubscriptionServiceId>>;
  isCurrentSession: (token: string) => boolean;
  piSdkReady: boolean;
}) {
  const [wallet, setWallet] = useState("");
  const [result, setResult] = useState<Status | null>(null);
  const [statusFailure, setStatusFailure] = useState<StatusFailure | null>(null);
  const [proof, setProof] = useState<Proof | null>(null);
  const [managementHash, setManagementHash] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<WalletFailure | "unavailable" | "pending" | "rejected" | null>(null);
  const inFlight = useRef(false);
  const arabic = language === "ar";
  const copy = subscriptionCopy(language);
  const pi = piSdkReady ? window.Pi : undefined;
  const subscriptionSdk = pi?.SmartContract?.Subscription;
  const canEnroll = typeof pi?.authenticate === "function" && typeof subscriptionSdk?.subscribe === "function";
  const current = useCallback(() => isCurrentSession(token), [isCurrentSession, token]);

  const readStatus = useCallback(async (signal?: AbortSignal) => {
    const status = await request<Status>(token, "", undefined, signal);
    if (status?.plan?.network !== "Pi Testnet" || status.plan.serviceId !== serviceId ||
        typeof status.plan.active !== "boolean") throw new Error("unavailable");
    return status;
  }, [serviceId, token]);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    try {
      const status = await readStatus(signal);
      if (current() && !signal?.aborted) {
        setResult(status);
        setStatusFailure(null);
      }
    } catch (error) {
      if (current() && !signal?.aborted) {
        const failure = error instanceof Error ? error.message : null;
        setResult(null);
        setStatusFailure(failure === "forbidden" || failure === "disabled" ? failure : "unavailable");
      }
    }
  }, [current, readStatus]);

  useEffect(() => {
    const abort = new AbortController();
    void refresh(abort.signal);
    return () => abort.abort();
  }, [refresh]);

  async function confirm(value: Proof) {
    const { state } = await request<{ state: "pending" | "confirmed" }>(token, "/confirm", value);
    if (!current()) return;
    setProof(state === "pending" ? value : null);
    setMessage(state === "pending" ? "pending" : null);
    await refresh();
  }

  async function run(action: () => Promise<void>) {
    if (!current() || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setMessage(null);
    try {
      await action();
    } catch (error) {
      if (current()) {
        const code = error instanceof Error ? error.message : "";
        if (code === "rejected") setProof(null);
        const walletFailure = isWalletFailure(code);
        setMessage(walletFailure || code === "rejected" ? code : "unavailable");
        if (!walletFailure) await refresh();
      }
    } finally {
      inFlight.current = false;
      if (current()) setBusy(false);
    }
  }

  function enroll(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const address = result?.wallet ?? wallet.trim();
    if (!canEnroll || !testnetWalletPattern.test(address) || !result?.plan.active || result.reserved || result.pending || proof) return;
    void run(async () => {
      const pi = window.Pi;
      const sdk = pi?.SmartContract?.Subscription;
      if (!sdk || !pi.authenticate) throw new Error("unavailable");
      const authorization = await pi.authenticate(["username", "payments", "wallet_address"], () => {})
        .catch(() => { throw new Error("walletConsent"); });
      if (!current()) return;
      if (!authorization?.accessToken) throw new Error("walletConsent");
      const { id } = await request<{ id: string }>(token, "/prepare", { wallet: address, accessToken: authorization.accessToken });
      if (!current()) return;
      const hash = await submitTestnetSubscription(sdk, "subscribe", address, serviceId, current);
      if (!current()) return;
      const value = { id, hash };
      setProof(value);
      await confirm(value);
    });
  }

  async function checkManagement(hash: string) {
    const sm = window.Pi?.SmartContract;
    if (!sm?.pollTransaction) throw new Error("unavailable");
    const { status } = await sm.pollTransaction(hash);
    if (!current()) return;
    if (status === "FAILED") {
      setManagementHash(null);
      setMessage("rejected");
    } else if (status === "SUCCESS") {
      setManagementHash(null);
      await refresh();
    } else {
      setMessage("pending");
    }
  }

  function manage(action: "cancel" | "renew") {
    void run(async () => {
      const sdk = window.Pi?.SmartContract?.Subscription;
      if (!piSdkReady || !sdk || managementHash ||
          typeof (action === "cancel" ? sdk.cancel : sdk.toggleAutoRenew) !== "function") {
        throw new Error("unavailable");
      }
      const { wallet: verifiedWallet, subscription: sub } = await readStatus();
      if (!current()) return;
      if (!verifiedWallet || !sub || !("subscriptionId" in sub) ||
          (action === "cancel" ? !sub.autoRenew : sub.status !== "active" || sub.autoRenew)) {
        throw new Error("unavailable");
      }
      const hash = await submitTestnetSubscription(sdk, action, verifiedWallet, sub.subscriptionId, current);
      if (!current()) return;
      setManagementHash(hash);
      await checkManagement(hash);
    });
  }

  if (!result) return (
    <SubscriptionCard language={language}>
      <p role="status" className="text-sm">{statusFailure ? copy[statusFailure] : copy.loading}</p>
      {statusFailure && (
        <Button className="w-full" type="button" variant="outline" disabled={busy} onClick={() => void run(() => refresh())}>
          {copy.refresh}
        </Button>
      )}
    </SubscriptionCard>
  );

  const subscription = result.subscription;
  const pending = proof ?? result?.pending;
  const canShowEnrollment = result.plan.active && (!result.wallet ||
    (subscription?.status === "expired" && !subscription.autoRenew)) && !pending && !result.reserved;
  const canShowManagement = subscription && "subscriptionId" in subscription &&
    (subscription.status === "active" || subscription.autoRenew);
  const canManage = canShowManagement &&
    typeof (subscription.autoRenew ? subscriptionSdk?.cancel : subscriptionSdk?.toggleAutoRenew) === "function";
  const statusText = subscription?.status === "active" ? (arabic ? "نشط" : "Active")
    : subscription?.status === "expired" ? (arabic ? "منتهٍ" : "Expired")
    : (arabic ? "غير معلومة" : "Unknown");
  const messages = {
    unavailable: arabic ? "تعذّر التحقق من العملية. حدّث الحالة قبل المحاولة مجددًا." : "Could not verify the operation. Refresh the status before trying again.",
    pending: arabic ? "المعاملة بانتظار التأكيد." : "Awaiting transaction confirmation.",
    rejected: arabic ? "لم يؤكد Pi المعاملة." : "Pi did not confirm the transaction.",
  };

  return (
    <SubscriptionCard language={language}>
      <p className="text-sm text-muted-foreground">
        {arabic ? `${monthlyTestnetPrice} Pi تجريبية شهريًا. الخدمات الحالية مجانية.`
          : `${monthlyTestnetPrice} Test-Pi per month. Current services are free.`}
      </p>
      <p role="status" className="text-sm">{arabic ? "حالة اشتراك الحساب: " : "Account subscription: "}{statusText}</p>
      {!result.plan.active && <p role="status" className="text-sm">{copy.inactive}</p>}
      {((canShowEnrollment && !canEnroll) || (canShowManagement && !canManage)) &&
        <p role="status" className="text-sm">{copy.sdk}</p>}
      {subscription && "endsAt" in subscription && (
        <p className="text-sm">
          {arabic ? "نهاية الفترة" : "Period ends"}{" "}
          <time dateTime={subscription.endsAt}>{new Intl.DateTimeFormat(arabic ? "ar" : "en", {
            dateStyle: "medium", timeStyle: "short", timeZone: "UTC",
          }).format(new Date(subscription.endsAt))} UTC</time>
        </p>
      )}
      {canShowEnrollment && (
        <form className="space-y-2" onSubmit={enroll}>
          {!result.wallet && (
            <label className="block space-y-1 text-sm">
              <span>{arabic ? "عنوان محفظة Pi العام على Testnet" : "Public Pi Testnet wallet address"}</span>
              <input className="w-full rounded-xl border border-border bg-background px-3 py-2"
                dir="ltr" autoCapitalize="characters" autoComplete="off" spellCheck={false} maxLength={56}
                value={wallet} onChange={(event) => setWallet(event.target.value)} />
            </label>
          )}
          <Button className="w-full" type="submit" disabled={busy || !canEnroll || !testnetWalletPattern.test(result.wallet ?? wallet.trim())}>
            {arabic ? "اشترك لدورة واحدة دون تجديد تلقائي" : "Subscribe for one period without auto-renewal"}
          </Button>
        </form>
      )}
      {!pending && result?.reserved && <p className="text-sm">{arabic ? "هناك محاولة اشتراك قيد التحقق." : "A subscription attempt is being checked."}</p>}
      {canShowManagement && (
        <div className="space-y-2">
          <Button className="w-full" type="button" variant="outline" disabled={busy || !canManage || !!managementHash}
            onClick={() => manage(subscription.autoRenew ? "cancel" : "renew")}>
            {subscription.autoRenew ? (arabic ? "أوقف التجديد التلقائي" : "Turn off auto-renewal")
              : (arabic ? "وافق على تجديد دورة واحدة" : "Approve one renewal")}
          </Button>
        </div>
      )}
      <Button className="w-full" type="button" variant="outline" disabled={busy}
        onClick={() => void run(() => pending ? confirm(pending) : managementHash ? checkManagement(managementHash) : refresh())}>
        {copy.refresh}
      </Button>
      {message && <p role="status" className="text-sm text-muted-foreground">
        {isWalletFailure(message) ? copy[message] : messages[message]}
      </p>}
    </SubscriptionCard>
  );
}
