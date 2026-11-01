import { useTailoring } from "@/lib/tailoring/TailoringProvider";
import { useEffect, useState } from "react";
import { router } from "expo-router";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import { AppScreen } from "@/components/layout/AppScreen";
import { ScreenHeader } from "@/components/layout/ScreenHeader";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CvSelectionSheet } from "@/components/cv/CvSelectionSheet";
import { Notice } from "@/components/cv/Notice";
import LucideIcon from "@/lib/icons/LucideIcon";
import { useMyCv } from "@/lib/cv/useMyCv";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useTheme } from "@/theming/ThemeProvider";
import { useTailorForm } from "@/lib/tailoring/useTailorForm";

export default function TailorScreen() {
  const { session, loading: authLoading, error: authError } = useAuth();
  const { theme } = useTheme();
  const cv = useMyCv();
  const tailoring = useTailoring();
  const [choosing, setChoosing] = useState(false);
  const ownerId = session?.user?.id ?? null;
  const form = useTailorForm(ownerId, tailoring.input, tailoring.hydrating || tailoring.jobRecovering);
  const { selectedId, description } = form.form;
  const selected = cv.resumes.find((item) => item.id === selectedId);
  useEffect(() => setChoosing(false), [ownerId]);

  const descriptionLength = description.trim().length;
  const canTailor =
    !!ownerId &&
    !!selected &&
    selected.processing_status === "ready" &&
    !selected.recovery_required &&
    !form.loading &&
    descriptionLength >= 50 &&
    descriptionLength <= 12000 &&
    !authLoading &&
    !tailoring.hydrating &&
    !tailoring.jobRecovering &&
    !tailoring.jobConnectionError &&
    !authError;
  const existing = !!ownerId && !!tailoring.tailoringId && tailoring.status === "success" && tailoring.input?.resumeId === selectedId && tailoring.input?.jobDescription === description.trim();
  function startTailoring() {
    if (existing && tailoring.tailoringId) {
      router.push(tailoring.saved ? { pathname: "/cv-editor/[id]", params: { id: tailoring.tailoringId } } : { pathname: "/tailoring/review", params: { tailoringId: tailoring.tailoringId } });
      return;
    }
    if (tailoring.status === "running") {
      router.navigate("/tailoring/processing");
      return;
    }
    if (!canTailor || !selected) return;
    if (
      tailoring.start({
        resumeId: selected.id,
        filename: selected.display_name ?? selected.original_filename,
        jobDescription: description.trim(),
      })
    )
      router.push("/tailoring/processing");
  }

  function goToMyCvs() {
    setChoosing(false);
    router.navigate("/(tabs)/library/my-cvs");
  }

  return (
    <AppScreen>
      <ScreenHeader title="Tailor CV" />
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerClassName="px-6 pb-8 pt-3"
        >
          <Text className="text-body mb-8 leading-6 text-muted-foreground">
            Bring your experience and your next opportunity together.
          </Text>
          <View className="mb-8 gap-3">
            <Text className="text-h4 text-foreground">Your CV</Text>
            <Pressable
              onPress={() => setChoosing(true)}
              disabled={authLoading || form.loading}
              accessibilityRole="button"
              accessibilityLabel="Choose an uploaded CV"
              className="flex-row items-center gap-3 rounded-2xl border border-border bg-card p-4 active:bg-secondary"
            >
              <View className="h-11 w-11 items-center justify-center rounded-xl bg-primary/5">
                {cv.loading || authLoading ? (
                  <ActivityIndicator size="small" color={theme.colors.primary} />
                ) : (
                  <LucideIcon name="FileText" size={22} className="text-primary" />
                )}
              </View>
              <View className="flex-1 gap-1">
                <Text className="text-h5 text-foreground" numberOfLines={2}>
                  {selected?.display_name ?? selected?.original_filename ?? "Choose a CV"}
                </Text>
                <Text className="text-caption text-muted-foreground">
                  {selected
                    ? "Original resume from your library"
                    : "Select an original from My CVs"}
                </Text>
              </View>
              <LucideIcon name="ChevronDown" size={18} className="text-muted-foreground" />
            </Pressable>
            {authError ? <Notice tone="error" message={authError} /> : null}
            {form.error ? <Notice tone="error" message={form.error} /> : null}
            {cv.listError ? (
              <View className="gap-3">
                <Notice tone="error" message={cv.listError} />
                <Button
                  variant="outline"
                  onPress={() => void cv.refresh()}
                  disabled={cv.refreshing}
                  className="self-start rounded-xl"
                >
                  <Text>Try again</Text>
                </Button>
              </View>
            ) : null}
            <Pressable onPress={goToMyCvs} accessibilityRole="button" className="self-start py-2">
              <Text className="text-h6 text-primary">
                {ownerId ? "Upload another CV" : "Sign in and upload a CV"}
              </Text>
            </Pressable>
          </View>
          <View className="gap-3">
            <Text className="text-h4 text-foreground">The opportunity</Text>
            <Text className="text-body leading-6 text-muted-foreground">
              Paste the full job description, including responsibilities and requirements.
            </Text>
            <Textarea
              accessibilityLabel="Job description"
              value={description}
              onChangeText={(value) => form.update({ description: value })}
              editable={!form.loading}
              placeholder="Paste the job description here…"
              numberOfLines={8}
              className="min-h-56 rounded-2xl p-4 leading-6"
            />
            <View className="flex-row justify-between gap-3">
              <Text className="flex-1 text-caption text-muted-foreground">
                {form.loading ? "Restoring your draft…" : ownerId && !form.error ? form.saving ? "Saving draft…" : "Draft kept on this device" : "Include the role and required skills"}
              </Text>
              <Text className={descriptionLength > 12000 ? "text-caption text-destructive" : "text-caption text-muted-foreground"}>
                {descriptionLength.toLocaleString()} / 12,000
              </Text>
            </View>
          </View>
          <View className="mt-8 gap-3">
            {tailoring.jobConnectionError && tailoring.status !== "running" ? (
              <View className="gap-3">
                <Notice tone="info" message={tailoring.jobConnectionError} />
                <Button
                  variant="outline"
                  onPress={tailoring.recoverJob}
                  disabled={tailoring.jobRecovering}
                  className="h-12 rounded-2xl"
                >
                  <Text>Check job status</Text>
                </Button>
              </View>
            ) : null}
            {tailoring.tailoringId && !tailoring.saved && !existing && tailoring.status !== "running" ? (
              <Button
                variant="outline"
                onPress={() =>
                  router.push({
                    pathname: "/tailoring/review",
                    params: { tailoringId: tailoring.tailoringId ?? "" },
                  })
                }
                className="h-12 gap-2 rounded-2xl"
              >
                <LucideIcon name="FileCheck" size={18} className="text-primary" />
                <Text>Continue your review</Text>
              </Button>
            ) : null}
            <Button
              disabled={!existing && !canTailor && tailoring.status !== "running"}
              onPress={startTailoring}
              accessibilityLabel={
                tailoring.status === "running" ? "View tailoring progress" : existing ? tailoring.saved ? "Open saved CV" : "Continue review" : "Tailor My CV"
              }
              className="h-14 gap-2 rounded-2xl"
            >
              <LucideIcon name="Sparkles" size={19} className="text-primary-foreground" />
              <Text>{tailoring.status === "running" ? "View progress" : existing ? tailoring.saved ? "Open saved CV" : "Continue review" : "Tailor My CV"}</Text>
            </Button>
            <Text className="text-caption text-center leading-5 text-muted-foreground">
              {selected && (selected.processing_status !== "ready" || selected.recovery_required)
                ? "Choose a CV marked Ready before tailoring."
                : descriptionLength > 12000
                  ? "Keep the job description to 12,000 characters or fewer."
                  : descriptionLength < 50
                    ? "Paste at least 50 characters. You’ll review the result before saving."
                    : "You’ll review every change before saving. Your original CV stays unchanged."}
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      <CvSelectionSheet
        visible={choosing}
        resumes={cv.resumes}
        selectedId={selectedId}
        loading={cv.loading || authLoading}
        error={authError ?? cv.listError}
        onClose={() => setChoosing(false)}
        onSelect={(id) => {
          form.update({ selectedId: id });
          setChoosing(false);
        }}
        onUpload={goToMyCvs}
        onRefresh={() => void cv.refresh()}
      />
    </AppScreen>
  );
}
