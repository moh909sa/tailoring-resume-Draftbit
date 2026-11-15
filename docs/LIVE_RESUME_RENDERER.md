# Edit Resume PDF document

Edit Resume displays the actual Railway-generated PDF through `CvPreviewSurface` and the existing `PdfViewer.web/native`. It does not use the local HTML resume renderer. The PDF owns all page breaks, template structure, fonts, blank-section treatment and paper dimensions. Content, Templates and Format remain existing tools below the document.

## Update coordination

`EditorPdfPreview` debounces template/formatting changes by 400 ms and text field completion by 700 ms. Focus activity from plain and rich fields pauses PDF preparation while typing; blur/Done starts the debounce. Content still autosaves through the existing serialized session. The coordinator calls `saveForPdf()` after the pause, waits for any earlier preparation, validates the returned content/layout signature, and feeds its acknowledged revision to the existing `LivePreview` loader. No scoring request is triggered.

Each new desired generation invalidates previous completions and cancels pending retrieval. The last successful PDF remains mounted throughout saving/loading and on failure. A retained-file lease protects it while the replacement viewer loads underneath. The replacement keeps the same React key when promoted, avoiding a second viewer load. Preview/download remain gated through the layered handoff. Preview is gated by account/document key, saved state, content/layout signature and PDF revision. Save failures retain recovery drafts and conflict actions; retrieval retry targets the same acknowledged revision. Viewer retry only remounts the existing file.

The existing WKWebView/browser PDF plugin has no first-page-painted callback. Load completion plus two presentation frames drives the handoff; it is a readiness proxy and cannot prove actual pixel paint. Debug-only logs report numeric durations for format tap, debounce end, save start/end, fetch start/end and viewer readiness, including total time from the last tap and the complete rapid-tap burst. No resume contents, account/document IDs, URLs or revisions are logged. Native no-flash behavior and real first-page paint latency require device validation; viewerReady must not be reported as a measured first-page paint.

## One artifact across views

`pdfArtifacts.ts` publishes the owner/document/revision artifact with a retention lease. Full-screen preview acquires that exact file before considering network fallback. Download shares the same Blob URL or native cached file. Retiring a PDF cannot dispose it while the full-screen viewer holds a lease. Closing preview releases the lease; the inline editor remains mounted, retaining its tools and platform PDF viewport. Direct links and process restoration use the existing revision-pinned loader when no artifact is in memory.

## Editing and platform behavior

Content keeps the existing field bindings, rich text, custom sections and section actions. The header’s Job Match text button sits immediately left of PDF and pushes a dedicated screen using the same account/document session; Back returns to the mounted editor with its panel and edits intact. The 44-point drag handle resizes the mounted tools panel independently of PDF viewing. Keyboard avoidance and caret-aware section scrolling remain in place. Templates is a scrollable two-column grid with all server options; Format retains its compact rows and Advanced controls.

Web uses its browser PDF iframe; iOS uses the existing local-file WKWebView. Their PDF gestures are platform-owned. Android retains the existing external PDF-app fallback. Native display, pinch/pan, keyboard and sharing need native-device validation.

## Retained local template utilities

`liveDocument.ts`, `canvasRuntime.ts` and `LiveCvRenderer` remain reference/local-renderer utilities, not the Edit Resume document. Their independently measured pagination must not be presented as the exported PDF. Template thumbnails retain their engine-derived layout motifs.

## Engine rules and attribution

Template IDs, maps/presets and presentation rules are adapted from Resume-Matcher, copyright its contributors, under Apache-2.0. Sources:

- [template-settings.ts](https://github.com/moh909sa/Resume-Matcher-Railway/blob/main/apps/frontend/lib/types/template-settings.ts): font/spacing levels, compact multipliers, sizes, accents and Clean preset.
- [resume styles](https://github.com/moh909sa/Resume-Matcher-Railway/tree/main/apps/frontend/components/resume/styles): _base, _tokens and all ten template styles, including swiss-two-column, modern-two-column, latex, vivid, modern-deedy and deedy.
- [resume components](https://github.com/moh909sa/Resume-Matcher-Railway/tree/main/apps/frontend/components/resume): template presentation and supported content.
- [page-break-attrs.ts](https://github.com/moh909sa/Resume-Matcher-Railway/blob/main/apps/frontend/components/resume/page-break-attrs.ts): splittable-entry threshold and bullet grouping.

Reference values remain centralized in `documentTheme.ts`. Preserve the upstream [Apache license](licenses/RESUME_MATCHER_APACHE_2.0.txt). Declare new local templates supported only after implementing their rules.
