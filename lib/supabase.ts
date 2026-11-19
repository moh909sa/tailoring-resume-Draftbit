import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import { Platform } from "react-native";
import type { EmailLinkKind } from "@/lib/auth/redirects";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const authConfigurationError =
  !url || !key
    ? "Sign-in is not configured yet. Please contact support."
    : !key.startsWith("sb_publishable_")
      ? "Sign-in requires a Supabase publishable key. Please contact support."
      : null;

export const supabase =
  url && key && !authConfigurationError
    ? createClient(url, key, {
        auth: {
          ...(Platform.OS !== "web" ? { storage: AsyncStorage } : {}),
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: false,
        },
      })
    : null;

export function createEmailLinkClient(kind: EmailLinkKind) {
  if (!url || !key || authConfigurationError) return null;
  const memory = new Map<string, string>();
  const verifierStorage = Platform.OS === "web" ? globalThis.window.localStorage : AsyncStorage;
  // Keep only the verifier across launches. The temporary email-link session
  // lives in memory and uses a separate namespace from the signed-in account.
  return createClient(url, key, {
    auth: {
      storageKey: "resume-email-link-" + kind,
      flowType: "pkce",
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: true,
      storage: {
        getItem: key => key.endsWith("-code-verifier") ? verifierStorage.getItem(key) : memory.get(key) ?? null,
        setItem: async (key, value) => {
          if (key.endsWith("-code-verifier")) await verifierStorage.setItem(key, value);
          else memory.set(key, value);
        },
        removeItem: async key => {
          if (key.endsWith("-code-verifier")) await verifierStorage.removeItem(key);
          else memory.delete(key);
        },
      },
    },
  });
}
