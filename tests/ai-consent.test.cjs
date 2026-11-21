const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const test = require("node:test");
const React = require("react");
const ts = require("typescript");

const disclosure = {
  version: "a".repeat(64), recipients: ["Fixture provider"], retention: "Fixture retention.",
};

function harness() {
  let owner = "owner-a";
  let route = "/library/my-cvs";
  let accepted = null;
  let failSave = false;
  let deferredRead;
  let cursor;
  const hooks = [];
  const requests = [];
  const mock = {
    react: {
      ...React,
      useEffect() {},
      useState(initial) {
        const index = cursor++;
        if (!(index in hooks)) hooks[index] = initial;
        return [hooks[index], (value) => { hooks[index] = value; }];
      },
      useRef(initial) {
        const index = cursor++;
        return hooks[index] ??= { current: initial };
      },
    },
    "react-native": { ActivityIndicator: "ActivityIndicator", ScrollView: "ScrollView", View: "View" },
    "expo-router": { usePathname: () => route },
    "@/components/layout/AppSheet": { AppSheet: "AppSheet" },
    "@/components/cv/Notice": { Notice: "Notice" },
    "@/components/ui/button": { Button: "Button" },
    "@/components/ui/text": { Text: "Text" },
    "@/lib/auth/AuthProvider": { useAuth: () => ({ session: { user: { id: owner } } }) },
    "@/lib/cv/api": {
      CvApiError: class extends Error {},
      async getAiConsent(account) {
        requests.push(["get", account]);
        if (deferredRead) return deferredRead;
        return { ...disclosure, accepted };
      },
      async saveAiConsent(account, version, decision) {
        requests.push(["put", account, version, decision]);
        if (failSave) throw new Error("Offline");
        accepted = decision;
        return { ...disclosure, accepted };
      },
    },
  };
  const js = ts.transpileModule(
    readFileSync(resolve(__dirname, "../lib/aiConsent/AiConsentProvider.tsx"), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } },
  ).outputText;
  const mod = { exports: {} };
  new Function("require", "module", "exports", js)((name) => mock[name] ?? require(name), mod, mod.exports);
  function render() {
    cursor = 0;
    return mod.exports.AiConsentProvider({ children: null });
  }
  function nodes(element) {
    if (Array.isArray(element)) return element.flatMap(nodes);
    if (!element?.props) return [];
    return [element, ...nodes(element.props.children)];
  }
  function button(label) {
    return nodes(render()).find((node) => node.type === "Button" && node.props.children.props.children === label);
  }
  return {
    requests, button, render,
    actions: () => render().props.value,
    setOwner: (value) => { owner = value; },
    setRoute: (value) => { route = value; },
    failSave: () => { failSave = true; },
    deferRead: () => {
      let finish;
      deferredRead = new Promise((resolveRead) => { finish = resolveRead; });
      return finish;
    },
  };
}

const tick = async () => { await new Promise(setImmediate); };

test("consent uses the authenticated mobile endpoint and sends only the version and choice", async () => {
  const path = resolve(__dirname, "../lib/cv/api.ts");
  const js = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  const mod = { exports: {} };
  const calls = [];
  const session = { access_token: "test-token", expires_at: 9999999999, user: { id: "owner-a" } };
  const mockModules = {
    "@/lib/supabase": { supabase: { auth: { getSession: async () => ({ data: { session } }) } } },
    "@/lib/cv/types": { isRecord: (value) => value !== null && typeof value === "object" },
    "@/lib/tailoring/types": {},
  };
  const fetch = async (url, options) => {
    calls.push([url, options.method, options.headers.Authorization, options.body]);
    return new Response(JSON.stringify({ ...disclosure, accepted: options.method === "PUT" ? false : null }));
  };
  new Function("require", "module", "exports", "process", "fetch", js)(
    (name) => mockModules[name] ?? require(name), mod, mod.exports,
    { env: { EXPO_PUBLIC_RESUME_API_URL: "https://cv.example.test/" } }, fetch,
  );
  const signal = new AbortController().signal;
  assert.equal((await mod.exports.getAiConsent("owner-a", signal)).accepted, null);
  assert.equal((await mod.exports.saveAiConsent("owner-a", disclosure.version, false, signal)).accepted, false);
  const url = "https://cv.example.test/api/v1/mobile/ai-consent";
  assert.deepEqual(calls, [
    [url, "GET", "Bearer test-token", undefined],
    [url, "PUT", "Bearer test-token", JSON.stringify({ version: disclosure.version, accepted: false })],
  ]);
});

test("a refusal cancels the pending action, and only saved consent enables a fresh action", async () => {
  const h = harness();
  let starts = 0;
  const start = () => { starts++; };
  h.actions().withConsent(start);
  await tick();
  assert.equal(starts, 0);
  h.button("Decline").props.onPress();
  await tick();
  assert.deepEqual(h.requests.at(-1), ["put", "owner-a", disclosure.version, false]);
  assert.equal(starts, 0);
  h.button("Close").props.onPress();

  h.actions().withConsent(start);
  await tick();
  h.button("Allow AI processing").props.onPress();
  await tick();
  assert.deepEqual(h.requests.at(-1), ["put", "owner-a", disclosure.version, true]);
  assert.equal(starts, 0);
  h.button("Close").props.onPress();
  h.actions().withConsent(start);
  h.actions().withConsent(start);
  await tick();
  assert.equal(starts, 1);
});

test("saving an approval unsuccessfully keeps the action blocked", async () => {
  const h = harness();
  h.failSave();
  let starts = 0;
  h.actions().withConsent(() => { starts++; });
  await tick();
  h.button("Allow AI processing").props.onPress();
  await tick();
  assert.ok(h.button("Decline"));
  assert.ok(h.button("Allow AI processing"));
  assert.equal(starts, 0);
});

test("late replies cannot start an action after changing routes or accounts", async () => {
  for (const move of [(h) => h.setOwner("owner-b"), (h) => h.setRoute("/account")]) {
    const h = harness();
    const finish = h.deferRead();
    let starts = 0;
    h.actions().withConsent(() => { starts++; });
    move(h);
    h.render();
    finish({ ...disclosure, accepted: true });
    await tick();
    assert.equal(h.button("Allow AI processing"), undefined);
    assert.equal(starts, 0);
  }
});
