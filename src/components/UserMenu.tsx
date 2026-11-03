import { useState, useRef, useEffect } from 'react';
import { User, FileEdit, LogOut, ChevronDown, Shield } from 'lucide-react';
import { useAuth } from '@/features/auth';
import { isCatalogAdmin } from '@/lib/catalogAdminAccess';

interface UserMenuProps {
  onProfile: () => void;
  onMyUploads: () => void;
  onAdminCatalog: () => void;
  onSignOut: () => void;
}

export function UserMenu({ onProfile, onMyUploads, onAdminCatalog, onSignOut }: UserMenuProps) {
  const { user, profile } = useAuth();
  const catalogAdmin = isCatalogAdmin(user);
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const displayName = profile.fullName || user?.email?.split('@')[0] || 'User';

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 p-1 pr-2 rounded-full hover:bg-stone-100 transition-colors"
      >
        <div className="w-8 h-8 rounded-full overflow-hidden bg-stone-200 flex items-center justify-center flex-shrink-0">
          {profile.avatarUrl ? (
            <img src={profile.avatarUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <User className="w-4 h-4 text-stone-500" />
          )}
        </div>
        <span className="hidden sm:block text-sm font-medium text-stone-700 max-w-[120px] truncate">{displayName}</span>
        <ChevronDown className={`w-3.5 h-3.5 text-stone-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-52 bg-white rounded-xl shadow-2xl border border-stone-200 py-1.5 z-50 animate-[slideIn_0.15s_ease-out]">
          <div className="px-4 py-2.5 border-b border-stone-100">
            <p className="text-xs text-stone-400">Signed in as</p>
            <p className="text-sm font-medium text-stone-700 truncate">{user?.email}</p>
          </div>
          <button
            onClick={() => { onProfile(); setOpen(false); }}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-stone-700 hover:bg-stone-50 transition-colors"
          >
            <User className="w-4 h-4 text-stone-400" />
            Profile
          </button>
          <button
            onClick={() => { onMyUploads(); setOpen(false); }}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-stone-700 hover:bg-stone-50 transition-colors"
          >
            <FileEdit className="w-4 h-4 text-stone-400" />
            My Uploads
          </button>
          {catalogAdmin && (
            <button
              onClick={() => { onAdminCatalog(); setOpen(false); }}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-stone-700 hover:bg-stone-50 transition-colors"
            >
              <Shield className="w-4 h-4 text-stone-400" />
              Catalog Admin
            </button>
          )}
          <div className="border-t border-stone-100 my-1" />
          <button
            onClick={() => { onSignOut(); setOpen(false); }}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
          >
            <LogOut className="w-4 h-4 text-red-400" />
            Log Out
          </button>
        </div>
      )}
    </div>
  );
}
