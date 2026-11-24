const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { test } = require("node:test");
const ts = require("typescript");

function compile(path) {
  const source = readFileSync(join(__dirname, "..", path), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  });
  return new Function("require", "exports", "window", "fetch", "process", outputText);
}

const loadProfile = compile("components/connect/profile-view.tsx");
const loadStatus = compile("components/connect/account-subscription-status.tsx");
const loadLibrary = compile("lib/pi-testnet-subscription.ts");
const plan = { plan: { active: true, network: "Pi Testnet", serviceId: "460" }, wallet: null,
  subscription: { status: "unknown" }, pending: null, reserved: false };

function nodes(element) {
  if (Array.isArray(element)) return element.flatMap(nodes);
  if (element == null || typeof element === "boolean") return [];
  if (element.type?.name === "SubscriptionCard") return nodes(element.type(element.props));
  return typeof element === "object" ? [element, ...nodes(element.props?.children)] : [element];
}

function mount({ origin = "https://demo-kzmpbl6a30a2bigtxrna.vusercontent.net", serviceId,
  response = [200, plan], piSdkReady = true,
  prepareResponse = [403, "WALLET_ADDRESS_MISMATCH"], authorize = async () => ({ accessToken: "pi-token" }),
  sdkFailure } = {}) {
  const auth = { sessionToken: "production-session", isCurrentSession: token => token === "production-session",
    subscriptionStatusSupported: false, privateDataOwner: null, sdk: null, piSdkReady };
  const calls = { scopes: [], prepares: [], subscriptions: 0, modes: [], starts: [], releases: [], confirmations: [] };
  const hash = "a".repeat(64);
  const browse = { location: { origin }, Pi: {
    async authenticate(scopes) { calls.scopes.push(scopes); return authorize(); },
    SmartContract: { Subscription: { async subscribe(_wallet, id, autoRenew, periods, { mode }) {
      assert.deepEqual([id, autoRenew, periods], ["460", false, "1"]);
      calls.subscriptions++;
      calls.modes.push(mode);
      if (sdkFailure?.mode === mode) throw new Error(sdkFailure.message);
      return { hash };
    } } },
  } };
  const jsx = (type, props) => ({ type, props });
  const ui = { Header: "header", Button: "button", Avatar: "avatar", cx: (...values) => values.join(" ") };
  const state = [];
  let cursor = 0;
  let mountEffect;
  let requests = 0;
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in state)) state[index] = initial;
      return [state[index], value => { state[index] = value; }];
    },
    useRef(initial) { return state[cursor++] ??= { current: initial }; },
    useCallback(callback) { return callback; },
    useEffect(callback) { mountEffect ??= callback; },
  };
  const library = {};
  loadLibrary(null, library);
  const status = {};
  loadStatus(name => ({
    react, "react/jsx-runtime": { jsx, jsxs: jsx }, "@/contexts/pi-auth-context": { usePiAuth: () => auth },
    "@/lib/api-client": { API_URL: "https://backend.example" }, "@/lib/pi-testnet-subscription": library, "./ui": ui,
  })[name], status, browse, async (url, { method, headers, body }) => {
    requests++;
    assert.equal(headers.Authorization, "Bearer production-session");
    if (url.endsWith("/prepare")) {
      assert.equal(method, "POST");
      calls.prepares.push(JSON.parse(body));
      if (prepareResponse[0] === 200) return { ok: true, json: async () => ({ id: "fixture-attempt" }) };
      return { ok: false, status: prepareResponse[0], json: async () => ({ code: prepareResponse[1] }) };
    }
    if (url.endsWith("/confirm")) {
      assert.equal(method, "POST");
      calls.confirmations.push(JSON.parse(body));
      return { ok: true, json: async () => ({ state: "pending" }) };
    }
    if (url.endsWith("/start") || url.endsWith("/release")) {
      assert.equal(method, "POST");
      const start = url.endsWith("/start");
      calls[start ? "starts" : "releases"].push(JSON.parse(body));
      return { ok: true, json: async () => ({ state: start ? "submitting" : "released" }) };
    }
    assert.equal(method, "GET");
    return { ok: response[0] === 200, status: response[0], json: async () => response[1] };
  }, { env: { NEXT_PUBLIC_PI_TESTNET_SUBSCRIPTION_SERVICE_ID: serviceId } });
  const profile = {};
  loadProfile(name => ({
    react: { useState: initial => [initial, () => {}] }, "react/jsx-runtime": { jsx, jsxs: jsx },
    "@/contexts/connect-context": { useConnect: () => ({ t: { profileTitle: "Profil" },
      profile: { username: "pioneer", displayName: "Pioneer", language: "fr" } }) },
    "@/contexts/pi-auth-context": { usePiAuth: () => auth }, "@/lib/connect/data": { LANGUAGES: [] },
    "./account-subscription-status": status, "./ui": ui, "./icons": {}, "./feedback": {},
  })[name], profile, browse);
  const entry = nodes(profile.ProfileView()).find(node => node.type === status.AccountSubscriptionStatus);
  assert.ok(entry, "production ProfileView mounts the subscription component");
  const render = () => {
    cursor = 0;
    const element = entry.type(entry.props);
    return nodes(typeof element?.type === "function" ? element.type(element.props) : element);
  };
  const first = render();
  const cleanup = mountEffect?.();
  return { first, render, cleanup, auth, calls, get requests() { return requests; },
    respond(value) { response = value; } };
}

