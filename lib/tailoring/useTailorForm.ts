import { useEffect, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { TailoringInput } from "./types";

type Form = { selectedId: string | null; description: string };
const empty: Form = { selectedId: null, description: "" };
const writes = new Map<string, Promise<unknown>>();

// Save preparation separately from submitted jobs: editing the next opportunity
// must never change the exact inputs used to recover an existing paid job.
export function useTailorForm(ownerId: string | null, previous: TailoringInput | null, recovering: boolean) {
  const key = ownerId ? "tailoring-form-v1:" + ownerId : "";
  const [state, setState] = useState({ key: "", form: empty, loading: !!ownerId, saving: false, error: null as string | null });
  const current = useRef(state);
  const activeKey = useRef(key);
  activeKey.current = key;
  const loadedKey = useRef<string | null>(null);
  const guestPreparation = useRef<Form | null>(null);

  useEffect(() => {
    // Carry only text typed while signed out into the immediately following
    // sign-in. Never carry a previous account’s preparation into another account.
    guestPreparation.current = key && !current.current.key && current.current.form.description ? current.current.form : null;
    loadedKey.current = null;
    const next = { key, form: empty, loading: !!key, saving: false, error: null };
    current.current = next;
    setState(next);
  }, [key]);

  useEffect(() => {
    if (!key || recovering || loadedKey.current === key) return;
    loadedKey.current = key;
    let live = true;
    let completed = false;
    const guest = guestPreparation.current;
    void (async () => {
      let form: Form = previous ? { selectedId: previous.resumeId, description: previous.jobDescription } : empty;
      let error: string | null = null;
      try {
        await writes.get(key)?.catch(() => undefined);
        const raw = await AsyncStorage.getItem(key);
        if (raw) {
          const value: unknown = JSON.parse(raw);
          if (typeof value === "object" && value !== null && "description" in value && typeof value.description === "string" && "selectedId" in value && (value.selectedId === null || typeof value.selectedId === "string")) {
            form = { selectedId: value.selectedId, description: value.description };
          }
        }
      } catch {
        error = "We couldn’t restore your preparation draft from this device.";
      }
      if (!live || activeKey.current !== key) return;
      if (guest) {
        form = { ...form, description: guest.description };
        const write = (writes.get(key) ?? Promise.resolve()).catch(() => undefined).then(() => AsyncStorage.setItem(key, JSON.stringify(form)));
        writes.set(key, write);
        try { await write; } catch { error = "Your preparation draft couldn’t be saved on this device. Keep this screen open until you start tailoring."; }
        if (!live || activeKey.current !== key) return;
        guestPreparation.current = null;
      }
      completed = true;
      const next = { key, form, loading: false, saving: false, error };
      current.current = next;
      setState(next);
    })();
    return () => { live = false; if (!completed && loadedKey.current === key) loadedKey.current = null; };
  }, [key, previous, recovering]);

  function update(patch: Partial<Form>) {
    const before = current.current;
    if (before.key !== key || before.loading) return;
    const form = { ...before.form, ...patch };
    const next = { key, form, loading: false, saving: !!key, error: null };
    current.current = next;
    setState(next);
    if (!key) return;
    const write = (writes.get(key) ?? Promise.resolve()).catch(() => undefined).then(() => AsyncStorage.setItem(key, JSON.stringify(form)));
    writes.set(key, write);
    void write.then(() => {
      if (activeKey.current === key && current.current === next) {
        current.current = { ...next, saving: false };
        setState(current.current);
      }
    }, () => {
      if (activeKey.current === key && current.current === next) {
        current.current = { ...next, saving: false, error: "Your preparation draft couldn’t be saved on this device. Keep this screen open until you start tailoring." };
        setState(current.current);
      }
    });
  }
  return { ...(state.key === key ? state : { key, form: empty, loading: !!key, saving: false, error: null }), update };
}
