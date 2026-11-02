export interface QuerySnapshot<T> {
  data: T; status: 'idle' | 'loading' | 'success' | 'error'; error: string | null;
}
export function errorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') return error.message;
  return 'The request failed. Please retry.';
}
/** Immutable snapshots are safe for useSyncExternalStore. One request owns each generation. */
export class QueryCache<T> {
  private value: QuerySnapshot<T>;
  private listeners = new Set<() => void>();
  private generation = 0;
  private controller?: AbortController;
  private request?: Promise<T>;
  private disposed = false;
  private loaded = false;
  private readonly initial: T;
  private readonly fetcher: (signal: AbortSignal) => Promise<T>;
  constructor(initial: T, fetcher: (signal: AbortSignal) => Promise<T>) {
    this.initial = initial;
    this.value = { data: initial, status: 'idle', error: null }; this.fetcher = fetcher;
  }
  hasData() { return this.loaded; }
  getSnapshot = () => this.value;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(value: QuerySnapshot<T>) { this.value = value; this.listeners.forEach(listener => listener()); }
  load = (force = false): Promise<T> => {
    if (this.disposed) return Promise.reject(new Error('The account session ended.'));
    if (!force && this.request) return this.request;
    if (!force && this.value.status === 'success') return Promise.resolve(this.value.data);
    this.controller?.abort(); const controller = new AbortController(); this.controller = controller;
    const generation = ++this.generation;
    this.publish({ ...this.value, status: 'loading', error: null });
    const request = Promise.resolve().then(() => this.fetcher(controller.signal)).then(data => {
      if (this.disposed || generation !== this.generation) throw new Error('The request was superseded.');
      this.loaded = true;
      this.publish({ data, status: 'success', error: null }); return data;
    }, error => {
      if (!this.disposed && generation === this.generation) this.publish({ ...this.value, status: 'error', error: errorMessage(error) });
      throw error;
    }).finally(() => { if (generation === this.generation) this.request = undefined; });
    this.request = request; return request;
  };
  set(data: T) {
    if (this.disposed) return;
    this.controller?.abort(); this.generation++; this.request = undefined;
    this.loaded = true;
    this.publish({ data, status: 'success', error: null });
  }
  invalidate() {
    if (this.disposed) return;
    this.controller?.abort(); this.generation++; this.request = undefined;
    this.publish({ ...this.value, status: 'idle', error: null });
  }
  dispose() { this.disposed = true; this.loaded = false; this.generation++; this.controller?.abort(); this.publish({data:this.initial,status:'idle',error:null}); this.listeners.clear(); }
}
