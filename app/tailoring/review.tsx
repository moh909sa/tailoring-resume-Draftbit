import { useCallback, useEffect, useRef, useState } from "react";
import { router, Stack, useFocusEffect, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, BackHandler, FlatList, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppScreen } from "@/components/layout/AppScreen";
import { ScreenHeader } from "@/components/layout/ScreenHeader";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/cv/Notice";
import {
  AtsScoreCard,
  ChangeComparison,
  ChangeSummaryCards,
  KeywordOption,
  KeywordDestinations,
  ReviewStepper,
  SafetyNote,
  ReviewNote,
  SectionToggle,
  sectionTitle,
} from "@/components/tailoring/ReviewPrimitives";
import { cn } from "@/lib/utils";
import { useTailoring } from "@/lib/tailoring/TailoringProvider";
import {
  keywordKey,
  previewHasExpired,
  type ResumeChange,
  type ReviewStep,
} from "@/lib/tailoring/types";
import { reviewWarningsForStep } from "@/lib/tailoring/warnings";
import { keywordsForChange, keywordDestinations } from "@/lib/tailoring/changes";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useTheme } from "@/theming/ThemeProvider";
import LucideIcon from "@/lib/icons/LucideIcon";

const stepCopy = [
  {
    title: "Optimize keywords",
    body: "Some job keywords are missing from your CV. Select skills you have to improve your match.",
  },
  {
    title: "Review changes",
    body: "See exactly what changed, and make sure every claim feels true to you.",
  },
];
type WizardItem = { connected?: string } & (
  | { id: string; kind: "heading"; title: string; body: string }
  | { id: string; kind: "keyword"; keyword: string; attestation: boolean }
  | {
      id: string;
      kind: "section";
      title: string;
      subtitle: string;
      section: string;
      highRisk?: boolean;
      count?: number;
    }
  | {
      id: string;
      kind: "change";
      change: ResumeChange;
      summaryComparison?: boolean;
      descriptionComparison?: boolean;
      verification?: boolean;
    }
  | { id: string; kind: "warning"; message: string }
  | { id: string; kind: "skill-added"; change: ResumeChange }
);

