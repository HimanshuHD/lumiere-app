import { createContext } from 'react';

export type ToastType = 'success' | 'error';

interface ToastContextValue {
  showToast: (message: string, type?: ToastType) => void;
}

export const ToastContext = createContext<ToastContextValue | null>(null);
