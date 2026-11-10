# AI Resume Tailoring

An Expo iOS, Android, and web app with Home, Tailor, and Library bottom tabs. Home links directly to Tailor CV, My CVs, and Tailored CVs. It uploads PDF/DOCX originals to the existing Resume-Matcher backend and lists the signed-in user's saved CVs. Files are limited to 4 MiB. Processing failures stay visible alongside the saved original, with an explicit Retry processing action that reuses the retained file.

## Existing services

- Supabase Auth: https://suvcisvnbwplbemuxspu.supabase.co
- Railway: https://resume-matcher-production-0ffd.up.railway.app
- Upload: `POST /api/v1/mobile/resumes/upload`, multipart field `file`
- List: `GET /api/v1/mobile/resumes`, an array of CV metadata
- Delete: `DELETE /api/v1/mobile/resumes/{id}`, HTTP 204 on success
- Background tailoring: `POST /api/v1/mobile/tailor/jobs` (HTTP 202), JSON `resume_id`, `job_description`, and secure UUIDv4 `progress_id`; no length or intensity preferences
- All requests use the current Supabase user access token as a bearer token. The app does not access Supabase Storage directly or create infrastructure; Railway owns file and record removal.

## Configuration

Draftbit environment variables (development, staging, and production):

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: client-safe `sb_publishable_...` key
- `EXPO_PUBLIC_RESUME_API_URL`

Server-only Supabase secrets belong on Railway, never in the mobile app.

## Authentication and uploads

My CVs contains the existing sign-in/account creation form in an account sheet. Supabase currently requires email confirmation for new accounts. Confirm the account by email, then return to sign in. Sessions persist between launches; native refresh follows app foreground state.

Native iOS uses the system Files picker and uploads the selected URI with its original filename and canonical MIME type. Web uses the browser picker and File object. Railway processes uploads synchronously, so the app distinguishes sending the file from waiting for processing. It reloads the list even after an error because an original may already have been saved.

Each My CVs card has a three-dot menu with Delete CV and a confirmation dialog. Deletion is available for every processing status. After HTTP 204, the app removes the card and refreshes the list. Errors keep the dialog open for retry; a failed refresh does not restore a confirmed deletion.

## Web access

Railway's `CORS_ORIGINS` must include the exact browser origins, preserving any port. Development: `https://2272b89538.sandbox.draftbit.dev:5101`; staging: `https://d4d5c0e323.draftbit.dev`; production: `https://4a53e9e740.draftbit.dev`. Use the current sandbox Metro port for local browser inspection. Native iOS requests do not need CORS.

## Structure

- `app/(tabs)/home.tsx`: dashboard; `app/(tabs)/tailor.tsx`: preparation form
- `app/(tabs)/library/`: My CVs and Tailored CVs with shared section navigation
- `app/index.tsx`: Home redirect; `app/my-cv.tsx`: legacy My CVs redirect
- `components/layout/` and `components/library/`: safe-area shells, headers, and section navigation
- `components/cv/`: original-CV screen, account form/sheet, real-CV selection sheet, document rows, empty states, and notices
- `lib/auth/` and `lib/supabase.ts`: authentication
- `lib/cv/`: typed responses, file validation, platform adapters, requests, and screen state
- `app/tailoring/`, `components/tailoring/`, and `lib/tailoring/`: processing, preview review, and owner-scoped workflow state
- `theming/`: shared light/dark colors and typography

## Tailoring status

Tailor CV generates real previews from Ready originals and pasted job descriptions of 50–12,000 characters. The form accepts pasted text only. Exact preparation inputs are saved separately to account-scoped device storage before submission. Only Ready originals without recovery flags can be selected. Identical inputs reopen an existing review or saved CV instead of creating another AI job. No page limits, bullet limits, or intensity preferences are sent.

`lib/tailoring/TailoringProvider.tsx` keeps the existing owner-scoped review workflow. `lib/tailoring/jobs.ts` manages durable background jobs with the same authenticated API client. Each new job gets a secure Expo Crypto UUIDv4. Its ID, exact form inputs, and start time are written to owner-scoped AsyncStorage before the short `POST /api/v1/mobile/tailor/jobs` request. The backend’s canonical progress ID is persisted on acceptance. Device storage failure prevents submission.

The processing screen preserves its document animation, elapsed-time counter, seven stages, and styling, and lets users return to Tailor while the same server job runs. Foreground jobs poll `GET /api/v1/mobile/tailor/progress/{progress_id}` every 1.75 seconds with no overlapping reads. Queued jobs continue polling. Checks come only from `completed_steps`; only a running `current_step` spins, and optional/visited-only steps remain muted. The counter uses persisted/server timestamps and never advances stages.

