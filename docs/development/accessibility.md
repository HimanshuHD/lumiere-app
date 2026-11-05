# Existing-flow accessibility (#17)

## Implementation and ownership

| Area | Files | Behavior |
| --- | --- | --- |
| Document opening | Library, AllDocuments, BookmarksView, ReadingListView | Native title buttons provide keyboard entry without nesting other controls; pointer card behavior remains |
| Forms | AuthScreen, Profile, UploadPanel, MyUploads | Associated labels, appropriate autocomplete, required/invalid descriptions, password mismatch feedback and explicit file-picker buttons |
| Reader controls | Reader, PdfViewer, ReadLaterButton | Named icon actions, selected/expanded state, current chapter, visible focus and preserved existing bookmark semantics |
| Dialogs | shared/ui/modal.tsx | Native showModal makes background inert; explicit Tab wrapping, top-dialog Escape isolation, initial heading focus, scroll locking and focus return |
| Overlay consumers | Library, OnlineLibraryModal, MyUploads, CatalogAdmin, Reader | Details, confirmations, edit forms, Settings and Contents share the dialog contract |
| Disclosures | shared/ui/use-disclosure.ts, UserMenu, ImportMenu | Expanded-state triggers, ordinary Tab order, Escape return, outside-pointer and focus-leave dismissal; no incomplete ARIA menu roles |
| Notifications | shared/ui/toast.tsx | Labelled dismissal and polite announcements; portal follows the active dialog to avoid becoming inert background content |
| Theme/focus | index.css, reader/preferences/theme.ts and existing views | Readable helper/button colors, theme-specific hover, focus-visible outline, skip link and reduced-motion support |
| PDF ownership | reader/pdf/pdf-render-queue.ts, pdf-page-layers.ts | Canvas, text and links use the same page/viewport; replacement/disposal clears obsolete layers and cancels text work |
| PDF destinations | reader/pdf/pdf-links.ts | Validated HTTP(S)/email links and bounded page/named/reference destinations; stale callbacks cannot navigate |

No backend/schema/authorization change is required. Collection meanings, reading progress and catalog
eligibility are preserved; future Discover, location bookmarks and moderator workflows remain separate.

## Dialog and focus rules

Focus starts at a dialog heading where available, then follows native controls. Tab and Shift+Tab wrap
within the top dialog, including dynamically enabled controls and notifications. Escape closes only
the top dialog. Destructive/save consumers can decline dismissal while their operation is pending.
Closing returns focus to a connected opener, otherwise the remaining dialog or main content.
Nested dialogs retain the outer scroll lock. Route/unmount cleanup closes the native dialog and
releases its lock. Native showModal support is required by supported browsers.

## PDF layers and limits

The existing installed PDF.js version provides TextLayer and AnnotationLayer, with its matching viewer
stylesheet. Text sits over an aria-hidden canvas; link annotations sit above text. CSS viewport size
is independent of high-DPI canvas backing pixels. Image-only/empty pages have an explicit no-text
message. Internal links navigate to the destination page while retaining the reader's zoom model;
exact destination coordinates/custom Fit modes are not newly implemented. External links open with
noopener/noreferrer. Script URLs, file/data URLs, embedded credentials, PDF scripts, form scripting,
attachments and unsupported action types are not enabled by the annotation integration.

The text layer exposes available extracted text, but does not reconstruct missing PDF tags or
guarantee source reading order. OCR, PDF source remediation, interactive forms, highlights and notes
are outside #17. EPUB accessibility still depends partly on source content rendered by epubjs.

## Automated reproduction

```sh
npm ci --include=dev
npm run setup:browser
npm run check:db-types
npm run check:boundaries
npm run typecheck
npm run lint
npm test
npm run build
npm run test:browser
```

The browser command now includes tests/browser/accessibility.mjs. It scans representative library,
reader light/dark/sepia and dark-hover, Contents, Settings, online-library, Profile, upload/error,
sign-in, shared-dialog and PDF states with axe-core WCAG A/AA tags including applicable 2.1/2.2 rules.
Scans wait for theme transitions to finish rather than measuring intermediate animation colors.

Explicit assertions cover keyboard document opening, disclosure traversal/dismissal, Tab/Shift+Tab
containment, nested Escape/focus restoration, notifications inside dialogs, file selection, text
selection, safe link attributes, internal link activation, zoom/resize layer bounds, empty-page
feedback, renewed URL page retention and disposal. Unit tests cover link validation/destination
resolution and render-queue cancellation/failure/retry. Existing suites still cover PDF/EPUB/TXT
restoration, account transitions and async lifecycle recovery.

All fixtures use synthetic documents/accounts and mocked Supabase. The new PDF is generated locally;
no real account, external catalog or real document is required. Axe is a development-only dependency.
Optional A11Y_SCREENSHOTS points to an existing output directory for synthetic PDF screenshots.

## Manual acceptance — record actual results before closing #17

Automated scans are not a screen-reader audit. The following checks remain manual acceptance until
the reviewer records the browser, assistive technology, date, result and any limitations.

- [ ] Keyboard-only: sign in, search/filter, open details, save/read-later, open/resume each format,
      upload a document/cover, edit visibility, use confirmations, and sign out.
- [ ] For every dialog/drawer: initial focus, visible focus, Tab/Shift+Tab containment, Escape,
      pending-operation behavior, background inertness, focus return and navigation/unmount cleanup.
- [ ] User/Import dropdowns: Enter/Space, normal Tab order, Escape and dismissal when focus leaves.
- [ ] NVDA with Chrome/Firefox on Windows: control names, form labels/errors, dialog announcements,
      selected/expanded state, notifications, headings and reading order.
- [ ] PDF with real text/links: select/copy text, read extracted content, activate internal/external
      links by keyboard, zoom/resize and verify text/link alignment including rotated pages/high DPI.
- [ ] Image-only PDF: no-text feedback is accurate; no OCR/full-remediation claim is made.
- [ ] Light/sepia/dark, hover/focus, 200% browser zoom and narrow screens remain usable.
- [ ] Real signed-in Supabase upload/edit/delete/catalog workflows preserve backend behavior.

An automated pass does not mark these manual checks complete. Record issues in #17 if a real browser
or screen reader exposes a gap; broader future feature work remains tracked separately.
