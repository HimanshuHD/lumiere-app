import { LockKeyhole } from 'lucide-react';

export function DocumentAccessNotice({ overlay = false }: { overlay?: boolean }) {
  return (
    <div className={overlay
      ? 'absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-stone-950/65 px-3 text-center text-white'
      : 'flex items-start gap-2 rounded-lg bg-stone-100 px-3 py-2 text-sm text-stone-600'}
    >
      <LockKeyhole aria-hidden="true" className={overlay ? 'h-5 w-5 flex-shrink-0' : 'mt-0.5 h-4 w-4 flex-shrink-0'} />
      <span>The owner changed visibility. This document is no longer available to you.</span>
    </div>
  );
}
