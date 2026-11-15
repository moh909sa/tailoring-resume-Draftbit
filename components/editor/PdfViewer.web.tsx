import { createElement } from "react";
import { usePdfReadyEvents } from "./usePdfReadyEvents";

export function PdfViewer({ uri, onError, onReady }: { uri: string; onError: () => void; onReady?:()=>void }) {
  const events=usePdfReadyEvents(uri,onReady,onError);
  return createElement("iframe", {
    title: "Your saved CV PDF",
    src: uri,
    onError:events.error,
    onLoad:events.loaded,
    style: { width: "100%", height: "100%", border: 0, flex: 1 },
  });
}
