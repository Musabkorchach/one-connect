"use client";

import { useEffect, useState, type FormEvent } from "react";
import { usePiAuth } from "@/contexts/pi-auth-context";
import { monthlyTestnetPrice, readTestnetWalletSubscription, testnetWalletPattern } from "@/lib/pi-testnet-subscription";
import type { LangId } from "@/lib/connect/data";
import { Button } from "./ui";

const serviceId = process.env.NEXT_PUBLIC_PI_TESTNET_SUBSCRIPTION_SERVICE_ID;

export function AccountSubscriptionStatus({ sessionToken, language }: { sessionToken: string; language: LangId }) {
  const { isCurrentSession } = usePiAuth();
  if (!isCurrentSession(sessionToken)) return null;
  return <SubscriptionPanel key={sessionToken} token={sessionToken} language={language} isCurrentSession={isCurrentSession} />;
}

function SubscriptionPanel({ token, language, isCurrentSession }: {
  token: string;
  language: LangId;
  isCurrentSession: (token: string) => boolean;
}) {
  const [wallet, setWallet] = useState("");
  const [request, setRequest] = useState<{ wallet: string } | null>(null);
  const [result, setResult] = useState<Awaited<ReturnType<typeof readTestnetWalletSubscription>> | null>(null);

  useEffect(() => {
    if (!request) return;
    let current = true;
    const finish = (value: NonNullable<typeof result>) => {
      if (!current || !isCurrentSession(token)) return;
      current = false;
      clearTimeout(timeout);
      setResult(value);
    };
    const timeout = setTimeout(() => finish({ status: "unknown" }), 12000);
    void readTestnetWalletSubscription(window.Pi?.SmartContract?.Subscription, serviceId, request.wallet).then(finish);
    return () => {
      current = false;
      clearTimeout(timeout);
    };
  }, [request, token, isCurrentSession]);

  function check(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!serviceId || !testnetWalletPattern.test(wallet.trim())) return;
    setResult(null);
    setRequest({ wallet: wallet.trim() });
  }

  const arabic = language === "ar";
  const status = {
    unknown: arabic ? "غير معلومة" : "Unknown",
    none: arabic ? "لا يوجد اشتراك لهذه المحفظة" : "No subscription for this wallet",
    active: arabic ? "اشتراك المحفظة نشط" : "Wallet subscription active",
    expired: arabic ? "اشتراك المحفظة منتهٍ" : "Wallet subscription expired",
  };
  const busy = !!request && !result;
  return (
    <section className="space-y-3 rounded-2xl pc-glass p-4" dir={arabic ? "rtl" : "ltr"}>
      <h2 className="font-semibold">{arabic ? "اشتراك Pi على Testnet" : "Pi Subscription · Testnet"}</h2>
      <p className="text-sm text-muted-foreground">
        {arabic ? `الخطة: ${monthlyTestnetPrice} Pi تجريبية شهريًا. الخدمات الحالية مجانية.`
          : `Plan: ${monthlyTestnetPrice} Test-Pi per month. Current services are free.`}
      </p>
      <p className="text-sm text-muted-foreground">
        {arabic ? "حالة اشتراك الحساب: غير معلومة. يعرض الفحص سجل المحفظة المدخلة من Pi فقط."
          : "Account subscription: unknown. The lookup shows the entered wallet’s Pi record."}
      </p>
      {serviceId && (
        <form className="space-y-2" onSubmit={check}>
          <label className="block space-y-1 text-sm">
            <span>{arabic ? "عنوان محفظة Pi العام على Testnet" : "Public Pi Testnet wallet address"}</span>
            <input className="w-full rounded-xl border border-border bg-background px-3 py-2"
              dir="ltr" autoCapitalize="characters" autoComplete="off" spellCheck={false} maxLength={56}
              value={wallet} onChange={(event) => {
                setWallet(event.target.value);
                setRequest(null);
                setResult(null);
              }} />
          </label>
          <Button className="w-full" type="submit" disabled={busy || !testnetWalletPattern.test(wallet.trim())}>
            {arabic ? "تحقق من المحفظة" : "Check wallet subscription"}
          </Button>
        </form>
      )}
      <p role="status" className="text-sm">
        {busy ? (arabic ? "جارٍ التحقق…" : "Checking…") : status[result?.status ?? "unknown"]}
      </p>
      {result && "endsAt" in result && (
        <p className="text-sm">
          {arabic ? "نهاية الفترة" : "Period ends"}{" "}
          <time dateTime={result.endsAt}>{new Intl.DateTimeFormat(arabic ? "ar" : "en", {
            dateStyle: "medium", timeStyle: "short", timeZone: "UTC",
          }).format(new Date(result.endsAt))} UTC</time>
        </p>
      )}
    </section>
  );
}
