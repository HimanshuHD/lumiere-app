import { Component, Suspense, type ReactNode } from 'react';
import { PageArrival } from './transitions/PageArrival';

class ContentErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;

    return (
      <section className="px-4 py-12 text-center" role="alert">
        <PageArrival />
        <p>Could not load this screen.</p>
        <button type="button" className="mt-3 underline" onClick={() => window.location.reload()}>
          Reload page
        </button>
      </section>
    );
  }
}

export function DeferredContent({ children }: { children: ReactNode }) {
  return (
    <ContentErrorBoundary>
      <Suspense fallback={<p className="px-4 py-12 text-center" role="status">Loading screen…</p>}>
        {children}
      </Suspense>
    </ContentErrorBoundary>
  );
}
