import { useState, useEffect, useRef } from 'react';
import { User, Camera, Loader2, Save, Lock, Mail, CheckCircle2, Eye, EyeOff } from 'lucide-react';
import { profileRepository } from '@/infrastructure/supabase/profile-repository';
import { authIntegration } from '@/infrastructure/supabase/auth-integration';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/shared/ui';

export function Profile() {
  const { user, profile, refreshProfile } = useAuth();
  const { showToast } = useToast();
  const [fullName, setFullName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingName, setSavingName] = useState(false);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // Password change state
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  useEffect(() => {
    setFullName(profile.fullName || '');
    setAvatarUrl(profile.avatarUrl || null);
    setLoading(false);
  }, [profile.fullName, profile.avatarUrl]);

  const handleAvatarSelect = (file: File) => {
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  const handleSaveName = async () => {
    if (!user) return;
    setSavingName(true);
    try {
      await profileRepository.saveName(user.id, fullName);
      await refreshProfile();
      showToast('Profile name updated successfully.');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to update name.', 'error');
    } finally {
      setSavingName(false);
    }
  };

  const handleSaveAvatar = async () => {
    if (!user || !avatarFile) return;
    setUploadingAvatar(true);
    try {
      const publicUrl = await profileRepository.saveAvatar(user.id, avatarFile);
      setAvatarUrl(publicUrl);
      setAvatarFile(null);
      setAvatarPreview(null);
      await refreshProfile();
      showToast('Profile picture updated successfully.');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to upload picture.', 'error');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleChangePassword = async () => {
    if (!user) return;
    if (newPassword !== confirmPassword) {
      showToast('New passwords do not match.', 'error');
      return;
    }
    if (newPassword.length < 6) {
      showToast('Password must be at least 6 characters.', 'error');
      return;
    }
    setChangingPassword(true);
    try {
      await authIntegration.changePassword(newPassword);
      setNewPassword('');
      setConfirmPassword('');
      showToast('Password changed successfully.');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to change password.', 'error');
    } finally {
      setChangingPassword(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-amber-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
          <User className="w-5 h-5 text-amber-700" />
        </div>
        <div>
          <h1 className="text-2xl font-serif font-bold text-stone-800">Profile</h1>
          <p className="text-sm text-stone-500">Manage your account settings</p>
        </div>
      </div>

      {/* Avatar section */}
      <div className="bg-white rounded-2xl border border-stone-200 p-6 mb-6">
        <h2 className="text-sm font-semibold text-stone-700 mb-4 flex items-center gap-2">
          <Camera className="w-4 h-4 text-stone-400" />
          Profile Picture
        </h2>
        <div className="flex items-center gap-6">
          <div className="relative">
            <div className="w-24 h-24 rounded-full overflow-hidden bg-stone-100 border-2 border-stone-200 flex items-center justify-center">
              {avatarPreview || avatarUrl ? (
                <img src={avatarPreview || avatarUrl || ''} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                <User className="w-10 h-10 text-stone-300" />
              )}
            </div>
          </div>
          <div className="flex-1 space-y-3">
            <button
              onClick={() => avatarInputRef.current?.click()}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-stone-700 bg-stone-100 hover:bg-stone-200 border border-stone-200 rounded-lg transition-all"
            >
              <Camera className="w-4 h-4 text-stone-500" />
              Choose Image
            </button>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              onChange={(e) => e.target.files?.[0] && handleAvatarSelect(e.target.files[0])}
              className="hidden"
            />
            {avatarFile && (
              <button
                onClick={handleSaveAvatar}
                disabled={uploadingAvatar}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-amber-600 hover:bg-amber-500 rounded-lg transition-all disabled:opacity-50 shadow-lg shadow-amber-600/20"
              >
                {uploadingAvatar ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Uploading...</>
                ) : (
                  <><Save className="w-4 h-4" /> Save Picture</>
                )}
              </button>
            )}
            <p className="text-xs text-stone-400">JPG, PNG, or WebP. Recommended 256x256.</p>
          </div>
        </div>
      </div>

      {/* Name & email section */}
      <div className="bg-white rounded-2xl border border-stone-200 p-6 mb-6">
        <h2 className="text-sm font-semibold text-stone-700 mb-4 flex items-center gap-2">
          <User className="w-4 h-4 text-stone-400" />
          Personal Information
        </h2>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-stone-500 mb-1.5">Full Name</label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Enter your full name"
              className="w-full px-4 py-2.5 bg-white border border-stone-200 rounded-lg text-sm text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-600/30 focus:border-amber-600/40 transition-all"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-stone-500 mb-1.5">Email</label>
            <div className="flex items-center gap-2 px-4 py-2.5 bg-stone-50 border border-stone-200 rounded-lg">
              <Mail className="w-4 h-4 text-stone-400" />
              <span className="text-sm text-stone-600">{user?.email}</span>
              <CheckCircle2 className="w-4 h-4 text-green-500 ml-auto" />
            </div>
            <p className="text-xs text-stone-400 mt-1">Email cannot be changed</p>
          </div>
          <button
            onClick={handleSaveName}
            disabled={savingName}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-amber-600 hover:bg-amber-500 rounded-lg transition-all disabled:opacity-50 shadow-lg shadow-amber-600/20"
          >
            {savingName ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</>
            ) : (
              <><Save className="w-4 h-4" /> Save Changes</>
            )}
          </button>
        </div>
      </div>

      {/* Password change section */}
      <div className="bg-white rounded-2xl border border-stone-200 p-6">
        <h2 className="text-sm font-semibold text-stone-700 mb-4 flex items-center gap-2">
          <Lock className="w-4 h-4 text-stone-400" />
          Change Password
        </h2>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-stone-500 mb-1.5">New Password</label>
            <div className="relative">
              <input
                type={showNewPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter new password"
                className="w-full px-4 pr-11 py-2.5 bg-white border border-stone-200 rounded-lg text-sm text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-600/30 focus:border-amber-600/40 transition-all"
              />
              <button
                type="button"
                onClick={() => setShowNewPassword((shown) => !shown)}
                aria-label={showNewPassword ? 'Hide new password' : 'Show new password'}
                aria-pressed={showNewPassword}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 transition-colors"
              >
                {showNewPassword
                  ? <EyeOff className="w-4 h-4" aria-hidden="true" />
                  : <Eye className="w-4 h-4" aria-hidden="true" />}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-stone-500 mb-1.5">Confirm New Password</label>
            <div className="relative">
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
                className="w-full px-4 pr-11 py-2.5 bg-white border border-stone-200 rounded-lg text-sm text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-600/30 focus:border-amber-600/40 transition-all"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword((shown) => !shown)}
                aria-label={showConfirmPassword ? 'Hide confirmation password' : 'Show confirmation password'}
                aria-pressed={showConfirmPassword}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 transition-colors"
              >
                {showConfirmPassword
                  ? <EyeOff className="w-4 h-4" aria-hidden="true" />
                  : <Eye className="w-4 h-4" aria-hidden="true" />}
              </button>
            </div>
          </div>
          <button
            onClick={handleChangePassword}
            disabled={changingPassword || !newPassword || !confirmPassword}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-stone-800 hover:bg-stone-700 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {changingPassword ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Updating...</>
            ) : (
              <><Lock className="w-4 h-4" /> Update Password</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
