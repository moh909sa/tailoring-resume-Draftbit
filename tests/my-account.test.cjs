const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const test = require("node:test");
const React = require("react");
const ts = require("typescript");

function load(file, mocks) {
  const path = resolve(__dirname, "..", file);
  const { outputText, diagnostics } = ts.transpileModule(readFileSync(path, "utf8"), {
    fileName: path, reportDiagnostics: true,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  });
  assert.equal(diagnostics.length, 0);
  const module = { exports: {} };
  new Function("require", "module", "exports", outputText)(
    name => Object.hasOwn(mocks, name) ? mocks[name] : require(name), module, module.exports,
  );
  return module.exports;
}

const first = { id: "account-a", email: "person-a@example.test" };
const second = { id: "account-b", email: "person-b@example.test" };
const tick = () => new Promise(resolve => setImmediate(resolve));

function nodes(element) {
  if (!element) return [];
  if (Array.isArray(element)) return element.flatMap(nodes);
  if (typeof element !== "object") return [];
  return [element, ...nodes(element.props?.children)];
}

function label(node) {
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(label).join("");
  return node?.props ? label(node.props.children) : "";
}

function screens(actions) {
  let user = first;
  let loading = false;
  let hooks = [];
  let cursor = 0;
  const navigation = [];
  const react = {
    ...React,
    useState: initial => {
      const index = cursor++;
      if (!(index in hooks)) hooks[index] = initial;
      return [hooks[index], value => { hooks[index] = value; }];
    },
    useRef: initial => {
      const index = cursor++;
      return hooks[index] ??= { current: initial };
    },
  };
  const mocks = {
    react,
    "react-native": { ActivityIndicator: "ActivityIndicator", KeyboardAvoidingView: "KeyboardAvoidingView",
      Platform: { OS: "ios" }, ScrollView: "ScrollView", View: "View", Pressable: "Pressable" },
    "expo-router": { router: { canGoBack: () => false, back: () => navigation.push("back"),
      replace: value => navigation.push(value), navigate: value => navigation.push(value) } },
    "@/lib/icons/LucideIcon": { __esModule: true, default: "Icon" },
    "@/lib/auth/AuthProvider": { useAuth: () => ({ session: user ? { user } : null, loading, error: null }) },
    "@/lib/auth/accountActions": actions,
    "@/lib/aiConsent/AiConsentProvider": { useAiConsent: () => ({ manageConsent: () => {} }) },
    "@/lib/auth/emailLinks": { minimumPasswordLength: 8, passwordHint: "Use at least 8 characters." },
  };
  for (const [file, name] of [
    ["cv/Notice", "Notice"], ["cv/SignInForm", "SignInForm"], ["layout/AppScreen", "AppScreen"],
    ["layout/ScreenHeader", "ScreenHeader"], ["ui/button", "Button"], ["ui/input", "Input"], ["ui/text", "Text"],
    ["ThemeToggle", "ThemeToggle"],
  ]) mocks["@/components/" + file] = { [name]: name };

  const { default: Home } = load("app/(tabs)/home.tsx", mocks);
  const { default: Account } = load("app/account.tsx", mocks);
  return {
    home: () => Home(), account: () => Account(),
    details: () => {
      const component = nodes(Account()).find(node => node.props.ownerId);
      cursor = 0;
      return component.type(component.props);
    },
    navigation,
    set user(value) { user = value; hooks = []; },
    set loading(value) { loading = value; },
  };
}

test("signed-in Home opens My Account and the account view follows the authenticated email", () => {
  const h = screens({});
  nodes(h.home()).find(node => node.type === "Pressable" && label(node) === "My Account").props.onPress();
  assert.deepEqual(h.navigation, ["/account"]);
  let view = h.details();
  assert.match(label(view), /person-a@example\.test/);
  assert.doesNotMatch(label(view), /subscription|free plan|current plan/i);
  h.user = second;
  view = h.details();
  assert.match(label(view), /person-b@example\.test/);
  assert.doesNotMatch(label(view), /person-a@example\.test/);
  h.user = null;
  assert.doesNotMatch(label(h.home()), /My Account/);
  assert.ok(nodes(h.account()).some(node => node.type === "SignInForm"));
});

test("password change validates confirmation and signs out through the shared account action", async () => {
  const calls = [];
  const h = screens({
    changeAccountPassword: async (...args) => calls.push(["change", ...args]),
    signOutOfAccount: async id => { calls.push(["signOut", id]); },
  });
  const button = (view, text) => nodes(view).find(node => node.type === "Button" && label(node) === text);
  button(h.details(), "Change password").props.onPress();
  for (const [label, value] of [["Current password", "old-password"], ["New password", "new-password"], ["Confirm new password", "typo"]]) {
    nodes(h.details()).find(node => node.type === "Input" && node.props.accessibilityLabel === label).props.onChangeText(value);
  }
  button(h.details(), "Save new password").props.onPress();
  assert.deepEqual(calls, []);
  assert.match(nodes(h.details()).find(node => node.type === "Notice").props.message, /match/);
  nodes(h.details()).find(node => node.type === "Input" && node.props.accessibilityLabel === "Confirm new password").props.onChangeText("new-password");
  button(h.details(), "Save new password").props.onPress();
  await tick();
  assert.deepEqual(calls, [["change", first.id, "old-password", "new-password"]]);
  assert.match(nodes(h.details()).find(node => node.type === "Notice").props.message, /changed/);
  button(h.details(), "Sign out").props.onPress();
  await tick();
  assert.deepEqual(calls.at(-1), ["signOut", first.id]);
  h.user = null;
  assert.ok(nodes(h.account()).some(node => node.type === "SignInForm"));
});

test("account actions verify the active owner, send the current password to Supabase, and sign out locally", async () => {
  let user = first;
  const calls = [];
  const sdk = require("@supabase/supabase-js");
  const { changeAccountPassword, signOutOfAccount, passwordChangeMessage } = load("lib/auth/accountActions.ts", {
    "@/lib/supabase": { supabase: { auth: {
      getSession: async () => ({ data: { session: user ? { user } : null }, error: null }),
      updateUser: async payload => { calls.push(payload); return { error: null }; },
      signOut: async options => { calls.push(options); return { error: null }; },
    } } },
    "./emailLinks": { authMessage: () => "Try again." },
  });
  await changeAccountPassword(first.id, "old-password", "new-password");
  assert.deepEqual(calls, [{ current_password: "old-password", password: "new-password" }]);
  user = second;
  await assert.rejects(changeAccountPassword(first.id, "old-password", "new-password"), /sign-in changed/);
  await assert.rejects(signOutOfAccount(first.id), /sign-in changed/);
  await signOutOfAccount(second.id);
  assert.deepEqual(calls.at(-1), { scope: "local" });
  assert.equal(calls.length, 2);
  assert.match(passwordChangeMessage(new sdk.AuthApiError("testing", 400, "reauthentication_needed")), /sign back in/);
});
