# Live resume renderer

`CvPreviewSurface` accepts `LiveCvRenderer` through its existing renderer prop. Web uses a sandboxed iframe; native uses the existing react-native-webview dependency in a platform module. Resume and layout messages replace paper markup without replacing the scrolling document. The source has no fetch, save, scoring, PDF, analytics or external asset calls. Local state is the actual editor resume and its separate layout trial.

The paper uses 96 CSS pixels per inch, literal millimeter margins and the engine's discrete text/spacing scales. It scales to the available device width while retaining a full measured content height. It does not truncate text, set a page count or impose print page breaks. Content controls are 44 screen points even when the paper is scaled. Section pencils open the existing field editors in the tray; field-target bindings support nested entry/bullet paths without losing unknown fields or rich marks.

The local view is continuous. Railway's PDF is authoritative for pagination, font metrics, annotations and downloads. Noto Serif / Sans / Sans Mono are preferred when installed, with local platform fallbacks; the live renderer does not fetch fonts. Both paper sizes and all live formatting controls use the saved engine settings, but identical browser/native line wraps are not guaranteed. Unsupported saved template IDs stay intact and require explicit PDF preview.

The frame receives only escaped structured data. Plain fields remain escaped text; rich descriptions allow strong/em/u/a with safe URL schemes. A restrictive content security policy and blocked navigation prevent loading executable resume content or external assets. Web messages are checked against the frame window; native messages validate their shape. Selected fields, tools and scroll offsets live in the account/document recovery cache, separately from canonical server data.

## Engine rules and attribution

The template IDs, maps/presets and presentation rules are adapted from Resume-Matcher, copyright its contributors, under Apache-2.0. This is a local cross-platform renderer, rather than a copied Next.js component. Upstream sources:

- [template-settings.ts](https://github.com/moh909sa/Resume-Matcher-Railway/blob/main/apps/frontend/lib/types/template-settings.ts): font/spacing levels, compact multipliers, paper sizes, accent colors and Clean font preset.
- [resume styles](https://github.com/moh909sa/Resume-Matcher-Railway/tree/main/apps/frontend/components/resume/styles): _base, _tokens, swiss-single, clean and modern.
- [resume components](https://github.com/moh909sa/Resume-Matcher-Railway/tree/main/apps/frontend/components/resume): centered identity, Single Column ruled headings, Clean company/role entries and plain skill lists, Modern accent rules and name underline.

The adapted values are centralized in `lib/editor/documentTheme.ts`; markup and print-style adaptations are in `lib/editor/liveDocument.ts`. Preserve the upstream [Apache license](licenses/RESUME_MATCHER_APACHE_2.0.txt) with these adaptations. New templates should declare local support only after their rules are implemented; never alias an unsupported saved template to an unrelated live style.
