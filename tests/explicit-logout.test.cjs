const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { test } = require("node:test");
const ts = require("typescript");

function compile(path) {
  const source = readFileSync(join(__dirname, "..", path), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  });
  return new Function("require", "exports", "window", "Pi", outputText);
}

const loadProvider = compile("contexts/pi-auth-context.tsx");
const loadPi = compile("lib/pi.ts");
const loadScreen = compile("components/auth-loading-screen.tsx");
const loadDictionary = compile("lib/connect/i18n.ts");
const marker = "oneconnect.explicit-logout";
const config = { PI_NETWORK_CONFIG: {}, PRODUCT_CONFIG: {} };
const languages = {
  LANGUAGES: [{ id: "en" }, { id: "ar" }],
  RTL_LANGS: ["ar"],
};
const session = (sessionToken) => ({ sessionToken, userId: "pi_user", piUsername: "user" });
const credentials = { accessToken: "pi-token", user: { username: "user" } };

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

async function settle() {
  await new Promise((resolve) => setImmediate(resolve));
}

function mount({
  storage = new Map(),
  storageErrors = {},
  iframe = false,
  authenticate = async () => credentials,
  verify = async () => session("session"),
  products = async () => ({ products: [] }),
} = {}) {
  const calls = { pi: 0, verified: [], revoked: [], sockets: [], disconnects: 0, messages: [] };
  const listeners = new Set();
  const state = [];
  let cursor = 0;
  let effect;
  const jsx = (type, props) => ({ type, props });
  const react = {
    createContext: () => ({ Provider: "provider" }),
    useState(initial) {
      const index = cursor++;
      if (!(index in state)) state[index] = initial;
      return [state[index], (value) => {
        state[index] = typeof value === "function" ? value(state[index]) : value;
      }];
    },
    useRef(initial) {
      const index = cursor++;
      return state[index] ??= { current: initial };
    },
    useEffect(callback) { effect ??= callback; },
  };
  const win = {
    location: { origin: "https://example.test" },
    Pi: { init: async () => {}, authenticate: (...args) => { calls.pi++; return authenticate(...args); } },
    SDKLite: {
      init: async () => ({
        state: { products, restore: async () => ({ purchases: [] }), get: async () => null },
      }),
    },
    get sessionStorage() {
      if (storageErrors.unavailable) throw new Error("Storage unavailable");
      return {
        getItem(key) {
          if (storageErrors.read) throw new Error("Storage read failed");
          return storage.get(key) ?? null;
        },
        setItem(key, value) {
          if (storageErrors.write) throw new Error("Storage write failed");
          storage.set(key, value);
        },
        removeItem(key) {
          if (storageErrors.remove) throw new Error("Storage removal failed");
          storage.delete(key);
        },
      };
    },
    addEventListener: (_type, callback) => listeners.add(callback),
    removeEventListener: (_type, callback) => listeners.delete(callback),
  };
  win.self = win;
  win.top = iframe ? {} : win;
  win.parent = { postMessage: (message) => calls.messages.push(JSON.parse(message)) };
  const api = {
    verifyPiAuth: (token) => { calls.verified.push(token); return verify(token); },
    revokeSession: async (token) => { calls.revoked.push(token); },
    initSocket: (_userId, _username, token) => calls.sockets.push(token),
    disconnectSocket: () => { calls.disconnects++; },
  };
  const exportsPi = {};
  const modules = {
    react,
    "react/jsx-runtime": { jsx, jsxs: jsx },
    "@swetate/core": {
      createPiSDK: () => ({
        use(plugin) { this.auth = plugin.install({}).public; },
      }),
    },
    "@swetate/auth": {},
    "@/lib/api-client": api,
    "@/lib/connect/data": languages,
    "@/lib/system-config": config,
    "@/lib/product-config": config,
    "@/lib/pi": exportsPi,
  };
  const mockRequire = (name) => {
    assert.ok(Object.hasOwn(modules, name), name);
    return modules[name];
  };
  loadPi(mockRequire, exportsPi, win, win.Pi);
  const provider = {};
  loadProvider(mockRequire, provider, win, win.Pi);
  function render() {
    cursor = 0;
    return provider.PiAuthProvider({}).props.value;
  }
  render();
  const unmount = effect();
  return {
    calls, render, storage, unmount,
    get listenerCount() { return listeners.size; },
    sendCredentials(message = calls.messages.at(-1)) {
      const data = { ...message, payload: { accessToken: "parent-token" } };
      for (const listener of listeners) listener({ source: win.parent, data });
    },
    screen() {
      const dictionary = {};
      loadDictionary(mockRequire, dictionary, win, win.Pi);
      modules["@/lib/connect/i18n"] = dictionary;
      modules["@/contexts/pi-auth-context"] = { usePiAuth: render };
      const screen = {};
      loadScreen(mockRequire, screen, win, win.Pi);
      return screen.AuthLoadingScreen();
    },
  };
}

