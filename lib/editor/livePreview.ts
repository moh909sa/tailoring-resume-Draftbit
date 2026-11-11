import type { EditorPdf } from "./pdfTypes";
export type PreviewTarget = {ownerId:string;id:string;revision:number;ready:boolean};
export type LivePreviewState = {key:string;pdf:EditorPdf|null;updating:boolean;error:string|null};
type Dependencies = {load:(target:PreviewTarget,signal:AbortSignal)=>Promise<EditorPdf>;onState:(state:LivePreviewState)=>void;delay?:number};
export const previewKey = (ownerId:string,id:string)=>JSON.stringify([ownerId,id]);
export const emptyLivePreview = ():LivePreviewState=>({key:"",pdf:null,updating:false,error:null});

// PDF transport is independent of the page renderer. Keep the last displayed
// artifact during updates, fence every completion, and retire files after commit.
export class LivePreview {
  private state=emptyLivePreview();
  private target:PreviewTarget|null=null;
  private generation=0;
  private timer:ReturnType<typeof setTimeout>|null=null;
  private timeout:ReturnType<typeof setTimeout>|null=null;
  private request:AbortController|null=null;
  private retired=new Set<EditorPdf>();
  private leases=new Map<EditorPdf,number>();
  private disposed=false;
  constructor(private deps:Dependencies) {}
  get snapshot(){return this.state;}
  private change(patch:Partial<LivePreviewState>){this.state={...this.state,...patch};if(!this.disposed)this.deps.onState(this.state);}
  private retire(pdf:EditorPdf|null){if(pdf)this.retired.add(pdf);}
  releaseRetired(){for(const pdf of this.retired)if(!this.leases.has(pdf)){this.retired.delete(pdf);void pdf.dispose().catch(()=>undefined);}}
  retain(pdf:EditorPdf){this.leases.set(pdf,(this.leases.get(pdf)??0)+1);let released=false;return()=>{if(released)return;released=true;const count=(this.leases.get(pdf)??1)-1;if(count)this.leases.set(pdf,count);else this.leases.delete(pdf);this.releaseRetired();};}
  private cancel(){if(this.timer)clearTimeout(this.timer);if(this.timeout)clearTimeout(this.timeout);this.timer=null;this.timeout=null;this.request?.abort();this.request=null;this.generation++;}
  update(target:PreviewTarget|null,force=false){
    if(this.disposed)return;
    const previous=this.target;
    if(!force&&previous?.ownerId===target?.ownerId&&previous?.id===target?.id&&previous?.revision===target?.revision&&previous?.ready===target?.ready)return;
    this.cancel();this.target=target;
    const key=target?previewKey(target.ownerId,target.id):"";
    if(key!==this.state.key){this.retire(this.state.pdf);this.change({key,pdf:null,error:null,updating:false});this.releaseRetired();}
    if(!target?.ready){this.change({updating:!!target,error:null});return;}
    if(!force&&this.state.pdf?.revision===target.revision){this.change({updating:false,error:null});return;}
    this.change({updating:true,error:null});
    const generation=this.generation;
    this.timer=setTimeout(()=>{this.timer=null;void this.render(target,generation);},this.state.pdf ? this.deps.delay??350 : 0);
  }
  retry(){this.update(this.target,true);}
  private async render(target:PreviewTarget,generation:number){
    const controller=new AbortController();this.request=controller;
    const timeout=setTimeout(()=>{controller.abort();if(!this.disposed&&generation===this.generation){this.generation++;this.change({updating:false,error:"Updating the preview took too long. Try again."});}},120000);
    this.timeout=timeout;
    try{
      const pdf=await this.deps.load(target,controller.signal);
      if(this.disposed||controller.signal.aborted||generation!==this.generation){void pdf.dispose().catch(()=>undefined);return;}
      if(pdf.revision!==target.revision){void pdf.dispose().catch(()=>undefined);throw new Error("The PDF belongs to another saved version. Try again.");}
      this.retire(this.state.pdf);this.change({pdf,updating:false,error:null});
    }catch(error){if(!this.disposed&&!controller.signal.aborted&&generation===this.generation)this.change({updating:false,error:error instanceof Error?error.message:"The preview could not be updated. Try again."});}
    finally{clearTimeout(timeout);if(this.timeout===timeout)this.timeout=null;if(this.request===controller)this.request=null;}
  }
  dispose(){if(this.disposed)return;this.disposed=true;this.cancel();this.retire(this.state.pdf);this.releaseRetired();}
}
