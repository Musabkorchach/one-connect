"use client";

import { useEffect, useState } from "react";
import { usePiAuth } from "@/contexts/pi-auth-context";
import { API_URL } from "@/lib/api-client";
import { fetchSubscriptionStatus, loadSubscriptionStatus, type SubscriptionStatus } from "@/lib/account-subscription-status";
import { RTL_LANGS, type LangId } from "@/lib/connect/data";
import { getDict } from "@/lib/connect/i18n";
import { subscriptionCopy } from "@/lib/connect/subscription-copy";
import { Button } from "./ui";

export function AccountSubscriptionStatus({ sessionToken, language }: { sessionToken: string; language: LangId }) {
  const { subscriptionStatusSupported, isCurrentSession } = usePiAuth();
  if (!subscriptionStatusSupported || !isCurrentSession(sessionToken)) return null;
  return <SubscriptionStatusPanel key={sessionToken} token={sessionToken} language={language} isCurrentSession={isCurrentSession} />;
}

function SubscriptionStatusPanel({ token, language, isCurrentSession }: {
  token: string; language: LangId; isCurrentSession: (token: string) => boolean;
}) {
  const [result, setResult] = useState<SubscriptionStatus | "error" | null>(null);
  const [request, setRequest] = useState(0);
  useEffect(() => loadSubscriptionStatus(
    (signal) => fetchSubscriptionStatus(API_URL, token, signal),
    () => isCurrentSession(token),
    setResult,
    () => setResult("error"),
  ), [request, token, isCurrentSession]);
  const copy = subscriptionCopy[language];
  const dictionary = getDict(language);

  return (
    <section className="space-y-3 rounded-2xl pc-glass p-4" lang={language} dir={RTL_LANGS.includes(language) ? "rtl" : "ltr"}>
      <h2 className="font-semibold">{copy.title}</h2>
      {result === "error" ? (
        <>
          <p role="status" className="text-sm text-muted-foreground">{copy.error}</p>
          <Button type="button" variant="outline" onClick={() => {
            setResult(null);
            setRequest((attempt) => attempt + 1);
          }}>{dictionary.invoicesRetry}</Button>
        </>
      ) : result ? (
        <div role="status" className="space-y-2 text-sm text-muted-foreground">
          <p>{copy.free}</p>
          <p>{copy[result.entitlement.status]}</p>
          {result.entitlement.status !== "none" && (
            <p>{copy.expiration}{" "}<time dateTime={result.entitlement.endsAt}>
              {new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })
                .format(new Date(result.entitlement.endsAt))} UTC
            </time></p>
          )}
          <p>{copy.price.replace("{price}", result.plan.pricePi)}</p>
        </div>
      ) : <p role="status" className="text-sm text-muted-foreground">{dictionary.connecting}</p>}
    </section>
  );
}
