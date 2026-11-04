import { useEffect, useId, useRef, useState, type KeyboardEvent, type FocusEvent } from 'react';

/** A disclosure with native buttons uses normal Tab order, not incomplete ARIA menu semantics. */
export function useDisclosure() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!rootRef.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); setOpen(false); triggerRef.current?.focus(); }
  };
  const onBlur = (event: FocusEvent) => { if (event.relatedTarget && !rootRef.current?.contains(event.relatedTarget as Node)) setOpen(false); };
  return {open, setOpen, rootRef, triggerRef, id, onKeyDown, onBlur};
}
