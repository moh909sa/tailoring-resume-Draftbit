import { templateDocumentCss } from "./templateDocumentCss";
import { editorMetadata, plainText, resumeSections, type EditorSection } from "@/components/editor/sections";
import { isJsonObject, type JsonObject, type JsonValue } from "@/lib/tailoring/types";
import type { EditorLayout } from "./layout";
import { liveCanvasScript } from "./canvasRuntime";
import type { DocumentViewport } from "./canvasGeometry";
import { documentTheme as t } from "./documentTheme";

export type FieldTarget = {path:(string|number)[];label:string};
export type LiveDocumentMessage = {type:"section";key:string;target:FieldTarget} | {type:"scroll";offset:number} | ({type:"viewport"} & DocumentViewport) | {type:"pages";count:number};
const escape = (value:unknown) => String(value ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
const str = (value:JsonValue|undefined) => typeof value === "string" || typeof value === "number" ? String(value) : "";
const hasContent = (value:JsonValue):boolean => typeof value === "string" ? !!value.trim() : Array.isArray(value) ? value.some(hasContent) : isJsonObject(value) ? Object.entries(value).some(([key,v])=>!editorMetadata.has(key)&&hasContent(v)) : typeof value === "number";

// Only the engine's inline print vocabulary is emitted; raw CV HTML never runs.
export function safeResumeHtml(value:string):string {
  const source=value.replace(/<(script|style|iframe|object|svg|math)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,"");
  return source.split(/(<[^>]*>)/g).map(token=>{
    if (!token.startsWith("<")) return escape(plainText(token));
    const mark=token.match(/^<(\/?)\s*(strong|b|em|i|u)\s*>$/i);
    if (mark) return `<${mark[1]}${({b:"strong",i:"em"} as Record<string,string>)[mark[2].toLowerCase()] ?? mark[2].toLowerCase()}>`;
    if (/^<\/a\s*>$/i.test(token)) return "</a>";
    if (/^<a\b/i.test(token)) {
      const href=token.match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
      const url=plainText(href?.[1] ?? href?.[2] ?? "").trim();
      return /^(https?:|mailto:|tel:)/i.test(url) ? `<a href="${escape(url)}" tabindex="-1">` : "<a>";
    }
    return /^<br\b|^<\/(p|div|li)\b/i.test(token) ? "\n" : "";
  }).join("");
}
function pencil(key:string,path:(string|number)[],label:string) {
  return `<button type="button" class="pencil" data-key="${escape(key)}" data-path="${escape(JSON.stringify(path))}" data-label="${escape(label)}" aria-label="Edit ${escape(label)}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m16 3 5 5-12 12-6 1 1-6Z"/><path d="m14 5 5 5"/></svg></button>`;
}
const labels:Record<string,string>={technicalSkills:"Technical Skills",languages:"Languages",certificationsTraining:"Certifications",awards:"Awards"};
function valueMarkup(value:JsonValue,key:string,path:(string|number)[]=[],field="",template="swiss-single",rich=false,pointStyles?:JsonValue[]):string {
  const clean=["clean","latex","vivid","vivid-single","modern-deedy","deedy"].includes(template);
  if (value === null || value === false || value === true) return "";
  if (typeof value === "string" || typeof value === "number") {
    const text=String(value);if (!text.trim()) return "";
    return `<div class="paragraph">${rich ? safeResumeHtml(text) : escape(text)}</div>`;
  }
  if (Array.isArray(value)) {
    if (!value.some(hasContent)) return "";
    if (value.some(isJsonObject)) return value.map((entry,index)=>entryMarkup(entry,key,[...path,index],template)).join("");
    const bullets=/description|bullet/i.test(field);
    if (bullets) return `<div class="bullets">${value.map((item,index)=>{
      if (!hasContent(item)) return "";
      const plain=pointStyles?.[index] === "plain";
      return `<div class="bullet editable${plain ? " plain" : ""}${value.length>=4 && (index===0 || index===value.length-2) ? " keep-next" : ""}">${plain ? "" : `<span class="dot">${template.startsWith("vivid")?"➜":"•"}</span>`}<div class="bullet-text">${valueMarkup(item,key,[...path,index],"bullet",template,rich)}</div></div>`;
    }).join("")}</div>`;
    return `<div class="skill-list">${value.filter(hasContent).map(item=>`<span class="${clean?"skill-text":"skill"}">${escape(str(item))}</span>`).join(clean ? ", " : " ")}</div>`;
  }
  if (isJsonObject(value)) {
    return Object.entries(value).filter(([k,v])=>!editorMetadata.has(k)&&hasContent(v)).map(([k,v])=>{
      const skills=key === "additional";
      return `<div class="${skills?"skill-row":"nested"}">${skills ? `<span class="skill-label">${escape(labels[k]??k)}:</span>` : ""}${valueMarkup(v,key,[...path,k],k,template,rich)}</div>`;
    }).join("");
  }
  return "";
}
function entryMarkup(value:JsonValue,key:string,path:(string|number)[],template:string):string {
  if (!isJsonObject(value)) return valueMarkup(value,key,path,"",template);
  const education=/education/i.test(key);
  const title=str(value.title ?? value.name ?? value.degree), subtitle=str(value.company ?? value.institution ?? value.subtitle ?? value.role);
  const dates=str(value.years ?? value.dates),location=str(value.location);
  const used=new Set(["title","name","degree","company","institution","subtitle","role","years","dates","location","description","descriptionStyles"]);
  const rich=!education;
  const compactEntry=["clean","modern-deedy","vivid","vivid-single","deedy"].includes(template);
  const primary=subtitle||title;
  const header=template === "latex"
    ? `<div class="entry-row"><strong>${escape(primary)}</strong><span class="date">${escape(dates)}</span></div><div class="entry-row subtitle"><em>${escape(subtitle?title:"")}</em><em>${escape(location)}</em></div>`
    : compactEntry
    ? `<div class="entry-row"><div><strong>${escape(subtitle||title)}</strong>${subtitle&&title?`<span class="sep"> | </span><span class="entry-role">${escape(title)}</span>`:""}</div><span class="date">${escape([location,dates].filter(Boolean).join(" | "))}</span></div>`
    : `<div class="entry-row"><strong>${escape(title||subtitle)}</strong><span class="date">${escape(dates)}</span></div>${subtitle||location?`<div class="entry-row subtitle"><span>${escape(subtitle)}</span><span>${escape(location)}</span></div>`:""}`;
  const description=value.description;
  return `<div class="entry" data-resume-item="${Array.isArray(value.description) && value.description.length>=4 ? "split" : ""}" data-field-path="${escape(JSON.stringify(path))}"><div class="entry-heading">${header}</div>${description?valueMarkup(description,key,[...path,"description"],"description",template,rich,Array.isArray(value.descriptionStyles)?value.descriptionStyles:undefined):""}${Object.entries(value).filter(([k,v])=>!used.has(k)&&!editorMetadata.has(k)&&hasContent(v)).map(([k,v])=>valueMarkup(v,key,[...path,k],k,template,rich)).join("")}</div>`;
}
function sectionMarkup(section:EditorSection,layout:EditorLayout,selected:string|null):string {
  if(section.hidden || !hasContent(section.value))return "";
  const template=layout.template;
  const clean=template === "clean";
  if(section.personal && isJsonObject(section.value)) {
    const p=section.value;
    const contacts=(clean?["location","phone","email","linkedin","github","website"]:["email","phone","location","website","linkedin","github"]).map(k=>str(p[k])).filter(Boolean);
    const extra=Object.entries(p).filter(([k,v])=>!["name","title","email","phone","location","website","linkedin","github"].includes(k)&&!editorMetadata.has(k)&&hasContent(v));
    return `<header data-section="${escape(section.key)}" class="identity editable${selected===section.key?" selected":""}">${p.name?`<h1>${nameMarkup(str(p.name),template)}</h1>`:""}${p.title?`<div class="tagline">${escape(p.title)}</div>`:""}${["modern","modern-two-column"].includes(template)?'<div class="name-underline"></div>':""}<div class="contacts">${contacts.map(c=>escape(c.replace(/^https?:\/\/(www\.)?/,""))).join(clean?" &nbsp;|&nbsp; ":", ")}</div>${extra.map(([k,v])=>valueMarkup(v,section.key,[k],k,template)).join("")}${pencil(section.key,[],"Personal Information")}</header>`;
  }
  return `<section data-section="${escape(section.key)}" class="resume-section${selected===section.key?" selected":""}"><div class="section-heading editable"><h2>${escape(section.label)}</h2>${pencil(section.key,[],section.label)}</div>${valueMarkup(section.value,section.key,[],section.key,template)}</section>`;
}
function nameMarkup(name:string,template:string):string {
  if (!["vivid","vivid-single","deedy"].includes(template)) return escape(name);
  const parts=name.trim().split(/\s+/),first=parts.shift() ?? "";
  return `<span class="name-first">${escape(first)}</span>${parts.length?` <span class="name-rest">${escape(parts.join(" "))}</span>`:""}`;
}
function additionalMarkup(section:EditorSection,layout:EditorLayout,selected:string|null,keys:string[]):string {
  if(section.hidden || !isJsonObject(section.value))return "";
  return keys.filter(key=>hasContent((section.value as JsonObject)[key])).map(key=>`<section class="resume-section${selected===section.key?" selected":""}" data-section="${escape(section.key)}" data-subsection="${escape(key)}"><div class="section-heading"><h2>${escape(labels[key] ?? key)}</h2>${pencil(section.key,[key],labels[key] ?? key)}</div>${valueMarkup((section.value as JsonObject)[key],section.key,[key],key,layout.template)}</section>`).join("");
}
function documentMarkup(resume:JsonObject,layout:EditorLayout,selected:string|null):string {
  const sections=resumeSections(resume),template=layout.template;
  const two=["swiss-two-column","modern-two-column","vivid","deedy"].includes(template);
  if(!two)return sections.map(section=>sectionMarkup(section,layout,selected)).join("");
  const main:string[]=[],sidebar:string[]=[],identity:string[]=[];
  sections.forEach(section=>{
    if(section.personal){identity.push(sectionMarkup(section,layout,selected));return;}
    if(section.key === "additional" && isJsonObject(section.value)){
      const keys=Object.keys(section.value).filter(key=>!editorMetadata.has(key));
      sidebar.push(additionalMarkup(section,layout,selected,keys.filter(key=>template !== "deedy" || key !== "awards")));
      if(template === "deedy")main.push(additionalMarkup(section,layout,selected,keys.filter(key=>key === "awards")));
      return;
    }
    const inSidebar=/^education$|^(technicalSkills|professionalSkills|skills|languages|certificationsTraining)$/.test(section.key) || template === "deedy" && section.custom && /course|link|profile|skill|language|certif|interest|tool/i.test(section.label);
    (inSidebar?sidebar:main).push(sectionMarkup(section,layout,selected));
  });
  const left=template === "deedy"?sidebar:main,right=template === "deedy"?main:sidebar;
  return identity.join("")+`<div class="resume-grid"><div class="resume-column ${template === "deedy"?"sidebar-column":"main-column"}">${left.join("")}</div><div class="resume-column ${template === "deedy"?"main-column":"sidebar-column"}">${right.join("")}</div></div>`;
}
export type LiveDocumentPayload = {markup:string;css:string;paperWidth:number;paperHeight:number;editable:boolean;initialOffset:number;initialZoom:number;initialPanX:number;background:string;accent:string};
export function liveDocumentPayload(resume:JsonObject,layout:EditorLayout,options:{editable:boolean;selectedKey:string|null;offset:number;zoom?:number;panX?:number;background:string;accent:string}):LiveDocumentPayload {
  const compact=layout.compactMode?0.6:1;
  const f=t.fontSize[layout.fontSize.base], gap=t.itemGap[layout.spacing.item]*compact;
  const css=`--font:${f}px;--header:${t.headerScale[layout.fontSize.headerScale]};--section-scale:${t.sectionScale[layout.fontSize.headerScale]};--section-gap:${t.sectionGap[layout.spacing.section]*compact}px;--item-gap:${gap}px;--line:${t.lineHeight[layout.spacing.lineHeight]*(layout.compactMode?0.92:1)};--header-font:${t.fonts[layout.fontSize.headerFont]};--body-font:${t.fonts[layout.fontSize.bodyFont]};--top:${layout.margins.top*96/25.4}px;--bottom:${layout.margins.bottom*96/25.4}px;--left:${layout.margins.left*96/25.4}px;--right:${layout.margins.right*96/25.4}px;--accent:${t.accents[layout.accentColor]};`;
  return {markup:`<article class="${escape(layout.template)}" style="${escape(css)}">${documentMarkup(resume,layout,options.selectedKey)}</article>`,css,paperWidth:layout.pageSize === "LETTER" ? 816 : 210*96/25.4,paperHeight:layout.pageSize === "LETTER" ? 1056 : 297*96/25.4,editable:options.editable,initialOffset:options.offset,initialZoom:options.zoom ?? 1,initialPanX:options.panX ?? 0,background:options.background,accent:options.accent};
}
export const serializeLivePayload = (value:LiveDocumentPayload) => JSON.stringify(value).replace(/</g,"\\u003c");

// This isolated document never requests a PDF, score, or API. Parent updates
// replace only the paper contents; its scrolling element is never remounted.
export function liveDocumentHtml():string {
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:"><style>
  *{box-sizing:border-box}html,body{margin:0;padding:0;height:100%;font-family:system-ui,sans-serif;-webkit-text-size-adjust:100%}#scroller{height:100%;overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;padding:16px 20px 24px}#frame{position:relative;margin:auto}#paper{transform-origin:top left;background:${t.paper};color:${t.body};box-shadow:0 2px 12px #0002;position:absolute;top:0;left:0}article{padding:var(--top) var(--right) var(--bottom) var(--left);font-family:var(--body-font);font-size:var(--font);line-height:var(--line);overflow-wrap:anywhere;text-rendering:geometricPrecision}h1,h2,p{margin:0}h1{font-family:var(--header-font);font-size:calc(var(--font)*var(--header));font-weight:700;line-height:1.2;color:${t.ink};text-transform:uppercase;letter-spacing:-.025em;margin-bottom:4px}.identity{text-align:center;margin-bottom:var(--section-gap);padding-bottom:calc(var(--item-gap)*1.25);border-bottom:1px solid ${t.rule}}.tagline,.contacts,.date{font-family:${t.fonts.mono};color:${t.muted};font-size:calc(var(--font)*.82)}.tagline{text-transform:uppercase;letter-spacing:.05em;margin-bottom:12px}.contacts{display:block}.date{font-size:calc(var(--font)*.75);text-align:right;flex-shrink:0;max-width:40%}.resume-section{margin-bottom:var(--section-gap)}.resume-section:last-child{margin-bottom:0}h2{font-family:var(--header-font);font-size:calc(var(--font)*var(--section-scale));font-weight:700;line-height:1.35;letter-spacing:.05em;text-transform:uppercase;color:${t.ink};border-bottom:1px solid ${t.rule};padding-bottom:2px;margin-bottom:var(--item-gap)}.entry{margin-bottom:calc(var(--item-gap)*2)}.entry:last-child{margin-bottom:0}.entry-row{display:flex;align-items:baseline;justify-content:space-between;gap:16px;margin-bottom:calc(var(--item-gap)*.6)}strong{font-weight:700;color:${t.ink}}.subtitle{font-size:calc(var(--font)*.95);font-weight:600;color:${t.secondary};margin-bottom:var(--item-gap)}.paragraph{white-space:pre-wrap}.resume-section> .paragraph{text-align:justify}.bullets{display:flex;flex-direction:column;gap:calc(var(--item-gap)*.75)}.bullet{display:flex;align-items:flex-start;gap:6px;padding-left:5px}.bullet.plain{padding-left:0}.bullet-text{flex:1;min-width:0}.dot{flex:none}.skill-row{position:relative;display:flex;align-items:baseline;gap:8px;font-size:calc(var(--font)*.92);margin-bottom:var(--item-gap)}.skill-label{font-weight:700;flex-shrink:0;width:128px}.skill-list{flex:1}.skill{display:inline-block;font-family:${t.fonts.mono};font-size:calc(var(--font)*.75);padding:2px 6px;margin:0 2px 4px 0;border:1px solid ${t.softRule};background:${t.pill};border-radius:4px;max-width:100%}.nested{margin-bottom:var(--item-gap)}a{color:inherit;text-decoration:underline;pointer-events:none}.editable{position:relative}.pencil{display:none;position:absolute;right:calc(-16px/var(--scale));top:calc(-9px/var(--scale));width:calc(44px/var(--scale));height:calc(44px/var(--scale));border:0;background:transparent;color:var(--ui-accent);align-items:center;justify-content:center;cursor:pointer;padding:0;border-radius:50%;touch-action:manipulation}.pencil svg{width:calc(14px/var(--scale));height:calc(14px/var(--scale));background:${t.paper};box-shadow:0 0 0 calc(3px/var(--scale)) ${t.paper};border-radius:3px}.editing .pencil{display:flex}.pencil:focus-visible{outline:calc(2px/var(--scale)) solid var(--ui-accent)}.selected{outline:1px solid var(--ui-accent);outline-offset:5px}.modern h2{color:var(--accent);border-bottom:2px solid var(--accent)}.modern .identity{border-bottom:0}.name-underline{height:3px;width:60px;background:var(--accent);margin:8px auto 8px}.clean h1{font-weight:400;letter-spacing:.01em;text-transform:none}.clean .identity{border-bottom:0}.clean .tagline{font-family:var(--body-font);text-transform:none;font-size:calc(var(--font)*1.05);letter-spacing:0}.clean .contacts{font-family:var(--body-font);font-size:calc(var(--font)*.85);color:${t.body}}.clean h2{font-size:calc(var(--font)*var(--section-scale)*1.15);font-weight:600;letter-spacing:.12em;color:${t.muted};border-color:${t.softRule}}.clean .entry-role{font-variant:small-caps;letter-spacing:.02em;color:${t.muted}}.clean .sep{color:${t.muted}}.clean .date{font-family:var(--body-font);font-size:calc(var(--font)*.85)}.clean .skill-row{display:block}.clean .skill-label{display:inline;width:auto;margin-right:4px}.clean .skill-list{display:inline}.clean .skill-text{font:inherit}
  
  ${templateDocumentCss}
  html,body{overflow:hidden}#scroller{padding:0;overflow:auto;touch-action:pan-x pan-y;overscroll-behavior:contain;position:relative;cursor:default}#frame{position:relative;margin:0;min-height:100%}#pages{position:absolute;top:16px;transform-origin:top left}#source{position:absolute;left:-100000px;top:0;visibility:hidden;pointer-events:none}.paper{position:relative;background:${t.paper};box-shadow:0 2px 12px #0002}.paper article{min-height:0}.paper .pencil,#source .pencil{display:none!important}#controls{position:absolute;inset:0;pointer-events:none}#controls .pencil{position:absolute;display:flex;right:auto;width:44px;height:44px;align-items:center;justify-content:center;pointer-events:auto;background:transparent;z-index:2;border-radius:10px;color:var(--ui-accent)}#controls .pencil svg{width:15px;height:15px;background:transparent;box-shadow:none}.pencil:focus-visible{outline:2px solid var(--ui-accent)}#fit{position:fixed;right:8px;top:8px;display:none;align-items:center;justify-content:center;min-width:44px;height:44px;padding:0 12px;border:1px solid ${t.softRule};border-radius:10px;background:${t.paper};color:${t.ink};font:600 12px system-ui;box-shadow:0 2px 8px #0002;z-index:4}#page-count{position:fixed;left:8px;bottom:8px;display:none;border-radius:6px;padding:4px 7px;background:${t.paper};color:${t.muted};font:11px system-ui;pointer-events:none}
  </style></head><body><div id="scroller" role="region" aria-label="Live resume pages" tabindex="0"><div id="frame"><div id="pages"></div><div id="controls"></div></div></div><div id="source" aria-hidden="true"></div><button id="fit" type="button" aria-label="Fit resume to width">Fit</button><output id="page-count" aria-label="Resume pages"></output><script>${liveCanvasScript}</script></body></html>`;
}
