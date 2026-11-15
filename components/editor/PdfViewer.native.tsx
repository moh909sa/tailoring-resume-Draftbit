import { useEffect } from "react";
import { usePdfReadyEvents } from "./usePdfReadyEvents";
import { Platform, StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";
import { Text } from "@/components/ui/text";

export function PdfViewer({ uri, onError, onReady }: { uri: string; onError: () => void; onReady?:()=>void }) {
  const events=usePdfReadyEvents(uri,onReady,onError);
  useEffect(()=>{if(Platform.OS!=="ios")events.loaded();},[events.loaded]);
  if (Platform.OS !== "ios") return <View className="flex-1 items-center justify-center px-8"><Text className="text-center text-body text-muted-foreground">Your PDF is ready. Use Download PDF to open or save it with your device’s PDF app.</Text></View>;
  return <WebView source={{ uri }} originWhitelist={["file://*"]} javaScriptEnabled={false} onError={events.error} onLoad={events.loaded} onContentProcessDidTerminate={events.error} onShouldStartLoadWithRequest={(request) => request.url === uri || request.url === "about:blank"} style={styles.viewer} />;
}

const styles = StyleSheet.create({ viewer: { flex: 1 } });
