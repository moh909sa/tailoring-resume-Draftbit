import { useEffect, useRef, useState } from "react";
import { loadEditorPdf } from "./pdf";
import { emptyLivePreview, LivePreview, previewKey, type PreviewTarget } from "./livePreview";

export function useLivePreview(target:PreviewTarget|null){
  const [state,setState]=useState(emptyLivePreview);
  const current=useRef<LivePreview|null>(null);
  useEffect(()=>{
    const controller=new LivePreview({load:(value,signal)=>loadEditorPdf(value.ownerId,value.id,value.revision,signal),onState:setState});
    current.current=controller;return()=>{controller.dispose();if(current.current===controller)current.current=null;};
  },[]);
  useEffect(()=>{current.current?.update(target);},[target?.ownerId,target?.id,target?.revision,target?.ready]);
  useEffect(()=>{current.current?.releaseRetired();},[state.pdf]);
  const key=target?previewKey(target.ownerId,target.id):"";
  return {...(state.key===key?state:emptyLivePreview()),retry:()=>current.current?.retry(),retain:(pdf:NonNullable<typeof state.pdf>)=>current.current?.retain(pdf)??(()=>{})};
}
