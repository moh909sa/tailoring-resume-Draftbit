import { useState, type ReactNode } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import Icon from "@/lib/icons/LucideIcon";
import type { EditorAnalysis } from "@/lib/editor/types";

export type JobMatchProps = {
  section?: "overview" | "highlights";
  analysis: EditorAnalysis | null;
  revision: number;
  dirty: boolean;
  loading: boolean;
  error?: string | null;
  jobDescription: string;
  confirmedSkills: string[];
  onRefresh: () => void;
  onAddSkill: (skill: string) => void;
  onEdit: (section: string) => void;
};
const metricNames: Record<string, string> = {
  keyword_match: "Job keywords", keyword_coverage: "Job keywords", keywords: "Job keywords",
  skills_coverage: "Skills alignment", skills: "Skills alignment", skills_match: "Skills alignment", skill_match: "Skills alignment", skill_coverage: "Skills alignment",
  title_alignment: "Role alignment", title_match: "Role alignment", title: "Role alignment",
  section_completeness: "Section completeness", sections: "Section completeness",
  date_consistency: "Date consistency", dates: "Date consistency",
};
export function JobMatch({ section = "overview", analysis, revision, dirty, loading, error, jobDescription, confirmedSkills, onRefresh, onAddSkill, onEdit }: JobMatchProps) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [highlightView, setHighlightView] = useState<"resume" | "job">("resume");
  const current = !dirty && analysis?.status === "current" && analysis.revision === revision;
  const score = analysis?.score;
  // Preserve the engine's percentage and precision, rather than deriving a ratio.
  const keywordPercentage = score?.sub_scores.keyword_match;
  const confirmed = new Set(confirmedSkills.map(skill => skill.toLocaleLowerCase()));
  const required = new Set(analysis?.required_skills.map(skill => skill.toLocaleLowerCase()));
  const skillTerms = new Set([...(analysis?.required_skills ?? []), ...(analysis?.preferred_skills ?? [])].map(skill => skill.toLocaleLowerCase()));
  const missing = [...new Set(analysis?.missing_keywords ?? [])];
  const disclosure = (key: string, title: string, children: ReactNode) => (
    <View className="overflow-hidden rounded-2xl border border-border bg-card">
      <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ expanded: !!open[key] }} onPress={() => setOpen(value => ({ ...value, [key]: !value[key] }))} className="min-h-16 flex-row items-center justify-between gap-3 px-5 py-4">
        <Text className="flex-1 text-h5 text-foreground">{title}</Text><Icon name={open[key] ? "ChevronUp" : "ChevronDown"} className="h-5 w-5 text-muted-foreground" />
      </Pressable>
      {open[key] ? <View className="gap-4 border-t border-border px-5 py-4">{children}</View> : null}
    </View>
  );
  return <View className="gap-4">
    {section === "overview" ? <>
    <View className="gap-4 rounded-2xl border border-border bg-card p-5">
      <View className="flex-row items-center justify-between gap-3"><Text className="text-h4 text-foreground">Job Match</Text><Text className={current ? "text-caption text-success" : "text-caption text-muted-foreground"}>{current ? "Up to date" : score ? "Needs updating" : analysis?.status === "unavailable" ? "Unavailable" : "Not calculated"}</Text></View>
      <View className="gap-1"><Text className="text-caption text-muted-foreground">Overall score</Text><View className="flex-row items-end gap-2"><Text className="text-h1 text-foreground">{score ? score.overall_score : "—"}</Text><Text className="pb-1 text-body text-muted-foreground">/ 100</Text></View></View>
      <View className="flex-row gap-4 border-t border-border pt-4">
        <View className="flex-1 gap-1"><Text className="text-caption text-muted-foreground">Keywords matched</Text><Text className="text-h3 text-foreground">{score && analysis ? `${analysis.matched_count} of ${analysis.total_keywords}` : "—"}</Text></View>
        <View className="flex-1 gap-1"><Text className="text-caption text-muted-foreground">Keyword match</Text><Text className="text-h3 text-foreground">{keywordPercentage == null ? "—" : `${keywordPercentage}%`}</Text></View>
      </View>
      {score && analysis ? <Text className="text-caption text-muted-foreground">{current ? "Saved" : "Previous result for"} version {analysis.revision}</Text> : null}
      <Text className="text-body leading-6 text-muted-foreground">{current ? "How closely your saved CV reflects this job. Review the details below to see where to focus." : analysis?.status === "unavailable" ? analysis.reason || "Job-match analysis is unavailable for this CV." : "Update Match to include your latest saved changes. Updating does not generate another CV."}</Text>
      <Button disabled={loading} onPress={onRefresh} className="rounded-xl">{loading ? <ActivityIndicator accessibilityLabel="Updating job match" /> : <Text>{dirty ? "Save & Update Match" : "Update Match"}</Text>}</Button>
      {error ? <Text accessibilityRole="alert" className="text-body text-destructive">{error}</Text> : null}
    </View>
    </> : null}
    {section === "highlights" ? <View className="gap-4 rounded-2xl border border-border bg-card p-5">
      <Text accessibilityRole="header" className="text-h4 text-foreground">Keyword Highlights</Text>
      <View className="flex-row rounded-xl bg-muted p-1">{(["resume", "job"] as const).map(tab => <Pressable key={tab} accessibilityRole="tab" accessibilityState={{ selected: highlightView === tab }} onPress={() => setHighlightView(tab)} className={`min-h-11 flex-1 items-center justify-center rounded-lg ${highlightView === tab ? "bg-card" : "bg-muted"}`}><Text className={highlightView === tab ? "text-caption text-foreground" : "text-caption text-muted-foreground"}>{tab === "resume" ? "Your Resume" : "Job Description"}</Text></Pressable>)}</View>
      <View className="flex-row flex-wrap gap-3">
        <View className="flex-row items-center gap-2"><View className="h-3 w-3 rounded-sm bg-warning" /><Text className="text-caption text-foreground">Yellow: matched keywords</Text></View>
        <View className="flex-row items-center gap-2"><View className="h-3 w-3 rounded-sm bg-tertiary" /><Text className="text-caption text-foreground">Blue: keywords you added</Text></View>
      </View>
      <Text className="text-caption leading-5 text-muted-foreground">Exact text locations and added-keyword highlights aren’t available for this saved CV. Your PDF stays unchanged.</Text>
      {highlightView === "resume" ? <>
        <Text className="text-body font-semibold text-foreground">Matched keywords in your saved resume</Text>
        {!current ? <Text className="text-body leading-6 text-muted-foreground">Update Match to verify the keywords in your latest saved CV.</Text> : analysis?.matched_keywords.length ? <View className="rounded-xl bg-warning/15 p-3"><Text selectable className="text-body leading-7 text-foreground">{analysis.matched_keywords.join(" · ")}</Text></View> : <Text className="text-body text-muted-foreground">No matched keywords were reported.</Text>}
      </> : <><Text className="text-body font-semibold text-foreground">Job Description</Text><Text selectable className="text-body leading-6 text-muted-foreground">{jobDescription || "The job description is unavailable for this CV."}</Text></>}
    </View> : null}
    {section === "overview" ? <>
    {disclosure("breakdown", "ATS Score Breakdown", <>
      {!current && score ? <Text className="text-caption text-muted-foreground">Previous analysis. Update Match to include your edits.</Text> : null}
      {score && Object.keys(score.sub_scores).length ? Object.entries(score.sub_scores).map(([key, value]) => <View key={key} className="flex-row items-center justify-between gap-4 py-1"><Text className="flex-1 text-body text-muted-foreground">{metricNames[key] ?? key.replace(/_/g, " ").replace(/^./, c => c.toUpperCase())}</Text><Text className="text-body text-foreground">{value === null ? "Not available" : `${value} / 100`}</Text></View>) : <Text className="text-body text-muted-foreground">Update Match to see the score breakdown.</Text>}
    </>)}
    {disclosure("missing", "Missing Keywords", <>
      <Text className="text-body leading-6 text-muted-foreground">Suggestions to review, not requirements to add. Include only skills and qualifications you have.</Text>
      {!current && missing.length ? <Text className="text-caption text-muted-foreground">These suggestions are from the previous analysis.</Text> : null}
      {missing.length ? missing.map((skill, index) => {
        const added = confirmed.has(skill.toLocaleLowerCase());
        return <View key={skill} className={`gap-2 py-3 ${index ? "border-t border-border" : ""}`}>
          <View className="flex-row items-center justify-between gap-3"><Text className="flex-1 text-body text-foreground">{skill}</Text>{required.has(skill.toLocaleLowerCase()) ? <Text className="text-caption text-muted-foreground">Required in job</Text> : null}</View>
          {skillTerms.has(skill.toLocaleLowerCase()) ? <View className="gap-2">{added ? <Text className="text-caption text-muted-foreground">You previously confirmed this skill. It is missing from this version’s analysis.</Text> : null}<Button variant="secondary" size="sm" className="self-start rounded-lg" onPress={() => onAddSkill(skill)} accessibilityLabel={`I have ${skill}, add to Skills`}><Text>{added ? "Add to Skills" : "I have this · Add to Skills"}</Text></Button></View> : <Text className="text-caption leading-5 text-muted-foreground">Job keyword · use this wording in your experience only where it accurately fits.</Text>}
        </View>;
      }) : <Text className="text-body text-muted-foreground">{current ? "No missing keywords were reported." : "Update Match to see keyword suggestions."}</Text>}
    </>)}
    {disclosure("recommendations", "Recommendations", <>
      {!current && score ? <Text className="text-caption text-muted-foreground">Recommendations from the previous analysis.</Text> : null}
      {score?.recommendations.length ? <>
        {score.recommendations.map((recommendation, index) => <Text key={`${index}-${recommendation}`} className="text-body leading-6 text-muted-foreground">{recommendation}</Text>)}
        <View className="flex-row flex-wrap gap-2"><Button variant="outline" size="sm" onPress={() => onEdit("workExperience")}><Text>Edit experience</Text></Button><Button variant="outline" size="sm" onPress={() => onEdit("skills")}><Text>Edit skills</Text></Button></View>
      </> : <Text className="text-body text-muted-foreground">{current ? "No recommendations were reported." : "Update Match to see recommendations."}</Text>}
    </>)}
    {disclosure("about", "About Job Match & Tips", <>
      <Text className="text-body leading-6 text-muted-foreground">Job Match estimates how your CV aligns with this job. It does not predict an employer’s decision or guarantee a result from their screening system.</Text>
      <Text className="text-body leading-6 text-muted-foreground">Keep your experience accurate, describe specific achievements, and use relevant job wording where it fits. Save your edits and update the match to review the latest version.</Text>
      <Text className="text-body leading-6 text-muted-foreground">PDF readability is checked separately in Resume Preview.</Text>
    </>)}
    </> : null}
  </View>;
}
