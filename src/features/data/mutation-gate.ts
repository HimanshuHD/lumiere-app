/** A per-account, per-item gate shared by every mounted control. */
export class MutationGate {
  private requests = new Map<string, Promise<unknown>>();
  private snapshot: ReadonlySet<string> = new Set();
  private listeners = new Set<() => void>();
  private disposed = false;
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private notify() { this.snapshot = new Set(this.requests.keys()); this.listeners.forEach(listener => listener()); }
  run<T>(key: string, action: () => Promise<T>): Promise<T> {
    if (this.disposed) return Promise.reject(new Error('The account session ended.'));
    const existing = this.requests.get(key); if (existing) return existing as Promise<T>;
    const request = Promise.resolve().then(action).finally(() => { this.requests.delete(key); if (!this.disposed) this.notify(); });
    this.requests.set(key, request); this.notify(); return request;
  }
  dispose() { this.disposed = true; this.requests.clear(); this.notify(); this.listeners.clear(); }
}
