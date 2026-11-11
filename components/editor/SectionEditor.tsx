import { createContext, useContext, useEffect, useRef, useState } from "react";
import { Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, Switch, useWindowDimensions, View } from "react-native";
import { AppSheet } from "@/components/layout/AppSheet";
import { Text } from "@/components/ui/text";
import { EditorTextField } from "./EditorTextField";
import { Button } from "@/components/ui/button";
import LucideIcon from "@/lib/icons/LucideIcon";
import { isJsonObject, type JsonObject, type JsonValue } from "@/lib/tailoring/types";
import { readableLabel } from "@/components/tailoring/ReviewContent";
import { duplicateListItem, editorMetadata, entryTemplate, sectionSummary, type EditorSection } from "./sections";

import { RichTextField } from "./RichTextField";
import { RenameSectionForm, SectionActions, SectionActionsMenu, type SectionActionsProps } from "./SectionControls";

const CaretContext = createContext<((y:number)=>void)|undefined>(undefined);

function TextField({ label, value, onChange, field, rich }: { label:string; value:string; onChange:(value:string)=>void; field:string;rich?:boolean }) {
  const onCaret = useContext(CaretContext);
  if (rich) return <RichTextField label={label} value={value} onChangeText={onChange} onCaret={onCaret}/>;
  return <EditorTextField label={label} value={value} onChangeText={onChange} roomy={/summary|^text$/i.test(field)}
      keyboardType={/email/i.test(field) ? "email-address" : /phone/i.test(field) ? "phone-pad" : /website|linkedin|github|url/i.test(field) ? "url" : "default"}
      autoCapitalize={/email|website|linkedin|github|url/i.test(field) ? "none" : "sentences"} />
}

