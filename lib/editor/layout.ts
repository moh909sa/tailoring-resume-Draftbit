import { isJsonObject, type JsonObject } from "@/lib/tailoring/types";

export type LayoutPageSize = "A4" | "LETTER";
export type LayoutFont = "serif" | "sans-serif" | "mono";
export type EditorLayout = JsonObject & {
  template:string;
  pageSize:LayoutPageSize;
  margins:JsonObject & {top:number;bottom:number;left:number;right:number};
  spacing:JsonObject & {section:number;item:number;lineHeight:number};
  fontSize:JsonObject & {base:number;headerScale:number;headerFont:LayoutFont;bodyFont:LayoutFont};
  compactMode:boolean;
  showContactIcons:boolean;
  accentColor:"blue"|"green"|"orange"|"red";
};
export type LayoutOptions = {templates:string[];page_sizes:LayoutPageSize[]};
const integer = (value:unknown,min:number,max:number) => typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
const fonts = ["serif","sans-serif","mono"];
export function parseEditorLayout(value:unknown): EditorLayout {
  const invalid=()=>new Error("The service returned incomplete layout settings. Reload your CV before changing its design.");
  if(!isJsonObject(value) || typeof value.template !== "string" || !value.template.trim() || !["A4","LETTER"].includes(String(value.pageSize)) || !isJsonObject(value.margins) || !isJsonObject(value.spacing) || !isJsonObject(value.fontSize))throw invalid();
  if(!["top","bottom","left","right"].every(key=>integer(value.margins && (value.margins as JsonObject)[key],5,25)) || !["section","item","lineHeight"].every(key=>integer((value.spacing as JsonObject)[key],1,5)) || !["base","headerScale"].every(key=>integer((value.fontSize as JsonObject)[key],1,5)) || !fonts.includes(String(value.fontSize.headerFont)) || !fonts.includes(String(value.fontSize.bodyFont)) || typeof value.compactMode !== "boolean" || typeof value.showContactIcons !== "boolean" || !["blue","green","orange","red"].includes(String(value.accentColor)))throw invalid();
  return value as EditorLayout;
}
export function parseLayoutOptions(value:unknown): LayoutOptions {
  if(!isJsonObject(value) || !Array.isArray(value.templates) || !value.templates.length || !value.templates.every(v=>typeof v === "string" && !!v.trim()) || !Array.isArray(value.page_sizes) || !value.page_sizes.length || !value.page_sizes.every(v=>v === "A4" || v === "LETTER"))throw new Error("Available layout options could not be loaded. Reload your CV to try again.");
  return {templates:[...new Set(value.templates as string[])],page_sizes:[...new Set(value.page_sizes as LayoutPageSize[])]};
}
const templateNames:Record<string,string>={"swiss-single":"Single Column","swiss-two-column":"Two Column",modern:"Modern","modern-two-column":"Modern Two Column",latex:"Classic",clean:"Clean",vivid:"Vivid","vivid-single":"Vivid Single Column","modern-deedy":"Modern Deedy",deedy:"Deedy"};
export const layoutTemplateName = (key:string) => templateNames[key] ?? key.replace(/[-_]/g," ").replace(/\b\w/g,v=>v.toUpperCase());