const settle = () => new Promise(setImmediate);

test("ordinary Profil shows the subscription card and status without experimental account mode or SDKLite", async () => {
  const app = mount();
  assert.ok(app.first.some(node => node.type === "section"));
  await settle();
  assert.ok(app.render().some(node => node.type === "form"));
  assert.equal(app.requests, 1);
  app.cleanup();
});

test("an inactive verified plan explains why new subscriptions are closed", async () => {
  const app = mount({ response: [200, { ...plan, plan: { ...plan.plan, active: false } }] });
  await settle();
  const view = app.render();
  assert.ok(view.includes("Le forfait n’accepte pas de nouveaux abonnements pour le moment."));
  assert.ok(!view.some(node => node.type === "form"));
  app.cleanup();
});

function enroll(app) {
  const wallet = "G" + "A".repeat(55);
  app.render().find(node => node.type === "input").props.onChange({ target: { value: wallet } });
  app.render().find(node => node.type === "form").props.onSubmit({ preventDefault() {} });
  return wallet;
}

test("wallet errors are displayed separately without reaching simulation or clearing the plan", async () => {
  const cases = [
    [403, "WALLET_ADDRESS_MISSING", "Pi n’a renvoyé aucune adresse"],
    [403, "WALLET_ADDRESS_MISMATCH", "L’adresse renvoyée par Pi diffère"],
    [403, "WALLET_PI_AUTH_REJECTED", "Pi a refusé le jeton"],
    [503, "WALLET_PI_UNAVAILABLE", "Impossible de joindre Pi"],
    [403, "WALLET_PI_IDENTITY_MISMATCH", "Le compte Pi qui a autorisé l’accès diffère"],
  ];
  for (const [status, code, message] of cases) {
    const app = mount({ prepareResponse: [status, code] });
    await settle();
    const wallet = enroll(app);
    await settle();
    assert.deepEqual(app.calls.scopes, [["username", "payments"]]);
    assert.deepEqual(app.calls.prepares, [{ wallet, accessToken: "pi-token", protocol: 2 }]);
    assert.equal(app.calls.subscriptions, 0);
    assert.equal(app.requests, 2, "verification failure preserves the last confirmed subscription status");
    const view = app.render();
    assert.ok(view.some(node => typeof node === "string" && node.startsWith(message)));
    assert.ok(view.some(node => node.type === "form"));
    app.cleanup();
  }
});

