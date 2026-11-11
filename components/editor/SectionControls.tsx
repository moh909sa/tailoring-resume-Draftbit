import { useState } from "react";
import { Keyboard, ScrollView, View } from "react-native";
import { AppSheet } from "@/components/layout/AppSheet";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import LucideIcon from "@/lib/icons/LucideIcon";
import { EditorTextField } from "./EditorTextField";
import type { CustomSectionType } from "./sections";

export type SectionActionsProps = {
  label: string;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMove: (direction: -1 | 1) => void;
  onDuplicate?: () => void;
};

export function SectionActions({label,canMoveUp,canMoveDown,onMove,onDuplicate}: SectionActionsProps) {
  const [open,setOpen] = useState(false);
  return <View className="items-end">
    <Button variant="ghost" size="icon" accessibilityLabel={`Actions for ${label}`} accessibilityState={{expanded:open}} onPress={()=>{Keyboard.dismiss();setOpen(!open);}}><LucideIcon name="Ellipsis" size={20} className="text-muted-foreground"/></Button>
    {open ? <View className="min-w-40 gap-1 rounded-xl border border-border bg-card p-1">
      <Button variant="ghost" disabled={!canMoveUp} className="flex-row justify-start gap-2" onPress={()=>{setOpen(false);onMove(-1);}}><LucideIcon name="ArrowUp" size={16} className="text-foreground"/><Text>Move Up</Text></Button>
      <Button variant="ghost" disabled={!canMoveDown} className="flex-row justify-start gap-2" onPress={()=>{setOpen(false);onMove(1);}}><LucideIcon name="ArrowDown" size={16} className="text-foreground"/><Text>Move Down</Text></Button>
      {onDuplicate ? <Button variant="ghost" className="flex-row justify-start gap-2" onPress={()=>{setOpen(false);onDuplicate();}}><LucideIcon name="Copy" size={16} className="text-foreground"/><Text>Duplicate section</Text></Button> : null}
    </View> : null}
  </View>;
}

export function RenameSectionForm({name,onSave,onCancel}: {name:string;onSave:(name:string)=>void;onCancel:()=>void}) {
  const [value,setValue] = useState(name);
  return <View className="gap-4 rounded-xl border border-border bg-card p-4">
    <EditorTextField label="Section name" value={value} onChangeText={setValue}/>
    <View className="flex-row gap-3"><Button variant="outline" className="flex-1" onPress={onCancel}><Text>Cancel</Text></Button><Button disabled={!value.trim()} className="flex-1" onPress={()=>{Keyboard.dismiss();onSave(value.trim());}}><Text>Save name</Text></Button></View>
  </View>;
}

export function RenameSectionSheet({name,onSave,onClose}: {name:string;onSave:(name:string)=>void;onClose:()=>void}) {
  return <AppSheet visible onClose={onClose}>
    <View className="min-h-16 flex-row items-center justify-between border-b border-border px-5 py-3"><Text accessibilityRole="header" className="text-h4 text-foreground">Rename section</Text><Button variant="ghost" onPress={onClose}><Text className="text-primary">Cancel</Text></Button></View>
    <ScrollView automaticallyAdjustKeyboardInsets keyboardShouldPersistTaps="handled" contentContainerClassName="gap-4 p-5"><RenameSectionForm name={name} onSave={onSave} onCancel={onClose}/><Text className="text-caption leading-5 text-muted-foreground">This changes the heading on your CV. Your content stays in the same section.</Text></ScrollView>
  </AppSheet>;
}

const types: {type:CustomSectionType;label:string;description:string}[] = [
  {type:"text",label:"Text Block",description:"A paragraph, like Summary. Good for an introduction or interests."},
  {type:"itemList",label:"Item List",description:"Entries with titles, dates and description bullets, like Experience."},
  {type:"stringList",label:"Skill List",description:"A simple list, like Skills. Good for languages, tools or awards."},
];
export function AddCustomSectionSheet({onCreate,onClose,onDismiss,visible = true}: {visible?:boolean;onCreate:(name:string,type:CustomSectionType)=>void;onClose:()=>void;onDismiss?:()=>void}) {
  const [name,setName] = useState("");
  const [type,setType] = useState<CustomSectionType>("text");
  return <AppSheet visible={visible} onClose={onClose} onDismiss={onDismiss}>
    <View className="min-h-16 flex-row items-center justify-between gap-3 border-b border-border px-5 py-3"><Text accessibilityRole="header" className="text-h4 text-foreground">Add Custom Section</Text><Button variant="ghost" onPress={onClose}><Text className="text-primary">Cancel</Text></Button></View>
    <ScrollView automaticallyAdjustKeyboardInsets keyboardShouldPersistTaps="handled" contentContainerClassName="gap-5 px-5 py-6">
      <EditorTextField label="Section name" value={name} onChangeText={setName}/>
      <Text className="text-body font-semibold text-foreground">Choose a type</Text>
      {types.map(option=><Button key={option.type} variant="outline" accessibilityRole="radio" accessibilityState={{checked:type === option.type}} onPress={()=>setType(option.type)} className="h-auto native:h-auto min-h-20 flex-row items-start gap-3 rounded-xl px-4 py-4">
        <LucideIcon name={type === option.type ? "CircleCheck" : "Circle"} size={20} className="mt-0.5 text-primary"/>
        <View className="min-w-0 flex-1 gap-1"><Text className="text-body font-semibold text-foreground web:whitespace-normal">{option.label}</Text><Text className="text-caption leading-5 text-muted-foreground web:whitespace-normal">{option.description}</Text></View>
      </Button>)}
      <Button disabled={!name.trim()} className="min-h-12 rounded-xl" onPress={()=>{Keyboard.dismiss();onCreate(name.trim(),type);}}><Text>Create section</Text></Button>
    </ScrollView>
  </AppSheet>;
}
