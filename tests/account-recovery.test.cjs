const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { resolve, dirname } = require("node:path");
const { createHash, randomFillSync, webcrypto } = require("node:crypto");
const test = require("node:test");
const ts = require("typescript");
const sdk = require("@supabase/supabase-js");
const React = require("react");

function load(entry, mocks = {}, globals = globalThis) {
  const cache = new Map();
  const root = resolve(__dirname, "..");
  function read(file) {
    if (cache.has(file)) return cache.get(file).exports;
    const { outputText, diagnostics } = ts.transpileModule(readFileSync(file, "utf8"), {
      fileName: file,
      reportDiagnostics: true,
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    });
    assert.equal(diagnostics.length, 0, file);
    const module = { exports: {} };
    cache.set(file, module);
    new Function("require", "module", "exports", "globalThis", "process", outputText)(name => {
      if (Object.hasOwn(mocks, name)) return mocks[name];
      if (name.startsWith("@/")) return read(resolve(root, name.slice(2) + ".ts"));
      if (name.startsWith(".")) return read(resolve(dirname(file), name + ".ts"));
      return require(name);
    }, module, module.exports, globals, {
      env: {
        EXPO_PUBLIC_SUPABASE_URL: "https://auth.example.invalid",
        EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test_fixture",
      },
    });
    return module.exports;
  }
  return read(resolve(root, entry));
}

const oldUser = { id: "existing-account", email: "existing@example.test", aud: "authenticated" };
const recoveryUser = { id: "recovery-account", email: "recover@example.test", aud: "authenticated" };
const jwt = id => Buffer.from('{"alg":"HS256"}').toString("base64url") + "." + Buffer.from(JSON.stringify({ sub: id })).toString("base64url") + ".signature";
const session = user => ({ access_token: jwt(user.id), refresh_token: "fixture-" + user.id, expires_in: 3600, token_type: "bearer", user });
const json = (data, status = 200) => Response.json(data, { status });

function authHarness() {
  const storage = new Map();
  const calls = [];
  const pending = new Map();
  const clients = [];
  let passwordChanged = false;
  const fetch = async (input, options) => {
    const url = new URL(input);
    const body = options.body ? JSON.parse(options.body) : {};
    const authorization = new Headers(options.headers).get("Authorization");
    calls.push({ url, body, authorization });
    if (url.pathname.endsWith("/recover")) {
      pending.set("reset-grant", body.code_challenge);
      return json({});
    }
    if (url.pathname.endsWith("/signup") || url.pathname.endsWith("/resend")) {
      pending.set("confirm-grant", body.code_challenge);
      return json(url.pathname.endsWith("/signup") ? recoveryUser : {});
    }
    if (url.searchParams.get("grant_type") === "pkce") {
      const challenge = createHash("sha256").update(body.code_verifier).digest("base64url");
      if (pending.get(body.auth_code) !== challenge) {
        return json({ code: "flow_state_expired", msg: "Expired or used" }, 403);
      }
      pending.delete(body.auth_code);
      return json(session(recoveryUser));
    }
    if (url.searchParams.get("grant_type") === "password") {
      if (body.email === oldUser.email && body.password === "existing-password") return json(session(oldUser));
      if (passwordChanged && body.email === recoveryUser.email && body.password === "replacement-password") return json(session(recoveryUser));
      return json({ code: "invalid_credentials", msg: "Invalid credentials" }, 400);
    }
    if (url.pathname.endsWith("/user") && options.method === "PUT") {
      assert.equal(authorization, "Bearer " + jwt(recoveryUser.id));
      passwordChanged = body.password === "replacement-password";
      return json(recoveryUser);
    }
    if (url.pathname.endsWith("/logout")) return json({});
    assert.fail("Unexpected request to " + url.pathname);
  };
  const mocks = {
    "react-native-url-polyfill/auto": {},
    "react-native": { Platform: { OS: "ios" } },
    "expo-crypto": {
      getRandomValues: randomFillSync,
      CryptoDigestAlgorithm: { SHA256: "SHA-256" },
      digest: webcrypto.subtle.digest.bind(webcrypto.subtle),
    },
    "@react-native-async-storage/async-storage": {
      __esModule: true,
      default: {
        getItem: async key => storage.get(key) ?? null,
        setItem: async (key, value) => { storage.set(key, value); },
        removeItem: async key => { storage.delete(key); },
      },
    },
    "@supabase/supabase-js": {
      ...sdk,
      createClient(url, key, options) {
        const client = sdk.createClient(url, key, { ...options, global: { fetch } });
        clients.push(client);
        return client;
      },
    },
  };
  // In the app Metro chooses the native implementation.
  function open() {
    mocks["./linkCrypto"] = load("lib/auth/linkCrypto.native.ts", mocks);
    const primary = load("lib/supabase.ts", mocks);
    return { primary, links: load("lib/auth/emailLinks.ts", { ...mocks, "@/lib/supabase": primary }) };
  }
  return {
    open, storage, calls, pending,
    close: () => { for (const client of clients) client.auth.stopAutoRefresh(); },
  };
}

