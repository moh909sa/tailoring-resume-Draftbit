import { isJsonObject, type JsonValue } from "@/lib/tailoring/types";
export function fieldAt(value:JsonValue,path:(string|number)[]):JsonValue|undefined {
  let current:JsonValue|undefined=value;
  for(const key of path) current=Array.isArray(current)&&typeof key === "number" ? current[key] : isJsonObject(current)&&typeof key === "string" ? current[key] : undefined;
  return current;
}
export function replaceField(value:JsonValue,path:(string|number)[],next:JsonValue):JsonValue {
  if(!path.length)return next;
  const [key,...rest]=path;
  if(Array.isArray(value)&&typeof key === "number"&&key>=0&&key<value.length)return value.map((item,index)=>index===key?replaceField(item,rest,next):item);
  if(isJsonObject(value)&&typeof key === "string"&&Object.hasOwn(value,key))return {...value,[key]:replaceField(value[key],rest,next)};
  return value;
}