test("the app waits for wallet consent and a declined authorization never starts preparation", async () => {
  let deny;
  const app = mount({ authorize: () => new Promise((_resolve, reject) => { deny = reject; }) });
  await settle();
  enroll(app);
  await settle();
  assert.equal(app.calls.prepares.length, 0);
  deny(new Error("fixture declined"));
  await settle();
  assert.equal(app.calls.prepares.length, 0);
  assert.equal(app.calls.subscriptions, 0);
  assert.ok(app.render().some(node => typeof node === "string" && node.startsWith("L’autorisation de paiement n’a pas abouti")));
  app.cleanup();
});

test("an authenticated user can prepare then simulate and confirm a signed Testnet subscription", async () => {
  const app = mount({ prepareResponse: [200] });
  await settle();
  const wallet = enroll(app);
  await settle();
  assert.deepEqual(app.calls.scopes, [["username", "payments"]]);
  assert.deepEqual(app.calls.prepares, [{ wallet, accessToken: "pi-token", protocol: 2 }]);
  assert.deepEqual(app.calls.modes, ["simulate", "submit"]);
  assert.deepEqual(app.calls.starts, [{ id: "fixture-attempt" }]);
  assert.deepEqual(app.calls.confirmations, [{ id: "fixture-attempt", hash: "a".repeat(64) }]);
  assert.ok(app.render().includes("Awaiting transaction confirmation."));
  assert.ok(!app.render().some(node => node.type === "form"));
  app.cleanup();
});

test("simulation failure and explicit wallet rejection release the attempt; uncertain submission does not", async () => {
  for (const [mode, message, release] of [
    ["simulate", "Simulation failed", false],
    ["submit", "User rejected.", true],
    ["submit", "Network error", null],
  ]) {
    const app = mount({ prepareResponse: [200], sdkFailure: { mode, message } });
    await settle();
    enroll(app);
    await settle();
    assert.deepEqual(app.calls.starts, mode === "submit" ? [{ id: "fixture-attempt" }] : []);
    assert.deepEqual(app.calls.releases, release === null ? [] : [{ id: "fixture-attempt", walletRejected: release }]);
    assert.deepEqual(app.calls.confirmations, []);
    app.cleanup();
  }
});

test("a forbidden or unavailable service stays visible and can be retried", async () => {
  const app = mount({ response: [403] });
  await settle();
  const denied = app.render();
  assert.ok(denied.includes("Le serveur n’a pas autorisé l’abonnement pour cette session ou cet aperçu."));
  assert.ok(!denied.some(node => node.type === "form"));
  app.respond([200, plan]);
  denied.find(node => node.type === "button").props.onClick();
  await settle();
  assert.ok(app.render().some(node => node.type === "form"));
  app.cleanup();

  for (const response of [[404], [503], [200, { plan: { active: true, network: "Pi Network", serviceId: "460" } }]]) {
    const unavailable = mount({ response });
    await settle();
    const view = unavailable.render();
    assert.ok(view.some(node => node.type === "section"));
    assert.ok(view.some(node => node.props?.role === "status"));
    assert.ok(!view.some(node => node.type === "form"));
    unavailable.cleanup();
  }
});

test("unsupported contexts and invalid configuration do not request a plan; missing SDK does not hide it", async () => {
  for (const options of [{ origin: "https://mainnet.example" }, { serviceId: "461" }]) {
    const app = mount(options);
    assert.ok(app.first.some(node => node.type === "section"));
    assert.ok(app.first.some(node => node.props?.role === "status"));
    assert.equal(app.requests, 0);
  }
  const app = mount({ piSdkReady: false });
  await settle();
  const view = app.render();
  assert.ok(view.includes("Les transactions d’abonnement sont indisponibles dans cette session Pi Browser."));
  assert.ok(view.some(node => node.props?.type === "submit" && node.props.disabled));
  app.auth.piSdkReady = true;
  assert.ok(!app.render().includes("Les transactions d’abonnement sont indisponibles dans cette session Pi Browser."));
  app.cleanup();
});
