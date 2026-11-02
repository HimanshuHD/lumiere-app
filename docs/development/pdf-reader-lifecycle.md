# PDF loading, painting and fitting (#12)

## Ownership

`PdfSession` owns `PDFDocumentLoadingTask`, including its document and worker. Every replacement invalidates the old generation. Closing the component also invalidates it, including when the lazy PDF.js import has not finished. Each task's asynchronous `destroy()` is called once; stale completions cannot update the viewer. Cleanup failures are logged rather than creating unhandled rejections.

`PdfRenderQueue` serializes canvas access. A newer page/zoom request cancels active painting and waits for settlement before resizing or repainting that canvas. It skips superseded queued requests and checks again after `getPage()`. Obsolete requests cannot clear a current busy state or show an error. Genuine current errors remain visible and retryable.

The viewer creates a session and render queue for each URL/load attempt. Signed URL renewal retains the current page. Document identity remains keyed by `doc.id` in Reader. This issue does not change progress persistence or EPUB behavior.

## Failures

Load errors offer **Retry loading PDF**, which creates a fresh session. Render errors offer **Retry rendering page**, which reuses the loaded PDF and selected page/zoom. Both keep the original-file link as an alternative where applicable. Explicit cancellation is silent because its request is obsolete; errors are not suppressed merely because they occurred during painting.

## Fit and zoom

Automatic fitting uses the current page's `getViewport({ scale: 1 }).width`, which includes page rotation. The scale is the available CSS width divided by this actual width. A ResizeObserver measures the canvas scroll area's inner width after padding and scrollbar space. Device pixel ratio changes backing bitmap resolution, not the CSS fit.

Manual zoom survives container resizing. **Fit width** returns to automatic fitting. Automatic fitting may go below the manual zoom minimum for unusually wide pages. Repeated zoom clicks use the latest requested scale rather than an older canvas render. The status row has a stable height and the scroll area reserves its vertical scrollbar gutter to avoid fit/repaint feedback loops.

## Automated validation

Run:

```sh
node --test tests/*.test.ts
npm run typecheck
npx eslint src/components/PdfViewer.tsx src/features/reader/pdf/*.ts
npm run build
```

Focused tests in `pdfSession.test.ts`, `pdfRenderQueue.test.ts` and `pdfFit.test.ts` cover stale loading, cleanup, cancellation settlement, rapid zoom, stale page lookup, genuine errors/retries, CSS/pixel-ratio sizing and portrait/landscape/wide-page fitting. These deterministic tests assert resource ownership; manual UI observations alone cannot prove that workers/tasks were destroyed.

## Manual acceptance

Use portrait, landscape, mixed-page-size and large PDFs. Keep the browser console open.

1. Click Zoom In/Out rapidly and change pages during rendering. The final page/zoom must win with no overlapping-canvas error, blank page or persistent busy status.
2. Disable cache and throttle requests. Open a PDF, leave during loading, then open another document. Only the new document may appear; repeat several times.
3. Block the PDF request in DevTools. Confirm a visible load error; unblock it and choose Retry loading PDF. Loading must recover without reloading the app.
4. Resize desktop and mobile/orientation widths in Fit width mode, including mixed-size pages. The page must fit the inner container without horizontal clipping. An unusually wide page must also fit below 40% when needed.
5. Select manual zoom and resize. The selected zoom must remain. Choose Fit width to resume automatic sizing. At manual zoom, horizontal scrolling must allow reaching the left edge as well as the right.
6. Navigate several pages, allow signed-link renewal (normally around 12 minutes), and confirm the current page remains selected. A new document must still use its own saved position.
7. Genuine render errors and their Retry action are covered deterministically by injected render/page-lookup failures in the queue tests. A normal network block primarily exercises loading failures.

Use a signed-in application session for final integration validation; the isolated viewer/browser harness does not validate Supabase authorization or persistence.

## Validation recorded for this change

- 93 TypeScript tests, typecheck, targeted ESLint and production build passed.
- Isolated local Chromium with real PDF.js: portrait, landscape and 4,000-point-wide pages fitted a 960 px desktop canvas; the wide page fitted a 320 px mobile canvas at 8%.
- Rapid zoom requests reached 300%; manual zoom remained stable across resizing; Fit width restored automatic sizing.
- Simulated signed-URL replacement retained page 3; blocked file loading and an injected canvas-context failure both recovered through the visible Retry actions.
- Closing during delayed loading left no stale canvas; no uncaught browser errors were observed.

These browser checks used synthetic public fixtures in a temporary isolated harness. Signed-in Supabase integration, a real 12-minute authorization renewal and cross-browser manual review remain separate checks.
