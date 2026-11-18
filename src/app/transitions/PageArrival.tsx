import { useLayoutEffect } from 'react';
import { pageReady } from '@/shared/transitions';

export function PageArrival({ ready = true }: { ready?: boolean }) {
  useLayoutEffect(() => { if (ready) pageReady(); }, [ready]);
  return null;
}