test("reset email uses S256, survives relaunch, changes only the recovery account, and rejects reuse", async t => {
  const h = authHarness();
  t.after(h.close);
  const first = h.open();
  const existing = await first.primary.supabase.auth.signInWithPassword({ email: oldUser.email, password: "existing-password" });
  assert.equal(existing.data.user.id, oldUser.id);
  await first.links.sendPasswordResetEmail(recoveryUser.email);

  const request = h.calls.find(call => call.url.pathname.endsWith("/recover"));
  assert.equal(request.url.searchParams.get("redirect_to"), "resume-tailoring://auth/reset-password");
  assert.equal(request.body.code_challenge_method, "s256");
  assert.match(request.body.code_challenge, /^[A-Za-z0-9_-]{43}$/);
  assert.ok([...h.storage.keys()].some(key => key.startsWith("resume-email-link-recovery") && key.endsWith("-code-verifier")));

  const restarted = h.open();
  assert.equal((await restarted.primary.supabase.auth.getSession()).data.session.user.id, oldUser.id);
  const reset = await restarted.links.openEmailLink("recovery", "reset-grant");
  assert.equal(reset.email, recoveryUser.email);
  assert.equal((await restarted.primary.supabase.auth.getSession()).data.session.user.id, oldUser.id);
  await reset.save("replacement-password");
  assert.equal((await restarted.primary.supabase.auth.getSession()).data.session.user.id, oldUser.id);
  assert.ok([...h.storage.keys()].every(key => !key.startsWith("resume-email-link-recovery") || key.endsWith("-code-verifier")));
  assert.ok([...h.storage.values()].every(value => !value.includes("replacement-password") && !value.includes(jwt(recoveryUser.id))));

  await assert.rejects(restarted.links.openEmailLink("recovery", "reset-grant"), { reason: "differentDevice" });
  await assert.rejects(reset.save("a-second-password"), { reason: "invalid" });
  assert.equal(h.calls.filter(call => call.url.pathname.endsWith("/user")).length, 1);

  const signedOut = await restarted.primary.supabase.auth.signOut({ scope: "local" });
  assert.equal(signedOut.error, null);
  const fresh = h.open();
  assert.equal((await fresh.primary.supabase.auth.getSession()).data.session, null);
  const signedIn = await fresh.primary.supabase.auth.signInWithPassword({ email: recoveryUser.email, password: "replacement-password" });
  assert.equal(signedIn.data.user.id, recoveryUser.id);
});

test("sign-up and resend use the confirmation redirect independently of recovery", async t => {
  const h = authHarness();
  t.after(h.close);
  const { primary, links } = h.open();
  assert.equal(await links.createEmailAccount(recoveryUser.email, "initial-password"), false);
  await links.sendPasswordResetEmail(recoveryUser.email);
  await links.sendConfirmationEmail(recoveryUser.email);
  for (const name of ["signup", "resend"]) {
    const request = h.calls.find(call => call.url.pathname.endsWith("/" + name));
    assert.equal(request.url.searchParams.get("redirect_to"), "resume-tailoring://auth/confirm-email");
    assert.equal(request.body.code_challenge_method, "s256");
  }
  assert.deepEqual(await links.openEmailLink("confirm", "confirm-grant"), { kind: "confirm" });
  assert.equal((await primary.supabase.auth.getSession()).data.session, null);
  h.pending.delete("reset-grant");
  await assert.rejects(links.openEmailLink("recovery", "reset-grant"), { reason: "invalid" });
  assert.equal(h.calls.filter(call => call.url.pathname.endsWith("/user")).length, 0);
});