function ListEditor({ value, onChange, field, styles, richDescriptions = false }: {
  value:JsonValue[]; onChange:(value:JsonValue[], styles?:JsonValue[])=>void; field:string;
  styles?:JsonValue[];richDescriptions?:boolean;
}) {
  const [active, setActive] = useState<number|null>(null);
  const [removing, setRemoving] = useState<number|null>(null);
  const [menu,setMenu] = useState<number|null>(null);
  const objects = value.some(isJsonObject) || /experience|education|projects|items/i.test(field);
  const update = (index:number, next:JsonValue) => onChange(value.map((item,i) => i === index ? next : item));
  const remove = (index:number) => {
    onChange(value.filter((_,i) => i !== index), styles?.filter((_,i) => i !== index));
    setActive(null);
    setRemoving(null);
  };
  const move = (index:number, direction:number) => {
    const next = [...value];
    [next[index],next[index+direction]] = [next[index+direction],next[index]];
    if (styles) {
      const nextStyles = value.map((_,i) => styles?.[i] ?? "bullet");
      [nextStyles[index],nextStyles[index+direction]] = [nextStyles[index+direction],nextStyles[index]];
      onChange(next,nextStyles);
    } else onChange(next);
  };
  if (objects && active !== null && value[active] !== undefined) return <View className="gap-5">
    <Pressable accessibilityRole="button" onPress={() => {Keyboard.dismiss();setActive(null);}} className="min-h-11 flex-row items-center gap-2">
      <LucideIcon name="ArrowLeft" size={18} className="text-primary"/><Text className="text-body text-primary">All entries</Text>
    </Pressable>
    <ValueEditor value={value[active]} onChange={(next)=>update(active,next)} field={field} richDescriptions={richDescriptions}/>
  </View>;
  return <View className="gap-3">
    {value.map((item,index) => <View key={isJsonObject(item) && (typeof item.id === "number" || typeof item.id === "string") ? String(item.id) : index} className="w-full min-w-0 gap-3 rounded-2xl border border-border bg-card p-4">
      {objects ? <Pressable accessibilityRole="button" onPress={()=>setActive(index)} className="min-h-11 flex-row items-center gap-3">
        <View className="min-w-0 flex-1 gap-1"><Text className="text-body font-semibold text-foreground">{sectionSummary(item)}</Text><Text className="text-caption text-muted-foreground">Tap to edit entry</Text></View>
        <LucideIcon name="ChevronRight" size={18} className="text-muted-foreground"/>
      </Pressable> : <ValueEditor value={item} onChange={(next)=>update(index,next)} field={/description/i.test(field) ? "bullet" : field} label={/description/i.test(field) ? `Bullet ${index+1}` : `Item ${index+1}`} richDescriptions={richDescriptions}/>}
      <View className="items-end">
        <Button variant="ghost" size="icon" accessibilityLabel={`Actions for ${/description/i.test(field) ? "bullet" : "entry"} ${index+1}`} accessibilityState={{expanded:menu === index}} onPress={()=>{Keyboard.dismiss();setMenu(menu === index ? null : index);}}><LucideIcon name="Ellipsis" size={20} className="text-muted-foreground"/></Button>
        {menu === index ? <View className="w-full gap-1 rounded-xl border border-border bg-card p-1">
          <Button variant="ghost" className="flex-row justify-start gap-2" onPress={()=>{const copy=duplicateListItem(value,index,styles);onChange(copy.value,copy.styles);setMenu(null);}}><LucideIcon name="Copy" size={16} className="text-foreground"/><Text>Duplicate</Text></Button>
          <Button variant="ghost" className="flex-row justify-start gap-2" disabled={index === 0} onPress={()=>{move(index,-1);setMenu(null);}}><LucideIcon name="ArrowUp" size={16} className="text-foreground"/><Text>Move Up</Text></Button>
          <Button variant="ghost" className="flex-row justify-start gap-2" disabled={index === value.length-1} onPress={()=>{move(index,1);setMenu(null);}}><LucideIcon name="ArrowDown" size={16} className="text-foreground"/><Text>Move Down</Text></Button>
          <Button variant="ghost" className="flex-row justify-start gap-2" onPress={()=>{Keyboard.dismiss();setMenu(null);setRemoving(index);}}><LucideIcon name="Trash2" size={16} className="text-destructive"/><Text className="text-destructive">Remove item</Text></Button>
        </View> : null}
      </View>
      {removing === index ? <View className="gap-3 rounded-xl bg-destructive/5 p-3"><Text className="text-body text-foreground">Remove this entry from your tailored CV?</Text><View className="flex-row gap-3"><Button variant="secondary" className="flex-1" onPress={()=>setRemoving(null)}><Text>Keep</Text></Button><Button variant="destructive" className="flex-1" onPress={()=>remove(index)}><Text>Remove</Text></Button></View></View> : null}
    </View>)}
    <Button variant="outline" className="min-h-12 flex-row gap-2 rounded-xl" onPress={()=>{
      const next = objects ? entryTemplate(field) : "";
      onChange([...value,next], styles ? [...styles,"bullet"] : undefined);
      if (objects) setActive(value.length);
    }}><LucideIcon name="Plus" size={18} className="text-primary"/><Text className="text-body text-primary">{objects ? /experience/i.test(field) ? "Add Job" : "Add entry" : /description/i.test(field) ? "Add bullet" : "Add item"}</Text></Button>
  </View>;
}

function ObjectEditor({ value, onChange, field,richDescriptions }: {value:JsonObject;onChange:(value:JsonObject)=>void;field:string;richDescriptions?:boolean}) {
  const template: JsonObject = value.sectionType === "text" ? {text:""} : value.sectionType === "stringList" ? {strings:[]} : value.sectionType === "itemList" ? {items:[]} : /personalInfo/i.test(field) ? {name:"",title:"",email:"",phone:"",location:"",website:"",linkedin:"",github:""} : /experience|education|project|items/i.test(field) ? entryTemplate(field) : {};
  const fields = {...template,...value};
  const update = (key:string,next:JsonValue) => onChange({...value,[key]:next});
  return <View className="gap-5">{Object.entries(fields).filter(([key])=>!editorMetadata.has(key)).map(([key,item])=>
    <View key={key} className="gap-2">
      {Array.isArray(item) ? <><Text className="text-body font-medium text-foreground">{key === "description" ? "Experience & achievements" : readableLabel(key)}</Text>
        <ListEditor value={item} onChange={(next,nextStyles)=>onChange({...value,[key]:next,...(nextStyles ? {descriptionStyles:nextStyles} : {})})} field={key} richDescriptions={richDescriptions} styles={Array.isArray(value.descriptionStyles) && key === "description" ? value.descriptionStyles : undefined}/></>
      : <ValueEditor value={item} onChange={(next)=>update(key,next)} field={key} richDescriptions={richDescriptions}/>}</View>)}
  </View>;
}

