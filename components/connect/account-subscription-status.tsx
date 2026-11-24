"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { usePiAuth } from "@/contexts/pi-auth-context";
import { API_URL } from "@/lib/api-client";
import { monthlyTestnetPrice, resolveTestnetSubscriptionServiceId, submitTestnetSubscription, testnetWalletPattern } from "@/lib/pi-testnet-subscription";
import type { LangId } from "@/lib/connect/data";
import { Button } from "./ui";

const endpoint = API_URL + "/api/pi-testnet/subscription";
type Proof = { id: string; hash: string };
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
    if (response.status === 403 && path === "/prepare") throw new Error("wallet");
    if (!response.ok) throw new Error(response.status === 422 ? "rejected" : "unavailable");
    return await response.json();
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", cancel);
  }
}

export function AccountSubscriptionStatus({ sessionToken, language }: { sessionToken: string; language: LangId }) {
  const { isCurrentSession } = usePiAuth();
  if (typeof window === "undefined" || !isCurrentSession(sessionToken)) return null;
  const serviceId = resolveTestnetSubscriptionServiceId(
    window.location.origin,
    process.env.NEXT_PUBLIC_PI_TESTNET_SUBSCRIPTION_SERVICE_ID,
  );
  if (!serviceId) return null;
  return <SubscriptionPanel key={sessionToken} token={sessionToken} language={language} serviceId={serviceId} isCurrentSession={isCurrentSession} />;
}

