export interface TransitionSettings {
  out: 'slide-left' | 'slide-right' | 'fade' | 'none';
  in: 'slide-from-right' | 'slide-from-left' | 'fade' | 'none';
  outEasing: 'smooth' | 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';
  inEasing: TransitionSettings['outEasing'];
  duration: number;
}

declare global {
  interface Window {
    lumiereTransitions?: {
      begin(): void;
      ready(): void;
      cancel(): void;
      getSettings(): TransitionSettings;
      update(value: TransitionSettings): void;
      reset(): void;
      subscribe(listener: () => void): () => void;
    };
  }
}

export function pageReady() {
  document.getElementById('startup-screen')?.dispatchEvent(new Event('lumiere:startup-ready'));
  window.lumiereTransitions?.ready();
}

export function beginPageTransition() { window.lumiereTransitions?.begin(); }
export function cancelPageTransition() { window.lumiereTransitions?.cancel(); }
