export const monthlyTestnetPrice = "0.1";

type WalletSubscription =
  | { status: "unknown" | "none" }
  | { status: "active" | "expired"; endsAt: string };

const unknown: WalletSubscription = { status: "unknown" };
const serviceIdPattern = /^(0|[1-9][0-9]{0,19})$/;
export const testnetWalletPattern = /^G[A-Z2-7]{55}$/;

export interface PiSubscriptionReader {
  getService(wallet: string, serviceId: string, options: { mode: "simulate" }): Promise<unknown>;
  getSubscriberSubscriptions(wallet: string, options: { mode: "simulate" }): Promise<unknown>;
}

function objectRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" ? value as Record<string, unknown> : undefined;
}

export async function readTestnetWalletSubscription(
  sdk: PiSubscriptionReader | undefined,
  serviceId: string | undefined,
  wallet: string,
  now = Date.now,
): Promise<WalletSubscription> {
  if (!sdk || !serviceId || !serviceIdPattern.test(serviceId) || !testnetWalletPattern.test(wallet)) return unknown;

  try {
    // Pi's Subscription SDK currently points to its Testnet contract.
    const options = { mode: "simulate" } as const;
    const [service, subscriptions] = await Promise.all([
      sdk.getService(wallet, serviceId, options),
      sdk.getSubscriberSubscriptions(wallet, options),
    ]);
    const plan = objectRecord(service);
    if (!plan || plan.service_id !== serviceId || plan.price !== "1000000" || plan.period_secs !== "2629746" || !Array.isArray(subscriptions)) {
      return unknown;
    }

    const matching = [];
    for (const item of subscriptions) {
      const record = objectRecord(item);
      if (!record || typeof record.service_id !== "string" || !serviceIdPattern.test(record.service_id)) return unknown;
      if (record.service_id === serviceId) matching.push(record);
    }
    if (matching.length === 0) return { status: "none" };
    const end = matching[0].service_end_ts;
    if (matching.length !== 1 || matching[0].subscriber !== wallet || typeof end !== "string" || !/^[0-9]{1,12}$/.test(end)) return unknown;
    const endMs = Number(end) * 1000;
    if (endMs <= 0) return unknown;
    return { status: endMs > now() ? "active" : "expired", endsAt: new Date(endMs).toISOString() };
  } catch {
    return unknown;
  }
}
