// Inlined by Vite into the initial HTML. Startup and React share one controller.
(() => {
  const key = 'lumiere:page-transitions';
  const defaults = { out: 'slide-left', in: 'slide-from-right', outEasing: 'smooth', inEasing: 'smooth', duration: 440 };
  const curves = { smooth: 'cubic-bezier(.65,0,.35,1)', linear: 'linear', 'ease-in': 'ease-in', 'ease-out': 'ease-out', 'ease-in-out': 'ease-in-out' };
  const choices = { out: ['slide-left', 'slide-right', 'fade', 'none'], in: ['slide-from-right', 'slide-from-left', 'fade', 'none'] };
  function validate(value) {
    const input = value && typeof value === 'object' ? value : {};
    return {
      out: choices.out.includes(input.out) ? input.out : defaults.out,
      in: choices.in.includes(input.in) ? input.in : defaults.in,
      outEasing: Object.hasOwn(curves, input.outEasing) ? input.outEasing : defaults.outEasing,
      inEasing: Object.hasOwn(curves, input.inEasing) ? input.inEasing : defaults.inEasing,
      duration: Number.isInteger(input.duration) && input.duration >= 150 && input.duration <= 1500 ? input.duration : defaults.duration,
    };
  }
  let settings = { ...defaults };
  try { settings = validate(JSON.parse(localStorage.getItem(key))); } catch { /* Use defaults. */ }
  let pending = null;
  let stopAnimation = null;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');

  function frames(effect) {
    switch (effect) {
      case 'slide-left': return [{ transform: 'translateX(0)' }, { transform: 'translateX(-100%)' }];
      case 'slide-right': return [{ transform: 'translateX(0)' }, { transform: 'translateX(100%)' }];
      case 'slide-from-right': return [{ transform: 'translateX(100%)' }, { transform: 'translateX(0)' }];
      case 'slide-from-left': return [{ transform: 'translateX(-100%)' }, { transform: 'translateX(0)' }];
      case 'fade': return [{ opacity: 1 }, { opacity: 0 }];
      default: return [{ opacity: 1 }, { opacity: 1 }];
    }
  }

  function play(outgoing, incoming) {
    stopAnimation?.();
    if (reduced.matches || !incoming.animate || (settings.out === 'none' && settings.in === 'none')) return Promise.resolve();
    const config = { ...settings };
    const oldStyle = incoming.style.cssText;
    const oldOverflow = document.body.style.overflow;
    const wasInert = incoming.inert;
    const animations = [];
    incoming.inert = true;
    document.body.style.overflow = 'hidden';
    Object.assign(incoming.style, { position: 'fixed', inset: '0', width: '100%', height: '100%', overflow: 'auto', zIndex: '998', background: 'var(--app-bg)', willChange: 'transform' });
    document.documentElement.dataset.pageMotion = 'running';
    return new Promise(resolve => {
      let complete = false;
      let limit;
      const finish = () => {
        if (complete) return;
        complete = true;
        clearTimeout(limit);
        animations.forEach(animation => animation.cancel());
        incoming.style.cssText = oldStyle;
        incoming.inert = wasInert;
        document.body.style.overflow = oldOverflow;
        delete document.documentElement.dataset.pageMotion;
        if (stopAnimation === finish) stopAnimation = null;
        resolve();
      };
      stopAnimation = finish;
      try {
        const incomingFrames = config.in === 'fade' ? [{ opacity: 0 }, { opacity: 1 }] : frames(config.in);
        animations.push(outgoing.animate(frames(config.out), { duration: config.duration, easing: curves[config.outEasing], fill: 'both' }));
        animations.push(incoming.animate(incomingFrames, { duration: config.duration, easing: curves[config.inEasing], fill: 'both' }));
        // Identical start times and default curves keep both viewport edges joined.
        const start = document.timeline.currentTime;
        animations.forEach(animation => { animation.startTime = start; });
        Promise.all(animations.map(animation => animation.finished)).then(finish, finish);
        limit = setTimeout(finish, config.duration + 150);
      } catch { finish(); }
    });
  }

  function cancel() {
    const previous = pending;
    pending = null;
    stopAnimation?.();
    if (!previous) return;
    clearTimeout(previous.limit);
    previous.snapshot.remove();
    previous.announcement.remove();
    previous.root.inert = previous.wasInert;
  }

  function snapshotOf(root) {
    const copy = root.cloneNode(true);
    const originals = [root, ...root.querySelectorAll('*')];
    [copy, ...copy.querySelectorAll('*')].forEach((element, index) => {
      element.removeAttribute('id');
      element.removeAttribute('autofocus');
      if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
        const hideValue = element.type === 'password' || element.type === 'file';
        element.value = hideValue ? '' : originals[index].value || element.getAttribute('placeholder') || '';
        element.removeAttribute('placeholder');
        element.removeAttribute('name');
        if (hideValue) element.removeAttribute('value');
      }
      if (element instanceof HTMLSelectElement) element.selectedIndex = originals[index].selectedIndex;
      if (element instanceof HTMLImageElement && element.src.startsWith('blob:') && originals[index].naturalWidth) {
        try {
          const bitmap = document.createElement('canvas');
          bitmap.width = originals[index].naturalWidth;
          bitmap.height = originals[index].naturalHeight;
          bitmap.getContext('2d').drawImage(originals[index], 0, 0);
          element.src = bitmap.toDataURL();
        } catch { /* Keep the existing resource if a bitmap cannot be made. */ }
      }
      if (element instanceof HTMLCanvasElement) {
        try { element.getContext('2d')?.drawImage(originals[index], 0, 0); } catch { /* A restricted canvas can remain blank. */ }
      }
    });
    copy.style.position = 'absolute';
    copy.style.top = `${-window.scrollY}px`;
    copy.style.width = '100%';
    return copy;
  }

  function begin() {
    cancel();
    const root = document.getElementById('root');
    if (!root || document.getElementById('startup-screen') || reduced.matches) return;
    const snapshot = document.createElement('div');
    snapshot.dataset.pageOutgoing = '';
    snapshot.inert = true;
    snapshot.setAttribute('aria-hidden', 'true');
    Object.assign(snapshot.style, { position: 'fixed', inset: '0', overflow: 'hidden', zIndex: '999', background: 'var(--app-bg)', pointerEvents: 'none' });
    snapshot.append(snapshotOf(root));
    document.body.append(snapshot);
    const originals = [root, ...root.querySelectorAll('*')];
    const copies = [snapshot.firstElementChild, ...snapshot.firstElementChild.querySelectorAll('*')];
    originals.forEach((element, index) => {
      copies[index].scrollTop = element.scrollTop;
      copies[index].scrollLeft = element.scrollLeft;
    });
    const announcement = document.createElement('p');
    announcement.className = 'sr-only';
    announcement.setAttribute('role', 'status');
    announcement.textContent = 'Opening page…';
    document.body.append(announcement);
    const wasInert = root.inert;
    root.inert = true;
    pending = { snapshot, root, wasInert, announcement, limit: setTimeout(ready, 2000) };
  }

  function ready() {
    const current = pending;
    if (!current || current.playing) return;
    current.playing = true;
    clearTimeout(current.limit);
    window.scrollTo(0, 0);
    play(current.snapshot, current.root).then(() => {
      if (pending !== current) return;
      pending = null;
      current.snapshot.remove();
      current.announcement.remove();
      current.root.inert = current.wasInert;
      const target = current.root.querySelector('main h1, main, h1');
      if (target instanceof HTMLElement) {
        target.tabIndex = -1;
        target.focus({ preventScroll: true });
      }
    });
  }

  const listeners = new Set();
  function update(value) {
    settings = validate(value);
    try { localStorage.setItem(key, JSON.stringify(settings)); } catch { /* Keep the in-memory settings. */ }
    listeners.forEach(listener => listener());
  }
  window.lumiereTransitions = {
    play, begin, ready, cancel,
    getSettings: () => settings,
    update,
    reset: () => update(defaults),
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); },
  };
  window.addEventListener('popstate', begin);
  window.addEventListener('pagehide', cancel);
  window.addEventListener('storage', event => {
    if (event.key !== key && event.key !== null) return;
    try { settings = validate(event.key === null ? null : JSON.parse(event.newValue)); } catch { settings = { ...defaults }; }
    listeners.forEach(listener => listener());
  });
  reduced.addEventListener('change', () => { if (reduced.matches) cancel(); });
})();
