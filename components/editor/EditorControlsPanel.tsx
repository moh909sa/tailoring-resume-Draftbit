import { useEffect, useRef, type ReactNode } from "react";
import { Animated, PanResponder, View } from "react-native";
import { clampPanelHeight, panelLimit } from "@/lib/editor/canvasGeometry";

type Props = {open:boolean;availableHeight:number;height:number;onHeightChange:(height:number)=>void;toolbar:ReactNode;children:ReactNode};
// Only the divider owns a drag responder. Canvas gestures and tray scrolling
// are siblings, so neither competes with resizing. Height changes stay out of
// the resume renderer's React state until the finger is released.
export function EditorControlsPanel({open,availableHeight,height,onHeightChange,toolbar,children}:Props) {
  const target=open?clampPanelHeight(height,availableHeight):0;
  const animated=useRef(new Animated.Value(target)).current;
  const shown=useRef(target),origin=useRef(target),dragging=useRef(false);
  const latest=useRef({availableHeight,onHeightChange});latest.current={availableHeight,onHeightChange};
  const resize=(value:number)=>{shown.current=clampPanelHeight(value,latest.current.availableHeight);animated.setValue(shown.current);};
  const finish=()=>{dragging.current=false;latest.current.onHeightChange(shown.current);};
  const responder=useRef(PanResponder.create({
    onMoveShouldSetPanResponder:(_event,gesture)=>Math.abs(gesture.dy)>3 && Math.abs(gesture.dy)>Math.abs(gesture.dx),
    onPanResponderGrant:()=>{dragging.current=true;origin.current=shown.current;},
    onPanResponderMove:(_event,gesture)=>resize(origin.current-gesture.dy),
    onPanResponderRelease:finish,onPanResponderTerminate:finish,
    onPanResponderTerminationRequest:()=>false,
  })).current;
  useEffect(()=>{if(!dragging.current){shown.current=target;animated.setValue(target);}},[target,animated]);
  const panelStyle={height:animated};
  return <View className="shrink-0 bg-background">
    <View {...responder.panHandlers} accessible accessibilityRole="adjustable" accessibilityLabel="Resize tools panel" accessibilityHint="Drag up for more tools or down for more resume" accessibilityValue={{min:0,max:Math.round(panelLimit(availableHeight)),now:Math.round(target)}} accessibilityActions={[{name:"increment",label:"Expand tools"},{name:"decrement",label:"Shrink tools"}]} onAccessibilityAction={event=>{resize(shown.current+(event.nativeEvent.actionName === "increment"?60:-60));finish();}} className="h-[44px] items-center justify-center bg-background"><View className="h-1 w-9 rounded-full bg-muted-foreground/40"/></View>
    {toolbar}
    <Animated.View testID="live-editor-tray" accessibilityElementsHidden={!open} importantForAccessibility={open?"auto":"no-hide-descendants"} aria-hidden={!open} className="overflow-hidden border-t border-border bg-background" style={panelStyle}>{children}</Animated.View>
  </View>;
}
