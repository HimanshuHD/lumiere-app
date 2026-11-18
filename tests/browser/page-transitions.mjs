import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { createServer } from 'vite';
import { launchBrowser } from './diagnostics.mjs';

const api = 'http://127.0.0.1:54321';
process.env.VITE_SUPABASE_URL = api;
process.env.VITE_SUPABASE_ANON_KEY = 'transition-fixture';
const server = await createServer({ server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
const browser = await launchBrowser({
  ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}),
  args: ['--no-sandbox', '--disable-dev-shm-usage', ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? ['--single-process', '--no-zygote'] : [])],
});
const errors = [];
const uid = '81000000-0000-4000-8000-000000000001';
const docId = '82000000-0000-4000-8000-000000000001';
const session = { access_token: 'fixture-token', refresh_token: 'fixture-refresh', expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: { id: uid, email: 'qa@example.test', user_metadata: {}, app_metadata: {} } };

try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addInitScript(session => {
    if (!sessionStorage.getItem('transition-initialized')) {
      localStorage.setItem('sb-127-auth-token', JSON.stringify(session));
      sessionStorage.setItem('transition-initialized', 'yes');
    }
  }, session);
  let heldDocument;
  await context.route(`${api}/**`, async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/logout')) return route.fulfill({ status: 204 });
    if (url.pathname.endsWith('/profiles')) return route.fulfill({ json: { full_name: 'Transition QA', avatar_url: null } });
    if (url.pathname.endsWith('/documents') && url.searchParams.get('select') === '*') { heldDocument = route; return; }
    return route.fulfill({ json: [] });
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => errors.push(error.message));
  const idle = () => page.waitForFunction(() => !document.querySelector('#startup-screen, [data-page-outgoing], #root[inert]') && !document.documentElement.dataset.pageMotion);
  async function freezePair(outSelector) {
    await page.waitForFunction(() => document.documentElement.dataset.pageMotion === 'running');
    const geometry = await page.evaluate(async outSelector => {
      const outgoing = document.querySelector(outSelector);
      const incoming = document.getElementById('root');
      const animations = [outgoing, incoming].flatMap(element => element.getAnimations());
      for (const animation of animations) { animation.pause(); animation.currentTime = 220; }
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const a = outgoing.getBoundingClientRect(), b = incoming.getBoundingClientRect();
      return { right: a.right, left: b.left, width: innerWidth, outgoing: a.left < 0 && a.right > 0, incoming: b.left > 0 && b.left < innerWidth, inert: incoming.inert };
    }, outSelector);
    assert(Math.abs(geometry.right - geometry.left) < 1, JSON.stringify(geometry));
    assert(geometry.outgoing && geometry.incoming && geometry.inert);
    return geometry;
  }
  const resume = () => page.evaluate(() => document.getAnimations().filter(animation => animation.playState === 'paused').forEach(animation => animation.play()));

  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  await freezePair('#startup-screen');
  const loaderBackground = await page.locator('#startup-screen').evaluate(element => getComputedStyle(element).backgroundColor);
  if (process.env.TRANSITION_SCREENSHOTS) {
    mkdirSync(process.env.TRANSITION_SCREENSHOTS, { recursive: true });
    await page.screenshot({ path: `${process.env.TRANSITION_SCREENSHOTS}/startup-joined.png` });
  }
  await resume();
  await idle();
  assert.equal(await page.locator('.app-header').evaluate(element => getComputedStyle(element).backgroundColor), loaderBackground);
  assert.equal(await page.locator('.header-brand-logo svg').count(), 1);
  assert.equal(await page.locator('.header-brand-logo img').count(), 0);
  assert(Number(await page.locator('.header-brand-logo g').first().evaluate(element => getComputedStyle(element).strokeWidth.replace('px', ''))) > 5.5);
  console.log('PASS: both startup screens stay attached mid-slide; header logo uses inline SVG and loader background.');

  await page.getByRole('button', { name: 'Transition QA', exact: true }).click();
  await page.getByRole('button', { name: 'Profile', exact: true }).click();
  await freezePair('[data-page-outgoing]');
  assert.equal(await page.locator('#root #page-transition-heading').count(), 1);
  if (process.env.TRANSITION_SCREENSHOTS) await page.screenshot({ path: `${process.env.TRANSITION_SCREENSHOTS}/navigation-joined.png` });
  await resume();
  await idle();
  await page.getByLabel('Page exits', { exact: true }).selectOption('fade');
  await page.getByLabel('Page enters', { exact: true }).selectOption('fade');
  await page.getByLabel('Exit timing curve').selectOption('linear');
  await page.getByLabel('Entrance timing curve').selectOption('ease-in');
  await page.getByLabel('Transition duration').selectOption('700');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await idle();
  assert.equal(await page.getByLabel('Page exits', { exact: true }).inputValue(), 'fade');
  assert.equal(await page.getByLabel('Transition duration').inputValue(), '700');
  await page.getByLabel('Choose avatar image', { exact: true }).setInputFiles({
    name: 'avatar.png', mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=', 'base64'),
  });
  await page.getByRole('button', { name: 'Library', exact: true }).first().click();
  await page.waitForFunction(() => document.documentElement.dataset.pageMotion === 'running');
  const effects = await page.locator('#root').evaluate(element => element.getAnimations().map(animation => ({ duration: animation.effect.getTiming().duration, easing: animation.effect.getTiming().easing, frames: animation.effect.getKeyframes() })));
  assert(effects.some(effect => effect.duration === 700 && effect.easing === 'ease-in' && effect.frames[0].opacity === '0'));
  await idle();
  console.log('PASS: settings persist and control actual incoming effect, timing curve and duration.');

  // The old page stays in place until a real document result is committed.
  await page.evaluate(async id => (await import('/src/app/navigation.ts')).navigate({ kind: 'reader', documentId: id }), docId);
  await page.waitForFunction(() => !!document.querySelector('[data-page-outgoing]'));
  assert.equal(await page.evaluate(() => document.documentElement.dataset.pageMotion), undefined);
  await page.waitForFunction(() => document.querySelector('#root main h1')?.textContent === 'Opening document…');
  assert(heldDocument);
  await heldDocument.fulfill({ status: 403, json: { code: '42501', message: 'Fixture denial' } });
  await idle();
  await page.getByRole('heading', { name: 'Document access denied' }).waitFor();

  // Account changes must clear the outgoing snapshot before publishing a new identity.
  await page.evaluate(async () => {
    const navigation = await import('/src/app/navigation.ts');
    navigation.navigate({ kind: 'view', view: 'profile' });
    (await import('/src/app/session-navigation.ts')).applySessionAccount(undefined);
  });
  await page.waitForFunction(() => !document.querySelector('[data-page-outgoing]'));
  assert.equal(await page.locator('#root[inert]').count(), 0);
  console.log('PASS: document preparation, failure reveal and account-change cancellation release snapshots and interaction.');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(() => {
    window.lumiereTransitions.update({ out: 'untrusted', in: 'fade', duration: -1, outEasing: 'invalid' });
    window.lumiereTransitions.begin();
  });
  assert.equal(await page.locator('[data-page-outgoing]').count(), 0);
  const validated = await page.evaluate(() => window.lumiereTransitions.getSettings());
  assert.equal(validated.out, 'slide-left');
  assert.equal(validated.duration, 440);
  assert.equal(validated.outEasing, 'smooth');
  assert.deepEqual(errors, []);
  console.log('PASS: reduced motion and invalid stored settings recover safely; no browser exceptions.');
} finally {
  await browser.close();
  await server.close();
}
