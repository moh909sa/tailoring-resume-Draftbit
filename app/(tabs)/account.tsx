import { useRef, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { Notice } from "@/components/cv/Notice";
import { SignInForm } from "@/components/cv/SignInForm";
import { AppScreen } from "@/components/layout/AppScreen";
import { ScreenHeader } from "@/components/layout/ScreenHeader";
import { AccountLinks } from "@/components/account/AccountLinks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { useAuth } from "@/lib/auth/AuthProvider";
import { changeAccountPassword, passwordChangeMessage, signOutOfAccount } from "@/lib/auth/accountActions";
import { minimumPasswordLength, passwordHint } from "@/lib/auth/emailLinks";
import LucideIcon from "@/lib/icons/LucideIcon";

function AccountDetails({ ownerId, email }: { ownerId: string; email?: string }) {
  const [editing, setEditing] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [busy, setBusy] = useState<"password" | "signOut" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [changed, setChanged] = useState(false);
  const pending = useRef(false);

  function togglePasswordForm(open: boolean) {
    if (pending.current) return;
    setEditing(open);
    setCurrent("");
    setNext("");
    setRepeat("");
    setError(null);
    setChanged(false);
  }

  async function savePassword() {
    if (pending.current) return;
    if (!current || next.length < minimumPasswordLength || current === next || next !== repeat) {
      setError(!current ? "Enter your current password." : next.length < minimumPasswordLength ? passwordHint
        : current === next ? "Choose a different password." : "The new passwords don’t match.");
      return;
    }
    pending.current = true;
    setBusy("password");
    setError(null);
    try {
      await changeAccountPassword(ownerId, current, next);
      setCurrent("");
      setNext("");
      setRepeat("");
      setEditing(false);
      setChanged(true);
    } catch (error) {
      setError(passwordChangeMessage(error));
    } finally {
      pending.current = false;
      setBusy(null);
    }
  }

  async function signOut() {
    if (pending.current) return;
    pending.current = true;
    setBusy("signOut");
    setError(null);
    setChanged(false);
    try {
      await signOutOfAccount(ownerId);
    } catch {
      setError("Couldn’t sign out. Check your connection and try again.");
    } finally {
      pending.current = false;
      setBusy(null);
    }
  }

  return (
    <View className="gap-5">
      <View className="flex-row items-center gap-4 rounded-2xl border border-border bg-card p-5">
        <View className="h-11 w-11 items-center justify-center rounded-xl bg-secondary">
          <LucideIcon name="UserRound" size={20} className="text-primary" />
        </View>
        <View className="min-w-0 flex-1 gap-1">
          <Text className="text-caption text-muted-foreground">Signed-in email</Text>
          <Text selectable className="text-h6 text-foreground">{email || "Email unavailable"}</Text>
        </View>
      </View>
      {changed ? <Notice tone="success" message="Your password has been changed." /> : null}
      {editing ? (
        <View className="gap-4 rounded-2xl border border-border bg-card p-5">
          <Text accessibilityRole="header" className="text-h4 text-foreground">Change password</Text>
          <View className="gap-2">
            <Text className="text-h6 text-foreground">Current password</Text>
            <Input accessibilityLabel="Current password" value={current} onChangeText={setCurrent}
              editable={!busy} secureTextEntry autoCapitalize="none" autoCorrect={false}
              autoComplete="current-password" textContentType="password" />
          </View>
          <View className="gap-2">
            <Text className="text-h6 text-foreground">New password</Text>
            <Input accessibilityLabel="New password" value={next} onChangeText={setNext}
              placeholder={passwordHint} editable={!busy} secureTextEntry autoCapitalize="none" autoCorrect={false}
              autoComplete="new-password" textContentType="newPassword" />
          </View>
          <View className="gap-2">
            <Text className="text-h6 text-foreground">Confirm new password</Text>
            <Input accessibilityLabel="Confirm new password" value={repeat} onChangeText={setRepeat}
              editable={!busy} secureTextEntry autoCapitalize="none" autoCorrect={false}
              autoComplete="new-password" textContentType="newPassword" returnKeyType="go" onSubmitEditing={() => void savePassword()} />
          </View>
          {error ? <Notice tone="error" message={error} /> : null}
          <Button className="min-h-12 rounded-xl" disabled={!!busy} onPress={() => void savePassword()}>
            <Text>{busy === "password" ? "Saving…" : "Save new password"}</Text>
          </Button>
          <Button variant="ghost" className="min-h-11" disabled={!!busy} onPress={() => togglePasswordForm(false)}>
            <Text>Cancel</Text>
          </Button>
        </View>
      ) : (
        <Button variant="outline" className="min-h-12 justify-start gap-3 rounded-xl" disabled={!!busy} onPress={() => togglePasswordForm(true)}>
          <LucideIcon name="KeyRound" size={19} className="text-primary" /><Text>Change password</Text>
        </Button>
      )}
      <AccountLinks signedIn />
      <Button variant="outline" className="min-h-12 justify-start gap-3 rounded-xl" disabled={!!busy} onPress={() => void signOut()}>
        <LucideIcon name="LogOut" size={19} className="text-destructive" />
        <Text className="text-destructive">{busy === "signOut" ? "Signing out…" : "Sign out"}</Text>
      </Button>
      {!editing && error ? <Notice tone="error" message={error} /> : null}
    </View>
  );
}

export default function AccountScreen() {
  const { session, loading, error } = useAuth();
  const user = session?.user;

  return (
    <AppScreen>
      <ScreenHeader title="My Account" />
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="px-6 pb-12 pt-3">
          {loading ? (
            <View className="flex-row items-center gap-3" accessibilityLiveRegion="polite">
              <ActivityIndicator /><Text className="text-body text-muted-foreground">Opening your account…</Text>
            </View>
          ) : user ? (
            <AccountDetails key={user.id} ownerId={user.id} email={user.email} />
          ) : (
            <View className="gap-4">
              {error ? <Notice tone="error" message={error} /> : null}
              <SignInForm />
              <AccountLinks />
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </AppScreen>
  );
}
