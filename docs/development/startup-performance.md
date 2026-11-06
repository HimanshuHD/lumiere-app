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
