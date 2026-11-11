import { useEffect, useMemo, useRef, useState } from "react";
import { View } from "react-native";
import { WebView } from "react-native-webview";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/theming/ThemeProvider";
import { richTextDocument, type RichTextMessage, type RichTextProps } from "./richTextDocument";
import { plainText } from "./sections";
import { Button } from "@/components/ui/button";

export function RichTextField({label,value,onChangeText,onCaret}: RichTextProps) {
  const {theme} = useTheme();
  const web = useRef<WebView>(null);
  const container = useRef<View>(null);
  const initial = useRef(value);
  initial.current = value;
  const [height,setHeight] = useState(76);
  const [failed,setFailed] = useState(false);
  const source = useMemo(()=>({html:richTextDocument(initial.current,label,theme)}),[label,theme]);
  useEffect(()=>{web.current?.injectJavaScript(`window.setEditorValue && window.setEditorValue(${JSON.stringify(value).replace(/</g,"\\u003c")});true;`);},[value]);
  if (failed) return <View className="gap-2"><Text className="text-caption text-destructive">The formatting editor could not load. Try again below. Your saved formatting is preserved.</Text><Text className="text-body text-foreground">{plainText(value)}</Text><Button variant="outline" onPress={()=>setFailed(false)}><Text>Retry formatting editor</Text></Button></View>;
  return <View className="w-full min-w-0 gap-2">
    <Text className="text-caption font-medium text-muted-foreground">{label}</Text>
    <View ref={container} className="w-full bg-card" style={{height}}>
      <WebView ref={web} source={source} originWhitelist={["*"]} scrollEnabled={false} automaticallyAdjustContentInsets={false} hideKeyboardAccessoryView keyboardDisplayRequiresUserAction={false} textZoom={100} onShouldStartLoadWithRequest={request=>request.url === "about:blank"} onLoadEnd={()=>web.current?.injectJavaScript(`window.setEditorValue && window.setEditorValue(${JSON.stringify(initial.current).replace(/</g,"\\u003c")});true;`)} onError={()=>setFailed(true)} onContentProcessDidTerminate={()=>web.current?.reload()} onMessage={event=>{
        try {
          const message = JSON.parse(event.nativeEvent.data) as RichTextMessage;
          if (message.type === "change" && typeof message.value === "string") onChangeText(message.value);
          else if (message.type === "height" && Number.isFinite(message.height)) setHeight(Math.max(76,message.height));
          else if (message.type === "caret" && Number.isFinite(message.y)) container.current?.measureInWindow((_x,y)=>onCaret?.(y+message.y));
        } catch { /* Ignore unrelated WebView messages. */ }
      }} style={{backgroundColor:theme.colors.card}}/>
    </View>
  </View>;
}
