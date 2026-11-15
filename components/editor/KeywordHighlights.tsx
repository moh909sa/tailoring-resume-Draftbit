import { useMemo } from "react";
import { View } from "react-native";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { resumeSections, editorMetadata } from "./sections";
import { readableLabel } from "@/components/tailoring/ReviewContent";
import { isJsonObject, type JsonObject, type JsonValue } from "@/lib/tailoring/types";
import { resumeReviewText as plainText } from "@/lib/editor/resumeText";
import { buildKeywordHighlights, highlightPath, type HighlightPart, type KeywordHistory } from "@/lib/editor/keywordHighlights";

type Path = (string | number)[];
type HighlightMap = Map<string, HighlightPart[]>;
const hasText = (value: JsonValue): boolean => typeof value === "string" ? !!plainText(value).trim() : Array.isArray(value) ? value.some(hasText) : isJsonObject(value) ? Object.entries(value).some(([key, item]) => !editorMetadata.has(key) && hasText(item)) : value !== null;

function HighlightText({ value, path, parts, prominent = false, muted = false }: { value: string; path: Path; parts: HighlightMap; prominent?: boolean; muted?: boolean }) {
  const spans = parts.get(highlightPath(path)) ?? [{ text: plainText(value), kind: null }];
  return <Text selectable className={`min-w-0 shrink text-body leading-6 web:break-words ${prominent ? "font-semibold text-foreground" : muted ? "text-muted-foreground" : "text-foreground"}`}>
    {spans.map((span, index) => <Text key={index} className={span.kind === "matched" ? "bg-highlight-matched text-highlight-matched-foreground" : span.kind === "added" ? "bg-highlight-added text-highlight-added-foreground" : muted && !prominent ? "bg-card/0 text-muted-foreground" : "bg-card/0 text-foreground"}>{span.text}</Text>)}
  </Text>;
}

function ResumeValue({ value, path, parts, skills = false, styles }: { value: JsonValue; path: Path; parts: HighlightMap; skills?: boolean; styles?: JsonValue[] }) {
  if (!hasText(value)) return null;
  if (typeof value === "string") return <HighlightText value={value} path={path} parts={parts} />;
  if (Array.isArray(value)) {
    const chips = skills && value.every(item => typeof item === "string");
    return <View className={chips ? "min-w-0 flex-row flex-wrap gap-1.5" : "gap-3"}>
      {value.map((item, index) => {
        if (!hasText(item)) return null;
        const bullet = typeof item === "string" && !chips && styles?.[index] !== "plain" && !/<(?:ul|ol|li)\b/i.test(item);
        return <View key={index} className={chips ? "max-w-full shrink rounded-sm bg-muted px-2 py-1" : "min-w-0 flex-row items-start gap-2"}>
          {bullet ? <Text className="text-body leading-6 text-foreground">•</Text> : null}
          <View className={chips ? "min-w-0 shrink" : "min-w-0 flex-1"}><ResumeValue value={item} path={[...path, index]} parts={parts} skills={skills} /></View>
        </View>;
      })}
    </View>;
  }
  if (isJsonObject(value)) return <View className="min-w-0 gap-3">
    {Object.entries(value).filter(([key, item]) => !editorMetadata.has(key) && hasText(item)).map(([key, item]) => {
      const prominent = ["name", "fullName", "full_name", "title", "professionalTitle", "position", "role", "degree"].includes(key);
      const muted = ["company", "institution", "school", "university", "startDate", "endDate", "start_date", "end_date", "location", "email", "phone", "website", "linkedin", "github"].includes(key);
      const prose = ["text", "items", "strings", "description", "responsibilities", "highlights", "bullets"].includes(key);
      const skillList = skills || /skills|languages|awards/i.test(key);
      return <View key={key} className="min-w-0 gap-1.5">
        {!prominent && !muted && !prose ? <Text className="text-caption leading-5 text-muted-foreground">{readableLabel(key)}</Text> : null}
        {typeof item === "string" ? <HighlightText value={item} path={[...path, key]} parts={parts} prominent={prominent} muted={muted} /> : <ResumeValue value={item} path={[...path, key]} parts={parts} skills={skillList} styles={key === "description" && Array.isArray(value.descriptionStyles) ? value.descriptionStyles : undefined} />}
      </View>;
    })}
  </View>;
  return <Text selectable className="text-body leading-6 text-foreground">{typeof value === "boolean" ? value ? "Yes" : "No" : String(value)}</Text>;
}

