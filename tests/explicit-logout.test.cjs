const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { test } = require("node:test");
const ts = require("typescript");

function compile(path) {
  const source = readFileSync(join(__dirname, "..", path), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2018, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  });
  return new Function("require", "exports", "window", "Pi", "fetch", outputText);
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
  onLegacyPurchaseRead = () => {},
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
    useCallback(callback) { return callback; },
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
        state: { products: onLegacyPurchaseRead, restore: onLegacyPurchaseRead, get: onLegacyPurchaseRead },
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
  let legacyPurchaseReads = 0;
  const app = mount({ onLegacyPurchaseRead: () => { legacyPurchaseReads++; } });
  await settle();
  assert.equal(app.render().isAuthenticated, true);
  app.render().endLocalSession("ar");
  assert.deepEqual([...app.storage], [[marker, "ar"]]);
  assert.deepEqual(app.calls.revoked, ["session"]);
  assert.equal(app.calls.disconnects, 1);
  await settle();
  const state = app.render();
  assert.equal(state.isAuthenticated, false);
  assert.equal(state.sessionToken, null);
  assert.equal(state.userId, null);
  assert.equal(state.piUsername, "");
  assert.equal(state.sdk, null);
  assert.equal(legacyPurchaseReads, 0);
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

for (const iframe of [false, true]) {
  test(`${iframe ? "App Studio" : "Pi"} login selects account email without starting the shared socket`, async () => {
    const app = mount({
      iframe,
      verify: async () => ({ ...session("migration"), accountDataStatus: "ACCOUNT_MIGRATION_REQUIRED", emailSocketMode: "account", chatSocketMode: "account", groupSocketMode: "account" }),
    });
    if (iframe) app.sendCredentials();
    await settle();
    assert.equal(app.render().isAuthenticated, true);
    assert.equal(app.render().accountMigrationRequired, true);
    assert.equal(app.render().emailSocketMode, "account");
    assert.equal(app.render().chatSocketMode, "account");
    assert.equal(app.render().groupSocketMode, "account");
    const wasCurrent = app.render().isCurrentSession;
    assert.equal(wasCurrent("migration"), true);
    assert.equal(app.render().piUsername, "user");
    assert.deepEqual(app.calls.sockets, []);
    app.render().endLocalSession("en");
    assert.equal(wasCurrent("migration"), false);
    assert.equal(app.render().accountMigrationRequired, false);
    assert.equal(app.render().emailSocketMode, "legacy");
    assert.equal(app.render().chatSocketMode, "legacy");
    assert.equal(app.render().groupSocketMode, "legacy");
    assert.deepEqual(app.calls.revoked, ["migration"]);
    app.unmount();
  });
}

function mountAccountMailbox(mode = "email") {
  const { EventEmitter } = require("node:events");
  const sockets = [];
  const requests = [];
  const exportsApi = {};
  const exportsData = {};
  const exportsMailbox = {};
  let current = null;
  compile("lib/connect/data.ts")(() => { throw new Error("Unexpected import"); }, exportsData);
  compile("lib/api-client.ts")((name) => {
    if (name === "@/lib/connect/pstn-phone") return {};
    assert.equal(name, "socket.io-client");
    return { default(url, options) {
      const socket = new EventEmitter();
      socket.connect = () => { socket.connectCalls++; };
      socket.disconnect = () => { socket.disconnectCalls++; };
      socket.connectCalls = 0;
      socket.disconnectCalls = 0;
      sockets.push({ socket, url, options });
      return socket;
    } };
  }, exportsApi, undefined, undefined, (url, options) => {
    const response = deferred();
    requests.push({ url, options, ...response });
    return response.promise;
  });
  compile(({ chat: "lib/account-private-chat.ts", groups: "lib/account-groups.ts" })[mode] ?? "lib/account-mailbox.ts")((name) => {
    if (name === "@/lib/api-client") return exportsApi;
    assert.equal(name, "@/lib/connect/data");
    return exportsData;
  }, exportsMailbox);

  function start(token) {
    current = token;
    const snapshots = [];
    const statuses = [];
    const errors = [];
    const lists = [];
    const groupLists = [];
    const selections = [];
    const histories = [];
    const options = {
      onList: (list) => lists.push(list),
      onLists: (groups, invitations) => groupLists.push({ groups, invitations }),
      onSelection: (id) => selections.push(id),
      onHistory: (history) => histories.push(history),
      onError: (error) => errors.push(error),
      sessionToken: token,
      username: "renamed",
      isCurrent: () => current === token,
      onEmails: (emails) => snapshots.push(emails),
      onStatus: (status) => statuses.push(status),
      onLoadError: () => errors.push("fetch error"),
    };
    const start = ({ chat: exportsMailbox.startPrivateChat, groups: exportsMailbox.startAccountGroups })[mode] ?? exportsMailbox.startAccountMailbox;
    const mailbox = start(options);
    return { ...mailbox, snapshots, statuses, errors, lists, groupLists, selections, histories, ...sockets.at(-1) };
  }
  return { sockets, requests, start, setCurrent: (token) => { current = token; } };
}

const scopedRecord = (id = "a".repeat(24), read = false) => ({
  id, type: "internal", threadId: "thread", senderUsername: "sender",
  recipientUsername: "original-name", fromMe: false,
  subject: "Fixture", body: "Fixture", read, at: 1710000000000,
});
const accountSnapshot = (emails) => ({
  emails, legacyHistory: { code: "ACCOUNT_MIGRATION_REQUIRED" },
});
const httpResult = (body, ok = true) => ({ ok, json: async () => body });

