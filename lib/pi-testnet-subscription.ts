export const monthlyTestnetPrice = "0.1";
const testnetServiceId = "460";
const registeredTestnetOrigin = "https://one-connect-git-develop-musabkorchachs-projects.vercel.app";
const previewOriginPattern = /^https:\/\/demo-[a-z0-9]+\.vusercontent\.net$/;

export function resolveTestnetSubscriptionServiceId(origin: string, configuredServiceId: string | undefined) {
  // A preview host is only a candidate. The server enforces the exact
  // One Connect Testnet origin allowlist and verifies the Pi session.
  if (origin !== registeredTestnetOrigin && !previewOriginPattern.test(origin)) return null;
  const serviceId = configuredServiceId ?? testnetServiceId;
  return serviceId === testnetServiceId ? serviceId : null;
}

const serviceIdPattern = /^(0|[1-9][0-9]{0,19})$/;
export const testnetWalletPattern = /^G[A-Z2-7]{55}$/;

type ExecutionMode = { mode: "simulate" | "submit" };

export interface PiSubscriptionSdk {
  subscribe(wallet: string, serviceId: string, autoRenew: boolean, periods: string, options: ExecutionMode): Promise<unknown>;
  toggleAutoRenew(wallet: string, subscriptionId: string, periods: string, options: ExecutionMode): Promise<unknown>;
  cancel(wallet: string, subscriptionId: string, options: ExecutionMode): Promise<unknown>;
}

export async function submitTestnetSubscription(
  sdk: PiSubscriptionSdk,
  action: "subscribe" | "cancel" | "renew",
  wallet: string,
  id: string,
  isCurrent: () => boolean,
): Promise<string> {
  if (!testnetWalletPattern.test(wallet) || !serviceIdPattern.test(id) || (action === "subscribe" && id !== testnetServiceId)) {
    throw new Error("Invalid Testnet subscription");
  }
  const invoke = (mode: ExecutionMode["mode"]) => {
    if (action === "subscribe") return sdk.subscribe(wallet, id, false, "1", { mode });
    if (action === "cancel") return sdk.cancel(wallet, id, { mode });
    return sdk.toggleAutoRenew(wallet, id, "1", { mode });
  };
  await invoke("simulate");
  if (!isCurrent()) throw new Error("Session changed");
  const result = await invoke("submit");
  const submitted = result as { hash?: unknown } | null;
  if (typeof submitted?.hash !== "string" || !/^[a-f0-9]{64}$/.test(submitted.hash)) {
    throw new Error("Transaction confirmation unavailable");
  }
  return submitted.hash;
}
