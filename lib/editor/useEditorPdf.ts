import { useCallback, useEffect, useRef, useState } from "react";
import { EditorPdfPreview, pdfEditSignature, type PdfEditorInput, type EditorPdfState } from "./editorPdfPreview";
import { emptyLivePreview, previewKey } from "./livePreview";
import { loadEditorPdf } from "./pdf";
import { editorPdfArtifacts } from "./pdfArtifacts";
import type { EditorDocument } from "./types";
import type { EditorPdf } from "./pdfTypes";

export function useEditorPdf(input:PdfEditorInput|null,saveForPdf:()=>Promise<EditorDocument|null>){
  const [state,setState]=useState<EditorPdfState>(()=>({...emptyLivePreview(),saving:false,saveError:null,acknowledged:null,signature:null}));
  const [visible,setVisible]=useState<{key:string;pdf:EditorPdf}|null>(null);
  const latest=useRef({input,saveForPdf});latest.current={input,saveForPdf};
  const manager=useRef<EditorPdfPreview|null>(null);
  const loaded=useRef(new Set<EditorPdf>());
  const signature=input?pdfEditSignature(input.resume,input.layout,input.skills):null;
  useEffect(()=>{
    const controller=new EditorPdfPreview({save:async target=>{
      const value=latest.current;
      return value.input?.ownerId===target.ownerId&&value.input.id===target.id?value.saveForPdf():null;
    },load:(target,signal)=>loadEditorPdf(target.ownerId,target.id,target.revision,signal),onState:setState});
    manager.current=controller;
    return()=>{controller.dispose();if(manager.current===controller)manager.current=null;};
  },[]);
  useEffect(()=>{manager.current?.update(latest.current.input);},[signature,input?.ownerId,input?.id,input?.editing,input?.revision,input?.saveState]);
  const key=input?previewKey(input.ownerId,input.id):"";
  const sameOwner=!!input&&state.key===key;
  const shown=sameOwner&&visible?.key===key?visible.pdf:null;
  const candidate=sameOwner?state.pdf:null;
  // Keep both files alive while the new viewer loads under the mounted old page.
  useEffect(()=>candidate?manager.current?.retain(candidate):undefined,[candidate]);
  useEffect(()=>shown?manager.current?.retain(shown):undefined,[shown]);
  useEffect(()=>{
    const controller=manager.current,doc=state.acknowledged;
    if(!input||!controller||!doc||!shown||doc.revision!==shown.revision||doc.tailoring_id!==input.id)return;
    const cleanup=editorPdfArtifacts.publish(input.ownerId,input.id,{pdf:shown,layout:doc.layout,title:[doc.job.title,doc.job.company].filter(Boolean).join(" · ")||"Your tailored CV",retain:()=>controller.retain(shown)});
    controller.releaseRetired();return cleanup;
  },[input?.ownerId,input?.id,shown,state.acknowledged]);
  const onViewerReady=useCallback((pdf:EditorPdf)=>{
    const controller=manager.current,value=latest.current.input;
    if(!controller||!value||controller.snapshot.pdf!==pdf)return;
    loaded.current.add(pdf);
    if(!controller.matches(value))return;
    controller.viewerReady(pdf);setVisible({key:previewKey(value.ownerId,value.id),pdf});
  },[]);
  useEffect(()=>{
    for(const file of loaded.current)if(file!==candidate&&file!==shown)loaded.current.delete(file);
    if(candidate&&shown!==candidate&&loaded.current.has(candidate))onViewerReady(candidate);
  },[candidate,shown,signature,input?.revision,input?.saveState,state.updating,onViewerReady]);
  const ready=(manager.current?.matches(input)??false)&&shown===candidate&&!!shown;
  return {...state,pdf:shown??candidate,pendingPdf:shown&&candidate!==shown?candidate:null,ready,onViewerReady,formatTap:()=>manager.current?.formatTap(),retry:()=>manager.current?.retry(),retain:()=>shown?manager.current?.retain(shown)??(()=>{}):()=>{}};
}