test("account mailbox connects only to /email, coalesces events and replaces a deduplicated HTTP snapshot", async () => {
  const fixture = mountAccountMailbox();
  const view = fixture.start("account-session");
  assert.equal(new URL(view.url).pathname, "/email");
  assert.deepEqual(view.options.auth, { sessionToken: "account-session" });
  assert.equal(view.options.autoConnect, false);
  assert.equal(view.socket.connectCalls, 1);
  for (const event of ["email:new", "email:read", "email:deleted", "connect"]) {
    assert.equal(view.socket.listenerCount(event), 1);
  }
  assert.equal(fixture.requests[0].options.headers.Authorization, "Bearer account-session");
  view.socket.emit("connect");
  view.socket.emit("email:new", { body: "ignore event payload" });
  view.socket.emit("email:new");
  assert.equal(fixture.requests.length, 1);
  fixture.requests[0].resolve(httpResult(accountSnapshot([])));
  await settle();
  assert.deepEqual(view.snapshots, []);
  assert.equal(fixture.requests.length, 2);
  fixture.requests[1].resolve(httpResult(accountSnapshot([scopedRecord(), scopedRecord()])));
  await settle();
  assert.equal(view.snapshots.at(-1).length, 1);
  assert.equal(view.snapshots.at(-1)[0].folder, "inbox");
  view.socket.emit("email:read");
  fixture.requests[2].resolve(httpResult(accountSnapshot([scopedRecord(undefined, true)])));
  await settle();
  assert.equal(view.snapshots.at(-1)[0].read, true);
  view.socket.emit("email:deleted");
  fixture.requests[3].resolve(httpResult(accountSnapshot([])));
  await settle();
  assert.deepEqual(view.snapshots.at(-1), []);
  view.close();
  assert.equal(view.socket.eventNames().length, 0);
});

test("replacement and logout abort refreshes and reject late callbacks from the previous socket", async () => {
  const fixture = mountAccountMailbox();
  const first = fixture.start("first");
  const lateEvent = first.socket.listeners("email:new")[0];
  const second = fixture.start("second");
  lateEvent();
  assert.equal(fixture.requests.length, 2);
  fixture.requests[0].resolve(httpResult(accountSnapshot([scopedRecord()])));
  await settle();
  assert.deepEqual(first.snapshots, []);
  first.close();
  assert.equal(first.socket.disconnectCalls, 1);
  assert.equal(first.socket.eventNames().length, 0);
  assert.equal(fixture.requests[0].options.signal.aborted, true);

  const lateSecond = second.socket.listeners("email:new")[0];
  fixture.setCurrent(null);
  lateSecond();
  second.close();
  fixture.requests[1].resolve(httpResult(accountSnapshot([scopedRecord()])));
  await settle();
  assert.equal(fixture.requests.length, 2);
  assert.deepEqual(second.snapshots, []);
  assert.equal(second.socket.disconnectCalls, 1);
  assert.equal(second.socket.eventNames().length, 0);
});

for (const event of ["connect_error", "email:unavailable"]) {
  test(`account mailbox stops reconnecting on a deleting account via ${event}`, async () => {
    const fixture = mountAccountMailbox();
    const view = fixture.start("deleting-session");
    const data = { code: "ACCOUNT_DELETING" };
    view.socket.emit(event, event === "connect_error" ? { data } : data);
    assert.deepEqual(view.statuses, ["deleting"]);
    assert.equal(view.socket.disconnectCalls, 1);
    assert.equal(view.socket.eventNames().length, 0);
    assert.equal(fixture.requests[0].options.signal.aborted, true);
    fixture.requests[0].resolve(httpResult(accountSnapshot([scopedRecord()])));
    await settle();
    assert.deepEqual(view.snapshots, [[]]);
    view.close();
    assert.equal(view.socket.disconnectCalls, 1);
  });
}

for (const response of [
  httpResult({ code: "ACCOUNT_MIGRATION_REQUIRED" }, false),
  httpResult({ emails: [scopedRecord()] }),
]) {
  test("account mailbox blocks migration errors and unmarked legacy snapshots", async () => {
    const fixture = mountAccountMailbox();
    const view = fixture.start("migration-session");
    fixture.requests[0].resolve(response);
    await settle();
    assert.deepEqual(view.statuses, ["migration"]);
    assert.deepEqual(view.snapshots, [[]]);
    assert.equal(view.socket.disconnectCalls, 1);
  });
}

test("home renders scoped email per session and retains the previous routes for other sessions", () => {
  const exportsPage = {};
  let auth;
  const jsx = (type, props, key) => ({ type, props, key });
  const modules = {
    "react/jsx-runtime": { jsx, jsxs: jsx },
    react: {},
    "@/components/connect/account-private-data-view": { AccountPrivateDataView: "private-data" },
    "@/components/connect/account-groups-view": { AccountGroupsView: "scoped-groups" },
    "@/components/connect/account-private-chat": { AccountPrivateChat: "scoped-chat" },
    "@/components/connect/account-emails-view": { AccountEmailsView: "scoped-email" },
    "@/components/connect/connect-app": { ConnectApp: "legacy-app" },
    "@/components/connect/call-test-app": { CallTestApp: "call-test-app" },
    "@/contexts/pi-auth-context": { usePiAuth: () => auth },
  };
  compile("app/page.tsx")((name) => {
    assert.ok(Object.hasOwn(modules, name), name);
    return modules[name];
  }, exportsPage);
  const renderHome = () => {
    const entry = exportsPage.default();
    return entry.type(entry.props);
  };
  auth = { emailSocketMode: "legacy", sessionToken: "legacy" };
  assert.equal(renderHome().type, "legacy-app");
  auth = { ...auth, accountMigrationRequired: true };
  assert.equal(renderHome().type, "main");
  auth = { ...auth, emailSocketMode: "account", sessionToken: "first", piUsername: "alice" };
  assert.equal(renderHome().type, "scoped-email");
  assert.equal(renderHome().key, "first");
  auth = { ...auth, sessionToken: "second", chatSocketMode: "account" };
  assert.equal(renderHome().key, "second");
  assert.equal(renderHome().type.name, "AccountCommunication");
  assert.equal(renderHome().props.groupsEnabled, false);
  auth = { ...auth, groupSocketMode: "account" };
  assert.equal(renderHome().props.groupsEnabled, true);
  auth = { ...auth, privateDataOwner: "account-fixture" };
  assert.equal(renderHome().props.privateDataEnabled, true);
});

const oldConversation = "a".repeat(64);
const newConversation = "b".repeat(64);
const chatMessage = "c".repeat(24);
const archivedEntry = {
  conversationId: oldConversation, peer: { label: "حساب محذوف", state: "deleted", username: null }, canSend: false,
};
const activeEntry = {
  conversationId: newConversation, peer: { label: "returning", state: "active", username: "returning" }, canSend: true,
};
const chatSnapshot = (data) => httpResult({ ...data, legacyHistory: { code: "ACCOUNT_MIGRATION_REQUIRED" } });
const archivedMessage = {
  id: chatMessage, conversationId: oldConversation, kind: "file", attachmentId: "d".repeat(24),
  text: "archived message", fromMe: false, at: 1710000000000, status: "sent",
};

