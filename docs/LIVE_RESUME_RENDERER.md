# Live resume renderer

Confirmation and the normal Library/Tailor opening paths lead directly to Edit Resume. PDF is an explicit header action; saving, immutable revision export, download and readability retain the current Railway contract. Done returns to the mounted editor, or the same saved ID when navigation history is missing. No view gesture calls an API or changes resume/layout content.

`CvPreviewSurface` accepts `LiveCvRenderer` through its renderer prop. Web uses a sandboxed iframe; native uses the existing react-native-webview platform module. Structured resume and layout messages feed `lib/editor/liveDocument.ts`; `canvasRuntime.ts` owns local DOM measurement, pagination and gestures. Frame navigation is blocked, content is escaped/sanitized, and the document has no external asset/network requests.

## Templates

All ten current engine templates render locally. Two Column and Modern Two Column use 65:35 right sidebars, Vivid uses 63:37, and Deedy uses a 33:67 left sidebar; both lanes paginate independently within the same shared pages. Classic, Vivid Single Column and Modern Deedy retain their distinct header, entry and typography rules. Templates shows every server-returned option in one scrollable two-column grid, with layout thumbnails and wrapping names. Unknown future templates retain explicit PDF fallback.

`templateDocumentCss.ts` adapts engine presentation rules. Additional sidebar groups retain their original section and field path, including Deedy awards in the main column. Section order is retained within the engine-assigned columns, without cloning resume data.

## Pages and editing

A4 and Letter use 96 CSS pixels per inch, literal millimeter margins, and the engine template font/spacing maps. The renderer measures full DOM blocks at each template column’s natural width, then lays them into distinct paper pages with a 24-document-pixel gap. Main/sidebar lanes begin together below the shared header and continue independently over the same page stack; explicit grid-column positions keep an otherwise empty side from shifting continuation text. A section heading stays with leading content; short entries stay whole if they fit. Entries with at least four bullets may split, retaining the first two and last two bullets as groups, following the engine page-break hooks. Oversized paragraphs/bullets continue across pages. A full DOM clone is trimmed with Ranges to retain strong/em/u/a ancestors, all text and links; no line/page count or clipping is imposed.

Every page uses the same resume ID and local editor draft. Continuation containers retain section and original entry paths. A pencil on a continued role opens that role through the existing field bindings rather than a second document or copied entry. Controls are positioned in an unscaled gutter outside the paper, remain 44 screen points at every zoom, and do not cover text/dates. Paper text is read-only; existing inline tray editors retain rich text, custom sections and section actions.

Railway remains authoritative for final fonts, PDF pagination, annotations and downloads. Noto Serif / Sans / Sans Mono, and Deedy’s Lato/Raleway, are preferred when installed, with local platform fallbacks; the canvas does not fetch fonts. Local page breaks can therefore differ from Chromium print metrics, locale fonts and backend pagination details. Unknown future templates retain explicit PDF fallback. A measured live page count is not a claim about the exported file.

## View and tools

The initial view fits the paper plus its control gutter to the available width. Two-finger pinch scales between 1× and 4× fit around the pinch midpoint; the document coordinate under that midpoint is retained as the fingers move. Enlarged content can pan, and vertical scrolling reaches all pages. Fit returns to width around the current reading position. Trackpad pinch/control-wheel, double-click and mouse drag support web use. Zoom moves cached controls and pages without repagination. Repagination runs only for resume/layout markup changes, not for zoom or panel resizing.

The metadata strip is removed. `EditorControlsPanel` places a 44-point grab target above the existing toolbar. Only this handle owns PanResponder; Animated.Value updates height continuously and persists the chosen size on release. Tools scrolling and the canvas are siblings with independent gesture responders. Controls stay mounted when collapsed. Keyboard/screen-size constraints temporarily clamp the visible tray while retaining its preferred height; root keyboard avoidance and existing caret-aware section scrolling keep Done/fields reachable.

The existing owner/document recovery cache holds tool, selected section/field, document zoom, horizontal pan, vertical offset and preferred panel height. These fields never enter PATCH payloads, score requests or layout dirty comparisons. Layout trials remain separate from the authorized content writer. Explicit PDF preparation captures the selected layout, waits for refresh, then uses the existing serialized writer; overlapping export calls share that operation. PDF return reuses the same view state. Save, retrieval and viewer failures retain separate retry actions; a viewer retry never re-fetches or re-saves the document.

## Engine rules and attribution

Template IDs, maps/presets and presentation rules are adapted from Resume-Matcher, copyright its contributors, under Apache-2.0. Sources:

- [template-settings.ts](https://github.com/moh909sa/Resume-Matcher-Railway/blob/main/apps/frontend/lib/types/template-settings.ts): font/spacing levels, compact multipliers, sizes, accents and Clean preset.
- [resume styles](https://github.com/moh909sa/Resume-Matcher-Railway/tree/main/apps/frontend/components/resume/styles): _base, _tokens and all ten template styles, including swiss-two-column, modern-two-column, latex, vivid, modern-deedy and deedy.
- [resume components](https://github.com/moh909sa/Resume-Matcher-Railway/tree/main/apps/frontend/components/resume): template presentation and supported content.
- [page-break-attrs.ts](https://github.com/moh909sa/Resume-Matcher-Railway/blob/main/apps/frontend/components/resume/page-break-attrs.ts): splittable-entry threshold and bullet grouping.

Values remain centralized in `documentTheme.ts`; markup and pagination are adapted locally. Preserve the upstream [Apache license](licenses/RESUME_MATCHER_APACHE_2.0.txt). Declare new local templates supported only after implementing their rules.
