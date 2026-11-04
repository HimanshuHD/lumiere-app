import { supabase } from './client';
import { publicConfig } from '@/shared/config';
import { parseCatalogFeed } from '@/domain/catalog';
/** Authentication headers and transport stay inside the integration layer. */
export async function fetchCatalogFeed(url:string, challenge:()=>Promise<string>, signal?:AbortSignal) {
  const endpoint=new URL('/functions/v1/opds-fetch',publicConfig.supabaseUrl);endpoint.searchParams.set('url',url);
  const {data,error}=await supabase.auth.getSession();if(error)throw new Error('Could not verify the sign-in session.');
  const headers:Record<string,string>={apikey:publicConfig.supabaseAnonKey,'Content-Type':'application/json'};
  if(data.session)headers.Authorization=`Bearer ${data.session.access_token}`;else headers['X-Turnstile-Token']=await challenge();
  const response=await fetch(endpoint,{headers,signal});
  if(!response.ok){const body=await response.json().catch(()=>({}));throw new Error(body.error||body.message||`Failed to load catalog (${response.status})`);}
  return parseCatalogFeed(await response.json());
}
