import { DOCUMENT_CATEGORIES } from '@/domain/documents';
import { useState, useRef, useCallback, useEffect } from 'react';
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
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import {
  DocumentLifecycleError,
  recoverPendingUserUploadFiles,
  uploadUserDocument,
} from '@/services/documentLifecycle';
import {
  DocumentValidationError,
  MAX_COVER_SIZE_BYTES,
  MAX_DOCUMENT_SIZE_BYTES,
  validateCoverFile,
  validateDocumentFile,
} from '@/services/documentValidation';
import { supabaseDocumentLifecycleDependencies } from '@/services/supabaseDocumentLifecycle';
import { textToChapters } from '@/services/documentText';

interface UploadPanelProps {
  onUploaded: (doc: Document) => void;
}

const CATEGORIES = DOCUMENT_CATEGORIES;

const ACCEPTED_FORMATS = '.pdf,.txt,.epub';

interface PdfDetails {
  pageCount: number | null;
  title: string;
  author: string;
  description: string;
  cover: File | null;
}

async function extractPdfDetails(file: File): Promise<PdfDetails> {
  const details: PdfDetails = {
    pageCount: null,
    title: '',
    author: '',
    description: '',
    cover: null,
  };
  let destroyPdf: (() => Promise<void>) | undefined;
  const canvas = document.createElement('canvas');

  try {
    const pdfjsLib = await import('pdfjs-dist');
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url
    ).toString();
    const loadingTask = pdfjsLib.getDocument({ data: await file.arrayBuffer() });
    const pdf = await loadingTask.promise;
    destroyPdf = () => pdf.destroy();
    details.pageCount = pdf.numPages;

    try {
      const { info } = await pdf.getMetadata();
      const metadataInfo = info as Record<string, unknown>;
      details.title = typeof metadataInfo.Title === 'string' ? metadataInfo.Title.trim() : '';
      details.author = typeof metadataInfo.Author === 'string' ? metadataInfo.Author.trim() : '';
      details.description = typeof metadataInfo.Subject === 'string' ? metadataInfo.Subject.trim() : '';
    } catch {
      // Some PDFs omit or contain unreadable metadata.
    }

    try {
      const page = await pdf.getPage(1);
      const initialViewport = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: Math.min(1.5, 480 / initialViewport.width) });
      const context = canvas.getContext('2d');
      if (!context) return details;

      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await page.render({ canvasContext: context, viewport }).promise;

      const coverBlob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/jpeg', 0.84)
      );
      if (coverBlob) {
        details.cover = new File([coverBlob], 'pdf-cover.jpg', { type: 'image/jpeg' });
      }
    } catch {
      // The PDF may still have usable metadata even if its first page cannot be rendered.
    }

    return details;
  } catch {
    throw new DocumentValidationError('The PDF could not be opened. Check that the file is a valid, readable PDF.');
  } finally {
    canvas.width = 0;
    canvas.height = 0;
    if (destroyPdf) {
      try {
        await destroyPdf();
      } catch {
        // The extracted cover remains usable even if PDF cleanup fails.
      }
    }
  }
}

function estimateTxtPageCount(file: File): Promise<number> {
  return file.text().then((content) => {
    const charsPerPage = 3000;
    return Math.ceil(content.length / charsPerPage);
  });
}

async function extractPageCount(file: File, format: string): Promise<number | null> {
  if (format === 'txt') return estimateTxtPageCount(file);
  return null;
}

