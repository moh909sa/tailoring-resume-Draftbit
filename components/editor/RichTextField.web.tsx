import { useEffect, useMemo, useRef, useState } from "react";
import { View } from "react-native";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/theming/ThemeProvider";
import { richTextDocument, type RichTextMessage, type RichTextProps } from "./richTextDocument";

const frameStyle = {width:"100%",border:0,display:"block"};

export function RichTextField({label,value,onChangeText}: RichTextProps) {
  const {theme} = useTheme();
  const frame = useRef<HTMLIFrameElement>(null);
  const initial = useRef(value);
  initial.current = value;
  const [height,setHeight] = useState(76);
  const html = useMemo(()=>richTextDocument(initial.current,label,theme),[label,theme]);
  const change = useRef(onChangeText);
  change.current = onChangeText;
  useEffect(()=>{
    const receive = (event:MessageEvent) => {
      if (event.source !== frame.current?.contentWindow || typeof event.data?.cvRichText !== "string") return;
      try {
        const message = JSON.parse(event.data.cvRichText) as RichTextMessage;
        if (message.type === "change" && typeof message.value === "string") change.current(message.value);
        else if (message.type === "height" && Number.isFinite(message.height)) setHeight(Math.max(76,message.height));
      } catch { /* Ignore unrelated frame messages. */ }
    };
    globalThis.addEventListener("message",receive);
    return ()=>globalThis.removeEventListener("message",receive);
  },[]);
  useEffect(()=>{frame.current?.contentWindow?.postMessage({cvRichValue:value},"*");},[value]);
  return <View className="w-full min-w-0 gap-2">
    <Text className="text-caption font-medium text-muted-foreground">{label}</Text>
    <iframe ref={frame} title={label} srcDoc={html} onLoad={()=>frame.current?.contentWindow?.postMessage({cvRichValue:initial.current},"*")} sandbox="allow-scripts" style={{...frameStyle,height}}/>
  </View>;
}