test("callback parsing rejects fragments, expired links, and ambiguous codes", () => {
  const { emailLinkCode, emailLinkRedirect } = load("lib/auth/redirects.ts");
  assert.equal(emailLinkRedirect("recovery", "https://preview.example.test"), "https://preview.example.test/auth/reset-password");
  assert.equal(emailLinkCode({ code: "valid-code" }), "valid-code");
  assert.equal(emailLinkCode({ code: ["one-code", "two-code"] }), null);
  assert.equal(emailLinkCode({ code: "valid-code", error_code: "otp_expired" }), null);
  assert.equal(emailLinkCode({ code: "valid-code" }, "#error_code=otp_expired"), null);
  assert.equal(emailLinkCode({}, "#access_token=fixture&refresh_token=fixture"), null);
});

test("native PKCE fallbacks supply secure randomness, SHA-256 and UTF-8 when Hermes globals are missing", async () => {
  const globals = {};
  const { ensureLinkCrypto } = load("lib/auth/linkCrypto.native.ts", { "expo-crypto": {
    getRandomValues: randomFillSync,
    CryptoDigestAlgorithm: { SHA256: "SHA-256" },
    digest: webcrypto.subtle.digest.bind(webcrypto.subtle),
  } }, globals);
  ensureLinkCrypto();
  const encoder = new globals.TextEncoder();
  assert.deepEqual(encoder.encode("café"), Uint8Array.from(Buffer.from("café")));
  const destination = new Uint8Array(3);
  assert.deepEqual(encoder.encodeInto("a🌟", destination), { read: 1, written: 1 });
  const bytes = new Uint32Array(56);
  assert.equal(globals.crypto.getRandomValues(bytes), bytes);
  assert.ok(bytes.some(byte => byte > 0));
  const binary = await globals.crypto.subtle.digest("SHA-256", encoder.encode("fixture"));
  assert.equal(globals.btoa(String.fromCharCode(...new Uint8Array(binary))), createHash("sha256").update("fixture").digest("base64"));
});

test("foreground rechecks the session, preserves it during a network failure, and fences stale reads after sign-out", async () => {
  let reading = () => Promise.resolve({ data: { session: { user: oldUser } }, error: null });
  let nextState;
  let authEvent;
  let started = 0;
  let stopped = 0;
  let effect;
  let state;
  const { AuthProvider } = load("lib/auth/AuthProvider.tsx", {
    react: {
      ...React,
      useState: initial => {
        state ??= initial;
        return [state, next => { state = typeof next === "function" ? next(state) : next; }];
      },
      useEffect: run => { effect = run; },
    },
    "react-native": {
      Platform: { OS: "ios" },
      AppState: { currentState: "active", addEventListener: (_name, callback) => { nextState = callback; return { remove() {} }; } },
    },
    "@/lib/supabase": { supabase: { auth: {
      getSession: () => reading(),
      startAutoRefresh: () => { started++; },
      stopAutoRefresh: () => { stopped++; },
      onAuthStateChange: callback => { authEvent = callback; return { data: { subscription: { unsubscribe() {} } } }; },
    } } },
  });
  const tick = () => new Promise(resolve => setImmediate(resolve));
  AuthProvider({});
  const dispose = effect();
  try {
    await tick();
    assert.equal(state.session.user.id, oldUser.id);
    authEvent("INITIAL_SESSION", null);
    assert.equal(state.session.user.id, oldUser.id);
    nextState("background");
    assert.equal(stopped, 1);
    reading = () => Promise.resolve({ data: { session: null }, error: new sdk.AuthRetryableFetchError("Network unavailable", 0) });
    nextState("active");
    await tick();
    assert.equal(started, 2);
    assert.equal(state.session.user.id, oldUser.id);
    assert.match(state.error, /restore your sign-in/);
    let release;
    reading = () => new Promise(resolve => { release = resolve; });
    nextState("active");
    authEvent("SIGNED_OUT", null);
    release({ data: { session: { user: oldUser } }, error: null });
    await tick();
    assert.equal(state.session, null);
    assert.equal(state.error, null);
  } finally {
    dispose();
  }
});
