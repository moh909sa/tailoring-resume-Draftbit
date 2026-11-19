import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { AppScreen } from "@/components/layout/AppScreen";
import { ScreenHeader } from "@/components/layout/ScreenHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { Notice } from "@/components/cv/Notice";
import { SignInForm, type SignInMode } from "@/components/cv/SignInForm";
import { authMessage, EmailLinkError, minimumPasswordLength, openEmailLink, passwordHint, type PasswordReset } from "@/lib/auth/emailLinks";
import { emailLinkCode, type EmailLinkKind } from "@/lib/auth/redirects";

type OpenedLink = Awaited<ReturnType<typeof openEmailLink>>;
type LinkState =
  | { status: "loading" | "confirmed" | "saved" }
  | { status: "invalid"; message: string }
  | { status: "ready"; reset: PasswordReset };

function linkMessage(kind: EmailLinkKind, error?: unknown) {
  const label = kind === "recovery" ? "reset" : "confirmation";
  if (error instanceof EmailLinkError && error.reason === "differentDevice") {
    return "This link may already have been used or requested on another device. Open the latest email where you requested it, or request a new " + label + " link here.";
  }
  if (error instanceof EmailLinkError && error.reason === "unavailable") {
    return "We couldn’t check this link. Check your connection and request a new " + label + " link.";
  }
  return "This " + label + " link has expired or already been used. Request a new link to continue.";
}

function EmailLinkScreen({ kind, code }: { kind: EmailLinkKind; code: string | null }) {
  const [state, setState] = useState<LinkState>(() => code ? { status: "loading" } : { status: "invalid", message: linkMessage(kind) });
  const [mode, setMode] = useState<SignInMode | null>(null);
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [email, setEmail] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const request = useRef<Promise<OpenedLink> | null>(null);
  const mounted = useRef(false);
  const recovery = kind === "recovery";

  useEffect(() => {
    mounted.current = true;
    const browser = Platform.OS === "web" ? globalThis.window : undefined;
    if (browser && (browser.location.search || browser.location.hash)) {
      browser.history.replaceState(browser.history.state, "", browser.location.pathname);
    }
    if (code) {
      request.current ??= openEmailLink(kind, code);
      void request.current.then(result => {
        if (!mounted.current) return;
        if (result.kind === "confirm") setState({ status: "confirmed" });
        else {
          setEmail(result.email);
          setState({ status: "ready", reset: result });
        }
      }, error => {
        if (mounted.current) setState({ status: "invalid", message: linkMessage(kind, error) });
      });
    }
    return () => {
      mounted.current = false;
      void request.current?.then(result => {
        if (!mounted.current && result.kind === "recovery") return result.close();
      }).catch(() => undefined);
    };
  }, [code, kind]);

  async function savePassword() {
    if (savingRef.current || state.status !== "ready") return;
    if (password.length < minimumPasswordLength || password !== repeat) {
      setProblem(password.length < minimumPasswordLength ? passwordHint : "The passwords don’t match.");
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setProblem(null);
    try {
      await state.reset.save(password);
      if (mounted.current) {
        setPassword("");
        setRepeat("");
        setState({ status: "saved" });
      }
    } catch (error) {
      if (mounted.current) {
        if (error instanceof EmailLinkError) setState({ status: "invalid", message: linkMessage(kind, error) });
        else setProblem(authMessage(error, "password"));
      }
    } finally {
      savingRef.current = false;
      if (mounted.current) setSaving(false);
    }
  }

  const close = () => router.replace("/(tabs)/library/my-cvs");
  return <AppScreen>
    <ScreenHeader title={recovery ? "Reset password" : "Confirm email"} />
    <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="px-6 pb-12 pt-4">
        {mode ? <SignInForm initialMode={mode} initialEmail={email} onClose={close} /> : (
          <View className="gap-5 rounded-2xl border border-border bg-card p-5">
            {state.status === "loading" ? <View className="flex-row items-center gap-3" accessibilityLiveRegion="polite">
              <ActivityIndicator /><Text className="text-body text-foreground">Checking your email link…</Text>
            </View> : null}
            {state.status === "invalid" ? <>
              <Notice tone="error" message={state.message} />
              <Button className="min-h-12" onPress={() => setMode(recovery ? "recovery" : "confirm")}>
                <Text>{recovery ? "Request a new reset link" : "Request a new confirmation link"}</Text>
              </Button>
              <Button variant="ghost" className="min-h-11" onPress={() => setMode("signIn")}><Text>Back to sign in</Text></Button>
            </> : null}
            {state.status === "ready" ? <>
              <View className="gap-2">
                <Text className="text-h4 text-foreground">Choose a new password</Text>
                {email ? <Text className="text-body text-muted-foreground">{email}</Text> : null}
                <Text className="text-body text-muted-foreground">{passwordHint}</Text>
              </View>
              <View className="gap-2">
                <Text className="text-h6 text-foreground">New password</Text>
                <Input accessibilityLabel="New password" value={password} onChangeText={setPassword} editable={!saving}
                  secureTextEntry autoCapitalize="none" autoCorrect={false} autoComplete="new-password" textContentType="newPassword" />
              </View>
              <View className="gap-2">
                <Text className="text-h6 text-foreground">Confirm new password</Text>
                <Input accessibilityLabel="Confirm new password" value={repeat} onChangeText={setRepeat} editable={!saving}
                  secureTextEntry autoCapitalize="none" autoCorrect={false} autoComplete="new-password" textContentType="newPassword"
                  returnKeyType="go" onSubmitEditing={() => void savePassword()} />
              </View>
              {problem ? <Notice tone="error" message={problem} /> : null}
              <Button className="min-h-12" disabled={saving} onPress={() => void savePassword()}><Text>{saving ? "Saving…" : "Save new password"}</Text></Button>
              <Button variant="ghost" className="min-h-11" disabled={saving} onPress={close}><Text>Cancel</Text></Button>
            </> : null}
            {state.status === "saved" || state.status === "confirmed" ? <>
              <Notice tone="success" message={state.status === "saved" ? "Password changed. Sign in with your new password." : "Email confirmed. Sign in to access your CVs."} />
              <Button className="min-h-12" onPress={() => setMode("signIn")}><Text>Sign in</Text></Button>
            </> : null}
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  </AppScreen>;
}

export default function EmailLinkRoute() {
  const params = useLocalSearchParams<{ action: string | string[]; code?: string | string[]; "#"?: string }>();
  const kind = params.action === "confirm-email" ? "confirm" : "recovery";
  const valid = params.action === "confirm-email" || params.action === "reset-password";
  const browserHash = Platform.OS === "web" ? globalThis.window?.location.hash : undefined;
  const hash = typeof params["#"] === "string" ? params["#"] : browserHash;
  const code = valid ? emailLinkCode(params, hash) : null;
  return <EmailLinkScreen key={kind + (code ?? "")} kind={kind} code={code} />;
}
