# Saved mobile CV editing contract

The tailoring review remains read-only. On Changes (Step 2 of 2), Continue to CV first checks the latest server preview and then sends `expected_preview_id` to `POST /api/v1/mobile/tailor/{tailoring_id}/confirm`. Railway atomically rejects a changed preview. A successful acknowledgement opens Edit Resume directly; older bodyless confirmation clients remain compatible.

All editor operations require the existing Supabase bearer session and ownership of the tailoring record and its saved engine resume. They never modify the uploaded original. The unauthenticated desktop routes stay blocked in mobile deployments.

## Canonical document and autosave

- `GET /api/v1/mobile/tailored-cvs/{id}/editor` returns `tailoring_id`, integer `revision`, `updated_at`, structured `resume`, saved `layout`, supported `layout_options`, job context, `confirmed_skills`, and optional analysis. This is current engine content, not the original confirmation snapshot.
- `PATCH` on the same route accepts `expected_revision`, a secure UUID `mutation_id`, `resume`, full updated `layout`, and `confirmed_skills`. The existing schema is validated while raw fields and metadata are preserved. User edits do not run AI rewriting or overwrite their original CV.
- Content, immutable revisions, and mutation receipts are saved atomically in the existing private mobile engine database on Railway’s persistent volume. A repeated mutation returns its own acknowledgement; different content cannot reuse the same mutation ID. Stale versions return 409. Invalid documents return 422 without replacing the last valid revision.
- Frontend recovery drafts include the canonical base revision, latest edits, confirmations, and any pending mutation. They are scoped by account and document, written before transport, and retained after ambiguous failures. Session generations fence late writes. Conflicts require an explicit choice; exports wait for the latest saved acknowledgement.
- `GET /api/v1/mobile/tailored-cvs?status=ready&limit=30&offset=0` lists owned saved documents and canonical save timestamps for reopening.

## Job Match

`GET/POST /api/v1/mobile/tailored-cvs/{id}/ats-score` retrieves or recalculates analysis; POST accepts `expected_revision`. Results include current/stale/unavailable status, analyzed revision, calculation time, job hash, scoring version, score breakdown, complete matched/missing evidence, and required/preferred skills. Recalculation is deterministic from cached job extraction, without AI generation. Missing extraction remains unavailable rather than a fabricated score. Rendering and scoring normalize visible supported content consistently.

User-confirmed skills can be saved freely alongside their resume edits. Confirmation means the user personally attested possession; it does not fabricate work history, certificates, or achievements.

### Mobile editor layout and evidence limits

Edit Resume retains its compact header and resizable Content / Templates / Format trays. Its document is the actual Railway PDF through the existing platform viewer. Templates lists every server option; Format retains paper, Text size, Margins and Advanced settings. Section editing remains in Content through the existing rich/plain field bindings, custom sections and section actions. Job Match and Check PDF retain separate endpoint actions.

Layout drafts are persisted independently from acknowledged layout and content autosaves. The PDF coordinator waits 400 ms after template/formatting changes and 700 ms after text field completion, then calls `saveForPdf()`. It waits for in-flight refresh, flushes content and stages the selected full layout through the serialized revision-aware writer. Concurrent preparations remain serialized; conflicts require explicit resolution and ambiguous mutations retain their receipts. Typing never schedules per-keystroke PDF generation. Late saves cannot authorize an obsolete render; late PDF responses cannot replace the desired file.

The last PDF remains visible during updates and failures. Full-screen preview is enabled only when the displayed PDF revision, saved-state flag and content/layout signature match. An owner-scoped registry retains the identical file for preview and Download. Viewer retries remount that file; retrieval retries retain the acknowledged revision; failed save retries preserve the content/layout draft. The inline viewer stays mounted during full-screen navigation. Tools, selected fields and panel height retain existing workspace recovery; PDF zoom/scroll are owned by the platform viewer.

All templates, paper sizes, fonts, pagination and section placement are rendered by Railway. Local template markup/pagination utilities remain in the repository for thumbnails/reference but do not render the editor document. iOS PDF gestures and sharing require native validation; Android retains the existing external PDF-viewer fallback.

## Actual PDF preview and export