test("private chat opens by ID and refreshes a deduplicated history from /chat events", async () => {
  const fixture = mountAccountMailbox("chat");
  const view = fixture.start("chat-session");
  assert.equal(new URL(view.url).pathname, "/chat");
  assert.deepEqual(view.options.auth, { sessionToken: "chat-session" });
  assert.equal(view.socket.connectCalls, 1);
  for (const event of ["message:new", "message:status", "message:deleted", "message:saved"]) {
    assert.equal(view.socket.listenerCount(event), 1);
  }
  fixture.requests[0].resolve(chatSnapshot({ conversations: [archivedEntry, activeEntry, activeEntry] }));
  await settle();
  assert.deepEqual(view.lists.at(-1).map(({ conversationId }) => conversationId), [oldConversation, newConversation]);
  view.select(oldConversation);
  fixture.requests[1].resolve(chatSnapshot({ ...archivedEntry, messages: [archivedMessage] }));
  await settle();
  assert.equal(view.histories.at(-1).messages[0].attachmentId, archivedMessage.attachmentId);

  const start = view.start("returning");
  assert.equal(fixture.requests[2].options.method, "POST");
  assert.deepEqual(JSON.parse(fixture.requests[2].options.body), { username: "returning" });
  fixture.requests[2].resolve(httpResult(activeEntry));
  await start;
  assert.equal(view.selections.at(-1), newConversation);
  assert.equal(fixture.requests[1].options.signal.aborted, true);
  assert.ok(new URL(fixture.requests[3].url).pathname.endsWith(newConversation));
  view.socket.emit("message:new", { conversationId: oldConversation, text: "wrong conversation" });
  assert.equal(fixture.requests.length, 5);
  view.socket.emit("message:new", { conversationId: newConversation });
  view.socket.emit("message:new", { conversationId: newConversation });
  assert.equal(fixture.requests.length, 5);
  fixture.requests[3].resolve(chatSnapshot({ ...activeEntry, messages: [] }));
  await settle();
  const fresh = { ...archivedMessage, id: "e".repeat(24), conversationId: newConversation, text: "new account" };
  fixture.requests[5].resolve(chatSnapshot({ ...activeEntry, messages: [fresh, fresh] }));
  await settle();
  assert.deepEqual(view.histories.at(-1).messages, [fresh]);
  assert.deepEqual(view.histories.map(({ conversationId }) => conversationId), [oldConversation, newConversation]);
  fixture.requests[4].resolve(chatSnapshot({ conversations: [archivedEntry, activeEntry] }));
  await settle();
  if (fixture.requests[6]) fixture.requests[6].resolve(chatSnapshot({ conversations: [archivedEntry, activeEntry] }));
  await settle();

  view.socket.connected = true;
  let sent = 0;
  view.socket.on("message:send", (data) => {
    sent++;
    assert.equal(data.conversationId, newConversation);
  });
  const outgoing = { messageId: "client-message", kind: "text", text: "hello" };
  const acknowledgement = view.send(newConversation, outgoing);
  await assert.rejects(view.send(newConversation, outgoing), /already sending/);
  view.socket.emit("message:saved", { id: outgoing.messageId, conversationId: oldConversation });
  view.socket.emit("message:saved", { id: outgoing.messageId, conversationId: newConversation });
  await acknowledgement;
  assert.equal(sent, 1);
  view.close();
  assert.equal(view.socket.eventNames().length, 0);
});

test("private chat aborts selection, replacement and logout requests and ignores old events", async () => {
  const fixture = mountAccountMailbox("chat");
  const first = fixture.start("first");
  first.select(oldConversation);
  first.select(newConversation);
  assert.equal(fixture.requests[1].options.signal.aborted, true);
  const lateEvent = first.socket.listeners("message:new")[0];
  const second = fixture.start("second");
  first.close();
  assert.ok(fixture.requests.slice(0, 3).every(({ options }) => options.signal.aborted));
  assert.equal(first.socket.disconnectCalls, 1);
  assert.equal(first.socket.eventNames().length, 0);
  lateEvent({ conversationId: oldConversation });
  fixture.requests[0].resolve(chatSnapshot({ conversations: [archivedEntry] }));
  fixture.requests[1].resolve(chatSnapshot({ ...archivedEntry, messages: [archivedMessage] }));
  fixture.requests[2].resolve(chatSnapshot({ ...activeEntry, messages: [] }));
  await settle();
  assert.deepEqual(first.lists, []);
  assert.deepEqual(first.histories, []);

  const lateSecond = second.socket.listeners("message:new")[0];
  fixture.setCurrent(null);
  lateSecond({ conversationId: newConversation });
  second.close();
  fixture.requests[3].resolve(chatSnapshot({ conversations: [activeEntry] }));
  await settle();
  assert.deepEqual(second.lists, []);
  assert.equal(fixture.requests.length, 4);
  assert.equal(fixture.requests[3].options.signal.aborted, true);
  assert.equal(second.socket.disconnectCalls, 1);
});

test("an unmarked history closes private chat and keeps the migration state", async () => {
  const fixture = mountAccountMailbox("chat");
  const view = fixture.start("migration-session");
  fixture.requests[0].resolve(httpResult({ conversations: [archivedEntry] }));
  await settle();
  assert.deepEqual(view.statuses, ["migration"]);
  assert.deepEqual(view.lists, [[]]);
  assert.equal(view.socket.disconnectCalls, 1);
});

