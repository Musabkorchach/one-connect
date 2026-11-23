import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { createAccountEntitlements, recordVerifiedPeriod } from "./account-entitlements.js";

test("the internal boundary rejects provider-looking and simulated proofs", async () => {
  const forged = { source: "pi-testnet", network: "pi-testnet", success: true };
  for (const proof of [{ ...forged, mode: "submit" }, { ...forged, mode: "simulate" }, { source: "test-fixture" }]) {
    assert.deepEqual(await recordVerifiedPeriod("account", proof), { status: "unavailable" });
  }
  const store = createAccountEntitlements({
    db: { collection() { assert.fail("Runtime must not open any entitlement store while verification is unavailable"); } },
  });
  assert.deepEqual((await store.status("account")).entitlement, { status: "none" });
});
test("subscription startup rejects fixtures combined with provider configuration or outside local tests", () => {
  const script = fileURLToPath(new URL("./server.js", import.meta.url));
  for (const [configuration, message] of [
    [{ ONE_CONNECT_PI_TESTNET_SUBSCRIPTIONS: "1" }, /cannot run with the Pi Testnet provider/],
    [{ NODE_ENV: "production" }, /require local account-binding tests/],
    [{ ONE_CONNECT_TEST_ACCOUNT_BINDING: "0" }, /require local account-binding tests/],
  ]) {
    const result = spawnSync(process.execPath, [script], {
      cwd: tmpdir(), encoding: "utf8", timeout: 8000, windowsHide: true,
      env: {
        SystemRoot: process.env.SystemRoot, NODE_ENV: "test", ONE_CONNECT_TEST_ACCOUNT_BINDING: "1",
        ONE_CONNECT_TEST_SUBSCRIPTION_FIXTURES: "1", ...configuration,
      },
    });
    assert.ifError(result.error);
    assert.equal(result.status, 1);
    assert.match(result.stderr, message);
    assert.doesNotMatch(result.stdout, /MongoDB connected/);
  }
});
