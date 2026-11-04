import { ServiceError, toServiceError } from '../../domain/errors.ts';
import type { SignedDocumentUrl } from '../../domain/integrations.ts';

export interface SignedUrlState { url: string | null; error: string | null }
type Timer = ReturnType<typeof setTimeout>;
export interface SignedUrlClock {
  now(): number;
  setTimeout(callback: () => void, delay: number): Timer;
  clearTimeout(timer: Timer): void;
}
const browserClock: SignedUrlClock = {
  now: () => Date.now(),
  setTimeout: (callback, delay) => setTimeout(callback, delay),
  clearTimeout: timer => clearTimeout(timer),
};
const retryDelays = [1_000, 3_000, 10_000];

/** Owns one path's refresh/retry/expiry lifecycle; transport is injected. */
export class SignedUrlSession {
  private readonly load: () => Promise<SignedDocumentUrl>;
  private readonly publish: (state: SignedUrlState) => void;
  private readonly clock: SignedUrlClock;
  private link: SignedDocumentUrl | null = null;
  private refreshTimer?: Timer;
  private expiryTimer?: Timer;
  private running = false;
  private disposed = false;
  private started = false;
  private retryable = false;
  private failures = 0;

  constructor(load: () => Promise<SignedDocumentUrl>, publish: (state: SignedUrlState) => void,
    clock: SignedUrlClock = browserClock) {
    this.load = load; this.publish = publish; this.clock = clock;
  }
  start() {
    if (this.started || this.disposed) return;
    this.started = true;
    void this.request();
  }
  reconnect() {
    if (this.disposed || !this.retryable || this.running) return;
    this.failures = 0;
    void this.request();
  }
  private clearRefresh() {
    if (this.refreshTimer !== undefined) this.clock.clearTimeout(this.refreshTimer);
    this.refreshTimer = undefined;
  }
  private clearLink() {
    this.link = null;
    if (this.expiryTimer !== undefined) this.clock.clearTimeout(this.expiryTimer);
    this.expiryTimer = undefined;
  }
  private currentUrl() {
    return this.link && this.clock.now() < this.link.expiresAt ? this.link.url : null;
  }
  private async request() {
    if (this.disposed || this.running) return;
    this.clearRefresh();
    this.running = true;
    try {
      const link = await this.load();
      if (this.disposed) return;
      if (!link.url || !Number.isFinite(link.refreshAt) || !Number.isFinite(link.expiresAt)) {
        throw new ServiceError('validation', 'The document access link is invalid. Reopen the document to retry.');
      }
      if (link.expiresAt <= this.clock.now()) {
        throw new ServiceError('network', 'The access link expired before it could be used.');
      }
      this.clearLink(); this.link = link;
      this.failures = 0; this.retryable = false;
      this.expiryTimer = this.clock.setTimeout(() => {
        if (this.disposed || this.link !== link) return;
        this.link = null; this.expiryTimer = undefined;
        this.publish({ url: null, error: 'Document access expired. Reconnect or reopen the document to retry.' });
      }, link.expiresAt - this.clock.now());
      this.refreshTimer = this.clock.setTimeout(() => {
        this.refreshTimer = undefined; void this.request();
      }, Math.max(0, Math.min(link.refreshAt, link.expiresAt - 1) - this.clock.now()));
      this.publish({ url: link.url, error: null });
    } catch (cause) {
      if (this.disposed) return;
      const error = toServiceError(cause);
      this.retryable = error.category === 'network';
      if (!this.retryable) {
        this.clearLink();
        this.publish({ url: null, error: error.category === 'permission'
          ? 'You do not have permission to access this document file.' : error.message });
        return;
      }
      const delay = retryDelays[this.failures++];
      const retryMessage = delay === undefined
        ? 'Reconnect or reopen the document to retry.' : 'Retrying document access…';
      this.publish({ url: this.currentUrl(), error: `Could not refresh document access. ${retryMessage}` });
      if (delay !== undefined) this.refreshTimer = this.clock.setTimeout(() => {
        this.refreshTimer = undefined; void this.request();
      }, delay);
    } finally { this.running = false; }
  }
  dispose() {
    this.disposed = true; this.retryable = false;
    this.clearRefresh(); this.clearLink();
  }
}
