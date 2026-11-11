import { isJsonObject, type JsonObject, type JsonValue } from "@/lib/tailoring/types";
import { readableLabel } from "@/components/tailoring/ReviewContent";

export type CustomSectionType = "text" | "itemList" | "stringList";
export type EditorSection = { key: string; label: string; value: JsonValue; hidden: boolean; personal: boolean; custom: boolean; sectionType: "personalInfo" | CustomSectionType };
export const isPersonalSection = (key: string) => /^(personalInfo|personalInformation)$/.test(key);
export const editorMetadata = new Set(["id", "sectionMeta", "sectionType", "descriptionStyles", "condensed"]);
const titles: Record<string, string> = {
  personalInfo: "Personal Information", personalInformation: "Personal Information", summary: "Summary",
  professionalSummary: "Summary", workExperience: "Experience", experience: "Experience",
  education: "Education", personalProjects: "Projects", technicalSkills: "Skills", skills: "Skills", professionalSkills: "Skills", certificationsTraining: "Certifications & training", additional: "Skills",
};

export function plainText(value: string): string {
  const entities: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
  return value.replace(/<br\s*\/?\s*>/gi, "\n").replace(/<\/(p|div|li)>/gi, "\n").replace(/<[^>]*>/g, "")
    .replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (match, entity: string) => {
      if (entity[0] !== "#") return entities[entity.toLowerCase()] ?? match;
      const code = entity[1].toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    });
}

export function sectionSummary(value: JsonValue): string {
  if (typeof value === "string") return plainText(value) || "Add your details";
  if (Array.isArray(value)) return value.length ? `${value.length} ${value.some(isJsonObject) ? "entries" : "items"}` : "Add your first entry";
  if (isJsonObject(value)) {
    const first = [value.name, value.title, value.text].find((v) => typeof v === "string" && v.trim());
    if (typeof first === "string") return plainText(first);
    if (Array.isArray(value.items)) return sectionSummary(value.items);
    if (Array.isArray(value.strings)) return sectionSummary(value.strings);
    return Object.entries(value).filter(([key, v]) => !editorMetadata.has(key) && typeof v === "string" && !!v).map(([,v]) => plainText(String(v))).slice(0, 2).join(" · ") || "Add your details";
  }
  return "Add your details";
}

export function sectionPreview(section: EditorSection): string {
  const key = section.key;
  const noun = /project/i.test(key) ? "project" : /experience/i.test(key) ? "role" : /education/i.test(key) ? "education entry" : /skills/i.test(key) ? "skill" : "entry";
  const hint = /personalInfo/i.test(key) ? "Add your contact details" : /summary/i.test(key) ? "Add a short summary" : section.custom && section.sectionType === "text" ? "Add a paragraph" : section.custom && section.sectionType === "stringList" ? "Add your first skill" : `Add your first ${noun}`;
  if (key === "additional" && isJsonObject(section.value)) {
    const count = Object.values(section.value).reduce<number>((n,v) => n+(Array.isArray(v) ? v.length : 0),0);
    return count ? `${count} skills & other details` : "Add your skills";
  }
  const value = isJsonObject(section.value) && Array.isArray(section.value.items) ? section.value.items : isJsonObject(section.value) && Array.isArray(section.value.strings) ? section.value.strings : section.value;
  if (Array.isArray(value)) return value.length ? `${value.length} ${value.length === 1 ? noun : noun === "entry" ? "entries" : noun === "education entry" ? "education entries" : `${noun}s`}` : hint;
  const preview = sectionSummary(value).replace(/\s+/g," ").trim();
  return preview === "Add your details" || preview === "Add your first entry" ? hint : preview;
}