test("archived chat renders its attachment through the existing bubble and omits member actions", () => {
  const exportsView = {};
  const jsx = (type, props, key) => ({ type, props, key });
  const modules = {
    "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "fragment" },
    react: { useState: (initial) => [initial, () => {}], useEffect: () => {}, useRef: (value) => ({ current: value }) },
    "@/contexts/pi-auth-context": {},
    "@/lib/account-private-chat": {},
    "@/lib/api-client": {},
    "@/lib/connect/i18n": { getDict: () => ({ cancel: "Cancel" }) },
    "./conversation-view": { ConversationBubble: "existing-bubble" },
    "./feedback": { ConfirmDialog: "confirm", Sheet: "sheet" },
    "./voice-recorder": {},
  };
  compile("components/connect/account-private-chat.tsx")((name) => {
    assert.ok(Object.hasOwn(modules, name), name);
    return modules[name];
  }, exportsView);
  const archive = exportsView.PrivateConversationView({
    history: { ...archivedEntry, messages: [archivedMessage] }, chat: {}, online: true,
  });
  function collect(node) {
    if (!node || typeof node !== "object") return [];
    if (Array.isArray(node)) return node.flatMap(collect);
    return [node, ...collect(node.props?.children)];
  }
  const nodes = collect(archive);
  assert.equal(nodes.find((node) => node.type === "h2").props.children, "حساب محذوف");
  assert.ok(nodes.some((node) => node.type === "existing-bubble" && node.props.m.attachmentId === archivedMessage.attachmentId));
  assert.equal(nodes.find((node) => node.type === "li").key, archivedMessage.id);
  assert.ok(nodes.every((node) => !["a", "button", "form", "confirm"].includes(node.type) && typeof node.type !== "function"));
});

const groupId = "a".repeat(24);
const invitationId = "b".repeat(24);
const groupOwnerId = "owner-member-id";
const groupRecord = {
  id: groupId, name: "Group fixture", state: "active", canWrite: true, canManageMembers: true,
  ownerId: groupOwnerId, members: [{ id: groupOwnerId, username: "owner", state: "active" }],
};
const groupMessage = {
  id: "c".repeat(24), groupId, kind: "file", mediaId: "d".repeat(24), fileName: "archive.txt",
  senderUsername: "owner", text: "archived message", at: 1710000000000, readBy: [],
};

test("account group invitations use the session and refresh a single deduplicated list", async () => {
  const fixture = mountAccountMailbox("groups");
  const view = fixture.start("groups-session");
  assert.equal(new URL(view.url).pathname, "/groups");
  assert.deepEqual(view.options.auth, { sessionToken: "groups-session" });
  const invite = { groupId: invitationId, name: "Welcome" };
  const received = { groupId: groupId, name: "Another invitation" };
  fixture.requests[0].resolve(chatSnapshot({ groups: [] }));
  fixture.requests[1].resolve(chatSnapshot({ invitations: [invite, received, invite] }));
  await settle();
  assert.deepEqual(view.groupLists.at(-1), { groups: [], invitations: [invite, received] });
  const accept = view.action("/" + invitationId + "/invitations/accept", "POST");
  assert.ok(new URL(fixture.requests[2].url).pathname.endsWith("/" + invitationId + "/invitations/accept"));
  assert.equal(fixture.requests[2].options.headers.Authorization, "Bearer groups-session");
  assert.equal(fixture.requests[2].options.body, undefined);
  fixture.requests[2].resolve(httpResult({ success: true }));
  assert.equal(await accept, true);
  fixture.requests[3].resolve(chatSnapshot({ groups: [{ ...groupRecord, id: invitationId }] }));
  fixture.requests[4].resolve(chatSnapshot({ invitations: [received] }));
  await settle();
  const decline = view.action("/" + groupId + "/invitations/decline", "POST");
  assert.ok(new URL(fixture.requests[5].url).pathname.endsWith("/invitations/decline"));
  fixture.requests[5].resolve(httpResult({ success: true }));
  assert.equal(await decline, true);
  fixture.requests[6].resolve(chatSnapshot({ groups: [{ ...groupRecord, id: invitationId }] }));
  fixture.requests[7].resolve(chatSnapshot({ invitations: [] }));
  await settle();
  assert.deepEqual(view.groupLists.at(-1).invitations, []);
  assert.equal(view.groupLists.at(-1).groups[0].id, invitationId);
  view.close();
});

test("open group eviction aborts history and stale callbacks, and keeps one set of session listeners", async () => {
  const fixture = mountAccountMailbox("groups");
  const view = fixture.start("removed-session");
  fixture.requests[0].resolve(chatSnapshot({ groups: [groupRecord] }));
  fixture.requests[1].resolve(chatSnapshot({ invitations: [] }));
  await settle();
  view.select(groupId);
  fixture.requests[2].resolve(chatSnapshot({ group: groupRecord, messages: [groupMessage], nextCursor: null }));
  await settle();
  const access = view.signalFor(groupId);
  assert.equal(view.histories.at(-1).messages.length, 1);
  const groupEvent = view.socket.listeners("group:message")[0];
  view.socket.emit("group:message", { message: groupMessage });
  view.socket.emit("group:message", { message: groupMessage });
  assert.equal(fixture.requests.length, 6);
  assert.equal(view.socket.listenerCount("group:message"), 1);
  view.socket.emit("group:access-revoked", { groupId });
  assert.equal(access.aborted, true);
  assert.ok(fixture.requests.slice(3, 6).every(({ options }) => options.signal.aborted));
  assert.equal(view.selections.at(-1), null);
  assert.deepEqual(view.groupLists.at(-1).groups, []);
  groupEvent({ message: groupMessage });
  assert.equal(fixture.requests.length, 8);
  fixture.requests[3].resolve(chatSnapshot({ groups: [groupRecord] }));
  fixture.requests[4].resolve(chatSnapshot({ invitations: [] }));
  fixture.requests[5].resolve(chatSnapshot({ group: groupRecord, messages: [groupMessage, groupMessage], nextCursor: null }));
  fixture.requests[6].resolve(chatSnapshot({ groups: [] }));
  fixture.requests[7].resolve(chatSnapshot({ invitations: [] }));
  await settle();
  assert.equal(view.histories.length, 1);
  assert.deepEqual(view.groupLists.at(-1).groups, []);
  const replacement = fixture.start("returned-session");
  view.close();
  groupEvent({ message: groupMessage });
  assert.equal(view.socket.eventNames().length, 0);
  assert.equal(fixture.requests.length, 10);
  assert.equal(replacement.histories.length, 0);
  fixture.setCurrent(null);
  replacement.close();
  assert.ok(fixture.requests.slice(8).every(({ options }) => options.signal.aborted));
  fixture.requests[8].resolve(chatSnapshot({ groups: [groupRecord] }));
  fixture.requests[9].resolve(chatSnapshot({ invitations: [{ groupId, name: "Stale" }] }));
  await settle();
  assert.deepEqual(replacement.groupLists, []);
});

