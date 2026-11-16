export type MatchRecommendation = { text: string; headline: boolean };

// Presentation only: keep the server's guidance and discard repeated keyword-list
// advice. Never generate new scoring recommendations or truncate mid-sentence.
export function overviewRecommendations(items: string[], missing: string[]): MatchRecommendation[] {
  const result: MatchRecommendation[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const cleaned = item.replace(/^\s*(?:[-•]|\d+[.)])\s*/, "").replace(/\s+/g, " ").trim();
    const first = cleaned.match(/^.*?[.!?](?=\s+[A-Z]|$)/)?.[0] ?? cleaned;
    const headline = /\b(headline|job title|professional title|resume title)\b/i.test(first);
    const keywordAdvice = !headline && (missing.some(term => first.toLocaleLowerCase().includes(term.toLocaleLowerCase())) || /\b(keywords?|skills? from|missing skills?)\b/i.test(first) && /\b(add|include|incorporate|insert|mention|integrate|use|missing)\b/i.test(first));
    if (!first || keywordAdvice || /\b(two-column|single-column)\b/i.test(first) || !/\b(use|add|include|replace|remove|keep|write|start|focus|quantify|describe|check|correct|align|match|update|change|avoid|shorten|clarify|highlight|ensure|list|show|mention|choose|make)\b/i.test(first)) continue;
    const short = first.length <= 180 ? first : first.split(/[;,]/).find((part, index) => index === 0 && part.length >= 30 && part.length <= 160);
    if (!short) continue;
    const text = /[.!?]$/.test(short) ? short : short + ".";
    const category = headline ? "headline" : /\b(quantify|measurable|metrics?|percentages?|numbers?)\b/i.test(text) ? "quantify" : /\b(action verbs?|strong verbs?)\b/i.test(text) ? "verbs" : null;
    const key = category ?? text.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
    if (seen.has(key)) continue;
    seen.add(key); result.push({ text, headline });
    if (result.length === 2) break;
  }
  return result;
}
