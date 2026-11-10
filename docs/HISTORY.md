# Product decisions

- Original CV storage and AI processing are separate: a processing failure never hides a saved original.

- Home, Tailor, and Library separate preparation from original-file management; AI tailoring stays disabled until the real workflow is connected.

- Original CV deletion requires confirmation and is handled by Railway for every processing status; the app never deletes Storage files directly.

- Tailoring uses a three-step review with explicit skill attestation and final confirmation; only the server supplies scores and changes, and original CVs remain unchanged.

- Processing displays only real Resume-Matcher stage progress; authenticated polling is independent of the authoritative preview request and never adds AI work.

- Tailoring runs as a durable Railway background job; saved IDs and GET-only recovery survive backgrounding and relaunch without automatically repeating AI work.

- Grounding checks appear alongside Changes and the final safety review with readable experience/bullet locations; keyword suggestions are never paginated by the backend application limit.

- Review Changes emphasizes primary metrics and a calm expandable verification section, with complete struck-through original summaries beside word-level highlights.

- Review Changes keeps verification warnings with their individual comparisons and shows unmatched safety issues without a separate verification accordion.

- Review Changes uses connected accordions, compact added skills, and full description comparisons; Save holds the updated CV preview and outstanding added-skill checks.

- Save uses three live metrics and a neutral expandable verification review, retaining all safety details and explicit authenticated confirmation.

- Save displays an ordered complete CV directly; inline editing remains unavailable until authenticated versioned draft updates and revision-bound confirmation are supported.

- The read-only Save CV uses a continuous professional document layout with shared section headings, subtle dividers, and grouped entries.

- Confirm & Save hands off to a durable saved-CV editor with account-scoped recovery, revision-safe autosaves, explicit skill confirmation, current job-match analysis, and actual revision-bound PDF preview/export.

Tailor preparation is saved per account; identical inputs reopen existing results, and engine feedback and verification warnings remain available through confirmation.

Editor tab and PDF state transitions retain a stable NativeWind variable-provider structure under the existing Expo Router navigator.

Resume Review uses Keywords → Changes; confirmation saves a separate copy directly from Changes before opening the editor.

Changes confirms and saves before opening PDF preview; Edit Resume returns after saving and refreshes the same document while retaining paper size.

CV Editor keeps a fixed content navigation order and evidence-based Job Match disclosures; Design & Layout reuses Preview paper sizes, while unsupported formatting and inline keyword provenance remain backend-dependent.

CV Editor uses persistent secondary navigation: Edit CV → Resume Content / Design & Layout and Job Match → Overview / Keyword Highlights, without replacing the autosave session.

Resume Content uses a continuous inline form with growing text fields and open entry cards, reusing canonical autosave while preserving editor tabs and preview-first navigation.

Resume Content restores section rows and original editors without the intro; previews, empty hints and captured scroll-offset restoration keep the list easy to resume.

Section editor fields wrap and grow from saved text before focus; Summary stays roomy and iOS keyboard-aware scrolling keeps Done in a fixed header.
