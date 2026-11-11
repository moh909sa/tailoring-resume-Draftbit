import { useCallback, useState } from "react";
import { ActivityIndicator, Platform, Pressable, View } from "react-native";
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/lib/auth/AuthProvider";
import { getEditorDocument } from "@/lib/editor/api";
import { readEditorRoute } from "@/lib/editor/routes";
import { loadEditorPdf, shareEditorPdf } from "@/lib/editor/pdf";
import type { EditorPdf } from "@/lib/editor/pdfTypes";
import { layoutTemplateName, type EditorLayout } from "@/lib/editor/layout";
import { PdfViewer } from "@/components/editor/PdfViewer";
import { PdfReadability } from "@/components/editor/PdfReadability";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import Icon from "@/lib/icons/LucideIcon";

type Preview = { ownerId: string; id: string; layout: EditorLayout | undefined; requestedRevision: number | undefined; title: string; pdf: EditorPdf };

export default function CvPdfPreview() {
  const params = useLocalSearchParams<{ id?: string | string[]; revision?: string | string[]; returnTo?: string; returnToEditor?: string }>();
  const route = readEditorRoute(params);
  const id = route.id;
  const expectedRevision = route.revision;
  const routeError = route.error;
  const router = useRouter();
  const { session, loading: authLoading } = useAuth();
  const ownerId = session?.user.id;
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [viewError, setViewError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const pdf = !routeError && preview && preview.ownerId === ownerId && preview.id === id && preview.requestedRevision === expectedRevision ? preview.pdf : null;
  const goBack = () => {
    if (params.returnToEditor === "1" && router.canGoBack()) {router.back();return;}
    if (!id) router.replace("/(tabs)/library/tailored-cvs");
    else if (routeError) router.replace({ pathname: "/cv-editor/[id]", params: { id } });
    else if (params.returnTo === "library" || !router.canGoBack()) router.replace("/(tabs)/library/tailored-cvs");
    else router.back();
  };
  const editResume = () => {
    if (!id || routeError || sharing) return;
    if(params.returnToEditor === "1" && router.canGoBack()){router.back();return;}
    router.push({ pathname: "/cv-editor/[id]", params: { id, returnTo: "preview", ...(params.returnTo === "library" ? {previewReturnTo:"library"} : {}) } });
  };

  useFocusEffect(useCallback(() => {
    setPreview(null);
    setError(null);
    setViewError(false);
    if (!ownerId || !id || routeError) { setLoading(false); return; }
    const controller = new AbortController();
    let current = true;
    let artifact: EditorPdf | null = null;
    setLoading(true);
    const timeout = setTimeout(() => controller.abort(), 120000);
    void (async () => {
      try {
        const document = await getEditorDocument(ownerId, id, controller.signal);
        if (!current) return;
        if (controller.signal.aborted) throw new Error("PDF preview canceled.");
        // An explicit revision is the immutable save acknowledged by the editor.
        // Export, download and readability checks all stay pinned to it.
        if (expectedRevision !== undefined && document.revision < expectedRevision) throw new Error("Your latest saved version is not available yet. Please try again.");
        const revision=expectedRevision ?? document.revision;
        const loadedPdf = await loadEditorPdf(ownerId, id, revision, controller.signal);
        artifact = loadedPdf;
        if (!current || controller.signal.aborted) { await loadedPdf.dispose(); return; }
        const title = [document.job.title, document.job.company].filter(Boolean).join(" · ") || "Your tailored CV";
        setPreview({ ownerId, id, layout:document.revision === revision ? document.layout : undefined, requestedRevision: expectedRevision, title, pdf: loadedPdf });
      } catch (cause) {
        if (current) setError(controller.signal.aborted ? "Generating your PDF took too long. Please try again." : cause instanceof Error ? cause.message : "Your PDF could not be loaded. Please try again.");
      } finally {
        clearTimeout(timeout);
        if (current) setLoading(false);
      }
    })();
    return () => {
      current = false;
      clearTimeout(timeout);
      controller.abort();
      setPreview(null);
      setLoading(false);
      void artifact?.dispose().catch(() => undefined);
    };
  }, [ownerId, id, expectedRevision, routeError, attempt]));

  async function download() {
    if (!pdf || sharing) return;
    setSharing(true);
    setError(null);
    try { await shareEditorPdf(pdf); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Your PDF could not be shared. Please try again."); }
    finally { setSharing(false); }
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      <Stack.Screen options={{ title: "Preview PDF", headerShown: false }} />
      <View className="w-full max-w-3xl flex-1 self-center">
        <View className="gap-3 border-b border-border px-4 py-3">
          <View className="flex-row items-center gap-3">
            <Pressable accessibilityRole="button" accessibilityLabel="Back" className="h-11 w-11 native:h-[44px] native:w-[44px] items-center justify-center rounded-full bg-secondary" onPress={goBack}><Icon name="ChevronLeft" className="h-5 w-5 text-foreground" /></Pressable>
            <View className="flex-1 gap-1"><Text accessibilityRole="header" numberOfLines={2} className="text-h5 text-foreground">{pdf ? preview?.title : "Your tailored CV"}</Text><Text className="text-caption text-muted-foreground">{pdf ? `${pdf.pageCount ? `${pdf.pageCount} ${pdf.pageCount === 1 ? "page" : "pages"} · ` : ""}Version ${pdf.revision}` : "PDF preview"}</Text></View>
            {params.returnToEditor === "1" ? <Button variant="ghost" className="min-h-11 native:min-h-[44px] min-w-11" accessibilityLabel="Done, return to editor" onPress={editResume}><Text className="text-primary">Done</Text></Button> : null}
          </View>
          <View className="flex-row items-center justify-between gap-3">
          <Text className="min-w-0 flex-1 text-caption text-muted-foreground">{preview?.layout ? `${layoutTemplateName(preview.layout.template)} · ${preview.layout.pageSize === "LETTER" ? "Letter" : "A4"}` : "Saved layout"}</Text>
          {params.returnToEditor !== "1" ? <Button variant="outline" accessibilityLabel="Edit Resume" className="min-h-11 native:min-h-[44px] flex-row gap-2 rounded-xl" disabled={!id || !!routeError || !ownerId || sharing} onPress={editResume}><Icon name="Pencil" className="h-4 w-4 text-foreground" /><Text>Edit Resume</Text></Button> : null}
          </View>
        </View>

        {/* Loading, error and document states keep the same NativeWind provider shape. */}
        {routeError ? <View className="flex-1 items-center justify-center gap-4 bg-background px-8"><Text accessibilityRole="alert" className="text-center text-body text-muted-foreground">{routeError}</Text><Button onPress={goBack}><Text>{id ? "Return to editor" : "Return to Tailored CVs"}</Text></Button></View> : authLoading || (ownerId && (loading || (!pdf && !error))) ? <View className="flex-1 items-center justify-center gap-4 bg-background px-8"><ActivityIndicator size="large" /><Text className="text-body text-muted-foreground">Preparing your saved CV…</Text></View> : !ownerId ? <View className="flex-1 items-center justify-center gap-4 bg-background px-8"><Text className="text-center text-body text-muted-foreground">Please sign in to preview your CV.</Text><Button onPress={editResume}><Text>Return to editor</Text></Button></View> : pdf ? <View className="flex-1 overflow-hidden bg-muted">{viewError ? <View className="flex-1 items-center justify-center px-8"><Text className="text-center text-body text-muted-foreground">The preview could not be displayed. Your PDF is ready to download below.</Text></View> : <PdfViewer key={pdf.uri} uri={pdf.uri} onError={() => setViewError(true)} />}</View> : <View className="flex-1 items-center justify-center gap-4 bg-background px-8"><Icon name="FileText" className="h-10 w-10 text-muted-foreground" /><Text className="text-center text-h4 text-foreground">PDF unavailable</Text><Text accessibilityRole="alert" className="text-center text-body text-muted-foreground">{error || "Your PDF could not be loaded."}</Text><Button onPress={() => setAttempt(value => value + 1)}><Text>Try again</Text></Button><Button variant="ghost" onPress={editResume}><Text>Edit Resume</Text></Button></View>}

        <View className="gap-2 border-t border-border px-4 py-3">
          {pdf && ownerId && id ? <PdfReadability key={pdf.uri} ownerId={ownerId} id={id} revision={pdf.revision} /> : null}
          {pdf && error ? <Text accessibilityRole="alert" className="text-body text-destructive">{error}</Text> : null}
          <Button className="min-h-[44px] flex-row gap-2 rounded-xl" disabled={!pdf || loading || sharing} onPress={() => void download()}>{sharing ? <ActivityIndicator /> : <Icon name="Download" className="h-5 w-5 text-primary-foreground" />}<Text>{sharing ? "Opening…" : "Download PDF"}</Text></Button>
          <Text className="text-center text-caption text-muted-foreground">{Platform.OS === "ios" ? "Choose Save to Files in the share sheet, or share your CV directly." : "Downloads the same saved document shown in this preview."}</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}
