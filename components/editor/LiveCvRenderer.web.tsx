import { useEffect, useMemo, useRef } from "react";
import { View } from "react-native";
import lightTheme from "@/theming/themes/light";
import { useTheme } from "@/theming/ThemeProvider";
import { liveDocumentHtml, liveDocumentPayload, type LiveDocumentMessage } from "@/lib/editor/liveDocument";
import type { CvPreviewRendererProps } from "./CvPreviewSurface";

const frameStyle={width:"100%",height:"100%",flex:1,border:0,display:"block"} as const;

export function LiveCvRenderer({resume,layout,onSectionPress,onError,editable=false,selectedKey=null,scrollOffset=0,zoom=1,panX=0,onScrollOffset,onViewportChange}:CvPreviewRendererProps) {
  const {theme}=useTheme();
  const frame=useRef<HTMLIFrameElement>(null);
  const html=useMemo(()=>liveDocumentHtml(),[]);
  const payload=useMemo(()=>layout ? liveDocumentPayload(resume,layout,{editable,selectedKey:editable?selectedKey:null,offset:scrollOffset,zoom,panX,background:theme.colors.muted ?? lightTheme.colors.muted!,accent:theme.colors.primary ?? lightTheme.colors.primary!}) : null,[resume,layout,editable,selectedKey,scrollOffset,zoom,panX,theme]);
  const latest=useRef(payload);latest.current=payload;
  const callbacks=useRef({onSectionPress,onScrollOffset,onViewportChange});callbacks.current={onSectionPress,onScrollOffset,onViewportChange};
  useEffect(()=>{
    const receive=(event:MessageEvent)=>{
      if (event.source !== frame.current?.contentWindow || !event.data?.cvDocument) return;
      const message=event.data.cvDocument as LiveDocumentMessage;
      if (message.type === "section" && typeof message.key === "string" && Array.isArray(message.target?.path)) callbacks.current.onSectionPress(message.key,message.target);
      else if(message.type === "viewport" && [message.zoom,message.x,message.y].every(Number.isFinite)) {
        if(callbacks.current.onViewportChange)callbacks.current.onViewportChange({zoom:Math.max(1,Math.min(4,message.zoom)),x:Math.max(0,message.x),y:Math.max(0,message.y)});
        else callbacks.current.onScrollOffset?.(Math.max(0,message.y));
      }
      else if (message.type === "scroll" && Number.isFinite(message.offset)) callbacks.current.onScrollOffset?.(Math.max(0,message.offset));
    };
    globalThis.addEventListener("message",receive);
    return()=>globalThis.removeEventListener("message",receive);
  },[]);
  useEffect(()=>{if(payload)frame.current?.contentWindow?.postMessage({cvDocumentUpdate:payload},"*");},[payload]);
  return <View className="flex-1 bg-muted"><iframe title="Live resume" ref={frame} srcDoc={html} sandbox="allow-scripts" onError={onError} onLoad={()=>{if(latest.current)frame.current?.contentWindow?.postMessage({cvDocumentUpdate:latest.current},"*");}} style={frameStyle}/></View>;
}
