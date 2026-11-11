import { Pressable, View } from "react-native";
import { Text } from "@/components/ui/text";
import LucideIcon from "@/lib/icons/LucideIcon";
import { cn } from "@/lib/utils";
import { SectionActions } from "./SectionControls";
import { sectionPreview, type EditorSection } from "./sections";

export function ResumeSectionList({sections,onOpen,onActions,onAdd}: {
  sections:EditorSection[];
  onOpen:(key:string)=>void;
  onActions:(key:string)=>void;
  onAdd:()=>void;
}) {
  return <View className="overflow-hidden rounded-2xl border border-border bg-card">
    {sections.map((section,index)=><View key={section.key} className={cn("flex-row items-center bg-card pl-4 pr-2",index > 0 && "border-t border-border")}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Edit ${section.label}`} accessibilityHint={`Opens the ${section.label} editor`} onPress={()=>onOpen(section.key)} className="min-h-[72px] min-w-0 flex-1 flex-row items-center gap-3 py-3 pr-2 active:opacity-60">
        <View className="min-w-0 flex-1 gap-1">
          <Text numberOfLines={section.custom ? 2 : 1} ellipsizeMode="tail" className="text-body font-semibold text-foreground">{section.label}</Text>
          <Text numberOfLines={1} ellipsizeMode="tail" className="text-caption leading-5 text-muted-foreground">{section.hidden ? "Hidden in PDF · " : ""}{sectionPreview(section)}</Text>
        </View>
        <LucideIcon name="ChevronRight" size={16} className="text-muted-foreground"/>
      </Pressable>
      {!section.personal ? <SectionActions label={section.label} onPress={()=>onActions(section.key)}/> : <View className="h-11 w-11 shrink-0"/>}
    </View>)}
    <Pressable accessibilityRole="button" accessibilityLabel="Add Custom Section" onPress={onAdd} className="min-h-14 flex-row items-center gap-3 border-t border-border bg-card px-4 py-4 active:bg-muted">
      <LucideIcon name="Plus" size={20} className="text-primary"/><Text className="text-body font-medium text-primary">Add Custom Section</Text>
    </Pressable>
  </View>;
}
