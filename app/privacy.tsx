import { useState } from "react";
import { Linking, ScrollView, View } from "react-native";
import { router } from "expo-router";
import { Notice } from "@/components/cv/Notice";
import { AppScreen } from "@/components/layout/AppScreen";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { useAiConsent } from "@/lib/aiConsent/AiConsentProvider";
import { useAuth } from "@/lib/auth/AuthProvider";
import LucideIcon from "@/lib/icons/LucideIcon";

const policyUrl = process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL?.trim();

export default function PrivacyScreen() {
  const { session, loading } = useAuth();
  const { manageConsent } = useAiConsent();
  const [error, setError] = useState("");

  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)/account");
  }

  async function openPolicy() {
    setError("");
    if (!policyUrl?.startsWith("https://")) {
      setError("The full privacy policy is not published yet.");
      return;
    }
    try {
      await Linking.openURL(policyUrl);
    } catch {
      setError("Couldn’t open the privacy policy. Please try again.");
    }
  }

  return (
    <AppScreen>
      <View className="min-h-16 flex-row items-center gap-2 px-4 py-3">
        <Button accessibilityLabel="Go back" variant="ghost" size="icon" className="h-11 w-11 shrink-0" onPress={goBack}>
          <LucideIcon name="ChevronLeft" size={22} className="text-foreground" />
        </Button>
        <Text accessibilityRole="header" className="text-h2 tracking-tight text-foreground">Privacy</Text>
      </View>
      <ScrollView contentContainerClassName="gap-5 px-6 pb-10 pt-3">
        <View className="gap-4 rounded-2xl border border-border bg-card p-5">
          <View className="gap-2">
            <Text accessibilityRole="header" className="text-h4 text-foreground">AI permissions</Text>
            <Text className="text-body leading-6 text-muted-foreground">
              With your permission, AI processes CV text and job details to read and tailor your CV. You can still use saved CVs if you decline.
            </Text>
          </View>
          {session?.user ? (
            <Button variant="outline" className="min-h-12 rounded-xl" onPress={manageConsent}>
              <Text>Manage AI permissions</Text>
            </Button>
          ) : loading ? null : (
            <Text className="text-caption text-muted-foreground">Sign in to manage your choice.</Text>
          )}
        </View>
        <Button variant="outline" className="min-h-12 justify-start gap-3 rounded-xl" onPress={() => void openPolicy()}>
          <LucideIcon name="FileText" size={19} className="text-primary" />
          <Text className="flex-1">Privacy Policy</Text>
          <LucideIcon name="ChevronRight" size={17} className="text-muted-foreground" />
        </Button>
        {error ? <Notice tone="info" message={error} onDismiss={() => setError("")} /> : null}
      </ScrollView>
    </AppScreen>
  );
}
