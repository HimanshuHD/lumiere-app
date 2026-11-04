# Asynchronous lifecycle regression checks

Run `npm run test:browser` after installing Chromium with `npx playwright install --with-deps chromium`.
Tests use synthetic identities, injected dependencies and mocked transport; no real account is changed.

## Catalog import ownership

Each import owns a token. Feed changes, Back, Close and unmount invalidate that ownership. Persistence
may complete, but obsolete callbacks cannot navigate or clear a newer request's pending state.

Manual: throttle an import, return to catalogs, browse another feed and begin another import. The first
completion must not open the reader or re-enable controls while the new import is pending. Returning
to catalogs or closing the modal without a new import must prevent automatic opening on completion.
The delayed-response browser regression covers these sequences and duplicate actions.

## Avatar selection ownership

Each selection has a generation. Upload completion clears a draft only when that generation still owns
it; a newer selected image/preview remains available. An in-flight guard prevents duplicate saves.
Preview cleanup still runs on replacement, confirmed save and unmount.

Manual: upload image A under throttling, select B while A is pending, then let A finish. B must remain
selected with a working preview. Save B and verify confirmed completion clears that selection. Leave
with an unsaved selection and verify preview resources are released. Browser tests also check these.
