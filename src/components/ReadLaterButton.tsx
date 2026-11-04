import { useCallback, useState } from 'react';
import { useReadingList } from '@/hooks/useData';
import { useToast } from '@/shared/ui';
import type {  DocumentSummary as Document  } from '@/domain/document-summary';

interface ReadLaterButtonProps {
  doc: Document;
  variant?: 'compact' | 'full';
  className?: string;
  hasProgress?: boolean;
}

function ReadLaterIcon({ filled, className }: { filled: boolean; className?: string }) {
  if (filled) {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v15.5" fill="currentColor" fillOpacity="0.15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <path d="M12 6.5v3.2l2 1.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <circle cx="12" cy="8.5" r="4" stroke="currentColor" strokeWidth="1.8" fill="none" />
        <circle cx="12" cy="8.5" r="4" fill="currentColor" fillOpacity="0.1" />
      </svg>
    );
  }
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v15.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="8.5" r="4" stroke="currentColor" strokeWidth="1.8" fill="none" />
      <path d="M12 6.5v3.2l2 1.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ReadLaterButton(props: ReadLaterButtonProps) {
  return props.hasProgress ? null : <ReadLaterAction {...props} />;
}

function ReadLaterAction({ doc, variant = 'full', className = '' }: ReadLaterButtonProps) {
  const { toggleReadingList, isInReadingList, isReadingListPending } = useReadingList();
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);

  const pending = busy || isReadingListPending(doc.id);
  const saved = isInReadingList(doc.id);

  const handleClick = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      if (pending) return;
      setBusy(true);
      try {
        const result = await toggleReadingList(doc.id);
        if (!result.ok) { showToast(result.error.message, 'error'); return; }
        showToast(result.value.selected ? `"${doc.title}" added to your Reading List` : `"${doc.title}" removed from your Reading List`, 'success');
      } finally { setBusy(false); }
    },
    [pending, toggleReadingList, doc.id, doc.title, showToast]
  );

  if (variant === 'compact') {
    return (
      <button
        onClick={handleClick}
        disabled={pending}
        aria-pressed={saved}
        title={saved ? 'Remove from Reading List' : 'Read Later'}
        aria-label={saved ? `Remove ${doc.title} from Reading List` : `Read ${doc.title} later`}
        className={`p-1.5 rounded-lg transition-colors disabled:opacity-50 ${
          saved
            ? 'text-amber-600 hover:bg-amber-50'
            : 'text-stone-500 hover:text-amber-600 hover:bg-stone-100'
        } ${className}`}
      >
        <ReadLaterIcon filled={saved} className="w-4 h-4" />
      </button>
    );
  }

  return (
    <button
      onClick={handleClick}
      disabled={pending}
        aria-pressed={saved}
      className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg border transition-all disabled:opacity-50 ${
        saved
          ? 'text-amber-700 bg-amber-50 border-amber-200 hover:bg-amber-100'
          : 'text-stone-700 bg-white border-stone-200 hover:border-amber-300 hover:bg-amber-50/50'
      } ${className}`}
    >
      <ReadLaterIcon filled={saved} className="w-4 h-4" />
      {saved ? 'In Reading List' : 'Read Later'}
    </button>
  );
}
