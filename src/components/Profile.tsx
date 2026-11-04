import { useProfileController } from '@/features/profile';
import { useState } from 'react';
import { User, Camera, Loader2, Save, Lock, Mail, CheckCircle2, Eye, EyeOff } from 'lucide-react';

export function Profile() {
  const { user, fullName, setFullName, avatarUrl, loading, savingName, avatarFile, avatarPreview, uploadingAvatar, avatarInputRef, newPassword, setNewPassword, confirmPassword, setConfirmPassword, changingPassword, handleAvatarSelect, handleSaveName, handleSaveAvatar, handleChangePassword } = useProfileController();
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 aria-hidden="true" className="w-8 h-8 text-amber-700 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
          <User aria-hidden="true" className="w-5 h-5 text-amber-700" />
        </div>
        <div>
          <h1 className="text-2xl font-serif font-bold text-stone-800">Profile</h1>
          <p className="text-sm text-stone-600">Manage your account settings</p>
        </div>
      </div>

      {/* Avatar section */}
      <div className="bg-white rounded-2xl border border-stone-200 p-6 mb-6">
        <h2 className="text-sm font-semibold text-stone-700 mb-4 flex items-center gap-2">
          <Camera aria-hidden="true" className="w-4 h-4 text-stone-600" />
          Profile Picture
        </h2>
        <div className="flex items-center gap-6">
          <div className="relative">
            <div className="w-24 h-24 rounded-full overflow-hidden bg-stone-100 border-2 border-stone-200 flex items-center justify-center">
              {avatarPreview || avatarUrl ? (
                <img src={avatarPreview || avatarUrl || ''} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                <User aria-hidden="true" className="w-10 h-10 text-stone-300" />
              )}
            </div>
          </div>
          <div className="flex-1 space-y-3">
            <button
              onClick={() => avatarInputRef.current?.click()}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-stone-700 bg-stone-100 hover:bg-stone-200 border border-stone-200 rounded-lg transition-all"
            >
              <Camera aria-hidden="true" className="w-4 h-4 text-stone-600" />
              Choose Image
            </button>
            <input
              aria-label="Choose avatar image" ref={avatarInputRef}
              type="file"
              accept="image/*"
              onChange={(e) => e.target.files?.[0] && handleAvatarSelect(e.target.files[0])}
              className="hidden"
            />
            {avatarFile && (
              <button
                onClick={handleSaveAvatar}
                disabled={uploadingAvatar}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-amber-700 hover:bg-amber-800 rounded-lg transition-all disabled:opacity-50 shadow-lg shadow-amber-600/20"
              >
                {uploadingAvatar ? (
                  <><Loader2 aria-hidden="true" className="w-4 h-4 animate-spin" /> Uploading...</>
                ) : (
                  <><Save aria-hidden="true" className="w-4 h-4" /> Save Picture</>
                )}
              </button>
            )}
            <p className="text-xs text-stone-600">JPG, PNG, or WebP. Recommended 256x256.</p>
          </div>
        </div>
      </div>

      {/* Name & email section */}
      <div className="bg-white rounded-2xl border border-stone-200 p-6 mb-6">
        <h2 className="text-sm font-semibold text-stone-700 mb-4 flex items-center gap-2">
          <User aria-hidden="true" className="w-4 h-4 text-stone-600" />
          Personal Information
        </h2>
        <div className="space-y-4">
          <div>
            <label htmlFor="profile-name" className="block text-xs font-medium text-stone-600 mb-1.5">Full Name</label>
            <input
              type="text"
              id="profile-name" autoComplete="name" value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Enter your full name"
              className="w-full px-4 py-2.5 bg-white border border-stone-200 rounded-lg text-sm text-stone-800 placeholder-stone-600 focus:outline-none focus:ring-2 focus:ring-amber-600/30 focus:border-amber-600/40 transition-all"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-stone-600 mb-1.5">Email</label>
            <div className="flex items-center gap-2 px-4 py-2.5 bg-stone-50 border border-stone-200 rounded-lg">
              <Mail aria-hidden="true" className="w-4 h-4 text-stone-600" />
              <span className="text-sm text-stone-600">{user?.email}</span>
              <CheckCircle2 aria-hidden="true" className="w-4 h-4 text-green-500 ml-auto" />
            </div>
            <p className="text-xs text-stone-600 mt-1">Email cannot be changed</p>
          </div>
          <button
            onClick={handleSaveName}
            disabled={savingName}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-amber-700 hover:bg-amber-800 rounded-lg transition-all disabled:opacity-50 shadow-lg shadow-amber-600/20"
          >
            {savingName ? (
              <><Loader2 aria-hidden="true" className="w-4 h-4 animate-spin" /> Saving...</>
            ) : (
              <><Save aria-hidden="true" className="w-4 h-4" /> Save Changes</>
            )}
          </button>
        </div>
      </div>

      {/* Password change section */}
      <div className="bg-white rounded-2xl border border-stone-200 p-6">
        <h2 className="text-sm font-semibold text-stone-700 mb-4 flex items-center gap-2">
          <Lock aria-hidden="true" className="w-4 h-4 text-stone-600" />
          Change Password
        </h2>
        <div className="space-y-4">
          <div>
            <label htmlFor="profile-password" className="block text-xs font-medium text-stone-600 mb-1.5">New Password</label>
            <div className="relative">
              <input
                type={showNewPassword ? 'text' : 'password'}
                id="profile-password" autoComplete="new-password" value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter new password"
                className="w-full px-4 pr-12 py-2.5 bg-white border border-stone-200 rounded-lg text-sm text-stone-800 placeholder-stone-600 focus:outline-none focus:ring-2 focus:ring-amber-600/30 focus:border-amber-600/40 transition-all"
              />
              <button
                type="button"
                onClick={() => setShowNewPassword((shown) => !shown)}
                aria-label={showNewPassword ? 'Hide new password' : 'Show new password'}
                aria-pressed={showNewPassword}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded text-stone-600 hover:text-stone-600 transition-colors"
              >
                {showNewPassword
                  ? <EyeOff className="w-4 h-4" aria-hidden="true" />
                  : <Eye className="w-4 h-4" aria-hidden="true" />}
              </button>
            </div>
          </div>
          <div>
            <label htmlFor="profile-confirm-password" className="block text-xs font-medium text-stone-600 mb-1.5">Confirm New Password</label>
            <div className="relative">
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                id="profile-confirm-password" autoComplete="new-password" aria-invalid={!!confirmPassword && newPassword !== confirmPassword} aria-describedby={confirmPassword && newPassword !== confirmPassword ? "password-mismatch" : undefined} value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
                className="w-full px-4 pr-12 py-2.5 bg-white border border-stone-200 rounded-lg text-sm text-stone-800 placeholder-stone-600 focus:outline-none focus:ring-2 focus:ring-amber-600/30 focus:border-amber-600/40 transition-all"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword((shown) => !shown)}
                aria-label={showConfirmPassword ? 'Hide confirmation password' : 'Show confirmation password'}
                aria-pressed={showConfirmPassword}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded text-stone-600 hover:text-stone-600 transition-colors"
              >
                {showConfirmPassword
                  ? <EyeOff className="w-4 h-4" aria-hidden="true" />
                  : <Eye className="w-4 h-4" aria-hidden="true" />}
              </button>
            </div>
          </div>
          {confirmPassword && newPassword !== confirmPassword && <p id="password-mismatch" role="status" className="text-sm text-red-700">Passwords do not match.</p>}
          <button
            onClick={handleChangePassword}
            disabled={changingPassword || !newPassword || !confirmPassword}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-stone-800 hover:bg-stone-700 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {changingPassword ? (
              <><Loader2 aria-hidden="true" className="w-4 h-4 animate-spin" /> Updating...</>
            ) : (
              <><Lock aria-hidden="true" className="w-4 h-4" /> Update Password</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
