import { useState } from "react";
import { ActivityIndicator, Keyboard, Pressable, ScrollView, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppScreen } from "@/components/layout/AppScreen";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/cv/Notice";
import { AccountSheet } from "@/components/cv/AccountSheet";
import { JobMatch } from "@/components/editor/JobMatch";
import LucideIcon from "@/lib/icons/LucideIcon";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useKeywordHistory } from "@/lib/editor/useKeywordHistory";
import { useCvEditor } from "@/lib/editor/useCvEditor";
import { emptyWorkspace } from "@/lib/editor/session";
import { replaceSection, resumeSections, withSectionMetadata } from "@/components/editor/sections";
import { isJsonObject } from "@/lib/tailoring/types";
import { cn } from "@/lib/utils";

export default function JobMatchScreen() {
  const { id, editorReturnTo } = useLocalSearchParams<{ id?: string | string[]; editorReturnTo?: string }>();
  const { session } = useAuth();
  const insets = useSafeAreaInsets();
  const editor = useCvEditor(id);
  const document = editor.document;
  const workspace = editor.workspace ?? emptyWorkspace();
  const keywordHistory = useKeywordHistory(session?.user.id, document?.tailoring_id, workspace.matchSection === "highlights");
  const sections = editor.resume ? resumeSections(editor.resume) : [];
  const [showSignIn, setShowSignIn] = useState(false);
  const back = () => {
    Keyboard.dismiss();
    if (router.canGoBack()) router.back();
    else if (document) router.replace({ pathname: "/cv-editor/[id]", params: { id: document.tailoring_id, ...(editorReturnTo === "library" || editorReturnTo === "tailor" ? { returnTo: editorReturnTo } : {}) } });
    else router.replace("/(tabs)/library/tailored-cvs");
  };
  const openSection = (key: string) => {
    const found = sections.find(s => key === "skills" ? /^(additional|technicalSkills|professionalSkills|skills)$/.test(s.key) : key === "workExperience" ? /workExperience|experience$/.test(s.key) : s.key === key);
    if (!found) return;
    editor.updateWorkspace({ tool: "content", trayOpen: true, panelHeight: workspace.panelHeight || 190, sectionKey: found.key, fieldPath: null, fieldLabel: null });
    back();
  };
  const addSkill = (skill: string) => {
    if (!editor.resume || !document) return;
    const skillsSection = sections.find(s => s.key === "additional" || /technicalSkills|professionalSkills|skills$/i.test(s.key) && Array.isArray(s.value));
    const skills = skillsSection?.key === "additional" && isJsonObject(skillsSection.value) ? skillsSection.value.technicalSkills : skillsSection?.value;
    const current = Array.isArray(skills) ? skills : [];
    const key = skillsSection?.key === "additional" ? "additional.technicalSkills" : skillsSection?.key ?? "additional.technicalSkills";
    let next = current.some(v => typeof v === "string" && v.toLocaleLowerCase() === skill.toLocaleLowerCase()) ? editor.resume : replaceSection(editor.resume, key, [...current, skill]);
    if (Array.isArray(next.sectionMeta)) next = { ...next, sectionMeta: next.sectionMeta.map(meta => isJsonObject(meta) && (meta.key === key || meta.key === key.split(".").pop() || key.startsWith("additional.") && meta.key === "additional") ? { ...meta, isVisible: true } : meta) };
    editor.updateResume(withSectionMetadata(next), Array.from(new Set([...editor.confirmedSkills, skill])));
  };

  return <AppScreen>
    <View className="h-14 native:h-[56px] shrink-0 flex-row items-center gap-1 border-b border-border bg-background px-2">
      <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0 native:h-[44px] native:w-[44px]" accessibilityLabel="Back to Edit Resume" onPress={back}><LucideIcon name="ChevronLeft" size={22} className="text-foreground" /></Button>
      <Text accessibilityRole="header" className="text-editor-title text-foreground">Job Match</Text>
    </View>
    {editor.loading ? <View className="flex-1 items-center justify-center gap-4 bg-background"><ActivityIndicator /><Text className="text-body text-muted-foreground">Opening your saved CV…</Text></View>
      : !document || !editor.resume || editor.error ? <View className="flex-1 justify-center gap-4 bg-background px-6">
        <Notice tone="error" message={editor.error ?? "This CV could not be opened."} />
        {!editor.routeError ? <Button onPress={() => session && editor.accessStatus !== 401 ? void editor.reload() : setShowSignIn(true)}><Text>{session && editor.accessStatus !== 401 ? "Try again" : "Sign in"}</Text></Button> : null}
        <Button variant="outline" onPress={back}><Text>Back to Edit Resume</Text></Button>
      </View>
      : <View className="flex-1 bg-background">
        {editor.problem ? <View className="gap-2 bg-background px-4 py-3"><Notice tone="error" message={editor.problem} />{editor.saveState !== "conflict" ? <Button variant="outline" size="sm" className="min-h-11 native:min-h-[44px]" onPress={() => void editor.flush()}><Text>Retry saving</Text></Button> : null}</View> : null}
        {editor.saveState === "conflict" ? <View className="gap-2 border-b border-border bg-background px-4 py-3"><Text className="text-caption text-foreground">A newer version is saved. Choose how to continue; your layout trial stays here.</Text><View className="flex-row gap-2"><Button className="min-h-11 native:min-h-[44px] flex-1" onPress={() => void editor.resolveConflict("local")}><Text>Keep my edits</Text></Button><Button variant="outline" className="min-h-11 native:min-h-[44px] flex-1" onPress={() => void editor.resolveConflict("server")}><Text>Use saved content</Text></Button></View></View> : null}
        <View accessibilityRole="tablist" className="flex-row border-b border-border bg-background px-3">
          {([["overview", "Overview"], ["highlights", "Keyword Highlights"]] as const).map(([key, label]) => <Pressable key={key} accessibilityRole="tab" accessibilityLabel={label} accessibilityState={{ selected: workspace.matchSection === key }} onPress={() => editor.updateWorkspace({ matchSection: key })} className={cn("min-h-11 native:min-h-[44px] flex-1 items-center justify-center border-b-2 bg-background px-1", workspace.matchSection === key ? "border-primary" : "border-transparent")}><Text className={cn("text-caption", workspace.matchSection === key ? "text-primary" : "text-muted-foreground")}>{label}</Text></Pressable>)}
        </View>
        <ScrollView className="flex-1 bg-background" contentContainerClassName="px-4 pt-3" contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 24) }} keyboardShouldPersistTaps="handled">
          <JobMatch savedResume={document.resume} history={keywordHistory.history} historyLoading={keywordHistory.historyLoading} historyError={keywordHistory.historyError} onRetryHistory={keywordHistory.retryHistory} template={editor.layoutDraft?.template ?? editor.layout?.template ?? document.layout?.template} section={workspace.matchSection} analysis={editor.analysis} revision={document.revision} dirty={editor.saveState !== "saved"} loading={editor.analysisLoading} jobDescription={document.job.description} confirmedSkills={editor.confirmedSkills} onRefresh={() => void editor.refreshAnalysis()} onAddSkill={addSkill} onEdit={openSection} />
        </ScrollView>
      </View>}
    <AccountSheet visible={showSignIn} onClose={() => { setShowSignIn(false); void editor.reload(); }} />
  </AppScreen>;
}
