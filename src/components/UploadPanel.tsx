import { useState, useRef, useCallback } from 'react';
import {
  Upload,
  FileText,
  Image as ImageIcon,
  X,
  Loader2,
  BookOpen,
  User,
  Tag,
  Clock,
  FileCheck2,
  AlertCircle,
  CheckCircle2,
  Hash,
} from 'lucide-react';
import { supabase, Document } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';

interface UploadPanelProps {
  onUploaded: (doc: Document) => void;
}

const CATEGORIES = ['Fiction', 'Non-Fiction', 'Science', 'History', 'Technology', 'Philosophy', 'Adventure'];

const ACCEPTED_FORMATS = '.pdf,.txt,.epub';

async function extractPdfPageCount(file: File): Promise<number> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const text = new TextDecoder('latin1').decode(bytes);
  const matches = text.match(/\/Type\s*\/Page[^s]/g);
  return matches ? matches.length : 0;
}

function estimateTxtPageCount(file: File): Promise<number> {
  return file.text().then((content) => {
    const charsPerPage = 3000;
    return Math.max(1, Math.ceil(content.length / charsPerPage));
  });
}

async function extractPageCount(file: File): Promise<number> {
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (ext === 'pdf') return extractPdfPageCount(file);
  if (ext === 'txt') return estimateTxtPageCount(file);
  return 0;
}

function estimateReadingTime(pageCount: number): number {
  const avgPagesPerMinute = 2;
  return Math.max(1, Math.round(pageCount / avgPagesPerMinute));
}

function textToChapters(text: string): { title: string; content: string }[] {
  const normalized = text.replace(/\r\n/g, '\n');
  const sections = normalized.split(/\n{3,}/);
  if (sections.length <= 1) {
    const chunks: string[] = [];
    const paragraphs = normalized.split(/\n{2,}/);
    let current = '';
    for (const para of paragraphs) {
      if ((current + para).length > 5000 && current) {
        chunks.push(current);
        current = para;
      } else {
        current = current ? current + '\n\n' + para : para;
      }
    }
    if (current) chunks.push(current);
    return chunks.map((content, i) => ({
      title: `Section ${i + 1}`,
      content,
    }));
  }
  return sections.map((content, i) => ({
    title: `Section ${i + 1}`,
    content: content.trim(),
  }));
}