test("archived group renders its existing media viewer but blocks the composer and management", async () => {
  const fixture = mountAccountMailbox("groups");
  const view = fixture.start("archive");
  fixture.requests[0].resolve(chatSnapshot({ groups: [{ ...groupRecord, state: "archived" }] }));
  fixture.requests[1].resolve(chatSnapshot({ invitations: [] }));
  await settle();
  view.select(groupId);
  fixture.requests[2].resolve(chatSnapshot({
    group: { ...groupRecord, state: "archived" }, messages: [groupMessage, groupMessage], nextCursor: null,
  }));
  await settle();
  const history = view.histories.at(-1);
  assert.equal(history.group.canWrite, false);
  assert.equal(history.group.canManageMembers, false);
  assert.equal(history.messages.length, 1);
  assert.equal(await view.send(groupId, "unavailable", "text"), false);
  const ui = {};
  const jsx = (type, props, key) => ({ type, props, key });
  const modules = {
    "react/jsx-runtime": { jsx, jsxs: jsx },
    react: { useState: (initial) => [initial, () => {}], useRef: (value) => ({ current: value }) },
    "@/contexts/pi-auth-context": {},
    "@/lib/account-groups": {},
    "./group-media": { GroupMediaContent: "existing-group-media" },
    "./feedback": {},
    "./voice-recorder": {},
  };
  compile("components/connect/account-groups-view.tsx")((name) => {
    assert.ok(Object.hasOwn(modules, name), name);
    return modules[name];
  }, ui);
  const tree = ui.ScopedGroupConversation({ history, connection: view });
  function flatten(node) {
    if (Array.isArray(node)) return node.flatMap(flatten);
    return node && typeof node === "object" ? [node, ...flatten(node.props?.children)] : [];
  }
  const nodes = flatten(tree);
  assert.ok(nodes.some((node) => node.props.role === "status" && node.props.children === "Archived group · Read only"));
  assert.ok(nodes.some((node) => node.type === "existing-group-media" && node.props.message.mediaId === groupMessage.mediaId));
  assert.ok(nodes.every((node) => node.type !== "form" && node.type !== "button" && typeof node.type !== "function"));
  view.close();
});

test("group transfer controls follow explicit owner and recipient capabilities", async () => {
  const ui = {};
  const jsx = (type, props, key) => ({ type, props, key });
  const modules = {
    "react/jsx-runtime": { jsx, jsxs: jsx },
    react: { useState: (initial) => [initial, () => {}], useRef: (value) => ({ current: value }) },
    "@/contexts/pi-auth-context": {},
    "@/lib/account-groups": {},
    "./group-media": {},
    "./feedback": {},
    "./voice-recorder": {},
  };
  compile("components/connect/account-groups-view.tsx")((name) => modules[name], ui);
  const member = { id: "successor-member", username: "successor", state: "active" };
  const calls = [];
  const connection = { action: async (...args) => { calls.push(args); return true; } };
  const offerId = "a".repeat(24);
  function render(group) {
    const tree = ui.ScopedGroupConversation({ history: { group, messages: [], nextCursor: null }, connection });
    function flatten(node) {
      if (Array.isArray(node)) return node.flatMap(flatten);
      return node && typeof node === "object" ? [node, ...flatten(node.props?.children)] : [];
    }
    return new Map(flatten(tree).filter((node) => node.type === "button").map((node) => [node.props.children, node.props.onClick]));
  }
  const owner = render({ ...groupRecord, members: [...groupRecord.members, member], canOfferOwnership: true });
  assert.ok(owner.has("Offer ownership"));
  assert.equal(owner.has("Accept ownership"), false);
  owner.get("Offer ownership")();
  await settle();
  assert.deepEqual(calls[0], ["/" + groupId + "/ownership-offers", "POST", { memberId: member.id }, groupId]);
  const recipientGroup = {
    ...groupRecord, canManageMembers: false, ownershipOffer: {
      id: offerId, fromUsername: "owner", toUsername: "successor", canRespond: true,
    },
  };
  const recipient = render(recipientGroup);
  assert.equal(recipient.has("Offer ownership"), false);
  assert.ok(recipient.has("Accept ownership") && recipient.has("Decline ownership"));
  recipient.get("Accept ownership")();
  await settle();
  recipient.get("Decline ownership")();
  await settle();
  assert.deepEqual(calls.slice(1).map(([path]) => path), [
    "/" + groupId + "/ownership-offers/" + offerId + "/accept",
    "/" + groupId + "/ownership-offers/" + offerId + "/decline",
  ]);
  const archived = render({ ...recipientGroup, state: "archived" });
  assert.equal(archived.has("Accept ownership"), false);
  assert.equal(archived.has("Decline ownership"), false);
});

