import { requireValue } from '@/domain/errors';
import { createProfileCommands } from './commands';
import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/features/auth';
import { useToast } from '@/shared/ui';
import { useIntegrations } from '@/shared/integrations';

export function useProfileController() {
  const { profile: profileRepository, auth: authIntegration } = useIntegrations();
  const commands = createProfileCommands(profileRepository, authIntegration);
  const { user, profile, refreshProfile } = useAuth();
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const { showToast } = useToast();
  const [fullName, setFullName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingName, setSavingName] = useState(false);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const avatarSelection = useRef(0);
  const avatarUploadInFlight = useRef(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // Password change state
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  useEffect(() => {
    setFullName(profile.fullName || '');
    setAvatarUrl(profile.avatarUrl || null);
    setLoading(false);
  }, [profile.fullName, profile.avatarUrl]);

  useEffect(() => () => { if (avatarPreview) URL.revokeObjectURL(avatarPreview); }, [avatarPreview]);

  const handleAvatarSelect = (file: File) => {
    avatarSelection.current++;
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  const handleSaveName = async () => {
    if (!user) return;
    setSavingName(true);
    try {
      requireValue(await commands.saveName(user.id, fullName));
      await refreshProfile();
      if (!active.current) return;
      showToast('Profile name updated successfully.');
    } catch (err) {
      if (active.current) showToast(err instanceof Error ? err.message : 'Failed to update name.', 'error');
    } finally {
      if (active.current) setSavingName(false);
    }
  };

  const handleSaveAvatar = async () => {
    if (!user || !avatarFile || avatarUploadInFlight.current) return;
    const selection = avatarSelection.current;
    avatarUploadInFlight.current = true;
    setUploadingAvatar(true);
    try {
      const publicUrl = requireValue(await commands.saveAvatar(user.id, avatarFile));
      if (!active.current) return;
      setAvatarUrl(publicUrl);
      if (avatarSelection.current === selection) {
        setAvatarFile(null);
        setAvatarPreview(null);
      }
      await refreshProfile();
      if (!active.current) return;
      showToast('Profile picture updated successfully.');
    } catch (err) {
      if (active.current) showToast(err instanceof Error ? err.message : 'Failed to upload picture.', 'error');
    } finally {
      avatarUploadInFlight.current = false;
      if (active.current) setUploadingAvatar(false);
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
      requireValue(await commands.changePassword(newPassword));
      if (!active.current) return;
      setNewPassword('');
      setConfirmPassword('');
      showToast('Password changed successfully.');
    } catch (err) {
      if (active.current) showToast(err instanceof Error ? err.message : 'Failed to change password.', 'error');
    } finally {
      if (active.current) setChangingPassword(false);
    }
  };

  return { user, fullName, setFullName, avatarUrl, loading, savingName, avatarFile, avatarPreview, uploadingAvatar, avatarInputRef, newPassword, setNewPassword, confirmPassword, setConfirmPassword, changingPassword, handleAvatarSelect, handleSaveName, handleSaveAvatar, handleChangePassword };
}
