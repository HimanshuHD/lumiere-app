import { parsePosition, fraction } from '../../../domain/reading-position.ts';
import type { ReaderPosition } from '../../../domain/reading-position.ts';

import type { ProgressRow, PendingSave, PendingStorage, SaveResult, SaveStatus } from '../../../domain/progress.ts';
interface Entry {
  row?: ProgressRow; pending?: PendingSave; revision: number; status: SaveStatus;
  storageError: boolean; error?: string; timer?: ReturnType<typeof setTimeout>; running?: Promise<void>;
}
export function parsePending(value: unknown): PendingSave | undefined {
  if (!value || typeof value !== 'object') return;
  const p = value as PendingSave;
  const position = parsePosition(p.position);
  if (!position || !Number.isSafeInteger(p.expectedRevision) || p.expectedRevision < 0 ||
    !Number.isInteger(p.chapterIndex) || p.chapterIndex < 0 ||
    typeof p.mutationId !== 'string' || !/^[0-9a-f-]{36}$/i.test(p.mutationId) ||
    !Number.isFinite(p.progress)) return;
  return { ...p, position, progress: fraction(p.progress) };
}

/** One queue per authenticated account; requests for each document run in order. */
export class SaveCoordinator {
  private entries = new Map<string, Entry>();
  private listeners = new Set<() => void>();
  private ready = false;
  private disposed = false;
  private forgotten = new Set<string>();
  private readonly storage: PendingStorage;
  private readonly send: (documentId: string, pending: PendingSave) => Promise<SaveResult>;
  constructor(storage: PendingStorage, send: (documentId: string, pending: PendingSave) => Promise<SaveResult>) {
    this.storage = storage; this.send = send;
  }
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private notify() { this.listeners.forEach(listener => listener()); }
  private entry(id: string): Entry {
    let entry = this.entries.get(id);
    if (!entry) { entry = { revision: 0, status: 'saved', storageError: false }; this.entries.set(id, entry); }
    return entry;
  }
  hydrate(rows: ProgressRow[]) {
    if (this.disposed) return;
    // Never let a repeated/stale fetch overwrite this session's newer state.
    if (this.ready) return;
    rows.forEach(row => { const e = this.entry(row.document_id); e.row = row; e.revision = Number(row.revision || 0); });
    let ids: string[] = [];
    try { ids = this.storage.documentIds(); } catch { /* A new save will expose storage failure. */ }
    for (const id of ids) {
      const e = this.entry(id);
      try { e.pending = parsePending(this.storage.read(id)); } catch { e.storageError = true; }
      if (e.pending && e.pending.mutationId === e.row?.mutation_id) {
        try { this.storage.remove(id, e.pending.mutationId); } catch { /* Replay is idempotent. */ }
        e.pending = undefined;
      }
      if (e.pending) e.status = 'pending';
    }
    this.ready = true; this.notify();
  }
  reconcile(rows: ProgressRow[]) {
    if (!this.ready) { this.hydrate(rows); return; }
    if (this.disposed) return;
    for (const row of rows) {
      if (this.forgotten.has(row.document_id)) continue;
      const e = this.entry(row.document_id);
      if (!e.pending && !e.running && Number(row.revision || 0) >= e.revision) {
        e.row = row; e.revision = Number(row.revision || 0);
      }
    }
    this.notify();
  }
  snapshot(id: string) { return this.entry(id); }
  rows(): ProgressRow[] { return [...this.entries.values()].flatMap(e => e.row ? [e.row] : []); }
  record(id: string, position: ReaderPosition, chapterIndex: number, progress: number) {
    if (!this.ready || this.disposed || this.forgotten.has(id)) return;
    const e = this.entry(id);
    // A conflict requires an explicit retry before choosing this device over remote progress.
    const conflict = e.status === 'conflict';
    e.pending = { position, chapterIndex, progress: fraction(progress), expectedRevision: e.revision, mutationId: crypto.randomUUID() };
    e.error = undefined;
    if (!conflict) e.status = 'pending';
    this.persist(id, e);
    if (e.timer) clearTimeout(e.timer);
    if (!conflict) e.timer = setTimeout(() => { void this.flush(id); }, 750);
    this.notify();
  }
  private persist(id: string, e: Entry) {
    try { if (e.pending) this.storage.write(id, e.pending); e.storageError = false; }
    catch { e.storageError = true; }
  }
  async flush(id: string): Promise<void> {
    const e = this.entry(id);
    if (e.timer) clearTimeout(e.timer);
    e.timer = undefined;
    if (e.running) { await e.running; if (e.pending && e.status === 'pending') return this.flush(id); return; }
    if (!e.pending || !this.ready || e.status === 'conflict') return;
    e.running = this.drain(id, e).finally(() => { e.running = undefined; });
    await e.running;
  }
  private async drain(id: string, e: Entry) {
    while (e.pending && !this.disposed && !this.forgotten.has(id)) {
      const sent = e.pending;
      e.status = 'saving'; this.notify();
      try {
        const result = await this.send(id, sent);
        if (this.disposed || this.forgotten.has(id)) return;
        if (!result.row) throw new Error('The reading position could not be saved.');
        e.row = result.row; e.revision = Number(result.row.revision || 0);
        if (!result.accepted) {
          e.status = 'conflict'; e.error = 'The server has a newer saved position. Retry to use this device’s position.';
          this.notify(); return;
        }
        if (e.pending.mutationId === sent.mutationId) {
          try { this.storage.remove(id, sent.mutationId); } catch { /* Replay will recognize the acknowledged mutation. */ }
          e.pending = undefined; e.storageError = false; e.status = 'saved';
        } else {
          e.pending.expectedRevision = e.revision; this.persist(id, e);
        }
        this.notify();
      } catch (error) {
        e.status = 'error'; e.error = error instanceof Error ? error.message : 'Could not sync reading position.';
        this.notify(); return;
      }
    }
  }
  retry(id: string) {
    const e = this.entry(id);
    if (e.status === 'conflict' && e.pending) {
      e.pending.expectedRevision = e.revision; e.pending.mutationId = crypto.randomUUID(); this.persist(id, e);
    }
    e.status = e.pending ? 'pending' : 'saved'; e.error = undefined;
    this.notify(); return this.flush(id);
  }
  forget(id: string) {
    this.forgotten.add(id);
    const e = this.entries.get(id);
    if (e?.timer) clearTimeout(e.timer);
    if (e?.pending) { try { this.storage.remove(id, e.pending.mutationId); } catch { /* No authenticated write can restore a deleted document. */ } }
    this.entries.delete(id); this.notify();
  }
  dispose() {
    this.disposed = true;
    for (const e of this.entries.values()) if (e.timer) clearTimeout(e.timer);
    this.entries.clear(); this.listeners.clear();
  }
  flushAll() { return Promise.all([...this.entries.keys()].map(id => this.flush(id))); }
  retryFailed() {
    for (const [id, e] of this.entries) if (e.pending && e.status !== 'conflict') void this.flush(id);
  }
}