test("private profile and contact requests cannot update a replacement session", async () => {
  const api = {};
  const data = {};
  const store = {};
  const requests = [];
  compile("lib/connect/data.ts")(() => { throw new Error("Unexpected import"); }, data);
  compile("lib/api-client.ts")(() => ({}), api, undefined, undefined, (url, options) => {
    const result = deferred();
    requests.push({ url, options, ...result });
    return result.promise;
  });
  compile("lib/account-private-data.ts")((name) => name === "@/lib/api-client" ? api : data, store);
  let current = null;
  const mount = (token) => {
    current = token;
    const profiles = [];
    const contacts = [];
    const errors = [];
    const view = store.startPrivateDataSession({
      sessionToken: token, isCurrent: () => token === current,
      onProfile: (profile) => profiles.push(profile), onContacts: (list) => contacts.push(list), onError: (error) => errors.push(error),
    });
    return { view, profiles, contacts, errors };
  };
  const old = mount("old");
  requests[0].resolve(chatSnapshot({ profile: { displayName: "Old private profile" } }));
  requests[1].resolve(chatSnapshot({ contacts: [] }));
  await settle();
  assert.equal(old.profiles[0].displayName, "Old private profile");
  const pending = old.view.saveProfile({ displayName: "changed", avatar: null, language: "en", status: "available", statusText: "" });
  assert.equal(requests[2].options.headers.Authorization, "Bearer old");
  const replacement = mount("replacement");
  old.view.close();
  assert.equal(requests[2].options.signal.aborted, true);
  requests[2].resolve(chatSnapshot({ profile: { displayName: "Old late response" } }));
  requests[3].resolve(chatSnapshot({ profile: null }));
  requests[4].resolve(chatSnapshot({ contacts: [{ id: "old-relationship", name: "حساب محذوف", username: null, state: "deleted" }] }));
  await settle();
  assert.equal(await pending, false);
  assert.deepEqual(old.profiles.map((profile) => profile.displayName), ["Old private profile"]);
  assert.equal(replacement.profiles[0].displayName, "");
  assert.equal(replacement.contacts[0][0].name, "حساب محذوف");
  assert.equal(replacement.contacts[0][0].username, null);

  const contact = replacement.view.addContact("active", "new");
  current = null;
  replacement.view.close();
  assert.equal(requests[5].options.signal.aborted, true);
  requests[5].resolve(httpResult({ success: true }));
  assert.equal(await contact, false);
  assert.equal(requests.length, 6);

  const unmarked = mount("unmarked");
  requests[6].resolve(httpResult({ profile: { displayName: "Legacy" } }));
  requests[7].resolve(chatSnapshot({ contacts: [] }));
  await settle();
  assert.deepEqual(unmarked.profiles, []);
  assert.deepEqual(unmarked.errors, ["ACCOUNT_MIGRATION_REQUIRED"]);
  unmarked.view.close();
});

test("invoice draft hook scopes reads and writes to the account key and aborts on replacement", async () => {
  const exported = {};
  const state = [];
  const reads = [];
  const writes = [];
  let auth;
  let effect;
  let index = 0;
  const isCurrentSession = (token) => auth.sessionToken === token;
  const react = {
    useState(initial) {
      const position = index++;
      if (!(position in state)) state[position] = initial;
      return [state[position], (value) => { state[position] = typeof value === "function" ? value(state[position]) : value; }];
    },
    useRef(initial) { const position = index++; return state[position] ??= { current: initial }; },
    useEffect(callback) { effect = callback; },
  };
  compile("lib/connect/invoicing/use-invoice-drafts.ts")((name) => {
    if (name === "react") return react;
    if (name === "@/contexts/pi-auth-context") return { usePiAuth: () => auth };
    if (name === "@/lib/api-client") return { InvoiceDraftConflictError: class extends Error {} };
    assert.equal(name, "./draft-repository");
    return {
      loadInvoiceDrafts(...args) { const result = deferred(); reads.push({ args, ...result }); return result.promise; },
      createAndSaveInvoiceDraft(...args) { const result = deferred(); writes.push({ args, ...result }); return result.promise; },
    };
  }, exported);
  const render = () => { index = 0; return exported.useInvoiceDrafts(); };
  auth = { isAuthenticated: true, sessionToken: "one", userId: "pi_same", privateDataOwner: "account-original", isCurrentSession };
  render();
  const cleanup = effect();
  assert.deepEqual(reads[0].args.slice(0, 2), ["one", "account-original"]);
  assert.equal(reads[0].args[3], true);
  reads[0].resolve({ drafts: [{ id: "old" }], revision: 1 });
  await settle();
  const writing = render().createDraft("en");
  assert.equal(writes[0].args[2], "account-original");
  auth = { ...auth, sessionToken: "two", privateDataOwner: "account-returned" };
  assert.deepEqual(render().drafts, []);
  cleanup();
  assert.equal(writes[0].args[4].aborted, true);
  const newCleanup = effect();
  writes[0].resolve({ draft: { id: "late" }, snapshot: { drafts: [{ id: "late" }], revision: 2 } });
  assert.equal(await writing, null);
  reads[1].resolve({ drafts: [], revision: 0 });
  await settle();
  assert.deepEqual(render().drafts, []);
  assert.equal(reads[1].args[1], "account-returned");
  newCleanup();
});


test("accepted deletion clears the active session and preserves only a non-secret notice across reload", async () => {
  const app = mount({ verify: async () => ({ ...session("deletable"), accountDeletionSupported: true, emailSocketMode: "account" }) });
  await settle();
  assert.equal(app.render().accountDeletionSupported, true);
  app.render().finishAccountDeletion("old-session", "ar");
  assert.equal(app.render().isAuthenticated, true);
  app.render().finishAccountDeletion("deletable", "ar");
  assert.equal(app.render().sessionToken, null);
  assert.equal(app.render().accountDeletionSupported, false);
  assert.equal(app.render().signedOutNotice, "accepted");
  assert.deepEqual(app.calls.revoked, []);
  assert.deepEqual([...app.storage], [[marker, "ar"], ["oneconnect.deletion-notice", "accepted"]]);
  const reloaded = mount({ storage: app.storage });
  await settle();
  assert.equal(reloaded.calls.pi, 0);
  assert.equal(reloaded.render().signedOutNotice, "accepted");
  assert.equal(reloaded.screen().props.children[0].props.children, "تم قبول طلب حذف الحساب");
  app.unmount();
  reloaded.unmount();
});

test("ACCOUNT_DELETING suppresses automatic login and displays the progress notice", async () => {
  const app = mount({ verify: async () => { throw Object.assign(new Error("Deleting"), { code: "ACCOUNT_DELETING" }); } });
  await settle();
  assert.equal(app.render().signedOutNotice, "deleting");
  assert.equal(app.render().isAuthenticated, false);
  assert.equal(app.screen().props.children[0].props.children, "Account deletion is in progress");
  const reloaded = mount({ storage: app.storage });
  await settle();
  assert.equal(reloaded.calls.pi, 0);
  assert.equal(reloaded.render().signedOutNotice, "deleting");
  app.unmount();
  reloaded.unmount();
});

const deletionApi = {};
compile("lib/account-deletion.ts")(require, deletionApi);
const { createDeletionFlow, DeletionRequestError } = deletionApi;

