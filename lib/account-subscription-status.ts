export type SubscriptionStatus = {
  accessMode: "free";
  plan: { pricePi: string; cycle: "monthly" };
  entitlement: { status: "none" } | { status: "active" | "expired"; endsAt: string };
};

export async function fetchSubscriptionStatus(apiUrl: string, token: string, signal: AbortSignal): Promise<SubscriptionStatus> {
  const response = await fetch(`${apiUrl}/api/subscriptions/status`, {
    headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal,
  });
  if (!response.ok) throw new Error("Subscription status unavailable");

  const { accessMode, plan, entitlement } = await response.json();
  if (accessMode !== "free" || plan?.cycle !== "monthly" || typeof plan.pricePi !== "string" ||
      !/^\d+(?:\.\d+)?$/.test(plan.pricePi)) throw new Error("Invalid subscription status");
  if (entitlement?.status === "none") return { accessMode, plan, entitlement: { status: "none" } };
  if (["active", "expired"].includes(entitlement?.status) && typeof entitlement.endsAt === "string" &&
      Number.isFinite(Date.parse(entitlement.endsAt))) {
    return { accessMode, plan, entitlement: { status: entitlement.status, endsAt: entitlement.endsAt } };
  }
  throw new Error("Invalid subscription entitlement");
}

export function loadSubscriptionStatus(
  getStatus: (signal: AbortSignal) => Promise<SubscriptionStatus>,
  isCurrent: () => boolean,
  onStatus: (status: SubscriptionStatus) => void,
  onError: () => void,
) {
  const abort = new AbortController();
  const current = () => !abort.signal.aborted && isCurrent();
  void getStatus(abort.signal).then(
    (status) => { if (current()) onStatus(status); },
    () => { if (current()) onError(); },
  );
  return () => abort.abort();
}
