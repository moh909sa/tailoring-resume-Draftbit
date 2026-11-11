import { useState } from "react";
import { Pressable, View } from "react-native";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import LucideIcon from "@/lib/icons/LucideIcon";
import { cn } from "@/lib/utils";
import { layoutTemplateName, type EditorLayout, type LayoutFont, type LayoutOptions } from "@/lib/editor/layout";

function TemplateSketch({template}: {template:string}) {
  const split=/two-column|deedy/.test(template),accent=/modern|vivid/.test(template);
  return <View accessible={false} importantForAccessibility="no-hide-descendants" className="h-28 w-full overflow-hidden rounded-lg border border-border bg-background p-3">
    <View className={cn("mb-2 h-2 w-2/3 rounded-sm",accent ? "bg-primary/60" : "bg-foreground/40")}/>
    <View className="mb-3 h-1 w-1/2 rounded-sm bg-muted-foreground/25"/>
    <View className="flex-1 flex-row gap-2">
      {split ? <View className="w-1/4 gap-2 border-r border-border pr-2"><View className="h-1 w-full bg-muted-foreground/25"/><View className="h-1 w-full bg-muted-foreground/25"/><View className="h-1 w-full bg-muted-foreground/25"/></View> : null}
      <View className="flex-1 gap-2"><View className={cn("h-1 w-2/3",accent ? "bg-primary/40" : "bg-foreground/30")}/><View className="h-1 w-full bg-muted-foreground/20"/><View className="h-1 w-full bg-muted-foreground/20"/><View className="h-1 w-3/4 bg-muted-foreground/20"/></View>
    </View>
  </View>;
}
function LevelControl({label,value,min=1,max=5,unit,onChange}: {label:string;value:number;min?:number;max?:number;unit?:string;onChange:(value:number)=>void}) {
  return <View className="min-h-14 flex-row flex-wrap items-center justify-between gap-2">
    <Text className="min-w-0 flex-1 text-body text-foreground">{label}</Text>
    <View className="flex-row items-center gap-1 rounded-xl border border-border bg-background">
      <Button variant="ghost" size="icon" className="h-11 w-11" disabled={value<=min} accessibilityLabel={`Decrease ${label.toLowerCase()}`} onPress={()=>onChange(value-1)}><LucideIcon name="Minus" size={16} className="text-foreground"/></Button>
      <Text accessibilityLabel={`${label}: ${value}${unit ? ` ${unit}` : ` of ${max}`}`} className="min-w-10 text-center text-caption font-medium text-foreground">{value}{unit ? ` ${unit}` : ` / ${max}`}</Text>
      <Button variant="ghost" size="icon" className="h-11 w-11" disabled={value>=max} accessibilityLabel={`Increase ${label.toLowerCase()}`} onPress={()=>onChange(value+1)}><LucideIcon name="Plus" size={16} className="text-foreground"/></Button>
    </View>
  </View>;
}
function FontControl({label,value,onChange}: {label:string;value:LayoutFont;onChange:(value:LayoutFont)=>void}) {
  return <View className="gap-2"><Text className="text-body text-foreground">{label}</Text><View className="flex-row flex-wrap gap-2">{([['serif','Serif'],['sans-serif','Sans serif'],['mono','Mono']] as const).map(([font,title])=><Pressable key={font} accessibilityRole="radio" accessibilityLabel={`${label}: ${title}`} accessibilityState={{checked:font===value}} onPress={()=>onChange(font)} className={cn("min-h-11 justify-center rounded-lg border bg-background px-3 py-2",value===font ? "border-primary" : "border-border")}><Text className={cn("text-caption",value===font ? "font-semibold text-primary" : "text-foreground")}>{title}</Text></Pressable>)}</View></View>;
}
export function DesignLayout({layout,options,onChange,onReload}: {layout:EditorLayout|null;options:LayoutOptions|undefined;onChange:(layout:EditorLayout)=>void;onReload:()=>void}) {
  const [formatting,setFormatting]=useState(false);
  if(!layout || !options)return <View className="gap-4 rounded-2xl border border-border bg-card p-5"><Text className="text-h4 text-foreground">Design & Layout</Text><Text className="text-body leading-6 text-muted-foreground">Layout options couldn’t be loaded. Reload your CV to try again.</Text><Button variant="outline" onPress={onReload}><Text>Reload layout options</Text></Button></View>;
  return <View className="gap-6">
    <View className="gap-3"><Text accessibilityRole="header" className="text-h4 text-foreground">Paper size</Text><View className="flex-row gap-3">{options.page_sizes.map(size=><Pressable key={size} accessibilityRole="radio" accessibilityLabel={`${size==='A4'?'A4':'Letter'} paper size`} accessibilityState={{checked:layout.pageSize===size}} onPress={()=>onChange({...layout,pageSize:size})} className={cn("min-h-14 flex-1 items-center justify-center rounded-xl border bg-card px-3 py-3",layout.pageSize===size ? "border-primary" : "border-border")}><Text className={cn("text-body font-medium",layout.pageSize===size ? "text-primary" : "text-foreground")}>{size==='A4'?'A4':'Letter'}</Text><Text className="text-caption text-muted-foreground">{size==='A4'?'210 × 297 mm':'8.5 × 11 in'}</Text></Pressable>)}</View></View>
    <View className="gap-2"><Text accessibilityRole="header" className="text-h4 text-foreground">Template</Text><Text className="text-caption leading-5 text-muted-foreground">Choose a style, then preview your saved CV.</Text></View>
    <View className="flex-row flex-wrap justify-between gap-y-3">{options.templates.map(template=><Pressable key={template} accessibilityRole="radio" accessibilityLabel={`${layoutTemplateName(template)} template`} accessibilityState={{checked:layout.template===template}} onPress={()=>onChange({...layout,template})} className={cn("w-[48%] gap-3 rounded-xl border-2 bg-card p-3",layout.template===template ? "border-primary" : "border-border")}>
      <TemplateSketch template={template}/><View className="flex-row items-start gap-2"><Text className="min-w-0 flex-1 text-caption font-semibold text-foreground">{layoutTemplateName(template)}</Text><LucideIcon name={layout.template===template ? "CircleCheck" : "Circle"} size={17} className={layout.template===template ? "shrink-0 text-primary" : "shrink-0 text-muted-foreground"}/></View>
    </Pressable>)}</View>
    {!options.templates.includes(layout.template) ? <Text className="text-caption text-muted-foreground">Your saved template is {layoutTemplateName(layout.template)}. Choose an available template to change it.</Text> : null}

    <View className="overflow-hidden rounded-2xl border border-border bg-card">
      <Pressable accessibilityRole="button" accessibilityState={{expanded:formatting}} accessibilityLabel="Formatting" onPress={()=>setFormatting(!formatting)} className="min-h-16 flex-row items-center gap-3 px-4 py-4"><View className="flex-1 gap-1"><Text className="text-body font-semibold text-foreground">Formatting</Text><Text className="text-caption text-muted-foreground">Margins, spacing and fonts</Text></View><LucideIcon name={formatting ? "ChevronUp" : "ChevronDown"} size={19} className="text-muted-foreground"/></Pressable>
      {formatting ? <LayoutFormatting layout={layout} onChange={onChange}/> : null}
    </View>
  </View>;
}

