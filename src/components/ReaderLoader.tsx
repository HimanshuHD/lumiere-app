import type {  DocumentSummary  } from '@/domain/document-summary';
import { useDocumentContent } from '@/hooks/useData';
import { Reader } from './Reader';
import { QueryNotice } from '@/shared/ui';
import { useAuth } from '@/features/auth';
import { isDocumentLockedForUser } from '@/lib/documentAccess';
import { DocumentAccessNotice } from './DocumentAccessNotice';

export function ReaderLoader({ document, onBack }: { document: DocumentSummary; onBack: () => void }) {
  const { user } = useAuth();
  if (isDocumentLockedForUser(document, user?.id)) return <><button onClick={onBack}>Back to library</button><DocumentAccessNotice /></>;
  return <ContentLoader key={document.id} id={document.id} onBack={onBack} />;
}
function ContentLoader({ id, onBack }: { id: string; onBack: () => void }) {
  const state = useDocumentContent(id);
  return <>
    {!state.data && <div className="p-8 text-center"><button className="underline" onClick={onBack}>Back to library</button></div>}
    <QueryNotice loading={state.loading && !state.data} error={state.error} retry={state.refetch} label="document content" />
    {state.data && <Reader document={state.data} onBack={onBack} />}
  </>;
}
