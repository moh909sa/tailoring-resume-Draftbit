import type { EditorPdf } from "./pdfTypes";
import type { EditorLayout } from "./layout";
import { previewKey } from "./livePreview";

type Artifact={pdf:EditorPdf;title:string;layout:EditorLayout|undefined;retain:()=>()=>void};
// Owner-scoped in-memory handoff, never a URL route parameter or persisted file.
// The viewer lease keeps the exact Blob/native file alive if the editor retires it.
export class PdfArtifacts {
  private entries=new Map<string,Artifact>();
  private key(ownerId:string,id:string,revision:number){return previewKey(ownerId,id)+":"+revision;}
  publish(ownerId:string,id:string,artifact:Artifact){const key=this.key(ownerId,id,artifact.pdf.revision);this.entries.set(key,artifact);return()=>{if(this.entries.get(key)===artifact)this.entries.delete(key);};}
  acquire(ownerId:string,id:string,revision:number){const artifact=this.entries.get(this.key(ownerId,id,revision));if(!artifact)return null;const release=artifact.retain();return {...artifact,release};}
}
export const editorPdfArtifacts=new PdfArtifacts();
