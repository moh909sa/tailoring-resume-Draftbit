import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { useFocusEffect } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import { useAuth } from "@/lib/auth/AuthProvider";
import { getEditorDocument, saveEditorDocument, recalculateEditorAnalysis } from "./api";
import { parseEditorDocument, type JsonObject } from "./types";
import { CvEditorSession, editorStorageKey, emptyEditorState, type EditorState, type EditorWorkspace } from "./session";
import type { EditorLayout } from "./layout";
import { EditorInstances } from "./instances";
import { readEditorRoute } from "./routes";

// Old network completions may finish after navigating away. Fence writes by
// session generation and serialize storage so they cannot erase a newer draft.
const generations = new Map<string, number>();
const storageWrites = new Map<string, Promise<unknown>>();
const instances=new EditorInstances();

export function useCvEditor(routeId: string | string[] | undefined) {
  const route = readEditorRoute({ id: routeId });
  const tailoringId = route.id ?? "";
  const {session, loading: authLoading} = useAuth();
  const ownerId = session?.user.id;
  const key = ownerId && tailoringId ? editorStorageKey(ownerId, tailoringId) : "";
  const current = useRef<{key: string; manager: CvEditorSession} | null>(null);
  const [snapshot, setSnapshot] = useState<{key:string;value:EditorState}>({key:"",value:emptyEditorState()});
  useEffect(() => {
    if (!key || !ownerId) return;
    const lease=instances.acquire(key,emit=>{
      const generation=(generations.get(key)??0)+1;
      generations.set(key,generation);
      const manager=new CvEditorSession({
        read:async()=>{await storageWrites.get(key)?.catch(()=>undefined);return AsyncStorage.getItem(key);},
        write:raw=>{
          const write=(storageWrites.get(key)??Promise.resolve()).catch(()=>undefined).then(()=>generations.get(key)===generation?AsyncStorage.setItem(key,raw):undefined);
          storageWrites.set(key,write);return write;
        },
        uuid:()=>Crypto.randomUUID(),parseDocument:parseEditorDocument,
        load:signal=>getEditorDocument(ownerId,tailoringId,signal),
        save:(body,signal)=>saveEditorDocument(ownerId,tailoringId,body,signal),
        analyze:(revision,signal)=>recalculateEditorAnalysis(ownerId,tailoringId,revision,signal),
        onState:emit,
      });
      const listener=AppState.addEventListener("change",state=>manager.setActive(state==="active"));
      return {manager,detach:()=>listener.remove()};
    });
    current.current={key,manager:lease.manager};
    lease.subscribe(value=>setSnapshot({key,value}));
    return()=>{lease.release();if(current.current?.manager===lease.manager)current.current=null;};
  }, [key,ownerId,tailoringId]);
  useFocusEffect(useCallback(() => { const active = current.current; if(active?.key === key) void active.manager.refresh(); }, [key]));
  const value = snapshot.key === key && key ? snapshot.value : {
    ...emptyEditorState(),
    loading: !route.error && (authLoading || !!ownerId),
    error: route.error ?? (!authLoading && !ownerId ? "Sign in to open your saved CV." : null),
  };
  const getManager = () => current.current?.key === key ? current.current.manager : null;
  return {
    ...value,
    routeError: route.error,
    getSnapshot:()=>getManager()?.snapshot ?? null,
    updateResume: (resume: JsonObject, skills?: string[]) => getManager()?.update(resume,skills),
    updateLayoutDraft: (layout: EditorLayout) => getManager()?.updateLayoutDraft(layout),
    updateWorkspace: (patch: Partial<EditorWorkspace>) => getManager()?.updateWorkspace(patch),
    saveForPdf: async () => (await getManager()?.saveForPdf()) ?? null,
    updateLayout: (layout: EditorLayout) => {const m=getManager();if(m?.snapshot.resume) m.update(m.snapshot.resume,m.snapshot.confirmedSkills,layout);},
    updateConfirmedSkills: (skills: string[]) => {const m=getManager();if(m?.snapshot.resume) m.update(m.snapshot.resume,skills);},
    reload: async () => {await getManager()?.refresh();},
    flush: async () => (await getManager()?.flush()) ?? null,
    resolveConflict: async (mode:"local"|"server") => {await getManager()?.resolveConflict(mode);},
    refreshAnalysis: async () => {await getManager()?.refreshAnalysis();},
  };
}
