# Startup performance

Issue [#26](https://github.com/HimanshuHD/lumiere-app/issues/26) separates the first visible feedback from the time the app can be used.

## Code and lifecycle

- `index.html` contains the static screen, system-font styling and recovery behavior. The screen has no asset dependencies or animation. It stays visible while the application root is inert. A module load error reveals a reload button immediately. A 30-second timer covers a stalled module or initialization, and a `noscript` message explains how to proceed when scripting is disabled.
- `src/App.tsx` signals readiness from a layout effect after the initial auth gate commits the app screen. The HTML handler clears its timer and error listener, makes the app interactive and removes the overlay before paint. A signed-in route can still show its own data or screen-loading state after the app shell becomes interactive.
- `vite.config.ts` lets the development dependency optimizer prebundle Lucide. The separate PDF.js exclusion is preserved.
- `src/App.tsx` imports the reader, upload, profile, upload management, catalog administration and online catalog on demand. `DeferredContent.tsx` confines loading and error feedback to the affected region. Failed route loads offer a page reload while the shell remains available. The PDF viewer CSS now travels with the reader chunk. Authentication and account-data initialization retain their existing lifecycle.

## Measurements

Baseline commit `1994b0beeebe6d099a79eafe06b2f08e252045c2` compared with the loader, optimizer and route-splitting changes. Headless Chromium 153 on the same workspace used loopback Vite and a mocked Supabase server with a synthetic account. Cold means a new browser context, warm means repeat navigation in that context. The throttled runs used 80 ms latency, 625,000 bytes/s down and 250,000 bytes/s up. These are individual observations, not medians or estimates of hosted production performance.

Counts and transfer sizes cover same-origin Resource Timing entries, excluding the HTML document, third-party fonts, and the Supabase mock origin. A cached resource can still appear as an entry. Ready means the email input was visible and interactive when signed out, or the account menu was available when signed in. The signed-in timing measures shell availability.

| Mode and scenario | Resources | Transfer KB | First contentful paint ms | LCP ms and element | Ready ms |
| --- | ---: | ---: | ---: | --- | ---: |
| Dev signed out cold | 1666 → 97 | 11446 → 3467 | 3592 → 284 | 3864 → 2072, H1 | 4097 → 1948 |
| Dev signed out warm | 1666 → 97 | 36 → 26 | 544 → 40 | 752 → 240, H1 | 801 → 285 |
| Dev signed in cold | 1666 → 97 | 11446 → 3467 | 1836 → 104 | 2040 → 608, P | 2479 → 951 |
| Dev signed in warm | 1666 → 97 | 36 → 26 | 428 → 40 | 628 → 784, P | 663 → 822 |
| Dev signed out throttled | 1666 → 97 | 11446 → 3467 | 30764 → 136 | 31112 → 6172, H1 | 31094 → 6511 |
| Preview signed out cold | 2 → 2 | 236 → 176 | 112 → 68 | 276 → 256, H1 | 156 → 142 |
| Preview signed out warm | 2 → 2 | 0.6 → 0.6 | 64 → 28 | 88 → 72, H1 | 109 → 90 |
| Preview signed in cold | 2 → 2 | 236 → 176 | 208 → 72 | 224 → 236, P | 165 → 256 |
| Preview signed in warm | 2 → 2 | 0.6 → 0.6 | 64 → 32 | 100 → 104, P | 142 → 146 |
| Preview signed out throttled | 2 → 2 | 236 → 176 | 768 → 232 | 768 → 680, H1 | 918 → 926 |

The optimizer step alone dropped Lucide entries from 1,537 to 1 and overall development entries to 130. Production already bundled those icon modules. Route splitting reduced the initial minified JS and CSS from roughly 989 KB to 427 KB before compression. Chromium's cold signed-out script-duration counter was 59 → 66 ms in development and 37 → 44 ms in preview. These single runs demonstrate the request and payload reductions. They show mixed script and signed-in readiness timings.

A separate signed-in run waited for the empty-library result from the mock API, which measures settled library content rather than the account menu. The timings were 4,827 → 2,524 ms cold and 1,476 → 430 ms warm in development. In preview they were 306 → 248 ms cold and 200 → 145 ms warm.

## Reproduce

1. Install the locked dependencies on both revisions with `npm ci`. Use the same browser version, app environment and test account on both.
2. Start development with `npm run dev -- --force`. For production, use `npm run build` and `npm run preview`.
3. Record a fresh context and repeat navigation with caching enabled. Record Performance and Network for both, then repeat with the same throttle preset. Set the Resource Timing buffer above 2,000 entries before loading the development baseline.
4. Record first contentful paint, the actual LCP element, and the first interactive sign-in or account control. In an environment with real data, separately record when library results or the empty/error state settle.
5. Run `node tests/browser/navigation.mjs` after Chromium setup. It checks the static screen while the production entry script is held, then aborts the bundle, verifies the reload action, and confirms that the recovered app has no overlay or inert root. It also checks disabled JavaScript, OAuth return handling and document deep links.


## Branded loader and app themes

The supplied HTML's option 02, Reverse mirrored drawing, is the single loader animation. The exact source SVG paths are inline in the initial HTML so the animated logo adds no image request. The supplied static light/dark SVGs are used in app branding, and the SVG/ICO favicons are served relative to the Vite base.

The page uses the reference's ivory (#f7f5ef), forest (#17231f), foregrounds and copper logo colors (#a46a45 / #d19a70). Small light-theme text uses #647268 and copper buttons use #a06843 to meet text contrast. Arial and Georgia match the supplied HTML and remove the previous external font requests.

A sun/moon toggle is available before React loads and in the app header/sign-in screen. It stores the choice under lumiere:app-theme. With no saved choice it follows the operating system. Cross-tab storage changes and unavailable storage are handled. The React toggle subscribes to the same theme event used by the startup script, so handoff keeps the user's current selection. App surfaces and icon stroke weights share the brand palette.

The initial screen enters from above for 560 ms. Once React is ready, entry completes, then the loader exits left over 440 ms while the prepared app enters from the right. The app root stays inert until the transition finishes. A fallback timer completes cleanup if an animation fails. Reduced motion skips the drawings and slides. This requested animation sequence can add up to roughly one second before interaction on a fast cached startup. Earlier timing measurements above predate this visual treatment.

The 30-second recovery state, failed-module detection, reload action and disabled-JavaScript explanation remain part of startup. No animation/style selectors or pause controls are shipped.

For visual review, load once with the application module held in browser network controls. Compare both themes, then release the module and verify the slide and keyboard focus handoff. Toggle from sign-in and the library, reload, and confirm the choice persists. Check a 390px viewport and reduced motion. Navigation tests also cover a non-root base, blocked module recovery, theme persistence and reverse drawing keyframes.


## Joined page transitions and header logo

The app header now uses the loader background variable directly. The header logo slot is 56 by 44 CSS pixels. BrandLogo imports the trusted source SVG as raw markup and places it inline, so CSS can set copper strokes to 7.2 SVG units (up from 5.5) and choose the theme color. SVG geometry is preserved. This avoids rendering a small external image whose strokes could not be styled by the parent page.

The reusable controller lives in src/shared/transitions/runtime.js. Vite inlines this single controller into the HTML, so the loader and React route navigation share settings and animation ownership without another startup request. The default left exit and right entrance start on the same document timeline with the same duration and smooth curve. At each animation frame both viewport edges meet.

Profile → Page transitions provides separate exit and entrance styles, separate timing curves, duration and a reset action. Settings are validated, stored for this browser under lumiere:page-transitions, and synchronized across tabs. Different curves or independently selected styles can separate the moving edges. The defaults produce the joined slide. Reduced motion skips the effect.

Navigation makes an inert visual copy of the outgoing DOM while React mounts the destination once. The copy carries no duplicate IDs, no active controls and no password values. Canvas images and nested scroll positions are preserved where possible. PageArrival signals when the route code is committed. Reader and Profile also wait for their initial content/controller state. After two seconds of slow preparation the route's existing loading/recovery screen is revealed. Interaction and focus return after animation cleanup. Interrupted animations have a deadline, rapid navigation replaces old work, and account changes immediately cancel snapshots before publishing the next identity.

Run node tests/browser/page-transitions.mjs after browser setup, or npm run test:browser for all five suites. The focused suite freezes startup and route transitions midway to verify the joined edges, checks settings persistence and the actual animation curve, holds document data until a response is committed, and verifies account-change cancellation, reduced motion and invalid settings recovery. It also verifies the inline header logo and matching background. Set TRANSITION_SCREENSHOTS to a local output directory to capture the two midpoint views.
