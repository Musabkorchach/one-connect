import { Address, StrKey, TransactionBuilder, nativeToScVal, rpc, scValToNative, xdr } from "@stellar/stellar-sdk";

export const serviceId = "460";
export const contractAddress = "CCUF75B6W3HRJTJD6O7OXNI72HGJ7DERZ5MUNOMFMSK23ME5GUIKPFYV";
const network = "Pi Testnet";
const horizon = "https://api.testnet.minepi.com";
const merchant = "GBSPHKSOUOXUZSJ2IW7KCGJIJ47T22MLT7GHCTPCKMTLYFZTQFYTEISV";
const contract = Address.fromString(contractAddress).toScAddress();
const rpcServer = new rpc.Server("https://rpc.testnet.minepi.com", { timeout: 8000 });
const serviceKey = nativeToScVal(BigInt(serviceId), { type: "u64" });

async function ledgerValue(symbol, ...args) {
  const key = xdr.LedgerKey.contractData(new xdr.LedgerKeyContractData({
    contract, key: xdr.ScVal.scvVec([nativeToScVal(symbol, { type: "symbol" }), ...args]),
    durability: xdr.ContractDataDurability.persistent(),
  }));
  const { entries } = await rpcServer.getLedgerEntries(key);
  return entries[0] ? scValToNative(entries[0].val.contractData().val()) : null;
}

async function horizonGet(path) {
  const reply = await fetch(horizon + path, { signal: AbortSignal.timeout(8000), redirect: "error" });
  if (reply.status === 404) return null;
  if (!reply.ok) throw new Error("Pi Testnet unavailable");
  return reply.json();
}

export function matchesService(plan) {
  return plan?.service_id === 460n && plan.merchant === merchant && plan.price === 1000000n &&
    plan.period_secs === 2629746n && plan.trial_period_secs === 0n && plan.approve_periods === 1n;
}

export function verifySubscribeTransaction(record, intent) {
  const created = Date.parse(record?.created_at);
  if (record?.successful !== true || record.source_account !== intent.wallet ||
      !Number.isFinite(created) || created < intent.startedAt || created > intent.expiresAt) return false;
  try {
    const transaction = TransactionBuilder.fromXDR(record.envelope_xdr, network);
    if (transaction.hash().toString("hex") !== record.hash || transaction.source !== intent.wallet ||
        transaction.sequence !== intent.sequence || transaction.operations.length !== 1) return false;
    const [op] = transaction.operations;
    if (op.type !== "invokeHostFunction" || (op.source && op.source !== intent.wallet) ||
        op.func.switch().name !== "hostFunctionTypeInvokeContract") return false;
    const invocation = op.func.invokeContract();
    const args = invocation.args().map(scValToNative);
    return Address.fromScAddress(invocation.contractAddress()).toString() === contractAddress &&
      invocation.functionName().toString() === "subscribe" && args.length === 4 &&
      args[0] === intent.wallet && args[1] === 460n && args[2] === false && args[3] === 1n;
  } catch {
    return false;
  }
}

export const piTestnet = {
  async service() {
    const plan = await ledgerValue("Service", serviceKey);
    if (!matchesService(plan)) throw new Error("Unexpected One Connect Testnet service");
    return { active: plan.is_active === true };
  },
  isWallet: (value) => typeof value === "string" && StrKey.isValidEd25519PublicKey(value),
  async nextSequence(wallet) {
    const account = await horizonGet("/accounts/" + wallet);
    if (!account || !/^\d+$/.test(account.sequence)) throw new Error("Testnet wallet unavailable");
    return String(BigInt(account.sequence) + 1n);
  },
  transaction: (hash) => horizonGet("/transactions/" + hash),
  async subscription(wallet, now = Date.now()) {
    const id = await ledgerValue("SubServicePair", Address.fromString(wallet).toScVal(), serviceKey);
    if (id === null) return { status: "unknown" }; // Archived and absent keys cannot be distinguished here.
    const sub = await ledgerValue("Sub", nativeToScVal(id, { type: "u64" }));
    if (!sub || sub.sub_id !== id || sub.service_id !== 460n || sub.subscriber !== wallet ||
        typeof sub.service_end_ts !== "bigint" || typeof sub.auto_renew !== "boolean") return { status: "unknown" };
    const end = new Date(Number(sub.service_end_ts) * 1000);
    if (!Number.isFinite(end.valueOf()) || end.valueOf() <= 0) return { status: "unknown" };
    return { status: end.valueOf() > now ? "active" : "expired", endsAt: end.toISOString(),
      subscriptionId: String(id), autoRenew: sub.auto_renew };
  },
};
