import type { ComponentType } from "react";
import { ActivityIndicator, View } from "react-native";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { PdfViewer } from "./PdfViewer";
import type { EditorPdf } from "@/lib/editor/pdfTypes";
import type { EditorLayout } from "@/lib/editor/layout";
import type { DocumentViewport } from "@/lib/editor/canvasGeometry";
import type { FieldTarget } from "@/lib/editor/liveDocument";
import type { JsonObject } from "@/lib/editor/types";

// A shared local Resume Matcher renderer can consume the draft directly and
// invoke onSectionPress. It need not own sessions, saves, or PDF transport.
export type CvPreviewRendererProps={resume:JsonObject;layout:EditorLayout|null;pdf:EditorPdf|null;pendingPdf?:EditorPdf|null;onViewerReady?:(pdf:EditorPdf)=>void;onSectionPress:(key:string,target?:FieldTarget)=>void;onError:()=>void;editable?:boolean;selectedKey?:string|null;scrollOffset?:number;zoom?:number;panX?:number;onViewportChange?:(view:DocumentViewport)=>void;onScrollOffset?:(offset:number)=>void};
export function PdfCvRenderer({pdf,pendingPdf,onError,onViewerReady}:CvPreviewRendererProps){
  const frames=pdf?[pdf,...(pendingPdf&&pendingPdf!==pdf?[pendingPdf]:[])]:[];
  return pdf ? <View className="relative flex-1 bg-muted">{frames.map(file=><View key={file.uri} pointerEvents={file===pdf?"auto":"none"} accessibilityElementsHidden={file!==pdf} importantForAccessibility={file===pdf?"auto":"no-hide-descendants"} aria-hidden={file!==pdf} className={file===pdf?"absolute inset-0 z-10 bg-muted":"absolute inset-0 z-0 bg-muted"}><PdfViewer uri={file.uri} onError={onError} onReady={()=>onViewerReady?.(file)}/></View>)}</View> : <View className="flex-1 items-center justify-center gap-3 bg-muted"><ActivityIndicator/><Text className="text-caption text-muted-foreground">Preparing your CV…</Text></View>;
}
export function CvPreviewSurface({renderer:Renderer=PdfCvRenderer,error,onRetry,...props}:CvPreviewRendererProps & {renderer?:ComponentType<CvPreviewRendererProps>;error:string|null;onRetry:()=>void}){
  return <View className="flex-1 overflow-hidden bg-muted">{error&&!props.pdf ? <View className="flex-1 items-center justify-center gap-4 px-6"><Text accessibilityRole="alert" className="text-center text-body text-muted-foreground">{error}</Text><Button variant="outline" onPress={onRetry}><Text>Retry preview</Text></Button></View> : <Renderer {...props}/>}</View>;
}
