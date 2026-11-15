import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
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
import type { FieldTarget } from "@/lib/editor/liveDocument";
import { SectionEditor } from "@/components/editor/SectionEditor";
import { AddCustomSectionSheet, RenameSectionSheet, SectionActionsMenu } from "@/components/editor/SectionControls";
import { ResumeSectionList } from "@/components/editor/ResumeSectionList";
import { EditorControlsPanel } from "@/components/editor/EditorControlsPanel";
import { CvPreviewSurface } from "@/components/editor/CvPreviewSurface";
import { useEditorPdf } from "@/lib/editor/useEditorPdf";
import { pdfEditSignature } from "@/lib/editor/editorPdfPreview";
import { EditorFieldActivity } from "@/components/editor/EditorFieldActivity";
import { DesignLayout } from "@/components/editor/DesignLayout";
import { JobMatch } from "@/components/editor/JobMatch";
import { addCustomSection, deleteCustomSection, duplicateCustomSection, moveSection, renameSection, replaceSection, resumeSections, withSectionMetadata, type EditorSection } from "@/components/editor/sections";
import { isJsonObject, type JsonValue } from "@/lib/tailoring/types";
import { cn } from "@/lib/utils";
import { useTheme } from "@/theming/ThemeProvider";

const statusLabels = {saved:"Content saved",saving:"Saving…",local:"Saved on device",error:"Retry saving",conflict:"Choose saved version"};
const tools = [{key:"content",label:"Content",icon:"Pencil"},{key:"templates",label:"Templates",icon:"PanelsTopLeft"},{key:"format",label:"Format",icon:"SlidersHorizontal"}] as const;

