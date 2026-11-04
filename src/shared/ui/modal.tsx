import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

let locks = 0;
let previousOverflow = '';
/** Native modal dialogs make background content inert and own the keyboard focus boundary. */
export function Modal({label, onClose, className = '', children}: {
  label: string; onClose: () => void; className?: string; children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const close = useRef(onClose); close.current = onClose;
  useLayoutEffect(() => {
    const dialog = ref.current!;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (locks++ === 0) { previousOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden'; }
    dialog.showModal();
    const initial = dialog.querySelector<HTMLElement>('[data-dialog-initial-focus], h1, h2, h3') ?? dialog;
    if (!initial.hasAttribute('tabindex')) initial.tabIndex = -1;
    initial.focus({preventScroll:true});
    return () => {
      dialog.close();
      if (--locks === 0) document.body.style.overflow = previousOverflow;
      const dialogs = Array.from(document.querySelectorAll<HTMLDialogElement>('dialog[open]')).filter(d => d !== dialog);
      const remaining = dialogs[dialogs.length - 1];
      const target = opener?.isConnected && (!remaining || remaining.contains(opener)) ? opener : remaining ?? document.querySelector<HTMLElement>('main');
      if (target) { if (!target.hasAttribute('tabindex') && target.tagName === 'MAIN') target.tabIndex = -1; target.focus({preventScroll:true}); }
    };
  }, []);
  return createPortal(<dialog ref={ref} tabIndex={-1} aria-label={label} aria-modal="true"
    className={`lumiere-modal ${className}`}
    onCancel={event => { event.preventDefault(); close.current(); }}
    onClick={() => close.current()}>{children}</dialog>, document.body);
}
