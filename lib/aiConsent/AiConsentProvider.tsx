import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, ScrollView, View } from "react-native";
import { usePathname } from "expo-router";
import { AppSheet } from "@/components/layout/AppSheet";
import { Notice } from "@/components/cv/Notice";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { useAuth } from "@/lib/auth/AuthProvider";
import { CvApiError, getAiConsent, saveAiConsent, type AiConsent } from "@/lib/cv/api";

const ConsentContext = createContext<{
  withConsent: (start: () => void) => void;
  manageConsent: () => void;
} | null>(null);

export function useAiConsent() {
  const consent = useContext(ConsentContext);
  if (!consent) throw new Error("AI consent requires its provider.");
  return consent;
}

type Request = {
  owner: string;
  route: string;
  controller: AbortController;
  start?: () => void;
  saving: boolean;
};

export function AiConsentProvider({ children }: { children: ReactNode }) {
  const owner = useAuth().session?.user.id;
  const route = usePathname();
  const view = useRef({ owner, route });
  view.current = { owner, route };
  const pending = useRef<Request | null>(null);
  const [sheet, setSheet] = useState<{ request: Request; notice?: AiConsent; error?: string; saving?: boolean } | null>(null);

  useEffect(() => () => {
    const request = pending.current;
    if (request?.owner === owner && request?.route === route) {
      request.controller.abort();
      pending.current = null;
      setSheet((current) => current?.request === request ? null : current);
    }
  }, [owner, route]);

  function isActive(request: Request) {
    return pending.current === request && view.current.owner === request.owner && view.current.route === request.route;
  }

  function cancel(request: Request) {
    request.controller.abort();
    if (pending.current !== request) return;
    pending.current = null;
    setSheet(null);
  }

  async function load(request: Request, showLoading = true) {
    if (!isActive(request) || request.saving) return;
    if (showLoading) setSheet({ request });
    try {
      const notice = await getAiConsent(request.owner, request.controller.signal);
      if (!isActive(request)) return;
      if (request.start && notice.accepted === true) {
        cancel(request);
        request.start();
      } else {
        setSheet({ request, notice });
      }
    } catch {
      if (isActive(request)) {
        setSheet({ request, error: "We couldn’t check AI data sharing. Try again in a moment." });
      }
    }
  }

  function open(start?: () => void) {
    if (!owner || (pending.current && isActive(pending.current))) return;
    pending.current?.controller.abort();
    const request = { owner, route, controller: new AbortController(), start, saving: false };
    pending.current = request;
    void load(request, !start);
  }

  async function choose(visible: NonNullable<typeof sheet>, accepted: boolean) {
    const { request, notice } = visible;
    if (!notice || !isActive(request) || request.saving) return;
    request.saving = true;
    setSheet({ request, notice, saving: true });
    try {
      const saved = await saveAiConsent(request.owner, notice.version, accepted, request.controller.signal);
      if (!isActive(request)) return;
      if (saved.version !== notice.version || saved.accepted !== accepted) throw new Error("Choice was not saved.");
      setSheet({ request, notice: saved });
    } catch (error) {
      if (!isActive(request)) return;
      if (error instanceof CvApiError && error.status === 409) {
        request.saving = false;
        await load(request);
        return;
      }
      setSheet({ request, notice, error: "Couldn’t save your choice. Check your connection and try again." });
    } finally {
      request.saving = false;
    }
  }

  const visible = sheet && isActive(sheet.request) ? sheet : null;
  return (
    <ConsentContext.Provider value={{ withConsent: open, manageConsent: () => open() }}>
      {children}
      {visible ? (
        <AppSheet visible onClose={() => { if (!visible.request.saving) cancel(visible.request); }}>
          <ScrollView contentContainerClassName="grow gap-6 px-6 pb-8 pt-8">
            <View className="gap-3">
              <Text accessibilityRole="header" className="text-h2 text-foreground">AI data sharing</Text>
              <Text className="text-body leading-6 text-muted-foreground">
                Choose whether to share CV information with AI providers to read your CV, tailor it to a role and apply keywords.
              </Text>
            </View>
            {visible.notice ? (
              <>
                <View className="gap-4 rounded-2xl border border-border bg-card p-5">
                  <View className="gap-1">
                    <Text className="text-h6 text-foreground">What’s shared</Text>
                    <Text className="text-body leading-6 text-muted-foreground">
                      CV text, including any contact details it contains, your job description and selected keywords.
                    </Text>
                  </View>
                  <View className="gap-1">
                    <Text className="text-h6 text-foreground">Who receives it</Text>
                    <Text className="text-body leading-6 text-muted-foreground">{visible.notice.recipients.join(", ")}</Text>
                  </View>
                  <View className="gap-1">
                    <Text className="text-h6 text-foreground">Provider retention</Text>
                    <Text className="text-body leading-6 text-muted-foreground">{visible.notice.retention}</Text>
                  </View>
                </View>
                <Text className="text-body leading-6 text-muted-foreground">
                  You can still open, edit and download saved CVs if you decline. Change your choice in My Account.
                </Text>
              </>
            ) : null}
            {visible.error ? <Notice tone="error" message={visible.error} /> : null}
            {visible.notice ? (
              <View className="gap-3">
                {visible.notice.accepted === true ? (
                  <Notice tone="success" message={visible.request.start ? "AI processing is allowed. Close this screen and try your action again." : "AI processing is allowed."} />
                ) : (
                  <Button className="min-h-12 rounded-xl" disabled={visible.saving} onPress={() => void choose(visible, true)}>
                    <Text>{visible.saving ? "Saving…" : "Allow AI processing"}</Text>
                  </Button>
                )}
                {visible.notice.accepted === false ? (
                  <Text accessibilityLiveRegion="polite" className="text-body text-muted-foreground">AI processing is off.</Text>
                ) : (
                  <Button variant="outline" className="min-h-12 rounded-xl" disabled={visible.saving} onPress={() => void choose(visible, false)}>
                    <Text>{visible.saving ? "Saving…" : "Decline"}</Text>
                  </Button>
                )}
              </View>
            ) : visible.error ? (
              <Button className="min-h-12 rounded-xl" onPress={() => void load(visible.request)}><Text>Try again</Text></Button>
            ) : (
              <View className="flex-row items-center gap-3" accessibilityLiveRegion="polite">
                <ActivityIndicator /><Text className="text-body text-muted-foreground">Checking your choice…</Text>
              </View>
            )}
            <Button variant="ghost" className="min-h-11" disabled={visible.saving} onPress={() => cancel(visible.request)}>
              <Text>Close</Text>
            </Button>
          </ScrollView>
        </AppSheet>
      ) : null}
    </ConsentContext.Provider>
  );
}
