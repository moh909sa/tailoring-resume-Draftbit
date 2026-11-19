import { isAuthError } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { authMessage } from "./emailLinks";

let pending: Promise<unknown> = Promise.resolve();

// Serialize account actions across Home and the existing Library sign-out.
function forAccount(ownerId: string, action: (client: NonNullable<typeof supabase>) => Promise<void>) {
  const next = pending.then(async () => {
    const client = supabase;
    if (!client) throw new Error("Please sign in again.");
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    if (data.session?.user.id !== ownerId) throw new Error("Your sign-in changed. Please sign in again.");
    await action(client);
  });
  pending = next.catch(() => undefined);
  return next;
}

export function signOutOfAccount(ownerId: string) {
  return forAccount(ownerId, async client => {
    const { error } = await client.auth.signOut({ scope: "local" });
    if (error) throw error;
  });
}

export function changeAccountPassword(ownerId: string, currentPassword: string, newPassword: string) {
  return forAccount(ownerId, async client => {
    const { error } = await client.auth.updateUser({ current_password: currentPassword, password: newPassword });
    if (error) throw error;
  });
}

export function passwordChangeMessage(error: unknown) {
  const code = isAuthError(error) ? error.code : undefined;
  if (code === "invalid_credentials" || code === "invalid_current_password") return "Your current password is incorrect.";
  if (code === "reauthentication_needed" || code === "session_expired" || code === "session_not_found") {
    return "Sign out and sign back in before changing your password.";
  }
  return authMessage(error, "password");
}
