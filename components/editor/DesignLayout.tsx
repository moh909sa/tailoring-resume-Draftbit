import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import LucideIcon from "@/lib/icons/LucideIcon";
import { cn } from "@/lib/utils";
import { applyTemplatePreset, documentTheme } from "@/lib/editor/documentTheme";
import { layoutTemplateName, type EditorLayout, type LayoutFont, type LayoutOptions } from "@/lib/editor/layout";

const sketchStyles=StyleSheet.create({
  title:{fontSize:8,lineHeight:10,color:documentTheme.ink,textAlign:"center",fontWeight:"700"},
  cleanTitle:{fontWeight:"400",letterSpacing:.5},classicTitle:{fontFamily:"Georgia",fontWeight:"700"},deedyTitle:{fontSize:11,lineHeight:13,fontWeight:"300"},modernDeedyTitle:{fontWeight:"400"},
  rule:{height:2,width:"60%"},shortRule:{width:"75%"},line:{height:1,width:"100%"},lineMid:{width:"65%"},lineLong:{width:"90%"},
  main:{flex:65,paddingRight:5,borderRightWidth:1},side:{flex:35},vividMain:{flex:63,paddingRight:5},vividSide:{flex:37},deedyMain:{flex:67},deedySide:{flex:33},cleanBody:{paddingHorizontal:4},
});
function TemplateSketch({template}: {template:string}) {
  const vivid=template.startsWith("vivid"),deedy=template === "deedy";
  const accent=template === "modern"||template === "modern-two-column"||vivid;
  const columns=["swiss-two-column","modern-two-column","vivid","deedy"].includes(template);
  const rule=accent?documentTheme.accents.blue:documentTheme.rule;
  const lines=(short=false)=><View className="gap-1">{[0,1,2].map(row=><View key={row} className="mb-1 gap-1"><View style={[sketchStyles.rule,short?sketchStyles.shortRule:null,{backgroundColor:template === "clean"||/deedy/.test(template)?documentTheme.muted:rule}]}/><View style={[sketchStyles.line,{backgroundColor:documentTheme.softRule}]}/><View style={[sketchStyles.line,row===1?sketchStyles.lineMid:sketchStyles.lineLong,{backgroundColor:documentTheme.softRule}]}/></View>)}</View>;
  return <View accessible={false} importantForAccessibility="no-hide-descendants" className="h-28 w-full overflow-hidden rounded-sm p-2" style={{backgroundColor:documentTheme.paper}}>
    <Text className="mb-1" style={[sketchStyles.title,template === "clean"?sketchStyles.cleanTitle:template === "latex"?sketchStyles.classicTitle:deedy?sketchStyles.deedyTitle:template === "modern-deedy"?sketchStyles.modernDeedyTitle:null]}>{vivid?<><Text style={{color:documentTheme.accents.blue}}>Alex </Text><Text style={{color:documentTheme.muted}}>Morgan</Text></>:template === "clean"||template === "modern-deedy"||deedy?"Alex Morgan":"ALEX MORGAN"}</Text>
    <View className="mb-1 h-0.5 w-1/2 self-center" style={{backgroundColor:documentTheme.softRule}}/>
    {template === "modern" || template === "modern-two-column"?<View className="mb-1 h-0.5 w-6 self-center" style={{backgroundColor:rule}}/>:null}
    {template === "latex"||template === "swiss-single"||template === "swiss-two-column"||deedy?<View className="mb-2 h-px w-full" style={{backgroundColor:documentTheme.rule}}/>:<View className="h-2"/>}
    {columns?<View className="flex-1 flex-row gap-2"><View style={[deedy?sketchStyles.deedySide:template === "vivid"?sketchStyles.vividMain:sketchStyles.main,{borderColor:rule}]}>{lines(deedy)}</View><View style={deedy?sketchStyles.deedyMain:template === "vivid"?sketchStyles.vividSide:sketchStyles.side}>{lines(!deedy)}</View></View>:<View style={template === "clean"?sketchStyles.cleanBody:undefined}>{lines()}{template === "modern-deedy"?<View className="h-px w-2/3" style={{backgroundColor:documentTheme.muted}}/>:null}</View>}
  </View>;
}
function LevelControl({label,value,min=1,max=5,unit,onChange}: {label:string;value:number;min?:number;max?:number;unit?:string;onChange:(value:number)=>void}) {
  return <View className="min-h-14 flex-row flex-wrap items-center justify-between gap-2">
    <Text className="min-w-0 flex-1 text-body text-foreground">{label}</Text>
    <View className="flex-row items-center gap-1 rounded-xl border border-border bg-background">
      <Button variant="ghost" size="icon" className="h-11 w-11 native:h-[44px] native:w-[44px]" disabled={value<=min} accessibilityLabel={`Decrease ${label.toLowerCase()}`} onPress={()=>onChange(value-1)}><LucideIcon name="Minus" size={16} className="text-foreground"/></Button>
      <Text accessibilityLabel={`${label}: ${value}${unit ? ` ${unit}` : ` of ${max}`}`} className="min-w-10 text-center text-caption font-medium text-foreground">{value}{unit ? ` ${unit}` : ` / ${max}`}</Text>
      <Button variant="ghost" size="icon" className="h-11 w-11 native:h-[44px] native:w-[44px]" disabled={value>=max} accessibilityLabel={`Increase ${label.toLowerCase()}`} onPress={()=>onChange(value+1)}><LucideIcon name="Plus" size={16} className="text-foreground"/></Button>
    </View>
  </View>;
}
function FontControl({label,value,onChange}: {label:string;value:LayoutFont;onChange:(value:LayoutFont)=>void}) {
  return <View className="gap-2"><Text className="text-body text-foreground">{label}</Text><View className="flex-row flex-wrap gap-2">{([['serif','Serif'],['sans-serif','Sans serif'],['mono','Mono']] as const).map(([font,title])=><Pressable key={font} accessibilityRole="radio" accessibilityLabel={`${label}: ${title}`} accessibilityState={{checked:font===value}} onPress={()=>onChange(font)} className={cn("min-h-11 native:min-h-[44px] justify-center rounded-lg border bg-background px-3 py-2",value===font ? "border-primary" : "border-border")}><Text className={cn("text-caption",value===font ? "font-semibold text-primary" : "text-foreground")}>{title}</Text></Pressable>)}</View></View>;
}
export function DesignLayout({layout,options,onChange,onReload,mode="all"}: {layout:EditorLayout|null;options:LayoutOptions|undefined;onChange:(layout:EditorLayout)=>void;onReload:()=>void;mode?:"all"|"templates"|"format"}) {
  const [formatting,setFormatting]=useState(false);
  if(!layout || !options)return <View className="gap-4 rounded-2xl border border-border bg-card p-5"><Text className="text-h4 text-foreground">Design & Layout</Text><Text className="text-body leading-6 text-muted-foreground">Layout options couldn’t be loaded. Reload your CV to try again.</Text><Button variant="outline" onPress={onReload}><Text>Reload layout options</Text></Button></View>;
  const templateCards=<View accessibilityLabel="Resume templates" className="flex-row flex-wrap justify-between gap-y-3">{options.templates.map(template=><Pressable key={template} accessibilityRole="radio" accessibilityLabel={`${layoutTemplateName(template)} template`} accessibilityState={{checked:layout.template===template}} onPress={()=>onChange(applyTemplatePreset(layout,template))} className={cn("w-[48%] min-w-0 gap-2 rounded-lg border-2 bg-card p-2",layout.template===template?"border-primary":"border-border")}>
    <TemplateSketch template={template}/><View className="min-h-10 flex-row items-start gap-1"><Text className="min-w-0 flex-1 text-caption font-medium leading-5 text-foreground">{layoutTemplateName(template)}</Text>{layout.template === template?<LucideIcon name="CircleCheck" size={16} className="mt-0.5 shrink-0 text-primary"/>:null}</View>
  </Pressable>)}</View>;
  const paper=<View className="min-h-14 flex-row items-center justify-between gap-2"><Text className="text-body text-foreground">Paper size</Text><View className="flex-row gap-1">{options.page_sizes.map(size=><Pressable key={size} accessibilityRole="radio" accessibilityLabel={`${size==='A4'?'A4':'Letter'} paper size`} accessibilityState={{checked:layout.pageSize===size}} onPress={()=>onChange({...layout,pageSize:size})} className={cn("min-h-11 native:min-h-[44px] min-w-16 items-center justify-center rounded-lg border bg-background px-3",layout.pageSize===size?"border-primary":"border-border")}><Text className={cn("text-caption font-medium",layout.pageSize===size?"text-primary":"text-foreground")}>{size==='A4'?'A4':'Letter'}</Text></Pressable>)}</View></View>;
  return <View className="gap-3">
    {mode !== "format" ? <>
      {templateCards}
      {!options.templates.includes(layout.template)?<Text className="text-caption text-muted-foreground">Your saved {layoutTemplateName(layout.template)} template is preserved.</Text>:null}
    </>:null}
    {mode !== "templates" ? <>
      {paper}
      {mode === "format" ? <>
        <LevelControl label="Text size" value={layout.fontSize.base} onChange={base=>onChange({...layout,fontSize:{...layout.fontSize,base}})}/>
        <View className="min-h-14 flex-row items-center justify-between gap-2"><Text className="text-body text-foreground">Margins</Text><View className="flex-row gap-1">{([[8,"Narrow"],[10,"Regular"],[18,"Wide"]] as const).map(([size,title])=>{
          const selected=[layout.margins.top,layout.margins.bottom,layout.margins.left,layout.margins.right].every(value=>value===size);
          return <Pressable key={size} accessibilityRole="radio" accessibilityLabel={`${title} margins, ${size} mm`} accessibilityState={{checked:selected}} onPress={()=>onChange({...layout,margins:{...layout.margins,top:size,bottom:size,left:size,right:size}})} className={cn("min-h-11 native:min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border bg-background px-2",selected?"border-primary":"border-border")}><Text className={cn("text-caption",selected?"text-primary":"text-foreground")}>{size} mm</Text></Pressable>;
        })}</View></View>
      </>:null}
      <View className="overflow-hidden rounded-xl border border-border bg-card">
        <Pressable accessibilityRole="button" accessibilityState={{expanded:formatting}} accessibilityLabel={mode === "format"?"Advanced formatting":"Formatting"} onPress={()=>setFormatting(!formatting)} className="min-h-11 native:min-h-[44px] flex-row items-center gap-2 px-3"><Text className="flex-1 text-body font-medium text-foreground">{mode === "format"?"Advanced":"Formatting"}</Text><LucideIcon name={formatting?"ChevronUp":"ChevronDown"} size={17} className="text-muted-foreground"/></Pressable>
        {formatting?<LayoutFormatting layout={layout} onChange={onChange}/>:null}
      </View>
    </>:null}
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
