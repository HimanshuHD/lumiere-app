import { supabase } from '@/lib/supabase';
import type { Document } from '@/lib/supabase';
import { QueryCache, errorMessage } from './query-cache';
import { MutationGate } from './mutation-gate';
import { DOCUMENT_SUMMARY_FIELDS } from './document-summary';
import type { DocumentSummary, BookmarkSummary } from './document-summary';
import { selectLibraryDocuments } from '@/lib/libraryDocuments';
import { getProgressStore, discardProgressStore } from '@/features/reader/progress/progress-store';

export type ToggleResult = { ok: true; selected: boolean } | { ok: false; message: string };
type Collection = 'bookmarks' | 'reading_list';
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
  constructor(userId: string) {
    this.userId = userId;
    this.locked = new QueryCache<DocumentSummary[]>([], async signal => {
      const { data, error } = await supabase.rpc('get_locked_document_summaries').abortSignal(signal);
      if (error) throw error;
      return (data ?? []) as DocumentSummary[];
    });
    const references = (table: Collection) => new QueryCache<BookmarkSummary[]>([], async signal => {
      const [response, locked] = await Promise.all([
        supabase.from(table).select(`id,user_id,document_id,created_at,document:documents(${DOCUMENT_SUMMARY_FIELDS})`)
          .eq('user_id', userId).order('created_at', { ascending: false }).abortSignal(signal),
        this.locked.load(),
      ]);
      if (response.error) throw response.error;
      return (response.data as unknown as BookmarkSummary[]).map(reference => ({ ...reference,
        document: reference.document ?? locked.find(d => d.id === reference.document_id) }));
    });
    this.catalog = new QueryCache<DocumentSummary[]>([], async signal => {
      const { data, error } = await supabase.from('documents').select(DOCUMENT_SUMMARY_FIELDS)
        .eq('origin', 'catalog_import').order('title', { ascending: true }).limit(1000).abortSignal(signal);
      if (error) throw error;
      return (data ?? []) as unknown as DocumentSummary[];
    });
    this.bookmarks = references('bookmarks'); this.readingList = references('reading_list');
    this.documents = new QueryCache<DocumentSummary[]>([], async signal => {
      const [docs, memberships, locked] = await Promise.all([
        supabase.from('documents').select(DOCUMENT_SUMMARY_FIELDS).order('created_at', { ascending: true }).abortSignal(signal),
        supabase.from('document_library_memberships').select('document_id').eq('user_id', userId).abortSignal(signal),
        this.locked.load(),
      ]);
      if (docs.error) throw docs.error;
      if (memberships.error) throw memberships.error;
      return selectLibraryDocuments([...(docs.data as unknown as DocumentSummary[]), ...locked], new Set((memberships.data ?? []).map(m => m.document_id)));
    });
  }
  isActive() { return !this.disposed; }
  private assertActive() { if (this.disposed) throw new Error('The account session ended.'); }
  contentQuery(id: string) {
    let query = this.content.get(id);
    if (!query) {
      query = new QueryCache<Document | null>(null, async signal => {
        const { data, error } = await supabase.from('documents').select('*').eq('id', id).abortSignal(signal).single();
        if (error) throw error;
        if (!data || !Array.isArray(data.chapters)) throw new Error('The document content is unavailable.');
        return data as Document;
      });
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
          const { data, error } = await supabase.from(table).delete().eq('user_id', this.userId).eq('document_id', id).select('id');
          if (error) throw error;
          if (!data?.length) throw new Error('The removal was not confirmed. Refresh and retry.');
          this.assertActive(); query.set(query.getSnapshot().data.filter(r => r.document_id !== id));
          return { ok: true as const, selected: false };
        }
        // Metadata is available before committing the reference. No ambiguous post-insert fetch.
        let document = this.documents.getSnapshot().data.find(d => d.id === id);
        if (!document) {
          const { data, error } = await supabase.from('documents').select(DOCUMENT_SUMMARY_FIELDS).eq('id', id).single();
          if (error) throw error; document = data as unknown as DocumentSummary;
        }
        this.assertActive();
        const { data, error } = await supabase.from(table).upsert({ user_id: this.userId, document_id: id }, { onConflict: 'user_id,document_id' })
          .select('id,user_id,document_id,created_at').single();
        if (error) throw error; if (!data) throw new Error('The save was not confirmed.');
        this.assertActive(); query.set([{ ...data, document }, ...query.getSnapshot().data.filter(r => r.document_id !== id)]);
        return { ok: true as const, selected: true };
      });
    } catch (error) { return { ok: false, message: errorMessage(error) }; }
  }
  async removeReadingList(id: string) {
    return this.mutations.run(`reading_list:${id}`, async () => {
      await this.readingList.load(); this.assertActive();
      if (!this.readingList.getSnapshot().data.some(r => r.document_id === id)) return;
      const { error } = await supabase.from('reading_list').delete().eq('user_id', this.userId).eq('document_id', id);
      if (error) throw error; this.assertActive();
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
      getProgressStore(this.userId).coordinator.forget(id);
    } else {
      this.catalog.invalidate(); this.locked.invalidate(); this.documents.invalidate(); this.bookmarks.invalidate(); this.readingList.invalidate();
    }
  }
  dispose() {
    this.disposed = true; this.catalog.dispose(); this.documents.dispose(); this.bookmarks.dispose(); this.readingList.dispose(); this.locked.dispose();
    this.content.forEach(query => query.dispose()); this.content.clear(); this.mutations.dispose();
  }
}
const stores = new Map<string, AccountDataStore>();
export function getAccountStore(userId: string) {
  let store = stores.get(userId); if (!store) { store = new AccountDataStore(userId); stores.set(userId, store); } return store;
}
export function cachedAccountStore(userId: string) { return stores.get(userId); }
export function activeAccountStore() { return activeUser ? stores.get(activeUser) : undefined; }
let activeUser: string | undefined;
supabase.auth.onAuthStateChange((_event, session) => {
  const next = session?.user.id;
  if (activeUser && activeUser !== next) {
    stores.get(activeUser)?.dispose(); stores.delete(activeUser); discardProgressStore(activeUser);
  }
  activeUser = next;
});
