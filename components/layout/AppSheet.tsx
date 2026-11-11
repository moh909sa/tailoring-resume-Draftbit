import type { ReactNode } from "react";
import { Modal, Pressable, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { cn } from "@/lib/utils";
import { ThemeProvider, useTheme } from "@/theming/ThemeProvider";

// Web modals render outside the root DOM tree, so reuse the current theme at their boundary.
export function AppSheet({
  visible,
  onClose,
  children,
  onDismiss,
  presentation = "page",
}: {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  onDismiss?: () => void;
  presentation?: "page" | "actions";
}) {
  const { theme } = useTheme();
  return (
    <Modal
      visible={visible}
      animationType={presentation === "actions" ? "none" : "slide"}
      transparent={presentation === "actions"}
      presentationStyle={presentation === "actions" ? "overFullScreen" : "pageSheet"}
      onRequestClose={onClose}
      onDismiss={onDismiss}
    >
      <ThemeProvider key={theme.name} initialThemeName={theme.name} themes={[theme]}>
        <SafeAreaView edges={presentation === "actions" ? ["left","right"] : undefined} className={cn("flex-1",presentation === "actions" ? "bg-transparent" : "bg-background")}>
          {presentation === "actions" ? <Pressable accessibilityLabel="Dismiss section actions" onPress={onClose} className={cn("absolute inset-0",theme.name === "dark" ? "bg-background/80" : "bg-overlay/40")}/> : null}
          <View pointerEvents="box-none" className={cn("w-full max-w-xl flex-1 self-center",presentation === "actions" && "justify-end")}>{children}</View>
        </SafeAreaView>
      </ThemeProvider>
    </Modal>
  );
}