`GET /api/v1/mobile/tailored-cvs/{id}/pdf?revision=N` renders that immutable revision using its saved layout through Resume-Matcher’s print pipeline. The app omits page_size; the backend uses ResumeLayoutSettings and PageFitSettings.for_mobile_layout for template, paper, margins, spacing, fonts and retained auxiliary settings. Authenticated responses expose X-Resume-Revision, X-PDF-Page-Count and Content-Disposition.

The app validates PDF revision/signature and displays that artifact inline in Edit Resume. The header PDF action opens the same loaded file in full screen; Download shares it. An owner/document/revision lease protects the file while either view needs it. Direct links use the pinned loader when no in-memory artifact exists. Done uses guarded Back to the mounted editor, with a same-ID fallback. Editor Back flushes content and retains recovery drafts. A newer save elsewhere cannot silently change the pinned export. Readability sends expected_revision only and remains advisory. Failed retrieval disables preview/download until retry; viewer retry remounts the same file. Native display, gestures, keyboard and Save to Files require device/simulator validation.

The inspected swiss-single renderer uses SafeHtml for Experience, Project and custom-item description arrays. Summary, Education descriptions, custom Text Block text and Skill List strings use plain React text; their formatting toolbars stay hidden. Rich formatting in those fields requires renderer support for sanitized HTML. The editor normalizes browser block/break elements to text newlines so PDF sanitization cannot concatenate adjacent words. The engine’s strict rich-text sanitizer strips explicit br tags and its current inline HTML uses normal whitespace; preserving authored hard line breaks in PDF needs renderer/sanitizer support. Existing supported marks and link annotations are transported in the same frozen revision used for both preview and download. Native text selection, keyboard behavior and Save to Files need device/simulator validation; source inspection and session tests do not establish live PDF fidelity.

Arbitrary unknown raw fields survive editing/storage; the existing print templates render the supported resume schema and `customSections`. Native PDF display and Save to Files must be checked on an iPhone simulator or published build.

### Backend pagination ownership and required behavior

Pagination is baked into the PDF returned by `https://resume-matcher-production-0ffd.up.railway.app/api/v1/mobile/tailored-cvs/{id}/pdf?revision=N`. The Expo viewer and download share that artifact; changing their layout cannot change its page breaks.

The Railway source at `246a6da3731e25f34feb865f008af0ca56d7e877` traces through `apps/backend/app/routers/mobile_editor.py` (`_render_snapshot`) → `/print/resumes/draft` → `apps/frontend/components/resume/resume-single-column.tsx` → Chromium PDF rendering in `apps/backend/app/pdf.py`. The current export selects the revision’s saved template and paper size with CV mode enabled; the following pagination policy describes the Single Column path.

The restrictive keep rules are in `apps/frontend/app/(default)/css/globals.css`: `[data-resume-item] { break-inside: avoid; }` keeps an entire role together. `apps/frontend/components/resume/page-break-attrs.ts` only marks entries with at least four bullets as splittable. Split entries still keep the first two bullets and last two bullets together. Section-heading keep rules carry the Experience heading with that larger group when it cannot fit; there is no explicit forced new page for Experience.

Required backend change: scope a flowing-entry policy to Experience in the mobile `swiss-single` print path. Allow roles to split between bullets regardless of bullet count. Keep the Experience heading, the first role's heading/company/date details, and its first bullet together; keep each later role's details with its first bullet. Remove the two-bullet leading/trailing grouping for these roles, preserve individual bullets where they fit on a page, and allow an oversized bullet to continue without clipping. Keep section containers splittable so Skills follows the preceding content naturally. Do not remove CV content, reduce readable font sizes, or impose a page count. If the desktop builder shares the changed policy, update its separate `components/preview/page-breaks.ts` keep zones to match; the Expo preview itself has no pagination algorithm.

Acceptance requires real renders of the same saved revision in both A4 and Letter: one case where the heading/role/first bullet fits below Summary but the complete role does not, and one where that leading group cannot fit. Check the actual preview and downloaded artifact, preserved text/order, page dimensions, readable type, natural continuation of bullets and Skills, and absence of clipping or duplicate content. These PDF checks remain outstanding until the separate backend template is changed and deployed; source inspection alone does not verify corrected pagination.
