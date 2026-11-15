import { useState } from "react";
import { ActivityIndicator, View, type DimensionValue } from "react-native";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { KeywordHighlights } from "./KeywordHighlights";
import type { JsonObject } from "@/lib/tailoring/types";
import type { KeywordHistory } from "@/lib/editor/keywordHighlights";
import type { EditorAnalysis } from "@/lib/editor/types";

export type JobMatchProps = {
  section?: "overview" | "highlights";
  analysis: EditorAnalysis | null;
  revision: number;
  dirty: boolean;
  loading: boolean;
  error?: string | null;
  template?: string;
  jobDescription: string;
  savedResume?: JsonObject;
  history?: KeywordHistory | null;
  historyLoading?: boolean;
  historyError?: boolean;
  onRetryHistory?: () => void;
  confirmedSkills: string[];
  onRefresh: () => void;
  onAddSkill: (skill: string) => void;
  onEdit: (section: string) => void;
};

// Keep the engine's five categories in the reference order, including unavailable metrics.
const metrics = [
  { label: "Keyword Match", keys: ["keyword_match", "keyword_coverage", "keywords"] },
  { label: "Skills Coverage", keys: ["skills_coverage", "skills", "skills_match", "skill_match", "skill_coverage"] },
  { label: "Title Match", keys: ["title_match", "title_alignment", "title"] },
  { label: "Section Completeness", keys: ["section_completeness", "sections"] },
  { label: "Date Consistency", keys: ["date_consistency", "dates"] },
] as const;

// Use the same bands and template classification as the existing engine UI.
const tone = (value: number | null) => value === null
  ? { text: "text-muted-foreground", fill: "bg-muted" }
  : value >= 80 ? { text: "text-success", fill: "bg-success" }
  : value >= 60 ? { text: "text-score-moderate", fill: "bg-score-moderate" }
  : { text: "text-score-low", fill: "bg-destructive" };
const twoColumnTemplates = ["swiss-two-column", "modern-two-column", "vivid", "deedy"];
const tips = [
  "Add relevant keywords only when they accurately reflect your experience.",
  "Focus on the technical skills and tools mentioned in the job description.",
  "Use accurate action verbs to describe what you did.",
];

