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
  response = [200, plan], piSdkReady = true } = {}) {
  const auth = { sessionToken: "production-session", isCurrentSession: token => token === "production-session",
    subscriptionStatusSupported: false, privateDataOwner: null, sdk: null, piSdkReady };
  const calls = { scopes: [], prepares: [], subscriptions: 0 };
  const browse = { location: { origin }, Pi: {
    async authenticate(scopes) { calls.scopes.push(scopes); return { accessToken: "pi-token" }; },
    SmartContract: { Subscription: { subscribe() { calls.subscriptions++; } } },
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
      return { ok: false, status: 403, json: async () => ({ code: "WALLET_UNVERIFIED" }) };
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

test("an unverified wallet cannot reach simulation or submission", async () => {
  const app = mount();
  await settle();
  const wallet = "G" + "A".repeat(55);
  app.render().find(node => node.type === "input").props.onChange({ target: { value: wallet } });
  app.render().find(node => node.type === "form").props.onSubmit({ preventDefault() {} });
  await settle();
  assert.deepEqual(app.calls.scopes, [["username", "payments", "wallet_address"]]);
  assert.deepEqual(app.calls.prepares, [{ wallet, accessToken: "pi-token" }]);
  assert.equal(app.calls.subscriptions, 0);
  assert.ok(app.render().includes("Pi n’a pas confirmé que ce portefeuille appartient à votre compte."));
  app.cleanup();
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
