import { Fragment, useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { Text } from "@/components/ui/text";
import LucideIcon, { type IconName } from "@/lib/icons/LucideIcon";
import { cn } from "@/lib/utils";
import { useTheme } from "@/theming/ThemeProvider";
import {
  atsScore,
  type ChangeSummary,
  type JsonObject,
  type ResumeChange,
  type ReviewStep,
  type TailoringReview,
} from "@/lib/tailoring/types";
import { compareWords } from "@/lib/tailoring/diff";
import { highlightAppliedKeywords, keywordDestinations } from "@/lib/tailoring/changes";
import { readableLabel } from "@/components/tailoring/ReviewContent";

const steps = ["Keywords", "Changes"];
export function ReviewStepper({ step }: { step: ReviewStep }) {
  return (
    <View
      accessibilityLabel={`Step ${step + 1} of 2: ${steps[step]}`}
      className="flex-row items-center px-6 pb-5 pt-1"
    >
      {steps.map((label, index) => (
        <Fragment key={label}>
          {index > 0 ? (
            <View className={cn("mx-2 h-px flex-1", index <= step ? "bg-primary" : "bg-border")} />
          ) : null}
          <View className="flex-row items-center gap-2">
            <View
              className={cn(
                "h-7 w-7 items-center justify-center rounded-full",
                index <= step ? "bg-primary" : "bg-secondary",
              )}
            >
              {index < step ? (
                <LucideIcon name="Check" size={14} className="text-primary-foreground" />
              ) : (
                <Text
                  className={cn(
                    "text-caption",
                    index === step ? "text-primary-foreground" : "text-muted-foreground",
                  )}
                >
                  {index + 1}
                </Text>
              )}
            </View>
            <Text
              className={cn(
                "text-caption",
                index === step ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {label}
            </Text>
          </View>
        </Fragment>
      ))}
    </View>
  );
}
export const formatScore = (score: number) => String(Number(score.toFixed(1)));
export function AtsScoreCard({ review }: { review: TailoringReview }) {
  const score = atsScore(review);
  const history = review.score_history;
  const delta =
    history.length > 1 ? history[history.length - 1] - history[history.length - 2] : null;
  return (
    <View
      accessibilityLiveRegion="polite"
      className="gap-4 rounded-3xl border border-primary/30 bg-primary/5 p-5"
    >
      <View className="flex-row items-center justify-between gap-4">
        <View className="flex-1 gap-1.5">
          <View className="flex-row items-center gap-2">
            <LucideIcon name="ChartNoAxesCombined" size={16} className="text-primary" />
            <Text className="text-h6 text-foreground">ATS match score</Text>
          </View>
          <Text className="text-body leading-6 text-muted-foreground">
            Estimated for this job description.
          </Text>
        </View>
        <View className="flex-row items-baseline gap-1">
          <Text className="text-h1 tabular-nums tracking-tight text-foreground">
            {score === null ? "—" : formatScore(score)}
          </Text>
          {score !== null ? <Text className="text-caption text-muted-foreground">/100</Text> : null}
        </View>
      </View>
      {score !== null ? (
        <View
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 0, max: 100, now: score }}
          className="h-1.5 overflow-hidden rounded-full bg-secondary"
        >
          <View
            className="h-full rounded-full bg-primary"
            style={{ width: `${Math.min(100, Math.max(0, score))}%` }}
          />
        </View>
      ) : (
        <Text className="text-caption text-muted-foreground">
          The service did not return a score for this draft.
        </Text>
      )}
      {delta !== null ? (
        <View className="flex-row flex-wrap items-center gap-2">
          <View
            className={cn(
              "flex-row items-center gap-1 rounded-full px-2.5 py-1",
              delta > 0 ? "bg-success/10" : delta < 0 ? "bg-destructive/10" : "bg-secondary",
            )}
          >
            <LucideIcon
              name={delta > 0 ? "ArrowUpRight" : delta < 0 ? "ArrowDownRight" : "Minus"}
              size={13}
              className={
                delta > 0
                  ? "text-success"
                  : delta < 0
                    ? "text-destructive"
                    : "text-muted-foreground"
              }
            />
            <Text
              className={cn(
                "text-caption",
                delta > 0
                  ? "text-success"
                  : delta < 0
                    ? "text-destructive"
                    : "text-muted-foreground",
              )}
            >
              {delta > 0 ? "+" : ""}
              {formatScore(delta)} points
            </Text>
          </View>
          <Text className="text-caption text-muted-foreground">since the last application</Text>
        </View>
      ) : null}
      {history.length > 1 ? (
        <Text selectable className="text-caption leading-5 text-muted-foreground">
          Score history: {history.map(formatScore).join(" → ")}
        </Text>
      ) : null}
    </View>
  );
}
export function ReviewNote({ message }: { message: string }) {
  return (
    <Text accessibilityLiveRegion="polite" className="text-caption leading-5 text-muted-foreground">
      {message}
    </Text>
  );
}
export function SafetyNote({ message, highRisk = false }: { message: string; highRisk?: boolean }) {
  return (
    <View
      className={cn(
        "flex-row items-start gap-2.5 rounded-2xl border px-4 py-3.5",
        highRisk ? "border-destructive/25 bg-destructive/5" : "border-warning/25 bg-warning/5",
      )}
    >
      <LucideIcon
        name={highRisk ? "ShieldAlert" : "TriangleAlert"}
        size={17}
        className={highRisk ? "text-destructive" : "text-foreground"}
      />
      <Text className="text-caption flex-1 leading-5 text-foreground">{message}</Text>
    </View>
  );
}
const metrics: {
  key: keyof ChangeSummary;
  label: string;
  icon: IconName;
  color: string;
  tint: string;
}[] = [
  {
    key: "skills_added",
    label: "Skills Added",
    icon: "ListPlus",
    color: "text-success",
    tint: "bg-success/10",
  },
  {
    key: "descriptions_modified",
    label: "Descriptions Modified",
    icon: "TextCursorInput",
    color: "text-primary",
    tint: "bg-primary/10",
  },
  {
    key: "skills_removed",
    label: "Skills Removed",
    icon: "ListMinus",
    color: "text-destructive",
    tint: "bg-destructive/10",
  },
  {
    key: "certifications_added",
    label: "Certifications Added",
    icon: "BadgeCheck",
    color: "text-tertiary",
    tint: "bg-tertiary/10",
  },
];
export function ChangeSummaryCards({ summary }: { summary: ChangeSummary }) {
  const visible = metrics.filter(
    ({ key }) =>
      key === "skills_added" || key === "descriptions_modified" || (summary[key] ?? 0) > 0,
  );
  return (
    <View className="flex-row flex-wrap justify-between gap-y-2.5">
      {visible.map(({ key, label, icon, color, tint }) => (
        <View key={key} className="w-[48%] gap-3 rounded-2xl border border-border bg-card p-4">
          <View className="flex-row items-center justify-between gap-3">
            <View className={cn("h-8 w-8 items-center justify-center rounded-xl", tint)}>
              <LucideIcon name={icon} size={17} className={color} />
            </View>
            <Text className="text-h2 tabular-nums text-foreground">{summary[key] ?? "—"}</Text>
          </View>
          <Text className="text-caption leading-4 text-muted-foreground">{label}</Text>
        </View>
      ))}
    </View>
  );
}
export const sectionLabels: Record<string, string> = {
  summary: "Summary",
  skill: "Skills",
  experience: "Experience",
  description: "Descriptions",
  education: "Education",
  project: "Projects",
  certification: "Certifications",
  language: "Languages",
  award: "Awards",
};
export function sectionTitle(type: string): string {
  return sectionLabels[type] ?? readableLabel(type);
}
export function fieldLocation(path: string): string {
  return path
    .replace(/\[(\d+)\]/g, (_, index: string) => ` ${Number(index) + 1}`)
    .split(".")
    .map((part) => readableLabel(part))
    .join(" · ");
}
export function SectionToggle({
  title,
  subtitle,
  open,
  onPress,
  icon = "FileText",
  highRisk = false,
  count,
  embedded = false,
}: {
  title: string;
  subtitle?: string;
  open: boolean;
  onPress: () => void;
  icon?: IconName;
  highRisk?: boolean;
  count?: number;
  embedded?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ expanded: open }}
      aria-expanded={open}
      className={cn(
        "min-h-16 flex-row items-center gap-3 bg-card px-4 py-4 active:bg-secondary",
        !embedded && "rounded-2xl border border-border",
        highRisk && !embedded && "border-destructive/25",
      )}
    >
      <LucideIcon
        name={icon}
        size={19}
        className={highRisk ? "text-destructive" : "text-primary"}
      />
      <View className="flex-1 gap-1">
        <Text className="text-h6 text-foreground">{title}</Text>
        {subtitle ? <Text className="text-caption text-muted-foreground">{subtitle}</Text> : null}
      </View>
      {count !== undefined ? (
        <View className="min-w-7 items-center rounded-full bg-primary/10 px-2 py-1">
          <Text className="text-caption tabular-nums text-primary">{count}</Text>
        </View>
      ) : null}
      <LucideIcon
        name={open ? "ChevronUp" : "ChevronDown"}
        size={18}
        className="text-muted-foreground"
      />
    </Pressable>
  );
}
export function KeywordOption({
  keyword,
  attestation,
  selected,
  disabled,
  onPress,
}: {
  keyword: string;
  attestation: boolean;
  selected: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const rowStyle = {
    borderColor: selected ? theme.colors.primary : theme.colors.border,
    opacity: disabled ? 0.6 : 1,
  };
  const checkboxStyle = {
    borderColor: selected ? theme.colors.primary : theme.colors.mutedForeground,
    backgroundColor: selected ? theme.colors.primary : "transparent",
  };
  const checkStyle = { opacity: selected ? 1 : 0 };
  // Keep NativeWind classes stable when toggling; selection only changes RN styles.
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={attestation ? `I have this skill: ${keyword}` : keyword}
      accessibilityState={{ checked: selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      className="min-h-16 flex-row items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3.5"
      style={rowStyle}
    >
      <Text className="text-h5 flex-1 leading-6 text-foreground">{keyword}</Text>
      {attestation ? (
        <Text
          className="text-body text-muted-foreground"
          style={{ color: selected ? theme.colors.primary : theme.colors.mutedForeground }}
        >
          I have this
        </Text>
      ) : null}
      <View
        className="h-6 w-6 items-center justify-center rounded-lg border border-muted-foreground/50"
        style={checkboxStyle}
      >
        <LucideIcon name="Check" size={15} className="text-primary-foreground" style={checkStyle} />
      </View>
    </Pressable>
  );
}
export function ChangeComparison({
  change,
  summaryComparison = false,
  descriptionComparison = false,
  embedded = false,
  verification = false,
  appliedKeywords,
}: {
  change: ResumeChange;
  summaryComparison?: boolean;
  descriptionComparison?: boolean;
  embedded?: boolean;
  verification?: boolean;
  appliedKeywords?: string[];
}) {
  const diff = useMemo(
    () => compareWords(change.original_value ?? "", change.new_value ?? ""),
    [change.original_value, change.new_value],
  );
  const highRisk = change.confidence === "high";
  const fullComparison = summaryComparison || descriptionComparison;
  const calmVerification = verification || fullComparison;
  const after = useMemo(
    () => highlightAppliedKeywords(diff.after, appliedKeywords ?? [], fullComparison),
    [diff.after, appliedKeywords, fullComparison],
  );
  return (
    <View
      className={cn(
        "gap-4 bg-card p-4",
        descriptionComparison && "gap-3 rounded-xl border border-border",
        !embedded && "rounded-2xl border border-border",
        highRisk && !embedded && (calmVerification ? "border-primary/25" : "border-destructive/30"),
      )}
    >
      {!fullComparison || highRisk ? (
        <View className="flex-row flex-wrap items-center justify-between gap-2">
          {!fullComparison ? (
            <Text className="text-h6 text-foreground">
              {change.change_type === "added"
                ? "Added"
                : change.change_type === "removed"
                  ? "Removed"
                  : "Modified wording"}
            </Text>
          ) : null}
          {highRisk ? (
            <Text className="text-caption text-muted-foreground">
              {calmVerification ? "Verify accuracy" : "High risk"}
            </Text>
          ) : null}
        </View>
      ) : null}
      {change.field_path && !fullComparison ? (
        <Text className="text-caption leading-5 text-muted-foreground">
          {fieldLocation(change.field_path)}
        </Text>
      ) : null}
      <View
        className={
          descriptionComparison ? "gap-1.5" : "gap-2 border-l-2 border-destructive/40 pl-3"
        }
      >
        <Text className="text-caption text-muted-foreground">Before</Text>
        <Text
          selectable
          className={cn(
            "text-body leading-6",
            fullComparison ? "text-destructive line-through" : "text-foreground",
          )}
        >
          {fullComparison ? (
            change.original_value || "Not included"
          ) : diff.before.length ? (
            diff.before.map((part, i) => (
              <Text
                key={i}
                className={cn(part.changed && "bg-destructive/10 text-destructive line-through")}
              >
                {part.text}
              </Text>
            ))
          ) : (
            <Text className="text-muted-foreground">Not included</Text>
          )}
        </Text>
      </View>
      <View className={descriptionComparison ? "gap-1.5" : "gap-2 border-l-2 border-primary pl-3"}>
        <Text
          className={cn("text-caption", fullComparison ? "text-muted-foreground" : "text-primary")}
        >
          After
        </Text>
        <Text selectable className="text-body leading-6 text-foreground">
          {after.length ? (
            after.map((part, i) => (
              <Text
                key={i}
                className={
                  fullComparison
                    ? part.keyword
                      ? "text-tertiary"
                      : "text-foreground"
                    : appliedKeywords !== undefined
                      ? part.keyword
                        ? "bg-tertiary/10 font-semibold text-tertiary"
                        : part.changed
                          ? "underline"
                          : ""
                      : part.changed
                        ? change.change_type === "added" && !fullComparison
                          ? "bg-success/10 text-success"
                          : "bg-primary/10 text-primary"
                        : ""
                }
              >
                {part.text}
              </Text>
            ))
          ) : (
            <Text className="text-muted-foreground">Not included</Text>
          )}
        </Text>
      </View>
      {highRisk ? (
        <Text className={cn("text-caption leading-5", "text-muted-foreground")}>
          Verify this claim is accurate and supported by your experience before saving.
        </Text>
      ) : null}
    </View>
  );
}

type KeywordDestinationsProps = { review: TailoringReview; resume: JsonObject };

export function KeywordDestinations(props: KeywordDestinationsProps) {
  // This component mounts only on Changes, so each entry starts collapsed.
  const [expanded, setExpanded] = useState(false);
  return (
    <KeywordDestinationsCard
      {...props}
      expanded={expanded}
      onToggle={() => setExpanded((value) => !value)}
    />
  );
}

export function KeywordDestinationsCard({
  review,
  resume,
  expanded,
  onToggle,
}: KeywordDestinationsProps & { expanded: boolean; onToggle: () => void }) {
  const rows = keywordDestinations(
    review.keyword_options.applied,
    review.keyword_placements,
    resume,
  );
  const score = atsScore(review);
  const history = review.score_history;
  const previous =
    score !== null && history.length > 1 && history[history.length - 1] === score
      ? history[history.length - 2]
      : null;
  const delta = score !== null && previous !== null ? score - previous : null;
  const countLabel = `${rows.length} keyword${rows.length === 1 ? "" : "s"}`;
  return (
    <View className="overflow-hidden rounded-2xl border border-border bg-card">
      <View accessibilityLiveRegion="polite" className="gap-2 p-4">
        <Text className="text-caption font-medium text-muted-foreground">ATS match score</Text>
        <View className="flex-row items-center justify-between gap-3">
          <View className="flex-row items-baseline gap-2">
            {score !== null && previous !== null ? (
              <>
                <Text className="text-h3 tabular-nums text-muted-foreground">
                  {formatScore(previous)}
                </Text>
                <Text className="text-body text-muted-foreground">{" → "}</Text>
              </>
            ) : null}
            <Text
              className={
                score === null
                  ? "text-h3 text-muted-foreground"
                  : "text-h1 tabular-nums text-foreground"
              }
            >
              {score === null ? "Unavailable" : formatScore(score)}
            </Text>
          </View>
          {delta !== null && delta > 0 ? (
            <View className="rounded-full bg-success/10 px-2.5 py-1">
              <Text className="text-caption font-medium tabular-nums text-success">
                +{formatScore(delta)} pts
              </Text>
            </View>
          ) : null}
        </View>
        <Text className="text-caption text-muted-foreground">Latest keyword update</Text>
      </View>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityLabel={`Where your keywords went, ${countLabel}`}
        accessibilityState={{ expanded }}
        accessibilityHint={expanded ? "Hide keyword locations" : "Show keyword locations"}
        className="min-h-20 flex-row items-center gap-3 border-t border-border bg-card px-4 py-4 active:bg-secondary"
      >
        <LucideIcon name="MapPin" size={18} className="text-muted-foreground" />
        <View className="flex-1 gap-1">
          <Text className="text-h5 text-foreground">Where your keywords went</Text>
          <Text className="text-caption text-muted-foreground">{countLabel}</Text>
        </View>
        <LucideIcon
          name={expanded ? "ChevronUp" : "ChevronDown"}
          size={18}
          className="text-muted-foreground"
        />
      </Pressable>
      {expanded ? (
        <View className="border-t border-border bg-card px-4">
          {rows.length ? (
            rows.map((row, index) => (
              <View
                key={row.keyword.toLocaleLowerCase()}
                className={cn(
                  "flex-row items-start gap-3 py-3",
                  index > 0 && "border-t border-border",
                )}
              >
                <Text className="min-w-0 flex-1 text-body font-medium leading-6 text-foreground">
                  {row.keyword}
                </Text>
                <View className="w-28 shrink-0 items-end gap-1.5">
                  {row.locations.length ? (
                    row.locations.map((location) => (
                      <View key={location} className="max-w-full rounded-md bg-secondary px-2 py-1">
                        <Text className="text-caption leading-4 text-muted-foreground">
                          {location}
                        </Text>
                      </View>
                    ))
                  ) : (
                    <Text className="text-caption leading-5 text-muted-foreground">
                      No confirmed location returned for this draft.
                    </Text>
                  )}
                </View>
              </View>
            ))
          ) : (
            <Text className="py-4 text-caption leading-5 text-muted-foreground">
              No applied keyword placements were returned for this draft.
            </Text>
          )}
        </View>
      ) : null}
    </View>
  );
}