function deletionFlow(overrides = {}) {
  const views = [];
  const bodies = [];
  let accepted = 0;
  let challenges = 0;
  const flow = createDeletionFlow({
    getPiToken: async () => "pi-access-token",
    challenge: async () => { challenges++; return { confirmationToken: "grant", expiresAt: 10_000 }; },
    confirm: async (body, signal) => { bodies.push(body); await overrides.confirm?.(body, signal); },
    isCurrent: () => true,
    onChange: (view) => views.push(view),
    onAccepted: () => { accepted++; },
    now: () => 0,
    ...Object.fromEntries(Object.entries(overrides).filter(([key]) => key !== "confirm")),
  });
  return { flow, views, bodies, get accepted() { return accepted; }, get challenges() { return challenges; } };
}

test("deletion flow ignores duplicate clicks and cancellation discards a late challenge", async () => {
  const pending = deferred();
  let requests = 0;
  let requestSignal;
  const fixture = deletionFlow({ challenge: (signal) => { requestSignal = signal; requests++; return pending.promise; } });
  await fixture.flow.submit(false);
  assert.equal(requests, 0);
  const submit = fixture.flow.submit(true);
  await fixture.flow.submit(true);
  await settle();
  assert.equal(requests, 1);
  assert.equal(fixture.flow.cancel(), true);
  assert.equal(requestSignal.aborted, true);
  pending.resolve({ confirmationToken: "stale", expiresAt: 10_000 });
  await submit;
  assert.deepEqual(fixture.bodies, []);
  assert.equal(fixture.accepted, 0);
  fixture.flow.dispose();
});

test("deletion flow handles expired, rate-limited and rejected Pi confirmations without accepting", async () => {
  const expired = deletionFlow({ now: () => 10_000 });
  await expired.flow.submit(true);
  assert.equal(expired.views.at(-1).issue, "expired");
  assert.deepEqual(expired.bodies, []);
  expired.flow.dispose();
  for (const issue of ["limited", "verification", "expired"]) {
    const fixture = deletionFlow({ confirm: async () => { throw new DeletionRequestError(issue); } });
    await fixture.flow.submit(true);
    assert.equal(fixture.accepted, 0);
    assert.equal(fixture.views.at(-1).issue, issue);
    assert.equal(fixture.views.at(-1).canRetry, false);
    fixture.flow.dispose();
  }
});

test("network-loss recovery reuses the same confirmation after its submission deadline", async () => {
  let now = 0;
  let sends = 0;
  const fixture = deletionFlow({
    now: () => now,
    confirm: async () => {
      if (++sends <= 2) throw new DeletionRequestError("uncertain");
    },
  });
  await fixture.flow.submit(true);
  assert.equal(fixture.views.at(-1).issue, "uncertain");
  assert.equal(fixture.views.at(-1).canRetry, true);
  assert.equal(fixture.accepted, 0);
  assert.equal(fixture.flow.cancel(), true);
  now = 12_000;
  await fixture.flow.retry();
  assert.equal(fixture.accepted, 1);
  assert.equal(fixture.challenges, 1);
  assert.equal(fixture.bodies.length, 3);
  assert.ok(fixture.bodies.every((body) => body === fixture.bodies[0]));
  assert.deepEqual(fixture.bodies[0], { confirmationToken: "grant", accessToken: "pi-access-token", confirm: true });
  fixture.flow.dispose();
});

test("network-loss recovery cannot issue a fresh deletion once its receipt window closes", async () => {
  let now = 0;
  const fixture = deletionFlow({ now: () => now, confirm: async () => { throw new DeletionRequestError("uncertain"); } });
  await fixture.flow.submit(true);
  now = 600_000;
  await fixture.flow.retry();
  await fixture.flow.submit(true);
  assert.equal(fixture.challenges, 1);
  assert.equal(fixture.bodies.length, 2);
  assert.deepEqual(fixture.views.at(-1), { phase: "issue", issue: "uncertain", canRetry: false });
  fixture.flow.dispose();
});

test("an accepted response after a session change cannot sign out the new session", async () => {
  const pending = deferred();
  let live = true;
  let signal;
  const fixture = deletionFlow({ isCurrent: () => live, confirm: async (_body, value) => { signal = value; await pending.promise; } });
  const request = fixture.flow.submit(true);
  await settle();
  assert.equal(fixture.flow.cancel(), false);
  live = false;
  fixture.flow.dispose();
  assert.equal(signal.aborted, true);
  pending.resolve();
  await request;
  assert.equal(fixture.accepted, 0);
});


test("the deletion dialog follows the server capability and requires an explicit acknowledgment", async () => {
  const hooks = [];
  let cursor = 0;
  let effect;
  let supported = false;
  let challengeCount = 0;
  let accepted = 0;
  const bodyParts = [];
  const jsx = (type, props) => ({ type, props });
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in hooks)) hooks[index] = initial;
      return [hooks[index], (value) => { hooks[index] = value; }];
    },
    useRef(initial) {
      const index = cursor++;
      return hooks[index] ??= { current: initial };
    },
    useEffect(run) { effect = run; },
  };
  const i18n = {};
  loadDictionary(require, i18n);
  const components = {
    react, "react/jsx-runtime": { jsx, jsxs: jsx },
    "@/contexts/pi-auth-context": { usePiAuth: () => ({
      accountDeletionSupported: supported, isCurrentSession: (token) => token === "session",
      getDeletionPiToken: async () => "pi-token", finishAccountDeletion: () => { accepted++; },
    }) },
    "@/lib/account-deletion": {
      ...deletionApi,
      requestDeletionChallenge: async () => { challengeCount++; return { confirmationToken: "proof", expiresAt: Date.now() + 5000 }; },
      confirmAccountDeletion: async (_api, _token, body) => { bodyParts.push(body); },
    },
    "@/lib/api-client": { API_URL: "http://127.0.0.1:9" },
    "@/lib/connect/data": languages,
    "@/lib/connect/i18n": i18n,
    "@/components/ui/alert-dialog": Object.fromEntries([
      "AlertDialog", "AlertDialogCancel", "AlertDialogContent", "AlertDialogDescription", "AlertDialogFooter",
      "AlertDialogTitle", "AlertDialogTrigger",
    ].map((name) => [name, name])),
    "./ui": { Button: "Button" },
  };
  const exports = {};
  compile("components/connect/account-deletion-settings.tsx")((name) => components[name], exports);
  const render = () => { cursor = 0; return exports.AccountDeletionSettings({ sessionToken: "session", language: "ar" }); };
  function find(node, type) {
    if (node?.type === type) return node;
    for (const child of [node?.props?.children].flat(Infinity)) {
      if (child && typeof child === "object") {
        const found = find(child, type);
        if (found) return found;
      }
    }
  }

  assert.equal(render(), null);
  supported = true;
  render();
  const unmount = effect();
  const changeOpen = find(render(), "AlertDialog").props.onOpenChange;
  changeOpen(true);
  assert.equal(find(render(), "AlertDialogContent").props.dir, "rtl");
  assert.equal(find(render(), "Button").props.disabled, true);
  find(render(), "input").props.onChange({ target: { checked: true } });
  assert.equal(find(render(), "Button").props.disabled, false);
  changeOpen(false);
  changeOpen(true);
  assert.equal(find(render(), "Button").props.disabled, true);
  assert.equal(challengeCount, 0);
  find(render(), "input").props.onChange({ target: { checked: true } });
  const submit = find(render(), "Button").props.onClick;
  submit();
  submit();
  await settle();
  assert.equal(challengeCount, 1);
  assert.deepEqual(bodyParts, [{ confirmationToken: "proof", accessToken: "pi-token", confirm: true }]);
  assert.equal(accepted, 1);
  unmount();
});

