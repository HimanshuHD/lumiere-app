import { useDocumentContent } from '@/hooks/useData';
import { Reader } from './Reader';

export function ReaderLoader({ documentId, onBack }: { documentId: string; onBack: () => void }) {
  return <ContentLoader key={documentId} id={documentId} onBack={onBack} />;
}
function ContentLoader({ id, onBack }: { id: string; onBack: () => void }) {
  const state = useDocumentContent(id);
  if (state.data) return <Reader key={id} document={state.data} onBack={onBack} />;
  const error = state.error ? {category: state.errorCategory} : null;
  const title = error?.category === 'permission' ? 'Document access denied'
    : error ? 'Could not open document' : state.loading ? 'Opening document…' : 'Document unavailable';
  return <section className="max-w-3xl mx-auto px-4 py-24 text-center" aria-busy={state.loading} aria-live="polite">
    <h1 className="text-2xl font-serif font-bold text-stone-800">{title}</h1>
    {!state.loading && <p className="mt-3 text-sm text-stone-600">{error
      ? error.category === 'permission' ? 'Your current account cannot open this document.' : 'Please check your connection and try again.'
      : 'This document may have been removed or may not be available to your account.'}</p>}
    {error && error.category !== 'permission' && <button className="mt-6 mr-6 underline" onClick={state.refetch}>Retry</button>}
    <button className="mt-6 underline" onClick={onBack}>Return to library</button>
  </section>;
}
