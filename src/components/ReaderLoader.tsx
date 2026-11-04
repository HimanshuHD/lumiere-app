import { useDocumentContent } from '@/hooks/useData';
import { Reader } from './Reader';
import { QueryNotice } from '@/shared/ui';

export function ReaderLoader({ documentId, onBack }: { documentId: string; onBack: () => void }) {
  return <ContentLoader key={documentId} id={documentId} onBack={onBack} />;
}
function ContentLoader({ id, onBack }: { id: string; onBack: () => void }) {
  const state = useDocumentContent(id);
  return <>
    {!state.data && <div className="p-8 text-center"><button className="underline" onClick={onBack}>Back to library</button></div>}
    <QueryNotice loading={state.loading && !state.data} error={state.error} retry={state.refetch} label="document content" />
    {state.data && <Reader document={state.data} onBack={onBack} />}
  </>;
}