function ValueEditor({value,onChange,field,label,richDescriptions}: {value:JsonValue;onChange:(value:JsonValue)=>void;field:string;label?:string;richDescriptions?:boolean}) {
  if (Array.isArray(value)) return <ListEditor value={value} onChange={onChange} field={field} richDescriptions={richDescriptions}/>;
  if (isJsonObject(value)) return <ObjectEditor value={value} onChange={onChange} field={field} richDescriptions={richDescriptions}/>;
  if (typeof value === "boolean") return <View className="flex-row items-center justify-between"><Text className="text-body text-foreground">{label ?? readableLabel(field)}</Text><Switch accessibilityLabel={label ?? readableLabel(field)} value={value} onValueChange={onChange}/></View>;
  return <TextField label={label ?? (field === "years" ? "Dates · e.g. Jan 2022 – Present" : readableLabel(field))} field={field} rich={richDescriptions && field === "bullet"} value={value === null ? "" : String(value)} onChange={(next)=>onChange(typeof value === "number" && next !== "" && Number.isFinite(Number(next)) ? Number(next) : next)}/>;
}

export function SectionEditor({section,onChange,onClose,saveLabel,onRename,actions}: {
  section:EditorSection;onChange:(value:JsonValue)=>void;onClose:()=>void;saveLabel:string;onRename:(name:string)=>void;actions:SectionActionsProps;
}) {
  const [renaming,setRenaming] = useState(false);
  const [showActions,setShowActions] = useState(false);
  const scroll = useRef<ScrollView>(null);
  const viewport = useRef<View>(null);
  const offset = useRef(0);
  const window = useWindowDimensions();
  useEffect(()=>{setRenaming(false);setShowActions(false);offset.current=0;scroll.current?.scrollTo({y:0,animated:false});},[section.key]);
  const keepCaretVisible = (y:number) => {
    viewport.current?.measureInWindow((_x,top,_width,height)=>{
      const bottom = Math.min(Keyboard.metrics()?.screenY ?? window.height,top+height);
      const delta = y > bottom-24 ? y-bottom+24 : y < top+24 ? y-top-24 : 0;
      if (delta) scroll.current?.scrollTo({y:Math.max(0,offset.current+delta),animated:false});
    });
  };
  const richDescriptions = /^(workExperience|experience|personalProjects|projects)$/.test(section.key) || (section.custom && section.sectionType === "itemList");
  return <AppSheet visible onClose={onClose}>
    <View className="min-h-16 flex-row items-center justify-between gap-3 border-b border-border px-5 py-3">
      <View className="min-w-0 flex-1 gap-1"><Text accessibilityRole="header" numberOfLines={2} className="text-h4 text-foreground">{section.label}</Text><Text accessibilityLiveRegion="polite" className="text-caption text-muted-foreground">{saveLabel}</Text></View>
      {!section.personal ? <SectionActions label={section.label} onPress={()=>setShowActions(true)}/> : null}
      <Button variant="ghost" onPress={()=>{Keyboard.dismiss();onClose();}}><Text className="text-primary">Done</Text></Button>
    </View>
    {renaming ? <View className="bg-background px-5 pt-4"><RenameSectionForm name={section.label} onSave={name=>{onRename(name);setRenaming(false);}} onCancel={()=>setRenaming(false)}/></View> : null}
    <KeyboardAvoidingView enabled={Platform.OS !== "ios"} behavior={Platform.OS === "ios" ? "padding" : "height"} className="flex-1">
      <View ref={viewport} className="flex-1"><ScrollView ref={scroll} onScroll={event=>{offset.current=event.nativeEvent.contentOffset.y;}} scrollEventThrottle={16} className="flex-1" automaticallyAdjustKeyboardInsets={Platform.OS === "ios"} keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"} contentContainerClassName="gap-6 px-5 pb-12 pt-6">
        {section.hidden ? <Text className="text-caption text-muted-foreground">This section is currently hidden in your PDF.</Text> : null}
        <CaretContext.Provider value={keepCaretVisible}><ValueEditor key={section.key} value={section.value} onChange={onChange} field={section.key} richDescriptions={richDescriptions}/></CaretContext.Provider>
      </ScrollView></View>
    </KeyboardAvoidingView>
    {showActions ? <SectionActionsMenu actions={{...actions,onRename:()=>setRenaming(true)}} onClose={()=>setShowActions(false)}/> : null}
  </AppSheet>;
}
