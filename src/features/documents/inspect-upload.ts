import { DocumentValidationError } from '@/services/documentValidation';
interface PdfDetails {
  pageCount: number | null;
  title: string;
  author: string;
  description: string;
  cover: File | null;
}

export async function extractPdfDetails(file: File): Promise<PdfDetails> {
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

export async function extractPageCount(file: File, format: string): Promise<number | null> {
  if (format === 'txt') return estimateTxtPageCount(file);
  return null;
}

export function estimateReadingTime(pageCount: number): number {
  const avgPagesPerMinute = 2;
  return Math.max(1, Math.round(pageCount / avgPagesPerMinute));
}

