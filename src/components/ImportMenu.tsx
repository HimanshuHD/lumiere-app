import { useState, useRef, useEffect } from 'react';
import { Import, Upload, Globe, ChevronDown } from 'lucide-react';

interface ImportMenuProps {
  onUpload: () => void;
  onOnlineLibrary: () => void;
}

export function ImportMenu({ onUpload, onOnlineLibrary }: ImportMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-all ${
          open
            ? 'bg-stone-900 text-white'
            : 'text-stone-500 hover:text-stone-800 hover:bg-stone-100'
        }`}
      >
        <Import aria-hidden="true" className="w-4 h-4" />
        Import Books
        <ChevronDown aria-hidden="true" className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute top-full right-0 mt-1.5 w-56 bg-white rounded-xl shadow-2xl border border-stone-200 overflow-hidden z-50 animate-in fade-in slide-in-from-top-1 duration-150">
          <button
            onClick={() => {
              setOpen(false);
              onUpload();
            }}
            className="w-full flex items-start gap-3 px-4 py-3 hover:bg-stone-50 transition-colors text-left group"
          >
            <div className="w-9 h-9 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0 group-hover:bg-amber-200 transition-colors">
              <Upload aria-hidden="true" className="w-4 h-4 text-amber-700" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-stone-800">Upload a book</p>
              <p className="text-xs text-stone-500 mt-0.5">Add a PDF, EPUB, or TXT file</p>
            </div>
          </button>

          <div className="border-t border-stone-100" />

          <button
            onClick={() => {
              setOpen(false);
              onOnlineLibrary();
            }}
            className="w-full flex items-start gap-3 px-4 py-3 hover:bg-stone-50 transition-colors text-left group"
          >
            <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0 group-hover:bg-blue-200 transition-colors">
              <Globe aria-hidden="true" className="w-4 h-4 text-blue-700" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-stone-800">Online Library</p>
              <p className="text-xs text-stone-500 mt-0.5">Browse free public domain catalogs</p>
            </div>
          </button>
        </div>
      )}
    </div>
  );
}
