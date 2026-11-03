import type { UserDataRepository, CollectionName } from '@/domain/collections';
import type { Document } from '@/domain/documents';
import { QueryCache, errorMessage } from './query-cache.ts';
import { MutationGate } from './mutation-gate.ts';
import type { DocumentSummary, BookmarkSummary } from '@/domain/document-summary';
import { selectLibraryDocuments } from '../../lib/libraryDocuments.ts';

export type ToggleResult = { ok: true; selected: boolean } | { ok: false; message: string };
type Collection = CollectionName;
export class AccountDataStore {
  readonly documents: QueryCache<DocumentSummary[]>;
  readonly catalog: QueryCache<DocumentSummary[]>;
  readonly bookmarks: QueryCache<BookmarkSummary[]>;
  readonly readingList: QueryCache<BookmarkSummary[]>;
  readonly locked: QueryCache<DocumentSummary[]>;
  readonly mutations = new MutationGate();
  private content = new Map<string, QueryCache<Document | null>>();
  private disposed = false;
  readonly userId: string;
  private readonly repository: UserDataRepository;
  private readonly forgetProgress: (id: string) => void;
  constructor(userId: string, repository: UserDataRepository, forgetProgress: (id: string) => void = () => {}) {
    this.userId = userId; this.repository = repository; this.forgetProgress = forgetProgress;
    this.locked = new QueryCache<DocumentSummary[]>([], signal => repository.listLocked(signal));
    const references = (table: Collection) => new QueryCache<BookmarkSummary[]>([], async signal => {
      const [rows, locked] = await Promise.all([repository.listReferences(table, signal), this.locked.load()]);
      return rows.map(reference => ({ ...reference, document: reference.document ?? locked.find(d => d.id === reference.document_id) }));
    });
    this.catalog = new QueryCache<DocumentSummary[]>([], signal => repository.listCatalog(signal));
    this.bookmarks = references('bookmarks'); this.readingList = references('reading_list');
    this.documents = new QueryCache<DocumentSummary[]>([], async signal => {
      const [docs, memberships, locked] = await Promise.all([repository.listDocuments(signal), repository.listMembershipIds(signal), this.locked.load()]);
      return selectLibraryDocuments([...docs, ...locked], new Set(memberships));
    });
  }
  isActive() { return !this.disposed; }
  private assertActive() { if (this.disposed) throw new Error('The account session ended.'); }
  contentQuery(id: string) {
    let query = this.content.get(id);
    if (!query) {
      query = new QueryCache<Document | null>(null, signal => this.repository.getDocument(id, signal));
      this.content.set(id, query);
    }
    return query;
  }
  async toggle(table: Collection, id: string): Promise<ToggleResult> {
    try {
      return await this.mutations.run(`${table}:${id}`, async () => {
        const query = table === 'bookmarks' ? this.bookmarks : this.readingList;
        await query.load(); this.assertActive();
        const existing = query.getSnapshot().data.find(r => r.document_id === id);
        if (existing) {
          const count = await this.repository.deleteReferences(table, id);
          if (!count) throw new Error('The removal was not confirmed. Refresh and retry.');
          this.assertActive(); query.set(query.getSnapshot().data.filter(r => r.document_id !== id));
          return { ok: true as const, selected: false };
        }
        // Metadata is available before committing the reference. No ambiguous post-insert fetch.
        let document = this.documents.getSnapshot().data.find(d => d.id === id);
        if (!document) document = await this.repository.getSummary(id);
        this.assertActive();
        const data = await this.repository.saveReference(table, id);
        this.assertActive(); query.set([{ ...data, document }, ...query.getSnapshot().data.filter(r => r.document_id !== id)]);
        return { ok: true as const, selected: true };
      });
    } catch (error) { return { ok: false, message: errorMessage(error) }; }
  }
  async removeReadingList(id: string) {
    return this.mutations.run(`reading_list:${id}`, async () => {
      await this.readingList.load(); this.assertActive();
      if (!this.readingList.getSnapshot().data.some(r => r.document_id === id)) return;
      await this.repository.deleteReferences('reading_list', id); this.assertActive();
      if (this.readingList.hasData()) this.readingList.set(this.readingList.getSnapshot().data.filter(r => r.document_id !== id));
      else this.readingList.invalidate();
    });
  }
  refresh = async () => {
    this.assertActive(); this.locked.invalidate();
    const results = await Promise.allSettled([this.documents.load(true), this.bookmarks.load(true), this.readingList.load(true)]);
    if (results.some(r => r.status === 'rejected')) throw new Error('Some collections could not refresh. Please retry.');
  };
  membershipChanged(id: string, added: boolean) {
    if (this.disposed) return;
    if (added) { this.documents.invalidate(); void this.documents.load().catch(() => {}); }
    else if (this.documents.hasData()) this.documents.set(this.documents.getSnapshot().data.filter(document => document.id !== id));
    else this.documents.invalidate();
  }
  changedDocument(id: string, deleted = false) {
    if (this.disposed) return;
    this.content.get(id)?.dispose(); this.content.delete(id);
    if (deleted) {
      if (this.documents.hasData()) this.documents.set(this.documents.getSnapshot().data.filter(d => d.id !== id));
      else this.documents.invalidate();
      if (this.bookmarks.hasData()) this.bookmarks.set(this.bookmarks.getSnapshot().data.filter(r => r.document_id !== id));
      else this.bookmarks.invalidate();
      if (this.readingList.hasData()) this.readingList.set(this.readingList.getSnapshot().data.filter(r => r.document_id !== id));
      else this.readingList.invalidate();
      if (this.catalog.hasData()) this.catalog.set(this.catalog.getSnapshot().data.filter(d => d.id !== id));
      else this.catalog.invalidate();
      this.forgetProgress(id);
    } else {
      this.catalog.invalidate(); this.locked.invalidate(); this.documents.invalidate(); this.bookmarks.invalidate(); this.readingList.invalidate();
    }
  }
  dispose() {
    this.disposed = true; this.catalog.dispose(); this.documents.dispose(); this.bookmarks.dispose(); this.readingList.dispose(); this.locked.dispose();
    this.content.forEach(query => query.dispose()); this.content.clear(); this.mutations.dispose();
  }
}