export default function TailoringReviewScreen() {
  const run = useTailoring();
  const { session, loading: authLoading } = useAuth();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ tailoringId?: string }>();
  const routeId = typeof params.tailoringId === "string" ? params.tailoringId : undefined;
  const tailoringId = routeId ?? run.tailoringId ?? undefined;
  const { reloadReview, setStep } = run;
  const step: ReviewStep = run.step === 0 ? 0 : 1;
  const ownerId = session?.user?.id;
  const list = useRef<FlatList<WizardItem>>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(["summary"]));
  const [now, setNow] = useState(Date.now());
  const routeMatches = !routeId || routeId === run.tailoringId;
  const review = routeMatches ? run.preview?.review : undefined;
  const pendingKeywordCount = run.selectedKeywords.length;
  const busy = run.hydrating || run.reviewActivity !== null || run.status === "running";
  const expired = run.preview
    ? previewHasExpired(run.preview, now) || run.reviewProblem?.kind === "expired"
    : false;
  const blocked =
    busy ||
    expired ||
    run.needsReload ||
    run.reviewProblem?.kind === "unavailable" ||
    run.reviewProblem?.kind === "auth";

  useEffect(() => {
    if (run.step !== step) setStep(step);
  }, [run.step, step, setStep]);

  useFocusEffect(
    useCallback(() => {
      if (!authLoading && ownerId && !run.hydrating && tailoringId) void reloadReview(tailoringId);
    }, [authLoading, ownerId, run.hydrating, tailoringId, reloadReview]),
  );
  useEffect(() => {
    setNow(Date.now());
    const expiration = review?.preview_expires_at ? Date.parse(review.preview_expires_at) : NaN;
    if (!Number.isFinite(expiration) || expiration <= Date.now()) return;
    const timer = setTimeout(
      () => setNow(Date.now()),
      Math.min(expiration - Date.now() + 100, 2147483647),
    );
    return () => clearTimeout(timer);
  }, [review?.preview_expires_at]);
  useEffect(() => {
    const back = BackHandler.addEventListener("hardwareBackPress", () => {
      if (busy) return true;
      if (step > 0 && !run.saved) {
        setStep((step - 1) as ReviewStep);
        return true;
      }
      return false;
    });
    return () => back.remove();
  }, [busy, step, run.saved, setStep]);
  useEffect(() => {
    list.current?.scrollToOffset({ offset: 0, animated: false });
  }, [step, run.preview?.tailoring_id, run.tailoringId, routeMatches]);
  useEffect(() => {
    const savedId = run.confirmation?.tailoring_id ?? run.tailoringId;
    if (routeMatches && run.saved && savedId)
      router.replace({ pathname: "/cv-editor/[id]/preview", params: { id: savedId, returnTo: "library" } });
  }, [run.saved, run.confirmation?.tailoring_id, run.preview?.tailoring_id]);

  function close() {
    if (busy) return;
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)/tailor");
  }
  function toggle(section: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  }
  function regenerate() {
    if (run.input && run.start(run.input)) router.replace("/tailoring/processing");
  }

  const routeOptions = (
    <Stack.Screen options={{ title: "Review your resume", gestureEnabled: !busy }} />
  );
  if (run.saved && routeMatches)
    return (
      <AppScreen>
        {routeOptions}
        <ScreenHeader title="Resume saved" />
        <View className="flex-1 justify-center gap-6 px-6 pb-12">
          <View className="h-16 w-16 items-center justify-center rounded-3xl bg-success/10">
            <LucideIcon name="FileCheck" size={30} className="text-success" />
          </View>
          <View className="gap-3">
            <Text accessibilityRole="header" className="text-h2 text-foreground">
              Your tailored CV is saved
            </Text>
            <Text className="text-body leading-6 text-muted-foreground">
              Saved as a separate CV. Your original remains unchanged.
            </Text>
          </View>
          <Button onPress={() => router.replace("/(tabs)/tailor")} className="h-14 rounded-2xl">
            <Text>Done</Text>
          </Button>
        </View>
      </AppScreen>
    );
  if (!review || !run.preview)
    return (
      <AppScreen>
        {routeOptions}
        <ScreenHeader title="Resume review" />
        <View className="gap-5 px-6 pt-8">
          {authLoading || busy ? (
            <View className="flex-row items-center gap-3">
              <ActivityIndicator color={theme.colors.primary} />
              <Text className="text-body text-muted-foreground">Loading your review…</Text>
            </View>
          ) : (
            <>
              {run.reviewProblem ? (
                <>
                  {run.reviewProblem.severity === "error" ? (
                    <Notice tone="error" message={run.reviewProblem.message} />
                  ) : (
                    <ReviewNote message={run.reviewProblem.message} />
                  )}
                </>
              ) : (
                <Text className="text-body leading-6 text-muted-foreground">
                  {!ownerId
                    ? "Sign in to load your tailored draft."
                    : "Choose a CV and paste a job description to create your tailored preview."}
                </Text>
              )}
              {ownerId && tailoringId ? (
                <Button onPress={() => void reloadReview(tailoringId)} className="h-12 rounded-xl">
                  <Text>Retry loading review</Text>
                </Button>
              ) : null}
              {!ownerId ? (
                <Button
                  onPress={() => router.navigate("/(tabs)/library/my-cvs")}
                  className="h-12 rounded-xl"
                >
                  <Text>Sign in</Text>
                </Button>
              ) : null}
              <Button
                variant="outline"
                onPress={() =>
                  run.status === "running" ? router.replace("/tailoring/processing") : close()
                }
                className="h-12 rounded-xl"
              >
                <Text>{run.status === "running" ? "View progress" : "Back to Tailor CV"}</Text>
              </Button>
            </>
          )}
        </View>
      </AppScreen>
    );

  const items: WizardItem[] = [];
  const resume = run.preview.preview.resume_preview;
  const appliedKeywords = keywordDestinations(
    review.keyword_options.applied,
    review.keyword_placements,
    resume,
  ).map((row) => row.keyword);
  // Deduplicate display options only. Keep backend data and attestation rules intact.
  const seenKeywords = new Set<string>();
  function uniqueKeywords(keywords: string[]) {
    return keywords.filter((keyword) => {
      const key = keywordKey(keyword);
      if (seenKeywords.has(key)) return false;
      seenKeywords.add(key);
      return true;
    });
  }
  const options = {
    ...review.keyword_options,
    supported: uniqueKeywords(review.keyword_options.supported),
    needs_attestation: uniqueKeywords(review.keyword_options.needs_attestation),
  };
  const selected = new Set(run.selectedKeywords.map((item) => keywordKey(item.keyword)));
  if (step === 0) {
    if (options.supported.length) {
      items.push({
        id: "supported-heading",
        kind: "heading",
        title: "Already in your CV",
        body: "Skills from your original CV that can be highlighted for this job.",
      });
      options.supported.forEach((keyword, index) =>
        items.push({ id: `supported-${index}`, kind: "keyword", keyword, attestation: false }),
      );
    }
    if (options.needs_attestation.length) {
      items.push({
        id: "attestation-heading",
        kind: "heading",
        title: "Skills to confirm",
        body: "",
      });
      items.push({
        id: "attestation-safety",
        kind: "warning",
        message: "Only select skills you really have. You may be asked about them in interviews.",
      });
      options.needs_attestation.forEach((keyword, index) =>
        items.push({ id: `attestation-${index}`, kind: "keyword", keyword, attestation: true }),
      );
    }
    if (!options.supported.length && !options.needs_attestation.length)
      items.push({
        id: "no-keywords",
        kind: "heading",
        title: "Ready to review",
        body: "No keyword suggestions were returned for this draft. Continue to check the changes.",
      });
    if (options.remaining_slots === 0)
      items.push({
        id: "limit",
        kind: "warning",
        message: "No more skills can be added to this draft. Continue to Changes.",
      });
  }
  const warningsByChange = new Map<ResumeChange, string[]>();
  reviewWarningsForStep(review.warnings, step).forEach((message, index) => {
    // Keep verification beside its comparison, including when its section is collapsed.
    const rawWarning = review.warnings[index];
    const referencedPaths: string[] =
      rawWarning?.match(/[A-Za-z_]\w*(?:\[\d+\]|\.[A-Za-z_]\w*)+/g) ?? [];
    const relatedChange =
      step === 1
        ? review.change_sections
            .flatMap((section) => section.items)
            .find((change) => !!change.field_path && referencedPaths.includes(change.field_path))
        : undefined;
    if (relatedChange) {
      warningsByChange.set(relatedChange, [
        ...(warningsByChange.get(relatedChange) ?? []),
        message,
      ]);
    } else {
      items.push({ id: `warning-${index}`, kind: "warning", message });
    }
  });
  if (step === 1) {
    const detailedRiskCount = review.change_sections.reduce(
      (count, section) =>
        count + section.items.filter((change) => change.confidence === "high").length,
      0,
    );
    if ((review.change_summary.high_risk_changes ?? 0) > detailedRiskCount) {
      items.push({
        id: "verification-unavailable",
        kind: "warning",
        message:
          "Some verification details are unavailable. Reload the review and compare the current draft against your original CV before saving.",
      });
    }
  }
  if (step === 1) {
    review.change_sections.forEach((section, index) => {
      const highRisk = section.items.some((change) => change.confidence === "high");
      const connected = ["summary", "skill", "description"].includes(section.type)
        ? section.type
        : undefined;
      const hasAddedSkills =
        section.type === "skill" && section.items.some((change) => change.change_type === "added");
      items.push({
        id: `section-${index}`,
        kind: "section",
        title:
          (
            {
              summary: "Summary Changes",
              skill: "Skills Changes",
              description: "Description Changes",
            } as Record<string, string>
          )[section.type] ?? sectionTitle(section.type),
        subtitle: `${section.items.length} change${section.items.length === 1 ? "" : "s"}${hasAddedSkills ? " · Check each added skill" : highRisk ? " · Contains high risk changes" : ""}`,
        section: section.type,
        highRisk: section.type === "skill" ? false : highRisk,
        connected,
      });
      if (!expanded.has(section.type)) {
        section.items.forEach((change, changeIndex) =>
          warningsByChange
            .get(change)
            ?.forEach((message, warningIndex) =>
              items.push({
                id: `collapsed-warning-${index}-${changeIndex}-${warningIndex}`,
                kind: "warning",
                message,
                connected,
              }),
            ),
        );
      }
      if (expanded.has(section.type)) {
        section.items.forEach((change, changeIndex) => {
          const addedSkill = section.type === "skill" && change.change_type === "added";
          if (addedSkill) {
            items.push({
              id: `change-${index}-${changeIndex}`,
              kind: "skill-added",
              change,
              connected,
            });
          } else {
            items.push({
              id: `change-${index}-${changeIndex}`,
              kind: "change",
              change,
              summaryComparison: section.type === "summary",
              descriptionComparison: section.type === "description",
              connected,
            });
          }
          warningsByChange.get(change)?.forEach((message, warningIndex) =>
            items.push({
              id: `change-warning-${index}-${changeIndex}-${warningIndex}`,
              kind: "warning",
              message,
              connected,
            }),
          );
        });
      }
    });
    if (!review.change_sections.length)
      items.push({
        id: "no-diff",
        kind: "warning",
        message:
          review.change_summary.total_changes === 0
            ? "The service reported no detailed changes. Check the current resume before saving."
            : "Detailed comparisons are unavailable. Reload the review, then check the full resume before saving.",
      });
  }

  function renderItem(item: WizardItem) {
    switch (item.kind) {
      case "heading":
        return (
          <View className="gap-1.5 pb-1 pt-3">
            <Text accessibilityRole="header" className="text-h5 text-foreground">
              {item.title}
            </Text>
            {item.body ? (
              <Text className="text-body leading-6 text-muted-foreground">{item.body}</Text>
            ) : null}
          </View>
        );
      case "keyword":
        return (
          <KeywordOption
            keyword={item.keyword}
            attestation={item.attestation}
            selected={selected.has(keywordKey(item.keyword))}
            disabled={
              blocked ||
              (!selected.has(keywordKey(item.keyword)) &&
                run.selectedKeywords.length >= options.remaining_slots)
            }
            onPress={() => run.toggleKeyword(item.keyword, item.attestation)}
          />
        );
      case "section":
        return (
          <SectionToggle
            title={item.title}
            subtitle={item.subtitle}
            open={expanded.has(item.section)}
            onPress={() => toggle(item.section)}
            highRisk={item.highRisk}
            count={item.count}
            embedded={!!item.connected}
            icon={
              item.section === "save-review"
                ? "ShieldCheck"
                : item.section === "resume"
                  ? "FileUser"
                  : "FileText"
            }
          />
        );
      case "change":
        return (
          <ChangeComparison
            change={item.change}
            summaryComparison={item.summaryComparison}
            descriptionComparison={item.descriptionComparison}
            verification={item.verification}
            embedded={!!item.connected}
            appliedKeywords={
              item.descriptionComparison || item.summaryComparison
                ? keywordsForChange(item.change, review!.keyword_placements)
                : appliedKeywords
            }
          />
        );
      case "skill-added":
        return (
          <View className="px-4 py-2.5">
            {item.change.new_value ? (
              <Text selectable className="text-body leading-6 text-success">
                {item.change.new_value}
              </Text>
            ) : (
              <Text className="text-caption leading-5 text-muted-foreground">
                Added skill details are unavailable.
              </Text>
            )}
          </View>
        );
      case "warning":
        return item.id === "attestation-safety" ? (
          <SafetyNote message={item.message} />
        ) : (
          <ReviewNote message={item.message} />
        );
    }
  }
  function renderRow(item: WizardItem, index = items.indexOf(item)) {
    if (!item.connected) return <View className="mb-3">{renderItem(item)}</View>;
    const header = item.kind === "section";
    const last = items[index + 1]?.connected !== item.connected;
    return (
      <View
        className={cn(
          "overflow-hidden border-x border-border bg-card",
          header ? "rounded-t-2xl border-t" : "border-t",
          item.kind === "change" && item.descriptionComparison && "px-3 py-2",
          last && "mb-3 rounded-b-2xl border-b",
        )}
      >
        {renderItem(item)}
      </View>
    );
  }
  const activityLabel =
    run.reviewActivity === "keywords"
      ? "Applying selected keywords…"
      : run.reviewActivity === "confirm"
        ? "Checking and saving your latest draft…"
        : "Refreshing your review…";
  return (
    <AppScreen>
      {routeOptions}
      <ScreenHeader
        title="Resume review"
        action={
          <View className="flex-row gap-1">
            <Button
              variant="ghost"
              size="icon"
              disabled={busy}
              onPress={() => void reloadReview()}
              accessibilityLabel="Reload review"
              className="h-11 w-10 rounded-xl"
              hitSlop={2}
            >
              <LucideIcon name="RefreshCw" size={18} className="text-muted-foreground" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              disabled={busy}
              onPress={close}
              accessibilityLabel="Close review"
              className="h-11 w-10 rounded-xl"
              hitSlop={2}
            >
              <LucideIcon name="X" size={20} className="text-foreground" />
            </Button>
          </View>
        }
      />
      <ReviewStepper step={step} />
      <FlatList
        ref={list}
        data={items}
        extraData={run.selectedKeywords}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => renderRow(item, index)}
        showsVerticalScrollIndicator={false}
        contentContainerClassName="px-6 pb-5"
        keyboardShouldPersistTaps="handled"
        ListFooterComponent={
          step === 0 && options.applied.length > 0 ? (
            <View className="flex-row items-start gap-2 px-1 pb-2 pt-1">
              <LucideIcon name="Info" size={15} className="mt-0.5 text-muted-foreground" />
              <View className="flex-1 gap-1">
                <Text className="text-h6 text-muted-foreground">
                  Want to improve your match further?
                </Text>
                <Text className="text-caption leading-5 text-muted-foreground">
                  You can add more skills, or tap Continue to Changes when you’re ready.
                </Text>
              </View>
            </View>
          ) : null
        }
        ListHeaderComponent={
          <View className="mb-5 gap-5">
            <View className="gap-2">
              <Text className="text-caption text-primary">Step {step + 1} of 2</Text>
              <Text accessibilityRole="header" className="text-h2 tracking-tight text-foreground">
                {stepCopy[step].title}
              </Text>
              {stepCopy[step].body ? (
                <Text className="text-body leading-6 text-muted-foreground">
                  {stepCopy[step].body}
                </Text>
              ) : null}
            </View>
            {busy ? (
              <View accessibilityLiveRegion="polite" className="flex-row items-center gap-2.5">
                <ActivityIndicator size="small" color={theme.colors.primary} />
                <Text className="text-caption flex-1 leading-5 text-muted-foreground">
                  {activityLabel}
                </Text>
              </View>
            ) : null}
            {run.reviewProblem && !expired ? (
              <View className="gap-2">
                <>
                  {run.reviewProblem.severity === "error" ? (
                    <Notice tone="error" message={run.reviewProblem.message} />
                  ) : (
                    <ReviewNote message={run.reviewProblem.message} />
                  )}
                </>
                <Button
                  variant="outline"
                  onPress={() => void reloadReview()}
                  disabled={busy}
                  className="h-11 rounded-xl"
                >
                  <Text>Reload review</Text>
                </Button>
              </View>
            ) : null}
            {expired ? (
              <View className="gap-3">
                <ReviewNote message="This preview has expired. Your current draft and selections are preserved. Create a new preview to continue." />
                {run.input ? (
                  <Button
                    variant="outline"
                    onPress={regenerate}
                    disabled={busy}
                    className="h-12 rounded-xl"
                  >
                    <Text>Create new preview</Text>
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    onPress={close}
                    disabled={busy}
                    className="h-12 rounded-xl"
                  >
                    <Text>Back to Tailor CV</Text>
                  </Button>
                )}
              </View>
            ) : null}
            {step === 0 ? (
              <>
                <AtsScoreCard review={review} />
              </>
            ) : null}
            {step === 1 ? (
              <>
                <KeywordDestinations review={review} resume={run.preview.preview.resume_preview} />
                <ChangeSummaryCards summary={review.change_summary} />
              </>
            ) : null}
            {step === 1 && pendingKeywordCount > 0 ? (
              <View className="gap-2">
                <ReviewNote message="Apply your selected keywords or deselect them before saving." />
                <Button
                  variant="outline"
                  disabled={busy}
                  onPress={() => setStep(0)}
                  className="h-11 rounded-xl"
                >
                  <Text>Review selected keywords</Text>
                </Button>
              </View>
            ) : null}
          </View>
        }
      />
      <View
        className="gap-3 border-t border-border bg-background px-6 pt-4"
        style={{ paddingBottom: Math.max(insets.bottom, 12) }}
      >
        {step === 0 ? (
          <>
            <Button
              onPress={run.applyKeywords}
              disabled={blocked || !pendingKeywordCount}
              accessibilityLabel={`Apply Keywords (${pendingKeywordCount})`}
              className="h-12 gap-2 rounded-2xl"
            >
              {run.reviewActivity === "keywords" ? (
                <ActivityIndicator size="small" color={theme.colors.primaryForeground} />
              ) : (
                <LucideIcon name="Sparkles" size={17} className="text-primary-foreground" />
              )}
              <Text>
                {run.reviewActivity === "keywords"
                  ? "Applying Keywords…"
                  : `Apply Keywords (${pendingKeywordCount})`}
              </Text>
            </Button>
            {pendingKeywordCount > 0 ? (
              <Text
                accessibilityLiveRegion="polite"
                className="text-caption text-center leading-5 text-muted-foreground"
              >
                Apply your selected keywords or deselect them to continue.
              </Text>
            ) : null}
            <View className="flex-row gap-3">
              <Button
                variant="secondary"
                onPress={() => {
                  if (!busy && pendingKeywordCount === 0) setStep(1);
                }}
                disabled={busy || pendingKeywordCount > 0}
                className="h-12 flex-1 rounded-xl"
              >
                <Text>Continue to Changes</Text>
              </Button>
            </View>
          </>
        ) : (
          <>
            <Text className="text-caption text-center leading-5 text-muted-foreground">
              We’ll save a separate copy for you to edit.
            </Text>
            <View className="flex-row gap-3">
              <Button
                variant="outline"
                onPress={() => {
                  if (!busy) setStep(0);
                }}
                disabled={busy}
                className="h-14 gap-1.5 rounded-2xl px-4"
              >
                <LucideIcon name="ChevronLeft" size={16} className="text-foreground" />
                <Text>Back</Text>
              </Button>
              <Button
                onPress={() => {
                  if (!blocked && pendingKeywordCount === 0) run.confirm();
                }}
                disabled={blocked || pendingKeywordCount > 0}
                className="h-14 flex-1 gap-2 rounded-2xl"
              >
                {run.reviewActivity === "confirm" ? (
                  <ActivityIndicator size="small" color={theme.colors.primaryForeground} />
                ) : null}
                <Text>{run.reviewActivity === "confirm" ? "Saving…" : "Continue to CV"}</Text>
              </Button>
            </View>
          </>
        )}
      </View>
    </AppScreen>
  );
}
