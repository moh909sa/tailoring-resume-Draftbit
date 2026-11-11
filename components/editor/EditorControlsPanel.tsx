import { useRef, useState, type ReactNode } from "react";
import { PanResponder, View } from "react-native";
import { Button } from "@/components/ui/button";
import LucideIcon from "@/lib/icons/LucideIcon";

export function EditorControlsPanel({open,availableHeight,onClose,children}: {open:boolean;availableHeight:number;onClose:()=>void;children:ReactNode}){
  const [height,setHeight]=useState(420);
  const max=Math.max(0,Math.floor(availableHeight*0.68)),min=Math.min(210,max);
  const shown=Math.max(min,Math.min(max,height));
  const bounds=useRef({min,max,height:shown});bounds.current={min,max,height:shown};
  const origin=useRef(shown);
  const change=(value:number)=>setHeight(Math.max(bounds.current.min,Math.min(bounds.current.max,value)));
  const responder=useRef(PanResponder.create({
    onMoveShouldSetPanResponder:(_event,gesture)=>Math.abs(gesture.dy)>4,
    onPanResponderGrant:()=>{origin.current=bounds.current.height;},
    onPanResponderMove:(_event,gesture)=>change(origin.current-gesture.dy),
  })).current;
  const panelStyle={height:open?shown:0,display:open?"flex" as const:"none" as const,borderTopWidth:open?1:0};
  return <View pointerEvents={open?'auto':'none'} accessibilityElementsHidden={!open} importantForAccessibility={open?'auto':'no-hide-descendants'} aria-hidden={!open} className="overflow-hidden border-t border-border bg-background" style={panelStyle}>
    <View className="min-h-11 flex-row items-center gap-1 px-3">
      <View {...responder.panHandlers} accessible accessibilityRole="adjustable" accessibilityLabel="Resize editor controls" accessibilityHint="Drag up to expand or down to shrink" accessibilityActions={[{name:'increment',label:'Expand controls'},{name:'decrement',label:'Shrink controls'}]} onAccessibilityAction={event=>change(bounds.current.height+(event.nativeEvent.actionName==='increment'?60:-60))} className="min-h-11 flex-1 items-center justify-center"><View className="h-1 w-10 rounded-full bg-muted-foreground/40"/></View>
      <Button variant="ghost" size="icon" className="h-11 w-11" accessibilityLabel="Expand controls" disabled={shown>=max} onPress={()=>change(shown+80)}><LucideIcon name="ChevronUp" size={18} className="text-muted-foreground"/></Button>
      <Button variant="ghost" size="icon" className="h-11 w-11" accessibilityLabel="Shrink controls" disabled={shown<=min} onPress={()=>change(shown-80)}><LucideIcon name="ChevronDown" size={18} className="text-muted-foreground"/></Button>
      <Button variant="ghost" size="icon" className="h-11 w-11" accessibilityLabel="Close controls" onPress={onClose}><LucideIcon name="X" size={19} className="text-foreground"/></Button>
    </View>
    {children}
  </View>;
}
