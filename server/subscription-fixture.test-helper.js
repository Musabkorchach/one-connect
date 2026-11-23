import { createAccountEntitlements, subscriptionFixtureCollection } from "./account-entitlements.js";

export class EntitlementProofConflict extends Error {
  constructor() {
    super("This proof is already bound to another account or period");
  }
}

export async function createSubscriptionFixture({ db, writeAccount, now = Date.now }) {
  if (!process.env.NODE_TEST_CONTEXT) throw new Error("Subscription fixtures require the Node test runner");
  const periods = db.collection(subscriptionFixtureCollection);
  await periods.createIndex({ accountId: 1, endsAt: -1, startsAt: 1 });

  // Generates evidence only for the isolated fixture store.
  async function recordFixturePeriod(accountId, { source, proofId, startsAt, endsAt }) {
    if (typeof accountId !== "string" || !accountId.trim() || source !== "test-fixture" ||
        typeof proofId !== "string" || !proofId.trim() || proofId.length > 512 ||
        !(startsAt instanceof Date) || !(endsAt instanceof Date) ||
        !Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime()) || startsAt >= endsAt) {
      throw new TypeError("Invalid verified subscription period");
    }

    // The verifier assigns a canonical identifier per settled cycle, not per polling attempt.
    const id = { source, proofId };
    const record = { _id: id, accountId, source, startsAt, endsAt };
    try {
      await writeAccount(accountId, (session) => periods.insertOne(record, { session }));
      return true;
    } catch (error) {
      if (error?.code !== 11000) throw error;
      const previous = await periods.findOne({ _id: id });
      if (previous?.accountId === accountId && previous.startsAt.getTime() === startsAt.getTime() &&
          previous.endsAt.getTime() === endsAt.getTime()) return false;
      throw new EntitlementProofConflict();
    }
  }

  return { recordFixturePeriod, status: createAccountEntitlements({ db, now, useFixtures: true }).status };
}
