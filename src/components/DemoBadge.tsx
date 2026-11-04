import type { Document } from '@/domain/documents';

export function DemoBadge({ document }: { document: Pick<Document, 'origin'> }) {
  if (document.origin !== 'demo') return null;
  return <span className="inline-flex w-fit shrink-0 self-start rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-900">Demo story</span>;
}
