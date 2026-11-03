import { DOCUMENT_CATEGORIES } from '@/domain/documents';
import { useState } from 'react';
import { AlertTriangle, FileEdit, Trash2, X, Loader2, BookOpen, Download, Pencil, Save } from 'lucide-react';
import type {  DocumentSummary as Document  } from '@/domain/document-summary';
import { useDocuments } from '@/hooks/useData';
import { cachedAccountStore } from '@/app/account-runtime';
import { QueryNotice } from '@/shared/ui';
import { useAuth } from '@/features/auth';
import { useToast } from '@/shared/ui';
import { DocumentCover } from '@/components/DocumentCover';
import { DocumentFileLink } from '@/components/DocumentFileLink';
import { supabaseDocumentLifecycleDependencies } from '@/app/document-operations';
import { getUserDocumentDeletionImpact, deleteOwnedUserDocument, type UserDocumentDeletionImpact } from '@/services/userDocumentDeletion';
import { supabaseUserDocumentDeletionStore } from '@/app/document-operations';
import { updateUserDocument } from '@/services/userDocumentVisibility';
import { supabaseUserDocumentVisibilityStore } from '@/app/document-operations';

const CATEGORIES = DOCUMENT_CATEGORIES;

export function MyUploads() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const { documents, loading, error, refetch } = useDocuments();
  const docs = documents.filter(document => document.origin === 'user_upload' && document.uploaded_by === user?.id)
    .sort((a,b) => b.created_at.localeCompare(a.created_at));
  const [editDoc, setEditDoc] = useState<Document | null>(null);
  const [deleteDoc, setDeleteDoc] = useState<Document | null>(null);
  const [deletionImpact, setDeletionImpact] = useState<UserDocumentDeletionImpact | null>(null);
  const [deletionImpactError, setDeletionImpactError] = useState<string | null>(null);
  const [loadingDeletionImpact, setLoadingDeletionImpact] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const prepareDelete = async (document: Document) => {
    setDeleteDoc(document);
    setDeletionImpact(null);
    setDeletionImpactError(null);
    setLoadingDeletionImpact(true);
    try {
      const impact = await getUserDocumentDeletionImpact(supabaseUserDocumentDeletionStore, document.id);
      setDeletionImpact(impact);
    } catch (error) {
      setDeletionImpactError(error instanceof Error ? error.message : 'Could not load deletion details.');
    } finally {
      setLoadingDeletionImpact(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteDoc || !user) return;
    setDeleting(true);
    try {
      const result = await deleteOwnedUserDocument(
        supabaseUserDocumentDeletionStore,
        supabaseDocumentLifecycleDependencies,
        user.id,
        deleteDoc.id,
      );
      cachedAccountStore(user.id)?.changedDocument(deleteDoc.id, true);
      setDeleteDoc(null);
      if (result.cleanup.status === 'pending') {
        const detail = result.cleanup.error
          ?? `${result.cleanup.recovery?.pending ?? 0} storage file(s) remain queued for cleanup.`;
        showToast(`Document and its references were deleted, but storage cleanup is pending. ${detail}`, 'error');
      } else {
        showToast('Document and its references were deleted permanently.');
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to delete document.', 'error');
    } finally {
      setDeleting(false);
    }
  };

  if (error && docs.length === 0) return <QueryNotice error={error} retry={refetch} label="uploads" />;

  if (loading && docs.length === 0) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-amber-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <QueryNotice error={error} retry={refetch} label="uploads" />
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
          <FileEdit className="w-5 h-5 text-amber-700" />
        </div>
        <div>
          <h1 className="text-2xl font-serif font-bold text-stone-800">My Uploads</h1>
          <p className="text-sm text-stone-500">{docs.length} {docs.length === 1 ? 'document' : 'documents'} uploaded by you</p>
        </div>
      </div>

      {docs.length === 0 ? (
        <div className="text-center py-24">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-stone-100 mb-4">
            <BookOpen className="w-8 h-8 text-stone-400" />
          </div>
          <p className="text-stone-500 text-sm mb-1">No uploads yet</p>
          <p className="text-stone-400 text-xs">Documents you upload will appear here.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
          <table className="w-full min-w-[600px]">
            <thead>
              <tr className="border-b border-stone-200 bg-stone-50">
                <th className="text-left px-4 py-3 text-xs font-medium text-stone-500 uppercase tracking-wider w-[40%]">Document</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-stone-500 uppercase tracking-wider hidden sm:table-cell">Category</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-stone-500 uppercase tracking-wider hidden md:table-cell">Format</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-stone-500 uppercase tracking-wider hidden md:table-cell">Visibility</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-stone-500 uppercase tracking-wider hidden lg:table-cell">Uploaded</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-stone-500 uppercase tracking-wider w-24">Actions</th>
              </tr>
            </thead>
            <tbody>
              {docs.map((doc) => (
                <tr key={doc.id} className="border-b border-stone-100 last:border-0 hover:bg-stone-50/50 transition-colors">
                  <td className="px-4 py-3 max-w-xs">
                    <div className="flex items-center gap-3">
                      <DocumentCover document={doc} className="w-8 h-11 object-cover rounded flex-shrink-0" />
                      <div className="min-w-0 overflow-hidden">
                        <p className="text-sm font-medium text-stone-800 truncate max-w-[180px]">{doc.title}</p>
                        <p className="text-xs text-stone-400 truncate max-w-[180px]">{doc.author}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    <span className="text-xs px-2 py-0.5 bg-stone-100 text-stone-500 rounded font-medium">{doc.category}</span>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <span className="text-xs text-stone-500 uppercase">{doc.file_format || 'txt'}</span>
                    {doc.file_format && doc.file_format !== 'txt' && !doc.file_storage_path && !doc.file_url && (
                      <span className="block text-[10px] text-amber-700 normal-case">Original file unavailable</span>
                    )}
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <span className="text-xs text-stone-500 capitalize">{doc.visibility}</span>
                  </td>
                  <td className="px-4 py-3 text-sm text-stone-500 hidden lg:table-cell">
                    {new Date(doc.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                  </td>
                  <td className="px-4 py-3 w-24">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => setEditDoc(doc)}
                        className="p-2 rounded-lg text-stone-500 hover:text-amber-600 hover:bg-amber-50 transition-colors"
                        title="Edit"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => void prepareDelete(doc)}
                        className="p-2 rounded-lg text-stone-500 hover:text-red-600 hover:bg-red-50 transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit Modal */}
      {editDoc && (
        <EditDocumentModal
          doc={editDoc}
          onClose={() => setEditDoc(null)}
          onSaved={(updated) => {
            if (user) cachedAccountStore(user.id)?.changedDocument(updated.id);
            void refetch();
            setEditDoc(null);
          }}
        />
      )}

      {/* Delete confirmation */}
      {deleteDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => !deleting && setDeleteDoc(null)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div className="relative bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => !deleting && setDeleteDoc(null)} className="absolute top-4 right-4 w-8 h-8 rounded-full bg-stone-100 hover:bg-stone-200 flex items-center justify-center transition-colors">
              <X className="w-4 h-4 text-stone-500" />
            </button>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center">
                <Trash2 className="w-5 h-5 text-red-600" />
              </div>
              <h3 className="text-lg font-serif font-bold text-stone-800">Delete Document?</h3>
            </div>
            <p className="text-sm text-stone-500 mb-6">
              Deleting <span className="font-medium text-stone-700">"{deleteDoc.title}"</span> permanently removes the document and all user bookmarks, reading progress, and Read Later references. This action is irreversible.
            </p>
            {loadingDeletionImpact ? (
              <div className="flex items-center gap-2 text-sm text-stone-500 mb-6">
                <Loader2 className="h-4 w-4 animate-spin" /> Checking who will be affected...
              </div>
            ) : deletionImpactError ? (
              <div className="mb-6 space-y-3">
                <p className="text-sm text-red-700">{deletionImpactError}</p>
                <button
                  onClick={() => void prepareDelete(deleteDoc)}
                  className="text-sm font-medium text-amber-700 hover:text-amber-800"
                >
                  Retry impact check
                </button>
              </div>
            ) : deletionImpact && (
              <div className="mb-6 rounded-lg border border-red-100 bg-red-50 p-3">
                <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-red-800">
                  <AlertTriangle className="h-4 w-4" /> Distinct affected users by reference type
                </p>
                <ul className="space-y-1 text-sm text-red-800">
                  <li>{deletionImpact.bookmarkUsers} bookmarked</li>
                  <li>{deletionImpact.readingUsers} have reading progress</li>
                  <li>{deletionImpact.readingListUsers} saved it to Read Later</li>
                </ul>
                <p className="mt-2 text-xs text-red-700">A user may appear in more than one count.</p>
              </div>
            )}
            <div className="flex items-center gap-3 justify-end">
              <button
                onClick={() => !deleting && setDeleteDoc(null)}
                disabled={deleting}
                className="px-4 py-2 text-sm font-medium text-stone-600 bg-white border border-stone-200 rounded-lg hover:bg-stone-50 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting || loadingDeletionImpact || !deletionImpact}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-500 rounded-lg transition-all disabled:opacity-50"
              >
                {deleting ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Deleting...</>
                ) : (
                  <><Trash2 className="w-4 h-4" /> Delete</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function EditDocumentModal({ doc, onClose, onSaved }: { doc: Document; onClose: () => void; onSaved: (doc: Document) => void }) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [title, setTitle] = useState(doc.title);
  const [author, setAuthor] = useState(doc.author);
  const [category, setCategory] = useState(doc.category);
  const [summary, setSummary] = useState(doc.summary);
  const [visibility, setVisibility] = useState(doc.visibility);
  const [saving, setSaving] = useState(false);
  const [confirmPrivate, setConfirmPrivate] = useState(false);

  const handleSave = async (visibilityConfirmed = false) => {
    if (!user) {
      showToast('Sign in to update this document.', 'error');
      return;
    }
    if (doc.visibility === 'shared' && visibility === 'private' && !visibilityConfirmed) {
      setConfirmPrivate(true);
      return;
    }
    setSaving(true);
    try {
      const data = await updateUserDocument(
        supabaseUserDocumentVisibilityStore,
        user.id,
        doc,
        {
          title: title.trim(),
          author: author.trim(),
          category,
          summary: summary.trim(),
          visibility,
        },
      );
      showToast(visibility === doc.visibility
        ? 'Document updated successfully.'
        : visibility === 'private'
          ? 'Document is private now. Other users can still see their saved reference, but cannot open the document.'
          : 'Document is shared with signed-in Lumiere users.');
      onSaved(data);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to update document.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-stone-200">
          <h3 className="text-lg font-serif font-bold text-stone-800 flex items-center gap-2">
            <Pencil className="w-4 h-4 text-amber-600" />
            Edit Document
          </h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-stone-100 hover:bg-stone-200 flex items-center justify-center transition-colors">
            <X className="w-4 h-4 text-stone-500" />
          </button>
        </div>
        <div className="p-6 space-y-5">
          <div className="flex items-center gap-4 pb-4 border-b border-stone-100">
            <DocumentCover document={doc} className="w-14 h-20 object-cover rounded-lg shadow-md flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-xs text-stone-400 uppercase tracking-wide">{doc.file_format || 'txt'} file</p>
              {(doc.file_storage_path || doc.file_url) && (
                <DocumentFileLink
                  document={doc}
                  download={doc.file_name || undefined}
                  className="inline-flex items-center gap-1.5 text-xs text-amber-600 hover:text-amber-700 font-medium mt-1"
                >
                  <Download className="w-3 h-3" />
                  Download original
                </DocumentFileLink>
              )}
            </div>
            {confirmPrivate && (
              <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-black/40 p-5">
                <div className="w-full rounded-xl bg-white p-5 shadow-xl">
                  <div className="mb-3 flex items-center gap-2 text-amber-800">
                    <AlertTriangle className="h-5 w-5" />
                    <h4 className="font-semibold">Make this document private?</h4>
                  </div>
                  <p className="mb-5 text-sm leading-relaxed text-stone-600">
                    Other users will lose access to the file. Their bookmarks, reading progress, and Read Later references will remain, and the document will appear locked in their lists.
                  </p>
                  <div className="flex justify-end gap-3">
                    <button
                      onClick={() => setConfirmPrivate(false)}
                      disabled={saving}
                      className="rounded-lg border border-stone-200 px-4 py-2 text-sm font-medium text-stone-600 hover:bg-stone-50 disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => void handleSave(true)}
                      disabled={saving}
                      className="inline-flex items-center gap-2 rounded-lg bg-amber-700 px-4 py-2 text-sm font-medium text-white hover:bg-amber-800 disabled:opacity-50"
                    >
                      {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                      Make Private
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-stone-500 mb-1.5">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-4 py-2.5 bg-white border border-stone-200 rounded-lg text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-600/30 focus:border-amber-600/40 transition-all"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-stone-500 mb-1.5">Visibility</label>
            <select
              value={visibility}
              onChange={(event) => setVisibility(event.target.value as 'private' | 'shared')}
              className="w-full px-4 py-2.5 bg-white border border-stone-200 rounded-lg text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-600/30 focus:border-amber-600/40"
            >
              <option value="private">Private — only you can access it</option>
              <option value="shared">Shared — all signed-in users can access it</option>
            </select>
            <p className="text-xs text-stone-400 mt-1.5">
              Private documents are available only to you. Other users may still see a locked entry when they have saved a reference; already-issued download links remain usable until they expire.
            </p>
          </div>
          <div>
            <label className="block text-xs font-medium text-stone-500 mb-1.5">Author</label>
            <input
              type="text"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              className="w-full px-4 py-2.5 bg-white border border-stone-200 rounded-lg text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-600/30 focus:border-amber-600/40 transition-all"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-stone-500 mb-1.5">Category</label>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setCategory(cat)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-full transition-all ${
                    category === cat
                      ? 'bg-stone-900 text-white'
                      : 'bg-white text-stone-600 border border-stone-200 hover:border-stone-300 hover:bg-stone-50'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-stone-500 mb-1.5">Summary</label>
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={3}
              className="w-full px-4 py-2.5 bg-white border border-stone-200 rounded-lg text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-600/30 focus:border-amber-600/40 transition-all resize-none"
            />
          </div>
          <div className="flex items-center gap-3 justify-end pt-4 border-t border-stone-200">
            <button
              onClick={onClose}
              className="px-4 py-2.5 text-sm font-medium text-stone-600 bg-white border border-stone-200 rounded-lg hover:bg-stone-50 transition-all"
            >
              Cancel
            </button>
            <button
              onClick={() => void handleSave()}
              disabled={saving || !title.trim() || !author.trim()}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-amber-600 hover:bg-amber-500 rounded-lg transition-all disabled:opacity-50 shadow-lg shadow-amber-600/20"
            >
              {saving ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</>
              ) : (
                <><Save className="w-4 h-4" /> Save Changes</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