AppState pauses reads while backgrounded and reconciles them on foreground. Startup checks the saved job and `GET /api/v1/mobile/tailor/jobs/recent`, including recovery if the acceptance response was lost. Queued/running/succeeded/failed/interrupted states come from the backend. The Railway worker continues independently of client requests or application lifetime.

On success, `GET /api/v1/mobile/tailor/jobs/{progress_id}/result` retrieves the existing preview/review, persists the review pointer, and opens the existing Keywords Review automatically. Root navigation waits for the navigator to mount and acknowledges recovery only after the destination is reached. A delivered-job marker prevents old completed jobs from reopening. The existing review cache still stores only references, inputs, step, selections, and pending review navigation; full CV contents are not cached.

All automatic recovery uses GETs. Network interruption, restart, and lost HTTP 202 acknowledgements never trigger another AI submission. An explicit “Retry same job” resends the same idempotent progress ID when submission is unconfirmed. Explicit Retry for server-reported failed/interrupted jobs creates a fresh ID. Backgrounding/account changes/unmount cancel client transport only, and never delete the durable job reference or cancel the server worker.
Success opens the two-step Keywords → Changes review automatically. The Tailor screen links back to an unfinished review.

1. **Optimize Keywords:** displays the backend ATS estimate and score history, supported and attestation-required suggestions, applied keywords and warnings; confirmed placements appear on Changes. All returned suggestions appear in one scrollable list without batching. Users choose multiple skills before applying; “I have this” explicitly attests skills absent from the original. Every keyword request uses the latest `preview.preview_id`. The returned preview and review replace the current draft, enabling repeated applications within the backend limit of 30 keywords. Scores can rise, fall, or remain unchanged.
2. **Review Changes:** shows Skills Added and Descriptions Modified, with Skills Removed and Certifications Added only for positive counts in a two-column layout. The Summary Changes, Skills Changes, and Description Changes accordions retain dynamic counts, individual high-risk indicators, and warnings beside matching comparisons. Unmatched warnings and missing verification details remain visible in the review. The three main accordions have continuous borders. Description comparisons pair each original and updated bullet in one compact card without role/company headings. Step 1 requires applying or deselecting pending keyword selections before Continue to Changes becomes enabled; applying stays on Keywords, and failed pending selections remain retryable. Step 1 omits the placement accordion. A compact Where your keywords went section on Changes combines all current server-confirmed locations per keyword. Complete Before/After text is retained. Description originals are entirely red and struck through; updated bullets use normal text with blue only for newly added keywords confirmed by matching placement paths, with no underlines or generic diff highlights. Summary comparisons show the full original paragraph red and struck through, omit repetitive wording labels, and keep updated text plain with blue only for newly added keywords assigned to Summary. The neutral keyword-location card keeps the latest server score pair and a positive-delta badge visible, with a current-score-only fallback. Its counted, accessible disclosure starts collapsed on entry to Changes; expanded rows use foreground keyword text and stacked neutral destination badges. Added skills use compact green rows; removals and modifications retain comparisons. Backend verification data and the existing Changes safety warnings remain intact. Only the skill-attestation note uses a yellow card; engine notes use neutral text without warning icons. Actual load/apply/save failures use Notice errors; expired previews, conflicts and successful reload updates use neutral information, selected by explicit severity rather than message text. Recovery actions are retained. The Engine feedback accordion is omitted from Changes; complete suggestions, writing reports, refinement statistics and content/page-fit details remain intact in underlying preview data for future editor use. Grounding checks appear beside the related Changes content, including collapsed sections as plain-language experience and bullet locations; raw server warnings remain intact. Keyword selection never accepts experience claims automatically. The engine marks high risk diffs with `confidence: "high"`. Missing counts and comparisons remain unavailable and produce warnings; they are never inferred.
Changes ends with **Continue to CV** and “We’ll save a separate copy for you to edit.” It runs the existing latest-preview check and confirmation, serializes requests, shows Saving, and opens the acknowledged saved CV in PDF preview. A newer server draft must be reviewed and requires another tap; failures retain Changes and its recovery action. Legacy recovery references on the removed Save step resume at Changes without saving automatically. Original CVs are never modified.

Review endpoints use the existing Supabase bearer token:

- `GET /api/v1/mobile/tailor/{tailoring_id}/review`
- `POST /api/v1/mobile/tailor/{tailoring_id}/keywords` with `expected_preview_id` and `{keyword, attested}` entries
- `POST /api/v1/mobile/tailor/{tailoring_id}/confirm` with `expected_preview_id`

