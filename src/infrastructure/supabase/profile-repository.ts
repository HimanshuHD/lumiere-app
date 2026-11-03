import { toServiceError } from '@/domain/errors';
import { supabase } from './client';
export const profileRepository = {
  async get(userId:string) {
    const {data,error}=await supabase.from('profiles').select('full_name,avatar_url').eq('id',userId).maybeSingle();if(error)throw toServiceError(error);return data;
  },
  async saveName(userId:string,name:string) {
    const {error}=await supabase.from('profiles').upsert({id:userId,full_name:name.trim()},{onConflict:'id'});if(error)throw toServiceError(error);
  },
  async saveAvatar(userId:string,file:File) {
    const ext=file.name.split('.').pop()?.toLowerCase()||'jpg';const path=`${userId}/avatar.${ext}`;
    const {error:uploadError}=await supabase.storage.from('avatars').upload(path,file,{upsert:true});if(uploadError)throw toServiceError(uploadError);
    const {data}=supabase.storage.from('avatars').getPublicUrl(path);
    const {error}=await supabase.from('profiles').upsert({id:userId,avatar_url:data.publicUrl},{onConflict:'id'});if(error)throw toServiceError(error);
    return data.publicUrl;
  },
};
