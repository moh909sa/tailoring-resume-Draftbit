import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Keyboard, Platform, Pressable, ScrollView, View } from "react-native";
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
import { SectionEditor } from "@/components/editor/SectionEditor";
import { AddCustomSectionSheet, RenameSectionSheet, SectionActionsMenu } from "@/components/editor/SectionControls";
import { ResumeSectionList } from "@/components/editor/ResumeSectionList";
import { EditorControlsPanel } from "@/components/editor/EditorControlsPanel";
import { CvPreviewSurface } from "@/components/editor/CvPreviewSurface";
import { useLivePreview } from "@/lib/editor/useLivePreview";
import { shareEditorPdf } from "@/lib/editor/pdf";
import { DesignLayout } from "@/components/editor/DesignLayout";
import { JobMatch } from "@/components/editor/JobMatch";
import { addCustomSection, deleteCustomSection, duplicateCustomSection, moveSection, renameSection, replaceSection, resumeSections, withSectionMetadata, type EditorSection } from "@/components/editor/sections";
import { isJsonObject, type JsonValue } from "@/lib/tailoring/types";
import { cn } from "@/lib/utils";

const statusLabels = {saved:"All changes saved",saving:"Saving changes…",local:"Saved on this device · waiting to sync",error:"Changes need syncing",conflict:"Another saved version is available"};

