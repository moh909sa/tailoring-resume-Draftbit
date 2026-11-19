import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { AppState, Platform } from "react-native";
import { isAuthRetryableFetchError, type Session } from "@supabase/supabase-js";
import { authConfigurationError, supabase } from "@/lib/supabase";

type AuthState = { session: Session | null; loading: boolean; error: string | null };
const AuthContext = createContext<AuthState>({ session: null, loading: true, error: null });
const restoreMessage = "Couldn’t restore your sign-in. Check your connection or sign in again.";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    session: null,
    loading: !!supabase,
    error: authConfigurationError,
  });

  useEffect(() => {
    const client = supabase;
    if (!client) return;
    let active = true;
    let authRevision = 0;
    let restoring = false;
    let restoreAgain = false;

    const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
      // The explicit session read owns initialization and its error state.
      if (!active || event === "INITIAL_SESSION") return;
      authRevision++;
      setState({ session, loading: false, error: null });
    });

    async function restore() {
      if (!active || !client) return;
      if (restoring) {
        restoreAgain = true;
        return;
      }
      restoring = true;
      const revision = authRevision;
      try {
        const { data, error } = await client.auth.getSession();
        if (!active || revision !== authRevision) return;
        if (isAuthRetryableFetchError(error)) {
          setState(current => ({ ...current, loading: false, error: restoreMessage }));
        } else {
          setState({ session: data.session, loading: false, error: null });
        }
      } catch {
        if (active && revision === authRevision) {
          setState(current => ({ ...current, loading: false, error: restoreMessage }));
        }
      } finally {
        restoring = false;
        if (restoreAgain) {
          restoreAgain = false;
          void restore();
        }
      }
    }

    const native = Platform.OS !== "web";
    const appState = native ? AppState.addEventListener("change", nextState => {
      if (nextState === "active") {
        client.auth.startAutoRefresh();
        void restore();
      } else {
        restoreAgain = false;
        client.auth.stopAutoRefresh();
      }
    }) : null;
    if (native) {
      if (AppState.currentState === "active") client.auth.startAutoRefresh();
      else client.auth.stopAutoRefresh();
    }
    void restore();

    return () => {
      active = false;
      subscription.unsubscribe();
      appState?.remove();
      if (native) client.auth.stopAutoRefresh();
    };
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
