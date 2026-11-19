import { useRef, useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { isAuthError } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { Notice } from "@/components/cv/Notice";
import {
  authMessage, confirmEmailSent, createEmailAccount, minimumPasswordLength, resetEmailSent,
  sendConfirmationEmail, sendPasswordResetEmail,
} from "@/lib/auth/emailLinks";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/theming/ThemeProvider";
import type { CvNotice } from "@/lib/cv/types";

export type SignInMode = "signIn" | "create" | "recovery" | "confirm";

const copy = {
  signIn: { title: "Sign in to your account", help: "Your CVs are linked to your account.", submit: "Sign in" },
  create: { title: "Create your account", help: "Your CVs are linked to your account.", submit: "Create account" },
  recovery: { title: "Forgot your password?", help: "Enter the email you use to sign in.", submit: "Send reset link" },
  confirm: { title: "Confirm your email", help: "Enter the email you used to create your account.", submit: "Send confirmation link" },
};

export function SignInForm({ onClose, initialMode = "signIn", initialEmail = "" }: {
  onClose: () => void;
  initialMode?: SignInMode;
  initialEmail?: string;
}) {
  const { theme } = useTheme();
  const [mode, setMode] = useState(initialMode);
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [confirmationRequired, setConfirmationRequired] = useState(false);
  const [notice, setNotice] = useState<CvNotice | null>(null);
  const busy = useRef(false);
  const asksForPassword = mode === "signIn" || mode === "create";
  const creating = mode === "create";

  function switchMode(next: SignInMode) {
    if (busy.current) return;
    setMode(next);
    setNotice(null);
    setPassword("");
    setConfirmationRequired(false);
  }

  async function submit() {
    if (busy.current || !supabase) return;
    const address = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
      setNotice({ tone: "error", message: "Enter a valid email address." });
      return;
    }
    if (asksForPassword && (!password || (creating && password.length < minimumPasswordLength))) {
      setNotice({ tone: "error", message: creating ? "Use a password with at least 8 characters." : "Enter your password." });
      return;
    }
    busy.current = true;
    setSubmitting(true);
    setNotice(null);
    setConfirmationRequired(false);
    try {
      if (mode === "recovery") {
        await sendPasswordResetEmail(address);
        setNotice({ tone: "info", message: resetEmailSent });
      } else if (mode === "confirm") {
        await sendConfirmationEmail(address);
        setNotice({ tone: "info", message: confirmEmailSent });
      } else if (creating) {
        const signedIn = await createEmailAccount(address, password);
        setPassword("");
        if (signedIn) onClose();
        else {
          setMode("signIn");
          setConfirmationRequired(true);
          setNotice({ tone: "info", message: confirmEmailSent });
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email: address, password });
        if (error) throw error;
        if (!data.session) throw new Error("Sign-in did not return a session.");
        setPassword("");
        onClose();
      }
    } catch (error) {
      setConfirmationRequired(mode === "signIn" && isAuthError(error) && error.code === "email_not_confirmed");
      setNotice({ tone: "error", message: authMessage(error, mode) });
    } finally {
      busy.current = false;
      setSubmitting(false);
    }
  }

  return (
    <View className="gap-4 rounded-2xl border border-border bg-card p-5">
      <Text className="text-h4 text-foreground">{copy[mode].title}</Text>
      <Text className="text-body leading-5 text-muted-foreground">{copy[mode].help}</Text>
      <View className="gap-2">
        <Text className="text-h6 text-foreground">Email</Text>
        <Input accessibilityLabel="Email address" placeholder="you@example.com" value={email} onChangeText={setEmail}
          keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email"
          textContentType="emailAddress" editable={!submitting} returnKeyType={asksForPassword ? "next" : "go"}
          onSubmitEditing={asksForPassword ? undefined : () => void submit()} className="h-12 rounded-xl" />
      </View>
      {asksForPassword ? <View className="gap-2">
        <Text className="text-h6 text-foreground">Password</Text>
        <Input accessibilityLabel="Password" placeholder={creating ? "At least 8 characters" : "Your password"}
          value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoCorrect={false}
          autoComplete={creating ? "new-password" : "current-password"} textContentType={creating ? "newPassword" : "password"}
          editable={!submitting} returnKeyType="go" onSubmitEditing={() => void submit()} className="h-12 rounded-xl" />
        {mode === "signIn" ? <Pressable accessibilityRole="button" disabled={submitting}
          onPress={() => switchMode("recovery")} className="min-h-11 justify-center self-end">
          <Text className="text-h6 text-primary">Forgot password?</Text>
        </Pressable> : null}
      </View> : null}
      {notice ? <Notice {...notice} /> : null}
      <Button onPress={() => void submit()} disabled={submitting || !supabase} className="h-12 gap-2 rounded-xl">
        {submitting ? <ActivityIndicator size="small" color={theme.colors.primaryForeground} /> : null}
        <Text>{submitting ? "Please wait…" : copy[mode].submit}</Text>
      </Button>
      {confirmationRequired ? <Pressable accessibilityRole="button" disabled={submitting}
        onPress={() => switchMode("confirm")} className="min-h-11 justify-center self-start">
        <Text className="text-h6 text-primary">Send a new confirmation link</Text>
      </Pressable> : null}
      <View className="flex-row flex-wrap items-center justify-between gap-x-3">
        <Pressable disabled={submitting} accessibilityRole="button" onPress={() => switchMode(mode === "signIn" ? "create" : "signIn")} className="min-h-11 justify-center">
          <Text className="text-h6 text-primary">{mode === "signIn" ? "Create an account" : "Back to sign in"}</Text>
        </Pressable>
        <Pressable disabled={submitting} accessibilityRole="button" onPress={onClose} className="min-h-11 justify-center">
          <Text className="text-body text-muted-foreground">Cancel</Text>
        </Pressable>
      </View>
    </View>
  );
}