export function UploadPanel({ onUploaded }: UploadPanelProps) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [category, setCategory] = useState('Fiction');
  const [summary, setSummary] = useState('');
  const [visibility, setVisibility] = useState<'private' | 'shared'>('private');
  const [docFile, setDocFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const docInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  const handleDocSelect = useCallback(async (file: File) => {
    setDocFile(file);
    setError(null);
    setPageCount(null);
    try {
      const count = await extractPageCount(file);
      setPageCount(count);
      if (!title) {
        const baseName = file.name.replace(/\.[^.]+$/, '');
        setTitle(baseName.replace(/[_-]/g, ' '));
      }
    } catch {
      setPageCount(0);
    }
  }, [title]);

  const handleCoverSelect = useCallback((file: File) => {
    setCoverFile(file);
    const url = URL.createObjectURL(file);
    setCoverPreview(url);
  }, []);

  const handleDocDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleDocSelect(file);
  }, [handleDocSelect]);

  const handleCoverDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleCoverSelect(file);
  }, [handleCoverSelect]);

  const canSubmit = title.trim() && author.trim() && docFile && coverFile && !uploading;

  const handleSubmit = async () => {
    if (!user || !docFile || !coverFile || !title.trim() || !author.trim()) return;
    setUploading(true);
    setError(null);
    setSuccess(false);
    const uploadedPaths: string[] = [];
    try {
      const docExt = docFile.name.split('.').pop()?.toLowerCase();
      const docId = crypto.randomUUID();
      const docPath = `${user.id}/${docId}.${docExt}`;

      const { error: docUploadError } = await supabase.storage
        .from('documents')
        .upload(docPath, docFile);
      if (docUploadError) throw new Error(`Failed to upload document file: ${docUploadError.message}`);
      uploadedPaths.push(docPath);

      const coverExt = coverFile.name.split('.').pop()?.toLowerCase() || 'jpg';
      const coverPath = `${user.id}/${docId}-cover.${coverExt}`;
      const { error: coverUploadError } = await supabase.storage
        .from('documents')
        .upload(coverPath, coverFile);
      if (coverUploadError) throw new Error(`Failed to upload cover image: ${coverUploadError.message}`);
      uploadedPaths.push(coverPath);

      let chapters: { title: string; content: string }[] = [];
      if (docExt === 'txt') {
        const text = await docFile.text();
        chapters = textToChapters(text);
      } else {
        chapters = [{
          title: title,
          content: `This document is available in its original format (${docExt?.toUpperCase()}). Use the download link below to access the full content.`,
        }];
      }

      const pages = pageCount || 1;
      const readingTime = estimateReadingTime(pages);

      const { data: insertData, error: insertError } = await supabase
        .from('documents')
        .insert({
          title: title.trim(),
          author: author.trim(),
          category,
          summary: summary.trim() || 'No description provided.',
          cover_url: null,
          cover_storage_path: coverPath,
          reading_time: readingTime,
          chapters: chapters as unknown as Record<string, unknown>[],
          is_featured: false,
          page_count: pages,
          origin: 'user_upload',
          visibility,
          file_storage_path: docPath,
          file_format: docExt,
          file_name: docFile.name,
        })
        .select('*')
        .single();

      if (insertError) throw new Error(`Failed to save document: ${insertError.message}`);
      uploadedPaths.length = 0;

      setSuccess(true);
      setTitle('');
      setAuthor('');
      setSummary('');
      setCategory('Fiction');
      setVisibility('private');
      setDocFile(null);
      setCoverFile(null);
      setCoverPreview(null);
      setPageCount(null);

      if (insertData) {
        onUploaded(insertData as Document);
      }
      showToast(visibility === 'shared'
        ? 'Document uploaded and shared with signed-in Lumiere users.'
        : 'Document uploaded privately. Only you can access it.');
      setTimeout(() => setSuccess(false), 4000);
    } catch (err) {
      let msg = err instanceof Error ? err.message : 'An unexpected error occurred during upload.';
      if (uploadedPaths.length > 0) {
        const { error: cleanupError } = await supabase.storage.from('documents').remove(uploadedPaths);
        if (cleanupError) {
          msg = `${msg}. Uploaded file cleanup failed: ${cleanupError.message}`;
        }
      }
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setUploading(false);
    }
  };

  const resetForm = () => {
    setTitle('');
    setAuthor('');
    setSummary('');
    setCategory('Fiction');
    setVisibility('private');
    setDocFile(null);
    setCoverFile(null);
    setCoverPreview(null);
    setPageCount(null);
    setError(null);
    setSuccess(false);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
          <Upload className="w-5 h-5 text-amber-700" />
        </div>
        <div>
          <h1 className="text-2xl font-serif font-bold text-stone-800">Upload Document</h1>
          <p className="text-sm text-stone-500">Add a new document to the library</p>
        </div>
      </div>

      {success && (
        <div className="mb-6 flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-xl">
          <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
          <p className="text-sm text-green-700 font-medium">Document uploaded successfully! It's now available in the library.</p>
        </div>
      )}

      {error && (
        <div className="mb-6 flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left: Document file upload */}
        <div className="space-y-6">
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-stone-700 mb-2">
              <FileText className="w-4 h-4 text-stone-400" />
              Document File <span className="text-red-500">*</span>
            </label>
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDocDrop}
              onClick={() => docInputRef.current?.click()}
              className="relative border-2 border-dashed border-stone-300 rounded-xl p-8 text-center hover:border-amber-500 hover:bg-amber-50/30 transition-all cursor-pointer group"
            >
              <input
                ref={docInputRef}
                type="file"
                accept={ACCEPTED_FORMATS}
                onChange={(e) => e.target.files?.[0] && handleDocSelect(e.target.files[0])}
                className="hidden"
              />
              {docFile ? (
                <div className="space-y-2">
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-green-100 mb-2">
                    <FileCheck2 className="w-6 h-6 text-green-600" />
                  </div>
                  <p className="text-sm font-medium text-stone-700 break-all line-clamp-2">{docFile.name}</p>
                  <p className="text-xs text-stone-500">
                    {(docFile.size / 1024 / 1024).toFixed(2)} MB
                    {pageCount !== null && pageCount > 0 && ` · ${pageCount} pages`}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-stone-100 group-hover:bg-amber-100 transition-colors mb-2">
                    <Upload className="w-6 h-6 text-stone-400 group-hover:text-amber-600 transition-colors" />
                  </div>
                  <p className="text-sm text-stone-600">Click or drag to upload</p>
                  <p className="text-xs text-stone-400">PDF, TXT, or EPUB</p>
                </div>
              )}
            </div>
            {docFile && (
              <button
                onClick={() => { setDocFile(null); setPageCount(null); }}
                className="mt-2 text-xs text-stone-500 hover:text-red-500 transition-colors flex items-center gap-1"
              >
                <X className="w-3 h-3" /> Remove file
              </button>
            )}
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-stone-700 mb-2">
              <ImageIcon className="w-4 h-4 text-stone-400" />
              Book Cover <span className="text-red-500">*</span>
            </label>
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleCoverDrop}
              onClick={() => coverInputRef.current?.click()}
              className="relative border-2 border-dashed border-stone-300 rounded-xl p-6 text-center hover:border-amber-500 hover:bg-amber-50/30 transition-all cursor-pointer group"
            >
              <input
                ref={coverInputRef}
                type="file"
                accept="image/*"
                onChange={(e) => e.target.files?.[0] && handleCoverSelect(e.target.files[0])}
                className="hidden"
              />
              {coverPreview ? (
                <div className="relative inline-block">
                  <img src={coverPreview} alt="Cover preview" className="max-h-48 rounded-lg shadow-md mx-auto" />
                  <button
                    onClick={(e) => { e.stopPropagation(); setCoverFile(null); setCoverPreview(null); }}
                    className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center shadow-md hover:bg-red-600 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-stone-100 group-hover:bg-amber-100 transition-colors mb-2">
                    <ImageIcon className="w-6 h-6 text-stone-400 group-hover:text-amber-600 transition-colors" />
                  </div>
                  <p className="text-sm text-stone-600">Click or drag to upload cover image</p>
                  <p className="text-xs text-stone-400">JPG, PNG, or WebP</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: Form fields */}
        <div className="space-y-5">
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-stone-700 mb-2">
              <BookOpen className="w-4 h-4 text-stone-400" />
              Book Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter the book title"
              className="w-full px-4 py-2.5 bg-white border border-stone-200 rounded-lg text-sm text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-600/30 focus:border-amber-600/40 transition-all"
            />
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-stone-700 mb-2">
              <User className="w-4 h-4 text-stone-400" />
              Author <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder="Enter the author name"
              className="w-full px-4 py-2.5 bg-white border border-stone-200 rounded-lg text-sm text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-600/30 focus:border-amber-600/40 transition-all"
            />
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-stone-700 mb-2">
              <Tag className="w-4 h-4 text-stone-400" />
              Category
            </label>
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
            <label className="flex items-center gap-2 text-sm font-medium text-stone-700 mb-2">
              Book Description
            </label>
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="A brief summary of the document (optional)"
              rows={3}
              className="w-full px-4 py-2.5 bg-white border border-stone-200 rounded-lg text-sm text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-600/30 focus:border-amber-600/40 transition-all resize-none"
            />
          </div>

          <fieldset>
            <legend className="text-sm font-medium text-stone-700 mb-2">Who can access this document?</legend>
            <div className="flex flex-col sm:flex-row gap-3">
              <label className="flex items-start gap-3 p-3 border border-stone-200 rounded-lg cursor-pointer flex-1">
                <input
                  type="radio"
                  name="document-visibility"
                  value="private"
                  checked={visibility === 'private'}
                  onChange={() => setVisibility('private')}
                  className="mt-1 accent-amber-600"
                />
                <span>
                  <span className="block text-sm font-medium text-stone-800">Private</span>
                  <span className="block text-xs text-stone-500">Only you can view this document and its files.</span>
                </span>
              </label>
              <label className="flex items-start gap-3 p-3 border border-stone-200 rounded-lg cursor-pointer flex-1">
                <input
                  type="radio"
                  name="document-visibility"
                  value="shared"
                  checked={visibility === 'shared'}
                  onChange={() => setVisibility('shared')}
                  className="mt-1 accent-amber-600"
                />
                <span>
                  <span className="block text-sm font-medium text-stone-800">Shared</span>
                  <span className="block text-xs text-stone-500">Any signed-in Lumiere user can view and download it.</span>
                </span>
              </label>
            </div>
          </fieldset>

          {/* Auto-detected info */}
          {pageCount !== null && pageCount > 0 && (
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 bg-stone-50 rounded-lg border border-stone-200">
                <div className="flex items-center gap-1.5 text-xs text-stone-500 mb-1">
                  <Hash className="w-3.5 h-3.5" />
                  Pages (auto-detected)
                </div>
                <p className="text-lg font-serif font-bold text-stone-800">{pageCount}</p>
              </div>
              <div className="p-3 bg-stone-50 rounded-lg border border-stone-200">
                <div className="flex items-center gap-1.5 text-xs text-stone-500 mb-1">
                  <Clock className="w-3.5 h-3.5" />
                  Est. Read Time
                </div>
                <p className="text-lg font-serif font-bold text-stone-800">{estimateReadingTime(pageCount)} min</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="mt-8 flex items-center justify-end gap-3 pt-6 border-t border-stone-200">
        <button
          onClick={resetForm}
          disabled={uploading}
          className="px-4 py-2.5 text-sm font-medium text-stone-600 bg-white border border-stone-200 rounded-lg hover:bg-stone-50 transition-all disabled:opacity-50"
        >
          Reset
        </button>
        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-amber-600 hover:bg-amber-500 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-amber-600/20"
        >
          {uploading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Uploading...
            </>
          ) : (
            <>
              <Upload className="w-4 h-4" />
              Upload Document
            </>
          )}
        </button>
      </div>
    </div>
  );
}