export default function CvEditorScreen() {
  const {id,returnTo} = useLocalSearchParams<{id?:string|string[];returnTo?:string}>();
  const {session}=useAuth();
  const {theme}=useTheme();
  const editor=useCvEditor(id);
  const workspace=editor.workspace ?? emptyWorkspace();
  const setWorkspace=(patch:Partial<EditorWorkspace>)=>editor.updateWorkspace(patch);
  const document=editor.document;
  const layout=editor.layoutDraft ?? editor.layout;
  const sections=editor.resume ? resumeSections(editor.resume) : [];
  const section=sections.find(s=>s.key === workspace.sectionKey);
  const previewLock=useRef(false);
  const [fieldEditing,setFieldEditing]=useState(false);
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
  const contentScroll=useRef<ScrollView|null>(null);
  const listOffset=useRef(0);
  const returnOffset=useRef(0);
  const menuSection=sections.find(s=>s.key === menuKey && !s.personal);
  const insets=useSafeAreaInsets();
  const pdfInput=session && document && editor.resume && !editor.error?{ownerId:session.user.id,id:document.tailoring_id,resume:editor.resume,layout,skills:editor.confirmedSkills,revision:document.revision,saveState:editor.saveState,editing:fieldEditing && workspace.tool === "content" && !!section}:null;
  const displayed=useEditorPdf(pdfInput,editor.saveForPdf);
  const pdfError=displayed.saveError ?? displayed.error;
  useEffect(()=>{setViewError(false);},[displayed.pdf?.uri,displayed.pendingPdf?.uri]);
  useFocusEffect(useCallback(()=>{previewLock.current=false;setOpeningPreview(false);},[id,session?.user.id]));
  useEffect(()=>{
    previewLock.current=false;listOffset.current=0;returnOffset.current=0;pendingSection.current=null;
    setFieldEditing(false);setMenuKey(null);setRenameKey(null);setAddingSection(false);setOpeningPreview(false);setActionError(null);setViewError(false);
  },[session?.user.id,id]);
  const leave=()=>{
    Keyboard.dismiss();void editor.flush();
    if(returnTo === "library" && router.canGoBack())router.dismissTo("/(tabs)/library/tailored-cvs");
    else if(router.canGoBack())router.back();
    else router.replace(returnTo === "tailor"?"/(tabs)/tailor":"/(tabs)/library/tailored-cvs");
  };
  const openSection=(key:string,target?:FieldTarget)=>{
    const found=sections.find(s=>key === "skills" ? /^(additional|technicalSkills|professionalSkills|skills)$/.test(s.key) : key === "workExperience" ? /workExperience|experience$/.test(s.key) : s.key === key);
    if(!found)return;
    returnOffset.current=listOffset.current;
    setWorkspace({tool:"content",trayOpen:true,panelHeight:workspace.panelHeight || 190,sectionKey:found.key,fieldPath:target?.path ?? null,fieldLabel:target?.label ?? null});
  };
  const closeSection=()=>{
    Keyboard.dismiss();setFieldEditing(false);setWorkspace({sectionKey:null,fieldPath:null,fieldLabel:null});
    contentScroll.current?.scrollTo({y:returnOffset.current,animated:false});void editor.flush();
  };
  const selectTool=(tool:EditorWorkspace["tool"])=>{
    Keyboard.dismiss();setFieldEditing(false);setWorkspace({tool,trayOpen:workspace.tool !== tool || !workspace.trayOpen,panelHeight:workspace.panelHeight || 190});
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
  const openCreatedSection = () => {if(pendingSection.current) {setWorkspace({tool:"content",trayOpen:true,panelHeight:workspace.panelHeight || 190,sectionKey:pendingSection.current,fieldPath:null,fieldLabel:null});pendingSection.current=null;}};
  const preview=()=>{
    const pdf=displayed.pdf,snapshot=editor.getSnapshot?.();
    if(previewLock.current || !displayed.ready || !pdf)return;
    if(snapshot && (snapshot.saveState !== "saved" || snapshot.document?.revision !== pdf.revision || !snapshot.resume || pdfEditSignature(snapshot.resume,snapshot.layoutDraft ?? snapshot.layout,snapshot.confirmedSkills)!==displayed.signature))return;
    previewLock.current=true;setOpeningPreview(true);setActionError(null);Keyboard.dismiss();
    try{router.push({pathname:"/cv-editor/[id]/preview",params:{id:document!.tailoring_id,revision:String(pdf.revision),returnToEditor:"1",...(returnTo === "library" || returnTo === "tailor" ? {editorReturnTo:returnTo} : {})}});}
    catch(error){previewLock.current=false;setOpeningPreview(false);setActionError(error instanceof Error?error.message:"The PDF viewer could not open. Try again.");}
  };
  return <EditorFieldActivity onChange={setFieldEditing} resetKey={JSON.stringify([session?.user.id,id,workspace.tool,workspace.sectionKey,workspace.trayOpen])}><AppScreen>
    <View className="h-14 native:h-[56px] shrink-0 flex-row items-center gap-1 border-b border-border bg-background px-2">
      <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0 native:h-[44px] native:w-[44px]" accessibilityLabel={returnTo === "preview" ? "Back to saved preview" : returnTo === "tailor" ? "Back to Tailor" : "Back to saved CVs"} disabled={openingPreview} onPress={leave}><LucideIcon name="ChevronLeft" size={22} className="text-foreground"/></Button>
      <View className="min-w-0 flex-1"><Text accessibilityRole="header" className="text-editor-title text-foreground">Edit Resume</Text><Text accessibilityLiveRegion="polite" numberOfLines={1} className="text-caption text-muted-foreground">{!document || editor.error ? (editor.loading?"Opening saved CV…":session?"Saved CV":"Sign in to edit") : openingPreview ? "Opening PDF…" : pdfError ? "PDF needs updating" : pdfInput?.editing ? "Editing…" : !displayed.ready ? "Updating PDF…" : `Saved · PDF v${displayed.pdf?.revision}`}{document && !editor.error && editor.layoutDraftDirty ? " · Layout on device" : ""}</Text></View>
      {document && editor.resume && !editor.error ? <Button variant="ghost" accessibilityLabel="Open PDF preview" disabled={openingPreview || !displayed.ready} className="min-h-11 native:min-h-[44px] min-w-16 flex-row gap-1.5 px-3" onPress={()=>void preview()}>{openingPreview?<ActivityIndicator size="small"/>:<LucideIcon name="FileText" size={17} className="text-primary"/>}<Text className="text-body font-semibold text-primary">PDF</Text></Button>:null}
    </View>
    {editor.loading ? <View className="flex-1 items-center justify-center gap-4 bg-background"><ActivityIndicator/><Text className="text-body text-muted-foreground">Opening your saved CV…</Text></View>
    : !document || !editor.resume || editor.error ? <View className="flex-1 justify-center gap-4 bg-background px-6"><Notice tone="error" message={editor.error ?? "This CV could not be opened."}/>{!editor.routeError?<Button onPress={()=>session && editor.accessStatus !== 401 ? void editor.reload() : setShowSignIn(true)}><Text>{session && editor.accessStatus !== 401?"Try again":"Sign in"}</Text></Button>:null}<Button variant="outline" onPress={leave}><Text>Return to Tailored CVs</Text></Button></View>
    : <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} enabled={Platform.OS !== "web"} className="flex-1 bg-background">
      {editor.problem || actionError || pdfError ? <View className="gap-2 bg-background px-4 py-2"><Notice tone="error" message={[actionError,editor.problem,pdfError].filter(Boolean).join(" ") || "Your edits need syncing."}/>{editor.saveState !== "conflict"?<Button variant="outline" size="sm" className="min-h-11 native:min-h-[44px]" disabled={openingPreview} onPress={()=>actionError ? preview() : pdfError ? displayed.retry() : void editor.flush()}><Text>{pdfError?"Retry PDF update":actionError?"Retry preview":"Retry saving"}</Text></Button>:null}</View>:null}
      {editor.saveState === "conflict" ? <View className="gap-2 border-b border-border bg-background px-4 py-3"><Text className="text-caption text-foreground">A newer version is saved. Choose how to continue; your layout trial stays here.</Text><View className="flex-row gap-2"><Button className="min-h-11 native:min-h-[44px] flex-1" onPress={()=>void editor.resolveConflict("local")}><Text>Keep my edits</Text></Button><Button variant="outline" className="min-h-11 native:min-h-[44px] flex-1" onPress={()=>void editor.resolveConflict("server")}><Text>Use saved content</Text></Button></View></View>:null}
      <View className="flex-1 bg-background" onLayout={event=>setStageHeight(event.nativeEvent.layout.height)}>
        <View testID="editor-pdf-pane" className="relative flex-1 bg-muted">
          {displayed.pdf ? <>
            <CvPreviewSurface key={rendererAttempt} resume={editor.resume} layout={layout} pdf={displayed.pdf} pendingPdf={displayed.pendingPdf} onViewerReady={displayed.onViewerReady} error={null} editable={false} onSectionPress={openSection} onError={()=>setViewError(true)} onRetry={()=>{setViewError(false);setRendererAttempt(n=>n+1);}}/>
            {!displayed.ready && !pdfError && !editor.problem && !viewError ? <View testID="preview-updating-overlay" pointerEvents="none" className="absolute inset-0 z-10 items-center justify-center">
              <View accessible accessibilityRole="progressbar" accessibilityLabel="Updating preview…" accessibilityLiveRegion="polite" className="flex-row items-center gap-2 rounded-full border border-border bg-background px-4 py-2.5 shadow-sm">
                <ActivityIndicator size="small" color={theme.colors.primary}/><Text className="text-caption font-medium text-foreground">Updating preview…</Text>
              </View>
            </View>:null}
            {viewError?<View className="gap-2 border-t border-border bg-background px-4 py-2"><Text className="text-caption text-muted-foreground">The PDF viewer could not display this file.</Text><Button variant="outline" onPress={()=>{setViewError(false);setRendererAttempt(n=>n+1);}}><Text>Retry viewer</Text></Button></View>:null}
          </>:<View className="flex-1 items-center justify-center gap-3 bg-muted px-6">{pdfError?<LucideIcon name="FileText" size={28} className="text-muted-foreground"/>:<ActivityIndicator/>}<Text className="text-center text-body text-foreground">{pdfError?"Your PDF could not be updated.":"Updating PDF…"}</Text><Text className="text-center text-caption text-muted-foreground">{pdfError?"Your edits are kept here. Use Retry PDF update above.":"The exact exported pages will appear here."}</Text></View>}

        </View>
        <EditorControlsPanel open={workspace.trayOpen} height={workspace.panelHeight ?? 190} availableHeight={stageHeight} onHeightChange={height=>setWorkspace({trayOpen:height>0,panelHeight:height>0?height:workspace.panelHeight || 190})} toolbar={
        <View accessibilityRole="tablist" className="flex-row items-center border-t border-border bg-background px-2">
          {tools.map(tool=><Pressable key={tool.key} accessibilityRole="tab" accessibilityLabel={tool.label} accessibilityState={{selected:workspace.tool === tool.key,expanded:workspace.tool === tool.key && workspace.trayOpen}} disabled={openingPreview} onPress={()=>selectTool(tool.key)} className="min-h-12 native:min-h-[44px] min-w-0 flex-1 flex-row items-center justify-center gap-1.5 bg-background px-1"><LucideIcon name={tool.icon} size={16} className={workspace.tool === tool.key?"text-primary":"text-muted-foreground"}/><Text className={cn("text-caption font-medium",workspace.tool === tool.key?"text-primary":"text-muted-foreground")}>{tool.label}</Text><LucideIcon name={workspace.tool === tool.key && workspace.trayOpen?"ChevronDown":"ChevronUp"} size={12} className="text-muted-foreground"/></Pressable>)}
        </View>
        }>
          <View testID="editor-content-controls" className={cn("flex-1 bg-background",workspace.tool === "content"?"flex":"hidden")}>
            <View className={cn("flex-1 bg-background",section?"hidden":"flex")}>
              <View className="min-h-11 native:min-h-[44px] flex-row items-center justify-between gap-2 bg-background px-4"><Text className="text-caption text-muted-foreground">Choose a section to edit</Text><Button variant="ghost" className="min-h-11 native:min-h-[44px] flex-row gap-1 px-1" onPress={()=>setWorkspace({tool:"match",trayOpen:true})}><LucideIcon name="ChartNoAxesCombined" size={15} className="text-primary"/><Text className="text-caption font-medium text-primary">Job Match</Text></Button></View>
              <ScrollView ref={contentScroll} className="flex-1 bg-background" contentContainerClassName="gap-3 px-4 pb-6" keyboardShouldPersistTaps="handled" scrollEventThrottle={16} onLayout={()=>contentScroll.current?.scrollTo({y:listOffset.current,animated:false})} onScroll={event=>{if(!section)listOffset.current=Math.max(0,event.nativeEvent.contentOffset.y);}}><ResumeSectionList sections={sections} onOpen={openSection} onActions={setMenuKey} onAdd={()=>setAddingSection(true)}/></ScrollView>
            </View>
            {section?<SectionEditor inline section={section} target={workspace.fieldPath?{path:workspace.fieldPath,label:workspace.fieldLabel ?? section.label}:undefined} saveLabel={statusLabels[editor.saveState]} onChange={(value:JsonValue)=>{if(editor.resume)editor.updateResume(withSectionMetadata(replaceSection(editor.resume,section.key,value)));}} onClose={closeSection} onRename={name=>rename(section.key,name)} actions={actionsFor(section)}/>:null}
          </View>
          <View testID="editor-templates-controls" className={cn("flex-1 bg-background",workspace.tool === "templates"?"flex":"hidden")}><ScrollView className="flex-1 bg-background" contentContainerClassName="px-4 pb-4 pt-3" keyboardShouldPersistTaps="handled"><DesignLayout mode="templates" layout={layout} options={document.layout_options} onChange={next=>{displayed.formatTap?.();editor.updateLayoutDraft(next);}} onReload={()=>void editor.reload()}/></ScrollView></View>
          <View testID="editor-format-controls" className={cn("flex-1 bg-background",workspace.tool === "format"?"flex":"hidden")}><ScrollView className="flex-1 bg-background" contentContainerClassName="px-4 pb-4 pt-1" keyboardShouldPersistTaps="handled"><DesignLayout mode="format" layout={layout} options={document.layout_options} onChange={next=>{displayed.formatTap?.();editor.updateLayoutDraft(next);}} onReload={()=>void editor.reload()}/></ScrollView></View>
          <View testID="editor-match-controls" className={cn("flex-1 bg-background",workspace.tool === "match"?"flex":"hidden")}>
            <View className="flex-row border-b border-border bg-background px-3">{([['overview','Overview'],['highlights','Keyword Highlights']] as const).map(([key,label])=><Pressable key={key} accessibilityRole="tab" accessibilityLabel={label} accessibilityState={{selected:workspace.matchSection === key}} onPress={()=>setWorkspace({matchSection:key})} className={cn("min-h-11 native:min-h-[44px] flex-1 items-center justify-center border-b-2 bg-background px-1",workspace.matchSection === key?"border-primary":"border-transparent")}><Text className={cn("text-caption",workspace.matchSection === key?"text-primary":"text-muted-foreground")}>{label}</Text></Pressable>)}</View>
            <ScrollView className="flex-1 bg-background" contentContainerClassName="px-4 pb-6 pt-3" keyboardShouldPersistTaps="handled"><JobMatch section={workspace.matchSection} analysis={editor.analysis} revision={document.revision} dirty={editor.saveState !== "saved"} loading={editor.analysisLoading} jobDescription={document.job.description} confirmedSkills={editor.confirmedSkills} onRefresh={()=>void editor.refreshAnalysis()} onAddSkill={addSkill} onEdit={openSection}/></ScrollView>
          </View>
        </EditorControlsPanel>
        <View className="bg-background" style={{height:Math.max(insets.bottom,6)}}/>
      </View>
    </KeyboardAvoidingView>}
    {menuSection?<SectionActionsMenu key={menuSection.key} actions={actionsFor(menuSection)} onClose={()=>setMenuKey(null)}/>:null}
    {renameKey && sections.some(s=>s.key === renameKey)?<RenameSectionSheet key={renameKey} name={sections.find(s=>s.key === renameKey)!.label} onSave={name=>{rename(renameKey,name);setRenameKey(null);}} onClose={()=>setRenameKey(null)}/>:null}
    {addingSection || pendingSection.current?<AddCustomSectionSheet visible={addingSection} onCreate={(name,type)=>{
      if(!editor.resume)return;
      const result=addCustomSection(editor.resume,name,type);editor.updateResume(result.resume);returnOffset.current=listOffset.current;
      if(Platform.OS === "ios")pendingSection.current=result.key;
      else setWorkspace({tool:"content",trayOpen:true,panelHeight:workspace.panelHeight || 190,sectionKey:result.key,fieldPath:null,fieldLabel:null});
      setAddingSection(false);
    }} onDismiss={openCreatedSection} onClose={()=>setAddingSection(false)}/>:null}
    <AccountSheet visible={showSignIn} onClose={()=>{setShowSignIn(false);void editor.reload();}}/>
  </AppScreen></EditorFieldActivity>;
}