test("logout clears the local session and persists only the language marker", async () => {
  const pendingProducts = deferred();
  const app = mount({ products: () => pendingProducts.promise });
  await settle();
  assert.equal(app.render().isAuthenticated, true);
  app.render().endLocalSession("ar");
  assert.deepEqual([...app.storage], [[marker, "ar"]]);
  assert.deepEqual(app.calls.revoked, ["session"]);
  assert.equal(app.calls.disconnects, 1);
  pendingProducts.resolve({ products: [{ id: "old" }] });
  await settle();
  const state = app.render();
  assert.equal(state.isAuthenticated, false);
  assert.equal(state.sessionToken, null);
  assert.equal(state.userId, null);
  assert.equal(state.piUsername, "");
  assert.equal(state.sdk, null);
  assert.equal(state.products, null);
  assert.equal(state.restoredPurchases, null);
  assert.equal(state.premiumActive, false);
  const screen = app.screen();
  assert.equal(screen.props.dir, "rtl");
  assert.equal(screen.props.children[0].props.children, "تم تسجيل الخروج");
  assert.equal(screen.props.children[1].props.children, "تسجيل الدخول باستخدام Pi");
  app.unmount();
});

test("reload suppresses Pi and App Studio until explicit sign-in, which is deduplicated", async () => {
  const storage = new Map([[marker, "ar"]]);
  const direct = mount({ storage });
  const studio = mount({ storage, iframe: true });
  await settle();
  assert.equal(direct.calls.pi, 0);
  assert.deepEqual(studio.calls.messages, []);
  assert.equal(studio.listenerCount, 0);
  assert.equal(studio.render().signedOutLanguage, "ar");
  const click = studio.screen().props.children[1].props.onClick;
  click();
  click();
  assert.equal(storage.get(marker), "ar");
  assert.equal(studio.calls.messages.length, 1);
  studio.sendCredentials();
  await settle();
  assert.deepEqual(studio.calls.verified, ["parent-token"]);
  assert.equal(studio.render().isAuthenticated, true);
  assert.equal(storage.has(marker), false);
  direct.unmount();
  studio.unmount();
});

test("cancelled App Studio requests ignore late credentials even during a new login", async () => {
  const app = mount({ iframe: true });
  const oldRequest = app.calls.messages[0];
  app.render().endLocalSession("en");
  assert.equal(app.listenerCount, 0);
  app.render().signIn();
  app.sendCredentials(oldRequest);
  await settle();
  assert.deepEqual(app.calls.verified, []);
  app.sendCredentials();
  await settle();
  assert.deepEqual(app.calls.verified, ["parent-token"]);
  assert.deepEqual(app.calls.sockets, ["session"]);
  app.unmount();
});

test("a delayed Pi SDK result cannot start server verification after logout", async () => {
  const pi = deferred();
  const app = mount({ authenticate: () => pi.promise });
  await settle();
  assert.equal(app.calls.pi, 1);
  app.render().endLocalSession("en");
  pi.resolve(credentials);
  await settle();
  assert.deepEqual(app.calls.verified, []);
  assert.deepEqual(app.calls.sockets, []);
  assert.equal(app.render().isAuthenticated, false);
  app.unmount();
});

for (const iframe of [false, true]) {
  test(`late ${iframe ? "App Studio" : "Pi"} server sessions are revoked without replacing a later login`, async () => {
    const oldSession = deferred();
    let requests = 0;
    const app = mount({
      iframe,
      verify: () => ++requests === 1 ? oldSession.promise : Promise.resolve(session("new")),
    });
    if (iframe) app.sendCredentials();
    await settle();
    assert.equal(requests, 1);
    app.render().endLocalSession("en");
    app.render().signIn();
    if (iframe) app.sendCredentials();
    await settle();
    assert.equal(app.render().sessionToken, "new");
    oldSession.resolve(session("old"));
    await settle();
    assert.equal(app.render().sessionToken, "new");
    assert.deepEqual(app.calls.revoked, ["old"]);
    assert.deepEqual(app.calls.sockets, ["new"]);
    app.unmount();
  });
}

