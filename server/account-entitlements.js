export const subscriptionPlan = Object.freeze({ pricePi: "0.1", cycle: "monthly" });

export function subscriptionSettings(env) {
  return {
    enforcementEnabled: env.NODE_ENV === "test" && env.ONE_CONNECT_TEST_SUBSCRIPTION_ENFORCEMENT === "1",
    collectionEnabled: env.NODE_ENV === "test" && env.ONE_CONNECT_TEST_SUBSCRIPTION_COLLECTION === "1",
  };
}

export const subscriptionFixtureCollection = "test_account_entitlement_periods";

export function subscriptionProofMode(env, bindAccounts) {
  const simulated = env.ONE_CONNECT_TEST_SUBSCRIPTION_FIXTURES === "1";
  // Reserved configuration guard. It does not enable a verifier or collection.
  if (simulated && env.ONE_CONNECT_PI_TESTNET_SUBSCRIPTIONS === "1") {
    throw new Error("Subscription fixtures cannot run with the Pi Testnet provider configured");
  }
  if (simulated && (env.NODE_ENV !== "test" || !bindAccounts)) {
    throw new Error("Subscription fixtures require local account-binding tests");
  }
  return simulated;
}

// The internal write boundary stays closed until Pi provides a verified way to bind
// the signing Testnet wallet to the session UID and we can verify settlement.
// A public transaction hash or a client/SDK success flag cannot prove that binding.
export async function recordVerifiedPeriod() {
  return { status: "unavailable" };
}

export function createAccountEntitlements({ db, now = Date.now, useFixtures = false }) {
  const periods = useFixtures ? db.collection(subscriptionFixtureCollection) : null;
  async function status(accountId) {
    const at = new Date(now());
    const period = await periods?.findOne({ accountId, startsAt: { $lte: at } },
      { sort: { endsAt: -1, startsAt: -1 } });

    return {
      // Feature access stays free throughout this phase, independently of payment status.
      accessMode: "free",
      plan: subscriptionPlan,
      entitlement: period
        ? { status: period.endsAt > at ? "active" : "expired", source: period.source, startsAt: period.startsAt, endsAt: period.endsAt }
        : { status: "none" },
    };
  }

  return { status };
}

export function registerSubscriptionStatus({ app, db, privateData, settings, useFixtures }) {
  const entitlements = createAccountEntitlements({ db, useFixtures });
  app.get("/api/subscriptions/status", privateData.requirePrivateSession, async (req, res, next) => {
    try {
      const status = await entitlements.status(req.user.accountId);
      if (await privateData.checkActive(req, res)) res.json({ ...status, settings });
    } catch (error) {
      next(error);
    }
  });
}
