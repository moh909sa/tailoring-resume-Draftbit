import {
  isJsonObject,
  keywordKey,
  type JsonObject,
  type KeywordPlacement,
  type ResumeChange,
} from "@/lib/tailoring/types";
import type { DiffPart } from "@/lib/tailoring/diff";

const locationNames: Record<string, string> = {
  summary: "Summary",
  professionalSummary: "Summary",
  technicalSkills: "Skills",
  professionalSkills: "Skills",
  skills: "Skills",
  workExperience: "Work Experience",
  experience: "Work Experience",
  personalProjects: "Projects",
  projects: "Projects",
  education: "Education",
  certificationsTraining: "Certifications",
  languages: "Languages",
};
const words = (value: string) =>
  value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]/g, " ")
    .replace(/^./, (c) => c.toUpperCase());
const pathParts = (path: string) =>
  path
    .replace(/\[(\d+)\]/g, ".$1")
    .split(".")
    .filter(Boolean);

export function placementLocation(path: string, resume: JsonObject): string {
  const parts = pathParts(path).filter((part) => !["resume_preview", "resume"].includes(part));
  const known = parts.find((part) => locationNames[part]);
  if (known) return locationNames[known];
  const key = parts[0] === "customSections" || parts[0] === "additional" ? parts[1] : parts[0];
  const meta = Array.isArray(resume.sectionMeta)
    ? resume.sectionMeta.find(
        (item) =>
          isJsonObject(item) && (item.key === key || item.key === parts.slice(0, 2).join(".")),
      )
    : undefined;
  return isJsonObject(meta) && typeof meta.displayName === "string"
    ? meta.displayName
    : words(key || path);
}

// Read the entire current server response, never local selections or a previous round.
export function keywordDestinations(
  applied: string[],
  placements: KeywordPlacement[],
  resume: JsonObject,
) {
  const rows = new Map<string, { keyword: string; locations: string[] }>();
  for (const keyword of [...applied, ...placements.map((item) => item.keyword)]) {
    const key = keywordKey(keyword);
    if (key && !rows.has(key)) rows.set(key, { keyword: keyword.trim(), locations: [] });
  }
  for (const { keyword, paths } of placements) {
    const row = rows.get(keywordKey(keyword));
    if (!row) continue;
    for (const path of paths) {
      if (!path.trim()) continue;
      const location = placementLocation(path, resume);
      if (!row.locations.includes(location)) row.locations.push(location);
    }
  }
  return [...rows.values()];
}

export function keywordsForChange(change: ResumeChange, placements: KeywordPlacement[]): string[] {
  const normalize = (path: string) =>
    pathParts(path).filter((part) => !["resume_preview", "resume"].includes(part));
  const target = normalize(change.field_path);
  if (!target.length) return [];
  return [
    ...new Set(
      placements
        .filter((placement) =>
          placement.paths.some((path) => {
            const location = normalize(path);
            // Compare path segments, so bullet 1 can never match bullet 10 or another role.
            return (
              location.length > 0 &&
              location
                .slice(0, Math.min(target.length, location.length))
                .every((part, index) => part === target[index])
            );
          }),
        )
        .map((placement) => placement.keyword),
    ),
  ];
}

// Match complete phrases across diff boundaries, retaining every original character.
export function highlightAppliedKeywords(
  parts: DiffPart[],
  keywords: string[],
  additionsOnly = false,
) {
  const text = parts.map((part) => part.text).join("");
  const phrases = [...new Set(keywords.map((keyword) => keyword.trim()).filter(Boolean))].sort(
    (a, b) => b.length - a.length,
  );
  const ranges: { start: number; end: number }[] = [];
  if (phrases.length) {
    const expression = new RegExp(
      phrases
        .map((phrase) =>
          phrase
            .split(/\s+/)
            .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
            .join("\\s+"),
        )
        .join("|"),
      "giu",
    );
    for (const match of text.matchAll(expression)) {
      const start = match.index;
      const end = start + match[0].length;
      let offset = 0;
      const hasAddition =
        !additionsOnly ||
        parts.some((part) => {
          const partStart = offset;
          offset += part.text.length;
          return part.changed && partStart < end && offset > start && !!part.text.trim();
        });
      if (
        hasAddition &&
        (!start || !/[\p{L}\p{N}_]/u.test(text[start - 1])) &&
        (end === text.length || !/[\p{L}\p{N}_]/u.test(text[end]))
      )
        ranges.push({ start, end });
    }
  }
  let offset = 0;
  return parts.flatMap((part) => {
    const start = offset;
    offset += part.text.length;
    const cuts = [
      start,
      ...ranges
        .flatMap((range) => [range.start, range.end])
        .filter((point) => point > start && point < offset),
      offset,
    ];
    return [...new Set(cuts)]
      .sort((a, b) => a - b)
      .slice(0, -1)
      .map((point, index, points) => {
        const end = points[index + 1] ?? offset;
        return {
          text: text.slice(point, end),
          changed: part.changed,
          keyword: ranges.some((range) => point >= range.start && end <= range.end),
        };
      });
  });
}
