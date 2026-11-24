import { createServer } from "node:http";

const [origin, port = "4179"] = process.argv.slice(2);
if (!origin || new URL(origin).origin !== origin || !origin.startsWith("https://")) {
  throw new Error("Usage: node tests/pi-subscription-wallet-diagnostic.mjs https://registered-test-origin [port]");
}

const page = `<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Pi Testnet wallet diagnostic</title>
<h1>Pi Testnet wallet diagnostic</h1>
<button id="run">Check SDK and Pi identity</button>
<pre id="report" aria-live="polite" style="white-space:pre-wrap"></pre>
<script src="https://sdk.minepi.com/pi-sdk.js"></script>
<script>
const button = document.getElementById("run");
const output = document.getElementById("report");
const scopes = ["username", "payments", "wallet_address"];
button.onclick = async () => {
  button.disabled = true;
  const report = { sdkAvailable: typeof window.Pi?.authenticate === "function" };
  let stage = "initialize";
  try {
    if (!report.sdkAvailable) return;
    await Pi.init({ version: "2.0" });
    const subscription = Pi.SmartContract?.Subscription;
    report.subscriptionMethods = Object.fromEntries(
      ["subscribe", "getService", "getSubscription", "getSubscriberSubscriptions", "isSubscriptionActive"]
        .map(name => [name, typeof subscription?.[name] === "function"])
    );
    stage = "authenticate";
    let incompletePaymentReported = false;
    const auth = await Pi.authenticate(scopes, () => { incompletePaymentReported = true; });
    report.incompletePaymentReported = incompletePaymentReported;
    report.clientUserFields = Object.keys(auth.user ?? {}).sort();
    stage = "verify";
    const response = await fetch("/verify", {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: auth.accessToken,
        clientUid: auth.user?.uid,
        clientAddress: auth.user?.wallet_address,
      }),
    });
    report.server = response.ok ? await response.json() : { checkFailed: true };
  } catch {
    report.failedStage = stage;
  } finally {
    output.textContent = JSON.stringify(report, null, 2);
    button.disabled = false;
  }
};
</script></html>`;

function matches(left, right) {
  return typeof left === "string" && left.length && typeof right === "string" && right.length
    ? left === right
    : null;
}

async function verify(req) {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 8192) throw new Error("Request too large");
  }
  const { token, clientUid, clientAddress } = JSON.parse(body);
  if (typeof token !== "string" || !token || token.length > 4096) throw new Error("Invalid token");
  const response = await fetch("https://api.minepi.com/v2/me", {
    headers: { Authorization: "Bearer " + token },
    redirect: "error",
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) return { piHttpStatus: response.status };
  const me = await response.json();
  return {
    piHttpStatus: response.status,
    piUserFields: Object.keys(me).sort(),
    grantedScopes: ["username", "payments", "wallet_address"].filter(
      scope => Array.isArray(me.credentials?.scopes) && me.credentials.scopes.includes(scope)
    ),
    uidMatchesClient: matches(me.uid, clientUid),
    walletAddressMatchesClient: matches(me.wallet_address, clientAddress),
  };
}

createServer(async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.method === "GET" && req.url === "/") {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.end(page);
  }
  if (req.method !== "POST" || req.url !== "/verify" || req.headers.origin !== origin ||
      req.headers["content-type"] !== "application/json") {
    res.writeHead(404);
    return res.end();
  }
  try {
    const report = await verify(req);
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify(report));
  } catch {
    res.writeHead(400);
    return res.end();
  }
}).listen(Number(port), "127.0.0.1", () => {
  console.log("Pi diagnostic is listening on loopback.");
});
