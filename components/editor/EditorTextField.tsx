import { View, type TextInputProps } from "react-native";
import { Text } from "@/components/ui/text";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const fieldTypography = "text-body native:text-lg leading-6 native:leading-6";

type Props = {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  roomy?: boolean;
  keyboardType?: TextInputProps["keyboardType"];
  autoCapitalize?: TextInputProps["autoCapitalize"];
};

// The in-flow text sizes the field during layout, including its saved value.
// The overlaid input uses the same metrics without a fixed line/height limit.
export function EditorTextField({ label, value, onChangeText, roomy = false, keyboardType, autoCapitalize }: Props) {
  return <View className="w-full min-w-0 gap-2">
    <Text className="text-caption font-medium text-muted-foreground">{label}</Text>
    <View className="relative w-full min-w-0 overflow-hidden rounded-xl border border-input bg-card">
      <View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden className="opacity-0">
        <Text selectable={false} className={cn(fieldTypography,"px-4 py-3 text-foreground",roomy ? "min-h-40" : "min-h-12")}>{value + "\u200b"}</Text>
      </View>
      <Input accessibilityLabel={label} value={value} onChangeText={onChangeText} multiline scrollEnabled={false} textAlignVertical="top" keyboardType={keyboardType} autoCapitalize={autoCapitalize}
        className={cn(fieldTypography,"absolute inset-0 h-full min-h-0 w-full rounded-xl border-0 bg-transparent px-4 py-3 text-foreground native:h-full")} />
    </View>
  </View>;
}
