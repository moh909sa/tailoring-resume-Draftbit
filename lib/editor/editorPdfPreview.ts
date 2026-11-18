import { LivePreview, previewKey, type LivePreviewState, type PreviewTarget } from "./livePreview";
import type { EditorDocument } from "./types";
import type { EditorLayout } from "./layout";
import type { EditorPdf } from "./pdfTypes";
import type { SaveState } from "./session";
import { PdfPreviewTimings } from "./pdfPreviewTimings";

export type PdfEditorInput = {ownerId:string;id:string;resume:EditorDocument["resume"];layout:EditorLayout|null;skills:string[];revision:number;editing:boolean;saveState:SaveState};
export const pdfEditSignature = (resume:EditorDocument["resume"],layout:EditorLayout|null|undefined,skills:string[]) => JSON.stringify([resume,layout??null,skills]);
export type EditorPdfState = LivePreviewState & {saving:boolean;saveError:string|null;acknowledged:EditorDocument|null;signature:string|null};
type Dependencies={save:(input:PdfEditorInput)=>Promise<EditorDocument|null>;load:(target:PreviewTarget,signal:AbortSignal)=>Promise<EditorPdf>;onState:(state:EditorPdfState)=>void;delay?:number};

// Content autosaves remain independent. Only field completion or a formatting
// pause asks the existing serialized writer for a PDF-ready acknowledgement.
export class EditorPdfPreview {
  private live:LivePreview;
  private timing:PdfPreviewTimings|null=null;
  private input:PdfEditorInput|null=null;
  private signature:string|null=null;
  private renderedSignature:string|null=null;
  private acknowledged:EditorDocument|null=null;
  private saving=false;
  private writer:Promise<EditorDocument|null>|null=null;
  private saveError:string|null=null;
  private generation=0;
  private timer:ReturnType<typeof setTimeout>|null=null;
  private disposed=false;
  constructor(private deps:Dependencies){this.live=new LivePreview({load:async(target,signal)=>{
    const timing=this.timing;timing?.mark("pdfFetchStart");
    try{return await deps.load(target,signal);}finally{timing?.mark("pdfFetchEnd");}
  },delay:0,onState:()=>this.emit()});}
  formatTap(){const start=this.timing?.burstStart;this.timing?.cancel();this.timing=new PdfPreviewTimings(start);}
  viewerReady(pdf:EditorPdf){if(this.live.snapshot.pdf===pdf)this.timing?.mark("viewerReady");}
  get snapshot():EditorPdfState{return {...this.live.snapshot,saving:this.saving,saveError:this.saveError,acknowledged:this.acknowledged,signature:this.renderedSignature};}
  private emit(){if(!this.disposed)this.deps.onState(this.snapshot);}
  private stop(){if(this.timer)clearTimeout(this.timer);this.timer=null;this.generation++;}
  update(input:PdfEditorInput|null){
    if(this.disposed)return;
    const previous=this.input,signature=input?pdfEditSignature(input.resume,input.layout,input.skills):null;
    const ownerChanged=previous?.ownerId!==input?.ownerId||previous?.id!==input?.id;
    const changed=ownerChanged||this.signature!==signature||previous?.editing!==input?.editing;
    const revisionChanged=previous?.revision!==input?.revision;
    const conflictResolved = previous?.saveState === "conflict" && input?.saveState !== "conflict";
    const formattingOnly=!!previous && !!input && previous.editing===input.editing && JSON.stringify(previous.layout)!==JSON.stringify(input.layout) && JSON.stringify([previous.resume,previous.skills])===JSON.stringify([input.resume,input.skills]);
    this.input=input;this.signature=signature;
    if(!changed&&!conflictResolved&&(!revisionChanged||this.saving||this.acknowledged?.revision===input?.revision))return;
    this.stop();this.saveError=null;this.saving=false;
    if(ownerChanged){this.timing?.cancel();this.timing=null;this.acknowledged=null;this.renderedSignature=null;}
    this.live.update(input?{ownerId:input.ownerId,id:input.id,revision:input.revision,ready:false}:null);
    this.emit();
    if(!input||input.editing)return;
    this.schedule(ownerChanged?0:this.deps.delay??(formattingOnly?400:700));
  }
  private schedule(delay:number){
    const generation=this.generation;
    this.timer=setTimeout(()=>{this.timer=null;void this.prepare(generation);},delay);
  }
  private async prepare(generation:number){
    const input=this.input,signature=this.signature,timing=this.timing;
    if(!input||input.editing||generation!==this.generation||this.disposed)return;
    timing?.mark("debounceEnd");this.saving=true;this.emit();
    try{
      if(this.writer)await this.writer.catch(()=>null);
      if(this.disposed||generation!==this.generation)return;
      timing?.mark("saveStart");const task=this.deps.save(input);this.writer=task;
      let saved:EditorDocument|null;
      try{saved=await task;}finally{timing?.mark("saveEnd");if(this.writer===task)this.writer=null;}
      if(this.disposed||generation!==this.generation)return;
      if(!saved)throw new Error("Your CV could not be saved for PDF. Your edits are kept here. Resolve any save conflict, then retry.");
      if(pdfEditSignature(saved.resume,saved.layout,saved.confirmed_skills)!==signature)throw new Error("Your saved CV changed while updating. Your edits are safe. Retry to display the latest version.");
      this.acknowledged=saved;this.renderedSignature=signature;this.saving=false;this.saveError=null;
      this.live.update({ownerId:input.ownerId,id:input.id,revision:saved.revision,ready:true});this.emit();
    }catch(error){if(!this.disposed&&generation===this.generation){this.saving=false;this.saveError=error instanceof Error?error.message:"Your CV could not be saved for PDF. Retry updating.";this.emit();}}
  }
  matches(input:PdfEditorInput|null){return !!input&&!input.editing&&!this.saving&&!this.saveError&&!this.live.snapshot.error&&!this.live.snapshot.updating&&input.saveState==='saved'&&this.live.snapshot.key===previewKey(input.ownerId,input.id)&&this.live.snapshot.pdf?.revision===input.revision&&this.renderedSignature===pdfEditSignature(input.resume,input.layout,input.skills);}
  retry(){if(!this.input||this.input.editing)return;if(this.saveError){this.stop();this.saveError=null;this.schedule(0);this.emit();}else this.live.retry();}
  retain(pdf:EditorPdf){return this.live.retain(pdf);}
  releaseRetired(){this.live.releaseRetired();}
  dispose(){this.timing?.cancel();this.disposed=true;this.stop();this.live.dispose();}
}
