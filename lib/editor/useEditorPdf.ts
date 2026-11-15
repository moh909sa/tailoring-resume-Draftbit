import { useEffect, useRef, useState } from "react";
import { EditorPdfPreview, pdfEditSignature, type PdfEditorInput, type EditorPdfState } from "./editorPdfPreview";
import { emptyLivePreview } from "./livePreview";
import { loadEditorPdf } from "./pdf";
import { editorPdfArtifacts } from "./pdfArtifacts";
import type { EditorDocument } from "./types";

export function useEditorPdf(input:PdfEditorInput|null,saveForPdf:()=>Promise<EditorDocument|null>){
  const [state,setState]=useState<EditorPdfState>(()=>({...emptyLivePreview(),saving:false,saveError:null,acknowledged:null,signature:null}));
  const latest=useRef({input,saveForPdf});latest.current={input,saveForPdf};
  const manager=useRef<EditorPdfPreview|null>(null);
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
  useEffect(()=>{
    const controller=manager.current,doc=state.acknowledged,pdf=state.pdf;
    if(!input||!controller||!doc||!pdf||doc.revision!==pdf.revision||doc.tailoring_id!==input.id||state.key!==JSON.stringify([input.ownerId,input.id]))return;
    const cleanup=editorPdfArtifacts.publish(input.ownerId,input.id,{pdf,layout:doc.layout,title:[doc.job.title,doc.job.company].filter(Boolean).join(" · ")||"Your tailored CV",retain:()=>controller.retain(pdf)});
    controller.releaseRetired();return cleanup;
  },[input?.ownerId,input?.id,state.pdf,state.acknowledged]);
  const ready=manager.current?.matches(input)??false;
  const sameOwner=!!input&&state.key===JSON.stringify([input.ownerId,input.id]);
  return {...state,pdf:sameOwner?state.pdf:null,ready,retry:()=>manager.current?.retry(),retain:()=>state.pdf?manager.current?.retain(state.pdf)??(()=>{}):()=>{}};
}
