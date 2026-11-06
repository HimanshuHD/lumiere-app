import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
let number = 0;

// These suites use synthetic accounts and mocked transport. Never enable tracing on real accounts.
export async function launchBrowser(options) {
  const browser = await chromium.launch(options);
  const createContext = browser.newContext.bind(browser);
  browser.newContext = async options => {
    const context = await createContext(options);
    const directory = resolve(process.env.BROWSER_ARTIFACTS || 'test-results/browser', `context-${++number}`);
    await mkdir(directory, { recursive: true });
    const events = [];
    const record = event => { if (events.length < 200) events.push(event); };
    await context.tracing.start({ screenshots: true, snapshots: true, sources: false });
    context.on('page', page => {
      page.on('pageerror', error => record({ type: 'pageerror', message: error.message }));
      page.on('console', message => { if (message.type() === 'error') record({ type: 'console', message: message.text() }); });
      page.on('requestfailed', request => record({ type: 'requestfailed', path: new URL(request.url()).pathname, error: request.failure()?.errorText }));
      page.on('response', response => { if (response.status() >= 400) record({ type: 'http', path: new URL(response.url()).pathname, status: response.status() }); });
    });
    const close = context.close.bind(context);
    let captured = false;
    context.close = async (...args) => {
      if (!captured) {
        captured = true;
        try {
          let pageNumber = 0;
          for (const page of context.pages()) if (!page.isClosed()) await page.screenshot({ path: resolve(directory, `page-${++pageNumber}.png`), timeout: 5000 }).catch(() => {});
          await context.tracing.stop({ path: resolve(directory, 'trace.zip') });
          await writeFile(resolve(directory, 'events.json'), JSON.stringify(events, null, 2));
        } catch (error) { console.error('Could not capture browser diagnostics:', error.message); }
      }
      return close(...args);
    };
    return context;
  };
  const closeBrowser = browser.close.bind(browser);
  browser.close = async (...args) => {
    for (const context of browser.contexts()) await context.close();
    return closeBrowser(...args);
  };
  return browser;
}