test("a failed explicit login keeps the marker and reload stays signed out", async () => {
  const storage = new Map([[marker, "ar"]]);
  const app = mount({
    storage,
    verify: async () => { throw new Error("Verification failed"); },
  });
  app.render().signIn();
  await settle();
  assert.equal(app.render().hasError, true);
  assert.equal(app.render().isAuthenticated, false);
  assert.equal(storage.get(marker), "ar");

  app.unmount();
  const reloaded = mount({ storage });
  await settle();
  assert.equal(reloaded.render().signedOutLanguage, "ar");
  assert.equal(reloaded.calls.pi, 0);
  reloaded.unmount();
});

test("reload during explicit login preserves the marker and revokes a late session", async () => {
  const storage = new Map([[marker, "ar"]]);
  const pending = deferred();
  const app = mount({ storage, verify: () => pending.promise });
  app.render().signIn();
  await settle();
  assert.equal(app.calls.verified.length, 1);
  assert.equal(storage.get(marker), "ar");

  app.unmount();
  const reloaded = mount({ storage, iframe: true });
  pending.resolve(session("late"));
  await settle();
  assert.deepEqual(app.calls.revoked, ["late"]);
  assert.deepEqual(app.calls.sockets, []);
  assert.deepEqual(reloaded.calls.messages, []);
  assert.equal(reloaded.render().signedOutLanguage, "ar");
  assert.equal(storage.get(marker), "ar");
  reloaded.unmount();
});

test("a stale result cannot remove a newer logout marker", async () => {
  const pending = deferred();
  let requests = 0;
  const app = mount({
    storage: new Map([[marker, "en"]]),
    verify: () => ++requests === 1 ? pending.promise : Promise.resolve(session("new")),
  });
  app.render().signIn();
  await settle();
  app.render().endLocalSession("ar");
  app.render().signIn();
  await settle();
  assert.equal(app.render().sessionToken, "new");
  assert.equal(app.storage.has(marker), false);

  app.render().endLocalSession("ar");
  pending.resolve(session("old"));
  await settle();
  assert.equal(app.storage.get(marker), "ar");
  assert.equal(app.render().isAuthenticated, false);
  assert.deepEqual(app.calls.revoked, ["new", "old"]);
  assert.deepEqual(app.calls.sockets, ["new"]);
  app.unmount();
});

test("a storage read error blocks automatic Pi and App Studio login", async () => {
  for (const iframe of [false, true]) {
    const app = mount({ iframe, storageErrors: { read: true } });
    await settle();
    assert.equal(app.render().signedOutLanguage, "en");
    assert.equal(app.calls.pi, 0);
    assert.deepEqual(app.calls.messages, []);
    assert.deepEqual(app.calls.verified, []);
    assert.equal(app.screen().props.children[1].props.children, "Sign in with Pi");
    app.unmount();
  }
});

test("explicit login and logout work with sessionStorage unavailable", async () => {
  const app = mount({ storageErrors: { unavailable: true } });
  await settle();
  assert.equal(app.calls.pi, 0);
  const click = app.screen().props.children[1].props.onClick;
  click();
  click();
  await settle();
  assert.equal(app.calls.pi, 1);
  assert.equal(app.render().isAuthenticated, true);
  assert.deepEqual(app.calls.sockets, ["session"]);

  app.render().endLocalSession("ar");
  assert.equal(app.render().signedOutLanguage, "ar");
  assert.equal(app.render().sessionToken, null);
  assert.deepEqual(app.calls.revoked, ["session"]);
  assert.equal(app.calls.disconnects, 1);
  app.unmount();
});

test("a failed write logs out locally but a later readable reload has no marker", async () => {
  const storage = new Map();
  const app = mount({ storage, storageErrors: { write: true } });
  await settle();
  app.render().endLocalSession("ar");
  assert.equal(app.render().signedOutLanguage, "ar");
  assert.equal(app.render().sessionToken, null);
  assert.deepEqual(app.calls.revoked, ["session"]);
  assert.equal(app.calls.disconnects, 1);
  assert.equal(storage.has(marker), false);
  app.unmount();

  const reloaded = mount({ storage });
  await settle();
  assert.equal(reloaded.calls.pi, 1);
  assert.equal(reloaded.render().isAuthenticated, true);
  reloaded.unmount();
});

test("a failed removal leaves the marker without blocking explicit login", async () => {
  const storage = new Map([[marker, "ar"]]);
  const app = mount({ storage, storageErrors: { remove: true } });
  app.render().signIn();
  await settle();
  assert.equal(app.render().isAuthenticated, true);
  assert.equal(storage.get(marker), "ar");
  app.unmount();

  const reloaded = mount({ storage });
  await settle();
  assert.equal(reloaded.calls.pi, 0);
  assert.equal(reloaded.render().signedOutLanguage, "ar");
  reloaded.unmount();
});
