import { useState, useCallback, useEffect, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, AlertCircle, X } from 'lucide-react';

import { ToastContext, type ToastType } from './toast-context';

interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [host, setHost] = useState<Element | null>(null);
  useEffect(() => {
    const update = () => { const dialogs = document.querySelectorAll('dialog[open]'); setHost(dialogs[dialogs.length - 1] ?? document.body); };
    update(); window.addEventListener('lumiere:dialog-change', update);
    return () => window.removeEventListener('lumiere:dialog-change', update);
  }, []);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, type: ToastType = 'success') => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const dismiss = (id: number) => setToasts((prev) => prev.filter((t) => t.id !== id));

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {host && createPortal(<div onClick={event => event.stopPropagation()} aria-live="polite" aria-relevant="additions text" className="fixed bottom-6 right-6 z-[100] flex flex-col gap-2 pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl border transition-all animate-[slideIn_0.3s_ease-out] ${
              toast.type === 'success'
                ? 'bg-green-50 border-green-200'
                : 'bg-red-50 border-red-200'
            }`}
          >
            {toast.type === 'success' ? (
              <CheckCircle2 aria-hidden="true" className="w-5 h-5 text-green-700 flex-shrink-0" />
            ) : (
              <AlertCircle aria-hidden="true" className="w-5 h-5 text-red-700 flex-shrink-0" />
            )}
            <p className={`text-sm font-medium ${toast.type === 'success' ? 'text-green-700' : 'text-red-700'}`}>
              {toast.message}
            </p>
            <button
              aria-label="Dismiss notification"
              onClick={() => dismiss(toast.id)}
              className={`ml-2 ${toast.type === 'success' ? 'text-green-700 hover:text-green-600' : 'text-red-700 hover:text-red-600'} transition-colors`}
            >
              <X aria-hidden="true" className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>, host)}
    </ToastContext.Provider>
  );
}
