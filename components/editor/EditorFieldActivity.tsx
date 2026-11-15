import { createContext, useCallback, useContext, useEffect, useRef, type ReactNode } from "react";

const Activity=createContext<((token:object,active:boolean)=>void)|undefined>(undefined);
export function EditorFieldActivity({onChange,resetKey,children}:{onChange:(editing:boolean)=>void;resetKey?:string;children:ReactNode}){
  const active=useRef(new Set<object>()),notify=useRef(onChange);notify.current=onChange;
  useEffect(()=>{active.current.clear();notify.current(false);},[resetKey]);
  const report=useCallback((token:object,editing:boolean)=>{if(editing)active.current.add(token);else active.current.delete(token);notify.current(active.current.size>0);},[]);
  return <Activity.Provider value={report}>{children}</Activity.Provider>;
}
export function useEditorFieldActivity(){
  const report=useContext(Activity),token=useRef({});
  useEffect(()=>{const key=token.current;return()=>report?.(key,false);},[report]);
  return (active:boolean)=>report?.(token.current,active);
}
