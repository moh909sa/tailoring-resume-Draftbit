import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppScreen } from "@/components/layout/AppScreen";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/cv/Notice";
import { AccountSheet } from "@/components/cv/AccountSheet";
import LucideIcon from "@/lib/icons/LucideIcon";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useCvEditor } from "@/lib/editor/useCvEditor";
import { emptyWorkspace, type EditorWorkspace } from "@/lib/editor/session";
import { supportsLiveTemplate } from "@/lib/editor/documentTheme";
import { layoutTemplateName } from "@/lib/editor/layout";
import type { FieldTarget } from "@/lib/editor/liveDocument";
import { SectionEditor } from "@/components/editor/SectionEditor";
import { AddCustomSectionSheet, RenameSectionSheet, SectionActionsMenu } from "@/components/editor/SectionControls";
import { ResumeSectionList } from "@/components/editor/ResumeSectionList";
import { CvPreviewSurface } from "@/components/editor/CvPreviewSurface";
import { LiveCvRenderer } from "@/components/editor/LiveCvRenderer";
import { DesignLayout } from "@/components/editor/DesignLayout";
import { JobMatch } from "@/components/editor/JobMatch";
import { addCustomSection, deleteCustomSection, duplicateCustomSection, moveSection, renameSection, replaceSection, resumeSections, withSectionMetadata, type EditorSection } from "@/components/editor/sections";
import { isJsonObject, type JsonValue } from "@/lib/tailoring/types";
import { cn } from "@/lib/utils";

const statusLabels = {saved:"Content saved",saving:"Saving…",local:"Saved on device",error:"Retry saving",conflict:"Choose saved version"};
const tools = [{key:"content",label:"Content",icon:"Pencil"},{key:"templates",label:"Templates",icon:"PanelsTopLeft"},{key:"format",label:"Format",icon:"SlidersHorizontal"}] as const;

