import { useRef } from "react";
import { Platform, View, type TextInputProps } from "react-native";
import { Text } from "@/components/ui/text";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const fieldTypography = "text-body native:text-lg leading-6 native:leading-6";

type Props = {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  roomy?: boolean;
  onCaret?: (y:number)=>void;
  keyboardType?: TextInputProps["keyboardType"];
  autoCapitalize?: TextInputProps["autoCapitalize"];
};

// The in-flow text sizes the field during layout, including its saved value.
// The overlaid input uses the same metrics without a fixed line/height limit.
export function EditorTextField({ label, value, onChangeText, roomy = false, keyboardType, autoCapitalize, onCaret }: Props) {
  const container=useRef<View>(null);
  const focused=useRef(false),selection=useRef(0);
  const lines=useRef<{text:string;y:number;height:number}[]>([]);
  const keepCaretVisible=()=>{
    if(!focused.current || !onCaret || !lines.current.length)return;
    let remaining=selection.current;
    const line=lines.current.find(item=>{if(remaining<=item.text.length)return true;remaining-=item.text.length;return false;}) ?? lines.current.at(-1)!;
    container.current?.measureInWindow((_x,y)=>onCaret(y+line.y+line.height));
  };
  return <View className="w-full min-w-0 gap-2">
    <Text className="text-caption font-medium text-muted-foreground">{label}</Text>
    <View ref={container} className="relative w-full min-w-0 overflow-hidden rounded-xl border border-input bg-card">
      <View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden className="opacity-0">
        <Text selectable={false} onTextLayout={Platform.OS === "web" ? undefined : event=>{lines.current=event.nativeEvent.lines;keepCaretVisible();}} className={cn(fieldTypography,"px-4 py-3 text-foreground",roomy ? "min-h-40" : "min-h-12")}>{value + "\u200b"}</Text>
      </View>
      <Input accessibilityLabel={label} value={value} onChangeText={onChangeText} onFocus={()=>{focused.current=true;keepCaretVisible();}} onBlur={()=>{focused.current=false;}} onSelectionChange={event=>{selection.current=event.nativeEvent.selection.end;keepCaretVisible();}} multiline scrollEnabled={false} textAlignVertical="top" keyboardType={keyboardType} autoCapitalize={autoCapitalize}
        className={cn(fieldTypography,"absolute inset-0 h-full min-h-0 w-full rounded-xl border-0 bg-transparent px-4 py-3 text-foreground native:h-full")} />
    </View>
  </View>;
}
