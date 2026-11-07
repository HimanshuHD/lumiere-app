import { useSyncExternalStore } from 'react';
import { ArrowLeftRight, RotateCcw } from 'lucide-react';
import type { TransitionSettings } from '@/shared/transitions';

const defaults: TransitionSettings = { out: 'slide-left', in: 'slide-from-right', outEasing: 'smooth', inEasing: 'smooth', duration: 440 };
const easingOptions = [['smooth', 'Smooth'], ['linear', 'Linear'], ['ease-in', 'Ease in'], ['ease-out', 'Ease out'], ['ease-in-out', 'Ease in and out']];
const fields = [
  { key: 'out', label: 'Page exits', options: [['slide-left', 'Slide to the left'], ['slide-right', 'Slide to the right'], ['fade', 'Fade out'], ['none', 'No exit motion']] },
  { key: 'in', label: 'Page enters', options: [['slide-from-right', 'Slide from the right'], ['slide-from-left', 'Slide from the left'], ['fade', 'Fade in'], ['none', 'No entrance motion']] },
  { key: 'outEasing', label: 'Exit timing curve', options: easingOptions },
  { key: 'inEasing', label: 'Entrance timing curve', options: easingOptions },
] as const;
const subscribe = (listener: () => void) => window.lumiereTransitions?.subscribe(listener) ?? (() => {});
const snapshot = () => window.lumiereTransitions?.getSettings() ?? defaults;
const controlClass = 'w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-800';

export function TransitionSettingsPanel() {
  const settings = useSyncExternalStore(subscribe, snapshot);
  const durations = Array.from(new Set([200, 440, 700, 1000, settings.duration])).sort((a, b) => a - b);
  return (
    <section className="bg-white rounded-2xl border border-stone-200 p-6 mb-6" aria-labelledby="page-transition-heading">
      <h2 id="page-transition-heading" className="text-sm font-semibold text-stone-700 mb-2 flex items-center gap-2">
        <ArrowLeftRight className="w-4 h-4" aria-hidden="true" /> Page transitions
      </h2>
      <p className="text-sm text-stone-600 mb-5">Choose how pages move. Matching slide directions and timing curves keep their edges joined.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {fields.map(field => (
          <div key={field.key} className="grid gap-2 text-xs text-stone-700">
            <label htmlFor={`page-motion-${field.key}`}>{field.label}</label>
            <select id={`page-motion-${field.key}`} className={controlClass} value={settings[field.key]}
              onChange={event => window.lumiereTransitions?.update({ ...settings, [field.key]: event.target.value })}>
              {field.options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
        ))}
        <div className="grid gap-2 text-xs text-stone-700">
          <label htmlFor="page-motion-duration">Transition duration</label>
          <select id="page-motion-duration" className={controlClass} value={settings.duration}
            onChange={event => window.lumiereTransitions?.update({ ...settings, duration: Number(event.target.value) })}>
            {durations.map(duration => <option key={duration} value={duration}>{duration} ms</option>)}
          </select>
        </div>
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-stone-600">Applies to loading and page navigation. Reduced motion follows your device setting.</p>
        <button type="button" className="inline-flex items-center gap-2 text-xs text-amber-700 underline"
          onClick={() => window.lumiereTransitions?.reset()}>
          <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" /> Restore transition defaults
        </button>
      </div>
    </section>
  );
}