export default function CvEditorScreen() {
  const {id,returnTo} = useLocalSearchParams<{id?:string|string[];returnTo?:string}>();
  const {session}=useAuth();
  const editor=useCvEditor(id);
  const workspace=editor.workspace ?? emptyWorkspace();
  const setWorkspace=(patch:Partial<EditorWorkspace>)=>editor.updateWorkspace(patch);
  const document=editor.document;
  const layout=editor.layoutDraft ?? editor.layout;
  const sections=editor.resume ? resumeSections(editor.resume) : [];
  const section=sections.find(s=>s.key === workspace.sectionKey);
  const [showSignIn,setShowSignIn]=useState(false);
  const [menuKey,setMenuKey]=useState<string|null>(null);
  const [renameKey,setRenameKey]=useState<string|null>(null);
  const [addingSection,setAddingSection]=useState(false);
  const [stageHeight,setStageHeight]=useState(600);
  const [openingPreview,setOpeningPreview]=useState(false);
  const [actionError,setActionError]=useState<string|null>(null);
  const [viewError,setViewError]=useState(false);
  const [rendererAttempt,setRendererAttempt]=useState(0);
  const pendingSection=useRef<string|null>(null);
  const previewGeneration=useRef(0);
  const mounted=useRef(true);
  const contentScroll=useRef<ScrollView|null>(null);
  const listOffset=useRef(0);
  const returnOffset=useRef(0);
  const menuSection=sections.find(s=>s.key === menuKey && !s.personal);
  const insets=useSafeAreaInsets();
  useEffect(()=>{
    mounted.current=true;listOffset.current=0;returnOffset.current=0;pendingSection.current=null;
    setMenuKey(null);setRenameKey(null);setAddingSection(false);setOpeningPreview(false);setActionError(null);setViewError(false);
    return()=>{mounted.current=false;previewGeneration.current++;};
  },[session?.user.id,id]);
  const leave=()=>{
    previewGeneration.current++;Keyboard.dismiss();void editor.flush();
    if(returnTo === "preview" && router.canGoBack())router.back();
    else router.replace("/(tabs)/library/tailored-cvs");
  };
  const openSection=(key:string,target?:FieldTarget)=>{
    const found=sections.find(s=>key === "skills" ? /^(additional|technicalSkills|professionalSkills|skills)$/.test(s.key) : key === "workExperience" ? /workExperience|experience$/.test(s.key) : s.key === key);
    if(!found)return;
    returnOffset.current=listOffset.current;
    setWorkspace({tool:"content",trayOpen:true,sectionKey:found.key,fieldPath:target?.path ?? null,fieldLabel:target?.label ?? null});
  };
  const closeSection=()=>{
    Keyboard.dismiss();setWorkspace({sectionKey:null,fieldPath:null,fieldLabel:null});
    contentScroll.current?.scrollTo({y:returnOffset.current,animated:false});void editor.flush();
  };
  const selectTool=(tool:EditorWorkspace["tool"])=>{
    Keyboard.dismiss();setWorkspace({tool,trayOpen:workspace.tool !== tool || !workspace.trayOpen});
  };
  const addSkill = (skill:string) => {
    if(!editor.resume || !document) return;
    const skillsSection = sections.find(s=>s.key === "additional" || /technicalSkills|professionalSkills|skills$/i.test(s.key) && Array.isArray(s.value));
    const skills = skillsSection?.key === "additional" && isJsonObject(skillsSection.value) ? skillsSection.value.technicalSkills : skillsSection?.value;
    const current = Array.isArray(skills) ? skills : [];
    const key = skillsSection?.key === "additional" ? "additional.technicalSkills" : skillsSection?.key ?? "additional.technicalSkills";
    let next = current.some(v=>typeof v === "string" && v.toLocaleLowerCase() === skill.toLocaleLowerCase()) ? editor.resume : replaceSection(editor.resume,key,[...current,skill]);
    if(Array.isArray(next.sectionMeta)) next = {...next,sectionMeta:next.sectionMeta.map(meta=>isJsonObject(meta) && (meta.key === key || meta.key === key.split(".").pop() || key.startsWith("additional.") && meta.key === "additional") ? {...meta,isVisible:true} : meta)};
    editor.updateResume(withSectionMetadata(next),Array.from(new Set([...editor.confirmedSkills,skill])));
  };
  const duplicateSection = (key:string) => {
    if (!editor.resume) return;
    const copy = duplicateCustomSection(editor.resume,key);
    if (copy) {editor.updateResume(copy.resume);setWorkspace({sectionKey:copy.key,fieldPath:null,fieldLabel:null});}
  };
  const deleteSection = (key:string) => {
    if (!editor.resume) return;
    const next=deleteCustomSection(editor.resume,key);
    if (next === editor.resume) return;
    editor.updateResume(next);
    setMenuKey(null);setRenameKey(null);
    if (workspace.sectionKey === key) {
      setWorkspace({sectionKey:null,fieldPath:null,fieldLabel:null});
      contentScroll.current?.scrollTo({y:returnOffset.current,animated:false});
    }
    if (pendingSection.current === key) pendingSection.current=null;
    void editor.flush();
  };
  const actionsFor = (section:EditorSection) => ({
    label:section.label,
    onRename:()=>setRenameKey(section.key),
    onDelete:section.custom ? ()=>deleteSection(section.key) : undefined,
    canMoveUp:sections.findIndex(s=>s.key === section.key) > 1,
    canMoveDown:sections.findIndex(s=>s.key === section.key) < sections.length-1,
    onMove:(direction:-1|1)=>{if(editor.resume) editor.updateResume(moveSection(editor.resume,section.key,direction));},
    onDuplicate:section.custom ? ()=>duplicateSection(section.key) : undefined,
  });
  const rename = (key:string,name:string) => {if(editor.resume) editor.updateResume(renameSection(editor.resume,key,name));};
  const openCreatedSection = () => {if(pendingSection.current) {setWorkspace({tool:"content",trayOpen:true,sectionKey:pendingSection.current,fieldPath:null,fieldLabel:null});pendingSection.current=null;}};
  const preview=async()=>{
    if(openingPreview)return;
    const generation=++previewGeneration.current;
    setOpeningPreview(true);setActionError(null);Keyboard.dismiss();
    try {
      if(editor.resume){const complete=withSectionMetadata(editor.resume);if(complete !== editor.resume)editor.updateResume(complete);}
      const saved=await editor.saveForPdf();
      if(!mounted.current || generation !== previewGeneration.current)return;
      if(saved)router.push({pathname:"/cv-editor/[id]/preview",params:{id:saved.tailoring_id,revision:String(saved.revision),returnToEditor:"1"}});
      else setActionError("Your PDF could not be saved yet. Your text and layout are kept here. Retry PDF when connected.");
    } catch(error){if(mounted.current && generation === previewGeneration.current)setActionError(error instanceof Error ? error.message : "Your PDF could not be saved. Try again.");}
    finally{if(mounted.current && generation === previewGeneration.current)setOpeningPreview(false);}
  };
  const trayHeight=Math.min(workspace.tool === "templates" ? 210 : workspace.tool === "format" ? 270 : 310,Math.max(100,stageHeight*.5));
  const trayStyle={height:workspace.trayOpen?trayHeight:0,display:workspace.trayOpen?"flex" as const:"none" as const};
  const canRender=!!layout && supportsLiveTemplate(layout.template);
  return <AppScreen>
    <View className="h-14 native:h-[56px] flex-row items-center gap-1 border-b border-border bg-background px-2">
      <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0 native:h-[44px] native:w-[44px]" accessibilityLabel={returnTo === "preview" ? "Back to saved preview" : "Back to saved CVs"} disabled={openingPreview} onPress={leave}><LucideIcon name="ChevronLeft" size={22} className="text-foreground"/></Button>
      <View className="min-w-0 flex-1"><Text accessibilityRole="header" className="text-editor-title text-foreground">Edit Resume</Text><Text accessibilityLiveRegion="polite" numberOfLines={1} className="text-caption text-muted-foreground">{!document || editor.error ? (editor.loading?"Opening saved CV…":session?"Saved CV":"Sign in to edit") : openingPreview ? "Saving PDF…" : statusLabels[editor.saveState]}{document && !editor.error && editor.layoutDraftDirty ? " · Layout on device" : ""}</Text></View>
      {document && editor.resume && !editor.error ? <Button variant="ghost" accessibilityLabel="Open PDF preview" disabled={openingPreview} className="min-h-11 native:min-h-[44px] min-w-16 flex-row gap-1.5 px-3" onPress={()=>void preview()}>{openingPreview?<ActivityIndicator size="small"/>:<LucideIcon name="FileText" size={17} className="text-primary"/>}<Text className="text-body font-semibold text-primary">PDF</Text></Button>:null}
    </View>
    {editor.loading ? <View className="flex-1 items-center justify-center gap-4 bg-background"><ActivityIndicator/><Text className="text-body text-muted-foreground">Opening your saved CV…</Text></View>
    : !document || !editor.resume || editor.error ? <View className="flex-1 justify-center gap-4 bg-background px-6"><Notice tone="error" message={editor.error ?? "This CV could not be opened."}/>{!editor.routeError?<Button onPress={()=>session && editor.accessStatus !== 401 ? void editor.reload() : setShowSignIn(true)}><Text>{session && editor.accessStatus !== 401?"Try again":"Sign in"}</Text></Button>:null}<Button variant="outline" onPress={leave}><Text>Return to Tailored CVs</Text></Button></View>
    : <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} enabled={Platform.OS !== "web"} className="flex-1 bg-background">
      {editor.problem || actionError ? <View className="gap-2 bg-background px-4 py-2"><Notice tone="error" message={actionError ?? editor.problem ?? "Your edits need syncing."}/>{editor.saveState !== "conflict"?<Button variant="outline" size="sm" className="min-h-11 native:min-h-[44px]" disabled={openingPreview} onPress={()=>actionError ? void preview() : void editor.flush()}><Text>{actionError?"Retry PDF":"Retry saving"}</Text></Button>:null}</View>:null}
      {editor.saveState === "conflict" ? <View className="gap-2 border-b border-border bg-background px-4 py-3"><Text className="text-caption text-foreground">A newer version is saved. Choose how to continue; your layout trial stays here.</Text><View className="flex-row gap-2"><Button className="min-h-11 native:min-h-[44px] flex-1" onPress={()=>void editor.resolveConflict("local")}><Text>Keep my edits</Text></Button><Button variant="outline" className="min-h-11 native:min-h-[44px] flex-1" onPress={()=>void editor.resolveConflict("server")}><Text>Use saved content</Text></Button></View></View>:null}
      <View className="flex-1 bg-background" onLayout={event=>setStageHeight(event.nativeEvent.layout.height)}>
        <View className="flex-1 bg-muted">
          {canRender && !viewError ? <CvPreviewSurface key={`${session?.user.id}:${document.tailoring_id}:${rendererAttempt}`} renderer={LiveCvRenderer} resume={editor.resume} layout={layout} pdf={null} error={null} editable={workspace.tool === "content" && !openingPreview} selectedKey={workspace.sectionKey} scrollOffset={workspace.documentOffset} onScrollOffset={documentOffset=>setWorkspace({documentOffset})} onSectionPress={openSection} onError={()=>setViewError(true)} onRetry={()=>{setViewError(false);setRendererAttempt(n=>n+1);}}/>
          : <View className="flex-1 items-center justify-center gap-3 bg-muted px-6"><LucideIcon name="FileText" size={28} className="text-muted-foreground"/><Text className="text-center text-body text-foreground">{viewError?"The live document could not load.":layout?`${layoutTemplateName(layout.template)} is available in PDF preview.`:"Reload your CV to see its layout."}</Text><Text className="text-center text-caption text-muted-foreground">{layout?"Your saved content and template are preserved.":"Your text edits are kept on this device."}</Text>{viewError?<Button variant="outline" onPress={()=>{setViewError(false);setRendererAttempt(n=>n+1);}}><Text>Retry live view</Text></Button>:null}<Button variant="outline" className="min-h-11 native:min-h-[44px]" disabled={openingPreview} onPress={()=>layout?void preview():void editor.reload()}><Text>{layout?"View template in PDF":"Reload layout"}</Text></Button></View>}
        </View>
        <View className="min-h-7 flex-row items-center justify-between gap-2 bg-background px-4 py-1"><Text className="text-caption text-muted-foreground">{layout?`${layoutTemplateName(layout.template)} · ${layout.pageSize === "LETTER"?"Letter":"A4"}`:"Live view"}</Text><Text className="text-caption text-muted-foreground">PDF shows final page breaks</Text></View>
        <View accessibilityRole="tablist" className="flex-row items-center border-t border-border bg-background px-2">
          {tools.map(tool=><Pressable key={tool.key} accessibilityRole="tab" accessibilityLabel={tool.label} accessibilityState={{selected:workspace.tool === tool.key,expanded:workspace.tool === tool.key && workspace.trayOpen}} disabled={openingPreview} onPress={()=>selectTool(tool.key)} className="min-h-12 native:min-h-[44px] min-w-0 flex-1 flex-row items-center justify-center gap-1.5 bg-background px-1"><LucideIcon name={tool.icon} size={16} className={workspace.tool === tool.key?"text-primary":"text-muted-foreground"}/><Text className={cn("text-caption font-medium",workspace.tool === tool.key?"text-primary":"text-muted-foreground")}>{tool.label}</Text><LucideIcon name={workspace.tool === tool.key && workspace.trayOpen?"ChevronDown":"ChevronUp"} size={12} className="text-muted-foreground"/></Pressable>)}
        </View>
        <View testID="live-editor-tray" pointerEvents={openingPreview || !workspace.trayOpen?"none":"auto"} accessibilityElementsHidden={!workspace.trayOpen} importantForAccessibility={workspace.trayOpen?"auto":"no-hide-descendants"} aria-hidden={!workspace.trayOpen} className="overflow-hidden border-t border-border bg-background" style={trayStyle}>
          <View testID="editor-content-controls" className={cn("flex-1 bg-background",workspace.tool === "content"?"flex":"hidden")}>
            <View className={cn("flex-1 bg-background",section?"hidden":"flex")}>
              <View className="min-h-11 native:min-h-[44px] flex-row items-center justify-between gap-2 bg-background px-4"><Text className="text-caption text-muted-foreground">Tap a pencil or choose a section</Text><Button variant="ghost" className="min-h-11 native:min-h-[44px] flex-row gap-1 px-1" onPress={()=>setWorkspace({tool:"match",trayOpen:true})}><LucideIcon name="ChartNoAxesCombined" size={15} className="text-primary"/><Text className="text-caption font-medium text-primary">Job Match</Text></Button></View>
              <ScrollView ref={contentScroll} className="flex-1 bg-background" contentContainerClassName="gap-3 px-4 pb-6" keyboardShouldPersistTaps="handled" scrollEventThrottle={16} onLayout={()=>contentScroll.current?.scrollTo({y:listOffset.current,animated:false})} onScroll={event=>{if(!section)listOffset.current=Math.max(0,event.nativeEvent.contentOffset.y);}}><ResumeSectionList sections={sections} onOpen={openSection} onActions={setMenuKey} onAdd={()=>setAddingSection(true)}/></ScrollView>
            </View>
            {section?<SectionEditor inline section={section} target={workspace.fieldPath?{path:workspace.fieldPath,label:workspace.fieldLabel ?? section.label}:undefined} saveLabel={statusLabels[editor.saveState]} onChange={(value:JsonValue)=>{if(editor.resume)editor.updateResume(withSectionMetadata(replaceSection(editor.resume,section.key,value)));}} onClose={closeSection} onRename={name=>rename(section.key,name)} actions={actionsFor(section)}/>:null}
          </View>
          <View testID="editor-templates-controls" className={cn("flex-1 bg-background",workspace.tool === "templates"?"flex":"hidden")}><ScrollView className="flex-1 bg-background" contentContainerClassName="px-4 pb-4 pt-3" keyboardShouldPersistTaps="handled"><DesignLayout mode="templates" layout={layout} options={document.layout_options} onChange={editor.updateLayoutDraft} onReload={()=>void editor.reload()}/></ScrollView></View>
          <View testID="editor-format-controls" className={cn("flex-1 bg-background",workspace.tool === "format"?"flex":"hidden")}><ScrollView className="flex-1 bg-background" contentContainerClassName="px-4 pb-4 pt-1" keyboardShouldPersistTaps="handled"><DesignLayout mode="format" layout={layout} options={document.layout_options} onChange={editor.updateLayoutDraft} onReload={()=>void editor.reload()}/></ScrollView></View>
          <View testID="editor-match-controls" className={cn("flex-1 bg-background",workspace.tool === "match"?"flex":"hidden")}>
            <View className="flex-row border-b border-border bg-background px-3">{([['overview','Overview'],['highlights','Keyword Highlights']] as const).map(([key,label])=><Pressable key={key} accessibilityRole="tab" accessibilityLabel={label} accessibilityState={{selected:workspace.matchSection === key}} onPress={()=>setWorkspace({matchSection:key})} className={cn("min-h-11 native:min-h-[44px] flex-1 items-center justify-center border-b-2 bg-background px-1",workspace.matchSection === key?"border-primary":"border-transparent")}><Text className={cn("text-caption",workspace.matchSection === key?"text-primary":"text-muted-foreground")}>{label}</Text></Pressable>)}</View>
            <ScrollView className="flex-1 bg-background" contentContainerClassName="px-4 pb-6 pt-3" keyboardShouldPersistTaps="handled"><JobMatch section={workspace.matchSection} analysis={editor.analysis} revision={document.revision} dirty={editor.saveState !== "saved"} loading={editor.analysisLoading} jobDescription={document.job.description} confirmedSkills={editor.confirmedSkills} onRefresh={()=>void editor.refreshAnalysis()} onAddSkill={addSkill} onEdit={openSection}/></ScrollView>
          </View>
        </View>
        <View className="bg-background" style={{height:Math.max(insets.bottom,6)}}/>
      </View>
    </KeyboardAvoidingView>}
    {menuSection?<SectionActionsMenu key={menuSection.key} actions={actionsFor(menuSection)} onClose={()=>setMenuKey(null)}/>:null}
    {renameKey && sections.some(s=>s.key === renameKey)?<RenameSectionSheet key={renameKey} name={sections.find(s=>s.key === renameKey)!.label} onSave={name=>{rename(renameKey,name);setRenameKey(null);}} onClose={()=>setRenameKey(null)}/>:null}
    {addingSection || pendingSection.current?<AddCustomSectionSheet visible={addingSection} onCreate={(name,type)=>{
      if(!editor.resume)return;
      const result=addCustomSection(editor.resume,name,type);editor.updateResume(result.resume);returnOffset.current=listOffset.current;
      if(Platform.OS === "ios")pendingSection.current=result.key;
      else setWorkspace({tool:"content",trayOpen:true,sectionKey:result.key,fieldPath:null,fieldLabel:null});
      setAddingSection(false);
    }} onDismiss={openCreatedSection} onClose={()=>setAddingSection(false)}/>:null}
    <AccountSheet visible={showSignIn} onClose={()=>{setShowSignIn(false);void editor.reload();}}/>
  </AppScreen>;
}
