import { useCallback, useEffect, useRef } from "react";

// Browser PDF plugins and WKWebView expose load completion, not PDF page paint.
// Give the loaded viewer two presentation frames before the layered handoff.
export function usePdfReadyEvents(uri:string,onReady:(()=>void)|undefined,onError:()=>void){
  const callbacks=useRef({onReady,onError}),currentUri=useRef(uri);callbacks.current={onReady,onError};currentUri.current=uri;
  const frames=useRef<number[]>([]),failed=useRef(false),alive=useRef(true);
  const cancel=useCallback(()=>{frames.current.forEach(globalThis.cancelAnimationFrame);frames.current=[];},[]);
  useEffect(()=>{alive.current=true;failed.current=false;return()=>{alive.current=false;cancel();};},[uri,cancel]);
  const loaded=useCallback(()=>{
    if(!alive.current||currentUri.current!==uri||failed.current)return;
    cancel();frames.current.push(globalThis.requestAnimationFrame(()=>{
      frames.current.push(globalThis.requestAnimationFrame(()=>{if(alive.current&&currentUri.current===uri&&!failed.current)callbacks.current.onReady?.();}));
    }));
  },[uri,cancel]);
  const error=()=>{if(!alive.current||currentUri.current!==uri)return;failed.current=true;cancel();callbacks.current.onError();};
  return {loaded,error};
}
