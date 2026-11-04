interface TurnstileWidgetOptions {
  sitekey: string;
  action: 'opds_browse';
  callback: (token: string) => void;
  'error-callback': () => void;
  'expired-callback': () => void;
}

interface TurnstileApi {
  render: (container: HTMLElement, options: TurnstileWidgetOptions) => string;
  remove: (widgetId: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let turnstileScriptPromise: Promise<void> | null = null;

function loadTurnstileApi(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (turnstileScriptPromise) return turnstileScriptPromise;

  const scriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.defer = true;
    script.onload = () => window.turnstile
      ? resolve()
      : reject(new Error('The security check could not be loaded.'));
    script.onerror = () => reject(new Error('The security check could not be loaded.'));
    document.head.append(script);
  }).catch((error: unknown) => {
    turnstileScriptPromise = null;
    throw error;
  });
  turnstileScriptPromise = scriptPromise;
  return scriptPromise;
}

export async function requestTurnstileToken(container: HTMLElement, siteKey: string, signal?: AbortSignal): Promise<string> {
  if (!siteKey) {
    throw new Error('Public feed browsing is not configured. Sign in or contact the site administrator.');
  }
  signal?.throwIfAborted();
  await loadTurnstileApi();
  signal?.throwIfAborted();
  const turnstile = window.turnstile;
  if (!turnstile) throw new Error('The security check could not be loaded.');

  container.replaceChildren();
  let widgetId: string | null = null;
  let timeoutId: ReturnType<typeof setTimeout>;
  let abort: (() => void) | undefined;
  try {
    return await new Promise<string>((resolve, reject) => {
      abort = () => reject(new DOMException('The security check was cancelled.', 'AbortError'));
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) { abort(); return; }
      const finish = (callback: (value: string) => void, value: string) => {
        clearTimeout(timeoutId);
        callback(value);
      };
      timeoutId = setTimeout(
        () => finish(reject, 'The security check expired. Please try again.'),
        120_000,
      );
      widgetId = turnstile.render(container, {
        sitekey: siteKey,
        action: 'opds_browse',
        callback: (token) => finish(resolve, token),
        'error-callback': () => finish(reject, 'The security check failed. Please try again.'),
        'expired-callback': () => finish(reject, 'The security check expired. Please try again.'),
      });
    });
  } finally {
    if (abort) signal?.removeEventListener('abort', abort);
    clearTimeout(timeoutId!);
    if (widgetId) turnstile.remove(widgetId);
    container.replaceChildren();
  }
}
