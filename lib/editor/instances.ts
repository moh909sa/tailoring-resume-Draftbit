import type { CvEditorSession, EditorState } from "./session";

type Resource = {manager:CvEditorSession;detach:()=>void};
type Entry = Resource & {listeners:Set<(state:EditorState)=>void>;users:number};
// Multiple routes observing the same account/CV share one writer and recovery draft.
export class EditorInstances {
  private entries=new Map<string,Entry>();
  acquire(key:string,create:(emit:(state:EditorState)=>void)=>Resource) {
    let entry=this.entries.get(key);
    if(!entry) {
      const listeners=new Set<(state:EditorState)=>void>();
      const resource=create(state=>listeners.forEach(listener=>listener(state)));
      entry={...resource,listeners,users:0};
      this.entries.set(key,entry);
      void entry.manager.restore();
    }
    const resource=entry;
    resource.users++;
    let released=false;
    const subscriptions=new Set<(state:EditorState)=>void>();
    return {
      manager:resource.manager,
      subscribe:(listener:(state:EditorState)=>void)=>{
        subscriptions.add(listener);resource.listeners.add(listener);listener(resource.manager.snapshot);
      },
      release:()=>{
        if(released)return;released=true;
        subscriptions.forEach(listener=>resource.listeners.delete(listener));
        if(--resource.users===0) {
          resource.detach();resource.manager.dispose();this.entries.delete(key);
        }
      },
    };
  }
}