// Additional lists share one heading/order in the engine's single-column PDF.
export function resumeSections(resume: JsonObject): EditorSection[] {
  const fields: {key: string; field: string; value: JsonValue}[] = [];
  for (const [key, value] of Object.entries(resume)) {
    if (editorMetadata.has(key)) continue;
    if (key === "customSections" && isJsonObject(value)) {
      Object.entries(value).forEach(([field, content]) => fields.push({key: `customSections.${field}`, field, value: content}));
    } else fields.push({key, field:key, value});
  }
  const defaults: [string, JsonValue][] = [["personalInfo", {name:"",title:"",email:"",phone:"",location:"",website:"",linkedin:""}], ["summary", ""], ["workExperience", []], ["education", []], ["additional", {technicalSkills:[]}]];
  const aliases: Record<string, string[]> = {personalInfo:["personalInfo","personalInformation"], summary:["summary","professionalSummary"], workExperience:["workExperience","experience"], additional:["additional","technicalSkills","skills","professionalSkills"]};
  defaults.forEach(([key,value]) => {
    if (!fields.some(entry => (aliases[key] ?? [key]).includes(entry.field))) fields.push({key,field:key,value});
  });
  const meta = Array.isArray(resume.sectionMeta) ? resume.sectionMeta.filter(isJsonObject) : [];
  const ranks = ["personalInfo","personalInformation","summary","professionalSummary","workExperience","experience","education","additional","technicalSkills","skills","professionalSkills","personalProjects"];
  return fields.map(field => {
    const metadata = meta.find(m => m.key === field.key) ?? meta.find(m => m.key === field.field);
    const personal = isPersonalSection(field.key);
    const custom = field.key.startsWith("customSections.");
    const type = isJsonObject(field.value) ? field.value.sectionType : metadata?.sectionType;
    const sectionType: EditorSection["sectionType"] = personal ? "personalInfo" : type === "text" || type === "itemList" || type === "stringList" ? type : /summary/i.test(field.field) || typeof field.value === "string" ? "text" : field.field === "additional" || /skills/i.test(field.field) ? "stringList" : "itemList";
    return {key:field.key, value:field.value, personal, custom, sectionType,
      label:personal ? "Personal Information" : typeof metadata?.displayName === "string" && metadata.displayName.trim() ? metadata.displayName : titles[field.field] ?? (custom ? "Custom section" : readableLabel(field.field)),
      hidden:!personal && metadata?.isVisible === false,
      order: typeof metadata?.order === "number" && Number.isFinite(metadata.order) ? metadata.order : null,
      rank:ranks.includes(field.field) ? ranks.indexOf(field.field) : ranks.length};
  }).sort((a,b) => a.personal !== b.personal ? a.personal ? -1 : 1 : (a.order ?? Infinity) - (b.order ?? Infinity) || a.rank-b.rank);
}

// Materialize missing metadata before a structural edit. Never discard unknown metadata.
function sectionMetadata(resume: JsonObject): JsonObject[] {
  const existing = Array.isArray(resume.sectionMeta) ? resume.sectionMeta.filter(isJsonObject) : [];
  const used = new Set<JsonObject>();
  const visible = resumeSections(resume).map((section,order) => {
    const key = section.custom ? section.key.slice("customSections.".length) : section.key;
    const meta = existing.find(m => m.key === section.key) ?? existing.find(m => m.key === key);
    if (meta) used.add(meta);
    return {...meta, id:meta?.id ?? key, key:meta?.key ?? key, displayName:meta?.displayName ?? section.label, sectionType:meta?.sectionType ?? section.sectionType, isDefault:meta?.isDefault ?? !section.custom, isVisible:meta?.isVisible ?? true, order};
  });
  return [...visible,...existing.filter(m => !used.has(m))];
}

export function withSectionMetadata(resume: JsonObject): JsonObject {
  const meta = Array.isArray(resume.sectionMeta) ? resume.sectionMeta.filter(isJsonObject) : [];
  const complete = resumeSections(resume).every(section => meta.some(item => item.key === section.key || section.custom && item.key === section.key.slice("customSections.".length)));
  return complete ? resume : {...resume,sectionMeta:sectionMetadata(resume)};
}

export function renameSection(resume: JsonObject, key: string, name: string): JsonObject {
  if (isPersonalSection(key) || !name.trim()) return resume;
  const metaKey = key.replace(/^customSections\./, "");
  return {...resume,sectionMeta:sectionMetadata(resume).map(meta => meta.key === metaKey || meta.key === key ? {...meta,displayName:name.trim()} : meta)};
}

export function moveSection(resume: JsonObject, key: string, direction: -1 | 1): JsonObject {
  const sections = resumeSections(resume);
  const index = sections.findIndex(section => section.key === key);
  const target = index + direction;
  if (index < 1 || target < 1 || target >= sections.length) return resume;
  const metadata = sectionMetadata(resume);
  [metadata[index], metadata[target]] = [metadata[target], metadata[index]];
  return {...resume,sectionMeta:metadata.map((meta,order) => ({...meta,order}))};
}

let lastId = 0;
export function entryId(existing: JsonValue = null): number {
  let max = Math.max(Date.now(),lastId);
  const visit = (value: JsonValue) => {
    if (Array.isArray(value)) value.forEach(visit);
    else if (isJsonObject(value)) Object.entries(value).forEach(([key,item]) => {if(key === "id" && typeof item === "number" && Number.isSafeInteger(item)) max=Math.max(max,item);else visit(item);});
  };
  visit(existing);
  lastId = max + 1;
  return lastId;
}