export default function CvEditorScreen() {
  const {id,returnTo,previewReturnTo} = useLocalSearchParams<{id?:string|string[];returnTo?:string;previewReturnTo?:string}>();
  const returningToPreview = returnTo === "preview";
  const {session} = useAuth();
  const editor = useCvEditor(id);
  const [showSignIn,setShowSignIn] = useState(false);
  const [view,setView] = useState<"edit"|"match">("edit");
  const [editSection,setEditSection] = useState<"Resume Content"|"Design & Layout">("Resume Content");
  const [matchSection,setMatchSection] = useState<"Overview"|"Keyword Highlights">("Overview");
  const [activeKey,setActiveKey] = useState<string|null>(null);
  const [menuKey,setMenuKey] = useState<string|null>(null);
  const [renameKey,setRenameKey] = useState<string|null>(null);
  const [addingSection,setAddingSection] = useState(false);
  const pendingSection = useRef<string|null>(null);
  const [panelOpen,setPanelOpen]=useState(false);
  const [stageHeight,setStageHeight]=useState(440);
  const [sharing,setSharing]=useState(false);
  const [viewError,setViewError]=useState(false);
  const designScroll=useRef<ScrollView|null>(null);
  const designOffset=useRef(0);
  const matchScroll=useRef<ScrollView|null>(null);
  const matchOffset=useRef(0);
  const [openingPreview,setOpeningPreview] = useState(false);
  const [actionError,setActionError] = useState<string|null>(null);
  const previewGeneration = useRef(0);
  const mounted = useRef(true);
  const contentScroll = useRef<ScrollView|null>(null);
  const listOffset = useRef(0);
  const returnOffset = useRef(0);
  useEffect(() => { mounted.current = true; listOffset.current=0; returnOffset.current=0; setActiveKey(null); setPanelOpen(false); setSharing(false); setViewError(false); designOffset.current=0; matchOffset.current=0; setMenuKey(null); setRenameKey(null); setAddingSection(false); pendingSection.current=null; setView("edit"); setEditSection("Resume Content"); setMatchSection("Overview"); setOpeningPreview(false); setActionError(null); return () => { mounted.current = false; previewGeneration.current++; }; }, [session?.user.id, id]);
  const secondaryTabs = view === "edit" ? ["Resume Content","Design & Layout"] as const : ["Overview","Keyword Highlights"] as const;
  const selectedSecondary = view === "edit" ? editSection : matchSection;
  const insets = useSafeAreaInsets();
  const sections = editor.resume ? resumeSections(editor.resume) : [];
  const section = sections.find(s=>s.key === activeKey);
  const menuSection = sections.find(s=>s.key === menuKey && !s.personal);
  const document = editor.document;
  const live=useLivePreview(session?.user.id && document && !editor.error && !editor.routeError ? {ownerId:session.user.id,id:document.tailoring_id,revision:document.revision,ready:editor.saveState === "saved"} : null);
  useEffect(()=>{setViewError(false);},[live.pdf?.uri]);
  const previewCurrent=!!live.pdf && live.pdf.revision===document?.revision && editor.saveState === "saved" && !live.updating && !live.error && !viewError;

  const initialMatch = useRef<string | null>(null);
  useEffect(() => {
    if (view !== "match" || !document || editor.analysis || editor.analysisLoading || editor.saveState !== "saved" || initialMatch.current === document.tailoring_id) return;
    initialMatch.current = document.tailoring_id;
    void editor.refreshAnalysis();
  }, [view, document, editor.analysis, editor.analysisLoading, editor.saveState, editor.refreshAnalysis]);
  const leave = () => {
    if (returningToPreview && !editor.error && !editor.routeError) { void preview(true); return; }
    previewGeneration.current++;Keyboard.dismiss();void editor.flush();router.replace("/(tabs)/library/tailored-cvs");
  };
  const openSection = (key:string) => {
    returnOffset.current=view === "edit" && editSection === "Resume Content" ? listOffset.current : 0;
    setPanelOpen(true);
    setView("edit");
    setEditSection("Resume Content");
    const found = sections.find(s=>key === "skills" ? /^(additional|technicalSkills|professionalSkills|skills)$/.test(s.key) : key === "workExperience" ? /workExperience|experience$/.test(s.key) : s.key === key);
    if(found) setActiveKey(found.key);
  };
  const closeSection = () => {
    Keyboard.dismiss();
    setActiveKey(null);
    contentScroll.current?.scrollTo({y:returnOffset.current,animated:false});
    void editor.flush();
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
    if (copy) {editor.updateResume(copy.resume);setActiveKey(copy.key);}
  };
  const deleteSection = (key:string) => {
    if (!editor.resume) return;
    const next=deleteCustomSection(editor.resume,key);
    if (next === editor.resume) return;
    editor.updateResume(next);
    setMenuKey(null);setRenameKey(null);
    if (activeKey === key) {
      setActiveKey(null);
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
  const openCreatedSection = () => {if(pendingSection.current) {setActiveKey(pendingSection.current);pendingSection.current=null;}};
  const preview = async (exitToOrigin=false) => {
    if(openingPreview) return;
    const generation = ++previewGeneration.current;
    setOpeningPreview(true);setActionError(null);Keyboard.dismiss();
    try {
      if (editor.resume) {
        const complete = withSectionMetadata(editor.resume);
        if (complete !== editor.resume) editor.updateResume(complete);
      }
      const saved = await editor.flush();
      if (!mounted.current || generation !== previewGeneration.current) return;
      if(saved) {
        if (exitToOrigin && returningToPreview && router.canGoBack()) router.dismissTo({pathname:"/cv-editor/[id]/preview",params:{id:saved.tailoring_id,revision:String(saved.revision),...(previewReturnTo === "library" ? {returnTo:"library"} : {})}});
        else if (exitToOrigin && returningToPreview) router.replace({pathname:"/cv-editor/[id]/preview",params:{id:saved.tailoring_id,revision:String(saved.revision),...(previewReturnTo === "library" ? {returnTo:"library"} : {})}});
        else router.push({pathname:"/cv-editor/[id]/preview",params:{id:saved.tailoring_id,revision:String(saved.revision),returnToEditor:"1"}});
      }
      else setActionError("Save your latest changes before opening the PDF preview. Your edits are kept on this device.");
    } catch(error) {if (mounted.current && generation === previewGeneration.current) setActionError(error instanceof Error ? error.message : "The CV could not be saved. Please try again.");}
    finally {if (mounted.current && generation === previewGeneration.current) setOpeningPreview(false);}
  };
  const download=async()=>{
    const current=editor.getSnapshot?.() ?? editor;
    if(!live.pdf || sharing || !previewCurrent || current.saveState!=="saved" || live.pdf.revision!==current.document?.revision)return;
    const generation=previewGeneration.current;
    const release=live.retain(live.pdf);
    setSharing(true);setActionError(null);
    try{await shareEditorPdf(live.pdf);}
    catch(error){if(mounted.current&&generation===previewGeneration.current)setActionError(error instanceof Error?error.message:"Your PDF could not be downloaded. Try again.");}
    finally{release();if(mounted.current&&generation===previewGeneration.current)setSharing(false);}
  };
  return <AppScreen>
    <View className="min-h-16 flex-row items-center gap-3 px-5 py-3">
      <Button variant="ghost" size="icon" accessibilityLabel={returningToPreview ? "Back to PDF preview" : "Back to saved CVs"} disabled={openingPreview} onPress={leave}><LucideIcon name="ChevronLeft" size={24} className="text-foreground"/></Button>
      <View className="flex-1"><Text accessibilityRole="header" className="text-h3 text-foreground">CV Editor</Text><Text numberOfLines={1} className="text-caption text-muted-foreground">{[document?.job.title,document?.job.company].filter(Boolean).join(" · ") || "Your tailored CV"}</Text></View>
      {document && editor.resume && !editor.error ? <Button variant="ghost" size="icon" className="h-11 w-11" accessibilityLabel="Open PDF preview" disabled={openingPreview} onPress={()=>void preview()}><LucideIcon name="Maximize2" size={20} className="text-foreground"/></Button> : null}
    </View>
    {editor.loading ? <View className="flex-1 items-center justify-center gap-4"><ActivityIndicator/><Text className="text-body text-muted-foreground">Opening your saved CV…</Text></View>
    : !document || !editor.resume || editor.error ? <View className="flex-1 justify-center gap-4 px-6"><Notice tone="error" message={editor.error ?? "This CV could not be opened."}/>{!editor.routeError ? <Button onPress={()=>session && editor.accessStatus !== 401 ? void editor.reload() : setShowSignIn(true)}><Text>{session && editor.accessStatus !== 401 ? "Try again" : "Sign in"}</Text></Button>:null}<Button variant="outline" onPress={leave}><Text>Return to Tailored CVs</Text></Button></View>
    : <>
      <View className="gap-2 px-5 pb-3">
        <View className="flex-row items-center gap-2">
          <View accessibilityLiveRegion="polite" className="min-w-0 flex-1 flex-row items-center gap-2"><LucideIcon name={editor.saveState === "saved" ? "CloudCheck" : "CloudUpload"} size={15} className="text-muted-foreground"/><Text className="flex-shrink text-caption text-muted-foreground">{statusLabels[editor.saveState]}</Text></View>
          <Button variant="ghost" size="sm" accessibilityLabel="Edit content" onPress={()=>{setView("edit");setEditSection("Resume Content");setPanelOpen(true);}}><Text className="text-caption text-primary">Edit content</Text></Button>
          <Button variant="outline" size="sm" accessibilityLabel="Design" accessibilityState={{expanded:panelOpen && view==="edit" && editSection==="Design & Layout"}} className="min-h-11 flex-row gap-2 rounded-xl" onPress={()=>{Keyboard.dismiss();setView("edit");setEditSection("Design & Layout");setPanelOpen(true);}}><LucideIcon name="SlidersHorizontal" size={16} className="text-foreground"/><Text className="text-caption">Design</Text></Button>
        </View>
        {editor.problem || actionError ? <View className="gap-3"><Notice tone="error" message={actionError ?? editor.problem ?? "Your edits need syncing."}/>{editor.saveState !== "conflict" ? <Button variant="outline" onPress={()=>{setActionError(null);void editor.flush();}}><Text>Retry saving</Text></Button> : null}</View> : null}
        {editor.saveState === "conflict" ? <View className="gap-3 rounded-2xl border border-border bg-card p-4"><Text className="text-body text-foreground">Choose which version to continue with. Your edits stay on this device until you decide.</Text><Button onPress={()=>void editor.resolveConflict("local")}><Text>Keep my edits</Text></Button><Button variant="outline" onPress={()=>void editor.resolveConflict("server")}><Text>Use the saved version</Text></Button></View> : null}
      </View>
      <View className="flex-1 bg-background" onLayout={event=>setStageHeight(event.nativeEvent.layout.height)}>
        <View className="flex-1 bg-muted">
          {viewError ? <View className="flex-1 items-center justify-center gap-3 px-6"><Text className="text-body text-muted-foreground">The PDF could not be displayed.</Text><Button variant="outline" onPress={()=>setViewError(false)}><Text>Retry preview</Text></Button></View> : <CvPreviewSurface resume={editor.resume} layout={editor.layout} pdf={live.pdf} error={live.error} onRetry={live.retry} onSectionPress={openSection} onError={()=>setViewError(true)}/>}
          <View accessibilityLiveRegion="polite" className="min-h-8 flex-row items-center justify-between gap-2 border-t border-border bg-background px-5 py-1">
            <Text className="text-caption text-muted-foreground">{live.pdf ? `Version ${live.pdf.revision}` : "CV preview"}</Text>
            {editor.saveState === "saving" || live.updating && editor.saveState === "saved" ? <View className="flex-row items-center gap-2"><ActivityIndicator size="small"/><Text className="text-caption text-muted-foreground">Updating preview…</Text></View> : live.error ? <Button variant="ghost" size="sm" onPress={live.retry}><Text className="text-caption text-primary">Retry preview</Text></Button> : !previewCurrent && live.pdf ? <Text className="text-caption text-muted-foreground">Last saved preview</Text> : null}
          </View>
        </View>
        <EditorControlsPanel open={panelOpen} availableHeight={stageHeight} onClose={()=>{Keyboard.dismiss();setPanelOpen(false);}}>
          <View className="gap-2 bg-background px-5 pb-2">
            <View className="flex-row rounded-xl bg-muted p-1">
              {(["Resume Content","Design & Layout","Job Match"] as const).map(tab=>{
                const selected=tab === "Job Match" ? view === "match" : view === "edit" && editSection === tab;
                return <Pressable key={tab} accessibilityRole="tab" accessibilityLabel={tab} accessibilityState={{selected}} onPress={()=>{Keyboard.dismiss();if(tab === "Job Match")setView("match");else{setView("edit");setEditSection(tab);}}} className={cn("min-h-11 min-w-0 flex-1 items-center justify-center rounded-lg px-1 py-2",selected?"bg-primary":"bg-muted")}><Text className={cn("text-caption text-center font-medium",selected?"text-primary-foreground":"text-muted-foreground")}>{tab === "Design & Layout" ? "Design" : tab === "Resume Content" ? "Content" : tab}</Text></Pressable>;
              })}
            </View>
            {view === "match" ? <View className="flex-row border-b border-border bg-background">{secondaryTabs.map(tab=><Pressable key={tab} accessibilityRole="tab" accessibilityLabel={tab} accessibilityState={{selected:selectedSecondary===tab}} onPress={()=>{Keyboard.dismiss();if(tab === "Overview" || tab === "Keyword Highlights")setMatchSection(tab);}} className={cn("min-h-10 flex-1 items-center justify-center border-b-2 bg-background px-1 py-2",selectedSecondary===tab?"border-primary":"border-transparent")}><Text className={cn("text-caption text-center",selectedSecondary===tab?"text-primary":"text-muted-foreground")}>{tab}</Text></Pressable>)}</View> : null}
          </View>
          <View testID="editor-content-controls" className={cn("flex-1 bg-background",view === "edit" && editSection === "Resume Content" ? "flex" : "hidden")}>
            <ScrollView ref={contentScroll} className="flex-1" contentContainerClassName="gap-5 px-5 pb-6" keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"} scrollEventThrottle={16} onLayout={()=>{if(panelOpen)contentScroll.current?.scrollTo({y:listOffset.current,animated:false});}} onScroll={event=>{if(panelOpen && view === "edit" && editSection === "Resume Content" && !activeKey)listOffset.current=Math.max(0,event.nativeEvent.contentOffset.y);}}>
              <ResumeSectionList sections={sections} onOpen={openSection} onActions={setMenuKey} onAdd={()=>setAddingSection(true)}/>
              <Text className="text-caption text-muted-foreground">Your original CV stays unchanged.</Text>
            </ScrollView>
          </View>
          <View testID="editor-design-controls" className={cn("flex-1 bg-background",view === "edit" && editSection === "Design & Layout" ? "flex" : "hidden")}>
            <ScrollView ref={designScroll} className="flex-1" contentContainerClassName="px-5 pb-6" keyboardShouldPersistTaps="handled" scrollEventThrottle={16} onLayout={()=>{if(panelOpen)designScroll.current?.scrollTo({y:designOffset.current,animated:false});}} onScroll={event=>{if(panelOpen && view === "edit" && editSection === "Design & Layout")designOffset.current=Math.max(0,event.nativeEvent.contentOffset.y);}}><DesignLayout layout={editor.layout} options={document.layout_options} onChange={editor.updateLayout} onReload={()=>void editor.reload()}/></ScrollView>
          </View>
          <View testID="editor-match-controls" className={cn("flex-1 bg-background",view === "match" ? "flex" : "hidden")}>
            <ScrollView ref={matchScroll} className="flex-1" contentContainerClassName="px-5 pb-6" keyboardShouldPersistTaps="handled" scrollEventThrottle={16} onLayout={()=>{if(panelOpen)matchScroll.current?.scrollTo({y:matchOffset.current,animated:false});}} onScroll={event=>{if(panelOpen && view === "match")matchOffset.current=Math.max(0,event.nativeEvent.contentOffset.y);}}><JobMatch section={matchSection === "Overview" ? "overview" : "highlights"} analysis={editor.analysis} revision={document.revision} dirty={editor.saveState !== "saved"} loading={editor.analysisLoading} jobDescription={document.job.description} confirmedSkills={editor.confirmedSkills} onRefresh={()=>void editor.refreshAnalysis()} onAddSkill={addSkill} onEdit={openSection}/></ScrollView>
          </View>
        </EditorControlsPanel>
      </View>
      <View className="border-t border-border bg-background px-5 pt-3" style={{paddingBottom:Math.max(insets.bottom,16)}}><Button disabled={!previewCurrent || sharing} onPress={()=>void download()} className="min-h-12 flex-row gap-2 rounded-xl">{sharing ? <ActivityIndicator/> : <LucideIcon name="Download" size={20} className="text-primary-foreground"/>}<Text>{sharing ? "Opening…" : "Download PDF"}</Text></Button></View>
      {section ? <SectionEditor section={section} saveLabel={statusLabels[editor.saveState]} onChange={(value:JsonValue)=>{if(editor.resume) editor.updateResume(withSectionMetadata(replaceSection(editor.resume,section.key,value)));}} onClose={closeSection} onRename={name=>rename(section.key,name)} actions={actionsFor(section)}/> : null}
    </>}
    {menuSection ? <SectionActionsMenu key={menuSection.key} actions={actionsFor(menuSection)} onClose={()=>setMenuKey(null)}/> : null}
    {renameKey && sections.some(s=>s.key === renameKey) ? <RenameSectionSheet key={renameKey} name={sections.find(s=>s.key === renameKey)!.label} onSave={name=>{rename(renameKey,name);setRenameKey(null);}} onClose={()=>setRenameKey(null)}/> : null}
    {addingSection || pendingSection.current ? <AddCustomSectionSheet visible={addingSection} onCreate={(name,type)=>{
      if (!editor.resume) return;
      const result=addCustomSection(editor.resume,name,type);
      editor.updateResume(result.resume);
      returnOffset.current=listOffset.current;
      if (Platform.OS === "ios") pendingSection.current=result.key;
      else setActiveKey(result.key);
      setAddingSection(false);
    }} onDismiss={openCreatedSection} onClose={()=>setAddingSection(false)}/> : null}
    <AccountSheet visible={showSignIn} onClose={()=>{setShowSignIn(false);void editor.reload();}}/>
  </AppScreen>;
}