function SubscriptionPanel({ token, language, serviceId, isCurrentSession }: {
  token: string;
  language: LangId;
  serviceId: NonNullable<ReturnType<typeof resolveTestnetSubscriptionServiceId>>;
  isCurrentSession: (token: string) => boolean;
}) {
  const [wallet, setWallet] = useState("");
  const [result, setResult] = useState<Status | null>(null);
  const [proof, setProof] = useState<Proof | null>(null);
  const [managementHash, setManagementHash] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<"wallet" | "unavailable" | "pending" | "rejected" | null>(null);
  const inFlight = useRef(false);
  const arabic = language === "ar";
  const current = useCallback(() => isCurrentSession(token), [isCurrentSession, token]);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    try {
      const status = await request<Status>(token, "", undefined, signal);
      if (current() && !signal?.aborted) {
        setResult(status?.plan?.network === "Pi Testnet" && status.plan.serviceId === serviceId &&
          typeof status.plan.active === "boolean" ? status : null);
      }
    } catch {
      if (current() && !signal?.aborted) setResult(null);
    }
  }, [current, serviceId, token]);

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
    if (!current() || !result || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setMessage(null);
    try {
      await action();
    } catch (error) {
      if (current()) {
        const code = error instanceof Error ? error.message : "";
        if (code === "rejected") setProof(null);
        setMessage(code === "wallet" || code === "rejected" ? code : "unavailable");
        await refresh();
      }
    } finally {
      inFlight.current = false;
      if (current()) setBusy(false);
    }
  }

  function enroll(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const address = result?.wallet ?? wallet.trim();
    if (!testnetWalletPattern.test(address) || !result?.plan.active || result.reserved || result.pending || proof) return;
    void run(async () => {
      const pi = window.Pi;
      const sdk = pi?.SmartContract?.Subscription;
      if (!sdk || !pi.authenticate) throw new Error("unavailable");
      const { accessToken } = await pi.authenticate(["username", "payments", "wallet_address"], () => {});
      if (!current()) return;
      const { id } = await request<{ id: string }>(token, "/prepare", { wallet: address, accessToken });
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
      const sub = result?.subscription;
      if (!sdk || !result?.wallet || !sub || !("subscriptionId" in sub) ||
          (action === "renew" && sub.status !== "active") || managementHash) throw new Error("unavailable");
      const hash = await submitTestnetSubscription(sdk, action, result.wallet, sub.subscriptionId, current);
      if (!current()) return;
      setManagementHash(hash);
      await checkManagement(hash);
    });
  }

  if (!result) return null;

  const subscription = result.subscription;
  const pending = proof ?? result?.pending;
  const statusText = subscription?.status === "active" ? (arabic ? "نشط" : "Active")
    : subscription?.status === "expired" ? (arabic ? "منتهٍ" : "Expired")
    : (arabic ? "غير معلومة" : "Unknown");
  const messages = {
    wallet: arabic ? "لم يؤكد Pi أن هذه المحفظة تخص حسابك." : "Pi could not verify this wallet for your account.",
    unavailable: arabic ? "تعذّر التحقق من العملية. حدّث الحالة قبل المحاولة مجددًا." : "Could not verify the operation. Refresh the status before trying again.",
    pending: arabic ? "المعاملة بانتظار التأكيد." : "Awaiting transaction confirmation.",
    rejected: arabic ? "لم يؤكد Pi المعاملة." : "Pi did not confirm the transaction.",
  };

  return (
    <section className="space-y-3 rounded-2xl pc-glass p-4" dir={arabic ? "rtl" : "ltr"}>
      <h2 className="font-semibold">{arabic ? "اشتراك Pi على Testnet" : "Pi Subscription · Testnet"}</h2>
      <p className="text-sm text-muted-foreground">
        {arabic ? `${monthlyTestnetPrice} Pi تجريبية شهريًا. الخدمات الحالية مجانية.`
          : `${monthlyTestnetPrice} Test-Pi per month. Current services are free.`}
      </p>
      <p role="status" className="text-sm">{arabic ? "حالة اشتراك الحساب: " : "Account subscription: "}{statusText}</p>
      {subscription && "endsAt" in subscription && (
        <p className="text-sm">
          {arabic ? "نهاية الفترة" : "Period ends"}{" "}
          <time dateTime={subscription.endsAt}>{new Intl.DateTimeFormat(arabic ? "ar" : "en", {
            dateStyle: "medium", timeStyle: "short", timeZone: "UTC",
          }).format(new Date(subscription.endsAt))} UTC</time>
        </p>
      )}
      {result?.plan.active && (!result.wallet || (subscription?.status === "expired" && !subscription.autoRenew)) && !pending && !result.reserved && (
        <form className="space-y-2" onSubmit={enroll}>
          {!result.wallet && (
            <label className="block space-y-1 text-sm">
              <span>{arabic ? "عنوان محفظة Pi العام على Testnet" : "Public Pi Testnet wallet address"}</span>
              <input className="w-full rounded-xl border border-border bg-background px-3 py-2"
                dir="ltr" autoCapitalize="characters" autoComplete="off" spellCheck={false} maxLength={56}
                value={wallet} onChange={(event) => setWallet(event.target.value)} />
            </label>
          )}
          <Button className="w-full" type="submit" disabled={busy || !testnetWalletPattern.test(result.wallet ?? wallet.trim())}>
            {arabic ? "اشترك لدورة واحدة دون تجديد تلقائي" : "Subscribe for one period without auto-renewal"}
          </Button>
        </form>
      )}
      {!pending && result?.reserved && <p className="text-sm">{arabic ? "هناك محاولة اشتراك قيد التحقق." : "A subscription attempt is being checked."}</p>}
      {subscription && "subscriptionId" in subscription && (subscription.status === "active" || subscription.autoRenew) && (
        <div className="space-y-2">
          <Button className="w-full" type="button" variant="outline" disabled={busy || !!managementHash}
            onClick={() => manage(subscription.autoRenew ? "cancel" : "renew")}>
            {subscription.autoRenew ? (arabic ? "أوقف التجديد التلقائي" : "Turn off auto-renewal")
              : (arabic ? "وافق على تجديد دورة واحدة" : "Approve one renewal")}
          </Button>
        </div>
      )}
      <Button className="w-full" type="button" variant="outline" disabled={busy}
        onClick={() => void run(() => pending ? confirm(pending) : managementHash ? checkManagement(managementHash) : refresh())}>
        {arabic ? "حدّث الحالة" : "Refresh status"}
      </Button>
      {message && <p role="status" className="text-sm text-muted-foreground">{messages[message]}</p>}
    </section>
  );
}
