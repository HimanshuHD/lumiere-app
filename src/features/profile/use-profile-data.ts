import { useState, useEffect, useCallback, type MutableRefObject } from 'react';
import type { AuthUser } from '@/domain/auth';
import type { ProfilePort } from '@/domain/integrations';
export interface ProfileData { fullName: string; avatarUrl: string | null }
export function useProfileData(user: AuthUser | null, accountRef: MutableRefObject<string | undefined>, profileRepository: ProfilePort) {
  const [profile, setProfile] = useState<ProfileData>({ fullName: '', avatarUrl: null });

  const refreshProfile = useCallback(async () => {
    if (!user) return;
    const data = await profileRepository.get(user.id).catch(() => null);
    if (accountRef.current !== user.id) return;
    const googleName = [user.user_metadata.full_name, user.user_metadata.name]
      .find((value): value is string => typeof value === 'string' && value.trim().length > 0)
      ?.trim() ?? '';
    setProfile({
      fullName: data?.full_name?.trim() || googleName,
      avatarUrl: data?.avatar_url || null,
    });
  }, [user, profileRepository, accountRef]);

  useEffect(() => {
    if (user) {
      void refreshProfile().catch(() => {});
    } else {
      setProfile({ fullName: '', avatarUrl: null });
    }
  }, [user, refreshProfile]);

  return { profile, refreshProfile, setProfile };
}
