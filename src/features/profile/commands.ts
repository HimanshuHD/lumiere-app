import { attempt } from '../../domain/errors.ts';
import type { ProfilePort, AuthPort } from '../../domain/integrations.ts';
export function createProfileCommands(profile: ProfilePort, auth: AuthPort) {
  return {
    saveName: (id: string, name: string) => attempt(() => profile.saveName(id, name)),
    saveAvatar: (id: string, file: File) => attempt(() => profile.saveAvatar(id, file)),
    changePassword: (password: string) => auth.changePassword(password),
  };
}