test("experimental subscription capability is scoped to the active session and clears on acceptance of deletion", async () => {
  const app = mount({ verify: async () => ({
    ...session("experimental"), privateDataOwner: "account-" + "1".repeat(64),
    emailSocketMode: "account", subscriptionStatusSupported: true,
  }) });
  await settle();
  assert.equal(app.render().subscriptionStatusSupported, true);
  app.render().finishAccountDeletion("experimental", "en");
  assert.equal(app.render().subscriptionStatusSupported, false);
  assert.equal(app.render().sessionToken, null);
  app.unmount();
});

test("Pi Testnet confirms the session between simulation and a one-period submission", async () => {
  const exports = {};
  compile("lib/pi-testnet-subscription.ts")(require, exports);
  const submit = exports.submitTestnetSubscription;
  const wallet = "G" + "A".repeat(55);
  const hash = "a".repeat(64);
  const calls = [];
  let current = true;
  const sdk = Object.fromEntries(["subscribe", "toggleAutoRenew", "cancel"].map((method) => [
    method, async (...args) => { calls.push([method, ...args]); return { hash }; },
  ]));
  assert.equal(await submit(sdk, "subscribe", wallet, "460", () => current), hash);
  assert.deepEqual(calls.splice(0), ["simulate", "submit"].map(mode => ["subscribe", wallet, "460", false, "1", { mode }]));
  assert.equal(await submit(sdk, "cancel", wallet, "8", () => current), hash);
  assert.deepEqual(calls.splice(0), ["simulate", "submit"].map(mode => ["cancel", wallet, "8", { mode }]));
  assert.equal(await submit(sdk, "renew", wallet, "8", () => current), hash);
  assert.deepEqual(calls.splice(0), ["simulate", "submit"].map(mode => ["toggleAutoRenew", wallet, "8", "1", { mode }]));
  current = false;
  await assert.rejects(submit(sdk, "subscribe", wallet, "460", () => current), /Session changed/);
  assert.deepEqual(calls.splice(0), [["subscribe", wallet, "460", false, "1", { mode: "simulate" }]]);
  await assert.rejects(submit(sdk, "subscribe", wallet, "7", () => true), /Invalid Testnet/);
  assert.deepEqual(calls, []);
});

test("production group sheet keeps basic controls and gates new moderation for older servers", async () => {
  const jsx = (type, props, key) => ({ type, props, key });
  const locale = {};
  compile("lib/connect/i18n.ts")(() => ({}), locale);
  const configuration = {
    id: "1".repeat(24), name: "Fixture", description: "", owner: "owner",
    members: [{ username: "owner", role: "owner" }, { username: "member", role: "member" }],
    ownRole: "owner", canManage: true, canLeave: false, enhancedGroups: true,
    invitations: ["guest"], offer: null, revision: 0,
  };

  async function render(record) {
    const ui = {};
    const states = [];
    let cursor = 0;
    let mount;
    const modules = {
      "react/jsx-runtime": { jsx, jsxs: jsx },
      react: {
        useRef: current => ({ current }),
        useEffect: effect => { mount ??= effect; },
        useState(initial) {
          const index = cursor++;
          if (!(index in states)) states[index] = initial;
          return [states[index], value => { states[index] = value; }];
        },
      },
      "qrcode.react": {},
      "@/lib/api-client": { getGroupManagement: async () => ({ group: record }), onGroupEvent: () => () => {} },
      "@/contexts/pi-auth-context": {},
      "@/contexts/connect-context": { useConnect: () => ({ lang: "en" }) },
      "@/lib/connect/i18n": locale,
      "./feedback": { Sheet: "sheet", ConfirmDialog: "confirm" },
      "./group-avatar": { GroupAvatar: "avatar" },
      "./group-planning": {},
      "./group-history-browser": {},
      "./group-moderation-panel": { GroupModerationPanel: "moderation-panel" },
    };
    compile("components/connect/group-management.tsx")(name => modules[name], ui);
    const props = { groupId: record.id, token: "fixture", username: "owner", onClose() {}, onLeave() {} };
    ui.GroupManagementSheet(props);
    const cleanup = mount();
    await Promise.resolve();
    cursor = 0;
    const tree = ui.GroupManagementSheet(props);
    cleanup();
    const flatten = node => Array.isArray(node) ? node.flatMap(flatten) :
      node && typeof node === "object" ? [node, ...flatten(node.props?.children)] : [node];
    return flatten(tree);
  }

  const old = await render(configuration);
  assert.ok(old.includes("Invite"));
  assert.ok(old.includes("Pending invitations"));
  assert.ok(!old.some(node => node?.type === "moderation-panel"));
  const current = await render({ ...configuration, moderation: { rules: "Keep it civil", slowModeSeconds: 0 } });
  assert.ok(current.includes("Keep it civil"));
  assert.ok(current.some(node => node?.type === "moderation-panel"));
});