function estimateReadingTime(pageCount: number): number {
  const avgPagesPerMinute = 2;
  return Math.max(1, Math.round(pageCount / avgPagesPerMinute));
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
  const [pdfCoverFile, setPdfCoverFile] = useState<File | null>(null);
  const [pdfCoverPreview, setPdfCoverPreview] = useState<string | null>(null);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [extractingPdfDetails, setExtractingPdfDetails] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const docInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const documentSelectionRef = useRef(0);
  const operationIdRef = useRef<string | null>(null);
  const submitLockRef = useRef(false);

  useEffect(() => {
    return () => {
      if (coverPreview) URL.revokeObjectURL(coverPreview);
      if (pdfCoverPreview) URL.revokeObjectURL(pdfCoverPreview);
    };
  }, [coverPreview, pdfCoverPreview]);

  const userId = user?.id;

  useEffect(() => {
    if (!userId) return;
    let active = true;
    void recoverPendingUserUploadFiles(supabaseDocumentLifecycleDependencies, userId)
      .then(({ recovered, pending }) => {
        if (!active) return;
        if (recovered > 0) {
          showToast(`Recovered cleanup for ${recovered} incomplete upload file${recovered === 1 ? '' : 's'}.`);
        }
        if (pending > 0) {
          showToast(`${pending} upload cleanup${pending === 1 ? '' : 's'} still need attention.`, 'error');
        }
      })
      .catch((recoveryError: unknown) => {
        console.error('Could not recover incomplete document uploads:', recoveryError);
        if (active) showToast('Could not check for incomplete upload cleanup.', 'error');
      });
    return () => {
      active = false;
    };
  }, [showToast, userId]);

  const handleDocSelect = useCallback(async (file: File) => {
    const selection = documentSelectionRef.current + 1;
    documentSelectionRef.current = selection;
    operationIdRef.current = null;
    setDocFile(file);
    setError(null);
    setPageCount(null);
    setExtractingPdfDetails(false);
    setPdfCoverFile(null);
    setPdfCoverPreview(null);

    try {
      const fileFormat = await validateDocumentFile(file);
      if (documentSelectionRef.current !== selection) return;
      if (fileFormat === 'pdf') {
        setExtractingPdfDetails(true);
        const details = await extractPdfDetails(file);
        if (documentSelectionRef.current !== selection) return;
        setPageCount(details.pageCount);
        setPdfCoverFile(details.cover);
        setPdfCoverPreview(details.cover ? URL.createObjectURL(details.cover) : null);
        const filenameTitle = file.name.replace(/\.[^.]+$/, '').replace(/[_-]/g, ' ');
        setTitle((current) => current.trim() ? current : details.title || filenameTitle);
        if (details.author) setAuthor((current) => current.trim() ? current : details.author);
        if (details.description) setSummary((current) => current.trim() ? current : details.description);
      } else {
        const count = await extractPageCount(file, fileFormat);
        if (documentSelectionRef.current !== selection) return;
        setPageCount(count);
        const filenameTitle = file.name.replace(/\.[^.]+$/, '').replace(/[_-]/g, ' ');
        setTitle((current) => current.trim() ? current : filenameTitle);
      }
    } catch (selectionError) {
      if (documentSelectionRef.current === selection) {
        setDocFile(null);
        setPageCount(null);
        setPdfCoverFile(null);
        setPdfCoverPreview(null);
        setError(selectionError instanceof Error
          ? selectionError.message
          : 'Could not validate this document file.');
      }
    } finally {
      if (documentSelectionRef.current === selection) setExtractingPdfDetails(false);
    }
  }, []);

  const handleCoverSelect = useCallback(async (file: File) => {
    try {
      await validateCoverFile(file);
    } catch (selectionError) {
      setError(selectionError instanceof Error
        ? selectionError.message
        : 'Could not validate this cover image.');
      return;
    }
    operationIdRef.current = null;
    setCoverFile(file);
    setError(null);
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

  const canSubmit = title.trim() && author.trim() && docFile && !uploading && !extractingPdfDetails;

  const handleSubmit = async () => {
    if (!user || !docFile || !title.trim() || !author.trim() || submitLockRef.current) return;
    submitLockRef.current = true;
    setUploading(true);
    setError(null);
    setSuccess(false);
    try {
      const docExt = await validateDocumentFile(docFile);
      const coverToUpload = coverFile || pdfCoverFile;
      if (coverToUpload) await validateCoverFile(coverToUpload);
      const operationId = operationIdRef.current ?? crypto.randomUUID();
      operationIdRef.current = operationId;

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

      const readingTime = pageCount === null ? 1 : estimateReadingTime(pageCount);
      const uploadedDocument = await uploadUserDocument(supabaseDocumentLifecycleDependencies, {
        operationId,
        userId: user.id,
        documentFile: docFile,
        coverFile: coverToUpload,
        metadata: {
          title: title.trim(),
          author: author.trim(),
          category,
          summary: summary.trim() || 'No description provided.',
          cover_url: null,
          reading_time: readingTime,
          chapters,
          is_featured: false,
          page_count: pageCount,
          visibility,
          file_format: docExt || null,
          file_name: docFile.name,
        },
      });

      setSuccess(true);
      setTitle('');
      setAuthor('');
      setSummary('');
      setCategory('Fiction');
      setVisibility('private');
      setDocFile(null);
      setCoverFile(null);
      setCoverPreview(null);
      setPdfCoverFile(null);
      setPdfCoverPreview(null);
      setPageCount(null);
      setExtractingPdfDetails(false);
      operationIdRef.current = null;

      onUploaded(uploadedDocument);
      showToast(visibility === 'shared'
        ? 'Document uploaded and shared with signed-in Lumiere users.'
        : 'Document uploaded privately. Only you can access it.');
      setTimeout(() => setSuccess(false), 4000);
    } catch (err) {
      let msg = err instanceof Error ? err.message : 'An unexpected error occurred during upload.';
      if (err instanceof DocumentLifecycleError && err.recoveryPaths.length > 0) {
        msg += ` Check operation ${err.operationId} and these files before retrying: ${err.recoveryPaths.join(', ')}.`;
        if (err.cleanupPendingPaths.length > 0) {
          msg += ` Cleanup is still pending for: ${err.cleanupPendingPaths.join(', ')}.`;
        }
      }
      setError(msg);
      showToast(msg, 'error');
    } finally {
      submitLockRef.current = false;
      setUploading(false);
    }
  };

  const resetForm = () => {
    documentSelectionRef.current += 1;
    operationIdRef.current = null;
    setTitle('');
    setAuthor('');
    setSummary('');
    setCategory('Fiction');
    setVisibility('private');
    setDocFile(null);
    setCoverFile(null);
    setCoverPreview(null);
    setPdfCoverFile(null);
    setPdfCoverPreview(null);
    setPageCount(null);
    setExtractingPdfDetails(false);
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
                  <p className="text-xs text-stone-400">
                    PDF, TXT, or EPUB · up to {MAX_DOCUMENT_SIZE_BYTES / 1024 / 1024} MB
                  </p>
                </div>
              )}
            </div>
            {docFile && (
              <button
                onClick={() => {
                  documentSelectionRef.current += 1;
                  operationIdRef.current = null;
                  setDocFile(null);
                  setPageCount(null);
                  setPdfCoverFile(null);
                  setPdfCoverPreview(null);
                  setExtractingPdfDetails(false);
                }}
                className="mt-2 text-xs text-stone-500 hover:text-red-500 transition-colors flex items-center gap-1"
              >
                <X className="w-3 h-3" /> Remove file
              </button>
            )}
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-stone-700 mb-2">
              <ImageIcon className="w-4 h-4 text-stone-400" />
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
                      operationIdRef.current = null;
                      setCoverFile(null);
                      setCoverPreview(null);
                    }}
                    className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center shadow-md hover:bg-red-600 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : extractingPdfDetails && docFile?.name.toLowerCase().endsWith('.pdf') ? (
                <div className="space-y-2">
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-amber-100 mb-2">
                    <Loader2 className="w-6 h-6 text-amber-700 animate-spin" />
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
                      <ImageIcon className="w-6 h-6 text-white" />
                    </div>
                    <p className="text-sm font-medium text-white">First page extracted from PDF</p>
                    <p className="text-xs text-stone-100">Click or drag a cover image here to replace it</p>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setPdfCoverFile(null);
                      setPdfCoverPreview(null);
                    }}
                    aria-label="Remove extracted PDF cover"
                    className="absolute top-2 right-2 z-20 w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center shadow-md hover:bg-red-600 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </>
              ) : (
                <div className="space-y-2">
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-stone-100 group-hover:bg-amber-100 transition-colors mb-2">
                    <ImageIcon className="w-6 h-6 text-stone-400 group-hover:text-amber-600 transition-colors" />
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
              <BookOpen className="w-4 h-4 text-stone-400" />
              Book Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => {
                operationIdRef.current = null;
                setTitle(e.target.value);
              }}
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
              onChange={(e) => {
                operationIdRef.current = null;
                setAuthor(e.target.value);
              }}
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
                  onClick={() => {
                    operationIdRef.current = null;
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
                operationIdRef.current = null;
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
                    operationIdRef.current = null;
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
                    operationIdRef.current = null;
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
            <…91910 tokens truncated…    p_user_id: userId, p_document_id: documentId, p_position: pending.position,
      p_chapter_index: pending.chapterIndex, p_scroll_percent: pending.progress,
      p_expected_revision: pending.expectedRevision, p_mutation_id: pending.mutationId,
    });
    if (error) throw error; return data as SaveResult;
  },
};
