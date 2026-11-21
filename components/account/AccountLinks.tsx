import { useState } from "react";
import { Linking, View } from "react-native";
import { router } from "expo-router";
import { Notice } from "@/components/cv/Notice";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import LucideIcon, { type IconName } from "@/lib/icons/LucideIcon";

const termsUrl = process.env.EXPO_PUBLIC_TERMS_URL?.trim();
const supportEmail = process.env.EXPO_PUBLIC_SUPPORT_EMAIL?.trim();

export function AccountLinks({ signedIn = false }: { signedIn?: boolean }) {
  const [message, setMessage] = useState("");

  async function open(url: string | undefined, unavailable: string) {
    setMessage("");
    if (!url) {
      setMessage(unavailable);
      return;
    }
    try {
      await Linking.openURL(url);
    } catch {
      setMessage("Couldn’t open the link. Please try again.");
    }
  }

  const rows: { label: string; icon: IconName; action: () => void }[] = [
    { label: "Privacy", icon: "Shield", action: () => router.push("/privacy") },
    { label: "Terms", icon: "FileText", action: () => void open(
      termsUrl?.startsWith("https://") ? termsUrl : undefined,
      "Terms are not published yet.",
    ) },
    { label: "Support", icon: "LifeBuoy", action: () => void open(
      supportEmail && /^[^\s@?&#]+@[^\s@?&#]+\.[^\s@?&#]+$/.test(supportEmail)
        ? `mailto:${supportEmail}` : undefined,
      "A support email is not available yet.",
    ) },
  ];

  return (
    <View className="gap-3">
      <View className="overflow-hidden rounded-2xl border border-border bg-card">
        {rows.map(({ label, icon, action }, index) => (
          <View key={label} className={index > 0 ? "border-t border-border" : undefined}>
            <Button variant="ghost" className="min-h-12 justify-start gap-3 rounded-none px-4" onPress={action}>
              <LucideIcon name={icon} size={19} className="text-primary" />
              <Text className="flex-1 text-foreground">{label}</Text>
              <LucideIcon name="ChevronRight" size={17} className="text-muted-foreground" />
            </Button>
          </View>
        ))}
      </View>
      {signedIn ? (
        <Button variant="outline" className="min-h-12 justify-start gap-3 rounded-xl" onPress={() => setMessage("Account deletion is not available yet.")}>
          <LucideIcon name="Trash2" size={19} className="text-destructive" />
          <Text className="text-destructive">Delete account</Text>
        </Button>
      ) : null}
      {message ? <Notice tone="info" message={message} onDismiss={() => setMessage("")} /> : null}
    </View>
  );
}