export function HighlightedResume({ resume, parts }: { resume: JsonObject; parts: HighlightMap }) {
  const sections = resumeSections(resume).filter(section => hasText(section.value));
  return sections.length ? <View className="overflow-hidden rounded border border-border bg-card">
    {sections.map((section, index) => <View key={section.key} className={`min-w-0 ${index ? "border-t border-border" : ""}`}>
      {!section.personal ? <View className="gap-1 bg-muted px-3 py-2.5"><Text accessibilityRole="header" className="text-h6 text-foreground">{section.label}</Text>{section.hidden ? <Text className="text-caption text-muted-foreground">Hidden in PDF</Text> : null}</View> : null}
      <View className="min-w-0 px-3 py-4"><ResumeValue value={section.value} path={section.key.split(".")} parts={parts} skills={section.sectionType === "stringList"} /></View>
    </View>)}
  </View> : <View className="rounded border border-border bg-card p-4"><Text className="text-body leading-6 text-muted-foreground">This saved resume has no content yet. Return to Edit Resume to add your details.</Text></View>;
}

export function KeywordHighlights({ resume, keywords, jobDescription, history, historyLoading = false, historyError = false, onRetry }: { resume: JsonObject; keywords: string[]; jobDescription: string; history: KeywordHistory | null; historyLoading?: boolean; historyError?: boolean; onRetry?: () => void }) {
  const highlighted = useMemo(() => buildKeywordHighlights(resume, keywords, jobDescription, history), [resume, keywords, jobDescription, history]);
  return <View className="min-w-0 gap-4">
    <View className="gap-3 py-1">
      <View className="gap-2.5">
        <View className="flex-row items-center gap-2.5"><View className="h-4 w-4 shrink-0 rounded-sm bg-highlight-matched" /><Text className="min-w-0 flex-1 text-h6 leading-5 text-foreground">Yellow — Matched keywords</Text></View>
        <View className="flex-row items-center gap-2.5"><View className="h-4 w-4 shrink-0 rounded-sm bg-highlight-added" /><Text className="min-w-0 flex-1 text-h6 leading-5 text-foreground">Blue — Keywords you added</Text></View>
      </View>
      <Text className="text-body leading-6 text-muted-foreground">Yellow marks keywords that were already in your resume and also appear in the job description. Blue shows where keywords were added during tailoring or editing.</Text>
      {historyLoading ? <Text accessibilityLiveRegion="polite" className="text-caption leading-5 text-muted-foreground">Checking keyword history…</Text> : historyError || highlighted.unverified > 0 ? <View className="gap-1"><Text className="text-caption leading-5 text-muted-foreground">Some keyword history could not be verified. Only verified occurrences are highlighted.</Text>{historyError && onRetry ? <Button variant="ghost" size="sm" className="min-h-11 native:min-h-[44px] self-start px-0" onPress={onRetry}><Text className="text-caption text-primary">Retry keyword history</Text></Button> : null}</View> : !highlighted.verified ? <Text className="text-caption leading-5 text-muted-foreground">No verified keyword matches were found in this saved resume.</Text> : null}
    </View>
    <View className="gap-2.5">
      <View className="flex-row flex-wrap items-baseline justify-between gap-x-3 gap-y-1"><Text accessibilityRole="header" className="text-h6 text-foreground">Your resume</Text><Text className="text-caption text-muted-foreground">Latest saved version</Text></View>
      <HighlightedResume resume={resume} parts={highlighted.parts} />
    </View>
  </View>;
}
