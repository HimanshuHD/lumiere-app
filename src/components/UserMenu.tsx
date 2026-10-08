import { useState, useRef, useEffect, useCallback } from 'react';
import { User, FileEdit, LogOut, ChevronDown } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';

interface UserMenuProps {
  onProfile: () => void;
  onMyUploads: () => void;
  onSignOut: () => void;
}

export function UserMenu({ onProfile, onMyUploads, onSignOut }: UserMenuProps) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [fullName, setFullName] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);

  const fetchProfile = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('profiles')
      .select('full_name, avatar_url')
      .eq('id', user.id)
      .maybeSingle();
    if (data) {
      setFullName(data.full_name || '');
      setAvatarUrl(data.avatar_url || null);
    }
  }, [user]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const displayName = fullName || user?.email?.split('@')[0] || 'User';

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 p-1 pr-2 rounded-full hover:bg-stone-100 transition-colors"
      >
        <div className="w-8 h-8 rounded-full overflow-hidden bg-stone-200 flex items-center justify-center flex-shrink-0">
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
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
