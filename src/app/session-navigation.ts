import { setActiveAccount } from './account-runtime';
import { appBase, navigate } from './navigation';
import { clearOAuthReturn } from '@/infrastructure/browser/oauth-return';

let account: string | undefined;
/** Auth invokes this before publishing its new identity. Reset URL before cache disposal notifies UI. */
export function applySessionAccount(next: string | undefined) {
  if (account && account !== next) {
    try { clearOAuthReturn(window.sessionStorage, appBase); } catch { /* No reusable intent. */ }
    navigate({kind:'view',view:'library'}, {replace:true});
  }
  account = next;
  setActiveAccount(next);
}