409 conflicts and uncertain mutation outcomes reload the latest review without resubmitting. Validation errors preserve choices; expired previews require explicit regeneration with preserved inputs. Tailored CVs lists ready documents through the authenticated library endpoint with pagination and reopens the same saved editor.

Run the response, diff, and authenticated-request regression tests with `node --test tests/tailoring-review.test.cjs tests/tailoring-progress.test.cjs tests/tailoring-jobs.test.cjs`. Fixtures are isolated test data and never appear in the app.

## Saved CV editor and PDF export

Edit CV opens by default with Personal Information, Summary, Experience, Education and Skills first, followed by other supported sections. Each opens separately; Experience offers Add Job through the existing autosave. Design & Layout links to the working A4/Letter selection in Preview. Job Match displays exact engine score/count/percentage, stale status and Update Match, followed by expandable Highlights, ATS Score Breakdown, Missing Keywords, Recommendations and About. Highlights switches between current verified keyword lists and the job description. Inline ranges and revision-bound user-added provenance need backend support; blue placements are never inferred from attestation. Templates, font sizes, line spacing and margins remain hidden until the mobile PDF API applies them. See the evidence requirements in `docs/TAILORING_EDIT_CONTRACT.md`.

Editor tabs and PDF loading/error/document views initialize themed backgrounds from their first render. This keeps NativeWind v4’s variable-provider structure stable during state changes; its upgrade-warning serializer can otherwise throw a misleading navigation-context error (see [NativeWind #1812](https://github.com/nativewind/nativewind/issues/1812)). Expo Router continues to own the navigation container.

`app/cv-editor/` contains Edit CV / Job Match and a separate actual PDF preview. The routes require a saved tailoring-record UUID, distinct from the uploaded or engine resume IDs. Open them through Tailored CVs; Draftbit direct screen previews need an `id` supplied through Routes. PDF links may include a positive saved `revision` as a minimum expected save; each focus loads the latest saved revision. Missing/invalid links show recovery actions, and the editor returns to Tailored CVs. Navigation ignores late preview actions after leaving the editor. Tailor’s Open saved CV and Library’s Open cards open PDF preview first; unsaved drafts still Continue review. Preview Back returns to the originating screen, or Tailored CVs after a new confirmation. Changes opens PDF preview first, with the resume title, page count, A4/Letter selection, Edit Resume at the top and Download PDF at the bottom. Edit Resume opens the existing editor; its Back and Preview PDF actions wait for saving before returning to the same preview. Returning refreshes the PDF and retains paper size, while downloads share exactly the displayed saved artifact. Native section forms preserve untouched schema fields, custom sections, metadata, inline formatting, and bullet styles. Engine-identified skills can be personally confirmed and added without regenerating the CV or modifying the original.

`GET/PATCH /api/v1/mobile/tailored-cvs/{id}/editor` reads and saves canonical content. PATCH includes `expected_revision`, a secure UUID `mutation_id`, structured `resume`, and `confirmed_skills`. Railway atomically saves immutable revisions and replay receipts in the existing private mobile document database on its persistent volume; no new Supabase schema is required.

`lib/editor/session.ts` keeps an account/document-scoped device recovery copy, serializes saves, retains the same mutation after uncertain responses, and preserves newer edits during in-flight requests. Server conflicts require an explicit choice. Session generations fence late storage writes after navigation/account changes. Preview waits for the latest server acknowledgement.

`GET/POST /api/v1/mobile/tailored-cvs/{id}/ats-score` retrieves/recalculates deterministic job match using cached job extraction. Results identify their revision, calculation time, job hash, scoring version, complete keywords, and current/stale/unavailable state. Required/preferred skills may be attested; other missing terms remain wording suggestions. Previously confirmed missing skills can be restored to the document. The first visit to Job Match calculates an absent result; later edits mark earlier analysis stale until updated.

`GET /api/v1/mobile/tailored-cvs/{id}/pdf?revision=N&page_size=A4|LETTER` renders that immutable saved revision using Resume-Matcher’s single-column print template. Authenticated responses must expose their matching saved revision and identify measured page count when available. iOS downloads to cache, displays the actual file in WebView, and opens the Expo share sheet for Save to Files. Web displays and downloads the same PDF Blob. Android uses share-to-view. `POST /api/v1/mobile/tailored-cvs/{id}/parse-check` checks the same revision/settings on demand. Native-only modules have web-safe platform counterparts.

See `docs/TAILORING_EDIT_CONTRACT.md` for the current contract. Use Draftbit Publishing for native builds and web deployments.

Release dependencies and required backend contracts are tracked in `docs/RELEASE_READINESS.md`. Engine feedback remains intact in underlying preview data; every verification warning remains available through review, and account-scoped review references survive sign-out.
