import { useEffect, useMemo, useRef } from "react";
import { WebView } from "react-native-webview";
import lightTheme from "@/theming/themes/light";
import { useTheme } from "@/theming/ThemeProvider";
import { liveDocumentHtml, liveDocumentPayload, serializeLivePayload, type LiveDocumentMessage } from "@/lib/editor/liveDocument";
import type { CvPreviewRendererProps } from "./CvPreviewSurface";

export function LiveCvRenderer({resume,layout,onSectionPress,onError,editable=false,selectedKey=null,scrollOffset=0,onScrollOffset}:CvPreviewRendererProps) {
  const {theme}=useTheme();
  const web=useRef<WebView>(null);
  const source=useMemo(()=>({html:liveDocumentHtml()}),[]);
  const payload=useMemo(()=>layout ? liveDocumentPayload(resume,layout,{editable,selectedKey:editable?selectedKey:null,offset:scrollOffset,background:theme.colors.muted ?? lightTheme.colors.muted!,accent:theme.colors.primary ?? lightTheme.colors.primary!}) : null,[resume,layout,editable,selectedKey,scrollOffset,theme]);
  const latest=useRef(payload);latest.current=payload;
  const update=()=>{if(latest.current)web.current?.injectJavaScript(`window.updateResume && window.updateResume(${serializeLivePayload(latest.current)});true;`);};
  useEffect(update,[payload]);
  const canvasStyle={flex:1,backgroundColor:theme.colors.muted};
  return <WebView ref={web} source={source} originWhitelist={["*"]} onShouldStartLoadWithRequest={request=>request.url === "about:blank"} onLoadEnd={update} onError={onError} onContentProcessDidTerminate={()=>web.current?.reload()} scrollEnabled={false} automaticallyAdjustContentInsets={false} textZoom={100} onMessage={event=>{
    try {
      const message=JSON.parse(event.nativeEvent.data) as LiveDocumentMessage;
      if(message.type === "section" && typeof message.key === "string" && Array.isArray(message.target?.path))onSectionPress(message.key,message.target);
      else if(message.type === "scroll" && Number.isFinite(message.offset))onScrollOffset?.(Math.max(0,message.offset));
    } catch { /* Ignore unrelated bridge messages. */ }
  }} style={canvasStyle}/>;
}
