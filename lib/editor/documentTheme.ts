import type { EditorLayout } from "./layout";

// Resume-Matcher print tokens. Source and license: docs/LIVE_RESUME_RENDERER.md.
// Paper colors intentionally stay independent of the surrounding app theme.
export const documentTheme = {
  paper:"#ffffff", ink:"#000000", body:"#1f2937", secondary:"#374151", muted:"#4b5563",
  rule:"#9ca3af", softRule:"#d1d5db", pill:"#f3f4f6",
  accents:{blue:"#1d4ed8",green:"#15803d",orange:"#ea580c",red:"#dc2626"},
  fonts:{serif:'"Noto Serif", Georgia, "Times New Roman", serif',"sans-serif":'"Noto Sans", system-ui, -apple-system, sans-serif',mono:'"Noto Sans Mono", Menlo, Consolas, monospace'},
  fontSize:[0,11,12,14,15,16], headerScale:[0,1.5,1.75,2,2.25,2.5], sectionScale:[0,1,1.1,1.2,1.3,1.4],
  sectionGap:[0,6,10,16,20,24], itemGap:[0,2,4,8,12,16], lineHeight:[0,1.15,1.25,1.35,1.45,1.55],
};
export const liveTemplates = ["swiss-single","clean","modern"] as const;
export const supportsLiveTemplate = (template:string) => (liveTemplates as readonly string[]).includes(template);
export function applyTemplatePreset(layout:EditorLayout,template:string):EditorLayout {
  const font = template === "clean" || template === "modern-deedy" ? "sans-serif" : template === "latex" ? "serif" : null;
  return {...layout,template,...(font ? {fontSize:{...layout.fontSize,headerFont:font,bodyFont:font}} : {})};
}
