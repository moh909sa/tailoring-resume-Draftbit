# Saved mobile CV editing contract

The tailoring review remains read-only. On Changes (Step 2 of 2), Continue to CV first checks the latest server preview and then sends `expected_preview_id` to `POST /api/v1/mobile/tailor/{tailoring_id}/confirm`. Railway atomically rejects a changed preview. A successful acknowledgement opens the saved tailored CV PDF preview; older bodyless confirmation clients remain compatible.

All editor operations require the existing Supabase bearer session and ownership of the tailoring record and its saved engine resume. They never modify the uploaded original. The unauthenticated desktop routes stay blocked in mobile deployments.

## Canonical document and autosave

- `GET /api/v1/mobile/tailored-cvs/{id}/editor` returns `tailoring_id`, integer `revision`, `updated_at`, structured `resume`, job context, `confirmed_skills`, and optional analysis. This is current engine content, not the original confirmation snapshot.
- `PATCH` on the same route accepts `expected_revision`, a secure UUID `mutation_id`, `resume`, and `confirmed_skills`. The existing schema is validated while raw fields and metadata are preserved. User edits do not run AI rewriting or overwrite their original CV.
- Content, immutable revisions, and mutation receipts are saved atomically in the existing private mobile engine database on Railway’s persistent volume. A repeated mutation returns its own acknowledgement; different content cannot reuse the same mutation ID. Stale versions return 409. Invalid documents return 422 without replacing the last valid revision.
- Frontend recovery drafts include the canonical base revision, latest edits, confirmations, and any pending mutation. They are scoped by account and document, written before transport, and retained after ambiguous failures. Session generations fence late writes. Conflicts require an explicit choice; exports wait for the latest saved acknowledgement.
- `GET /api/v1/mobile/tailored-cvs?status=ready&limit=30&offset=0` lists owned saved documents and canonical save timestamps for reopening.

## Job Match

`GET/POST /api/v1/mobile/tailored-cvs/{id}/ats-score` retrieves or recalculates analysis; POST accepts `expected_revision`. Results include current/stale/unavailable status, analyzed revision, calculation time, job hash, scoring version, score breakdown, complete matched/missing evidence, and required/preferred skills. Recalculation is deterministic from cached job extraction, without AI generation. Missing extraction remains unavailable rather than a fabricated score. Rendering and scoring normalize visible supported content consistently.

User-confirmed skills can be saved freely alongside their resume edits. Confirmation means the user personally attested possession; it does not fabricate work history, certificates, or achievements.

## Actual PDF preview and export

`GET /api/v1/mobile/tailored-cvs/{id}/pdf?revision=N&page_size=A4|LETTER` exports the identified immutable revision using the existing single-column Resume-Matcher print pipeline. Responses are authenticated, private/no-store PDFs with `X-Resume-Revision`, `X-PDF-Page-Count`, and `Content-Disposition` exposed to allowed browser origins. Missing layout metadata is completed without dropping populated supported/custom sections; explicit visibility flags remain respected.

The app validates the PDF response and displays/downloads the same artifact. The preview is the first destination after Changes confirms the saved copy. Its header shows the resume title and measured page count, an A4/Letter selector, and Edit Resume; Download PDF remains the bottom primary action. Each screen focus reads the latest saved document and pins the new artifact to that revision and selected paper size. An optional revision URL parameter is a minimum expected save, not a reason to retain an older artifact after editing. Edit Resume opens the existing editor with a preview-return marker. The editor waits for its existing serialized save before returning, retains the selected paper size, and stays open with recovery actions on save failure. Blur aborts preview reads and disposes the previous artifact; download remains disabled until the refreshed artifact is ready. iOS uses a cached file, WebView, and the native share sheet; web uses a Blob iframe/download. `POST /api/v1/mobile/tailored-cvs/{id}/parse-check` accepts `expected_revision` and `page_size` and checks a render of that same frozen document/settings. Readability checks are advisory and distinct from job match.

Arbitrary unknown raw fields survive editing/storage; the existing print templates render the supported resume schema and `customSections`. Native PDF display and Save to Files must be checked on an iPhone simulator or published build.

### Backend pagination ownership and required behavior

Pagination is baked into the PDF returned by `https://resume-matcher-production-0ffd.up.railway.app/api/v1/mobile/tailored-cvs/{id}/pdf?revision=N&page_size=A4|LETTER`. The Expo viewer and download share that artifact; changing their layout cannot change its page breaks.

The Railway source at `246a6da3731e25f34feb865f008af0ca56d7e877` traces through `apps/backend/app/routers/mobile_editor.py` (`_render_snapshot`) → `/print/resumes/draft` → `apps/frontend/components/resume/resume-single-column.tsx` → Chromium PDF rendering in `apps/backend/app/pdf.py`. The export selects `swiss-single` and the requested paper size, with CV mode enabled.

The restrictive keep rules are in `apps/frontend/app/(default)/css/globals.css`: `[data-resume-item] { break-inside: avoid; }` keeps an entire role together. `apps/frontend/components/resume/page-break-attrs.ts` only marks entries with at least four bullets as splittable. Split entries still keep the first two bullets and last two bullets together. Section-heading keep rules carry the Experience heading with that larger group when it cannot fit; there is no explicit forced new page for Experience.

Required backend change: scope a flowing-entry policy to Experience in the mobile `swiss-single` print path. Allow roles to split between bullets regardless of bullet count. Keep the Experience heading, the first role's heading/company/date details, and its first bullet together; keep each later role's details with its first bullet. Remove the two-bullet leading/trailing grouping for these roles, preserve individual bullets where they fit on a page, and allow an oversized bullet to continue without clipping. Keep section containers splittable so Skills follows the preceding content naturally. Do not remove CV content, reduce readable font sizes, or impose a page count. If the desktop builder shares the changed policy, update its separate `components/preview/page-breaks.ts` keep zones to match; the Expo preview itself has no pagination algorithm.

Acceptance requires real renders of the same saved revision in both A4 and Letter: one case where the heading/role/first bullet fits below Summary but the complete role does not, and one where that leading group cannot fit. Check the actual preview and downloaded artifact, preserved text/order, page dimensions, readable type, natural continuation of bullets and Skills, and absence of clipping or duplicate content. These PDF checks remain outstanding until the separate backend template is changed and deployed; source inspection alone does not verify corrected pagination.