export function LayoutFormatting({layout,onChange}: {layout:EditorLayout;onChange:(layout:EditorLayout)=>void}) {
  const margin = (key:'top'|'bottom'|'left'|'right',value:number)=>onChange({...layout,margins:{...layout.margins,[key]:value}});
  const spacing = (key:'section'|'item'|'lineHeight',value:number)=>onChange({...layout,spacing:{...layout.spacing,[key]:value}});
  const fontSize = (key:'base'|'headerScale',value:number)=>onChange({...layout,fontSize:{...layout.fontSize,[key]:value}});
  return <View className="gap-5 border-t border-border px-4 py-4">
        <View className="gap-2"><Text accessibilityRole="header" className="text-body font-semibold text-foreground">Margins</Text>{([['top','Top margin'],['bottom','Bottom margin'],['left','Left margin'],['right','Right margin']] as const).map(([key,label])=><LevelControl key={key} label={label} value={layout.margins[key]} min={5} max={25} unit="mm" onChange={value=>margin(key,value)}/>)}</View>
        <View className="gap-2 border-t border-border pt-5"><Text accessibilityRole="header" className="text-body font-semibold text-foreground">Spacing</Text><Text className="text-caption leading-5 text-muted-foreground">Choose from 1 (compact) to 5 (roomy).</Text><LevelControl label="Section spacing" value={layout.spacing.section} onChange={value=>spacing('section',value)}/><LevelControl label="Entry spacing" value={layout.spacing.item} onChange={value=>spacing('item',value)}/><LevelControl label="Line spacing" value={layout.spacing.lineHeight} onChange={value=>spacing('lineHeight',value)}/></View>
        <View className="gap-4 border-t border-border pt-5"><Text accessibilityRole="header" className="text-body font-semibold text-foreground">Fonts</Text><LevelControl label="Text size" value={layout.fontSize.base} onChange={value=>fontSize('base',value)}/><LevelControl label="Heading size" value={layout.fontSize.headerScale} onChange={value=>fontSize('headerScale',value)}/><FontControl label="Heading font" value={layout.fontSize.headerFont} onChange={value=>onChange({...layout,fontSize:{...layout.fontSize,headerFont:value}})}/><FontControl label="Body font" value={layout.fontSize.bodyFont} onChange={value=>onChange({...layout,fontSize:{...layout.fontSize,bodyFont:value}})}/></View>
      </View>;
}