export function JobMatch({ section = "overview", analysis, revision, dirty, loading, error, template, jobDescription, savedResume, history = null, historyLoading, historyError, onRetryHistory, confirmedSkills, onRefresh, onAddSkill, onEdit }: JobMatchProps) {
  const [showSkillChoices, setShowSkillChoices] = useState(false);
  const current = !dirty && analysis?.status === "current" && analysis.revision === revision;
  const score = analysis?.score;
  const overall = score?.overall_score ?? null;
  const subScores = score?.sub_scores ?? {};
  const recommendations = score?.recommendations ?? [];
  const confirmed = new Set(confirmedSkills.map(skill => skill.toLocaleLowerCase()));
  const required = new Set(analysis?.required_skills?.map(skill => skill.toLocaleLowerCase()));
  const skillTerms = new Set([...(analysis?.required_skills ?? []), ...(analysis?.preferred_skills ?? [])].map(skill => skill.toLocaleLowerCase()));
  const missing = [...new Set(analysis?.missing_keywords ?? [])];
  const missingSkills = missing.filter(skill => skillTerms.has(skill.toLocaleLowerCase()));
  const layoutWarning = !!template && twoColumnTemplates.includes(template);
  const bar = (label: string, value: number | null) => <View accessible accessibilityRole="progressbar" accessibilityLabel={label} accessibilityValue={value === null ? { text: "Unavailable" } : { min: 0, max: 100, now: value, text: value + "%" }} className="h-1.5 w-full overflow-hidden border border-foreground/40 bg-background">
    {value !== null && value > 0 ? <View testID="score-bar-fill" className={"h-full " + tone(value).fill} style={{ width: (Math.min(100, Math.max(0, value)) + "%") as DimensionValue }} /> : null}
  </View>;
  const bullets = (items: string[]) => <View className="gap-2">{items.map((item, index) => <View key={index + "-" + item} className="flex-row items-start gap-2"><Text className="text-body leading-6 text-foreground">•</Text><Text className="min-w-0 flex-1 text-body leading-6 text-foreground">{item}</Text></View>)}</View>;

  return <View className="gap-3">
    {section === "overview" ? <>
      <View className="gap-5 rounded border border-foreground/25 bg-card p-4">
        <View className="gap-3">
          <View className="flex-row items-center justify-between gap-2">
            <Text accessibilityRole="header" className="min-w-0 flex-1 text-h5 leading-6 text-foreground">ATS Score Breakdown</Text>
            <View className="shrink-0 flex-row items-baseline gap-1" accessibilityLabel={overall === null ? "Overall score unavailable" : "Overall score " + overall + " out of 100"}>
              <Text className={"text-h3 " + tone(overall).text}>{overall === null ? "Unavailable" : overall}</Text>{overall !== null ? <Text className="text-caption text-muted-foreground">/ 100</Text> : null}
            </View>
          </View>
          {bar("Overall score", overall)}
          {score && analysis && !current ? <Text className="text-caption leading-5 text-muted-foreground">Previous result for version {analysis.revision}. Update Match to include your edits.</Text> : null}
          <View className="gap-4 pt-1">{metrics.map(metric => {
            const key = metric.keys.find(key => key in subScores);
            const value = key ? subScores[key] ?? null : null;
            return <View key={metric.label} className="gap-1.5">
              <View className="flex-row items-center justify-between gap-3"><Text className="min-w-0 flex-1 text-caption leading-5 text-foreground">{metric.label}</Text><Text className={"shrink-0 text-caption font-semibold " + tone(value).text}>{value === null ? "Unavailable" : value + "%"}</Text></View>
              {bar(metric.label, value)}
            </View>;
          })}</View>
        </View>
        {layoutWarning ? <View testID="ats-layout-warning" className="border border-warning/80 bg-warning/5 px-3 py-3"><Text className="text-caption leading-5 text-foreground">Two-column layout: some ATS parsers may read columns out of order. Choose a single-column template in the editor before applying.</Text></View> : null}
        <View className="gap-2.5">
          <Text accessibilityRole="header" className="text-h6 text-foreground">Missing Keywords</Text>
          {!current && missing.length > 0 ? <Text className="text-caption leading-5 text-muted-foreground">These suggestions are from the previous analysis. Update Match to include your edits.</Text> : null}
          {missing.length > 0 ? <View className="flex-row flex-wrap items-start gap-1.5">{missing.map(skill => <View key={skill} testID="missing-keyword-chip" className="max-w-full shrink rounded-sm border border-score-low/75 bg-score-low/5 px-2 py-1"><Text selectable accessibilityLabel={required.has(skill.toLocaleLowerCase()) ? skill + ". Required in job." : skill} className="shrink text-caption leading-5 text-score-low web:break-words">{skill}</Text></View>)}</View> : <Text className="text-body leading-6 text-muted-foreground">{current ? "No missing keywords were reported." : "Update Match to see keyword suggestions."}</Text>}
          {missingSkills.length > 0 ? <>
            <Button variant="ghost" size="sm" accessibilityState={{ expanded: showSkillChoices }} className="min-h-11 native:min-h-[44px] max-w-full self-start px-0" onPress={() => setShowSkillChoices(value => !value)}><Text className="text-caption text-primary">{showSkillChoices ? "Hide skill choices" : "Add skills I have"}</Text></Button>
            {showSkillChoices ? <View className="gap-3 border-t border-border pt-3">
              <Text className="text-caption leading-5 text-muted-foreground">Include only skills and qualifications you have. Other job keywords belong in your experience only where they accurately fit.</Text>
              {missingSkills.map(skill => <View key={skill} className="gap-2"><Text className="text-body text-foreground">{skill}</Text>{confirmed.has(skill.toLocaleLowerCase()) ? <Text className="text-caption leading-5 text-muted-foreground">You previously confirmed this skill. It is missing from this version’s analysis.</Text> : null}<Button variant="secondary" size="sm" className="min-h-11 native:min-h-[44px] max-w-full self-start" onPress={() => onAddSkill(skill)} accessibilityLabel={"I have " + skill + ", add to Skills"}><Text className="shrink text-caption">{confirmed.has(skill.toLocaleLowerCase()) ? "Add to Skills" : "I have this · Add to Skills"}</Text></Button></View>)}
            </View> : null}
          </> : null}
        </View>
        <View className="gap-2.5">
          <Text accessibilityRole="header" className="text-h6 text-foreground">Recommendations</Text>
          {!current && recommendations.length > 0 ? <Text className="text-caption leading-5 text-muted-foreground">Recommendations from the previous analysis.</Text> : null}
          {recommendations.length > 0 ? <>{bullets(recommendations)}<View className="flex-row flex-wrap gap-2 pt-1"><Button variant="outline" size="sm" className="min-h-11 native:min-h-[44px]" onPress={() => onEdit("workExperience")}><Text className="text-caption">Edit experience</Text></Button><Button variant="outline" size="sm" className="min-h-11 native:min-h-[44px]" onPress={() => onEdit("skills")}><Text className="text-caption">Edit skills</Text></Button></View></> : <Text className="text-body leading-6 text-muted-foreground">{current ? "No recommendations were reported." : "Update Match to see recommendations."}</Text>}
        </View>
        <View className="gap-3 border-t border-border pt-3">
          <View className="flex-row flex-wrap items-center justify-between gap-2"><Text className={current ? "text-caption text-success" : "text-caption text-muted-foreground"}>{current ? "Up to date" : score ? "Needs updating" : analysis?.status === "unavailable" ? "Unavailable" : "Not calculated"}</Text>{score && analysis ? <Text className="text-caption text-muted-foreground">{current ? "Saved" : "Previous result for"} version {analysis.revision}</Text> : null}</View>
          {score && analysis ? <Text className="text-caption text-muted-foreground">{analysis.matched_count} of {analysis.total_keywords} keywords matched</Text> : null}
          {!current ? <Text className="text-caption leading-5 text-muted-foreground">{analysis?.status === "unavailable" ? analysis.reason || "Job-match analysis is unavailable for this CV." : "Update Match to include your latest saved changes. Updating does not generate another CV."}</Text> : null}
          <Button disabled={loading} onPress={onRefresh} variant="outline" className="min-h-11 native:min-h-[44px]">{loading ? <ActivityIndicator accessibilityLabel="Updating job match" /> : <Text>{dirty ? "Save & Update Match" : "Update Match"}</Text>}</Button>
          {error ? <Text accessibilityRole="alert" className="text-body text-destructive">{error}</Text> : null}
        </View>
      </View>
      <View className="gap-2 rounded border border-foreground/25 bg-card p-4"><Text accessibilityRole="header" className="text-h6 text-foreground">About JD Match</Text><Text className="text-body leading-6 text-foreground">Job Match compares your resume with the job description to show where your skills and experience align. Scores are estimates and don’t predict an employer’s decision.</Text></View>
      <View className="gap-2 rounded border border-foreground/25 bg-card p-4"><Text accessibilityRole="header" className="text-h6 text-foreground">Tips</Text>{bullets(tips)}</View>
    </> : null}
    {section === "highlights" ? savedResume ? <KeywordHighlights resume={savedResume} keywords={[...(analysis?.matched_keywords ?? []), ...(analysis?.missing_keywords ?? []), ...(analysis?.required_skills ?? []), ...(analysis?.preferred_skills ?? [])]} jobDescription={jobDescription} history={history} historyLoading={historyLoading} historyError={historyError} onRetry={onRetryHistory} /> : <Text className="text-body leading-6 text-muted-foreground">The saved resume could not be loaded. Return to Edit Resume and try again.</Text> : null}
  </View>;
}
