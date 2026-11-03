import { useState, useRef, useCallback, useEffect } from 'react';

import type { Document } from '@/domain/documents';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/shared/ui';
import {
  DocumentLifecycleError,
  recoverPendingUserUploadFiles,
  uploadUserDocument,
} from '@/services/documentLifecycle';
import {
  validateCoverFile,
  validateDocumentFile,
} from '@/services/documentValidation';
import { supabaseDocumentLifecycleDependencies } from '@/app/document-operations';
import { extractPdfDetails, extractPageCount, estimateReadingTime } from './inspect-upload';
import { textToChapters } from '@/services/documentText';


export function useUploadController(onUploaded: (doc: Document) => void) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const active = useRef(true);
  const successTimer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => { active.current = true; return () => { active.current = false; documentSelectionRef.current++; clearTimeout(successTimer.current); }; }, []);
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

      if (!active.current) return;
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
      successTimer.current = setTimeout(() => setSuccess(false), 4000);
    } catch (err) {
      if (!active.current) return;
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
      if (active.current) setUploading(false);
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

  const invalidateOperation = () => { operationIdRef.current = null; };
  const clearPdfCover = () => { setPdfCoverFile(null); setPdfCoverPreview(null); invalidateOperation(); };
  const clearDocument = () => {
    documentSelectionRef.current += 1; invalidateOperation(); setDocFile(null); setPageCount(null);
    clearPdfCover(); setExtractingPdfDetails(false);
  };
  return { invalidateOperation, clearPdfCover, clearDocument, estimateReadingTime, title, setTitle, author, setAuthor, category, setCategory, summary, setSummary, visibility, setVisibility, docFile, coverFile, coverPreview, setCoverFile, setCoverPreview, pdfCoverFile, pdfCoverPreview, pageCount, extractingPdfDetails, uploading, error, success, docInputRef, coverInputRef, handleDocSelect, handleCoverSelect, handleDocDrop, handleCoverDrop, canSubmit, handleSubmit, resetForm };
}
