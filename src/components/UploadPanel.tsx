import { DOCUMENT_CATEGORIES } from '@/domain/documents';
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
import type { Document } from '@/domain/documents';
import { MAX_COVER_SIZE_BYTES, MAX_DOCUMENT_SIZE_BYTES } from '@/services/documentValidation';
import { useUploadController } from '@/features/documents';

interface UploadPanelProps {
  onUploaded: (doc: Document) => void;
}

const CATEGORIES = DOCUMENT_CATEGORIES;

const ACCEPTED_FORMATS = '.pdf,.txt,.epub';

export function UploadPanel({ onUploaded }: UploadPanelProps) {
  const { invalidateOperation, clearPdfCover, clearDocument, estimateReadingTime, title, setTitle, author, setAuthor, category, setCategory, summary, setSummary, visibility, setVisibility, docFile, coverPreview, setCoverFile, setCoverPreview, pdfCoverPreview, pageCount, extractingPdfDetails, uploading, error, success, docInputRef, coverInputRef, handleDocSelect, handleCoverSelect, handleDocDrop, handleCoverDrop, canSubmit, handleSubmit, resetForm } = useUploadController(onUploaded);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
          <Upload aria-hidden="true" className="w-5 h-5 text-amber-700" />
        </div>
        <div>
          <h1 className="text-2xl font-serif font-bold text-stone-800">Upload Document</h1>
          <p className="text-sm text-stone-500">Add a new document to the library</p>
        </div>
      </div>

      {success && (
        <div className="mb-6 flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-xl">
          <CheckCircle2 aria-hidden="true" className="w-5 h-5 text-green-600 flex-shrink-0" />
          <p className="text-sm text-green-700 font-medium">Document uploaded successfully! It's now available in the library.</p>
        </div>
      )}

      {error && (
        <div className="mb-6 flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl">
          <AlertCircle aria-hidden="true" className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left: Document file upload */}
        <div className="space-y-6">
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-stone-700 mb-2">
              <FileText aria-hidden="true" className="w-4 h-4 text-stone-400" />
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
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (file) void handleDocSelect(file);
                }}
                className="hidden"
              />
              {docFile ? (
                <div className="space-y-2">
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-green-100 mb-2">
                    <FileCheck2 aria-hidden="true" className="w-6 h-6 text-green-600" />
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
                    <Upload aria-hidden="true" className="w-6 h-6 text-stone-400 group-hover:text-amber-600 transition-colors" />
                  </div>
                  <p className="text-sm text-stone-600">Click or drag to upload</p>
                  <p className="text-xs text-stone-400">
                    PDF, TXT, or EPUB · up to {MAX_DOCUMENT_SIZE_BYTES / 1024 / 1024} MB
                  </p>
                </div>
              )}
            </div>
            {docFile && (
              <button
                onClick={() => {
                  clearDocument();
                }}
                className="mt-2 text-xs text-stone-500 hover:text-red-500 transition-colors flex items-center gap-1"
              >
                <X aria-hidden="true" className="w-3 h-3" /> Remove file
              </button>
            )}
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-stone-700 mb-2">
              <ImageIcon aria-hidden="true" className="w-4 h-4 text-stone-400" />
              Book Cover <span className="text-xs font-normal text-stone-400">(optional)</span>
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
                accept=".jpg,.jpeg,.png,.webp,.gif,image/jpeg,image/png,image/webp,image/gif"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (file) void handleCoverSelect(file);
                }}
                className="hidden"
              />
              {coverPreview ? (
                <div className="relative inline-block">
                  <img src={coverPreview} alt="Cover preview" className="max-h-48 rounded-lg shadow-md mx-auto" />
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      invalidateOperation();
                      setCoverFile(null);
                      setCoverPreview(null);
                    }}
                    className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center shadow-md hover:bg-red-600 transition-colors"
                  >
                    <X aria-hidden="true" className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : extractingPdfDetails && docFile?.name.toLowerCase().endsWith('.pdf') ? (
                <div className="space-y-2">
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-amber-100 mb-2">
                    <Loader2 aria-hidden="true" className="w-6 h-6 text-amber-700 animate-spin" />
                  </div>
                  <p className="text-sm text-stone-600">Reading PDF metadata and extracting cover…</p>
                  <p className="text-xs text-stone-400">You can still upload a different cover image.</p>
                </div>
              ) : pdfCoverPreview ? (
                <>
                  <img
                    src={pdfCoverPreview}
                    alt=""
                    aria-hidden="true"
                    className="absolute inset-0 h-full w-full object-cover rounded-lg"
                  />
                  <div className="absolute inset-0 bg-stone-950/55 rounded-lg" />
                  <div className="relative z-10 space-y-2">
                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-white/15 mb-2">
                      <ImageIcon aria-hidden="true" className="w-6 h-6 text-white" />
                    </div>
                    <p className="text-sm font-medium text-white">First page extracted from PDF</p>
                    <p className="text-xs text-stone-100">Click or drag a cover image here to replace it</p>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      clearPdfCover();
                    }}
                    aria-label="Remove extracted PDF cover"
                    className="absolute top-2 right-2 z-20 w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center shadow-md hover:bg-red-600 transition-colors"
                  >
                    <X aria-hidden="true" className="w-3.5 h-3.5" />
                  </button>
                </>
              ) : (
                <div className="space-y-2">
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-stone-100 group-hover:bg-amber-100 transition-colors mb-2">
                    <ImageIcon aria-hidden="true" className="w-6 h-6 text-stone-400 group-hover:text-amber-600 transition-colors" />
                  </div>
                  <p className="text-sm text-stone-600">Click or drag to upload a cover image</p>
                  <p className="text-xs text-stone-400">JPG, PNG, or WebP</p>
                  <p className="text-xs text-stone-500">Without one, we’ll use the first page of a PDF when possible, or show the Lumiere fallback cover.</p>
                </div>
              )}
            </div>
            <p className="mt-2 text-xs text-stone-400">
              JPEG, PNG, WebP, or GIF · up to {MAX_COVER_SIZE_BYTES / 1024 / 1024} MB
            </p>
          </div>
        </div>

        {/* Right: Form fields */}
        <div className="space-y-5">
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-stone-700 mb-2">
              <BookOpen aria-hidden="true" className="w-4 h-4 text-stone-400" />
              Book Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => {
                invalidateOperation();
                setTitle(e.target.value);
              }}
              placeholder="Enter the book title"
              className="w-full px-4 py-2.5 bg-white border border-stone-200 rounded-lg text-sm text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-600/30 focus:border-amber-600/40 transition-all"
            />
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-stone-700 mb-2">
              <User aria-hidden="true" className="w-4 h-4 text-stone-400" />
              Author <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={author}
              onChange={(e) => {
                invalidateOperation();
                setAuthor(e.target.value);
              }}
              placeholder="Enter the author name"
              className="w-full px-4 py-2.5 bg-white border border-stone-200 rounded-lg text-sm text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-600/30 focus:border-amber-600/40 transition-all"
            />
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-stone-700 mb-2">
              <Tag aria-hidden="true" className="w-4 h-4 text-stone-400" />
              Category
            </label>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  onClick={() => {
                    invalidateOperation();
                    setCategory(cat);
                  }}
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
              onChange={(e) => {
                invalidateOperation();
                setSummary(e.target.value);
              }}
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
                  onChange={() => {
                    invalidateOperation();
                    setVisibility('private');
                  }}
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
                  onChange={() => {
                    invalidateOperation();
                    setVisibility('shared');
                  }}
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
                  <Hash aria-hidden="true" className="w-3.5 h-3.5" />
                  Pages (auto-detected)
                </div>
                <p className="text-lg font-serif font-bold text-stone-800">{pageCount}</p>
              </div>
              <div className="p-3 bg-stone-50 rounded-lg border border-stone-200">
                <div className="flex items-center gap-1.5 text-xs text-stone-500 mb-1">
                  <Clock aria-hidden="true" className="w-3.5 h-3.5" />
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
              <Loader2 aria-hidden="true" className="w-4 h-4 animate-spin" />
              Uploading...
            </>
          ) : (
            <>
              <Upload aria-hidden="true" className="w-4 h-4" />
              Upload Document
            </>
          )}
        </button>
      </div>
    </div>
  );
}
