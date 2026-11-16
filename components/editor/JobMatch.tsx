import LucideIcon from "@/lib/icons/LucideIcon";
import { overviewRecommendations } from "@/lib/editor/recommendations";
import { isJsonObject } from "@/lib/tailoring/types";
import { useState } from "react";
import { ActivityIndicator, Pressable, View, type DimensionValue } from "react-native";
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
  onRefresh: () => void;
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
const tips = [
  "Add relevant keywords only when they accurately reflect your experience.",
  "Focus on the technical skills and tools mentioned in the job description.",
  "Use accurate action verbs to describe what you did.",
];

export function JobMatch({ section = "overview", analysis, revision, dirty, loading, error, jobDescription, savedResume, history = null, historyLoading, historyError, onRetryHistory, onRefresh, onEdit }: JobMatchProps) {
  const [showHelp, setShowHelp] = useState(false);
  const current = !dirty && analysis?.status === "current" && analysis.revision === revision;
  const score = analysis?.score;
  const overall = score?.overall_score ?? null;
  const subScores = score?.sub_scores ?? {};
  const required = new Set(analysis?.required_skills?.map(skill => skill.toLocaleLowerCase()));
  const missing = [...new Set(analysis?.missing_keywords ?? [])];
  const recommendations = overviewRecommendations(score?.recommendations ?? [], missing);
  const profileKey = ["personalInfo", "personalInformation"].find(key => isJsonObject(savedResume?.[key]) && ["title", "professionalTitle", "professional_title"].some(field => typeof (savedResume?.[key] as JsonObject)?.[field] === "string"));
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
          <View testID="match-results-status" className="gap-2">
            <View className="flex-row flex-wrap items-center justify-between gap-2">
              <Text accessibilityLiveRegion="polite" className={"min-w-0 shrink text-caption leading-5 " + (current ? "text-success" : "text-muted-foreground")}>{score ? current ? "Up to date" : "Results out of date" : analysis?.status === "unavailable" ? "Unavailable" : "Not calculated"}</Text>
              {!current || loading || error ? <Button disabled={loading} onPress={onRefresh} variant="outline" size="sm" accessibilityLabel={error ? "Retry Update Match" : "Update Match"} className="min-h-11 native:min-h-[44px] shrink-0 px-3">{loading ? <ActivityIndicator accessibilityLabel="Updating job match" /> : null}<Text className="text-caption">{loading ? "Updating…" : error ? "Retry" : "Update Match"}</Text></Button> : null}
            </View>
            {score && analysis ? <Text className="text-caption text-muted-foreground">{analysis.matched_count} of {analysis.total_keywords} keywords matched</Text> : null}
            {!score && analysis?.status === "unavailable" ? <Text className="text-caption leading-5 text-muted-foreground">{analysis.reason || "Job-match analysis is unavailable for this CV."}</Text> : null}
            {error ? <Text accessibilityRole="alert" className="text-caption leading-5 text-destructive">{error}</Text> : null}
          </View>
          <View className="gap-4 pt-1">{metrics.map(metric => {
            const key = metric.keys.find(key => key in subScores);
            const value = key ? subScores[key] ?? null : null;
            return <View key={metric.label} className="gap-1.5">
              <View className="flex-row items-center justify-between gap-3"><Text className="min-w-0 flex-1 text-caption leading-5 text-foreground">{metric.label}</Text><Text className={"shrink-0 text-caption font-semibold " + tone(value).text}>{value === null ? "Unavailable" : value + "%"}</Text></View>
              {bar(metric.label, value)}
            </View>;
          })}</View>
        </View>
        <View className="gap-2.5">
          <Text accessibilityRole="header" className="text-h6 text-foreground">Missing Keywords</Text>
          {missing.length > 0 ? <View className="flex-row flex-wrap items-start gap-1.5">{missing.map(skill => <View key={skill} testID="missing-keyword-chip" className="max-w-full shrink rounded-sm border border-score-low/75 bg-score-low/5 px-2 py-1"><Text selectable accessibilityLabel={required.has(skill.toLocaleLowerCase()) ? skill + ". Required in job." : skill} className="shrink text-caption leading-5 text-score-low web:break-words">{skill}</Text></View>)}</View> : <Text className="text-body leading-6 text-muted-foreground">{score ? "No missing keywords were reported." : "No keyword results yet."}</Text>}
        </View>
        <View className="gap-2.5">
          <Text accessibilityRole="header" className="text-h6 text-foreground">Recommendations</Text>
          {recommendations.length > 0 ? <View className="gap-3">{recommendations.map(item => <View key={item.text} className="gap-1"><View className="flex-row items-start gap-2"><Text className="text-body leading-6 text-foreground">•</Text><Text className="min-w-0 flex-1 text-body leading-6 text-foreground">{item.text}</Text></View>{item.headline && profileKey ? <Button variant="ghost" size="sm" className="min-h-11 native:min-h-[44px] self-start px-0" onPress={() => onEdit(profileKey)}><Text className="text-caption text-primary">Edit headline</Text></Button> : null}</View>)}</View> : <Text className="text-body leading-6 text-muted-foreground">{score ? "No additional suggestions." : "No recommendations yet."}</Text>}
        </View>
      </View>
      <View className="overflow-hidden rounded border border-border bg-card">
        <Pressable accessibilityRole="button" accessibilityLabel="About Job Match" accessibilityState={{ expanded: showHelp }} onPress={() => setShowHelp(value => !value)} className="min-h-12 flex-row items-center gap-2 bg-card px-4 py-3"><Text className="flex-1 text-h6 text-foreground">About Job Match</Text><LucideIcon name={showHelp ? "ChevronUp" : "ChevronDown"} size={17} className="text-muted-foreground" /></Pressable>
        {showHelp ? <View className="gap-4 border-t border-border px-4 py-4"><Text className="text-body leading-6 text-foreground">Job Match compares your resume with the job description to show where your skills and experience align. Scores are estimates and don’t predict an employer’s decision.</Text>{bullets(tips)}</View> : null}
      </View>
    </> : null}
    {section === "highlights" ? savedResume ? <KeywordHighlights resume={savedResume} keywords={[...(analysis?.matched_keywords ?? []), ...(analysis?.missing_keywords ?? []), ...(analysis?.required_skills ?? []), ...(analysis?.preferred_skills ?? [])]} jobDescription={jobDescription} history={history} historyLoading={historyLoading} historyError={historyError} onRetry={onRetryHistory} /> : <Text className="text-body leading-6 text-muted-foreground">The saved resume could not be loaded. Return to Edit Resume and try again.</Text> : null}
  </View>;
}
