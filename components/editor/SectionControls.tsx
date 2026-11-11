import { useRef, useState } from "react";
import { Keyboard, Platform, ScrollView, View } from "react-native";
import { AppSheet } from "@/components/layout/AppSheet";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import LucideIcon from "@/lib/icons/LucideIcon";
import { EditorTextField } from "./EditorTextField";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { CustomSectionType } from "./sections";

export type SectionActionsProps = {
  label: string;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onRename: () => void;
  onMove: (direction: -1 | 1) => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
};

export function SectionActions({label,onPress,showLabel = false}: {label:string;onPress:()=>void;showLabel?:boolean}) {
  return <Button variant="ghost" size={showLabel ? "default" : "icon"} className={showLabel ? "h-auto native:h-auto min-h-11 min-w-0 max-w-full flex-row gap-2 rounded-xl px-3 py-2" : "h-11 w-11 shrink-0 rounded-xl"} accessibilityLabel={`Actions for ${label}`} accessibilityHint="Rename, reorder and manage this section" onPress={()=>{Keyboard.dismiss();onPress();}}>
    {showLabel ? <Text className="flex-shrink text-caption font-medium text-foreground web:whitespace-normal">Section actions</Text> : null}
    <LucideIcon name="Ellipsis" size={21} className="shrink-0 text-muted-foreground"/>
  </Button>;
}

export function SectionActionsMenu({actions,onClose}: {actions:SectionActionsProps;onClose:()=>void}) {
  const [visible,setVisible] = useState(true);
  const [confirming,setConfirming] = useState(false);
  const pending = useRef<(()=>void)|null>(null);
  const insets = useSafeAreaInsets();
  // iOS must dismiss this modal before opening another sheet or removing an editor.
  const finish = () => {const action=pending.current;pending.current=null;onClose();action?.();};
  const dismiss = (action?:()=>void) => {
    pending.current=action ?? null;
    setVisible(false);
    if (Platform.OS !== "ios") finish();
  };
  const itemClass="h-auto native:h-auto min-h-12 flex-row justify-start gap-3 rounded-xl px-4 py-3";
  return <AppSheet visible={visible} presentation="actions" onClose={()=>dismiss()} onDismiss={finish}>
    <View className="max-h-full overflow-hidden rounded-t-3xl border border-border bg-card px-4 pt-5" style={{paddingBottom:Math.max(insets.bottom,16)}}>
      <ScrollView keyboardShouldPersistTaps="handled" bounces={false} contentContainerClassName="gap-3 pb-4">
        {confirming ? <View className="gap-5 px-2 pb-2">
          <Text accessibilityRole="header" className="text-h4 text-foreground">Delete “{actions.label}”?</Text>
          <Text className="text-body leading-6 text-muted-foreground">This removes the entire section and all its content from this tailored CV.</Text>
          <Button variant="destructive" className="min-h-12 rounded-xl" onPress={()=>dismiss(actions.onDelete)}><Text>Delete Section</Text></Button>
        </View> : <>
          <View className="gap-1 px-4 pb-2"><Text className="text-caption text-muted-foreground">Section actions</Text><Text accessibilityRole="header" className="text-h4 text-foreground">{actions.label}</Text></View>
          <View>
            <Button variant="ghost" className={itemClass} onPress={()=>dismiss(actions.onRename)}><LucideIcon name="Pencil" size={19} className="text-foreground"/><Text className="text-body text-foreground">Rename</Text></Button>
            <View className="my-1 border-t border-border"/>
            <Button variant="ghost" disabled={!actions.canMoveUp} className={itemClass} onPress={()=>dismiss(()=>actions.onMove(-1))}><LucideIcon name="ArrowUp" size={19} className="text-foreground"/><Text className="text-body text-foreground">Move Up</Text></Button>
            <Button variant="ghost" disabled={!actions.canMoveDown} className={itemClass} onPress={()=>dismiss(()=>actions.onMove(1))}><LucideIcon name="ArrowDown" size={19} className="text-foreground"/><Text className="text-body text-foreground">Move Down</Text></Button>
            {actions.onDuplicate ? <Button variant="ghost" className={itemClass} onPress={()=>dismiss(actions.onDuplicate)}><LucideIcon name="Copy" size={19} className="text-foreground"/><Text className="text-body text-foreground">Duplicate</Text></Button> : null}
            {actions.onDelete ? <><View className="my-2 border-t border-border"/><Button variant="ghost" className={itemClass} onPress={()=>setConfirming(true)}><LucideIcon name="Trash2" size={19} className="text-destructive"/><Text className="text-body font-medium text-destructive">Delete Section</Text></Button></> : null}
          </View>
        </>}
      </ScrollView>
      <Button variant="secondary" className="min-h-12 rounded-xl" onPress={()=>dismiss()}><Text>Cancel</Text></Button>
    </View>
  </AppSheet>;
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
