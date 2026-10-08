import { useState, useEffect, useCallback } from 'react';
import { FileEdit, Trash2, X, Loader2, BookOpen, Clock, Hash, Download, Pencil, Save } from 'lucide-react';
import { supabase, Document } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';

const CATEGORIES = ['Fiction', 'Non-Fiction', 'Science', 'History', 'Technology', 'Philosophy', 'Adventure'];

export function MyUploads() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [docs, setDocs] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [editDoc, setEditDoc] = useState<Document | null>(null);
  const [deleteDoc, setDeleteDoc] = useState<Document | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchMyUploads = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .eq('uploaded_by', user.id)
      .order('created_at', { ascending: false });
    if (!error && data) {
      setDocs(data as Document[]);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchMyUploads();
  }, [fetchMyUploads]);

  const handleDelete = async () => {
    if (!deleteDoc) return;
    setDeleting(true);
    try {
      // Delete storage files if they exist
      if (deleteDoc.file_url) {
        const fileExt = deleteDoc.file_format || '';
        const pathPattern = `${user?.id}/`;
        // Try to extract path from URL — best-effort deletion
        const url = new URL(deleteDoc.file_url);
        const pathParts = url.pathname.split('/');
        const fileName = pathParts[pathParts.length - 1];
        const folderName = pathParts[pathParts.length - 2];
        if (folderName && fileName) {
          await supabase.storage.from('documents').remove([`${folderName}/${fileName}`]);
        }
        void fileExt;
        void pathPattern;
      }

      const { error } = await supabase.from('documents').delete().eq('id', deleteDoc.id);
      if (error) throw new Error(error.message);

      setDocs((prev) => prev.filter((d) => d.id !== deleteDoc.id));
      showToast('Document deleted successfully.');
      setDeleteDoc(null);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to delete document.', 'error');
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-amber-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
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
                <th className="text-left px-4 py-3 text-xs font-medium text-stone-500 uppercase tracking-wider hidden lg:table-cell">Uploaded</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-stone-500 uppercase tracking-wider w-24">Actions</th>
              </tr>
            </thead>
            <tbody>
              {docs.map((doc) => (
                <tr key={doc.id} className="border-b border-stone-100 last:border-0 hover:bg-stone-50/50 transition-colors">
                  <td className="px-4 py-3 max-w-xs">
                    <div className="flex items-center gap-3">
                      <img src={doc.cover_url} alt="" className="w-8 h-11 object-cover rounded flex-shrink-0" />
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
                        onClick={() => setDeleteDoc(doc)}
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
            setDocs((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
            setEditDoc(null);
          }}
        />
      )}

      {/* Delete confirmation */}
      {deleteDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setDeleteDoc(null)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div className="relative bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setDeleteDoc(null)} className="absolute top-4 right-4 w-8 h-8 rounded-full bg-stone-100 hover:bg-stone-200 flex items-center justify-center transition-colors">
              <X className="w-4 h-4 text-stone-500" />
            </button>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center">
                <Trash2 className="w-5 h-5 text-red-600" />
              </div>
              <h3 className="text-lg font-serif font-bold text-stone-800">Delete Document?</h3>
            </div>
            <p className="text-sm text-stone-500 mb-6">
              Are you sure you want to delete <span className="font-medium text-stone-700">"{deleteDoc.title}"</span>? This action cannot be undone.
            </p>
            <div className="flex items-center gap-3 justify-end">
              <button
                onClick={() => setDeleteDoc(null)}
                className="px-4 py-2 text-sm font-medium text-stone-600 bg-white border border-stone-200 rounded-lg hover:bg-stone-50 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
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
  const { showToast } = useToast();
  const [title, setTitle] = useState(doc.title);
  const [author, setAuthor] = useState(doc.author);
  const [category, setCategory] = useState(doc.category);
  const [summary, setSummary] = useState(doc.summary);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from('documents')
        .update({
          title: title.trim(),
          author: author.trim(),
          category,
          summary: summary.trim(),
        })
        .eq('id', doc.id)
        .select('*')
        .single();
      if (error) throw new Error(error.message);
      showToast('Document updated successfully.');
      onSaved(data as Document);
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
            <img src={doc.cover_url} alt="" className="w-14 h-20 object-cover rounded-lg shadow-md flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-xs text-stone-400 uppercase tracking-wide">{doc.file_format || 'txt'} file</p>
              {doc.file_url && (
                <a
                  href={doc.file_url}
                  download={doc.file_name || undefined}
                  className="inline-flex items-center gap-1.5 text-xs text-amber-600 hover:text-amber-700 font-medium mt-1"
                >
                  <Download className="w-3 h-3" />
                  Download original
                </a>
              )}
            </div>
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
              onClick={handleSave}
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
