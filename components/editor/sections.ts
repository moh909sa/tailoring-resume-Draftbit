import { isJsonObject, type JsonObject, type JsonValue } from "@/lib/tailoring/types";
import { readableLabel } from "@/components/tailoring/ReviewContent";

export type EditorSection = { key: string; label: string; value: JsonValue; hidden: boolean };
export const editorMetadata = new Set(["id", "sectionMeta", "sectionType", "descriptionStyles", "condensed"]);
const titles: Record<string, string> = {
  personalInfo: "Personal Information", personalInformation: "Personal Information", summary: "Summary",
  professionalSummary: "Summary", workExperience: "Experience", experience: "Experience",
  education: "Education", personalProjects: "Projects", technicalSkills: "Skills", skills: "Skills", professionalSkills: "Skills", certificationsTraining: "Certifications & training",
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
  const hint = /personalInfo/i.test(key) ? "Add your contact details" : /summary/i.test(key) ? "Add a short summary" : `Add your first ${noun}`;
  const value = isJsonObject(section.value) && Array.isArray(section.value.items) ? section.value.items : isJsonObject(section.value) && Array.isArray(section.value.strings) ? section.value.strings : section.value;
  if (Array.isArray(value)) return value.length ? `${value.length} ${value.length === 1 ? noun : noun === "entry" ? "entries" : noun === "education entry" ? "education entries" : `${noun}s`}` : hint;
  const preview = sectionSummary(value).replace(/\s+/g," ").trim();
  return preview === "Add your details" || preview === "Add your first entry" ? hint : preview;
}

export function resumeSections(resume: JsonObject): EditorSection[] {
  const fields: { key: string; field: string; value: JsonValue }[] = [];
  for (const [key, value] of Object.entries(resume)) {
    if (editorMetadata.has(key)) continue;
    if ((key === "additional" || key === "customSections") && isJsonObject(value)) {
      Object.entries(value).forEach(([field, content]) => fields.push({key: `${key}.${field}`,field,value:content}));
    } else fields.push({key,field:key,value});
  }
  const defaults: [string, JsonValue][] = [["personalInfo", { name:"",title:"",email:"",phone:"",location:"",website:"",linkedin:"" }],["summary", ""],["workExperience", []],["education", []],["additional.technicalSkills", []]];
  for (const [key, value] of defaults) {
    const field = key.split(".").pop()!;
    const aliases: Record<string, string[]> = { personalInfo: ["personalInfo","personalInformation"], summary:["summary","professionalSummary"], workExperience:["workExperience","experience"], technicalSkills:["technicalSkills","skills","professionalSkills"] };
    if (!fields.some((entry) => (aliases[field] ?? [field]).includes(entry.field))) fields.push({key,field,value});
  }
  const meta = Array.isArray(resume.sectionMeta) ? resume.sectionMeta.filter(isJsonObject) : [];
  const ranks = ["personalInfo","personalInformation","summary","professionalSummary","workExperience","experience","education","technicalSkills","skills","professionalSkills","personalProjects"];
  const contentOrder = (field: string) => /^(personalInfo|personalInformation)$/.test(field) ? 0 : /^(summary|professionalSummary)$/.test(field) ? 1 : /^(workExperience|experience)$/.test(field) ? 2 : field === "education" ? 3 : /^(technicalSkills|skills|professionalSkills)$/.test(field) ? 4 : 5;
  return fields.map((field) => {
    const metadata = meta.find((m) => m.key === field.field || m.key === field.key);
    return { key:field.key, value:field.value, label:contentOrder(field.field) < 5 ? titles[field.field] : typeof metadata?.displayName === "string" ? metadata.displayName : titles[field.field] ?? readableLabel(field.field), hidden:metadata?.isVisible === false,
      contentOrder: contentOrder(field.field),
      order: typeof metadata?.order === "number" ? metadata.order : 100 + (ranks.includes(field.field) ? ranks.indexOf(field.field) : ranks.length) };
  }).sort((a,b) => a.contentOrder-b.contentOrder || a.order-b.order);
}

export function replaceSection(resume: JsonObject, key: string, value: JsonValue): JsonObject {
  const [parent, field] = key.split(".");
  return field ? {...resume, [parent]:{...(isJsonObject(resume[parent]) ? resume[parent] : {}), [field]:value}} : {...resume, [key]:value};
}

export function entryTemplate(key: string): JsonObject {
  const id = Date.now();
  if (/education/i.test(key)) return {id,institution:"",degree:"",years:"",description:""};
  if (/project/i.test(key)) return {id,name:"",role:"",years:"",website:"",description:[]};
  if (/experience/i.test(key)) return {id,title:"",company:"",location:"",years:"",description:[]};
  return {id,title:"",subtitle:"",location:"",years:"",description:[]};
}
