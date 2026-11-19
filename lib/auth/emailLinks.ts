import { isAuthError, isAuthRetryableFetchError } from "@supabase/supabase-js";
import { Platform } from "react-native";
import { createEmailLinkClient, supabase } from "@/lib/supabase";
import { ensureLinkCrypto } from "./linkCrypto";
import { emailLinkRedirect, type EmailLinkKind } from "./redirects";

export const minimumPasswordLength = 8;
export const passwordHint = "Use at least 8 characters.";
export const resetEmailSent = "If an account exists for that email, we’ll send a reset link. Open the latest email on this same device.";
export const confirmEmailSent = "Check your email for a confirmation link. Then sign in with your password.";

const fallbackMessages = {
  signIn: "Couldn’t sign in. Try again.",
  create: "Couldn’t create the account. Try again.",
  confirm: "Couldn’t send a confirmation email. Try again.",
  recovery: "Couldn’t send a reset email. Try again.",
  password: "Couldn’t change your password. Try again.",
};

export function authMessage(error: unknown, action: keyof typeof fallbackMessages) {
  const code = isAuthError(error) ? error.code : undefined;
  if (isAuthRetryableFetchError(error)) return "Check your connection and try again.";
  if (code === "invalid_credentials") return "The email or password is incorrect.";
  if (code === "email_not_confirmed") return "Confirm your email before signing in. You can request a new confirmation link below.";
  if (code === "over_email_send_rate_limit" || code === "over_request_rate_limit") return "Too many attempts. Wait a moment and try again.";
  if (code === "same_password") return "Choose a password different from your current one.";
  if (code === "weak_password" && isAuthError(error)) return error.message;
  if (code === "email_address_not_authorized") return "Email delivery is unavailable. Please contact support.";
  return fallbackMessages[action];
}

const clients: Partial<Record<EmailLinkKind, NonNullable<ReturnType<typeof createEmailLinkClient>>>> = {};

function linkClient(kind: EmailLinkKind) {
  ensureLinkCrypto();
  const client = clients[kind] ?? createEmailLinkClient(kind);
  if (!client) throw new Error("Sign-in is unavailable.");
  clients[kind] = client;
  return client;
}

function redirect(kind: EmailLinkKind) {
  return emailLinkRedirect(kind, Platform.OS === "web" ? globalThis.window.location.origin : undefined);
}

export async function createEmailAccount(email: string, password: string) {
  const client = linkClient("confirm");
  const { data, error } = await client.auth.signUp({
    email, password, options: { emailRedirectTo: redirect("confirm") },
  });
  if (error) throw error;
  if (!data.session) return false;
  // Preserve sign-up on installations with email confirmation disabled.
  const signedIn = await supabase?.auth.signInWithPassword({ email, password });
  await client.auth.signOut({ scope: "local" }).catch(() => undefined);
  if (!signedIn?.data.session) throw signedIn?.error ?? new Error("Sign-in is unavailable.");
  return true;
}

export async function sendConfirmationEmail(email: string) {
  const { error } = await linkClient("confirm").auth.resend({
    email, type: "signup", options: { emailRedirectTo: redirect("confirm") },
  });
  if (error && error.code !== "user_not_found") throw error;
}

export async function sendPasswordResetEmail(email: string) {
  const { error } = await linkClient("recovery").auth.resetPasswordForEmail(email, {
    redirectTo: redirect("recovery"),
  });
  if (error && error.code !== "user_not_found") throw error;
}

export class EmailLinkError extends Error {
  constructor(readonly reason: "invalid" | "differentDevice" | "unavailable") {
    super(reason);
  }
}

export type PasswordReset = {
  kind: "recovery";
  email: string;
  save: (password: string) => Promise<void>;
  close: () => Promise<void>;
};

let operation: Promise<unknown> = Promise.resolve();
let activeReset: symbol | null = null;

function serialize<T>(work: () => Promise<T>) {
  const next = operation.then(work, work);
  operation = next;
  return next;
}

export function openEmailLink(kind: EmailLinkKind, code: string): Promise<PasswordReset | { kind: "confirm" }> {
  return serialize(async () => {
    const client = linkClient(kind);
    const { data, error } = await client.auth.exchangeCodeForSession(code);
    if (error?.name === "AuthPKCECodeVerifierMissingError") throw new EmailLinkError("differentDevice");
    if (isAuthRetryableFetchError(error)) throw new EmailLinkError("unavailable");
    const session = data.session;
    if (error || !session) throw new EmailLinkError("invalid");
    if (kind === "confirm") {
      await client.auth.signOut({ scope: "local" }).catch(() => undefined);
      return { kind };
    }
    const id = Symbol();
    activeReset = id;
    const close = async () => {
      if (activeReset !== id) return;
      activeReset = null;
      await client.auth.signOut({ scope: "local" });
    };
    return {
      kind,
      email: session.user.email ?? "",
      save: password => serialize(async () => {
        if (activeReset !== id) throw new EmailLinkError("invalid");
        if (session.expires_at && session.expires_at * 1000 <= Date.now()) {
          await close().catch(() => undefined);
          throw new EmailLinkError("invalid");
        }
        const { error: updateError } = await client.auth.updateUser({ password });
        if (updateError) {
          if (updateError.code === "session_not_found" || updateError.code === "refresh_token_not_found" ||
              updateError.code === "bad_jwt" || updateError.name === "AuthSessionMissingError") {
            throw new EmailLinkError("invalid");
          }
          throw updateError;
        }
        // The password change is confirmed even if revoking the temporary session fails.
        await close().catch(() => undefined);
      }),
      close: () => serialize(close),
    };
  });
}
