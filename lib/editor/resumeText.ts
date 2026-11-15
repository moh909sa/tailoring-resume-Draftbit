export function plainText(value: string): string {
  const entities: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
  return value.replace(/<br\s*\/?\s*>/gi, "\n").replace(/<\/(p|div|li)>/gi, "\n").replace(/<[^>]*>/g, "")
    .replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (match, entity: string) => {
      if (entity[0] !== "#") return entities[entity.toLowerCase()] ?? match;
      const code = entity[1].toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    });
}


// Review-only text: retain rich-text paragraph breaks and list markers without
// applying any styling or mutations to the saved resume/PDF data.
export function resumeReviewText(value: string): string {
  const lists: { ordered: boolean; count: number }[] = [];
  const marked = value.replace(/<(\/?)(ul|ol|li)\b[^>]*>/gi, (tag, closing: string, rawKind: string) => {
    const kind = rawKind.toLowerCase();
    if (kind !== "li") {
      if (closing) lists.pop(); else lists.push({ ordered: kind === "ol", count: 0 });
      return "";
    }
    if (closing) return "\n";
    const list = lists[lists.length - 1];
    return list?.ordered ? `\n${++list.count}. ` : "\n• ";
  });
  return plainText(marked);
}