export function copyWithNewIds(value: JsonValue, existing: JsonValue = value): JsonValue {
  if (Array.isArray(value)) return value.map(item => copyWithNewIds(item,existing));
  if (!isJsonObject(value)) return value;
  return Object.fromEntries(Object.entries(value).map(([key,item]) => [key,key === "id" && (typeof item === "number" || typeof item === "string") ? typeof item === "number" ? entryId(existing) : `copy_${entryId(existing)}` : copyWithNewIds(item,existing)]));
}

export function duplicateListItem(value: JsonValue[], index: number, styles?: JsonValue[]) {
  if (index < 0 || index >= value.length) return {value,styles};
  const copy = copyWithNewIds(value[index],value);
  return {value:[...value.slice(0,index+1),copy,...value.slice(index+1)], styles:styles ? [...value.slice(0,index+1).map((_,i) => styles[i] ?? "bullet"),styles[index] ?? "bullet",...value.slice(index+1).map((_,i) => styles[index+1+i] ?? "bullet")] : undefined};
}

function nextCustomKey(resume: JsonObject): string {
  const custom = isJsonObject(resume.customSections) ? resume.customSections : {};
  const metadata = Array.isArray(resume.sectionMeta) ? resume.sectionMeta.filter(isJsonObject) : [];
  let n = 1;
  while (Object.hasOwn(custom,`custom_${n}`) || metadata.some(meta => meta.key === `custom_${n}` || meta.id === `custom_${n}`)) n++;
  return `custom_${n}`;
}

export function addCustomSection(resume: JsonObject, name: string, type: CustomSectionType) {
  const id = nextCustomKey(resume);
  const metadata = sectionMetadata(resume);
  const content: JsonObject = {sectionType:type,...(type === "text" ? {text:""} : type === "itemList" ? {items:[]} : {strings:[]})};
  return {key:`customSections.${id}`,resume:{...resume,customSections:{...(isJsonObject(resume.customSections) ? resume.customSections : {}),[id]:content},sectionMeta:[...metadata,{id,key:id,displayName:name.trim(),sectionType:type,isDefault:false,isVisible:true,order:metadata.length}]}};
}

export function duplicateCustomSection(resume: JsonObject, key: string) {
  const section = resumeSections(resume).find(section => section.key === key && section.custom);
  if (!section) return null;
  const result = addCustomSection(resume,`${section.label} (copy)`,section.sectionType as CustomSectionType);
  let next = replaceSection(result.resume,result.key,copyWithNewIds(section.value,resume));
  const metadata = sectionMetadata(next);
  const copyIndex = metadata.findIndex(meta => meta.key === result.key.split(".")[1]);
  const sourceIndex = metadata.findIndex(meta => meta.key === key || meta.key === key.split(".")[1]);
  const [copy] = metadata.splice(copyIndex,1);
  metadata.splice(sourceIndex+1,0,{...copy,isVisible:!section.hidden});
  next = {...next,sectionMeta:metadata.map((meta,order) => ({...meta,order}))};
  return {key:result.key,resume:next};
}

export function deleteCustomSection(resume: JsonObject, key: string): JsonObject {
  if (!key.startsWith("customSections.") || !isJsonObject(resume.customSections)) return resume;
  const field = key.slice("customSections.".length);
  if (!Object.hasOwn(resume.customSections,field)) return resume;
  const customSections = {...resume.customSections};
  delete customSections[field];
  return {...resume,customSections,...(Array.isArray(resume.sectionMeta) ? {
    sectionMeta:resume.sectionMeta.filter(meta => !isJsonObject(meta) || (meta.key !== field && meta.key !== key && !(meta.key == null && meta.id === field))),
  } : {})};
}

export function replaceSection(resume: JsonObject, key: string, value: JsonValue): JsonObject {
  const [parent, field] = key.split(".");
  return field ? {...resume, [parent]:{...(isJsonObject(resume[parent]) ? resume[parent] : {}), [field]:value}} : {...resume, [key]:value};
}

export function entryTemplate(key: string): JsonObject {
  const id = entryId();
  if (/education/i.test(key)) return {id,institution:"",degree:"",years:"",description:""};
  if (/project/i.test(key)) return {id,name:"",role:"",years:"",website:"",description:[]};
  if (/experience/i.test(key)) return {id,title:"",company:"",location:"",years:"",description:[]};
  return {id,title:"",subtitle:"",location:"",years:"",description:[]};
}
