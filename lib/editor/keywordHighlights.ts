import { isJsonObject, type JsonObject, type JsonValue } from "@/lib/tailoring/types";
import { resumeReviewText as plainText } from "./resumeText";

export type KeywordHistory = {
  original: JsonObject | null;
  changes: { path: string; before: string; after: string }[];
  keywords: string[];
};
export type HighlightPart = { text: string; kind: "matched" | "added" | null };
type Range = { start: number; end: number };
type Path = (string | number)[];
export const highlightPath = (path: Path) => JSON.stringify(path);
const metadata = new Set(["id", "sectionMeta", "sectionType", "descriptionStyles", "condensed"]);

export function termOccurrences(text: string, term: string): Range[] {
  const phrase = term.trim().split(/\s+/).map(word => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s+");
  if (!phrase) return [];
  const pattern = new RegExp(phrase, "giu");
  const matches: Range[] = [];
  for (const match of text.matchAll(pattern)) {
    const start = match.index, end = start + match[0].length;
    if (!/[\p{L}\p{N}_]$/u.test(text.slice(0, start)) && !/^[\p{L}\p{N}_]/u.test(text.slice(end))) matches.push({ start, end });
  }
  return matches;
}

// Group string lists before comparing so adding/reordering a bullet or skill never
// assigns history by array index. A non-whitespace separator prevents matching
// a phrase across separate items. Leaves retain their display text and paths.
function textGroups(value: JsonValue, path: Path = []): { path: Path; text: string; leaves: { path: Path; text: string; start: number }[] }[] {
  if (typeof value === "string") {
    const text = plainText(value);
    return [{ path, text, leaves: [{ path, text, start: 0 }] }];
  }
  if (Array.isArray(value)) {
    if (value.every(item => typeof item === "string")) {
      let start = 0;
      const leaves = value.map((item, index) => {
        const text = plainText(String(item));
        const leaf = { path: [...path, index], text, start };
        start += text.length + 1;
        return leaf;
      });
      return [{ path, text: leaves.map(leaf => leaf.text).join("\u0000"), leaves }];
    }
    return value.flatMap((item, index) => textGroups(item, [...path, index]));
  }
  return isJsonObject(value) ? Object.entries(value).flatMap(([key, item]) => metadata.has(key) ? [] : textGroups(item, [...path, key])) : [];
}

// Match entries by stable ID, or an unchanged identity (company/title/dates etc.).
// Never assume that entry 0 is the same role after entries have moved or changed.
function originalField(original: JsonObject, resume: JsonObject, path: Path): JsonValue | undefined {
  let before: JsonValue | undefined = original, after: JsonValue | undefined = resume;
  for (const key of path) {
    if (typeof key === "number") {
      if (!Array.isArray(before) || !Array.isArray(after)) return undefined;
      const entry: JsonValue = after[key];
      if (!isJsonObject(entry)) return undefined;
      const candidates: JsonObject[] = before.filter(isJsonObject);
      const byId: JsonObject[] = entry.id != null ? candidates.filter(item => item.id === entry.id) : [];
      const identity = ["company", "institution", "school", "name", "title", "position", "role", "degree", "startDate", "start_date"].filter(field => typeof entry[field] === "string" && !!String(entry[field]).trim());
      const byIdentity: JsonObject[] = identity.length ? candidates.filter(item => identity.every(field => item[field] === entry[field])) : [];
      const matches: JsonObject[] = byId.length === 1 ? byId : byIdentity;
      if (matches.length !== 1) return undefined;
      before = matches[0]; after = entry;
    } else {
      if (!isJsonObject(before) || !isJsonObject(after)) return undefined;
      before = before[key]; after = after[key];
    }
  }
  return before;
}

function tokens(text: string) {
  return [...text.matchAll(/[\p{L}\p{N}_]+|[^\p{L}\p{N}_\s]|\s+/gu)].map(match => ({ text: /^\s+$/.test(match[0]) ? " " : match[0].toLocaleLowerCase("en-US"), start: match.index, end: match.index + match[0].length }));
}

// Consider every optimal alignment, not one arbitrarily chosen diff. Repeated
// phrases with ambiguous history remain plain rather than inventing a blue location.
export function occurrenceHistory(before: string, after: string): (range: Range, term: string) => HighlightPart["kind"] {
  if (before === after) return () => "matched";
  const left = tokens(before), right = tokens(after), width = right.length + 1;
  if (left.length * right.length > 160000) return () => null;
  const prefix = new Uint16Array((left.length + 1) * width), suffix = new Uint16Array(prefix.length);
  for (let i = 1; i <= left.length; i++) for (let j = 1; j <= right.length; j++) prefix[i * width + j] = left[i - 1].text === right[j - 1].text ? prefix[(i - 1) * width + j - 1] + 1 : Math.max(prefix[(i - 1) * width + j], prefix[i * width + j - 1]);
  for (let i = left.length - 1; i >= 0; i--) for (let j = right.length - 1; j >= 0; j--) suffix[i * width + j] = left[i].text === right[j].text ? suffix[(i + 1) * width + j + 1] + 1 : Math.max(suffix[(i + 1) * width + j], suffix[i * width + j + 1]);
  const length = suffix[0];
  return (range, term) => {
    const start = right.findIndex(token => token.start === range.start), end = right.findIndex(token => token.end === range.end) + 1;
    if (start < 0 || end <= start) return null;
    const originals = termOccurrences(before, term);
    const compatible = originals.filter(old => {
      const a = left.findIndex(token => token.start === old.start), b = left.findIndex(token => token.end === old.end) + 1;
      return a >= 0 && b - a === end - start && left.slice(a, b).every((token, i) => token.text === right[start + i].text) && prefix[a * width + start] + b - a + suffix[b * width + end] === length;
    });
    // A relocated existing phrase is not proof of a new occurrence.
    if (!compatible.length) return !originals.length || termOccurrences(after, term).length > originals.length ? "added" : null;
    for (let j = start; j < end; j++) {
      if (right[j].text === " ") continue;
      // Could an equally good alignment leave this token unmatched?
      for (let i = 0; i <= left.length; i++) if (prefix[i * width + j] + suffix[i * width + j + 1] === length) return null;
    }
    return "matched";
  };
}

function canonicalPath(path: string) {
  return path.replace(/^resume(?:_preview)?\./, "").replace(/\[(\d+)\]/g, ".$1");
}

export function buildKeywordHighlights(resume: JsonObject, keywords: string[], jobDescription: string, history: KeywordHistory | null) {
  const fields = textGroups(resume);
  const originalText = history?.original ? textGroups(history.original).map(field => field.text).join("\u0000") : null;
  const terms = [...new Map([...keywords, ...(history?.keywords ?? [])].map(term => [term.trim().toLocaleLowerCase("en-US"), term.trim()])).values()].filter(Boolean)
    .filter(term => termOccurrences(jobDescription, term).length > 0).sort((a, b) => b.length - a.length);
  const absentTerms = new Set(originalText !== null ? terms.filter(term => !termOccurrences(originalText, term).length) : []);
  type Candidate = Range & { kind: HighlightPart["kind"]; term: string };
  const candidates: { group: typeof fields[number]; ranges: Candidate[] }[] = [];
  const additionCounts = new Map<string, number>();
  for (const group of fields) {
    const original = history?.original ? originalField(history.original, resume, group.path) : undefined;
    let before = typeof original === "string" ? plainText(original) : Array.isArray(original) && original.every(item => typeof item === "string") ? original.map(item => plainText(String(item))).join("\u0000") : undefined;
    // A recorded comparison is usable only at its exact field with the exact saved
    // after-text. Placements/attestations alone never prove an added occurrence.
    if (before === undefined) {
      const comparisons = history?.changes.filter(change => canonicalPath(change.path) === group.path.join(".") && plainText(change.after) === group.text) ?? [];
      if (comparisons.length === 1) before = plainText(comparisons[0].before);
    }
    const classify = before !== undefined ? occurrenceHistory(before, group.text) : null;
    const leafHistory = new Map(group.leaves.flatMap(leaf => {
      if (classify) return [];
      const comparisons = history?.changes.filter(change => canonicalPath(change.path) === leaf.path.join(".") && plainText(change.after) === leaf.text) ?? [];
      return comparisons.length === 1 ? [[highlightPath(leaf.path), occurrenceHistory(plainText(comparisons[0].before), leaf.text)] as const] : [];
    }));
    const ranges: Candidate[] = [];
    for (const term of terms) for (const range of termOccurrences(group.text, term)) {
      const leaf = group.leaves.find(item => item.start <= range.start && item.start + item.text.length >= range.end);
      const leafClassify = leaf ? leafHistory.get(highlightPath(leaf.path)) : null;
      const kind = absentTerms.has(term) ? "added" : classify ? classify(range, term) : leaf && leafClassify ? leafClassify({ start: range.start - leaf.start, end: range.end - leaf.start }, term) : null;
      ranges.push({ ...range, kind, term });
      if (kind === "added") additionCounts.set(term, (additionCounts.get(term) ?? 0) + 1);
    }
    candidates.push({ group, ranges });
  }
  // If several new locations could include an old occurrence that moved, the net
  // count cannot identify which one was added. Do not paint all of them blue.
  const uncertainAdditions = new Set<string>();
  if (originalText !== null) {
    const savedText = fields.map(group => group.text).join("\u0000");
    for (const [term, count] of additionCounts) if (count > Math.max(0, termOccurrences(savedText, term).length - termOccurrences(originalText, term).length)) uncertainAdditions.add(term);
  }
  const parts = new Map<string, HighlightPart[]>();
  let verified = 0, unverified = 0;
  for (const { group, ranges: found } of candidates) {
    for (const range of found) {
      if (range.kind === "added" && uncertainAdditions.has(range.term)) range.kind = null;
      if (!range.kind) unverified++;
    }
    // Prefer verified phrases, then the longest complete match. An uncertain long
    // phrase must not hide a shorter occurrence whose history can be verified.
    found.sort((a, b) => Number(!!b.kind) - Number(!!a.kind) || b.end - b.start - (a.end - a.start));
    const ranges: Candidate[] = [];
    for (const range of found) if (!ranges.some(other => range.start < other.end && range.end > other.start)) ranges.push(range);
    ranges.sort((a, b) => a.start - b.start);
    verified += ranges.filter(range => !!range.kind).length;
    for (const leaf of group.leaves) {
      const result: HighlightPart[] = [];
      let position = 0;
      for (const range of ranges) {
        const start = Math.max(0, range.start - leaf.start), end = Math.min(leaf.text.length, range.end - leaf.start);
        if (end <= start) continue;
        if (start > position) result.push({ text: leaf.text.slice(position, start), kind: null });
        result.push({ text: leaf.text.slice(start, end), kind: range.kind });
        position = end;
      }
      if (position < leaf.text.length) result.push({ text: leaf.text.slice(position), kind: null });
      parts.set(highlightPath(leaf.path), result);
    }
  }
  return { parts, verified, unverified };
}
